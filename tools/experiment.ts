// Photo experiments to learn the meaning of the R100 colour grid (research; needs owner approval for writes).
//
//   npm run exp -- shoot <label>          take a photo with the current settings and download it
//   npm run exp -- base <standard|...>    put a Canon base style in the test slot, select it, shoot
//   npm run exp -- variant <name>         put a modified Autumn Hues grid in the test slot, select it, shoot
//   npm run exp -- list                   list variants
//   npm run exp -- shipped <look id>      put a ready-made look from public/looks/r100 in the test slot, select it, shoot
//
// Test slot: User Def. 2 (backed up before every write). Photos: fixtures-private/exp/NN-<label>.jpg

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WebUSB } from 'usb';
import { WebUsbTransport } from '../src/ptp/webusb-transport';
import { CameraService, type SlotTarget } from '../src/canon/camera-service';
import { captureJpeg, selectPictureStyle } from '../src/canon/capture';
import { R100_USB } from '../src/canon/ops';
import type { Slot } from '../src/canon/registration';
import { decodeState } from '../src/canon/slot-state';
import { BASE_STYLES, emptyStyle, parseCarrierHeader } from '../src/canon/styles';
import { Keystream, decodeCarrier, encodeCarrier, mapGrid, type GridWord } from '../src/style/carrier-r100';
import { buildLookCarrier, withBaseHeader } from '../src/style/look-builder';
import type { LookParams } from '../src/style/look-engine';
import { presetById } from '../src/style/look-presets';

const SLOT: Slot = 2;
const EXP = 'fixtures-private/exp';
const keys = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
const baseCarrier = new Uint8Array(readFileSync('fixtures-private/eos-utility/WW05_AUTUMN_HUES.slot3-D172.bin'));
const baseState = new Uint8Array(readFileSync('fixtures-private/eos-utility/WW05_AUTUMN_HUES.slot3-D165-state.bin'));

const clamp = (v: number) => Math.max(-512, Math.min(511, Math.round(v)));
type V = [number, number, number];
const VARIANTS: Record<string, (w: GridWord) => V | null> = {
  orig: () => null,
  'chroma-half': (w) => [clamp(w.v[0] * 0.5), clamp(w.v[1] * 0.5), w.v[2]],
  'f0+60': (w) => [clamp(w.v[0] + 60), w.v[1], w.v[2]],
  'f1+60': (w) => [w.v[0], clamp(w.v[1] + 60), w.v[2]],
  'f2+60': (w) => [w.v[0], w.v[1], clamp(w.v[2] + 60)],
  'swap01': (w) => [w.v[1], w.v[0], w.v[2]],
  'tables13-chroma0': (w) => (w.table === 0 || w.table === 2 ? [0, 0, w.v[2]] : null),
  'tables24-chroma0': (w) => (w.table === 1 || w.table === 3 ? [0, 0, w.v[2]] : null),
  'table1-chroma0': (w) => (w.table === 0 ? [0, 0, w.v[2]] : null),
  'table3-chroma0': (w) => (w.table === 2 ? [0, 0, w.v[2]] : null),
};

function nextName(label: string): string {
  mkdirSync(EXP, { recursive: true });
  const n = readdirSync(EXP).filter((f) => f.endsWith('.jpg')).length + 1;
  return join(EXP, `${String(n).padStart(2, '0')}-${label}.jpg`);
}

async function service(): Promise<CameraService> {
  const device = (await new WebUSB({ allowAllDevices: true }).getDevices()).find((d) => d.vendorId === R100_USB.vendorId && d.productId === R100_USB.productId);
  if (!device) throw new Error('No EOS R100 found');
  return new CameraService(new WebUsbTransport(device), 'usb');
}

async function writeAndShoot(svc: CameraService, target: SlotTarget, label: string): Promise<void> {
  const { result } = await svc.writeTarget(SLOT, target, async (b) => {
    mkdirSync(join(EXP, 'backups'), { recursive: true });
    writeFileSync(join(EXP, 'backups', `${b.takenAt.replace(/[:.]/g, '-')}-slot${b.slot}-style.bin`), b.style);
    writeFileSync(join(EXP, 'backups', `${b.takenAt.replace(/[:.]/g, '-')}-slot${b.slot}-state.bin`), b.state);
  });
  console.log(`wrote User Def. ${SLOT}: ${result.verified ? 'verified' : 'NOT VERIFIED'}`);
  if (!result.verified) throw new Error('write not verified; stopping');
  await shoot(svc, label);
}

async function shoot(svc: CameraService, label: string): Promise<void> {
  const file = await svc.withSession(async (s) => {
    await selectPictureStyle(s, 0x20 + SLOT);
    return captureJpeg(s);
  });
  const out = nextName(label);
  writeFileSync(out, file.bytes);
  console.log(`photo saved: ${out} (${(file.bytes.length / 1e6).toFixed(1)} MB)`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'list') {
  console.log(Object.keys(VARIANTS).join('\n'));
} else if (cmd === 'shoot') {
  const svc = await service();
  const file = await svc.withSession((s) => captureJpeg(s));
  const out = nextName(arg ?? 'shot');
  writeFileSync(out, file.bytes);
  console.log(`photo saved: ${out}`);
} else if (cmd === 'base') {
  const b = BASE_STYLES.find((x) => x.key === arg);
  if (!b) throw new Error(`unknown base; one of ${BASE_STYLES.map((x) => x.key).join(', ')}`);
  const words = { ...decodeState(baseState), base: b.id, sharpness: b.sharpness, fineness: b.fineness, threshold: b.threshold };
  await writeAndShoot(await service(), { style: emptyStyle(), words }, `base-${b.key}`);
} else if (cmd === 'variant') {
  const fn = VARIANTS[arg ?? ''];
  if (!fn) throw new Error(`unknown variant; one of ${Object.keys(VARIANTS).join(', ')}`);
  const plain = decodeCarrier(baseCarrier, keys);
  const carrier = encodeCarrier(mapGrid(plain, fn), keys);
  if (arg === 'orig' && !carrier.every((x, i) => x === baseCarrier[i])) throw new Error('re-encoding the original does not reproduce it; aborting');
  await writeAndShoot(await service(), { style: carrier, words: decodeState(baseState) }, `var-${arg}`);
} else if (cmd === 'identity') {
  // Autumn Hues table corrected toward plain Standard (fitted from photos), with the chosen base id in the header.
  const b = BASE_STYLES.find((x) => x.key === (arg ?? 'standard'));
  if (!b) throw new Error('unknown base');
  // Apply each fitted correction in turn (pass 1, then pass 2 if present).
  let carrier0: Uint8Array = baseCarrier;
  for (const f of ['fixtures-private/identity-params.json', 'fixtures-private/identity-params-2.json', `fixtures-private/identity-params-${b.key}.json`, `fixtures-private/identity-params-${b.key}-2.json`]) {
    try {
      carrier0 = buildLookCarrier(carrier0, JSON.parse(readFileSync(f, 'utf8')) as LookParams, `IDENTITY ${b.name}`, keys);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  const built = decodeCarrier(carrier0, keys);
  const carrier = encodeCarrier(withBaseHeader(built, b.id, b.sharpness, b.fineness, b.threshold), keys);
  const words = { ...decodeState(baseState), base: 'pc' as const, sharpness: b.sharpness, fineness: b.fineness, threshold: b.threshold };
  await writeAndShoot(await service(), { style: carrier, words }, `identity-${b.key}`);
} else if (cmd === 'look') {
  const preset = presetById(arg ?? '');
  if (!preset) throw new Error('unknown preset id');
  const carrier = buildLookCarrier(baseCarrier, preset.params, preset.name, keys);
  await writeAndShoot(await service(), { style: carrier, words: decodeState(baseState) }, `look-${preset.id}`);
} else if (cmd === 'shipped') {
  // Exactly the bytes the site ships, written the way the app writes a carrier look (state from its header).
  const index = JSON.parse(readFileSync('public/looks/r100/index.json', 'utf8')) as { id: string; file: string }[];
  const e = index.find((x) => x.id === arg);
  if (!e) throw new Error(`unknown look; one of ${index.map((x) => x.id).join(', ')}`);
  const carrier = new Uint8Array(readFileSync(join('public/looks/r100', e.file)));
  const h = parseCarrierHeader(carrier);
  const words = { ...decodeState(baseState), base: 'pc' as const, sharpness: h.sharpness, fineness: h.fineness, threshold: h.threshold };
  await writeAndShoot(await service(), { style: carrier, words }, `shipped-${e.id.replace(/[^a-z0-9]+/gi, '-')}`);
} else {
  console.error('usage: npm run exp -- list | shoot <label> | base <key> | variant <name> | look <preset>');
  process.exit(2);
}
