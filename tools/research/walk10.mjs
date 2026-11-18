import { readFileSync } from 'node:fs';
const [keysPath, dataPath, firstStr] = process.argv.slice(2);
const T = readFileSync(keysPath); const T1 = T.subarray(0, 512), T2 = T.subarray(512);
const P = 512 * 513;
const ks = new Uint8Array(P + 20000);
for (let k = 0; k < ks.length; k++) ks[k] = T1[k % 512] ^ T2[k % 513] ^ 0x37;
const d = readFileSync(dataPath);
const frac = (r, s, words) => { let ok = 0; for (let w = 0; w < words; w++) if (((d[r + w * 4 + 3] ^ ks[s + w * 4 + 3]) & 0xc0) === 0) ok++; return ok / words; };
let r = Number(firstStr);
const blocks = [];
while (r + 64 <= d.length) {
  const W = Math.min(32, Math.floor((d.length - r) / 4));
  let best = [-1, 0];
  for (let s = 0; s < P; s++) { const f = frac(r, s, W); if (f > best[1]) best = [s, f]; }
  if (best[1] < 0.9) { console.log(`@${r}: no packed10 start found (best ${best[1].toFixed(2)})`); r += 4; if (blocks.length && r - blocks.at(-1).end > 64) break; continue; }
  const s = best[0];
  let end = r;
  while (end + 64 <= d.length && frac(end, s + (end - r), 16) >= 0.75) end += 64;
  // refine end to 4-byte granularity
  while (end + 4 <= d.length && ((d[end + 3] ^ ks[s + (end - r) + 3]) & 0xc0) === 0) end += 4;
  blocks.push({ start: r, end, s });
  console.log(`block @${r}..${end} (${end - r} B, ${(end - r) / 4} words) keystream start ${s} (mod512 ${s % 512}, mod513 ${s % 513}); start-offset delta ${s - r}`);
  r = end;
}
