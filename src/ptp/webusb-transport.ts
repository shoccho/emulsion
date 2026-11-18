// Transport over the WebUSB API. Takes a USBDevice so the same code runs in Chrome
// (navigator.usb) and in Node (the `usb` package's WebUSB implementation).

import { ContainerDecoder, ContainerType, encodeContainer, encodeParams, decodeParams, type Container } from './container';
import { TimeoutError, hex, type TransactRequest, type TransactResult, type Transport } from './transport';

const PTP_CLASS = 0x06;
const PTP_SUBCLASS = 0x01;
const PTP_PROTOCOL = 0x01;
const OP_OPEN_SESSION = 0x1002;
const IN_CHUNK = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface PtpInterfaceInfo {
  configurationValue: number;
  interfaceNumber: number;
  alternateSetting: number;
  bulkIn: number;
  bulkOut: number;
  interruptIn: number | null;
  bulkOutPacketSize: number;
}

export function findPtpInterface(device: USBDevice): PtpInterfaceInfo | null {
  for (const cfg of device.configurations) {
    for (const iface of cfg.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass !== PTP_CLASS || alt.interfaceSubclass !== PTP_SUBCLASS || alt.interfaceProtocol !== PTP_PROTOCOL) continue;
        let bulkIn: number | null = null;
        let bulkOut: number | null = null;
        let interruptIn: number | null = null;
        let bulkOutPacketSize = 512;
        for (const ep of alt.endpoints) {
          if (ep.type === 'bulk' && ep.direction === 'in') bulkIn = ep.endpointNumber;
          if (ep.type === 'bulk' && ep.direction === 'out') {
            bulkOut = ep.endpointNumber;
            bulkOutPacketSize = ep.packetSize;
          }
          if (ep.type === 'interrupt' && ep.direction === 'in') interruptIn = ep.endpointNumber;
        }
        if (bulkIn === null || bulkOut === null) continue;
        return {
          configurationValue: cfg.configurationValue,
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alt.alternateSetting,
          bulkIn,
          bulkOut,
          interruptIn,
          bulkOutPacketSize,
        };
      }
    }
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

export interface WebUsbTransportOptions {
  /** Called for each USB transfer, for debugging. */
  log?: (line: string) => void;
}

export class WebUsbTransport implements Transport {
  private info: PtpInterfaceInfo | null = null;
  private nextTid = 0;
  private decoder = new ContainerDecoder();
  private busy = false;

  constructor(
    readonly device: USBDevice,
    private readonly opts: WebUsbTransportOptions = {},
  ) {}

  get interfaceInfo(): PtpInterfaceInfo | null {
    return this.info;
  }

  async open(): Promise<void> {
    const info = findPtpInterface(this.device);
    if (!info) throw new Error('No PTP (still image class 6/1/1) interface with bulk endpoints found on this device.');
    if (!this.device.opened) await this.device.open();
    if (this.device.configuration?.configurationValue !== info.configurationValue) {
      await this.device.selectConfiguration(info.configurationValue);
    }
    await this.device.claimInterface(info.interfaceNumber);
    if (info.alternateSetting !== 0) await this.device.selectAlternateInterface(info.interfaceNumber, info.alternateSetting);
    this.info = info;
    this.decoder.reset();
    this.log(`claimed interface ${info.interfaceNumber} in=${info.bulkIn} out=${info.bulkOut} int=${info.interruptIn ?? '-'} pkt=${info.bulkOutPacketSize}`);
  }

  async close(): Promise<void> {
    const info = this.info;
    this.info = null;
    try {
      if (info && this.device.opened) await this.device.releaseInterface(info.interfaceNumber);
    } finally {
      if (this.device.opened) await this.device.close();
    }
  }

  async transact(req: TransactRequest): Promise<TransactResult> {
    const info = this.info;
    if (!info) throw new Error('transport not open');
    if (this.busy) throw new Error('transport busy: PTP transactions must not overlap');
    this.busy = true;
    try {
      const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      if (req.code === OP_OPEN_SESSION) this.nextTid = 0;
      const tid = this.nextTid++;
      return await withTimeout(this.run(info, tid, req), timeoutMs, `PTP op 0x${hex(req.code)}`);
    } finally {
      this.busy = false;
    }
  }

  private async run(info: PtpInterfaceInfo, tid: number, req: TransactRequest): Promise<TransactResult> {
    const cmd = encodeContainer({ type: ContainerType.Command, code: req.code, transactionId: tid, payload: encodeParams(req.params ?? []) });
    this.log(`-> cmd 0x${hex(req.code)} tid=${tid} params=[${(req.params ?? []).map((p) => '0x' + hex(p, 1)).join(',')}]`);
    await this.out(info, cmd);

    if (req.dataOut) {
      const data = encodeContainer({ type: ContainerType.Data, code: req.code, transactionId: tid, payload: req.dataOut });
      this.log(`-> data ${req.dataOut.length} bytes`);
      await this.out(info, data);
      if (data.length % info.bulkOutPacketSize === 0) await this.device.transferOut(info.bulkOut, new Uint8Array(0));
    }

    let dataIn: Uint8Array | undefined;
    for (;;) {
      const c = await this.readContainer(info);
      if (c.type === ContainerType.Data) {
        this.log(`<- data ${c.payload.length} bytes`);
        dataIn = dataIn ? concat(dataIn, c.payload) : c.payload;
        continue;
      }
      if (c.type === ContainerType.Response) {
        const params = decodeParams(c.payload);
        this.log(`<- resp 0x${hex(c.code)} tid=${c.transactionId}`);
        if (c.transactionId !== tid) this.log(`!! response tid ${c.transactionId} != expected ${tid}`);
        return dataIn ? { responseCode: c.code, params, dataIn } : { responseCode: c.code, params };
      }
      this.log(`<- unexpected container type ${c.type} code 0x${hex(c.code)} (ignored)`);
    }
  }

  private async out(info: PtpInterfaceInfo, bytes: Uint8Array): Promise<void> {
    const r = await this.device.transferOut(info.bulkOut, bytes as Uint8Array<ArrayBuffer>);
    if (r.status !== 'ok') throw new Error(`bulk OUT failed: ${r.status}`);
    if (r.bytesWritten !== bytes.length) throw new Error(`bulk OUT short write: ${r.bytesWritten}/${bytes.length}`);
  }

  private pendingContainers: Container[] = [];

  private async readContainer(info: PtpInterfaceInfo): Promise<Container> {
    for (;;) {
      const queued = this.pendingContainers.shift();
      if (queued) return queued;
      const r = await this.device.transferIn(info.bulkIn, IN_CHUNK);
      if (r.status === 'stall') {
        await this.device.clearHalt('in', info.bulkIn);
        throw new Error('bulk IN stalled');
      }
      if (r.status !== 'ok') throw new Error(`bulk IN failed: ${r.status}`);
      const view = r.data;
      if (!view || view.byteLength === 0) continue; // zero-length packet
      const chunk = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
      this.pendingContainers.push(...this.decoder.push(chunk));
    }
  }

  private log(line: string): void {
    this.opts.log?.(line);
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
