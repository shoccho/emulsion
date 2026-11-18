// Canon EOS PTP session: open, remote + event mode, event pump, property reads/writes, cleanup.

import { parseDeviceInfo, type DeviceInfo } from '../ptp/deviceinfo';
import { PtpError, ResponseCode, hex, type TransactResult, type Transport } from '../ptp/transport';
import { parseEventBatch, type CanonEvent } from './events';
import { NEVER_REQUEST_PROPS, Op, opName, propName } from './ops';
import { sha256Short } from './probe';

export interface CameraInfo {
  model: string;
  firmware: string;
  serialHash: string;
  operations: ReadonlySet<number>;
}

export interface SessionOptions {
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
}

export const SUPPORTED_MODELS: ReadonlySet<string> = new Set(['Canon EOS R100']);

export class CanonSession {
  info: CameraInfo | null = null;
  deviceInfo: DeviceInfo | null = null;
  /** Latest value of every property seen in this session's events. */
  readonly props = new Map<number, Uint8Array>();
  /** Allowed values per property, from 0xC18A events (int32 list). */
  readonly allowed = new Map<number, number[]>();
  private open = false;
  private remoteOn = false;
  private eventsOn = false;
  private readonly log: (l: string) => void;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    readonly t: Transport,
    private readonly opts: SessionOptions = {},
  ) {
    this.log = opts.log ?? (() => {});
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async call(code: number, params: number[] = [], extra: { dataOut?: Uint8Array; expectDataIn?: boolean } = {}): Promise<TransactResult> {
    const r = await this.t.transact({ code, params, ...extra });
    this.log(`${opName(code)}(${params.map((p) => '0x' + hex(p, 1)).join(',')})${extra.dataOut ? ` +${extra.dataOut.length}B` : ''} -> 0x${hex(r.responseCode)}`);
    return r;
  }

  async callOk(code: number, params: number[] = [], extra: { dataOut?: Uint8Array; expectDataIn?: boolean } = {}): Promise<TransactResult> {
    const r = await this.call(code, params, extra);
    if (r.responseCode !== ResponseCode.OK) throw new PtpError(code, r.responseCode);
    return r;
  }

  supports(code: number): boolean {
    return this.info?.operations.has(code) ?? false;
  }

  requireOps(codes: number[]): void {
    const missing = codes.filter((c) => !this.supports(c));
    if (missing.length) throw new Error(`camera does not advertise: ${missing.map(opName).join(', ')}`);
  }

  async connect(): Promise<CameraInfo> {
    const di = await this.callOk(Op.GetDeviceInfo, [], { expectDataIn: true });
    if (!di.dataIn) throw new Error('GetDeviceInfo returned no data');
    const parsed = parseDeviceInfo(di.dataIn);
    this.deviceInfo = parsed;
    this.info = {
      model: parsed.model,
      firmware: parsed.deviceVersion,
      serialHash: await sha256Short(parsed.serialNumber),
      operations: new Set(parsed.operationsSupported),
    };
    this.requireOps([Op.OpenSession, Op.CloseSession, Op.SetRemoteMode, Op.SetEventMode, Op.GetEvent]);

    const r = await this.call(Op.OpenSession, [1]);
    if (r.responseCode !== ResponseCode.OK && r.responseCode !== ResponseCode.SessionAlreadyOpen) throw new PtpError(Op.OpenSession, r.responseCode);
    this.open = true;
    try {
      await this.callOk(Op.SetRemoteMode, [1]);
      this.remoteOn = true;
      await this.callOk(Op.SetEventMode, [1]);
      this.eventsOn = true;
      await this.drain();
    } catch (e) {
      await this.disconnect();
      throw e;
    }
    return this.info;
  }

  /** One GetEvent call; records property values. */
  async pollOnce(): Promise<CanonEvent[]> {
    const r = await this.call(Op.GetEvent, [], { expectDataIn: true });
    if (r.responseCode !== ResponseCode.OK) return [];
    const batch = parseEventBatch(r.dataIn ?? new Uint8Array(0));
    if (batch.error) this.log(`event batch warning: ${batch.error}`);
    for (const ev of batch.events) {
      if (ev.kind === 'prop') this.props.set(ev.prop, ev.value);
      if (ev.kind === 'avail') this.allowed.set(ev.prop, decodeAllowed(ev.body));
    }
    return batch.events;
  }

  /** GetEvent until a batch is empty. The camera rejects writes while its queue is undrained. */
  async drain(max = 20): Promise<CanonEvent[]> {
    const all: CanonEvent[] = [];
    for (let i = 0; i < max; i++) {
      const evs = await this.pollOnce();
      if (evs.length === 0) return all;
      all.push(...evs);
    }
    this.log(`drain stopped after ${max} non-empty batches`);
    return all;
  }

  /** Ask the camera to emit a property, and return the fresh value from the following events. */
  async requestProp(prop: number, polls = 6): Promise<Uint8Array> {
    if (NEVER_REQUEST_PROPS.has(prop)) throw new Error(`refusing to request ${propName(prop)} with 0x9127 (hung an EOS RP)`);
    this.requireOps([Op.RequestDevicePropValue]);
    await this.callOk(Op.RequestDevicePropValue, [prop]);
    for (let i = 0; i < polls; i++) {
      await this.sleep(this.opts.pollIntervalMs ?? 300);
      const evs = await this.pollOnce();
      const hit = evs.find((e) => e.kind === 'prop' && e.prop === prop);
      if (hit && hit.kind === 'prop') {
        await this.drain();
        return hit.value;
      }
    }
    throw new Error(`camera did not report ${propName(prop)} after ${polls} polls`);
  }

  /** SetDevicePropValueEx: data = u32 size (8 + value), u32 prop, value. */
  async setPropEx(prop: number, value: Uint8Array): Promise<void> {
    await this.callOk(Op.SetDevicePropValueEx, [], { dataOut: encodeSetPropEx(prop, value) });
  }

  async disconnect(): Promise<string[]> {
    const errors: string[] = [];
    const attempt = async (what: string, f: () => Promise<unknown>) => {
      try {
        await f();
      } catch (e) {
        errors.push(`${what}: ${String(e)}`);
      }
    };
    if (this.eventsOn) await attempt('SetEventMode(0)', () => this.call(Op.SetEventMode, [0]));
    if (this.remoteOn) await attempt('SetRemoteMode(0)', () => this.call(Op.SetRemoteMode, [0]));
    if (this.open) await attempt('CloseSession', () => this.call(Op.CloseSession));
    this.eventsOn = this.remoteOn = this.open = false;
    return errors;
  }
}

/** C18A body: u32 prop, u32 dataType, u32 count, then count 32-bit values. */
export function decodeAllowed(body: Uint8Array): number[] {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const count = dv.getUint32(8, true);
  const out: number[] = [];
  for (let i = 0; i < count && 12 + i * 4 + 4 <= body.length; i++) out.push(dv.getInt32(12 + i * 4, true));
  return out;
}

export function encodeSetPropEx(prop: number, value: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + value.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, out.length, true);
  dv.setUint32(4, prop, true);
  out.set(value, 8);
  return out;
}
