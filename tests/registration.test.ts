import { describe, expect, it } from 'vitest';
import { Op, Prop } from '../src/canon/ops';
import { planRegistration, writeSlot, WriteError, STYLE_LENGTH_R100, STATE_LENGTH_R100, type SlotBackup } from '../src/canon/registration';
import { CanonSession } from '../src/canon/session';
import { encodeDeviceInfo } from '../src/ptp/deviceinfo';
import { MockTransport, ok } from '../src/ptp/mock-transport';
import { ResponseCode, type TransactRequest } from '../src/ptp/transport';

const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const term = [...u32(8), ...u32(0)];
const propEvent = (prop: number, value: Uint8Array) => [...u32(12 + value.length), ...u32(0xc189), ...u32(prop), ...value];

function blob(len: number, fill: number): Uint8Array {
  const b = new Uint8Array(len).fill(fill);
  new DataView(b.buffer).setUint32(0, len, true);
  return b;
}

const ALL_OPS = [Op.GetDeviceInfo, Op.OpenSession, Op.CloseSession, Op.SetRemoteMode, Op.SetEventMode, Op.GetEvent, Op.RequestDevicePropValue, Op.SetDevicePropValueEx, Op.SetUILock, Op.ResetUILock];

/** Fake R100 holding slot props; applies 0x9110 writes. */
function fakeCamera(opts: { model?: string; failOn?: 'style' | 'state'; mangleReadback?: boolean; ops?: number[] } = {}) {
  const store = new Map<number, Uint8Array>([
    [Prop.PictureStyleExUserSet3, blob(STATE_LENGTH_R100, 3)],
    [Prop.PictureStyleParam3, blob(STYLE_LENGTH_R100, 7)],
  ]);
  const queue: number[][] = [[...propEvent(Prop.PictureStyleExUserSet3, store.get(Prop.PictureStyleExUserSet3)!)]];
  const info = encodeDeviceInfo({
    standardVersion: 100, vendorExtensionId: 11, vendorExtensionVersion: 100, vendorExtensionDesc: '', functionalMode: 0,
    operationsSupported: opts.ops ?? ALL_OPS, eventsSupported: [], devicePropertiesSupported: [], captureFormats: [], imageFormats: [],
    manufacturer: 'Canon Inc.', model: opts.model ?? 'Canon EOS R100', deviceVersion: '3-1.3.0', serialNumber: 'X',
  });
  const t = MockTransport.handlers({
    [Op.GetDeviceInfo]: () => ok(info),
    [Op.OpenSession]: () => ok(),
    [Op.CloseSession]: () => ok(),
    [Op.SetRemoteMode]: () => ok(),
    [Op.SetEventMode]: () => ok(),
    [Op.SetUILock]: () => ok(),
    [Op.ResetUILock]: () => ok(),
    [Op.GetEvent]: () => ok(Uint8Array.from([...(queue.shift() ?? []), ...term])),
    [Op.RequestDevicePropValue]: (r: TransactRequest) => {
      const prop = r.params![0]!;
      let v = store.get(prop)!;
      if (opts.mangleReadback && prop === Prop.PictureStyleParam3 && t.calls.some((c) => c.code === Op.SetDevicePropValueEx)) {
        v = v.slice();
        v[100] = v[100]! ^ 1;
      }
      queue.push(propEvent(prop, v));
      return ok();
    },
    [Op.SetDevicePropValueEx]: (r: TransactRequest) => {
      const d = r.dataOut!;
      const dv = new DataView(d.buffer, d.byteOffset);
      const prop = dv.getUint32(4, true);
      if (dv.getUint32(0, true) !== d.length) throw new Error('bad size word');
      if (opts.failOn === 'style' && prop === Prop.PictureStyleParam3) return { responseCode: ResponseCode.GeneralError, params: [] };
      if (opts.failOn === 'state' && prop === Prop.PictureStyleExUserSet3) return { responseCode: ResponseCode.GeneralError, params: [] };
      store.set(prop, d.slice(8));
      queue.push(propEvent(prop, d.slice(8)));
      return ok();
    },
  });
  return { t, store };
}

async function connected(cam: ReturnType<typeof fakeCamera>) {
  await cam.t.open();
  const s = new CanonSession(cam.t, { sleep: async () => {} });
  await s.connect();
  return s;
}

const codes = (t: MockTransport) => t.calls.map((c) => c.code).filter((c) => c !== Op.GetEvent);

describe('planRegistration', () => {
  it('locks, writes style then state with size+prop framing, unlocks; state bytes untouched', () => {
    const style = blob(STYLE_LENGTH_R100, 1);
    const state = blob(STATE_LENGTH_R100, 2);
    const steps = planRegistration(2, style, state);
    expect(steps.map((s) => s.label)).toEqual(['lock', 'style', 'state', 'unlock']);
    const sd = new DataView(steps[1]!.dataOut!.buffer);
    expect([sd.getUint32(0, true), sd.getUint32(4, true)]).toEqual([STYLE_LENGTH_R100 + 8, Prop.PictureStyleParam2]);
    expect(steps[2]!.dataOut!.slice(8)).toEqual(state);
    expect(steps[2]!.dataOut!.length).toBe(52);
  });

  it('rejects wrong shapes', () => {
    expect(() => planRegistration(1, blob(100, 1), blob(STATE_LENGTH_R100, 2))).toThrow(/R100 needs/);
    expect(() => planRegistration(1, blob(STYLE_LENGTH_R100, 1), blob(40, 2))).toThrow(/R100 needs/);
  });
});

describe('writeSlot', () => {
  it('no-op write: backs up first, writes, unlocks, verifies', async () => {
    const cam = fakeCamera();
    const s = await connected(cam);
    let backup: SlotBackup | null = null;
    const style = cam.store.get(Prop.PictureStyleParam3)!.slice();
    const r = await writeSlot(s, {
      slot: 3,
      style,
      onBackup: async (b) => {
        backup = b;
        expect(cam.t.calls.some((c) => c.code === Op.SetDevicePropValueEx)).toBe(false);
      },
    });
    expect(backup).not.toBeNull();
    expect(r.verified).toBe(true);
    const seq = codes(cam.t);
    const lock = seq.indexOf(Op.SetUILock);
    expect(seq.slice(lock, lock + 4)).toEqual([Op.SetUILock, Op.SetDevicePropValueEx, Op.SetDevicePropValueEx, Op.ResetUILock]);
  });

  it('style failure: reports stage, still unlocks, no retry', async () => {
    const cam = fakeCamera({ failOn: 'style' });
    const s = await connected(cam);
    await expect(writeSlot(s, { slot: 3, style: blob(STYLE_LENGTH_R100, 9), onBackup: async () => {} })).rejects.toMatchObject({ stage: 'style' });
    const seq = codes(cam.t);
    expect(seq.filter((c) => c === Op.SetDevicePropValueEx).length).toBe(1);
    expect(seq.at(-1)).toBe(Op.ResetUILock);
  });

  it('state failure: reports stage "state" and unlocks', async () => {
    const cam = fakeCamera({ failOn: 'state' });
    const s = await connected(cam);
    await expect(writeSlot(s, { slot: 3, style: blob(STYLE_LENGTH_R100, 9), onBackup: async () => {} })).rejects.toMatchObject({ stage: 'state' });
    expect(codes(cam.t).at(-1)).toBe(Op.ResetUILock);
  });

  it('backup failure stops before any write', async () => {
    const cam = fakeCamera();
    const s = await connected(cam);
    await expect(
      writeSlot(s, { slot: 3, style: blob(STYLE_LENGTH_R100, 9), onBackup: async () => { throw new Error('disk full'); } }),
    ).rejects.toBeInstanceOf(WriteError);
    expect(cam.t.calls.some((c) => c.code === Op.SetDevicePropValueEx || c.code === Op.SetUILock)).toBe(false);
  });

  it('refuses other models and missing ops', async () => {
    const a = fakeCamera({ model: 'Canon EOS RP' });
    await expect(writeSlot(await connected(a), { slot: 3, style: blob(STYLE_LENGTH_R100, 9), onBackup: async () => {} })).rejects.toMatchObject({ stage: 'preflight' });
    const b = fakeCamera({ ops: ALL_OPS.filter((o) => o !== Op.SetUILock) });
    await expect(writeSlot(await connected(b), { slot: 3, style: blob(STYLE_LENGTH_R100, 9), onBackup: async () => {} })).rejects.toMatchObject({ stage: 'preflight' });
  });

  it('refuses a wrong-length style', async () => {
    const cam = fakeCamera();
    await expect(writeSlot(await connected(cam), { slot: 3, style: blob(16752, 9), onBackup: async () => {} })).rejects.toMatchObject({ stage: 'preflight' });
  });

  it('reports not verified when readback differs', async () => {
    const cam = fakeCamera({ mangleReadback: true });
    const r = await writeSlot(await connected(cam), { slot: 3, style: blob(STYLE_LENGTH_R100, 9), onBackup: async () => {} });
    expect(r.verified).toBe(false);
  });
});

import { pcStyleState, readWords } from '../src/canon/slot-state';

describe('pcStyleState', () => {
  it('sets base to 0x40+slot, copies words 3..10 from source, keeps words 0..1 live', () => {
    const live = new Uint8Array(new Int32Array([44, 1, 0x85, 0, 0, -4, -4, 0, 0, 2, 2]).buffer);
    const src = new Uint8Array(new Int32Array([44, 1, 0x43, 0, 3, 0, 0, 0, 0, 4, 4]).buffer);
    expect(readWords(pcStyleState(live, src, 1))).toEqual([44, 1, 0x41, 0, 3, 0, 0, 0, 0, 4, 4]);
    expect(readWords(live)[2]).toBe(0x85);
  });
});
