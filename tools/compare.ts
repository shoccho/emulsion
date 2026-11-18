// Compare two photos of the same static scene pixel by pixel (research).
// Usage: npm run compare -- <a.jpg> <b.jpg>
// Downscales with macOS `sips`, then groups pixels of A by hue sector and lightness and reports how B differs.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function loadSmall(path: string, max = 160): { w: number; h: number; px: Uint8Array } {
  const dir = mkdtempSync(join(tmpdir(), 'cmp-'));
  const out = join(dir, 'x.bmp');
  execFileSync('sips', ['-s', 'format', 'bmp', '--resampleHeightWidthMax', String(max), path, '--out', out], { stdio: 'ignore' });
  const b = readFileSync(out);
  const dv = new DataView(b.buffer, b.byteOffset);
  const off = dv.getUint32(10, true);
  const w = dv.getInt32(18, true);
  const hRaw = dv.getInt32(22, true);
  const bpp = dv.getUint16(28, true);
  const h = Math.abs(hRaw);
  const bytes = bpp / 8;
  const stride = Math.ceil((w * bytes) / 4) * 4;
  const px = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const sy = hRaw > 0 ? h - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const i = off + sy * stride + x * bytes;
      px.set([b[i + 2]!, b[i + 1]!, b[i]!], (y * w + x) * 3);
    }
  }
  return { w, h, px };
}

/** sRGB 0..255 -> approximate CIE L*a*b* (D65). */
export function lab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function compare(aPath: string, bPath: string): string {
  const A = loadSmall(aPath);
  const B = loadSmall(bPath);
  if (A.w !== B.w || A.h !== B.h) throw new Error('images differ in size');
  type Acc = { n: number; dL: number; dC: number; dH: number; L: number; C: number };
  const sectors = new Map<string, Acc>();
  let n = 0, sumDE = 0;
  for (let i = 0; i < A.w * A.h; i++) {
    const a = lab(A.px[i * 3]!, A.px[i * 3 + 1]!, A.px[i * 3 + 2]!);
    const b = lab(B.px[i * 3]!, B.px[i * 3 + 1]!, B.px[i * 3 + 2]!);
    if (a[0] < 8) continue; // skip black background
    const Ca = Math.hypot(a[1], a[2]);
    const Cb = Math.hypot(b[1], b[2]);
    const ha = (Math.atan2(a[2], a[1]) * 180) / Math.PI;
    const hb = (Math.atan2(b[2], b[1]) * 180) / Math.PI;
    let dh = hb - ha;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    const key = Ca < 10 ? `neutral L${Math.floor(a[0] / 25) * 25}` : `hue ${String(Math.round((((ha + 360) % 360) / 30)) * 30 % 360).padStart(3)}° L${Math.floor(a[0] / 25) * 25}`;
    const s = sectors.get(key) ?? { n: 0, dL: 0, dC: 0, dH: 0, L: 0, C: 0 };
    s.n++;
    s.dL += b[0] - a[0];
    s.dC += Cb - Ca;
    s.dH += Ca >= 10 ? dh : 0;
    s.L += a[0];
    s.C += Ca;
    sectors.set(key, s);
    n++;
    sumDE += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const lines = [`pixels ${n}, mean ΔE ${(sumDE / n).toFixed(2)}`, 'group                 n    L(A)  C(A)    ΔL     ΔC    Δhue°'];
  for (const [k, s] of [...sectors].sort()) {
    if (s.n < 20) continue;
    const f = (v: number) => (v / s.n).toFixed(1).padStart(6);
    lines.push(`${k.padEnd(18)} ${String(s.n).padStart(5)} ${f(s.L)} ${f(s.C)} ${f(s.dL)} ${f(s.dC)} ${f(s.dH)}`);
  }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error('usage: npm run compare -- <a.jpg> <b.jpg>');
    process.exit(2);
  }
  console.log(compare(a, b));
}
