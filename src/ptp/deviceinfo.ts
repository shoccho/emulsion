// Parser for the PTP GetDeviceInfo dataset (ISO 15740 5.5.1).

export interface DeviceInfo {
  standardVersion: number;
  vendorExtensionId: number;
  vendorExtensionVersion: number;
  vendorExtensionDesc: string;
  functionalMode: number;
  operationsSupported: number[];
  eventsSupported: number[];
  devicePropertiesSupported: number[];
  captureFormats: number[];
  imageFormats: number[];
  manufacturer: string;
  model: string;
  deviceVersion: string;
  serialNumber: string;
}

export class Reader {
  private pos = 0;
  private readonly dv: DataView;

  constructor(readonly bytes: Uint8Array) {
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get offset(): number {
    return this.pos;
  }

  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  private need(n: number, what: string): void {
    if (this.pos + n > this.bytes.length) {
      throw new Error(`truncated: need ${n} bytes for ${what} at offset ${this.pos}, have ${this.remaining}`);
    }
  }

  u8(what = 'u8'): number {
    this.need(1, what);
    return this.dv.getUint8(this.pos++);
  }

  u16(what = 'u16'): number {
    this.need(2, what);
    const v = this.dv.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(what = 'u32'): number {
    this.need(4, what);
    const v = this.dv.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  bytesN(n: number, what = 'bytes'): Uint8Array {
    this.need(n, what);
    const v = this.bytes.slice(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }

  /** PTP string: u8 char count incl. NUL terminator, then UTF-16LE code units. 0 = empty. */
  ptpString(what = 'string'): string {
    const n = this.u8(`${what} length`);
    if (n === 0) return '';
    const units: number[] = [];
    for (let i = 0; i < n; i++) units.push(this.u16(what));
    while (units.length && units[units.length - 1] === 0) units.pop();
    return String.fromCharCode(...units);
  }

  u16Array(what = 'u16 array'): number[] {
    const n = this.u32(`${what} count`);
    if (n * 2 > this.remaining) throw new Error(`truncated: ${what} declares ${n} items, only ${this.remaining} bytes left`);
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(this.u16(what));
    return out;
  }
}

export function parseDeviceInfo(bytes: Uint8Array): DeviceInfo {
  const r = new Reader(bytes);
  return {
    standardVersion: r.u16('StandardVersion'),
    vendorExtensionId: r.u32('VendorExtensionID'),
    vendorExtensionVersion: r.u16('VendorExtensionVersion'),
    vendorExtensionDesc: r.ptpString('VendorExtensionDesc'),
    functionalMode: r.u16('FunctionalMode'),
    operationsSupported: r.u16Array('OperationsSupported'),
    eventsSupported: r.u16Array('EventsSupported'),
    devicePropertiesSupported: r.u16Array('DevicePropertiesSupported'),
    captureFormats: r.u16Array('CaptureFormats'),
    imageFormats: r.u16Array('ImageFormats'),
    manufacturer: r.ptpString('Manufacturer'),
    model: r.ptpString('Model'),
    deviceVersion: r.ptpString('DeviceVersion'),
    serialNumber: r.ptpString('SerialNumber'),
  };
}

/** Builds a DeviceInfo dataset. Used for tests and the mock camera. */
export function encodeDeviceInfo(d: DeviceInfo): Uint8Array {
  const parts: number[] = [];
  const u8 = (v: number) => parts.push(v & 0xff);
  const u16 = (v: number) => {
    u8(v);
    u8(v >> 8);
  };
  const u32 = (v: number) => {
    u16(v & 0xffff);
    u16((v >>> 16) & 0xffff);
  };
  const str = (s: string) => {
    if (!s) return u8(0);
    u8(s.length + 1);
    for (let i = 0; i < s.length; i++) u16(s.charCodeAt(i));
    u16(0);
  };
  const arr = (a: number[]) => {
    u32(a.length);
    a.forEach(u16);
  };
  u16(d.standardVersion);
  u32(d.vendorExtensionId);
  u16(d.vendorExtensionVersion);
  str(d.vendorExtensionDesc);
  u16(d.functionalMode);
  arr(d.operationsSupported);
  arr(d.eventsSupported);
  arr(d.devicePropertiesSupported);
  arr(d.captureFormats);
  arr(d.imageFormats);
  str(d.manufacturer);
  str(d.model);
  str(d.deviceVersion);
  str(d.serialNumber);
  return Uint8Array.from(parts);
}
