// Remote capture and download (research use). Press full with manual focus, release, wait for
// the camera to report the new file (0xC181), then download the JPEG. Files stay on the card.

import { PtpError, ResponseCode } from '../ptp/transport';
import { Op, Prop } from './ops';
import type { CanonSession } from './session';

export const CaptureOp = {
  GetObjectInfo: 0x1008,
  GetObject: 0x1009,
  RemoteReleaseOn: 0x9128,
  RemoteReleaseOff: 0x9129,
} as const;
/** 0xC181 ObjectAddedEx (older bodies), 0xC1A7 ObjectAddedEx64 (R100). Body starts with the u32 handle. */
const OBJECT_ADDED: ReadonlySet<number> = new Set([0xc181, 0xc1a7]);
const FORMAT_JPEG = 0x3801;

export interface CapturedFile {
  handle: number;
  format: number;
  bytes: Uint8Array;
}

export async function captureJpeg(s: CanonSession, opts: { waitMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<CapturedFile> {
  s.requireOps([CaptureOp.RemoteReleaseOn, CaptureOp.RemoteReleaseOff, CaptureOp.GetObjectInfo, CaptureOp.GetObject]);
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  await s.drain();
  const on = await s.call(CaptureOp.RemoteReleaseOn, [3, 1]); // full press, manual focus
  try {
    if (on.responseCode !== ResponseCode.OK) throw new PtpError(CaptureOp.RemoteReleaseOn, on.responseCode, `shutter refused (0x${on.responseCode.toString(16)}); check the camera is in a shooting mode with a card`);
  } finally {
    await s.call(CaptureOp.RemoteReleaseOff, [3]);
  }
  const handles: number[] = [];
  const deadline = Date.now() + (opts.waitMs ?? 15000);
  while (Date.now() < deadline) {
    await sleep(250);
    for (const ev of await s.pollOnce()) {
      if (ev.kind === 'other' && OBJECT_ADDED.has(ev.type) && ev.body.length >= 4) {
        handles.push(new DataView(ev.body.buffer, ev.body.byteOffset).getUint32(0, true));
      }
    }
    if (handles.length) {
      // RAW+JPEG produces two files; give the second one a moment to appear.
      await sleep(600);
      for (const ev of await s.pollOnce()) {
        if (ev.kind === 'other' && OBJECT_ADDED.has(ev.type) && ev.body.length >= 4) handles.push(new DataView(ev.body.buffer, ev.body.byteOffset).getUint32(0, true));
      }
      break;
    }
  }
  if (!handles.length) throw new Error('the camera did not report a new photo');
  for (const h of handles) {
    const info = await s.t.transact({ code: CaptureOp.GetObjectInfo, params: [h], expectDataIn: true });
    if (info.responseCode !== ResponseCode.OK || !info.dataIn || info.dataIn.length < 6) continue;
    const format = new DataView(info.dataIn.buffer, info.dataIn.byteOffset).getUint16(4, true);
    if (format !== FORMAT_JPEG) continue;
    const obj = await s.t.transact({ code: CaptureOp.GetObject, params: [h], expectDataIn: true, timeoutMs: 120000 });
    if (obj.responseCode !== ResponseCode.OK || !obj.dataIn) throw new PtpError(CaptureOp.GetObject, obj.responseCode);
    await s.drain();
    return { handle: h, format, bytes: obj.dataIn };
  }
  throw new Error('no JPEG among the new files; set image quality to include JPEG');
}

/** Selects which picture style the camera uses (0x21..0x23 = User Def. 1..3). */
export async function selectPictureStyle(s: CanonSession, id: number): Promise<void> {
  const v = new Uint8Array(4);
  new DataView(v.buffer).setUint32(0, id, true);
  await s.setPropEx(Prop.PictureStyle, v);
  await s.drain();
}

export { Op };
