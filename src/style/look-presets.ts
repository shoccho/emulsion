// Starting points for the style editor. Original parameter sets written for this app; each approximates
// the mood of a film simulation. They are not reproductions of Fujifilm's processing.

import { neutralParams, type BandAdjust, type BandKey, type LookParams } from './look-engine';

export type PresetGroup = 'fuji' | 'film' | 'mono' | 'creative';
export const PRESET_GROUPS: Record<PresetGroup, string> = {
  fuji: 'Inspired by Fujifilm simulations',
  film: 'Inspired by film stocks',
  mono: 'Black and white',
  creative: 'Creative',
};

export interface LookPreset {
  id: string;
  name: string;
  group: PresetGroup;
  description: string;
  params: LookParams;
}

type BandPatch = Partial<Record<BandKey, Partial<BandAdjust>>>;

function make(p: Partial<Omit<LookParams, 'bands'>>, bands: BandPatch): LookParams {
  const base = neutralParams();
  for (const [k, v] of Object.entries(bands) as [BandKey, Partial<BandAdjust>][]) base.bands[k] = { ...base.bands[k], ...v };
  return { ...base, ...p, bands: base.bands };
}

export const LOOK_PRESETS: readonly LookPreset[] = [
  {
    id: 'classic-chrome',
    group: 'fuji',
    name: 'Chrome-style',
    description: 'Inspired by Classic Chrome: muted greens and yellows, cyan-leaning blues, deep reds, firm contrast, soft highlights.',
    params: make(
      { saturation: -0.15, contrast: 0.3, shadows: -0.3, highlights: -0.25, shadowTint: { hue: 200, amount: 0.25 }, highlightTint: { hue: 70, amount: 0.1 } },
      {
        red: { hue: -4, sat: -0.05, light: -0.03 },
        orange: { hue: -3, sat: -0.15 },
        yellow: { hue: -6, sat: -0.4, light: -0.02 },
        green: { hue: -10, sat: -0.4, light: -0.03 },
        aqua: { hue: -8, sat: -0.3 },
        blue: { hue: -12, sat: -0.1, light: -0.05 },
        purple: { hue: -10, sat: -0.3 },
        magenta: { hue: -5, sat: -0.3 },
      },
    ),
  },
  {
    id: 'classic-negative',
    group: 'fuji',
    name: 'Negative-style',
    description: 'Inspired by Classic Negative: hard contrast, teal shadows, warm highlights, greens toward teal.',
    params: make(
      { saturation: -0.1, contrast: 0.4, shadows: -0.2, highlights: -0.3, shadowTint: { hue: 190, amount: 0.35 }, highlightTint: { hue: 80, amount: 0.25 } },
      {
        red: { hue: -6, sat: 0.05 },
        yellow: { hue: -5, sat: -0.3 },
        green: { hue: 12, sat: -0.25, light: -0.03 },
        blue: { hue: -8, sat: -0.1 },
      },
    ),
  },
  {
    id: 'velvia',
    group: 'fuji',
    name: 'Vivid slide',
    description: 'Inspired by Velvia: rich saturation and punchy contrast for landscapes.',
    params: make(
      { saturation: 0.35, contrast: 0.3, shadows: -0.15 },
      { red: { sat: 0.15, light: -0.03 }, green: { hue: 4, sat: 0.2 }, blue: { sat: 0.2, light: -0.05 }, magenta: { sat: 0.15 } },
    ),
  },
  {
    id: 'eterna',
    group: 'fuji',
    name: 'Cinema soft',
    description: 'Inspired by Eterna: low saturation, flat contrast, lifted shadows, cool shadow tint.',
    params: make({ saturation: -0.35, contrast: -0.3, shadows: 0.3, highlights: -0.3, shadowTint: { hue: 220, amount: 0.15 } }, { aqua: { hue: -5 } }),
  },
  {
    id: 'pro-neg',
    group: 'fuji',
    name: 'Soft portrait',
    description: 'Inspired by Pro Neg. Std: gentle contrast, natural skin, slightly muted colour.',
    params: make({ saturation: -0.2, contrast: -0.25, shadows: 0.2, highlights: -0.15 }, { orange: { sat: -0.1, light: 0.04 }, green: { hue: -6, sat: -0.2 }, blue: { sat: -0.15 } }),
  },
  {
    id: 'provia',
    group: 'fuji',
    name: 'Standard slide',
    description: 'Inspired by Provia: clean, moderately saturated colour with gentle contrast. A good everyday look.',
    params: make({ saturation: 0.2, contrast: 0.25, shadows: -0.1 }, { red: { sat: 0.1 }, green: { hue: 5, sat: 0.15 }, blue: { hue: -4, sat: 0.2 } }),
  },
  {
    id: 'astia',
    group: 'fuji',
    name: 'Soft slide',
    description: 'Inspired by Astia: soft contrast, bright skin, saturated but gentle blues and greens.',
    params: make(
      { saturation: 0.1, contrast: -0.3, highlights: -0.3, shadows: 0.3, highlightTint: { hue: 30, amount: 0.12 } },
      { orange: { sat: -0.1, light: 0.05 }, red: { light: 0.03 }, blue: { sat: 0.3 }, aqua: { sat: 0.2 }, green: { sat: 0.2 } },
    ),
  },
  {
    id: 'pro-neg-hi',
    group: 'fuji',
    name: 'Portrait punch',
    description: 'Inspired by Pro Neg. Hi: natural skin with more contrast and a little more colour than Soft portrait.',
    params: make({ saturation: 0.05, contrast: 0.45, shadows: -0.3 }, { orange: { light: 0.04 }, red: { sat: 0.1 }, blue: { sat: 0.2 }, green: { hue: -5, sat: -0.15 } }),
  },
  {
    id: 'bleach-bypass',
    group: 'fuji',
    name: 'Bleach bypass',
    description: 'Inspired by Eterna Bleach Bypass: very low saturation, hard contrast, silvery highlights.',
    params: make({ saturation: -0.6, contrast: 0.55, shadows: -0.35, highlights: 0.1 }, { orange: { sat: 0.1 } }),
  },
  {
    id: 'nostalgic-neg',
    group: 'fuji',
    name: 'Amber negative',
    description: 'Inspired by Nostalgic Neg.: amber highlights, rich reds, soft shadows, 1970s print feel.',
    params: make(
      { saturation: 0.05, contrast: 0.15, shadows: 0.3, highlights: -0.3, highlightTint: { hue: 75, amount: 0.75 }, shadowTint: { hue: 30, amount: 0.3 } },
      { red: { sat: 0.25 }, orange: { hue: 5, sat: 0.15 }, yellow: { hue: -10, sat: 0.15 }, green: { hue: -15, sat: -0.3 }, blue: { hue: -10, sat: -0.25 } },
    ),
  },
  {
    id: 'reala-ace',
    group: 'fuji',
    name: 'True negative',
    description: 'Inspired by Reala Ace: faithful colour with negative-film contrast and slightly cool greens.',
    params: make({ contrast: 0.35, shadows: -0.2, highlights: -0.15 }, { green: { hue: 10, sat: -0.15 }, aqua: { sat: 0.15 }, red: { sat: 0.15 }, yellow: { hue: -5, sat: -0.1 } }),
  },
  {
    id: 'portrait-400',
    group: 'film',
    name: 'Portrait 400',
    description: 'Inspired by Portra 400: warm, pastel colour, low contrast, glowing skin, muted greens and blues.',
    params: make(
      { saturation: -0.15, contrast: -0.2, shadows: 0.2, highlights: -0.2, highlightTint: { hue: 70, amount: 0.25 }, shadowTint: { hue: 40, amount: 0.1 } },
      { orange: { hue: 2, sat: 0.05, light: 0.03 }, yellow: { hue: -4, sat: -0.1 }, green: { hue: -10, sat: -0.35 }, aqua: { sat: -0.2 }, blue: { hue: -6, sat: -0.2 } },
    ),
  },
  {
    id: 'gold-200',
    group: 'film',
    name: 'Golden 200',
    description: 'Inspired by Gold 200: warm and sunny, saturated yellows and reds, golden highlights.',
    params: make(
      { saturation: 0.2, contrast: 0.25, highlightTint: { hue: 85, amount: 0.7 }, shadowTint: { hue: 50, amount: 0.3 } },
      { red: { sat: 0.2 }, orange: { hue: 4, sat: 0.2 }, yellow: { hue: -12, sat: 0.4 }, green: { hue: -18, sat: -0.15 }, blue: { sat: -0.25 } },
    ),
  },
  {
    id: 'ektar-100',
    group: 'film',
    name: 'Saturated 100',
    description: 'Inspired by Ektar 100: very saturated, punchy reds and deep blues, crisp contrast.',
    params: make(
      { saturation: 0.4, contrast: 0.3, shadows: -0.1 },
      { red: { sat: 0.25, light: -0.03 }, orange: { sat: 0.1 }, blue: { hue: -5, sat: 0.3, light: -0.06 }, aqua: { sat: 0.2 }, green: { sat: 0.1 } },
    ),
  },
  {
    id: 'tungsten-800',
    group: 'film',
    name: 'Tungsten 800',
    description: 'Inspired by CineStill 800T: cool cinematic night look, teal shadows, cyan skies, warm practical lights.',
    params: make(
      { saturation: -0.05, contrast: 0.2, shadows: -0.15, shadowTint: { hue: 210, amount: 0.5 }, highlightTint: { hue: 50, amount: 0.15 } },
      { red: { hue: 6, sat: 0.1 }, orange: { hue: 4 }, yellow: { hue: -10, sat: -0.2 }, green: { hue: 20, sat: -0.3 }, blue: { hue: -15, sat: 0.1 } },
    ),
  },
  {
    id: 'superia-400',
    group: 'film',
    name: 'Consumer 400',
    description: 'Inspired by Superia 400: green-tinged shadows, vivid greens and reds, everyday snapshot feel.',
    params: make(
      { saturation: 0.15, contrast: 0.25, shadows: -0.1, shadowTint: { hue: 150, amount: 0.6 }, highlightTint: { hue: 340, amount: 0.15 } },
      { green: { hue: 10, sat: 0.3 }, red: { sat: 0.25 }, blue: { hue: -8, sat: 0.1 }, magenta: { sat: 0.2 } },
    ),
  },
  {
    id: 'slide-64',
    group: 'film',
    name: 'Slide 64',
    description: 'Inspired by Kodachrome 64: deep reds, warm yellows, dense blues, strong contrast and dark shadows.',
    params: make(
      { saturation: 0.2, contrast: 0.4, shadows: -0.3, highlightTint: { hue: 80, amount: 0.15 } },
      { red: { hue: -3, sat: 0.25, light: -0.04 }, yellow: { hue: -6, sat: 0.15 }, green: { hue: -6, sat: -0.1, light: -0.03 }, blue: { hue: -8, sat: 0.2, light: -0.07 } },
    ),
  },
  {
    id: 'acros',
    group: 'mono',
    name: 'Fine mono',
    description: 'Inspired by Acros: smooth black and white with deep blacks and detailed highlights.',
    params: make({ saturation: -1, contrast: 0.3, shadows: -0.2, highlights: -0.1 }, {}),
  },
  {
    id: 'mono-red-filter',
    group: 'mono',
    name: 'Mono red filter',
    description: 'Black and white as if shot through a red filter: dark dramatic skies, bright skin and brick.',
    params: make(
      { saturation: -1, contrast: 0.35, shadows: -0.15 },
      { red: { light: 0.08 }, orange: { light: 0.08 }, yellow: { light: 0.04 }, green: { light: -0.06 }, aqua: { light: -0.1 }, blue: { light: -0.14 }, purple: { light: -0.06 } },
    ),
  },
  {
    id: 'mono-high-contrast',
    group: 'mono',
    name: 'Gritty mono',
    description: 'Inspired by Tri-X pushed: hard, punchy black and white for street photography.',
    params: make({ saturation: -1, contrast: 0.7, shadows: -0.4, highlights: 0.2 }, {}),
  },
  {
    id: 'sepia',
    group: 'mono',
    name: 'Sepia',
    description: 'Warm brown-toned black and white, like an old print.',
    params: make({ saturation: -1, contrast: 0.15, shadows: 0.1, shadowTint: { hue: 55, amount: 0.6 }, highlightTint: { hue: 80, amount: 0.5 } }, {}),
  },
  {
    id: 'teal-orange',
    group: 'creative',
    name: 'Teal and orange',
    description: 'Blockbuster grade: skin and warm tones pushed orange, everything cool pushed teal.',
    params: make(
      { contrast: 0.25, shadows: -0.15, shadowTint: { hue: 200, amount: 0.5 }, highlightTint: { hue: 60, amount: 0.25 } },
      { red: { hue: 10, sat: 0.1 }, orange: { sat: 0.25 }, yellow: { hue: -15, sat: 0.1 }, green: { hue: 30, sat: -0.3 }, aqua: { sat: 0.2 }, blue: { hue: -20, sat: 0.1 }, purple: { hue: -25, sat: -0.3 } },
    ),
  },
  {
    id: 'faded-matte',
    group: 'creative',
    name: 'Faded matte',
    description: 'Lifted, milky shadows, soft contrast and muted colour; the classic matte social look.',
    params: make({ saturation: -0.3, contrast: -0.35, shadows: 0.7, highlights: -0.3, shadowTint: { hue: 230, amount: 0.1 } }, {}),
  },
  {
    id: 'moody-forest',
    group: 'creative',
    name: 'Moody forest',
    description: 'Dark, desaturated greens toward olive, cool shadows, warm skin. For woods and overcast days.',
    params: make(
      { saturation: -0.2, contrast: 0.2, shadows: -0.25, shadowTint: { hue: 190, amount: 0.25 } },
      { yellow: { hue: -15, sat: -0.3, light: -0.04 }, green: { hue: -15, sat: -0.4, light: -0.06 }, aqua: { sat: -0.3 }, orange: { sat: 0.05 } },
    ),
  },
  {
    id: 'warm-vintage',
    group: 'creative',
    name: 'Warm vintage',
    description: 'Faded warm print: yellowed highlights, brown shadows, softened colour.',
    params: make(
      { saturation: -0.25, contrast: -0.1, shadows: 0.35, highlights: -0.15, shadowTint: { hue: 45, amount: 0.35 }, highlightTint: { hue: 90, amount: 0.4 } },
      { green: { hue: -10, sat: -0.2 }, blue: { hue: -10, sat: -0.3 } },
    ),
  },
  {
    id: 'cool-nordic',
    group: 'creative',
    name: 'Cool nordic',
    description: 'Clean, cool and airy: blue-grey shadows, bright highlights, restrained colour.',
    params: make(
      { saturation: -0.3, contrast: 0.05, highlights: 0.2, shadowTint: { hue: 240, amount: 0.3 }, highlightTint: { hue: 220, amount: 0.1 } },
      { orange: { sat: -0.1 }, yellow: { sat: -0.35 }, green: { hue: 10, sat: -0.3 } },
    ),
  },
  {
    id: 'cross-process',
    group: 'creative',
    name: 'Cross process',
    description: 'Slide film developed as negative: yellow-green highlights, cyan shadows, hard contrast, wild colour.',
    params: make(
      { saturation: 0.25, contrast: 0.45, shadows: -0.2, shadowTint: { hue: 220, amount: 0.45 }, highlightTint: { hue: 100, amount: 0.45 } },
      { red: { hue: 10, sat: 0.1 }, yellow: { sat: 0.3 }, green: { hue: -10, sat: 0.2 }, blue: { hue: 10 } },
    ),
  },
  {
    id: 'pastel',
    group: 'creative',
    name: 'Pastel',
    description: 'Light, airy, soft colours with lifted shadows and pink-leaning highlights.',
    params: make(
      { saturation: -0.35, contrast: -0.3, shadows: 0.45, highlights: 0.1, highlightTint: { hue: 350, amount: 0.12 } },
      { orange: { light: 0.03 }, blue: { hue: 5, light: 0.04 }, green: { hue: 8, light: 0.03 } },
    ),
  },
];

export const presetById = (id: string): LookPreset | undefined => LOOK_PRESETS.find((p) => p.id === id);
