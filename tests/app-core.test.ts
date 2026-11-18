import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { CameraService, checkTarget, decodeBattery, describeSlot, targetFromBackup } from '../src/canon/camera-service';
import { FakeR100 } from '../src/canon/fake-r100';
import { Op, Prop } from '../src/canon/ops';
import { STYLE_LENGTH_R100, type SlotBackup } from '../src/canon/registration';
import { applyStateWords, decodeState, readWords } from '../src/canon/slot-state';
import { baseByKey, emptyStyle, parseCarrierHeader } from '../src/canon/styles';
import { ALL_BUILTIN_RECIPES, BUILTIN_RECIPES, FUJI_X_WEEKLY_RECIPES } from '../src/recipe/builtin';
import { deriveWords, planRecipe, suggestWbShift } from '../src/recipe/mapping';
import { newRecipe, parseRecipeFile, validateRecipe, type Recipe } from '../src/recipe/schema';
import { db } from '../src/store/db';
import { backupToFile, fromBase64, parseBackupFile, parseLookFile, lookToFile, toBase64 } from '../src/store/files';
import { BASE_LOOKS, FILM_LOOKS, carrierLook, findLook, type Look } from '../src/style/looks';

const sleep = async () => {};

/** Synthetic carrier with the observed header layout. */
function fakeCarrier(name = 'TEST LOOK', base = 0x84, sharp = 3): Uint8Array {
  const b = new Uint8Array(STYLE_LENGTH_R100);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, STYLE_LENGTH_R100, true);
  dv.setUint32(4, 1, true);
  dv.setUint16(8, STYLE_LENGTH_R100 - 8, true);
  b[10] = base;
  for (let i = 0; i < name.length; i++) b[12 + i] = name.charCodeAt(i);
  dv.setInt32(48, sharp, true);
  dv.setInt32(68, 4, true);
  dv.setInt32(72, 4, true);
  for (let i = 88; i < b.length; i++) b[i] = (i * 31) & 0xff;
  return b;
}

const ALL_BASE = [...BASE_LOOKS, ...FILM_LOOKS];
const look = (id: string): Look => findLook(ALL_BASE, id)!;

describe('recipe schema', () => {
  it('accepts every built-in recipe', () => {
    for (const r of ALL_BUILTIN_RECIPES) expect(validateRecipe(r)).toEqual({ ok: true, recipe: r });
  });

  it('built-in recipe ids are unique', () => {
    const ids = ALL_BUILTIN_RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('validates the source link', () => {
    const ok = validateRecipe({ schema: 1, id: 'a', name: 'A', look: 'canon:standard', source: 'https://example.com/r' });
    expect(ok.ok).toBe(true);
    const bad = validateRecipe({ schema: 1, id: 'a', name: 'A', look: 'canon:standard', source: 'javascript:alert(1)' });
    expect(bad.ok).toBe(false);
  });

  it('fills defaults for a minimal recipe', () => {
    const v = validateRecipe({ schema: 1, id: 'min', name: 'Min', look: 'canon:standard' });
    expect(v.ok && v.recipe.whiteBalance.mode).toBe('auto');
  });

  it('reports each invalid field readably', () => {
    const v = validateRecipe({
      schema: 1, id: 'Bad Id', name: '', look: 'canon:standard', highlight: 0.25, shadow: 9, color: 'x', colorChrome: 'max',
      whiteBalance: { mode: 'kelvin' }, canon: { contrast: 9, bogus: 1 },
    });
    expect(v.ok).toBe(false);
    const errs = !v.ok ? v.errors.join('\n') : '';
    for (const frag of ['"id"', '"name" is required', '"highlight" is 0.25', '"shadow" is 9', '"color" must be a number', '"colorChrome"', 'kelvin', '"canon.contrast" is 9', '"canon.bogus"']) {
      expect(errs).toContain(frag);
    }
  });

  it('rejects unknown schema versions and non-objects', () => {
    expect(validateRecipe({ schema: 2 })).toMatchObject({ ok: false });
    expect(validateRecipe([])).toMatchObject({ ok: false });
  });

  it('parses a file with one recipe, an array, or garbage', () => {
    expect(parseRecipeFile(JSON.stringify(BUILTIN_RECIPES[0])).recipes).toHaveLength(1);
    const many = parseRecipeFile(JSON.stringify([BUILTIN_RECIPES[0], { schema: 1, name: 'x' }]));
    expect(many.recipes).toHaveLength(1);
    expect(many.errors[0]).toContain('"x"');
    expect(parseRecipeFile('{').errors[0]).toMatch(/not valid JSON/);
  });
});

describe('recipe mapping', () => {
  const base: Recipe = newRecipe('t', 'T');

  it('defaults reproduce the base style defaults', () => {
    expect(deriveWords(base, look('canon:standard'))).toEqual({ base: 0x81, contrast: 0, sharpness: 4, saturation: 0, colorTone: 0, filter: 0, toning: 0, fineness: 2, threshold: 4 });
  });

  it('maps highlight/shadow to contrast, color to saturation, sharpness relative to base', () => {
    const w = deriveWords({ ...base, highlight: 1, shadow: 2, color: -2, sharpness: -1 }, look('canon:neutral'));
    expect(w).toMatchObject({ base: 0x84, contrast: 2, saturation: -2, sharpness: 0 });
    expect(deriveWords({ ...base, highlight: -0.5, shadow: -0.5 }, look('canon:standard')).contrast).toBe(-1);
    expect(deriveWords({ ...base, sharpness: 4 }, look('canon:landscape')).sharpness).toBe(7);
  });

  it('applies canon overrides over derived values', () => {
    const w = deriveWords({ ...base, highlight: 4, shadow: 4, canon: { contrast: -3, colorTone: 2, fineness: 5 } }, look('canon:standard'));
    expect(w).toMatchObject({ contrast: -3, colorTone: 2, fineness: 5 });
  });

  it('monochrome uses filter/toning and zeroes colour', () => {
    const w = deriveWords({ ...base, color: 3, monochrome: { filter: 'red', toning: 'sepia' } }, look('canon:monochrome'));
    expect(w).toMatchObject({ base: 0x86, saturation: 0, colorTone: 0, filter: 3, toning: 1 });
  });

  it('carrier looks use base "pc" and the carrier header sharpness', () => {
    const l = carrierLook('x', 'X', fakeCarrier('X', 0x84, 3), 'captured');
    const plan = planRecipe(base, l);
    expect(plan.target.words).toMatchObject({ base: 'pc', sharpness: 3, fineness: 4, threshold: 4 });
    expect(plan.target.style).toBe(l.carrier);
  });

  it('base looks write empty style data', () => {
    const plan = planRecipe(base, look('canon:faithful'));
    expect(plan.target.style).toEqual(emptyStyle());
  });

  it('lists unsupported and by-hand settings honestly', () => {
    const plan = planRecipe(BUILTIN_RECIPES.find((r) => r.id === 'muted-chrome')!, look('canon:neutral'));
    const np = plan.notPossible.map((l) => l.label);
    expect(np).toEqual(expect.arrayContaining(['Grain', 'Color Chrome Effect']));
    expect(plan.byHand.map((l) => l.label)).toEqual(expect.arrayContaining(['White balance', 'WB shift', 'High ISO noise reduction', 'Dynamic range']));
  });

  it('suggests a rough WB shift', () => {
    expect(suggestWbShift(2, -4)).toBe('A6, G1');
    expect(suggestWbShift(0, 0)).toBe('no shift');
  });

  it('Fuji X Weekly Classic Chrome recipes map to the Chrome-style base as expected', () => {
    const got = Object.fromEntries(
      FUJI_X_WEEKLY_RECIPES.map((r) => {
        const w = deriveWords(r, look(r.fallbackLook ?? r.look));
        return [r.id, [w.base, w.contrast, w.saturation, w.sharpness, w.fineness, w.threshold]];
      }),
    );
    expect(got).toEqual({
      'fxw-kodachrome-64': [0x84, 1, 0, 1, 2, 2],
      'fxw-reggies-portra': [0x84, 0, 0, 0, 2, 2],
      'fxw-kodak-gold-200': [0x84, 0, 1, 0, 2, 2],
      'fxw-kodak-portra-400-v2': [0x84, 0, 0, 0, 2, 2],
      'fxw-kodachrome-ii': [0x84, 3, -3, 1, 2, 2],
    });
    for (const r of FUJI_X_WEEKLY_RECIPES) {
      expect(r.author).toBe('Fuji X Weekly');
      expect(r.source).toMatch(/^https:\/\/fujixweekly\.com\//);
    }
  });

  it('film-style offsets do not apply to explicit Canon overrides', () => {
    const w = deriveWords({ ...base, color: 2, canon: { saturation: 3 } }, look('film:classic-chrome'));
    expect(w.saturation).toBe(3);
  });

  it('every built-in recipe on a base look plans a valid target', () => {
    for (const r of ALL_BUILTIN_RECIPES) {
      const l = findLook(ALL_BASE, r.look);
      if (!l) continue;
      expect(() => checkTarget(planRecipe(r, l).target)).not.toThrow();
    }
  });
});

describe('style data and slot state', () => {
  it('parses the carrier header', () => {
    expect(parseCarrierHeader(fakeCarrier('AUTUMN HUES', 0x81, 3))).toEqual({ valid: true, baseId: 0x81, name: 'AUTUMN HUES', sharpness: 3, fineness: 4, threshold: 4 });
    expect(parseCarrierHeader(emptyStyle()).valid).toBe(false);
  });

  it('parses the real captured carriers when present (local only)', () => {
    for (const [file, name, base] of [['autumn-hues.bin', 'AUTUMN HUES', 0x81], ['nostalgia.bin', 'NOSTALGIA', 0x84]] as const) {
      const p = `public/carriers/r100/${file}`;
      if (!existsSync(p)) continue;
      const h = parseCarrierHeader(new Uint8Array(readFileSync(p)));
      expect(h).toMatchObject({ valid: true, name, baseId: base });
    }
  });

  it('applyStateWords keeps words 0..1 and sets 0x40+slot for pc styles', () => {
    const live = new Uint8Array(new Int32Array([44, 1, 0x85, 0, 0, -4, -4, 0, 0, 2, 2]).buffer);
    const out = applyStateWords(live, { ...decodeState(live), base: 'pc', contrast: 2 }, 2);
    expect(readWords(out)).toEqual([44, 1, 0x42, 2, 0, -4, -4, 0, 0, 2, 2]);
    expect(() => applyStateWords(live, { ...decodeState(live), contrast: 9 }, 1)).toThrow(/contrast/);
  });

  it('checkTarget pairs style data with base correctly', () => {
    const words = decodeState(new Uint8Array(new Int32Array([44, 1, 0x81, 0, 4, 0, 0, 0, 0, 2, 4]).buffer));
    expect(() => checkTarget({ style: fakeCarrier(), words })).toThrow(/empty style/);
    expect(() => checkTarget({ style: emptyStyle(), words: { ...words, base: 'pc' } })).toThrow(/needs style data/);
    expect(() => checkTarget({ style: emptyStyle(), words: { ...words, base: 0x99 } })).toThrow(/unknown base/);
  });

  it('decodes battery levels (libgphoto2 table)', () => {
    const v = (n: number) => Uint8Array.of(n, 0, 0, 0);
    expect(decodeBattery(v(2))).toMatchObject({ label: '100%', okToWrite: true });
    expect(decodeBattery(v(0))).toMatchObject({ label: 'Low', okToWrite: false });
    expect(decodeBattery(undefined).okToWrite).toBe(true);
  });
});

describe('camera service against the fake R100', () => {
  const service = (fake = new FakeR100()) => ({ fake, svc: new CameraService(fake.transport, 'demo', { sleep, pollIntervalMs: 0 }) });

  it('reads a snapshot and leaves no session open', async () => {
    const { fake, svc } = service();
    const snap = await svc.readSnapshot();
    expect(snap.info.model).toBe('Canon EOS R100');
    expect(snap.slots.map((s) => s.label)).toEqual(['Faithful', 'Auto', 'Auto']);
    expect(snap.battery.label).toBe('100%');
    expect(fake.sessionOpen).toBe(false);
    expect(fake.transport.closed).toBe(true);
  });

  it('writes a base-style recipe, verifies, and backs up first', async () => {
    const { fake, svc } = service();
    const plan = planRecipe(BUILTIN_RECIPES.find((r) => r.id === 'deep-saturation')!, look('canon:landscape'));
    const backups: SlotBackup[] = [];
    const { result, snapshot } = await svc.writeTarget(2, plan.target, async (b) => void backups.push(b));
    expect(result.verified).toBe(true);
    expect(backups).toHaveLength(1);
    expect(backups[0]!.state).toEqual(new Uint8Array(new Int32Array([44, 1, 0x87, 0, 4, 0, 0, 0, 0, 2, 4]).buffer));
    expect(snapshot.slots[1]!.label).toBe('Landscape');
    expect(readWords(fake.props.get(Prop.PictureStyleExUserSet2)!)).toEqual([44, 1, 0x83, 1, 5, 3, 0, 0, 0, 2, 4]);
    expect(fake.uiLocked).toBe(false);
  });

  it('writes a carrier look and the slot reports it by name', async () => {
    const { svc } = service();
    const l = carrierLook('x', 'X', fakeCarrier('MY LOOK'), 'captured');
    const { result, snapshot } = await svc.writeTarget(3, planRecipe(newRecipe('a', 'A'), l).target, async () => {});
    expect(result.verified).toBe(true);
    expect(snapshot.slots[2]).toMatchObject({ kind: 'pc', label: 'MY LOOK' });
  });

  it('restores a backup into another slot', async () => {
    const { svc } = service();
    const l = carrierLook('x', 'X', fakeCarrier('MOVE ME'), 'captured');
    await svc.writeTarget(1, planRecipe(newRecipe('a', 'A'), l).target, async () => {});
    const b = await svc.backupSlot(1);
    const { snapshot } = await svc.writeTarget(3, targetFromBackup(b), async () => {});
    expect(snapshot.slots[2]).toMatchObject({ kind: 'pc', label: 'MOVE ME' });
    expect(readWords(snapshot.slots[2]!.state)[2]).toBe(0x43);
  });

  it('refuses to write on low battery without touching the camera', async () => {
    const { fake, svc } = service(new FakeR100({ battery: 0 }));
    await expect(svc.writeTarget(1, planRecipe(newRecipe('a', 'A'), look('canon:standard')).target, async () => {})).rejects.toThrow(/battery/);
    expect(fake.transport.calls.some((c) => c.code === Op.SetDevicePropValueEx)).toBe(false);
    expect(fake.sessionOpen).toBe(false);
  });

  it('refuses other models', async () => {
    const { fake, svc } = service(new FakeR100({ model: 'Canon EOS RP' }));
    await expect(svc.writeTarget(1, planRecipe(newRecipe('a', 'A'), look('canon:standard')).target, async () => {})).rejects.toMatchObject({ stage: 'preflight' });
    expect(fake.transport.calls.some((c) => c.code === Op.SetDevicePropValueEx)).toBe(false);
  });

  it('reports a rejected write by stage and still unlocks and closes', async () => {
    const { fake, svc } = service(new FakeR100({ rejectWriteOf: Prop.PictureStyleExUserSet1 }));
    await expect(svc.writeTarget(1, planRecipe(newRecipe('a', 'A'), look('canon:standard')).target, async () => {})).rejects.toMatchObject({ stage: 'state' });
    expect(fake.uiLocked).toBe(false);
    expect(fake.sessionOpen).toBe(false);
  });

  it('serializes overlapping operations', async () => {
    const { svc } = service(new FakeR100({ latencyMs: 2 }));
    const [a, b] = await Promise.all([svc.readSnapshot(), svc.readSnapshot()]);
    expect(a.slots).toHaveLength(3);
    expect(b.slots).toHaveLength(3);
  });

  it('describeSlot labels unknown bases', () => {
    const st = new Uint8Array(new Int32Array([44, 1, 0x99, 0, 0, 0, 0, 0, 0, 2, 2]).buffer);
    expect(describeSlot(1, emptyStyle(), st).label).toMatch(/Unknown/);
  });
});

describe('files and storage', () => {
  it('base64 round-trips', () => {
    const b = fakeCarrier();
    expect(fromBase64(toBase64(b))).toEqual(b);
  });

  it('backup file round-trips and rejects bad files', () => {
    const state = new Uint8Array(new Int32Array([44, 1, 0x81, 0, 4, 0, 0, 0, 0, 2, 4]).buffer);
    const stored = { id: 'x', slot: 2 as const, model: 'Canon EOS R100', firmware: '1', takenAt: '2026-01-01T00:00:00.000Z', reason: 'r', label: 'Standard', style: emptyStyle(), state };
    const back = parseBackupFile(JSON.stringify(backupToFile(stored)));
    expect(back.style).toEqual(stored.style);
    expect(back.state).toEqual(stored.state);
    expect(back.slot).toBe(2);
    expect(() => parseBackupFile('{"kind":"other"}')).toThrow(/not a Recipe Loader/);
    expect(() => parseBackupFile(JSON.stringify({ ...backupToFile(stored), style: toBase64(new Uint8Array(10)) }))).toThrow(/wrong size/);
  });

  it('look file round-trips', () => {
    const c = fakeCarrier('SHARE ME');
    const back = parseLookFile(JSON.stringify(lookToFile({ name: 'Share', carrier: c })));
    expect(back).toEqual({ name: 'Share', carrier: c });
  });

  it('IndexedDB stores recipes, looks and backups with bytes intact', async () => {
    const r = { ...newRecipe('stored-one', 'Stored') };
    await db.putRecipe(r);
    expect(await db.listRecipes()).toContainEqual(r);
    const c = fakeCarrier();
    await db.putLook({ id: 'l1', name: 'L', carrier: c, source: 'captured', addedAt: 'now' });
    expect((await db.listLooks())[0]!.carrier).toEqual(c);
    await db.deleteRecipe('stored-one');
    expect(await db.listRecipes()).toEqual([]);
  });

  it('base styles table covers the R100 presets', () => {
    expect(baseByKey('finedetail').id).toBe(0x88);
  });
});
