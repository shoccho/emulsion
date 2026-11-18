// Parser for Canon EOS GetEvent (0x9116) data.
// The payload is a run of records: u32 size (incl. these 8 bytes), u32 type, body.
// A record with size 8 and type 0 ends the batch.

import { EventType } from './ops';

export type CanonEvent =
  | { kind: 'prop'; type: number; prop: number; value: Uint8Array; offset: number }
  | { kind: 'avail'; type: number; prop: number; dataType: number; count: number; body: Uint8Array; offset: number }
  | { kind: 'other'; type: number; body: Uint8Array; offset: number };

export interface EventBatch {
  events: CanonEvent[];
  /** True when the terminator record was found. */
  terminated: boolean;
  /** Bytes after the terminator or a malformed record, kept for diagnostics. */
  trailing: number;
  /** Non-null if parsing stopped on a malformed record. */
  error: string | null;
}

export function parseEventBatch(bytes: Uint8Array): EventBatch {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const events: CanonEvent[] = [];
  let pos = 0;
  while (pos + 8 <= bytes.length) {
    const size = dv.getUint32(pos, true);
    const type = dv.getUint32(pos + 4, true);
    if (size === 8 && type === 0) {
      return { events, terminated: true, trailing: bytes.length - pos - 8, error: null };
    }
    if (size < 8 || pos + size > bytes.length) {
      return { events, terminated: false, trailing: bytes.length - pos, error: `bad record size ${size} at offset ${pos}` };
    }
    const body = bytes.slice(pos + 8, pos + size);
    const bdv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    if (type === EventType.PropValueChanged && body.length >= 4) {
      events.push({ kind: 'prop', type, prop: bdv.getUint32(0, true), value: body.slice(4), offset: pos });
    } else if (type === EventType.AvailListChanged && body.length >= 12) {
      events.push({
        kind: 'avail',
        type,
        prop: bdv.getUint32(0, true),
        dataType: bdv.getUint32(4, true),
        count: bdv.getUint32(8, true),
        body,
        offset: pos,
      });
    } else {
      events.push({ kind: 'other', type, body, offset: pos });
    }
    pos += size;
  }
  if (pos === bytes.length && bytes.length === 0) {
    return { events, terminated: false, trailing: 0, error: null };
  }
  return { events, terminated: false, trailing: bytes.length - pos, error: pos === bytes.length ? null : `truncated record at offset ${pos}` };
}

/** True if the batch carries nothing (only the terminator, or empty). */
export function isEmptyBatch(b: EventBatch): boolean {
  return b.events.length === 0;
}
