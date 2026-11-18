// Look engine: a colour transform applied to the output colours stored in an R100 colour grid.
// Grid units (docs/M0-findings.md): field0 = Cr, field1 = Cb, field2 = Y, each signed 10-bit.
// Interpreted as full-range BT.601 YCbCr of gamma-encoded RGB: y = Y/512, cb = Cb/1024, cr = Cr/1024.
// Edits happen in OKLCh so hue bands and lightness behave perceptually.

export const HUE_BANDS = [
  { key: 'red', label: 'Red', center: 29 },
  { key: 'orange', label: 'Orange / skin', center: 58 },
  { key: 'yellow', label: 'Yellow', center: 105 },
  { key: 'green', label: 'Green', center: 140 },
  { key: 'aqua', label: 'Aqua', center: 195 },
  { key: 'blue', label: 'Blue', center: 255 },
  { key: 'purple', label: 'Purple', center: 300 },
  { key: 'magenta', label: 'Magenta', center: 340 },
] as const;
export type BandKey = (typeof HUE_BANDS)[number]['key'];

export interface BandAdjust {
  /** Degrees, −30..30. */
  hue: number;
  /** Multiplier offset, −1..1 (−1 = grey, 0 = unchanged, 1 = double). */
  sat: number;
  /** Lightness offset, −0.2..0.2 (OKLab L units). */
  light: number;
}

export interface LookParams {
  /** Overall saturation multiplier offset, −1..1. */
  saturation: number;
  /** Tone: lift or lower shadows / highlights, −1..1. */
  shadows: number;
  highlights: number;
  /** Mid-tone contrast, −1..1. */
  contrast: number;
  bands: Record<BandKey, BandAdjust>;
  /** Split toning: hue in degrees, amount 0..1. */
  shadowTint: { hue: number; amount: number };
  highlightTint: { hue: number; amount: number };
}

const zeroBand = (): BandAdjust => ({ hue: 0, sat: 0, light: 0 });
export function neutralParams(): LookParams {
  return {
    saturation: 0,
    shadows: 0,
    highlights: 0,
    contrast: 0,
    bands: Object.fromEntries(HUE_BANDS.map((b) => [b.key, zeroBand()])) as Record<BandKey, BandAdjust>,
    shadowTint: { hue: 200, amount: 0 },
    highlightTint: { hue: 60, amount: 0 },
  };
}

// ---------- colour conversions ----------
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.sign(c) * ((Math.abs(c) + 0.055) / 1.055) ** 2.4);
const toGam = (c: number) => (Math.abs(c) <= 0.0031308 ? 12.92 * c : Math.sign(c) * (1.055 * Math.abs(c) ** (1 / 2.4) - 0.055));

export function ycbcrToRgb(y: number, cb: number, cr: number): [number, number, number] {
  return [y + 1.402 * cr, y - 0.344136 * cb - 0.714136 * cr, y + 1.772 * cb];
}
export function rgbToYcbcr(r: number, g: number, b: number): [number, number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return [y, (b - y) / 1.772, (r - y) / 1.402];
}

export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const [R, G, B] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toGam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

// ---------- the transform ----------
const angDiff = (a: number, b: number) => {
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
};

/** Smooth band weights for a hue (degrees); they sum to 1. */
export function bandWeights(h: number): number[] {
  const raw = HUE_BANDS.map((b, i) => {
    const prev = HUE_BANDS[(i + HUE_BANDS.length - 1) % HUE_BANDS.length]!.center;
    const next = HUE_BANDS[(i + 1) % HUE_BANDS.length]!.center;
    const d = angDiff(h, b.center);
    const half = d >= 0 ? Math.abs(angDiff(next, b.center)) : Math.abs(angDiff(b.center, prev));
    const t = Math.abs(d) / half;
    return t >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * t);
  });
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((w) => w / sum);
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Tone curve on OKLab L (0..1). */
function tone(L: number, p: LookParams): number {
  // Only ever adds offsets, so out-of-range grid values pass through unchanged when nothing is set.
  let x = L;
  const c = clamp(L, 0, 1);
  if (p.contrast) x += p.contrast * 0.6 * (c - 0.55) * (1 - Math.abs(2 * c - 1)) * 1.2;
  if (p.shadows) x += p.shadows * 0.08 * (1 - smoothstep(0.1, 0.6, c)) * smoothstep(0, 0.15, c);
  if (p.highlights) x += p.highlights * 0.08 * smoothstep(0.45, 0.9, c) * (1 - smoothstep(0.92, 1, c) * 0.5);
  return x;
}

/** Applies the look to one gamma-encoded RGB colour (0..1). */
export function transformRgb(rgb: [number, number, number], p: LookParams): [number, number, number] {
  const [L, a, b] = rgbToOklab(...rgb);
  let C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  const w = bandWeights((h + 360) % 360);
  const colourful = smoothstep(0.01, 0.05, C); // greys get no hue edits
  let dh = 0, ds = 0, dl = 0;
  HUE_BANDS.forEach((band, i) => {
    const adj = p.bands[band.key];
    dh += w[i]! * adj.hue;
    ds += w[i]! * adj.sat;
    dl += w[i]! * adj.light;
  });
  h += dh * colourful;
  C *= Math.max(0, 1 + ds * colourful) * Math.max(0, 1 + p.saturation);
  let L2 = tone(L, p) + dl * colourful;
  // split toning (as small OKLab offsets weighted by lightness)
  const sh = 1 - smoothstep(0.15, 0.6, L2);
  const hi = smoothstep(0.5, 0.95, L2);
  let a2 = C * Math.cos((h * Math.PI) / 180);
  let b2 = C * Math.sin((h * Math.PI) / 180);
  const tint = (t: { hue: number; amount: number }, wgt: number) => {
    a2 += t.amount * 0.04 * wgt * Math.cos((t.hue * Math.PI) / 180);
    b2 += t.amount * 0.04 * wgt * Math.sin((t.hue * Math.PI) / 180);
  };
  tint(p.shadowTint, sh);
  tint(p.highlightTint, hi);
  return oklabToRgb(L2, a2, b2);
}

/**
 * Grid units -> transform -> grid units. The look is applied to the nearest displayable colour and the
 * resulting change is added to the stored value, so a neutral look is an exact identity and colours far
 * outside the display range move like their neighbours, including the few nodes stored with a negative Y.
 */
export function transformGridColour(v: readonly [number, number, number], p: LookParams): [number, number, number] {
  const [crU, cbU, yU] = v;
  const rgb = ycbcrToRgb(yU / 512, cbU / 1024, crU / 1024).map((c) => clamp(c, 0, 1)) as [number, number, number];
  const before = rgbToYcbcr(...rgb);
  const after = rgbToYcbcr(...transformRgb(rgb, p));
  const r = (x: number) => clamp(Math.round(x), -512, 511) + 0; // + 0 turns −0 into 0
  return [r(crU + (after[2] - before[2]) * 1024), r(cbU + (after[1] - before[1]) * 1024), r(yU + (after[0] - before[0]) * 512)];
}

export function isNeutral(p: LookParams): boolean {
  return JSON.stringify(p) === JSON.stringify(neutralParams());
}
