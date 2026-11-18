// File formats for export/import: slot backups, looks, recipes. JSON with base64 for bytes.

import { STATE_LENGTH_R100, STYLE_LENGTH_R100, checkStateShape, checkStyleShape, type Slot } from '../canon/registration';
import type { Recipe } from '../recipe/schema';
import type { StoredBackup, StoredLook } from './db';

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface BackupFile {
  kind: 'r100-slot-backup';
  version: 1;
  slot: Slot;
  model: string;
  firmware: string;
  takenAt: string;
  label: string;
  style: string;
  state: string;
}

export function backupToFile(b: StoredBackup): BackupFile {
  return { kind: 'r100-slot-backup', version: 1, slot: b.slot, model: b.model, firmware: b.firmware, takenAt: b.takenAt, label: b.label, style: toBase64(b.style), state: toBase64(b.state) };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

export function parseBackupFile(text: string, idPrefix = 'file'): StoredBackup {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!isObj(d) || d.kind !== 'r100-slot-backup' || d.version !== 1) throw new Error('This is not a Recipe Loader slot backup file.');
  if (d.slot !== 1 && d.slot !== 2 && d.slot !== 3) throw new Error('Backup has no valid slot number.');
  if (typeof d.style !== 'string' || typeof d.state !== 'string') throw new Error('Backup is missing its data.');
  let style: Uint8Array;
  let state: Uint8Array;
  try {
    style = fromBase64(d.style);
    state = fromBase64(d.state);
  } catch {
    throw new Error('Backup data is damaged.');
  }
  if (style.length !== STYLE_LENGTH_R100 || state.length !== STATE_LENGTH_R100) throw new Error('Backup data has the wrong size for an R100.');
  checkStyleShape(style);
  checkStateShape(state);
  const takenAt = typeof d.takenAt === 'string' ? d.takenAt : new Date().toISOString();
  return {
    id: `${idPrefix}-${takenAt}-${d.slot}`,
    slot: d.slot,
    model: typeof d.model === 'string' ? d.model : 'unknown',
    firmware: typeof d.firmware === 'string' ? d.firmware : 'unknown',
    takenAt,
    reason: 'imported from file',
    label: typeof d.label === 'string' ? d.label : 'backup',
    style,
    state,
  };
}

export interface LookFile {
  kind: 'r100-look';
  version: 1;
  name: string;
  carrier: string;
}

export function lookToFile(l: { name: string; carrier: Uint8Array }): LookFile {
  return { kind: 'r100-look', version: 1, name: l.name, carrier: toBase64(l.carrier) };
}

export function parseLookFile(text: string): { name: string; carrier: Uint8Array } {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!isObj(d) || d.kind !== 'r100-look' || d.version !== 1 || typeof d.carrier !== 'string') throw new Error('This is not a Recipe Loader look file.');
  const carrier = fromBase64(d.carrier);
  checkStyleShape(carrier);
  return { name: typeof d.name === 'string' && d.name ? d.name.slice(0, 80) : 'Imported look', carrier };
}

export function recipesToFile(recipes: Recipe[]): string {
  return JSON.stringify(recipes.length === 1 ? recipes[0] : recipes, null, 2);
}

export function storedLookId(): string {
  return `look-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Browser download of a text file. */
export function downloadText(filename: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function readFileText(file: File): Promise<string> {
  if (file.size > 2_000_000) throw new Error('File is too large.');
  return file.text();
}

export type { StoredLook };
