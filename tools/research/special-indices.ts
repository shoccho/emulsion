import { readFileSync } from 'node:fs';
import { Keystream, decodeCarrier, readGrid } from '../../src/style/carrier-r100';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
for (const f of ['base-standard.bin', 'base-neutral.bin', 'base-faithful.bin']) {
  const g = readGrid(decodeCarrier(new Uint8Array(readFileSync('public/carriers/r100/' + f)), ks));
  for (const t of [0, 2]) {
    const idx = g.filter((w) => w.table === t && (!w.packed || w.v.some((x) => x !== 0))).map((w) => w.index);
    console.log(f, `table ${t + 1}:`, idx.length, JSON.stringify(idx));
  }
}
// and: are Autumn Hues' words at these positions identical to the plain base? (i.e. are they really format words?)
const p = readGrid(decodeCarrier(new Uint8Array(readFileSync('public/carriers/r100/base-standard.bin')), ks));
const a = readGrid(decodeCarrier(new Uint8Array(readFileSync('public/carriers/r100/autumn-hues.bin')), ks));
const sp = p.filter((w) => w.table === 0 && (!w.packed || w.v.some((x) => x !== 0))).map((w) => w.index);
const same = sp.filter((i) => { const x = p.find((w) => w.table === 0 && w.index === i)!, y = a.find((w) => w.table === 0 && w.index === i)!; return x.packed === y.packed && x.v.join() === y.v.join(); });
console.log('special positions equal in Autumn Hues:', same.length, 'of', sp.length);
