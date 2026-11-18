// PF2 (version 0x2000) Picture Style files: read and write.
// Layout (docs/M0-findings.md "Cipher"): u32 BE version, "PSP\0", u32 BE payload length, then the payload
// XOR-scrambled with keystream index = payload byte index. Payload = big-endian TLV records
// (u16 tag, u16 type, u32 length, value), ending with tag 0xFFFF. This old version has no checksum record.

import type { Keystream } from './carrier-r100';

export interface Pf2Record {
  tag: number;
  type: number;
  value: Uint8Array;
}

export const Pf2Tag = {
  Name: 0x1002,
  BaseStyle: 0x1009,
  Copyright: 0x100a,
  DisplayName: 0x100d,
  ColorDataA: 0x1021,
  ColorDataB: 0x1029,
  End: 0xffff,
} as const;

export interface Pf2File {
  version: number;
  records: Pf2Record[];
}

function xor(data: Uint8Array, ks: Keystream): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i]! ^ ks.byte(i);
  return out;
}

export function readPf2(file: Uint8Array, ks: Keystream): Pf2File {
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (file.length < 12 || String.fromCharCode(...file.slice(4, 7)) !== 'PSP') throw new Error('not a Picture Style file');
  const version = dv.getUint32(0, false);
  const n = dv.getUint32(8, false);
  if (12 + n > file.length) throw new Error('Picture Style file is truncated');
  const p = xor(file.subarray(12, 12 + n), ks);
  const pv = new DataView(p.buffer);
  const records: Pf2Record[] = [];
  let pos = 0;
  while (pos + 8 <= p.length) {
    const tag = pv.getUint16(pos, false);
    const type = pv.getUint16(pos + 2, false);
    const len = pv.getUint32(pos + 4, false);
    if (pos + 8 + len > p.length) throw new Error(`record 0x${tag.toString(16)} runs past the end`);
    records.push({ tag, type, value: p.slice(pos + 8, pos + 8 + len) });
    pos += 8 + len;
    if (tag === Pf2Tag.End) break;
  }
  if (records.at(-1)?.tag !== Pf2Tag.End || pos !== p.length || (records[0]!.tag & 0xff00) !== 0x1000) {
    throw new Error('Picture Style file does not decode cleanly (wrong keys or a damaged file)');
  }
  return { version, records };
}

export function writePf2(f: Pf2File, ks: Keystream): Uint8Array {
  const body = f.records.reduce((n, r) => n + 8 + r.value.length, 0);
  const p = new Uint8Array(body);
  const pv = new DataView(p.buffer);
  let pos = 0;
  for (const r of f.records) {
    pv.setUint16(pos, r.tag, false);
    pv.setUint16(pos + 2, r.type, false);
    pv.setUint32(pos + 4, r.value.length, false);
    p.set(r.value, pos + 8);
    pos += 8 + r.value.length;
  }
  const out = new Uint8Array(12 + body);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, f.version, false);
  out.set([0x50, 0x53, 0x50, 0], 4);
  dv.setUint32(8, body, false);
  out.set(xor(p, ks), 12);
  return out;
}

const ascii = (s: string, size?: number) => {
  const b = new Uint8Array(size ?? s.length + 1);
  for (let i = 0; i < s.length && i < b.length - 1; i++) b[i] = s.charCodeAt(i) & 0x7f;
  return b;
};

/**
 * A "plain base" style made from a template file: same records, but the given base style, a new name,
 * and both colour-adjustment blocks zeroed (no colour changes on top of the base).
 */
export function plainBaseFromTemplate(template: Pf2File, baseId: number, name: string): Pf2File {
  const records = template.records.map((r): Pf2Record => {
    switch (r.tag) {
      case Pf2Tag.Name:
        return { ...r, value: ascii(name.toUpperCase(), r.value.length) };
      case Pf2Tag.DisplayName:
        return { ...r, value: ascii(name.toUpperCase()) };
      case Pf2Tag.BaseStyle:
        return { ...r, value: Uint8Array.of(0, baseId) };
      case Pf2Tag.ColorDataA:
      case Pf2Tag.ColorDataB:
        return { ...r, value: new Uint8Array(r.value.length) };
      default:
        return { ...r, value: r.value.slice() };
    }
  });
  return { version: template.version, records };
}
