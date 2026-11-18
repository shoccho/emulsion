// Fit look parameters that turn photo A (Autumn Hues) into photo B (plain Standard), same lighting.
// Coordinate descent on mean ΔE over chart pixels. Writes fixtures-private/identity-params.json.
import { writeFileSync } from 'node:fs';
import { lab, loadSmall } from '../compare';
import { HUE_BANDS, neutralParams, transformRgb, type LookParams } from '../../src/style/look-engine';
const [aP, bP, out] = process.argv.slice(2);
const A = loadSmall(aP!, 120), B = loadSmall(bP!, 120);
const pairs: { a: [number, number, number]; b: number[] }[] = [];
for (let i = 0; i < A.w * A.h; i++) {
  const a: [number, number, number] = [A.px[i * 3]! / 255, A.px[i * 3 + 1]! / 255, A.px[i * 3 + 2]! / 255];
  const la = lab(A.px[i * 3]!, A.px[i * 3 + 1]!, A.px[i * 3 + 2]!);
  if (la[0] < 8 || la[0] > 97) continue;
  pairs.push({ a, b: lab(B.px[i * 3]!, B.px[i * 3 + 1]!, B.px[i * 3 + 2]!) });
}
const err = (p: LookParams) => {
  let s = 0;
  for (const { a, b } of pairs) {
    const o = transformRgb(a, p).map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255));
    const l = lab(o[0]!, o[1]!, o[2]!);
    s += Math.hypot(l[0] - b[0]!, l[1] - b[1]!, l[2] - b[2]!);
  }
  return s / pairs.length;
};
type K = { get: (p: LookParams) => number; set: (p: LookParams, v: number) => void; step: number; lo: number; hi: number };
const keys: K[] = [
  { get: (p) => p.saturation, set: (p, v) => (p.saturation = v), step: 0.05, lo: -1, hi: 1 },
  { get: (p) => p.contrast, set: (p, v) => (p.contrast = v), step: 0.05, lo: -1, hi: 1 },
  { get: (p) => p.shadows, set: (p, v) => (p.shadows = v), step: 0.05, lo: -1, hi: 1 },
  { get: (p) => p.highlights, set: (p, v) => (p.highlights = v), step: 0.05, lo: -1, hi: 1 },
];
for (const b of HUE_BANDS) {
  keys.push({ get: (p) => p.bands[b.key].sat, set: (p, v) => (p.bands[b.key].sat = v), step: 0.04, lo: -1, hi: 1 });
  keys.push({ get: (p) => p.bands[b.key].hue, set: (p, v) => (p.bands[b.key].hue = v), step: 2, lo: -30, hi: 30 });
  keys.push({ get: (p) => p.bands[b.key].light, set: (p, v) => (p.bands[b.key].light = v), step: 0.01, lo: -0.2, hi: 0.2 });
}
let p = neutralParams();
let best = err(p);
console.log(`start: mean ΔE ${best.toFixed(2)} over ${pairs.length} pixels`);
for (let round = 0; round < 6; round++) {
  for (const k of keys) {
    for (const dir of [1, -1]) {
      for (;;) {
        const q = structuredClone(p);
        const v = Math.min(k.hi, Math.max(k.lo, k.get(q) + dir * k.step));
        if (v === k.get(q)) break;
        k.set(q, v);
        const e = err(q);
        if (e < best - 1e-4) { p = q; best = e; } else break;
      }
    }
  }
  console.log(`round ${round + 1}: mean ΔE ${best.toFixed(2)}`);
  for (const k of keys) k.step /= 1.6;
}
writeFileSync(out!, JSON.stringify(p, null, 2));
console.log(JSON.stringify(p));
