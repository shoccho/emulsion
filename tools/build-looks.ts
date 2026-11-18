// Builds the ready-made looks that ship with the site (option A): the editable Canon bases and every preset,
// as finished, encoded R100 style data. Runs locally with the private keys; writes no key material.
//
//   npm run build:looks
//
// Inputs (private, gitignored): fixtures-private/keys/canon-tables.bin, public/carriers/r100/autumn-hues.bin
// (source of the fitted colour table), public/carriers/r100/base-standard.bin (plain base: tables 2 and 4).
// Output (shipped): public/looks/r100/*.bin + index.json.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Keystream, decodeCarrier, encodeCarrier } from '../src/style/carrier-r100';
import { editableBases } from '../src/style/editable-bases';
import { buildLookCarrier } from '../src/style/look-builder';
import { LOOK_PRESETS } from '../src/style/look-presets';
import { shippablePlain } from '../src/style/shippable';
import { parseCarrierHeader } from '../src/canon/styles';

const OUT = 'public/looks/r100';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
const autumn = new Uint8Array(readFileSync('public/carriers/r100/autumn-hues.bin'));
const plainStd = decodeCarrier(new Uint8Array(readFileSync('public/carriers/r100/base-standard.bin')), ks);

interface Entry {
  id: string;
  name: string;
  file: string;
  description: string;
}
const entries: Entry[] = [];
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function emit(id: string, appName: string, description: string, carrier: Uint8Array): Uint8Array {
  const plain = decodeCarrier(carrier, ks);
  const cameraName = parseCarrierHeader(carrier).name;
  const shipped = encodeCarrier(shippablePlain(plain, plainStd, cameraName), ks);
  const file = `${id.replace(/[^a-z0-9]+/gi, '-')}.bin`;
  writeFileSync(join(OUT, file), shipped);
  entries.push({ id, name: appName, file, description });
  return shipped;
}

let standard: Uint8Array | null = null;
for (const b of editableBases(autumn, ks)) {
  const shipped = emit(b.id, b.name, b.description, b.carrier);
  if (b.id === 'base:standard') standard = shipped;
}
if (!standard) throw new Error('no Standard base built');
for (const p of LOOK_PRESETS) {
  emit(`gen:${p.id}`, p.name, `${p.description} Built on Canon Standard (editable).`, buildLookCarrier(standard, p.params, p.name, ks));
}
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(entries, null, 2)}\n`);
console.log(`wrote ${entries.length} looks to ${OUT}`);
