import { readFileSync } from 'node:fs';
import { Keystream, decodeCarrier, readGrid } from '../../src/style/carrier-r100';
import { parseCarrierHeader } from '../../src/canon/styles';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
const files = process.argv.slice(2);
const grids = files.map((f) => readGrid(decodeCarrier(new Uint8Array(readFileSync(f)), ks)));
const ref = grids[0]!;
for (let k = 0; k < files.length; k++) {
  const h = parseCarrierHeader(new Uint8Array(readFileSync(files[k]!)));
  const g = grids[k]!;
  const per = [0, 1, 2, 3].map((t) => {
    let diff = 0, sum = 0, n = 0;
    for (let i = 0; i < g.length; i++) if (g[i]!.table === t && g[i]!.packed) { n++; const d = Math.max(...g[i]!.v.map((x, j) => Math.abs(x - ref[i]!.v[j]!))); if (d) diff++; sum += d; }
    return `t${t + 1}: ${diff}/${n} differ, mean ${(sum / n).toFixed(1)}`;
  });
  const t1 = g.filter((w) => w.table === 0 && w.packed && w.v[2] >= 0);
  const chroma = t1.reduce((a, w) => a + Math.hypot(w.v[0], w.v[1]), 0) / t1.length;
  console.log(`${h.name.padEnd(14)} base 0x${h.baseId.toString(16)} sharp ${h.sharpness}/${h.fineness}/${h.threshold} | mean chroma t1 ${chroma.toFixed(0)} | vs ${files[0]!.split('/').pop()}: ${per.join('; ')}`);
}
