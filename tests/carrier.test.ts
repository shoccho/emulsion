import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { Keystream, decodeCarrier, encodeCarrier, mapGrid, packWord, readGrid } from '../src/style/carrier-r100';
import { STYLE_LENGTH_R100 } from '../src/canon/registration';

// Synthetic key tables (NOT Canon's): exercise the mechanics only.
const fakeKeys = new Uint8Array(1025).map((_, i) => (i * 73 + 11) & 0xff);

describe('carrier codec (synthetic keys)', () => {
  it('xor round-trips and leaves the plain header alone', () => {
    const ks = new Keystream(fakeKeys);
    const c = new Uint8Array(STYLE_LENGTH_R100).map((_, i) => (i * 7) & 0xff);
    const d = decodeCarrier(c, ks);
    expect(d.slice(0, 88)).toEqual(c.slice(0, 88));
    expect(encodeCarrier(d, ks)).toEqual(c);
  });

  it('packs signed 10-bit triples with the top bits clear and reads them back', () => {
    const w = packWord([-512, 511, -1]);
    expect(w >>> 30).toBe(0);
    const plain = new Uint8Array(STYLE_LENGTH_R100);
    const edited = mapGrid(plain, (g) => (g.table === 1 && g.index === 3 ? [-5, 7, 300] : null));
    const hit = readGrid(edited).find((g) => g.table === 1 && g.index === 3)!;
    expect(hit.v).toEqual([-5, 7, 300]);
    expect(() => packWord([600, 0, 0])).toThrow();
  });

  it('never modifies words in the other encoding', () => {
    const plain = new Uint8Array(STYLE_LENGTH_R100);
    new DataView(plain.buffer).setUint32(352, 0xc0000001, true);
    const edited = mapGrid(plain, () => [1, 2, 3]);
    expect(new DataView(edited.buffer).getUint32(352, true)).toBe(0xc0000001);
  });
});

// Local only: real keys and real carriers live in gitignored fixtures-private/.
const KEYS = 'fixtures-private/keys/canon-tables.bin';
const AH = 'fixtures-private/eos-utility/WW05_AUTUMN_HUES.slot3-D172.bin';
describe.runIf(existsSync(KEYS) && existsSync(AH))('real R100 carrier (local fixtures)', () => {
  it('decodes to the known structure and re-encodes byte-exactly', () => {
    const ks = new Keystream(new Uint8Array(readFileSync(KEYS)));
    const c = new Uint8Array(readFileSync(AH));
    const d = decodeCarrier(c, ks);
    expect(new TextDecoder().decode(d.slice(96, 106))).toBe('Canon INC.');
    const grid = readGrid(d);
    // With correctly read keys only 3 words are not in the packed colour format (the old, misaligned keys showed 115).
    expect(grid.filter((g) => !g.packed)).toHaveLength(3);
    expect(encodeCarrier(mapGrid(d, (g) => [...g.v] as [number, number, number]), ks)).toEqual(c);
  });
});
