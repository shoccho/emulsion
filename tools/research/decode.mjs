import { readFileSync, writeFileSync } from 'node:fs';
const [keysPath, dataPath, outPath] = process.argv.slice(2);
const T = readFileSync(keysPath); const T1 = T.subarray(0, 512), T2 = T.subarray(512);
const ks = (k) => T1[k % 512] ^ T2[k % 513] ^ 0x37;
const d = readFileSync(dataPath);
const out = Buffer.from(d);
const blocks = [[88, 332, 8917], [332, 4448, 47325], [4448, 8544, 209211], [8544, 12640, 47345], [12640, 16720, 209211]];
for (const [a, b, s] of blocks) for (let i = a; i < b; i++) out[i] = d[i] ^ ks(s + (i - a));
writeFileSync(outPath, out);
const dv = new DataView(out.buffer, out.byteOffset);
let bad = 0, words = 0;
for (const [a, b] of blocks.slice(1)) for (let i = a; i < b; i += 4) { words++; if (dv.getUint32(i, true) >>> 30) bad++; }
console.log(`${dataPath.split('/').pop()}: packed words with top bits set: ${bad}/${words}`);
const tri = (i) => { const w = dv.getUint32(i, true); return [w & 1023, (w >>> 10) & 1023, (w >>> 20) & 1023]; };
console.log('  table1 header words:', [0, 1, 2, 3, 4].map((k) => dv.getUint32(332 + k * 4, true).toString(16)).join(' '));
for (const start of [352, 4448, 8544, 12640]) console.log(`  @${start} first 8 triples:`, Array.from({ length: 8 }, (_, k) => tri(start + k * 4).join('/')).join('  '));
