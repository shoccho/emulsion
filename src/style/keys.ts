// Finds Canon's style key tables inside the user's own EOS Utility 3 plug-in file (EdsCFParse), so the app
// never ships them. Only fingerprints are embedded here: a 32-bit rolling hash and SHA-256 digests.
// None of them reveals any key bytes.
//
// In the plug-in they are two fixed constant arrays, Key1 (512 bytes) and Key2 (513 bytes), stored back to
// back (docs/M0-findings.md "Where the keys come from"). They are not derived from anything. The app keeps
// them in its own layout: each array rotated left by 12, so the block keystream starts stay as measured.

import { KEY_LENGTH } from './carrier-r100';

/** Fingerprints of Key1 followed by Key2, exactly as stored in the plug-in. */
const RAW_ROLLING = 0x43291f26;
const RAW_SHA256 = '3f1ee0fa5b8e9cf99b35146e4a5833c61dae3bfc7bce846ec8edefd4e83720f5';
/** Fingerprint of the app layout (see toAppLayout). */
const SHA256 = '8e848bf88a2342a282d52966cee64eaadccdba3d466d26a321907aeb4fd693ff';
const BASE = 257;
const ROTATE = 12;

/** Key1 ‖ Key2 as found in the plug-in -> the app's key layout (both arrays rotated left by 12). */
export function toAppLayout(raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(KEY_LENGTH);
  for (let i = 0; i < 512; i++) out[i] = raw[(i + ROTATE) % 512]!;
  for (let i = 0; i < 513; i++) out[512 + i] = raw[512 + ((i + ROTATE) % 513)]!;
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Polynomial rolling hash of a window, 32-bit. */
export function rollingHash(bytes: Uint8Array, start = 0, n = bytes.length): number {
  let h = 0;
  for (let i = start; i < start + n; i++) h = (Math.imul(h, BASE) + bytes[i]!) >>> 0;
  return h;
}

/**
 * Scans a file for the key tables. Returns the 1025 key bytes in the app layout, or null if this file does
 * not contain them. `fingerprint` (of the raw Key1 ‖ Key2 block) is overridable for tests.
 */
export async function findKeysInFile(file: Uint8Array, fingerprint = { rolling: RAW_ROLLING, sha256: RAW_SHA256 }): Promise<Uint8Array | null> {
  const n = KEY_LENGTH;
  if (file.length < n) return null;
  let pow = 1;
  for (let i = 0; i < n; i++) pow = Math.imul(pow, BASE) >>> 0;
  let h = rollingHash(file, 0, n);
  for (let i = 0; ; i++) {
    if (h === fingerprint.rolling) {
      const cand = file.slice(i, i + n);
      if ((await sha256Hex(cand)) === fingerprint.sha256) return toAppLayout(cand);
    }
    if (i + n >= file.length) return null;
    h = (Math.imul(h, BASE) - Math.imul(file[i]!, pow) + file[i + n]!) >>> 0;
  }
}

/** True if these bytes are the expected key tables (app layout). Keys saved by older versions fail this and must be loaded again. */
export async function verifyKeys(keys: Uint8Array): Promise<boolean> {
  return keys.length === KEY_LENGTH && (await sha256Hex(keys)) === SHA256;
}
