// R100 style data ("carrier", 16,720 bytes): unscramble, edit, rescramble.
// Format and keystream starts: docs/M0-findings.md "Cipher". Keys are NOT part of this code; they are
// supplied at runtime from the user's own EOS Utility install (1025 bytes: T1[512] + T2[513]).

import { STYLE_LENGTH_R100 } from '../canon/registration';

export const KEY_LENGTH = 1025;

export class Keystream {
  private readonly t1: Uint8Array;
  private readonly t2: Uint8Array;
  constructor(tables: Uint8Array) {
    if (tables.length !== KEY_LENGTH) throw new Error(`key tables must be ${KEY_LENGTH} bytes`);
    this.t1 = tables.subarray(0, 512);
    this.t2 = tables.subarray(512);
  }
  byte(k: number): number {
    return this.t1[k % 512]! ^ this.t2[k % 513]! ^ 0x37;
  }
}

export interface Block {
  start: number;
  end: number;
  seed: number;
  kind: 'records' | 'table';
  /** Words at the start of a table block that are a header, not grid data. */
  headerWords: number;
}

/** Fixed for the R100 (identical in every carrier seen so far). */
export const R100_BLOCKS: readonly Block[] = [
  { start: 88, end: 332, seed: 8917, kind: 'records', headerWords: 0 },
  { start: 332, end: 4448, seed: 47325, kind: 'table', headerWords: 5 },
  { start: 4448, end: 8544, seed: 209211, kind: 'table', headerWords: 0 },
  { start: 8544, end: 12640, seed: 47345, kind: 'table', headerWords: 0 },
  { start: 12640, end: 16720, seed: 209211, kind: 'table', headerWords: 0 },
];

/** XOR is its own inverse: the same function unscrambles and scrambles. */
export function xorCarrier(carrier: Uint8Array, ks: Keystream): Uint8Array {
  if (carrier.length !== STYLE_LENGTH_R100) throw new Error(`carrier must be ${STYLE_LENGTH_R100} bytes`);
  const out = carrier.slice();
  for (const b of R100_BLOCKS) for (let i = b.start; i < b.end; i++) out[i] = carrier[i]! ^ ks.byte(b.seed + (i - b.start));
  return out;
}
export const decodeCarrier = xorCarrier;
export const encodeCarrier = xorCarrier;

export interface GridWord {
  table: number; // 0..3
  index: number; // word index inside the table's grid area
  offset: number; // byte offset in the carrier
  /** False for words in the format's other encoding (top bits set); never modified. */
  packed: boolean;
  v: [number, number, number];
}

const s10 = (x: number) => (x >= 512 ? x - 1024 : x);

/** Lists every grid word of the four tables in a decoded carrier. */
export function readGrid(plain: Uint8Array): GridWord[] {
  const dv = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);
  const out: GridWord[] = [];
  R100_BLOCKS.filter((b) => b.kind === 'table').forEach((b, t) => {
    const first = b.start + b.headerWords * 4;
    for (let o = first, i = 0; o < b.end; o += 4, i++) {
      const w = dv.getUint32(o, true);
      out.push({ table: t, index: i, offset: o, packed: w >>> 30 === 0, v: [s10(w & 1023), s10((w >>> 10) & 1023), s10((w >>> 20) & 1023)] });
    }
  });
  return out;
}

/** Packs three signed 10-bit values (−512..511) into a word with the top two bits clear. */
export function packWord(v: readonly [number, number, number]): number {
  for (const x of v) if (!Number.isInteger(x) || x < -512 || x > 511) throw new Error(`grid value ${x} outside −512..511`);
  const u = (x: number) => (x < 0 ? x + 1024 : x);
  return (u(v[0]) | (u(v[1]) << 10) | (u(v[2]) << 20)) >>> 0;
}

/** Returns a new decoded carrier with `fn` applied to every packed grid word. Other words are untouched. */
export function mapGrid(plain: Uint8Array, fn: (w: GridWord) => [number, number, number] | null): Uint8Array {
  const out = plain.slice();
  const dv = new DataView(out.buffer);
  for (const w of readGrid(plain)) {
    if (!w.packed) continue;
    const nv = fn(w);
    if (nv) dv.setUint32(w.offset, packWord(nv), true);
  }
  return out;
}

/** Sets the style name in the plain header (the copy in the records block is left as is). ASCII, max 31 chars. */
export function setCarrierName(plain: Uint8Array, name: string): Uint8Array {
  const clean = name.toUpperCase().replace(/[^ -~]/g, '').slice(0, 31);
  const out = plain.slice();
  out.fill(0, 12, 44);
  for (let i = 0; i < clean.length; i++) out[12 + i] = clean.charCodeAt(i);
  return out;
}
