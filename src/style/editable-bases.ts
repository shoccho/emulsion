// Editable bases: a colour table that renders like a plain Canon style, built from the Autumn Hues table plus
// the fitted corrections in identity-params.ts, with the style id in the header. The style editor and generated
// looks work on these.

import { BASE_STYLES, type BaseStyle } from '../canon/styles';
import { Keystream, decodeCarrier, encodeCarrier } from './carrier-r100';
import { buildLookCarrier, withBaseHeader } from './look-builder';
import { IDENTITY_COMMON, IDENTITY_PER_BASE, IDENTITY_QUALITY } from './identity-params';
import { carrierLook, type CarrierLook } from './looks';

/** The Autumn Hues carrier these corrections were fitted for. */
export const IDENTITY_SOURCE_LOOK = 'builtin:autumn-hues';
export const EDITABLE_BASE_KEYS = ['standard', 'neutral', 'faithful', 'finedetail', 'portrait', 'landscape', 'monochrome'] as const;
export const editableBaseId = (key: string) => `base:${key}`;

export function buildEditableBase(source: Uint8Array, base: BaseStyle, ks: Keystream): Uint8Array {
  let c = source;
  for (const p of [...IDENTITY_COMMON, ...(IDENTITY_PER_BASE[base.key] ?? [])]) c = buildLookCarrier(c, p, base.name, ks);
  return encodeCarrier(withBaseHeader(decodeCarrier(c, ks), base.id, base.sharpness, base.fineness, base.threshold), ks);
}

export function editableBases(source: Uint8Array, ks: Keystream): CarrierLook[] {
  const out: CarrierLook[] = [];
  for (const key of EDITABLE_BASE_KEYS) {
    const base = BASE_STYLES.find((b) => b.key === key)!;
    const q = IDENTITY_QUALITY[key];
    const fidelity = q === undefined ? '' : q <= 2.6 ? ' Matches the plain Canon style closely.' : ` Approximates the plain Canon style (measured ΔE ${q}).`;
    out.push(carrierLook(editableBaseId(key), `Canon ${base.name} (editable)`, buildEditableBase(source, base, ks), 'generated', `A colour table that renders like Canon ${base.name}, for the style editor.${fidelity}`));
  }
  return out;
}
