// How well does the look engine predict the camera? Applies the preset to photo A and compares with photo B.
import { lab, loadSmall } from '../compare';
import { presetById } from '../../src/style/look-presets';
import { transformRgb } from '../../src/style/look-engine';
const [aP, bP, preset] = process.argv.slice(2);
const p = presetById(preset!)!.params;
const A = loadSmall(aP!), B = loadSmall(bP!);
let n = 0, effect = 0, err = 0;
const groups = new Map<string, { n: number; actC: number; predC: number; baseC: number }>();
for (let i = 0; i < A.w * A.h; i++) {
  const a = [A.px[i * 3]!, A.px[i * 3 + 1]!, A.px[i * 3 + 2]!];
  const la = lab(a[0]!, a[1]!, a[2]!);
  if (la[0] < 8) continue;
  const pr = transformRgb([a[0]! / 255, a[1]! / 255, a[2]! / 255], p).map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255));
  const lp = lab(pr[0]!, pr[1]!, pr[2]!);
  const lb = lab(B.px[i * 3]!, B.px[i * 3 + 1]!, B.px[i * 3 + 2]!);
  const d = (x: number[], y: number[]) => Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
  effect += d(la, lb); err += d(lp, lb); n++;
  const C = (l: number[]) => Math.hypot(l[1]!, l[2]!);
  if (C(la) > 15) {
    const hue = Math.round(((((Math.atan2(la[2], la[1]) * 180) / Math.PI) + 360) % 360) / 60) * 60 % 360;
    const g = groups.get(String(hue)) ?? { n: 0, actC: 0, predC: 0, baseC: 0 };
    g.n++; g.baseC += C(la); g.actC += C(lb); g.predC += C(lp); groups.set(String(hue), g);
  }
}
console.log(`camera change vs before: mean ΔE ${(effect / n).toFixed(1)}; prediction error: mean ΔE ${(err / n).toFixed(1)}`);
console.log('Lab hue   before C   camera C   predicted C');
for (const [h, g] of [...groups].sort((x, y) => +x[0] - +y[0])) console.log(`${h.padStart(4)}°  ${(g.baseC / g.n).toFixed(1).padStart(9)} ${(g.actC / g.n).toFixed(1).padStart(10)} ${(g.predC / g.n).toFixed(1).padStart(12)}`);
