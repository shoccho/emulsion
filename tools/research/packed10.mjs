import { readFileSync } from 'node:fs';
const [keysPath, dataPath, rStr, nStr] = process.argv.slice(2);
const T = readFileSync(keysPath); const T1 = T.subarray(0, 512), T2 = T.subarray(512);
const P = 512 * 513;
const ks = new Uint8Array(P + 20000);
for (let k = 0; k < ks.length; k++) ks[k] = T1[k % 512] ^ T2[k % 513] ^ 0x37;
const d = readFileSync(dataPath);
const r = Number(rStr), words = Number(nStr);
// score: fraction of LE u32 words whose top 2 bits are zero (byte 3 & 0xC0 == 0)
const score = (s, align) => { let ok = 0; for (let w = 0; w < words; w++) { const i = r + align + w * 4 + 3; if (((d[i] ^ ks[s + align + w * 4 + 3]) & 0xc0) === 0) ok++; } return ok / words; };
let raw = 0; for (let w = 0; w < words; w++) if ((d[r + w * 4 + 3] & 0xc0) === 0) raw++;
console.log(`raw (no cipher) top2-zero fraction: ${(raw / words).toFixed(3)}`);
const best = [];
for (let s = 0; s < P; s++) for (const a of [0]) { const sc = score(s, a); if (sc > 0.6) best.push([s, sc]); }
best.sort((x, y) => y[1] - x[1]);
console.log('best keystream starts:', best.slice(0, 8).map(([s, sc]) => `${s} (mod512 ${s % 512}, mod513 ${s % 513}) ${sc.toFixed(3)}`).join('; '));
