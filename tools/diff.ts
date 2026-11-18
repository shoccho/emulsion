// Compare two probe dumps property by property.
// Usage: npm run diff -- <dirA> <dirB>   (defaults to the two newest *-read dumps)

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEventBatch } from '../src/canon/events';
import { propName } from '../src/canon/ops';

async function latestProps(dir: string): Promise<Map<number, Uint8Array>> {
  const out = new Map<number, Uint8Array>();
  const files = (await readdir(dir)).filter((f) => f.startsWith('event-')).sort();
  for (const f of files) {
    for (const ev of parseEventBatch(new Uint8Array(await readFile(join(dir, f)))).events) {
      if (ev.kind === 'prop') out.set(ev.prop, ev.value);
    }
  }
  return out;
}

const root = 'fixtures-private';
let [a, b] = process.argv.slice(2);
if (!a || !b) {
  const reads = (await readdir(root)).filter((d) => d.endsWith('-read')).sort();
  if (reads.length < 2) throw new Error('need two *-read dumps in fixtures-private/');
  a = join(root, reads.at(-2)!);
  b = join(root, reads.at(-1)!);
}
console.log(`A = ${a}\nB = ${b}\n`);
const pa = await latestProps(a);
const pb = await latestProps(b);
const keys = [...new Set([...pa.keys(), ...pb.keys()])].sort((x, y) => x - y);
let changed = 0;
for (const k of keys) {
  const va = pa.get(k);
  const vb = pb.get(k);
  const name = `0x${k.toString(16).toUpperCase()} ${propName(k)}`;
  if (!va || !vb) {
    console.log(`${name}: only in ${va ? 'A' : 'B'}`);
    changed++;
    continue;
  }
  if (va.length === vb.length && va.every((x, i) => x === vb[i])) continue;
  changed++;
  if (va.length !== vb.length) {
    console.log(`${name}: length ${va.length} -> ${vb.length}`);
    continue;
  }
  const da = new DataView(va.buffer, va.byteOffset, va.byteLength);
  const db = new DataView(vb.buffer, vb.byteOffset, vb.byteLength);
  if (va.length <= 256 && va.length % 4 === 0) {
    const diffs: string[] = [];
    for (let i = 0; i < va.length; i += 4) {
      const x = da.getInt32(i, true);
      const y = db.getInt32(i, true);
      if (x !== y) diffs.push(`int32[${i / 4}] @${i}: ${x} -> ${y}`);
    }
    console.log(`${name}: ${diffs.join(', ')}`);
  } else {
    const idx: number[] = [];
    for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) idx.push(i);
    console.log(`${name}: ${idx.length} bytes differ, first at ${idx.slice(0, 12).join(',')}`);
  }
}
console.log(changed ? `\n${changed} properties changed` : 'no differences');
