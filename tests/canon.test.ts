import { describe, expect, it } from 'vitest';
import { parseEventBatch } from '../src/canon/events';
import { runProbe } from '../src/canon/probe';
import { Op, Prop } from '../src/canon/ops';
import { encodeDeviceInfo } from '../src/ptp/deviceinfo';
import { MockTransport, ok } from '../src/ptp/mock-transport';
import { ResponseCode } from '../src/ptp/transport';

function rec(type: number, body: number[]): number[] {
  const size = 8 + body.length;
  return [...u32(size), ...u32(type), ...body];
}
function u32(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
}
const term = [...u32(8), ...u32(0)];
const propEvent = (prop: number, value: number[]) => rec(0xc189, [...u32(prop), ...value]);

describe('events', () => {
  it('parses prop, avail and unknown records', () => {
    const b = Uint8Array.from([
      ...propEvent(0xd111, [1, 0, 0, 0]),
      ...rec(0xc18a, [...u32(0xd109), ...u32(6), ...u32(0)]),
      ...rec(0xc1a7, [9, 9]),
      ...term,
    ]);
    const r = parseEventBatch(b);
    expect(r.terminated).toBe(true);
    expect(r.error).toBeNull();
    expect(r.events.map((e) => e.kind)).toEqual(['prop', 'avail', 'other']);
  });

  it('handles terminator-only and empty batches', () => {
    expect(parseEventBatch(Uint8Array.from(term))).toMatchObject({ events: [], terminated: true });
    expect(parseEventBatch(new Uint8Array(0))).toMatchObject({ events: [], error: null });
  });

  it('reports truncated records without throwing', () => {
    const b = Uint8Array.from(propEvent(0xd111, [1, 0, 0, 0])).slice(0, 14);
    const r = parseEventBatch(b);
    expect(r.error).toMatch(/bad record size|truncated/);
  });
});

describe('probe', () => {
  const ops = [Op.GetDeviceInfo, Op.OpenSession, Op.CloseSession, Op.SetRemoteMode, Op.SetEventMode, Op.GetEvent, Op.RequestDevicePropValue];
  const info = encodeDeviceInfo({
    standardVersion: 100, vendorExtensionId: 11, vendorExtensionVersion: 100, vendorExtensionDesc: '', functionalMode: 0,
    operationsSupported: ops, eventsSupported: [], devicePropertiesSupported: [], captureFormats: [], imageFormats: [],
    manufacturer: 'Canon Inc.', model: 'Canon EOS R100', deviceVersion: '1.0.0', serialNumber: 'SECRET123',
  });

  it('runs a read-only session, captures requested props, and cleans up', async () => {
    let pending: number | null = null;
    let first = true;
    const t = MockTransport.handlers({
      [Op.GetDeviceInfo]: () => ok(info),
      [Op.OpenSession]: () => ok(),
      [Op.CloseSession]: () => ok(),
      [Op.SetRemoteMode]: () => ok(),
      [Op.SetEventMode]: () => ok(),
      [Op.RequestDevicePropValue]: (r) => {
        pending = r.params![0]!;
        return ok();
      },
      [Op.GetEvent]: () => {
        if (first) {
          first = false;
          return ok(Uint8Array.from([...propEvent(Prop.PictureStyleExUserSet1, [1, 2, 3]), ...term]));
        }
        if (pending !== null) {
          const p = pending;
          pending = null;
          return ok(Uint8Array.from([...propEvent(p, [0xaa, 0xbb]), ...term]));
        }
        return ok(Uint8Array.from(term));
      },
    });
    await t.open();
    const r = await runProbe(t, { level: 'read', sleep: async () => {} });
    expect(r.info.model).toBe('Canon EOS R100');
    expect(JSON.stringify(r)).not.toContain('SECRET123');
    expect(r.blobs['prop-D163.bin']).toEqual(Uint8Array.from([1, 2, 3]));
    expect(r.blobs['prop-D170.bin']).toEqual(Uint8Array.from([0xaa, 0xbb]));
    expect(r.blobs['prop-D17F.bin']).toBeDefined();
    // Never requests slot-state props directly.
    const requested = t.calls.filter((c) => c.code === Op.RequestDevicePropValue).map((c) => c.params![0]);
    expect(requested).not.toContain(Prop.PictureStyleExUserSet1);
    // Never writes.
    expect(t.calls.some((c) => c.code === Op.SetDevicePropValueEx || c.dataOut)).toBe(false);
    const tail = t.calls.slice(-3).map((c) => [c.code, c.params?.[0]]);
    expect(tail).toEqual([[Op.SetEventMode, 0], [Op.SetRemoteMode, 0], [Op.CloseSession, undefined]]);
  });

  it('still cleans up when a mid-session command throws', async () => {
    const t = MockTransport.handlers({
      [Op.GetDeviceInfo]: () => ok(info),
      [Op.OpenSession]: () => ok(),
      [Op.CloseSession]: () => ok(),
      [Op.SetRemoteMode]: () => ok(),
      [Op.SetEventMode]: () => ok(),
      [Op.GetEvent]: () => {
        throw new Error('cable pulled');
      },
    });
    await t.open();
    await expect(runProbe(t, { level: 'read', sleep: async () => {} })).rejects.toThrow('cable pulled');
    expect(t.calls.at(-1)!.code).toBe(Op.CloseSession);
  });

  it('info level opens no session', async () => {
    const t = MockTransport.scripted([{ code: Op.GetDeviceInfo, reply: ok(info) }]);
    await t.open();
    await runProbe(t, { level: 'info' });
    expect(t.done).toBe(true);
    expect(ResponseCode.OK).toBe(0x2001);
  });
});
