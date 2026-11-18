import { lab, loadSmall } from '../compare';
const [aP, ...rest] = process.argv.slice(2);
const A = loadSmall(aP!);
for (const bP of rest) {
  const B = loadSmall(bP);
  const acc = { all: [0, 0, 0, 0], grey: [0, 0, 0, 0] };
  for (let i = 0; i < A.w * A.h; i++) {
    const a = lab(A.px[i * 3]!, A.px[i * 3 + 1]!, A.px[i * 3 + 2]!);
    const b = lab(B.px[i * 3]!, B.px[i * 3 + 1]!, B.px[i * 3 + 2]!);
    if (a[0] < 8) continue;
    const keys = Math.hypot(a[1], a[2]) < 10 ? ['all', 'grey'] : ['all'];
    for (const k of keys as ('all' | 'grey')[]) { const s = acc[k]; s[0]! += b[0] - a[0]; s[1]! += b[1] - a[1]; s[2]! += b[2] - a[2]; s[3]!++; }
  }
  const f = (s: number[]) => `ΔL ${(s[0]! / s[3]!).toFixed(1)}  Δa(red+) ${(s[1]! / s[3]!).toFixed(1)}  Δb(yellow+) ${(s[2]! / s[3]!).toFixed(1)}`;
  console.log(`${bP.split('/').pop()}\n   all:   ${f(acc.all)}\n   greys: ${f(acc.grey)}`);
}
