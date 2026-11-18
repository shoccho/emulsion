// Canon picture-style ids, per-base defaults, and the R100 style-data ("carrier") header.
// Ids: libgphoto2 config.c canon_eos_picturestyle. Defaults: R100 props D157..D15E (docs/M0-findings.md).

import { STYLE_LENGTH_R100 } from './registration';

export type BaseStyleKey = 'standard' | 'portrait' | 'landscape' | 'finedetail' | 'neutral' | 'faithful' | 'monochrome' | 'auto';

export interface BaseStyle {
  key: BaseStyleKey;
  id: number;
  name: string;
  /** Default sharpness strength / fineness / threshold for this base on the R100. */
  sharpness: number;
  fineness: number;
  threshold: number;
}

export const BASE_STYLES: readonly BaseStyle[] = [
  { key: 'auto', id: 0x87, name: 'Auto', sharpness: 4, fineness: 2, threshold: 4 },
  { key: 'standard', id: 0x81, name: 'Standard', sharpness: 4, fineness: 2, threshold: 4 },
  { key: 'portrait', id: 0x82, name: 'Portrait', sharpness: 3, fineness: 2, threshold: 4 },
  { key: 'landscape', id: 0x83, name: 'Landscape', sharpness: 5, fineness: 2, threshold: 4 },
  { key: 'finedetail', id: 0x88, name: 'Fine Detail', sharpness: 4, fineness: 1, threshold: 1 },
  { key: 'neutral', id: 0x84, name: 'Neutral', sharpness: 0, fineness: 2, threshold: 2 },
  { key: 'faithful', id: 0x85, name: 'Faithful', sharpness: 0, fineness: 2, threshold: 2 },
  { key: 'monochrome', id: 0x86, name: 'Monochrome', sharpness: 4, fineness: 2, threshold: 4 },
];

export const baseByKey = (k: BaseStyleKey): BaseStyle => BASE_STYLES.find((b) => b.key === k)!;
export const baseById = (id: number): BaseStyle | undefined => BASE_STYLES.find((b) => b.id === id);

export const FILTERS = ['none', 'yellow', 'orange', 'red', 'green'] as const;
export const TONINGS = ['none', 'sepia', 'blue', 'purple', 'green'] as const;
export type Filter = (typeof FILTERS)[number];
export type Toning = (typeof TONINGS)[number];

/** Style data of a slot that uses a built-in base: length word, then zeros (observed on R100). */
export function emptyStyle(): Uint8Array {
  const b = new Uint8Array(STYLE_LENGTH_R100);
  new DataView(b.buffer).setUint32(0, STYLE_LENGTH_R100, true);
  return b;
}

export interface CarrierHeader {
  valid: boolean;
  baseId: number;
  name: string;
  sharpness: number;
  fineness: number;
  threshold: number;
}

/**
 * Reads the plain header of R100 style data. Offsets (docs/M0-findings.md 0.4):
 * 4 valid, 10 base id, 12..47 name (ASCII, NUL padded), 48 sharpness, 68 fineness, 72 threshold.
 */
export function parseCarrierHeader(style: Uint8Array): CarrierHeader {
  if (style.length !== STYLE_LENGTH_R100) throw new Error(`style data is ${style.length} bytes, expected ${STYLE_LENGTH_R100}`);
  const dv = new DataView(style.buffer, style.byteOffset, style.byteLength);
  let name = '';
  for (let i = 12; i < 48 && style[i] !== 0; i++) name += String.fromCharCode(style[i]!);
  return {
    valid: dv.getUint32(4, true) === 1,
    baseId: style[10]!,
    name: name.trim(),
    sharpness: dv.getInt32(48, true),
    fineness: dv.getInt32(68, true),
    threshold: dv.getInt32(72, true),
  };
}

export const isEmptyStyle = (style: Uint8Array): boolean => !parseCarrierHeader(style).valid;
