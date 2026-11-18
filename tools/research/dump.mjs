import { readFileSync } from 'node:fs';
const [keysPath, dataPath, from, to, delta] = process.argv.slice(2);
const T = readFileSync(keysPath); const T1 = T.subarray(0, 512), T2 = T.subarray(512);
const ks = (k) => T1[k % 512] ^ T2[k % 513] ^ 0x37;
const d = readFileSync(dataPath);
for (let r = Number(from); r < Number(to); r += 32) {
  const row = [];
  for (let i = r; i < r + 32; i++) row.push((d[i] ^ ks(i + Number(delta))).toString(16).padStart(2, '0'));
  console.log(String(r).padStart(5), row.join(' '));
}
