// Registration of a style into a User Def. slot. PLAN.md 5.3 + section 6 safety rules,
// corrected by docs/M0-findings.md: the R100 has no 0x9189/0x918A, so the style goes
// through 0x9110 with prop D170+slot-1 and is read back with 0x9127 + GetEvent.

import { Op, Prop } from './ops';
import { encodeSetPropEx, type CanonSession } from './session';

export type Slot = 1 | 2 | 3;

export const STYLE_LENGTH_R100 = 16720;
export const STATE_LENGTH_R100 = 44;

export const styleProp = (slot: Slot): number => Prop.PictureStyleParam1 + (slot - 1);
export const stateProp = (slot: Slot): number => Prop.PictureStyleExUserSet1 + (slot - 1);

export interface SlotBackup {
  slot: Slot;
  model: string;
  firmware: string;
  takenAt: string;
  style: Uint8Array;
  state: Uint8Array;
}

export interface WireStep {
  label: 'lock' | 'style' | 'state' | 'unlock';
  code: number;
  dataOut?: Uint8Array;
}

/** Pure: the exact wire steps for writing `style` and `state` into `slot`. */
export function planRegistration(slot: Slot, style: Uint8Array, state: Uint8Array): WireStep[] {
  checkStyleShape(style);
  checkStateShape(state);
  return [
    { label: 'lock', code: Op.SetUILock },
    { label: 'style', code: Op.SetDevicePropValueEx, dataOut: encodeSetPropEx(styleProp(slot), style) },
    { label: 'state', code: Op.SetDevicePropValueEx, dataOut: encodeSetPropEx(stateProp(slot), state) },
    { label: 'unlock', code: Op.ResetUILock },
  ];
}

export function checkStyleShape(style: Uint8Array): void {
  if (style.length !== STYLE_LENGTH_R100) throw new Error(`style is ${style.length} bytes, R100 needs ${STYLE_LENGTH_R100}`);
  const len = new DataView(style.buffer, style.byteOffset, 4).getUint32(0, true);
  if (len !== STYLE_LENGTH_R100) throw new Error(`style length word ${len} != ${STYLE_LENGTH_R100}`);
}

export function checkStateShape(state: Uint8Array): void {
  if (state.length !== STATE_LENGTH_R100) throw new Error(`state is ${state.length} bytes, R100 needs ${STATE_LENGTH_R100}`);
  const len = new DataView(state.buffer, state.byteOffset, 4).getUint32(0, true);
  if (len !== STATE_LENGTH_R100) throw new Error(`state length word ${len} != ${STATE_LENGTH_R100}`);
}

export const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Reads the slot fresh in this session. Never uses saved state. */
export async function readSlot(s: CanonSession, slot: Slot): Promise<SlotBackup> {
  if (!s.info) throw new Error('not connected');
  await s.drain();
  const state = s.props.get(stateProp(slot));
  if (!state) throw new Error(`camera did not report slot ${slot} state in this session`);
  const style = await s.requestProp(styleProp(slot));
  return { slot, model: s.info.model, firmware: s.info.firmware, takenAt: new Date().toISOString(), style, state: state.slice() };
}

export type WriteStage = 'preflight' | 'backup' | 'lock' | 'style' | 'state' | 'unlock' | 'verify';

export class WriteError extends Error {
  constructor(
    readonly stage: WriteStage,
    cause: unknown,
  ) {
    super(`write failed at stage "${stage}": ${String(cause)}`);
    this.name = 'WriteError';
  }
}

export interface WriteOptions {
  slot: Slot;
  style: Uint8Array;
  /** Called with the fresh backup; the write only proceeds after it resolves. */
  onBackup: (b: SlotBackup) => Promise<void>;
  /** Defaults to the slot's live state (no-op on state). */
  state?: (live: Uint8Array) => Uint8Array;
  /** Progress callback, called as each stage starts. */
  onStage?: (stage: WriteStage) => void;
}

export interface WriteResult {
  verified: boolean;
  before: SlotBackup;
  after: SlotBackup;
}

/**
 * Writes a style into a slot. Enforces: allowlisted model, advertised ops, fresh backup
 * before writing, shape checks, no retries, UI unlock in finally, byte-exact readback.
 */
export async function writeSlot(s: CanonSession, o: WriteOptions): Promise<WriteResult> {
  let stage: WriteStage = 'preflight';
  const enter = (st: WriteStage) => {
    stage = st;
    o.onStage?.(st);
  };
  try {
    o.onStage?.('preflight');
    if (!s.info) throw new Error('not connected');
    if (s.info.model !== 'Canon EOS R100') throw new Error(`model "${s.info.model}" is not supported for writes`);
    s.requireOps([Op.SetDevicePropValueEx, Op.SetUILock, Op.ResetUILock, Op.RequestDevicePropValue, Op.GetEvent]);
    checkStyleShape(o.style);

    enter('backup');
    const before = await readSlot(s, o.slot);
    checkStyleShape(before.style);
    checkStateShape(before.state);
    await o.onBackup(before);

    const state = o.state ? o.state(before.state.slice()) : before.state;
    const steps = planRegistration(o.slot, o.style, state);

    let locked = false;
    let failure: unknown = null;
    try {
      for (const step of steps) {
        if (step.label === 'unlock') continue; // always done below
        enter(step.label);
        await s.callOk(step.code, [], step.dataOut ? { dataOut: step.dataOut } : {});
        if (step.label === 'lock') locked = true;
        await s.drain();
      }
    } catch (e) {
      failure = new WriteError(stage, e);
    }
    if (locked) {
      try {
        await s.callOk(Op.ResetUILock);
      } catch (e) {
        failure ??= new WriteError('unlock', e);
      }
    }
    if (failure) throw failure;

    enter('verify');
    const after = await readSlot(s, o.slot);
    const verified = equalBytes(after.style, o.style) && equalBytes(after.state, state);
    return { verified, before, after };
  } catch (e) {
    if (e instanceof WriteError) throw e;
    throw new WriteError(stage, e);
  }
}
