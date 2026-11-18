import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { STYLE_LENGTH_R100 } from '../src/canon/registration';
import { parseCarrierHeader } from '../src/canon/styles';
import { Keystream, decodeCarrier, encodeCarrier, readGrid, packWord } from '../src/style/carrier-r100';
import { bandWeights, neutralParams, rgbToOklab, transformGridColour, transformRgb } from '../src/style/look-engine';
import { buildLookCarrier, SPECIAL_INDICES } from '../src/style/look-builder';
import { LOOK_PRESETS, presetById } from '../src/style/look-presets';
import { findKeysInFile, rollingHash, sha256Hex, toAppLayout } from '../src/style/keys';
import { ALL_BUILTIN_RECIPES } from '../src/recipe/builtin';
import { validateRecipe } from '../src/recipe/schema';
import { BASE_LOOKS, FILM_LOOKS, resolveLook } from '../src/style/looks';

const chroma = (rgb: [number, number, number]) => { const [, a, b] = rgbToOklab(...rgb); return Math.hypot(a, b); };

describe('look engine', () => {
  it('band weights sum to 1 at every hue', () => {
    for (let h = 0; h < 360; h += 7) expect(bandWeights(h).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('neutral params are an exact identity on grid values', () => {
    for (const v of [[0, 0, 256], [-410, -493, 66], [466, 506, 502], [-200, 150, 30]] as [number, number, number][]) {
      expect(transformGridColour(v, neutralParams())).toEqual(v);
    }
    expect(transformGridColour([10, 10, -5], neutralParams())).toEqual([10, 10, -5]); // negative-Y nodes are colours too
  });

  it('Chrome-style mutes greens and yellows more than reds', () => {
    const p = presetById('classic-chrome')!.params;
    const green: [number, number, number] = [0.25, 0.65, 0.2];
    const yellow: [number, number, number] = [0.85, 0.8, 0.2];
    const red: [number, number, number] = [0.8, 0.15, 0.15];
    const ratio = (c: [number, number, number]) => chroma(transformRgb(c, p)) / chroma(c);
    expect(ratio(green)).toBeLessThan(0.75);
    expect(ratio(yellow)).toBeLessThan(0.75);
    expect(ratio(red)).toBeGreaterThan(ratio(green));
  });

  it('greys get no hue edits from band controls', () => {
    const p = neutralParams();
    p.bands.green = { hue: 30, sat: 1, light: 0.2 };
    const out = transformRgb([0.5, 0.5, 0.5], p);
    expect(chroma(out)).toBeLessThan(0.01);
  });
});

describe('look builder (synthetic keys and grid)', () => {
  const ks = new Keystream(lcgKeys(3));
  function baseCarrier(): Uint8Array {
    const plain = new Uint8Array(STYLE_LENGTH_R100);
    const dv = new DataView(plain.buffer);
    dv.setUint32(0, STYLE_LENGTH_R100, true);
    dv.setUint32(4, 1, true);
    plain[10] = 0x81;
    // fill table words with plausible colours; one special word with top bits set
    for (let o = 352; o < STYLE_LENGTH_R100; o += 4) dv.setUint32(o, packWord([((o >> 2) % 300) - 150, ((o >> 3) % 300) - 150, (o >> 4) % 480]), true);
    dv.setUint32(352 + 64 * 4, 0xc1234567, true);
    return encodeCarrier(plain, ks);
  }

  it('neutral look reproduces the base except for the name', () => {
    const base = baseCarrier();
    const out = buildLookCarrier(base, neutralParams(), 'TEST', ks);
    const a = decodeCarrier(base, ks), b = decodeCarrier(out, ks);
    expect(parseCarrierHeader(out).name).toBe('TEST');
    expect(b.slice(48)).toEqual(a.slice(48));
  });

  it('a preset changes table 1 and 3 colours, never special words or tables 2/4', () => {
    const base = baseCarrier();
    const out = buildLookCarrier(base, presetById('velvia')!.params, 'VIVID', ks);
    const ga = readGrid(decodeCarrier(base, ks)), gb = readGrid(decodeCarrier(out, ks));
    const changed = (t: number) => ga.filter((w, i) => w.table === t && JSON.stringify(w.v) !== JSON.stringify(gb[i]!.v)).length;
    expect(changed(0)).toBeGreaterThan(100);
    expect(changed(2)).toBeGreaterThan(100);
    expect(changed(1)).toBe(0);
    expect(changed(3)).toBe(0);
    const special = (g: typeof ga) => g.filter((w) => w.table === 0 && SPECIAL_INDICES.has(w.index)).map((w) => w.v.join());
    expect(special(gb)).toEqual(special(ga));
  });

  it('every preset builds', () => {
    for (const p of LOOK_PRESETS) expect(buildLookCarrier(baseCarrier(), p.params, p.name, ks)).toHaveLength(STYLE_LENGTH_R100);
  });
});

describe('key finder', () => {
  it('finds a block by fingerprint anywhere in a file', async () => {
    const keyBlock = new Uint8Array(1025).map((_, i) => (i * 97 + 3) & 0xff);
    const file = new Uint8Array(50_000).map((_, i) => (i * 13) & 0xff);
    file.set(keyBlock, 31_337);
    const fp = { rolling: rollingHash(keyBlock), sha256: await sha256Hex(keyBlock) };
    expect(await findKeysInFile(file, fp)).toEqual(toAppLayout(keyBlock));
    expect(await findKeysInFile(file.slice(0, 31_000), fp)).toBeNull();
  });

  const CANON = '/Applications/Canon Utilities/EOS Utility/EU3/EOS Utility 3.app/Contents/PlugIns/EdsCFParse.bundle/Contents/MacOS/EdsCFParse';
  it('rotates both arrays left by 12, using only bytes from inside each array', () => {
    const raw = new Uint8Array(1025).map((_, i) => i & 0xff);
    const k = toAppLayout(raw);
    expect(k[0]).toBe(12);
    expect(k[511]).toBe(11); // wraps within Key1
    expect(k[512]).toBe((512 + 12) & 0xff);
    expect(k[1024]).toBe((512 + 11) & 0xff); // wraps within Key2
  });

  it.runIf(existsSync(CANON) && existsSync('fixtures-private/keys/canon-tables.bin'))('finds the real keys in the installed Canon plug-in (local only)', async () => {
    const k = await findKeysInFile(new Uint8Array(readFileSync(CANON)));
    expect(k).toEqual(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
  });

  it.runIf(existsSync('fixtures-private/keys/canon-tables.bin') && existsSync('public/carriers/r100/base-standard.bin'))(
    'a plain Canon base decodes to an all-zero colour table apart from the 4 trailer words (local only)',
    () => {
      const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
      const g = readGrid(decodeCarrier(new Uint8Array(readFileSync('public/carriers/r100/base-standard.bin')), ks));
      const nonzero = g.filter((w) => (w.table === 0 || w.table === 2) && w.v.some((x) => x !== 0)).map((w) => w.index);
      expect([...new Set(nonzero)].sort((a, b) => a - b)).toEqual([1020, 1021, 1022, 1023]);
    },
  );
});

describe('recipes with generated looks', () => {
  it('fall back to the film-style base when generated looks are unavailable', () => {
    const r = ALL_BUILTIN_RECIPES.find((x) => x.id === 'fxw-kodachrome-64')!;
    expect(r.look).toBe('gen:classic-chrome');
    expect(resolveLook([...BASE_LOOKS, ...FILM_LOOKS], r)?.id).toBe('film:classic-chrome');
    expect(validateRecipe(r).ok).toBe(true);
  });
});

import { plainBaseFromTemplate, readPf2, writePf2, Pf2Tag } from '../src/style/pf2';
/** Irregular synthetic key tables (a simple LCG; linear patterns make T1 and T2 cancel out). */
function lcgKeys(seed: number): Uint8Array {
  let x = seed >>> 0;
  return new Uint8Array(1025).map(() => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0), (x >>> 16) & 0xff));
}

describe('pf2 files (synthetic keys)', () => {
  const ks = new Keystream(lcgKeys(1));
  const template = {
    version: 0x2000,
    records: [
      { tag: Pf2Tag.Name, type: 2, value: new Uint8Array(32).fill(65) },
      { tag: Pf2Tag.BaseStyle, type: 3, value: Uint8Array.of(0, 0x81) },
      { tag: Pf2Tag.ColorDataA, type: 4, value: new Uint8Array(240).fill(7) },
      { tag: Pf2Tag.DisplayName, type: 2, value: Uint8Array.of(65, 0) },
      { tag: Pf2Tag.End, type: 0xffff, value: new Uint8Array(0) },
    ],
  };
  it('round-trips', () => {
    expect(readPf2(writePf2(template, ks), ks)).toEqual(template);
  });
  it('rejects a file read with the wrong keys', () => {
    const other = new Keystream(lcgKeys(2));
    expect(() => readPf2(writePf2(template, ks), other)).toThrow();
  });
  it('makes a plain base: new base id and name, colour blocks zeroed', () => {
    const p = plainBaseFromTemplate(template, 0x84, 'Base Neutral');
    expect(p.records.find((r) => r.tag === Pf2Tag.BaseStyle)!.value).toEqual(Uint8Array.of(0, 0x84));
    expect(p.records.find((r) => r.tag === Pf2Tag.ColorDataA)!.value.every((x) => x === 0)).toBe(true);
    expect(new TextDecoder().decode(p.records.find((r) => r.tag === Pf2Tag.DisplayName)!.value)).toBe('BASE NEUTRAL\0');
  });
});

import { hasColourTable } from '../src/style/look-builder';
describe('empty colour tables', () => {
  it('refuses to build on a base whose colour table is all zero', () => {
    const ks = new Keystream(lcgKeys(4));
    const plain = new Uint8Array(STYLE_LENGTH_R100);
    const dv = new DataView(plain.buffer);
    dv.setUint32(0, STYLE_LENGTH_R100, true);
    dv.setUint32(4, 1, true);
    expect(hasColourTable(plain)).toBe(false);
    expect(() => buildLookCarrier(encodeCarrier(plain, ks), presetById('velvia')!.params, 'X', ks)).toThrow(/no colour table/);
  });
});

import { editableBases, EDITABLE_BASE_KEYS } from '../src/style/editable-bases';
import { BASE_STYLES } from '../src/canon/styles';
describe('editable bases', () => {
  it('builds one base per Canon style with the right id and sharpness in the header', () => {
    const ks = new Keystream(lcgKeys(5));
    const plain = new Uint8Array(STYLE_LENGTH_R100);
    const dv = new DataView(plain.buffer);
    dv.setUint32(0, STYLE_LENGTH_R100, true);
    dv.setUint32(4, 1, true);
    plain[10] = 0x81;
    for (let o = 352; o < STYLE_LENGTH_R100; o += 4) dv.setUint32(o, packWord([((o >> 2) % 200) - 100, ((o >> 3) % 200) - 100, 40 + ((o >> 4) % 400)]), true);
    const looks = editableBases(encodeCarrier(plain, ks), ks);
    expect(looks.map((l) => l.id)).toEqual(EDITABLE_BASE_KEYS.map((k) => `base:${k}`));
    for (const l of looks) {
      const b = BASE_STYLES.find((x) => `base:${x.key}` === l.id)!;
      expect(l.header).toMatchObject({ valid: true, baseId: b.id, sharpness: b.sharpness, fineness: b.fineness, threshold: b.threshold });
    }
  });
});
