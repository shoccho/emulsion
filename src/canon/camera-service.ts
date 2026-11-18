// High-level camera operations for the app. Each operation runs in its own short
// PTP session (open → connect → work → disconnect → close), serialized one at a time.

import type { Transport } from '../ptp/transport';
import { Op, Prop } from './ops';
import { readSlot, writeSlot, type Slot, type SlotBackup, type WriteResult, type WriteStage } from './registration';
import { CanonSession, type CameraInfo } from './session';
import { applySettings, readSettings, type ApplyResult, type CameraSettings } from './camera-settings';
import { applyStateWords, decodeState, type StateWords } from './slot-state';
import { baseById, isEmptyStyle, parseCarrierHeader, type CarrierHeader } from './styles';

export interface SlotInfo {
  slot: Slot;
  style: Uint8Array;
  state: Uint8Array;
  words: StateWords;
  header: CarrierHeader;
  /** Human label: base style name, or the computer style's own name. */
  label: string;
  kind: 'base' | 'pc';
}

export interface Battery {
  raw: number | null;
  label: string;
  /** False when too low to write safely. */
  okToWrite: boolean;
}

export interface CameraSnapshot {
  info: CameraInfo;
  battery: Battery;
  slots: SlotInfo[];
  /** Camera-wide settings a recipe can set (white balance, WB shift, NR, HTP). */
  settings: Partial<CameraSettings>;
  readAt: string;
}

/** What to put in a slot: style data plus the adjustable state words. */
export interface SlotTarget {
  style: Uint8Array;
  words: StateWords;
}

// libgphoto2 _get_Canon_EOS_BatteryLevel.
const BATTERY: Record<number, string> = { 0: 'Low', 1: '50%', 2: '100%', 4: '75%', 5: '25%' };

export function decodeBattery(v: Uint8Array | undefined): Battery {
  if (!v || v.length < 2) return { raw: null, label: 'unknown', okToWrite: true };
  const raw = new DataView(v.buffer, v.byteOffset, v.byteLength).getUint16(0, true);
  return { raw, label: BATTERY[raw] ?? `unknown (${raw})`, okToWrite: raw !== 0 };
}

export function describeSlot(slot: Slot, style: Uint8Array, state: Uint8Array): SlotInfo {
  const words = decodeState(state);
  const header = parseCarrierHeader(style);
  if (words.base === 'pc') {
    return { slot, style, state, words, header, label: header.name || 'Computer style', kind: 'pc' };
  }
  return { slot, style, state, words, header, label: baseById(words.base)?.name ?? `Unknown style 0x${words.base.toString(16)}`, kind: 'base' };
}

/** A target must pair a computer style with 'pc', and a built-in base with empty style data. */
export function checkTarget(t: SlotTarget): void {
  const empty = isEmptyStyle(t.style);
  if (t.words.base === 'pc' && empty) throw new Error('a computer-style target needs style data');
  if (t.words.base !== 'pc' && !empty) throw new Error('a built-in base style target must use empty style data');
  if (t.words.base !== 'pc' && !baseById(t.words.base)) throw new Error(`unknown base style 0x${t.words.base.toString(16)}`);
}

export function targetFromBackup(b: { style: Uint8Array; state: Uint8Array }): SlotTarget {
  return { style: b.style, words: decodeState(b.state) };
}

export interface ServiceOptions {
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
}

export class CameraService {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly transport: Transport,
    readonly kind: 'usb' | 'demo',
    private readonly opts: ServiceOptions = {},
  ) {}

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  withSession<T>(fn: (s: CanonSession) => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      await this.transport.open();
      const s = new CanonSession(this.transport, this.opts);
      try {
        await s.connect();
        return await fn(s);
      } finally {
        const errs = await s.disconnect();
        for (const e of errs) this.opts.log?.(`cleanup: ${e}`);
        await this.transport.close().catch((e) => this.opts.log?.(`close: ${String(e)}`));
      }
    });
  }

  private async snapshotIn(s: CanonSession): Promise<CameraSnapshot> {
    const slots: SlotInfo[] = [];
    for (const slot of [1, 2, 3] as const) {
      const b = await readSlot(s, slot);
      slots.push(describeSlot(slot, b.style, b.state));
    }
    return { info: s.info!, battery: decodeBattery(s.props.get(Prop.BatteryPower)), slots, settings: readSettings(s), readAt: new Date().toISOString() };
  }

  readSnapshot(): Promise<CameraSnapshot> {
    return this.withSession((s) => this.snapshotIn(s));
  }

  /** Reads one slot as a backup (no write). */
  backupSlot(slot: Slot): Promise<SlotBackup> {
    return this.withSession((s) => readSlot(s, slot));
  }

  /**
   * Writes a target into a slot. The fresh backup is handed to `onBackup` before anything is
   * written; if it throws, nothing is written. Returns the write result and a fresh snapshot.
   */
  writeTarget(
    slot: Slot,
    target: SlotTarget,
    onBackup: (b: SlotBackup) => Promise<void>,
    onStage?: (stage: WriteStage) => void,
  ): Promise<{ result: WriteResult; snapshot: CameraSnapshot }> {
    checkTarget(target);
    return this.withSession(async (s) => {
      const battery = decodeBattery(s.props.get(Prop.BatteryPower));
      if (!battery.okToWrite) throw new Error(`battery is ${battery.label}; charge it before writing`);
      const result = await writeSlot(s, {
        slot,
        style: target.style,
        state: (live) => applyStateWords(live, target.words, slot),
        onBackup,
        onStage,
      });
      const snapshot = await this.snapshotIn(s);
      return { result, snapshot };
    });
  }

  /**
   * Sets camera-wide settings (white balance, WB shift, NR, HTP). Returns the values before the
   * change so the caller can offer an undo. Same model and battery checks as slot writes.
   */
  applyCameraSettings(target: Partial<CameraSettings>): Promise<{ result: ApplyResult; snapshot: CameraSnapshot }> {
    return this.withSession(async (s) => {
      if (s.info!.model !== 'Canon EOS R100') throw new Error(`model "${s.info!.model}" is not supported for writes`);
      s.requireOps([Op.SetDevicePropValueEx, Op.GetEvent]);
      const battery = decodeBattery(s.props.get(Prop.BatteryPower));
      if (!battery.okToWrite) throw new Error(`battery is ${battery.label}; charge it before writing`);
      const result = await applySettings(s, target);
      return { result, snapshot: await this.snapshotIn(s) };
    });
  }
}
