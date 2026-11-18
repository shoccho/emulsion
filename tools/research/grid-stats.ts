import { readFileSync } from 'node:fs';
import { Keystream, decodeCarrier, readGrid } from '../../src/style/carrier-r100';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
for (const f of ['WW05_AUTUMN_HUES.slot3-D172.bin', 'WW01_NOSTALGIA.slot2-D171.bin']) {
  const g = readGrid(decodeCarrier(new Uint8Array(readFileSync('fixtures-private/eos-utility/' + f)), ks)).filter((w) => w.table === 0 && w.packed);
  const hist: Record<string, number> = {};
  for (const w of g) { const k = String(Math.floor(w.v[2] / 64) * 64); hist[k] = (hist[k] ?? 0) + 1; }
  const neg = g.filter((w) => w.v[2] < 0);
  console.log(f, 'Y histogram (bucket 64):', JSON.stringify(hist));
  console.log('  negative-Y nodes:', neg.length, 'samples', neg.slice(0, 8).map((w) => `#${w.index}:${w.v.join('/')}`).join(' '));
  const chroma = g.map((w) => Math.hypot(w.v[0], w.v[1]));
  console.log('  chroma max', Math.max(...chroma).toFixed(0), 'median', chroma.sort((a, b) => a - b)[chroma.length >> 1]!.toFixed(0));
}
