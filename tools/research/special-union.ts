import { readFileSync } from 'node:fs';
import { Keystream, decodeCarrier, readGrid } from '../../src/style/carrier-r100';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
const set = new Set<number>();
for (const f of ['base-standard.bin', 'autumn-hues.bin', 'nostalgia.bin']) {
  const g = readGrid(decodeCarrier(new Uint8Array(readFileSync('public/carriers/r100/' + f)), ks)).filter((w) => w.table === 0 || w.table === 2);
  for (const w of g) {
    if (!w.packed) set.add(w.index);
    if (f === 'base-standard.bin' && w.v.some((x) => x !== 0)) set.add(w.index);
  }
}
console.log(JSON.stringify([...set].sort((a, b) => a - b)));
