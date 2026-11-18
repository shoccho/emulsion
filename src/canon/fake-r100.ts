// A software EOS R100 that speaks the subset of Canon PTP this app uses.
// Used for demo mode in the UI and for tests. Behaviour mirrors docs/M0-findings.md.

import { encodeDeviceInfo } from '../ptp/deviceinfo';
import { MockTransport, ok } from '../ptp/mock-transport';
import { ResponseCode, type TransactRequest } from '../ptp/transport';
import { Op, Prop } from './ops';
import { emptyStyle } from './styles';

const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const TERMINATOR = [...u32(8), ...u32(0)];

export const FAKE_OPS = [
  Op.GetDeviceInfo, Op.OpenSession, Op.CloseSession, Op.SetDevicePropValueEx, Op.SetRemoteMode, Op.SetEventMode,
  Op.GetEvent, Op.RequestDevicePropValue, Op.SetUILock, Op.ResetUILock, Op.KeepDeviceOn,
];

function stateBytes(words: number[]): Uint8Array {
  return new Uint8Array(new Int32Array(words).buffer);
}

export interface FakeR100Options {
  model?: string;
  ops?: number[];
  battery?: number;
  /** Make the camera reject the write of this prop with GeneralError. */
  rejectWriteOf?: number;
  /** Simulated latency per transaction. */
  latencyMs?: number;
}

export class FakeR100 {
  readonly props = new Map<number, Uint8Array>();
  readonly allowed = new Map<number, number[]>();
  private queue: Uint8Array[] = [];
  readonly transport: MockTransport;
  sessionOpen = false;
  uiLocked = false;

  constructor(private readonly o: FakeR100Options = {}) {
    this.props.set(Prop.BatteryPower, Uint8Array.from(u32(o.battery ?? 2)));
    this.props.set(Prop.PictureStyleExUserSet1, stateBytes([44, 1, 0x85, 0, 0, 0, 0, 0, 0, 2, 2]));
    this.props.set(Prop.PictureStyleExUserSet2, stateBytes([44, 1, 0x87, 0, 4, 0, 0, 0, 0, 2, 4]));
    this.props.set(Prop.PictureStyleExUserSet3, stateBytes([44, 1, 0x87, 0, 4, 0, 0, 0, 0, 2, 4]));
    for (const p of [Prop.PictureStyleParam1, Prop.PictureStyleParam2, Prop.PictureStyleParam3]) this.props.set(p, emptyStyle());
    // Camera-wide settings with the R100's allowed-value lists.
    const kelvins = Array.from({ length: 76 }, (_, i) => 2500 + i * 100);
    const shifts = Array.from({ length: 19 }, (_, i) => i - 9);
    const settings: [number, number, number[]][] = [
      [Prop.WhiteBalance, 0, [0, 23, 1, 8, 2, 3, 4, 5, 6, 9]],
      [Prop.ColorTemperature, 5200, kelvins],
      [Prop.WhiteBalanceAdjustA, 0, shifts],
      [Prop.WhiteBalanceAdjustB, 0, shifts],
      [Prop.HighISONoiseReduction, 0, [3, 1, 0, 2, 4]],
      [Prop.HighlightTonePriority, 0, []],
    ];
    for (const [p, v, allowed] of settings) {
      this.props.set(p, Uint8Array.from(u32(v)));
      this.allowed.set(p, allowed);
    }

    const info = encodeDeviceInfo({
      standardVersion: 100, vendorExtensionId: 11, vendorExtensionVersion: 100, vendorExtensionDesc: '', functionalMode: 0,
      operationsSupported: o.ops ?? FAKE_OPS, eventsSupported: [0xc189], devicePropertiesSupported: [], captureFormats: [], imageFormats: [],
      manufacturer: 'Canon Inc.', model: o.model ?? 'Canon EOS R100', deviceVersion: '3-1.3.0 (demo)', serialNumber: 'DEMO000000',
    });

    const delay = async () => {
      if (o.latencyMs) await new Promise((r) => setTimeout(r, o.latencyMs));
    };

    this.transport = MockTransport.handlers({
      [Op.GetDeviceInfo]: async () => (await delay(), ok(info)),
      [Op.OpenSession]: () => {
        if (this.sessionOpen) return { responseCode: ResponseCode.SessionAlreadyOpen, params: [] };
        this.sessionOpen = true;
        return ok();
      },
      [Op.CloseSession]: () => {
        this.sessionOpen = false;
        return ok();
      },
      [Op.SetRemoteMode]: () => ok(),
      [Op.SetEventMode]: (r) => {
        if (r.params?.[0] === 1) {
          // Initial drain carries all slot states and battery.
          for (const p of [Prop.BatteryPower, Prop.PictureStyleExUserSet1, Prop.PictureStyleExUserSet2, Prop.PictureStyleExUserSet3]) this.emit(p);
          for (const [p, list] of this.allowed) {
            this.emitAllowed(p, list);
            this.emit(p);
          }
        }
        return ok();
      },
      [Op.KeepDeviceOn]: () => ok(),
      [Op.SetUILock]: () => ((this.uiLocked = true), ok()),
      [Op.ResetUILock]: () => ((this.uiLocked = false), ok()),
      [Op.GetEvent]: async () => {
        await delay();
        const parts = this.queue.splice(0, this.queue.length);
        const total = parts.reduce((n, p) => n + p.length, 0) + 8;
        const out = new Uint8Array(total);
        let pos = 0;
        for (const p of parts) {
          out.set(p, pos);
          pos += p.length;
        }
        out.set(TERMINATOR, pos);
        return ok(out);
      },
      [Op.RequestDevicePropValue]: (r) => {
        const prop = r.params?.[0] ?? 0;
        if (!this.props.has(prop)) return { responseCode: ResponseCode.ParameterNotSupported, params: [] };
        this.emit(prop);
        return ok();
      },
      [Op.SetDevicePropValueEx]: async (r: TransactRequest) => {
        await delay();
        const d = r.dataOut;
        if (!d || d.length < 8) return { responseCode: ResponseCode.GeneralError, params: [] };
        const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
        if (dv.getUint32(0, true) !== d.length) return { responseCode: ResponseCode.GeneralError, params: [] };
        const prop = dv.getUint32(4, true);
        const value = d.slice(8);
        const current = this.props.get(prop);
        if (!current || current.length !== value.length || prop === this.o.rejectWriteOf) {
          return { responseCode: ResponseCode.GeneralError, params: [] };
        }
        const allowed = this.allowed.get(prop);
        if (allowed && allowed.length && value.length === 4 && !allowed.includes(new DataView(value.buffer).getInt32(0, true))) {
          return { responseCode: ResponseCode.GeneralError, params: [] };
        }
        this.props.set(prop, value);
        this.emit(prop);
        return ok();
      },
    });
  }

  private emitAllowed(prop: number, list: number[]): void {
    const body = [...u32(prop), ...u32(3), ...u32(list.length), ...list.flatMap((v) => u32(v))];
    this.queue.push(Uint8Array.from([...u32(8 + body.length), ...u32(0xc18a), ...body]));
  }

  private emit(prop: number): void {
    const v = this.props.get(prop)!;
    this.queue.push(Uint8Array.from([...u32(12 + v.length), ...u32(0xc189), ...u32(prop), ...v]));
  }
}
