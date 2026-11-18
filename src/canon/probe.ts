// M0 read-only probe. Sends no property writes and no style data.
// Commands used: GetDeviceInfo, Open/CloseSession, SetRemoteMode, SetEventMode,
// GetEvent, RequestDevicePropValue (only for SAFE_REQUEST_PROPS),
// GetPictureStylePCFlavorParam (only if the camera advertises it).

import { parseDeviceInfo, type DeviceInfo } from '../ptp/deviceinfo';
import { ResponseCode, hex, type TransactResult, type Transport } from '../ptp/transport';
import { parseEventBatch, type CanonEvent } from './events';
import { Op, Prop, SAFE_REQUEST_PROPS, opName, propName } from './ops';

export type ProbeLevel = 'info' | 'read';

export interface ProbeOptions {
  level: ProbeLevel;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  /** Max GetEvent calls when draining the initial queue. */
  maxDrain?: number;
  /** GetEvent polls after each 0x9127 request. */
  pollsPerRequest?: number;
  pollIntervalMs?: number;
}

export interface ProbeStep {
  op: string;
  params: string[];
  response: string;
  dataInBytes: number;
  ms: number;
  error?: string;
}

export interface ProbeResult {
  info: Omit<DeviceInfo, 'serialNumber'> & { serialHash: string };
  advertised: Record<string, boolean>;
  steps: ProbeStep[];
  /** Latest value of each property seen in events, by hex prop id. */
  props: Record<string, { name: string; bytes: number; firstBytesHex: string }>;
  /** Raw blobs worth saving: deviceinfo, every GetEvent batch, each requested prop value, 9189 reads. */
  blobs: Record<string, Uint8Array>;
  cleanupErrors: string[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function sha256Short(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function runProbe(t: Transport, opts: ProbeOptions): Promise<ProbeResult> {
  const log = opts.log ?? (() => {});
  const sleep = opts.sleep ?? defaultSleep;
  const steps: ProbeStep[] = [];
  const blobs: Record<string, Uint8Array> = {};
  const props: ProbeResult['props'] = {};
  const cleanupErrors: string[] = [];
  let batchNo = 0;

  const call = async (code: number, params: number[] = [], expectDataIn = false): Promise<TransactResult> => {
    const started = Date.now();
    const step: ProbeStep = { op: opName(code), params: params.map((p) => '0x' + hex(p, 1)), response: '', dataInBytes: 0, ms: 0 };
    steps.push(step);
    try {
      const r = await t.transact({ code, params, expectDataIn });
      step.response = '0x' + hex(r.responseCode);
      step.dataInBytes = r.dataIn?.length ?? 0;
      return r;
    } catch (e) {
      step.error = String(e);
      throw e;
    } finally {
      step.ms = Date.now() - started;
      log(`${step.op}(${step.params.join(',')}) -> ${step.response || step.error} ${step.dataInBytes ? step.dataInBytes + 'B' : ''}`);
    }
  };

  const recordEvents = (events: CanonEvent[]) => {
    for (const ev of events) {
      if (ev.kind !== 'prop') continue;
      const key = '0x' + hex(ev.prop);
      props[key] = {
        name: propName(ev.prop),
        bytes: ev.value.length,
        firstBytesHex: Array.from(ev.value.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join(' '),
      };
      // Picture-style related props (state, params, descriptor): keep full latest value.
      if (ev.prop >= 0xd160 && ev.prop <= 0xd17f) blobs[`prop-${hex(ev.prop)}.bin`] = ev.value;
    }
  };

  const getEvents = async (): Promise<CanonEvent[]> => {
    const r = await call(Op.GetEvent, [], true);
    if (r.responseCode !== ResponseCode.OK) return [];
    const data = r.dataIn ?? new Uint8Array(0);
    blobs[`event-${String(batchNo++).padStart(3, '0')}.bin`] = data;
    const batch = parseEventBatch(data);
    if (batch.error) log(`  event batch parse warning: ${batch.error}`);
    recordEvents(batch.events);
    return batch.events;
  };

  // --- DeviceInfo (no session needed) ---
  const di = await call(Op.GetDeviceInfo, [], true);
  if (di.responseCode !== ResponseCode.OK || !di.dataIn) throw new Error(`GetDeviceInfo failed: 0x${hex(di.responseCode)}`);
  blobs['deviceinfo.bin'] = di.dataIn;
  const parsed = parseDeviceInfo(di.dataIn);
  const { serialNumber, ...rest } = parsed;
  const info = { ...rest, serialHash: await sha256Short(serialNumber) };
  const ops = new Set(parsed.operationsSupported);
  const advertised: Record<string, boolean> = {};
  for (const [name, code] of Object.entries(Op)) advertised[`${name} 0x${hex(code)}`] = ops.has(code);
  for (const [name, code] of Object.entries(Prop)) advertised[`prop ${name} 0x${hex(code)}`] = parsed.devicePropertiesSupported.includes(code);
  log(`model=${parsed.model} fw=${parsed.deviceVersion} ops=${parsed.operationsSupported.length}`);

  const result: ProbeResult = { info, advertised, steps, props, blobs, cleanupErrors };
  if (opts.level === 'info') return redactPrivate(result, serialNumber);

  // --- Read-only session ---
  const open = await call(Op.OpenSession, [1]);
  if (open.responseCode !== ResponseCode.OK && open.responseCode !== ResponseCode.SessionAlreadyOpen) {
    throw new Error(`OpenSession failed: 0x${hex(open.responseCode)}`);
  }
  let remoteOn = false;
  let eventsOn = false;
  try {
    if (ops.has(Op.SetRemoteMode)) remoteOn = (await call(Op.SetRemoteMode, [1])).responseCode === ResponseCode.OK;
    if (ops.has(Op.SetEventMode)) eventsOn = (await call(Op.SetEventMode, [1])).responseCode === ResponseCode.OK;

    if (ops.has(Op.GetEvent)) {
      const max = opts.maxDrain ?? 20;
      for (let i = 0; i < max; i++) {
        const evs = await getEvents();
        if (evs.length === 0) break;
      }

      if (ops.has(Op.RequestDevicePropValue)) {
        for (const prop of SAFE_REQUEST_PROPS) {
          const r = await call(Op.RequestDevicePropValue, [prop]);
          if (r.responseCode !== ResponseCode.OK) continue;
          for (let i = 0; i < (opts.pollsPerRequest ?? 6); i++) {
            await sleep(opts.pollIntervalMs ?? 300);
            const evs = await getEvents();
            const hit = evs.find((e) => e.kind === 'prop' && e.prop === prop);
            if (hit && hit.kind === 'prop') {
              blobs[`prop-${hex(prop)}.bin`] = hit.value;
              break;
            }
          }
        }
      }
    }

    if (ops.has(Op.GetPictureStylePCFlavorParam)) {
      for (const slot of [1, 2, 3]) {
        const r = await call(Op.GetPictureStylePCFlavorParam, [slot], true);
        if (r.responseCode === ResponseCode.OK && r.dataIn) blobs[`9189-slot${slot}.bin`] = r.dataIn;
      }
    }
  } finally {
    const tryCleanup = async (what: string, f: () => Promise<unknown>) => {
      try {
        await f();
      } catch (e) {
        cleanupErrors.push(`${what}: ${String(e)}`);
      }
    };
    if (eventsOn) await tryCleanup('SetEventMode(0)', () => call(Op.SetEventMode, [0]));
    if (remoteOn) await tryCleanup('SetRemoteMode(0)', () => call(Op.SetRemoteMode, [0]));
    await tryCleanup('CloseSession', () => call(Op.CloseSession));
  }

  return redactPrivate(result, serialNumber);
}

/**
 * Probe reports are meant to be shared publicly (CONTRIBUTING.md), so remove what identifies a camera or its
 * owner: the serial number wherever it appears in the raw bytes (ASCII or UTF-16, as PTP stores it), and the
 * value of every text-valued camera property in event batches (owner name, artist, copyright, serial...).
 * Lengths and positions are kept, so the reports still parse. Text values are never needed to support a model.
 */
export function redactPrivate<T extends { blobs: Record<string, Uint8Array>; props?: Record<string, { firstBytesHex: string }> }>(result: T, serial: string): T {
  const patterns: Uint8Array[] = [];
  if (serial.length >= 4) {
    patterns.push(new TextEncoder().encode(serial));
    const u16 = new Uint8Array(serial.length * 2);
    for (let i = 0; i < serial.length; i++) u16[i * 2] = serial.charCodeAt(i) & 0xff;
    patterns.push(u16);
  }
  const redactedProps = new Set<number>();
  for (const [name, blob] of Object.entries(result.blobs)) {
    for (const pat of patterns) {
      for (let i = 0; i + pat.length <= blob.length; i++) {
        let hit = true;
        for (let j = 0; j < pat.length && hit; j++) hit = blob[i + j] === pat[j];
        if (hit) for (let j = 0; j < pat.length; j++) if (pat[j] !== 0) blob[i + j] = 0x58; // 'X'
      }
    }
    if (!name.startsWith('event-')) continue;
    for (const e of parseEventBatch(blob).events) {
      if (e.kind !== 'prop' || !isText(e.value)) continue;
      // value starts 12 bytes into the record: u32 size, u32 type, u32 prop
      for (let j = 0; j < e.value.length; j++) if (e.value[j] !== 0) blob[e.offset + 12 + j] = 0x58;
      redactedProps.add(e.prop);
    }
  }
  if (result.props) {
    for (const p of redactedProps) {
      const key = Object.keys(result.props).find((k) => parseInt(k, 16) === p);
      if (key) result.props[key]!.firstBytesHex = '(redacted text)';
    }
  }
  return result;
}

/** A NUL-terminated run of at least 3 printable ASCII characters, possibly padded with zeros. */
function isText(v: Uint8Array): boolean {
  let n = 0;
  while (n < v.length && v[n]! >= 0x20 && v[n]! < 0x7f) n++;
  return n >= 3 && (n === v.length || v.subarray(n).every((b) => b === 0));
}
