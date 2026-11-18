// Camera-wide settings a recipe can set over USB: white balance, colour temperature, WB shift,
// High ISO noise reduction, Highlight tone priority. Encodings measured on the R100
// (docs/M0-findings.md "Camera settings"). Each is a 32-bit property written with 0x9110.

import { Prop } from './ops';
import type { CanonSession } from './session';

export interface CameraSettings {
  /** D109 value (see WB_MODES). */
  wbMode: number;
  /** D10A, Kelvin. Only used when wbMode is colour temperature. */
  kelvin: number;
  /** WB shift, amber(+)/blue(−), −9..9. D10B, same sign. */
  shiftAB: number;
  /** WB shift, magenta(+)/green(−), −9..9. D10C stores green as positive, so the sign is flipped on the wire. */
  shiftMG: number;
  /** D178 value (see NR_LEVELS). */
  highIsoNr: number;
  /** D13B: 0 off, 1 on (D+). */
  htp: number;
}

export type SettingKey = keyof CameraSettings;

/** R100 D109 values, in the camera's menu order (allowed list reported by the camera). */
export const WB_MODES: readonly { id: number; name: string }[] = [
  { id: 0, name: 'AWB (Ambience priority)' },
  { id: 23, name: 'AWB (White priority)' },
  { id: 1, name: 'Daylight' },
  { id: 8, name: 'Shade' },
  { id: 2, name: 'Cloudy' },
  { id: 3, name: 'Tungsten light' },
  { id: 4, name: 'White fluorescent light' },
  { id: 5, name: 'Flash' },
  { id: 6, name: 'Custom' },
  { id: 9, name: 'Colour temperature' },
];
export const WB_KELVIN_MODE = 9;

/** R100 D178 values. Low = 1 measured; the rest follow the camera's menu-ordered allowed list [3,1,0,2,4]. */
export const NR_LEVELS: readonly { id: number; name: string }[] = [
  { id: 3, name: 'Off' },
  { id: 1, name: 'Low' },
  { id: 0, name: 'Standard' },
  { id: 2, name: 'High' },
  { id: 4, name: 'Multi Shot' },
];

export const HTP_LEVELS: readonly { id: number; name: string }[] = [
  { id: 0, name: 'Off' },
  { id: 1, name: 'On (D+)' },
];

interface FieldDef {
  key: SettingKey;
  prop: number;
  label: string;
  toWire: (v: number) => number;
  fromWire: (v: number) => number;
}

const id = (v: number) => v;
export const FIELDS: readonly FieldDef[] = [
  { key: 'wbMode', prop: Prop.WhiteBalance, label: 'White balance', toWire: id, fromWire: id },
  { key: 'kelvin', prop: Prop.ColorTemperature, label: 'Colour temperature', toWire: id, fromWire: id },
  { key: 'shiftAB', prop: Prop.WhiteBalanceAdjustA, label: 'WB shift amber/blue', toWire: id, fromWire: id },
  { key: 'shiftMG', prop: Prop.WhiteBalanceAdjustB, label: 'WB shift magenta/green', toWire: (v) => -v, fromWire: (v) => (v === 0 ? 0 : -v) },
  { key: 'highIsoNr', prop: Prop.HighISONoiseReduction, label: 'High ISO noise reduction', toWire: id, fromWire: id },
  { key: 'htp', prop: Prop.HighlightTonePriority, label: 'Highlight tone priority', toWire: id, fromWire: id },
];

const nameOf = (list: readonly { id: number; name: string }[], v: number) => list.find((x) => x.id === v)?.name ?? `value ${v}`;
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

export function formatSetting(key: SettingKey, v: number): string {
  switch (key) {
    case 'wbMode':
      return nameOf(WB_MODES, v);
    case 'kelvin':
      return `${v} K`;
    case 'shiftAB':
      return v === 0 ? '0' : v > 0 ? `A${v}` : `B${-v}`;
    case 'shiftMG':
      return v === 0 ? '0' : v > 0 ? `M${v}` : `G${-v}`;
    case 'highIsoNr':
      return nameOf(NR_LEVELS, v);
    case 'htp':
      return nameOf(HTP_LEVELS, v);
  }
}

export const settingLabel = (key: SettingKey): string => FIELDS.find((f) => f.key === key)!.label;
export { signed as signedSetting };

function readInt(v: Uint8Array | undefined): number | null {
  if (!v || v.length < 4) return null;
  return new DataView(v.buffer, v.byteOffset, v.byteLength).getInt32(0, true);
}

/** Current settings from the session's event cache. Missing properties are omitted. */
export function readSettings(s: CanonSession): Partial<CameraSettings> {
  const out: Partial<CameraSettings> = {};
  for (const f of FIELDS) {
    const raw = readInt(s.props.get(f.prop));
    if (raw !== null) out[f.key] = f.fromWire(raw);
  }
  return out;
}

export interface SettingChange {
  key: SettingKey;
  from: number | undefined;
  to: number;
}

/** Which fields would change. Kelvin is only relevant in colour-temperature mode. */
export function diffSettings(current: Partial<CameraSettings>, target: Partial<CameraSettings>): SettingChange[] {
  const out: SettingChange[] = [];
  const mode = target.wbMode ?? current.wbMode;
  for (const f of FIELDS) {
    const to = target[f.key];
    if (to === undefined) continue;
    if (f.key === 'kelvin' && mode !== WB_KELVIN_MODE) continue;
    if (current[f.key] !== to) out.push({ key: f.key, from: current[f.key], to });
  }
  return out;
}

export function checkSettingValue(key: SettingKey, wire: number, allowed: number[] | undefined): void {
  if (allowed && allowed.length > 0 && !allowed.includes(wire)) {
    throw new Error(`${settingLabel(key)}: the camera does not accept ${formatSetting(key, FIELDS.find((f) => f.key === key)!.fromWire(wire))} right now`);
  }
  if ((key === 'shiftAB' || key === 'shiftMG') && (wire < -9 || wire > 9)) throw new Error(`${settingLabel(key)} must be within ±9`);
}

const u32le = (v: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, v, true);
  return b;
};

export interface ApplyResult {
  before: Partial<CameraSettings>;
  after: Partial<CameraSettings>;
  changes: SettingChange[];
  /** Fields whose read-back value differs from what was written. */
  mismatched: SettingKey[];
}

/**
 * Writes the changed fields one by one (white balance mode first), draining events after each,
 * then reads back. Validates every value against the camera's own allowed list first; nothing
 * is written if any value is refused. No automatic retry.
 */
export async function applySettings(s: CanonSession, target: Partial<CameraSettings>): Promise<ApplyResult> {
  await s.drain();
  const before = readSettings(s);
  const changes = diffSettings(before, target);
  const plan = changes.map((c) => {
    const f = FIELDS.find((x) => x.key === c.key)!;
    const wire = f.toWire(c.to);
    checkSettingValue(c.key, wire, s.allowed.get(f.prop));
    return { f, wire };
  });
  for (const { f, wire } of plan) {
    await s.setPropEx(f.prop, u32le(wire));
    await s.drain();
  }
  await s.drain();
  const after = readSettings(s);
  const mismatched = changes.filter((c) => after[c.key] !== c.to).map((c) => c.key);
  return { before, after, changes, mismatched };
}
