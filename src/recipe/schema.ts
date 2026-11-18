// Recipe format (schema 1). A recipe is written in Fujifilm terms; recipe/mapping.ts turns it
// into Canon slot values plus a by-hand checklist.

import { FILTERS, TONINGS, type Filter, type Toning } from '../canon/styles';

export const STRENGTHS = ['off', 'weak', 'strong'] as const;
export type Strength = (typeof STRENGTHS)[number];

export const WB_MODES = ['auto', 'auto-white', 'daylight', 'shade', 'cloudy', 'tungsten', 'fluorescent', 'kelvin'] as const;
export type WbMode = (typeof WB_MODES)[number];

export const DYNAMIC_RANGES = ['auto', '100', '200', '400'] as const;
export type DynamicRange = (typeof DYNAMIC_RANGES)[number];

export interface CanonOverrides {
  contrast?: number;
  sharpness?: number;
  saturation?: number;
  colorTone?: number;
  fineness?: number;
  threshold?: number;
}

export interface Recipe {
  schema: 1;
  id: string;
  name: string;
  author?: string;
  notes?: string;
  /** Where the recipe comes from (http/https link). */
  source?: string;
  /** Look id: `canon:<base>` for a built-in Canon base, or the id of a style-data look. */
  look: string;
  /** Used when `look` is not available in this browser (e.g. a generated look before keys are loaded). */
  fallbackLook?: string;
  highlight: number;
  shadow: number;
  color: number;
  sharpness: number;
  colorChrome: Strength;
  colorChromeBlue: Strength;
  whiteBalance: { mode: WbMode; kelvin: number | null; shiftR: number; shiftB: number };
  noiseReduction: number;
  dynamicRange: DynamicRange;
  grain: { strength: Strength; size: 'small' | 'large' };
  clarity: number;
  /** Only used when the look is Canon Monochrome. */
  monochrome?: { filter: Filter; toning: Toning };
  /** Direct Canon values; each one replaces the value derived from the Fujifilm fields. */
  canon?: CanonOverrides;
}

export const OVERRIDE_RANGES: Record<keyof CanonOverrides, [number, number]> = {
  contrast: [-4, 4],
  sharpness: [0, 7],
  saturation: [-4, 4],
  colorTone: [-4, 4],
  fineness: [1, 5],
  threshold: [1, 5],
};

export function newRecipe(id: string, name = 'New recipe'): Recipe {
  return {
    schema: 1,
    id,
    name,
    look: 'canon:standard',
    highlight: 0,
    shadow: 0,
    color: 0,
    sharpness: 0,
    colorChrome: 'off',
    colorChromeBlue: 'off',
    whiteBalance: { mode: 'auto', kelvin: null, shiftR: 0, shiftB: 0 },
    noiseReduction: 0,
    dynamicRange: 'auto',
    grain: { strength: 'off', size: 'small' },
    clarity: 0,
  };
}

export type ValidationResult = { ok: true; recipe: Recipe } | { ok: false; errors: string[] };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Validates untrusted input (an imported file, a form). Missing optional fields get defaults;
 * wrong values produce readable errors. Unknown fields are dropped.
 */
export function validateRecipe(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['A recipe must be a JSON object.'] };
  if (input.schema !== 1) return { ok: false, errors: [`Unsupported recipe schema ${JSON.stringify(input.schema)}; this app reads schema 1.`] };

  const base = newRecipe('x');
  const str = (k: string, required: boolean, max = 200): string | undefined => {
    const v = input[k];
    if (v === undefined || v === null || v === '') {
      if (required) errors.push(`"${k}" is required.`);
      return undefined;
    }
    if (typeof v !== 'string') {
      errors.push(`"${k}" must be text.`);
      return undefined;
    }
    if (v.length > max) errors.push(`"${k}" is longer than ${max} characters.`);
    return v;
  };
  const num = (path: string, v: unknown, def: number, lo: number, hi: number, step = 1): number => {
    if (v === undefined) return def;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`"${path}" must be a number.`);
      return def;
    }
    if (v < lo || v > hi) errors.push(`"${path}" is ${v}; allowed ${lo} to ${hi}.`);
    else if (Math.abs(v / step - Math.round(v / step)) > 1e-9) errors.push(`"${path}" is ${v}; must be in steps of ${step}.`);
    return v;
  };
  const oneOf = <T extends string>(path: string, v: unknown, options: readonly T[], def: T): T => {
    if (v === undefined) return def;
    if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) {
      errors.push(`"${path}" must be one of: ${options.join(', ')}.`);
      return def;
    }
    return v as T;
  };

  const id = str('id', true, 80);
  if (id !== undefined && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push('"id" must be lowercase letters, digits and single hyphens (kebab-case).');
  const name = str('name', true, 80);
  const author = str('author', false);
  const notes = str('notes', false, 2000);
  const source = str('source', false, 300);
  if (source !== undefined && !/^https?:\/\/[^\s]+$/.test(source)) errors.push('"source" must be a web link starting with http:// or https://.');
  const look = str('look', true, 120);
  const fallbackLook = str('fallbackLook', false, 120);

  const wbIn = input.whiteBalance === undefined ? {} : input.whiteBalance;
  if (!isObj(wbIn)) errors.push('"whiteBalance" must be an object.');
  const wb = isObj(wbIn) ? wbIn : {};
  const mode = oneOf('whiteBalance.mode', wb.mode, WB_MODES, 'auto');
  let kelvin: number | null = null;
  if (mode === 'kelvin') {
    if (wb.kelvin === undefined || wb.kelvin === null) errors.push('"whiteBalance.kelvin" is required when mode is "kelvin".');
    else kelvin = num('whiteBalance.kelvin', wb.kelvin, 5500, 2500, 10000, 100);
  }

  const grainIn = input.grain === undefined ? {} : input.grain;
  if (!isObj(grainIn)) errors.push('"grain" must be an object.');
  const grain = isObj(grainIn) ? grainIn : {};

  let monochrome: Recipe['monochrome'];
  if (input.monochrome !== undefined) {
    if (!isObj(input.monochrome)) errors.push('"monochrome" must be an object.');
    else
      monochrome = {
        filter: oneOf('monochrome.filter', input.monochrome.filter, FILTERS, 'none'),
        toning: oneOf('monochrome.toning', input.monochrome.toning, TONINGS, 'none'),
      };
  }

  let canon: CanonOverrides | undefined;
  if (input.canon !== undefined) {
    if (!isObj(input.canon)) errors.push('"canon" must be an object.');
    else {
      canon = {};
      for (const [k, [lo, hi]] of Object.entries(OVERRIDE_RANGES) as [keyof CanonOverrides, [number, number]][]) {
        const v = input.canon[k];
        if (v !== undefined && v !== null) canon[k] = num(`canon.${k}`, v, 0, lo, hi);
      }
      for (const k of Object.keys(input.canon)) if (!(k in OVERRIDE_RANGES)) errors.push(`"canon.${k}" is not a known Canon setting.`);
    }
  }

  const recipe: Recipe = {
    schema: 1,
    id: id ?? base.id,
    name: name ?? base.name,
    ...(author ? { author } : {}),
    ...(notes ? { notes } : {}),
    ...(source ? { source } : {}),
    look: look ?? base.look,
    ...(fallbackLook ? { fallbackLook } : {}),
    highlight: num('highlight', input.highlight, 0, -2, 4, 0.5),
    shadow: num('shadow', input.shadow, 0, -2, 4, 0.5),
    color: num('color', input.color, 0, -4, 4),
    sharpness: num('sharpness', input.sharpness, 0, -4, 4),
    colorChrome: oneOf('colorChrome', input.colorChrome, STRENGTHS, 'off'),
    colorChromeBlue: oneOf('colorChromeBlue', input.colorChromeBlue, STRENGTHS, 'off'),
    whiteBalance: {
      mode,
      kelvin,
      shiftR: num('whiteBalance.shiftR', wb.shiftR, 0, -9, 9),
      shiftB: num('whiteBalance.shiftB', wb.shiftB, 0, -9, 9),
    },
    noiseReduction: num('noiseReduction', input.noiseReduction, 0, -4, 4),
    dynamicRange: oneOf('dynamicRange', input.dynamicRange, DYNAMIC_RANGES, 'auto'),
    grain: { strength: oneOf('grain.strength', grain.strength, STRENGTHS, 'off'), size: oneOf('grain.size', grain.size, ['small', 'large'] as const, 'small') },
    clarity: num('clarity', input.clarity, 0, -5, 5),
    ...(monochrome ? { monochrome } : {}),
    ...(canon && Object.keys(canon).length ? { canon } : {}),
  };
  return errors.length ? { ok: false, errors } : { ok: true, recipe };
}

/** Accepts one recipe or an array of recipes (an export file). */
export function parseRecipeFile(text: string): { recipes: Recipe[]; errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { recipes: [], errors: ['The file is not valid JSON.'] };
  }
  const items = Array.isArray(data) ? data : [data];
  const recipes: Recipe[] = [];
  const errors: string[] = [];
  items.forEach((item, i) => {
    const r = validateRecipe(item);
    const label = isObj(item) && typeof item.name === 'string' ? `"${item.name}"` : `item ${i + 1}`;
    if (r.ok) recipes.push(r.recipe);
    else errors.push(...r.errors.map((e) => `${label}: ${e}`));
  });
  return { recipes, errors };
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'recipe'
  );
}
