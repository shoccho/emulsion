import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Keystream, decodeCarrier, readGrid } from '../../src/style/carrier-r100';
import { neutralParams, transformGridColour } from '../../src/style/look-engine';
const keyBytes = new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin'));
const ks = new Keystream(keyBytes);
const g = readGrid(decodeCarrier(new Uint8Array(readFileSync('fixtures-private/eos-utility/WW05_AUTUMN_HUES.slot3-D172.bin')), ks)).filter((w) => w.table === 0 && w.packed && w.v[2] >= 0);
const p = neutralParams();
let maxErr = 0, sumErr = 0;
for (const w of g) { const o = transformGridColour(w.v, p)!; const e = Math.max(...o.map((x, i) => Math.abs(x - w.v[i]!))); maxErr = Math.max(maxErr, e); sumErr += e; }
console.log(`neutral round trip over ${g.length} nodes: max error ${maxErr} units, mean ${(sumErr / g.length).toFixed(3)}`);
// fingerprints for locating the tables in a user's file (no key bytes)
const B = 257;
let h = 0; for (const x of keyBytes) h = (Math.imul(h, B) + x) >>> 0;
console.log('rolling hash', '0x' + h.toString(16), 'sha256', createHash('sha256').update(keyBytes).digest('hex'));
for (const w of g) { const o = transformGridColour(w.v, p)!; const e = Math.max(...o.map((x, i) => Math.abs(x - w.v[i]!))); if (e > 2) console.log('node', w.index, 'in', w.v.join('/'), 'out', o.join('/')); }
