// R100 User Def. slot state (props D163..D165), 44 bytes = 11 little-endian int32 words.
// Layout confirmed in docs/M0-findings.md:
// [0] size 44, [1] 1, [2] base style (0x81..0x88 built-in; 0x40+slot = PC-registered style),
// [3] contrast, [4] sharpness strength, [5] saturation, [6] colour tone,
// [7] mono filter, [8] mono toning, [9] sharpness fineness, [10] sharpness threshold.

import type { Slot } from './registration';

export const W = {
  size: 0,
  valid: 1,
  base: 2,
  contrast: 3,
  sharpness: 4,
  saturation: 5,
  colorTone: 6,
  filter: 7,
  toning: 8,
  fineness: 9,
  threshold: 10,
} as const;

export const pcStyleBase = (slot: Slot): number => 0x40 + slot;
export const isPcBase = (base: number): boolean => base >= 0x41 && base <= 0x43;

/** The adjustable part of a slot state: words 2..10. `base: 'pc'` means "the style data in this slot". */
export interface StateWords {
  base: number | 'pc';
  contrast: number;
  sharpness: number;
  saturation: number;
  colorTone: number;
  filter: number;
  toning: number;
  fineness: number;
  threshold: number;
}

export const RANGES = {
  contrast: [-4, 4],
  sharpness: [0, 7],
  saturation: [-4, 4],
  colorTone: [-4, 4],
  filter: [0, 4],
  toning: [0, 4],
  fineness: [1, 5],
  threshold: [1, 5],
} as const;

export function readWords(state: Uint8Array): number[] {
  const dv = new DataView(state.buffer, state.byteOffset, state.byteLength);
  return Array.from({ length: Math.floor(state.length / 4) }, (_, i) => dv.getInt32(i * 4, true));
}

export function decodeState(state: Uint8Array): StateWords {
  const w = readWords(state);
  const base = w[W.base]!;
  return {
    base: isPcBase(base) ? 'pc' : base,
    contrast: w[W.contrast]!,
    sharpness: w[W.sharpness]!,
    saturation: w[W.saturation]!,
    colorTone: w[W.colorTone]!,
    filter: w[W.filter]!,
    toning: w[W.toning]!,
    fineness: w[W.fineness]!,
    threshold: w[W.threshold]!,
  };
}

export function isPcStyleState(state: Uint8Array, slot: Slot): boolean {
  return readWords(state)[W.base] === pcStyleBase(slot);
}

export function checkWords(words: StateWords): void {
  for (const [k, [lo, hi]] of Object.entries(RANGES) as [keyof typeof RANGES, readonly [number, number]][]) {
    const v = words[k];
    if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${k} = ${v} is outside ${lo}..${hi}`);
  }
}

/**
 * New state for `slot`: the slot's live bytes with words 2..10 replaced.
 * Words 0..1 always come from the live state read in this session.
 */
export function applyStateWords(live: Uint8Array, words: StateWords, slot: Slot): Uint8Array {
  if (live.length !== 44) throw new Error('slot state must be 44 bytes');
  checkWords(words);
  const out = live.slice();
  const dv = new DataView(out.buffer);
  const set = (i: number, v: number) => dv.setInt32(i * 4, v, true);
  set(W.base, words.base === 'pc' ? pcStyleBase(slot) : words.base);
  set(W.contrast, words.contrast);
  set(W.sharpness, words.sharpness);
  set(W.saturation, words.saturation);
  set(W.colorTone, words.colorTone);
  set(W.filter, words.filter);
  set(W.toning, words.toning);
  set(W.fineness, words.fineness);
  set(W.threshold, words.threshold);
  return out;
}

/**
 * State for a PC-registered style copied into `slot`: live bytes, base 0x40+slot,
 * words 3..10 taken from `source`.
 */
export function pcStyleState(live: Uint8Array, source: Uint8Array, slot: Slot): Uint8Array {
  if (live.length !== 44 || source.length !== 44) throw new Error('slot state must be 44 bytes');
  const out = live.slice();
  const dv = new DataView(out.buffer);
  dv.setInt32(W.base * 4, pcStyleBase(slot), true);
  out.set(source.slice(W.contrast * 4, 44), W.contrast * 4);
  return out;
}
