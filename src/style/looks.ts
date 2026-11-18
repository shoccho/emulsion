// A "look" is the colour foundation of a recipe:
// - a Canon base style (Standard, Neutral, …), written as an empty style + base id, or
// - style data ("carrier") made by Canon software, captured from a camera slot or shipped with the app.

import { BASE_STYLES, baseById, baseByKey, parseCarrierHeader, type BaseStyle, type CarrierHeader } from '../canon/styles';
import { STYLE_LENGTH_R100 } from '../canon/registration';

export interface LookOffsets {
  contrast?: number;
  saturation?: number;
  colorTone?: number;
}

export interface BaseLook {
  kind: 'base';
  id: string;
  name: string;
  description: string;
  base: BaseStyle;
  /** 'canon' = a plain Canon base; 'film' = a Canon base plus offsets that approximate a film simulation. */
  group: 'canon' | 'film';
  /** Added to the values derived from the recipe (not to explicit Canon overrides). */
  offsets?: LookOffsets;
}

export interface CarrierLook {
  kind: 'carrier';
  id: string;
  name: string;
  description: string;
  source: 'builtin' | 'captured' | 'imported' | 'created' | 'generated';
  carrier: Uint8Array;
  header: CarrierHeader;
  addedAt?: string;
}

export type Look = BaseLook | CarrierLook;

const BASE_DESCRIPTIONS: Record<string, string> = {
  auto: 'Canon picks colour and contrast per scene.',
  standard: 'Vivid, crisp, general purpose.',
  portrait: 'Softer skin tones, gentler sharpening.',
  landscape: 'Saturated blues and greens, extra sharpness.',
  finedetail: 'Fine sharpening for detail.',
  neutral: 'Low contrast, muted colour. Good starting point for film looks.',
  faithful: 'Colour close to the scene under 5200 K light, low contrast.',
  monochrome: 'Black and white, with optional filter and toning.',
};

export const BASE_LOOKS: readonly BaseLook[] = BASE_STYLES.map((b) => ({
  kind: 'base',
  id: `canon:${b.key}`,
  name: `Canon ${b.name}`,
  description: BASE_DESCRIPTIONS[b.key] ?? '',
  base: b,
  group: 'canon',
}));

/**
 * Film-style bases: a Canon base plus fixed offsets, so a recipe's Color and Highlight/Shadow
 * keep their meaning relative to the film simulation they were written for. Approximations.
 */
export const FILM_LOOKS: readonly BaseLook[] = [
  {
    kind: 'base',
    id: 'film:classic-chrome',
    name: 'Chrome-style (inspired by Classic Chrome)',
    description: 'Canon Neutral with 2 steps less saturation and 1 step more contrast, approximating a muted, firm Classic Chrome base. Not a reproduction.',
    base: baseByKey('neutral'),
    group: 'film',
    offsets: { contrast: 1, saturation: -2 },
  },
];

export function carrierLook(id: string, name: string, carrier: Uint8Array, source: CarrierLook['source'], description = '', addedAt?: string): CarrierLook {
  if (carrier.length !== STYLE_LENGTH_R100) throw new Error(`style data is ${carrier.length} bytes; the R100 uses ${STYLE_LENGTH_R100}`);
  const header = parseCarrierHeader(carrier);
  if (!header.valid) throw new Error('this style data is empty (the slot used a built-in base style)');
  const based = baseById(header.baseId)?.name;
  return {
    kind: 'carrier',
    id,
    name,
    description: description || `Canon Picture Style file${based ? `, based on ${based}` : ''}.`,
    source,
    carrier,
    header,
    ...(addedAt ? { addedAt } : {}),
  };
}

export interface BuiltinCarrierEntry {
  id: string;
  name: string;
  file: string;
  description?: string;
}

/** Ready-made looks shipped with the site (built by tools/build-looks.ts; no keys needed to use them). */
export const READY_MADE_LOOKS_URL = 'looks/r100/';

/**
 * Loads style data from a folder with an index.json: Canon style files in public/carriers/r100/ (local only),
 * or the ready-made looks in public/looks/r100/ (pass source 'generated'). The folder may be absent (it is not
 * committed until redistribution is decided), in which case this returns [].
 */
export async function loadBuiltinCarrierLooks(baseUrl = 'carriers/r100/', source: CarrierLook['source'] = 'builtin'): Promise<CarrierLook[]> {
  try {
    const res = await fetch(`${baseUrl}index.json`);
    if (!res.ok) return [];
    const entries = (await res.json()) as BuiltinCarrierEntry[];
    const looks: CarrierLook[] = [];
    for (const e of entries) {
      try {
        const r = await fetch(`${baseUrl}${e.file}`);
        if (!r.ok) continue;
        looks.push(carrierLook(e.id, e.name, new Uint8Array(await r.arrayBuffer()), source, e.description));
      } catch {
        // skip a broken entry
      }
    }
    return looks;
  } catch {
    return [];
  }
}

export function findLook(looks: readonly Look[], id: string): Look | undefined {
  return looks.find((l) => l.id === id);
}

/** The look a recipe uses here: its own look, else its fallback. */
export function resolveLook(looks: readonly Look[], r: { look: string; fallbackLook?: string }): Look | undefined {
  return findLook(looks, r.look) ?? (r.fallbackLook ? findLook(looks, r.fallbackLook) : undefined);
}
