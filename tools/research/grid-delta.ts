import { readFileSync } from 'node:fs';
import { Keystream, decodeCarrier, readGrid } from '../../src/style/carrier-r100';
import { buildLookCarrier } from '../../src/style/look-builder';
import { presetById } from '../../src/style/look-presets';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
const base = new Uint8Array(readFileSync('fixtures-private/eos-utility/WW05_AUTUMN_HUES.slot3-D172.bin'));
const built = buildLookCarrier(base, presetById(process.argv[2] ?? 'classic-chrome')!.params, 'X', ks);
const a = readGrid(decodeCarrier(base, ks)), b = readGrid(decodeCarrier(built, ks));
const buckets = new Map<number, { n: number; dy: number; dc: number }>();
for (let i = 0; i < a.length; i++) {
  if (a[i]!.table !== 0 || !a[i]!.packed || a[i]!.v[2] < 0) continue;
  const k = Math.floor(a[i]!.v[2] / 64) * 64;
  const s = buckets.get(k) ?? { n: 0, dy: 0, dc: 0 };
  s.n++; s.dy += b[i]!.v[2] - a[i]!.v[2];
  s.dc += Math.hypot(b[i]!.v[0], b[i]!.v[1]) - Math.hypot(a[i]!.v[0], a[i]!.v[1]);
  buckets.set(k, s);
}
console.log('Y bucket   nodes  mean ΔY  mean Δchroma');
for (const [k, s] of [...buckets].sort((x, y) => x[0] - y[0])) console.log(`${String(k).padStart(6)} ${String(s.n).padStart(7)} ${(s.dy / s.n).toFixed(1).padStart(8)} ${(s.dc / s.n).toFixed(1).padStart(10)}`);
