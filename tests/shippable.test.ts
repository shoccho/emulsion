import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STYLE_LENGTH_R100 } from '../src/canon/registration';
import { Keystream, R100_BLOCKS, decodeCarrier, encodeCarrier, readGrid } from '../src/style/carrier-r100';
import { EDITABLE_BASE_KEYS, editableBases } from '../src/style/editable-bases';
import { SPECIAL_INDICES, buildLookCarrier } from '../src/style/look-builder';
import { LOOK_PRESETS } from '../src/style/look-presets';
import { SHIP_COPYRIGHT, nameRecords, shippablePlain } from '../src/style/shippable';

const fill = (v: number) => new Uint8Array(STYLE_LENGTH_R100).fill(v);
const [REC, T1, T2, T3, T4] = R100_BLOCKS as unknown as [typeof R100_BLOCKS[0], typeof R100_BLOCKS[0], typeof R100_BLOCKS[0], typeof R100_BLOCKS[0], typeof R100_BLOCKS[0]];

describe('shippable style data', () => {
  it('keeps our header and tables 1 and 3, takes tables 2 and 4 from the plain base, and rewrites the name records', () => {
    const out = shippablePlain(fill(0xaa), fill(0x55), 'My Look');
    expect(out.subarray(0, REC.start).every((b) => b === 0xaa)).toBe(true);
    for (const t of [T1, T3]) expect(out.subarray(t.start, t.end).every((b) => b === 0xaa)).toBe(true);
    for (const t of [T2, T4]) expect(out.subarray(t.start, t.end).every((b) => b === 0x55)).toBe(true);
    expect(out.subarray(REC.start, REC.end)).toEqual(nameRecords('My Look'));
  });

  it('writes copyright and name records, then the end record, and zero-fills the rest', () => {
    const r = nameRecords('Golden 200');
    const dv = new DataView(r.buffer);
    expect(dv.getUint16(0, true)).toBe(0x100a);
    const cl = dv.getUint32(4, true);
    expect(new TextDecoder().decode(r.subarray(8, 8 + cl - 1))).toBe(SHIP_COPYRIGHT);
    const p = 8 + cl;
    expect(dv.getUint16(p, true)).toBe(0x100d);
    const nl = dv.getUint32(p + 4, true);
    expect(new TextDecoder().decode(r.subarray(p + 8, p + 8 + nl - 1))).toBe('GOLDEN 200');
    expect(dv.getUint16(p + 8 + nl, true)).toBe(0xffff);
    expect(r.subarray(p + 16 + nl).every((b) => b === 0)).toBe(true);
  });
});

// The index must list every preset and editable base, so the site never needs keys for them.
describe.runIf(existsSync('public/looks/r100/index.json'))('ready-made looks folder', () => {
  const index = JSON.parse(readFileSync('public/looks/r100/index.json', 'utf8')) as { id: string; file: string }[];
  it('lists every preset and every editable base, and each file has the R100 size', () => {
    const ids = new Set(index.map((e) => e.id));
    for (const p of LOOK_PRESETS) expect(ids.has(`gen:${p.id}`)).toBe(true);
    for (const k of EDITABLE_BASE_KEYS) expect(ids.has(`base:${k}`)).toBe(true);
    for (const e of index) expect(readFileSync(`public/looks/r100/${e.file}`)).toHaveLength(STYLE_LENGTH_R100);
  });
});

// Local only: needs the private keys and Canon style files.
const KEYS = 'fixtures-private/keys/canon-tables.bin';
const AH = 'public/carriers/r100/autumn-hues.bin';
const STD = 'public/carriers/r100/base-standard.bin';
describe.runIf(existsSync(KEYS) && existsSync(AH) && existsSync(STD) && existsSync('public/looks/r100/index.json'))('ready-made looks vs sources (local only)', () => {
  // Read lazily: describe bodies run during collection even when the block is skipped.
  let cache: { ks: Keystream; ah: Uint8Array; std: Uint8Array; index: { id: string; file: string }[] } | null = null;
  const load = () =>
    (cache ??= (() => {
      const ks = new Keystream(new Uint8Array(readFileSync(KEYS)));
      return {
        ks,
        ah: decodeCarrier(new Uint8Array(readFileSync(AH)), ks),
        std: decodeCarrier(new Uint8Array(readFileSync(STD)), ks),
        index: JSON.parse(readFileSync('public/looks/r100/index.json', 'utf8')) as { id: string; file: string }[],
      };
    })());
  const shipped = (id: string) => {
    const { ks, index } = load();
    return decodeCarrier(new Uint8Array(readFileSync(`public/looks/r100/${index.find((e) => e.id === id)!.file}`)), ks);
  };

  it('contain nothing of Autumn Hues outside tables 1 and 3 (whose colours we generated)', () => {
    const { ah, std, index } = load();
    const text = (b: Uint8Array) => Buffer.from(b).toString('latin1');
    for (const e of index) {
      const d = shipped(e.id);
      for (const t of [T2, T4]) expect(d.subarray(t.start, t.end)).toEqual(std.subarray(t.start, t.end));
      expect(text(d)).not.toContain('AUTUMN');
      expect(text(d)).not.toContain('Canon INC.');
      // Every real colour in tables 1 and 3 is ours: the only words still equal to Autumn Hues are black (0/0/0),
      // nodes clamped at the minimum (0/0/-512), the trailer, and the odd coincidence.
      const ahGrid = readGrid(ah);
      const same = readGrid(d).filter(
        (w, i) =>
          (w.table === 0 || w.table === 2) &&
          !SPECIAL_INDICES.has(w.index) &&
          w.v.join() === ahGrid[i]!.v.join() &&
          w.v.join() !== '0,0,0' &&
          w.v.join() !== '0,0,-512',
      );
      expect(same.length).toBeLessThan(8);
    }
  });

  it('are up to date with the presets and identity corrections (run npm run build:looks if this fails)', () => {
    const { ks } = load();
    const bases = editableBases(new Uint8Array(readFileSync(AH)), ks);
    const tables = (d: Uint8Array) => [d.subarray(T1.start, T1.end), d.subarray(T3.start, T3.end), d.subarray(0, REC.start)];
    for (const b of bases) expect(tables(shipped(b.id))).toEqual(tables(decodeCarrier(b.carrier, ks)));
    const stdShipped = encodeCarrier(shipped('base:standard'), ks);
    for (const p of LOOK_PRESETS) expect(tables(shipped(`gen:${p.id}`))).toEqual(tables(decodeCarrier(buildLookCarrier(stdShipped, p.params, p.name, ks), ks)));
  });
});
