// PTP-over-USB container codec. All fields little-endian.
// Layout: u32 length (incl. 12-byte header), u16 type, u16 code, u32 transactionId, payload.

export const HEADER_SIZE = 12;

export const ContainerType = {
  Command: 1,
  Data: 2,
  Response: 3,
  Event: 4,
} as const;
export type ContainerTypeValue = (typeof ContainerType)[keyof typeof ContainerType];

export interface Container {
  type: number;
  code: number;
  transactionId: number;
  payload: Uint8Array;
}

/** Hard ceiling on a single container, to reject garbage length words. */
export const MAX_CONTAINER_SIZE = 64 * 1024 * 1024;

export function encodeContainer(c: Container): Uint8Array {
  const out = new Uint8Array(HEADER_SIZE + c.payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, out.length, true);
  dv.setUint16(4, c.type, true);
  dv.setUint16(6, c.code, true);
  dv.setUint32(8, c.transactionId >>> 0, true);
  out.set(c.payload, HEADER_SIZE);
  return out;
}

export function encodeParams(params: readonly number[]): Uint8Array {
  if (params.length > 5) throw new Error(`PTP allows at most 5 params, got ${params.length}`);
  const out = new Uint8Array(params.length * 4);
  const dv = new DataView(out.buffer);
  params.forEach((p, i) => dv.setUint32(i * 4, p >>> 0, true));
  return out;
}

export function decodeParams(payload: Uint8Array): number[] {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const n = Math.min(5, Math.floor(payload.length / 4));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(dv.getUint32(i * 4, true));
  return out;
}

/** Decodes one complete container from exactly its bytes. */
export function decodeContainer(bytes: Uint8Array): Container {
  if (bytes.length < HEADER_SIZE) throw new Error(`container too short: ${bytes.length} bytes`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = dv.getUint32(0, true);
  if (length < HEADER_SIZE) throw new Error(`container length word too small: ${length}`);
  if (length !== bytes.length) throw new Error(`container length word ${length} != ${bytes.length} bytes`);
  return {
    type: dv.getUint16(4, true),
    code: dv.getUint16(6, true),
    transactionId: dv.getUint32(8, true),
    payload: bytes.slice(HEADER_SIZE, length),
  };
}

/**
 * Incremental decoder: feed arbitrary USB chunks, get whole containers out.
 * Zero-length chunks (USB ZLPs) are ignored.
 */
export class ContainerDecoder {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): Container[] {
    if (chunk.length === 0) return [];
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const out: Container[] = [];
    for (;;) {
      if (this.buf.length < 4) break;
      const length = new DataView(this.buf.buffer, this.buf.byteOffset, 4).getUint32(0, true);
      if (length < HEADER_SIZE) throw new Error(`container length word too small: ${length}`);
      if (length > MAX_CONTAINER_SIZE) throw new Error(`container length word too large: ${length}`);
      if (this.buf.length < length) break;
      out.push(decodeContainer(this.buf.slice(0, length)));
      this.buf = this.buf.slice(length);
    }
    return out;
  }

  /** Bytes still waiting for the rest of their container. */
  get pending(): number {
    return this.buf.length;
  }

  /** Total length the next container declares, if its length word has arrived. */
  get expectedLength(): number | null {
    if (this.buf.length < 4) return null;
    return new DataView(this.buf.buffer, this.buf.byteOffset, 4).getUint32(0, true);
  }

  reset(): void {
    this.buf = new Uint8Array(0);
  }
}
