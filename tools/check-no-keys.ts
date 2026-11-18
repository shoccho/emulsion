// Fails if any part of Canon's key tables is present in a folder (the built site, by default).
//
//   npx tsx tools/check-no-keys.ts [dir ...]      (runs automatically after `npm run build`)
//
// With the private keys present (local), it looks for every 16-byte run of Key1/Key2, in both the Canon
// layout and the app layout, as raw bytes, hex and base64. Without them (a clean checkout), it falls back to
// the embedded fingerprint search for the whole block.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findKeysInFile } from '../src/style/keys';

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['dist'];
const KEYS = 'fixtures-private/keys/canon-tables.bin';
const WINDOW = 16;

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** Canon layout back from the app layout: undo the rotate-left-by-12 of each array. */
function canonLayout(app: Uint8Array): Uint8Array {
  const out = new Uint8Array(1025);
  for (let i = 0; i < 512; i++) out[(i + 12) % 512] = app[i]!;
  for (let i = 0; i < 513; i++) out[512 + ((i + 12) % 513)] = app[512 + i]!;
  return out;
}

function needles(app: Uint8Array): Buffer[] {
  const out: Buffer[] = [];
  for (const block of [app, canonLayout(app)]) {
    for (const [s, e] of [[0, 512], [512, 1025]] as const) {
      const arr = Buffer.from(block.subarray(s, e));
      for (let i = 0; i + WINDOW <= arr.length; i += WINDOW / 2) {
        const w = arr.subarray(i, i + WINDOW);
        out.push(w, Buffer.from(w.toString('hex')), Buffer.from(w.toString('hex').toUpperCase()));
        // base64 of a run depends on its alignment; the middle of each encoding is stable for 3 alignments
        for (let a = 0; a < 3; a++) out.push(Buffer.from(w.subarray(a, a + 12).toString('base64')));
      }
    }
  }
  return out;
}

const all = dirs.flatMap(files);
let bad = 0;
// Canon's own style files (Autumn Hues etc.) must never be published either.
for (const f of all.filter((p) => /(^|\/)carriers\//.test(p))) {
  bad++;
  console.error(`CANON STYLE FILE in ${f} (public/carriers is local-only)`);
}
if (existsSync(KEYS)) {
  const list = needles(new Uint8Array(readFileSync(KEYS)));
  for (const f of all) {
    const data = readFileSync(f);
    const hit = list.find((n) => data.includes(n));
    if (hit) {
      bad++;
      console.error(`KEY MATERIAL FOUND in ${f}`);
    }
  }
  console.log(`check-no-keys: scanned ${all.length} files for ${list.length} key fragments: ${bad ? 'FAILED' : 'clean'}`);
} else {
  for (const f of all) {
    if (await findKeysInFile(new Uint8Array(readFileSync(f)))) {
      bad++;
      console.error(`KEY TABLES FOUND in ${f}`);
    }
  }
  console.log(`check-no-keys: scanned ${all.length} files (fingerprint only; private keys not present): ${bad ? 'FAILED' : 'clean'}`);
}
if (bad) process.exit(1);
