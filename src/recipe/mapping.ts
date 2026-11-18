// Recipe + look -> what goes into the slot, what the user sets by hand, and what is not possible.
// PLAN.md section 3. Every approximation is labelled; nothing here claims to match a Fujifilm camera.

import type { SlotTarget } from '../canon/camera-service';
import type { CameraSettings } from '../canon/camera-settings';
import type { StateWords } from '../canon/slot-state';
import { FILTERS, TONINGS, emptyStyle } from '../canon/styles';
import type { Look } from '../style/looks';
import type { Recipe } from './schema';

export interface PlanLine {
  label: string;
  value: string;
  note?: string;
}

export interface RecipePlan {
  target: SlotTarget;
  /** Camera-wide settings that can be applied over USB. */
  camera: Partial<CameraSettings>;
  inSlot: PlanLine[];
  byHand: PlanLine[];
  notPossible: PlanLine[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Round half away from zero, so +0.5 and -0.5 behave symmetrically. */
const roundSym = (v: number) => Math.sign(v) * Math.round(Math.abs(v));
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

export function deriveWords(recipe: Recipe, look: Look): StateWords {
  const o = recipe.canon ?? {};
  const isMono = look.kind === 'base' && look.base.key === 'monochrome';
  const defaults =
    look.kind === 'base'
      ? { sharpness: look.base.sharpness, fineness: look.base.fineness, threshold: look.base.threshold }
      : { sharpness: clamp(look.header.sharpness, 0, 7), fineness: clamp(look.header.fineness, 1, 5), threshold: clamp(look.header.threshold, 1, 5) };
  const off = (look.kind === 'base' && look.offsets) || {};
  return {
    base: look.kind === 'base' ? look.base.id : 'pc',
    contrast: o.contrast ?? clamp(roundSym((recipe.highlight + recipe.shadow) / 2) + (off.contrast ?? 0), -4, 4),
    sharpness: o.sharpness ?? clamp(defaults.sharpness + recipe.sharpness, 0, 7),
    saturation: isMono ? 0 : (o.saturation ?? clamp(recipe.color + (off.saturation ?? 0), -4, 4)),
    colorTone: isMono ? 0 : (o.colorTone ?? clamp(off.colorTone ?? 0, -4, 4)),
    filter: isMono ? FILTERS.indexOf(recipe.monochrome?.filter ?? 'none') : 0,
    toning: isMono ? TONINGS.indexOf(recipe.monochrome?.toning ?? 'none') : 0,
    fineness: o.fineness ?? defaults.fineness,
    threshold: o.threshold ?? defaults.threshold,
  };
}

const WB_NAMES: Record<Recipe['whiteBalance']['mode'], string> = {
  auto: 'AWB (Ambience priority)',
  'auto-white': 'AWB (White priority)',
  daylight: 'Daylight',
  shade: 'Shade',
  cloudy: 'Cloudy',
  tungsten: 'Tungsten light',
  fluorescent: 'White fluorescent light',
  kelvin: 'Colour temperature',
};

/** Rough Fujifilm R/B shift -> Canon shift. Red ≈ amber + magenta, blue ≈ blue + magenta. Positive ab = amber, positive mg = magenta. */
export function wbShiftFor(r: number, b: number): { ab: number; mg: number } {
  return { ab: clamp(r - b, -9, 9), mg: clamp(roundSym((r + b) / 2), -9, 9) };
}

export function suggestWbShift(r: number, b: number): string {
  const { ab, mg: gm } = wbShiftFor(r, b);
  const parts: string[] = [];
  if (ab) parts.push(ab > 0 ? `A${ab}` : `B${-ab}`);
  if (gm) parts.push(gm > 0 ? `M${gm}` : `G${-gm}`);
  return parts.length ? parts.join(', ') : 'no shift';
}

const WB_MODE_IDS: Record<Recipe['whiteBalance']['mode'], number> = {
  auto: 0,
  'auto-white': 23,
  daylight: 1,
  shade: 8,
  cloudy: 2,
  tungsten: 3,
  fluorescent: 4,
  kelvin: 9,
};
const NR_IDS: Record<string, number> = { Off: 3, Low: 1, Standard: 0, High: 2 };

/** Camera-wide settings for a recipe, in R100 terms (see canon/camera-settings.ts). ALO cannot be set over USB. */
export function cameraSettingsFor(recipe: Recipe): Partial<CameraSettings> {
  const wb = recipe.whiteBalance;
  const { ab, mg } = wbShiftFor(wb.shiftR, wb.shiftB);
  const out: Partial<CameraSettings> = {
    wbMode: WB_MODE_IDS[wb.mode],
    shiftAB: ab,
    shiftMG: mg,
    highIsoNr: NR_IDS[noiseReductionFor(recipe.noiseReduction)]!,
    htp: recipe.dynamicRange === '200' || recipe.dynamicRange === '400' ? 1 : 0,
  };
  if (wb.mode === 'kelvin' && wb.kelvin !== null) out.kelvin = wb.kelvin;
  return out;
}

export function noiseReductionFor(nr: number): string {
  if (nr <= -3) return 'Off';
  if (nr <= -1) return 'Low';
  if (nr <= 1) return 'Standard';
  return 'High';
}

export function dynamicRangeFor(dr: Recipe['dynamicRange']): string {
  switch (dr) {
    case 'auto':
      return 'Auto Lighting Optimizer: Standard; Highlight tone priority: Off';
    case '100':
      return 'Auto Lighting Optimizer: Off; Highlight tone priority: Off';
    case '200':
      return 'Highlight tone priority: On (D+)';
    case '400':
      return 'Highlight tone priority: the strongest setting your camera offers';
  }
}

function offNote(look: Look, k: 'contrast' | 'saturation'): string {
  const v = look.kind === 'base' ? look.offsets?.[k] : undefined;
  return v ? `, ${signed(v)} from the film-style base` : '';
}

export function planRecipe(recipe: Recipe, look: Look): RecipePlan {
  const words = deriveWords(recipe, look);
  const o = recipe.canon ?? {};
  const isMono = look.kind === 'base' && look.base.key === 'monochrome';
  const target: SlotTarget = { style: look.kind === 'base' ? emptyStyle() : look.carrier, words };

  const inSlot: PlanLine[] = [
    {
      label: 'Look',
      value: look.name,
      note: look.kind === 'carrier' ? 'Canon style data' : look.group === 'film' ? `Canon ${look.base.name} base with offsets` : 'Canon base style',
    },
    {
      label: 'Contrast',
      value: signed(words.contrast),
      note:
        o.contrast !== undefined
          ? 'set directly'
          : `approximates highlight ${signed(recipe.highlight)} / shadow ${signed(recipe.shadow)}${offNote(look, 'contrast')}`,
    },
  ];
  if (isMono) {
    inSlot.push({ label: 'Filter effect', value: recipe.monochrome?.filter ?? 'none' });
    inSlot.push({ label: 'Toning effect', value: recipe.monochrome?.toning ?? 'none' });
  } else {
    inSlot.push({ label: 'Saturation', value: signed(words.saturation), note: o.saturation !== undefined ? 'set directly' : `from colour ${signed(recipe.color)}${offNote(look, 'saturation')}` });
    inSlot.push({ label: 'Colour tone', value: signed(words.colorTone), note: o.colorTone !== undefined ? 'set directly' : undefined });
  }
  inSlot.push({
    label: 'Sharpness',
    value: `strength ${words.sharpness}, fineness ${words.fineness}, threshold ${words.threshold}`,
    note: o.sharpness !== undefined ? 'set directly' : `from sharpness ${signed(recipe.sharpness)}`,
  });

  const wb = recipe.whiteBalance;
  const byHand: PlanLine[] = [
    { label: 'White balance', value: wb.mode === 'kelvin' ? `${WB_NAMES.kelvin} ${wb.kelvin} K` : WB_NAMES[wb.mode] },
  ];
  if (wb.shiftR || wb.shiftB) {
    byHand.push({ label: 'WB shift', value: suggestWbShift(wb.shiftR, wb.shiftB), note: `rough match for R${signed(wb.shiftR)} B${signed(wb.shiftB)}` });
  }
  byHand.push({ label: 'High ISO noise reduction', value: noiseReductionFor(recipe.noiseReduction), note: `from noise reduction ${signed(recipe.noiseReduction)}` });
  byHand.push({ label: 'Dynamic range', value: dynamicRangeFor(recipe.dynamicRange), note: `from DR ${recipe.dynamicRange}` });

  const notPossible: PlanLine[] = [];
  if (recipe.grain.strength !== 'off') notPossible.push({ label: 'Grain', value: `${recipe.grain.strength}, ${recipe.grain.size}`, note: 'the camera cannot add grain' });
  if (recipe.clarity !== 0) notPossible.push({ label: 'Clarity', value: signed(recipe.clarity), note: 'no Canon equivalent' });
  if (recipe.colorChrome !== 'off') notPossible.push({ label: 'Color Chrome Effect', value: recipe.colorChrome, note: 'not available yet' });
  if (recipe.colorChromeBlue !== 'off') notPossible.push({ label: 'Color Chrome FX Blue', value: recipe.colorChromeBlue, note: 'not available yet' });
  if (recipe.highlight !== recipe.shadow && o.contrast === undefined) {
    notPossible.push({ label: 'Separate highlight / shadow', value: `${signed(recipe.highlight)} / ${signed(recipe.shadow)}`, note: 'combined into one contrast value' });
  }
  return { target, camera: cameraSettingsFor(recipe), inSlot, byHand, notPossible };
}
