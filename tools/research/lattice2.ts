import { readFileSync } from 'node:fs';
import { Keystream, decodeCarrier, readGrid } from '../../src/style/carrier-r100';
import { ycbcrToRgb } from '../../src/style/look-engine';
import { SPECIAL_INDICES } from '../../src/style/look-builder';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
const g = readGrid(decodeCarrier(new Uint8Array(readFileSync('public/carriers/r100/' + (process.argv[2] ?? 'autumn-hues.bin'))), ks)).filter((w) => w.table === 0 && !SPECIAL_INDICES.has(w.index));
console.log('colour nodes', g.length);
const rgb = g.map((w) => ycbcrToRgb(w.v[2] / 512, w.v[1] / 1024, w.v[0] / 1024));
for (const [ax, name] of [[0, 'R'], [1, 'G'], [2, 'B']] as const) {
  const h: Record<number, number> = {};
  for (const c of rgb) { const k = Math.round(c[ax] * 50) * 2; h[k] = (h[k] ?? 0) + 1; }
  console.log(name, Object.entries(h).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
}
// print index runs 0..1023 compactly: index -> R,G,B in %
let line = '';
for (let k = 0; k < g.length; k++) { const c = rgb[k]!.map((x) => Math.round(x * 100)); line += `${g[k]!.index}:${c.join(',')} `; }
console.log(line.slice(0, 6000));
