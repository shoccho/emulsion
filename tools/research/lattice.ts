// Hypothesis: table-1 nodes form a regular RGB lattice; Autumn Hues (close to Standard) approximates it.
import { readFileSync } from 'node:fs';
import { Keystream, decodeCarrier, readGrid } from '../../src/style/carrier-r100';
import { ycbcrToRgb } from '../../src/style/look-engine';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
const g = readGrid(decodeCarrier(new Uint8Array(readFileSync('public/carriers/r100/autumn-hues.bin')), ks)).filter((w) => w.table === 0);
const rows: string[] = [];
for (let i = 0; i < 132; i++) {
  const w = g[i]!;
  if (!w.packed || w.v[2] < 0) { rows.push(`${i}: special`); continue; }
  const [r, gg, b] = ycbcrToRgb(w.v[2] / 512, w.v[1] / 1024, w.v[0] / 1024).map((x) => Math.round(x * 100));
  rows.push(`${i}: R${r} G${gg} B${b}`);
}
console.log(rows.join('\n'));
