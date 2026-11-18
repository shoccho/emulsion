import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { redactPrivate } from '../src/canon/probe';
import { parseEventBatch } from '../src/canon/events';
import { parseDeviceInfo } from '../src/ptp/deviceinfo';

function propRecord(prop: number, value: Uint8Array): Uint8Array {
  const r = new Uint8Array(12 + value.length);
  const dv = new DataView(r.buffer);
  dv.setUint32(0, r.length, true);
  dv.setUint32(4, 0xc189, true); // PropValueChanged
  dv.setUint32(8, prop, true);
  r.set(value, 12);
  return r;
}
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
};

describe('probe report redaction', () => {
  it('blanks the serial number (ASCII and UTF-16) and text-valued properties, keeping lengths', () => {
    const serial = '012345678901';
    const u16 = new Uint8Array(serial.length * 2).map((_, i) => (i % 2 ? 0 : serial.charCodeAt(i / 2)));
    const info = cat(new Uint8Array([1, 2, 3]), u16, new Uint8Array([9]));
    const owner = new TextEncoder().encode('Jane D\0');
    const events = cat(propRecord(0xd115, owner), propRecord(0xd109, new Uint8Array([1, 0, 0, 0])), new Uint8Array([8, 0, 0, 0, 0, 0, 0, 0]));
    const r = redactPrivate({ blobs: { 'deviceinfo.bin': info, 'event-000.bin': events, 'x.bin': new TextEncoder().encode(`sn ${serial}`) } }, serial);
    const text = (b: Uint8Array) => Buffer.from(b).toString('latin1');
    expect(text(r.blobs['deviceinfo.bin']!)).not.toContain('0\x001\x002');
    expect(r.blobs['deviceinfo.bin']).toHaveLength(info.length);
    expect(text(r.blobs['x.bin']!)).toBe('sn XXXXXXXXXXXX');
    const ev = parseEventBatch(r.blobs['event-000.bin']!).events;
    expect(ev).toHaveLength(2);
    expect(text((ev[0] as { value: Uint8Array }).value)).toBe('XXXXXX\0');
    expect((ev[1] as { value: Uint8Array }).value).toEqual(new Uint8Array([1, 0, 0, 0])); // numbers untouched
  });

  const DIR = 'fixtures-private/2026-11-18T16-07-06-349Z-read';
  it.runIf(existsSync(DIR))('removes the serial and owner text from a real R100 probe (local only)', () => {
    const blobs: Record<string, Uint8Array> = {};
    for (const f of readdirSync(DIR)) blobs[f] = new Uint8Array(readFileSync(`${DIR}/${f}`));
    const serial = parseDeviceInfo(blobs['deviceinfo.bin']!).serialNumber;
    redactPrivate({ blobs }, serial);
    const all = Buffer.concat(Object.values(blobs).map((b) => Buffer.from(b))).toString('latin1');
    expect(all).not.toContain(serial);
    expect(parseDeviceInfo(blobs['deviceinfo.bin']!).serialNumber).toMatch(/^X+$/);
    for (const [n, b] of Object.entries(blobs))
      if (n.startsWith('event-')) for (const e of parseEventBatch(b).events) if (e.kind === 'prop' && e.prop === 0xd115) expect(e.value.every((x) => x === 0 || x === 0x58)).toBe(true);
  });
});
