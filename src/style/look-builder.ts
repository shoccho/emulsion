// Builds R100 style data from a base carrier + look parameters.
// Only table 1 drives JPEG colour; table 3 is its near-copy, so both get the same transform.
// Tables 2 and 4 (no visible effect on JPEGs in tests) and every special word are left untouched.

import { STYLE_LENGTH_R100 } from '../canon/registration';
import { Keystream, decodeCarrier, encodeCarrier, mapGrid, readGrid, setCarrierName } from './carrier-r100';
import { isNeutral, transformGridColour, type LookParams } from './look-engine';

/**
 * Word positions in tables 1 and 3 that hold trailer data, not colours; the builder never edits them.
 * (Until 2026-11-19 a misaligned key read made 62 more positions look like metadata, so they were frozen.
 * docs/M0-findings.md "Where the keys come from".)
 */
export const SPECIAL_INDICES: ReadonlySet<number> = new Set([1020, 1021, 1022, 1023]);
const COLOUR_TABLES: ReadonlySet<number> = new Set([0, 2]);

/** A plain Canon base compiles to an all-zero colour table (the camera then uses its built-in rendering). */
export function hasColourTable(plain: Uint8Array): boolean {
  return readGrid(plain).some(
    (w) => w.table === 0 && w.packed && !SPECIAL_INDICES.has(w.index) && w.v[2] >= 0 && (w.v[0] !== 0 || w.v[1] !== 0 || w.v[2] !== 0),
  );
}

export function buildLookCarrier(baseCarrier: Uint8Array, params: LookParams, name: string, ks: Keystream): Uint8Array {
  if (baseCarrier.length !== STYLE_LENGTH_R100) throw new Error('base style data has the wrong size');
  const plain = decodeCarrier(baseCarrier, ks);
  if (new DataView(plain.buffer).getUint32(4, true) !== 1) throw new Error('base style data is empty');
  if (!hasColourTable(plain)) throw new Error('this base has no colour table (a plain Canon style); choose a base with colour data');
  const graded = isNeutral(params)
    ? plain
    : mapGrid(plain, (w) => (COLOUR_TABLES.has(w.table) && !SPECIAL_INDICES.has(w.index) ? transformGridColour(w.v, params) : null));
  return encodeCarrier(setCarrierName(graded, name), ks);
}

/** Sets the Canon base style id and its default sharpness in a decoded carrier's plain header. */
export function withBaseHeader(plain: Uint8Array, baseId: number, sharpness: number, fineness: number, threshold: number): Uint8Array {
  const out = plain.slice();
  const dv = new DataView(out.buffer);
  out[10] = baseId;
  dv.setInt32(48, sharpness, true);
  dv.setInt32(68, fineness, true);
  dv.setInt32(72, threshold, true);
  return out;
}
