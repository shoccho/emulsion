// Makes style data that is safe to publish with the site (option A, docs/M0-findings.md "Shipping looks").
//
// A generated look is built on a colour table that started life as Canon's Autumn Hues. Its tables 2 and 4
// and its name/copyright records are still Autumn Hues' own. A shippable file keeps only what we made:
//   - the plain header (base style id, sharpness, our name);
//   - tables 1 and 3: our colour grid, plus their few header and trailer numbers;
// and takes everything else from a *plain* Canon base style (compiled from our own empty style file, so it
// carries no Canon look): tables 2 and 4. The name records are rewritten with our own text.
// Runs at build time only (it needs the keys); the site ships the encoded result, never the keys.

import { STYLE_LENGTH_R100 } from '../canon/registration';
import { R100_BLOCKS } from './carrier-r100';

export const SHIP_COPYRIGHT = 'UNOFFICIAL';

const TABLE1 = R100_BLOCKS[1]!;
const TABLE3 = R100_BLOCKS[3]!;
const RECORDS = R100_BLOCKS[0]!;

/** Little-endian name records as the camera stores them: copyright (0x100a), display name (0x100d), end. */
export function nameRecords(name: string, copyright = SHIP_COPYRIGHT): Uint8Array {
  const text = (s: string) => {
    const clean = s.toUpperCase().replace(/[^ -~]/g, '').slice(0, 31);
    const b = new Uint8Array(clean.length + 1);
    for (let i = 0; i < clean.length; i++) b[i] = clean.charCodeAt(i);
    return b;
  };
  const recs: [number, number, Uint8Array][] = [
    [0x100a, 2, text(copyright)],
    [0x100d, 2, text(name)],
    [0xffff, 0xffff, new Uint8Array(0)],
  ];
  const out = new Uint8Array(RECORDS.end - RECORDS.start);
  const dv = new DataView(out.buffer);
  let p = 0;
  for (const [tag, type, v] of recs) {
    dv.setUint16(p, tag, true);
    dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, v.length, true);
    out.set(v, p + 8);
    p += 8 + v.length;
  }
  return out;
}

/**
 * Decoded look + decoded plain base -> decoded shippable style data.
 * `look` must already carry the final header (name, base id, sharpness).
 */
export function shippablePlain(look: Uint8Array, plainBase: Uint8Array, name: string): Uint8Array {
  if (look.length !== STYLE_LENGTH_R100 || plainBase.length !== STYLE_LENGTH_R100) throw new Error('style data has the wrong size');
  const out = plainBase.slice();
  out.set(look.subarray(0, RECORDS.start), 0);
  out.set(nameRecords(name), RECORDS.start);
  out.set(look.subarray(TABLE1.start, TABLE1.end), TABLE1.start);
  out.set(look.subarray(TABLE3.start, TABLE3.end), TABLE3.start);
  return out;
}
