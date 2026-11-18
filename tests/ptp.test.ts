import { describe, expect, it } from 'vitest';
import { ContainerDecoder, ContainerType, decodeContainer, encodeContainer, encodeParams, decodeParams } from '../src/ptp/container';
import { encodeDeviceInfo, parseDeviceInfo, type DeviceInfo } from '../src/ptp/deviceinfo';

const sample = () =>
  encodeContainer({ type: ContainerType.Data, code: 0x1001, transactionId: 7, payload: Uint8Array.from([1, 2, 3, 4, 5]) });

describe('container', () => {
  it('round-trips', () => {
    const c = decodeContainer(sample());
    expect(c).toEqual({ type: 2, code: 0x1001, transactionId: 7, payload: Uint8Array.from([1, 2, 3, 4, 5]) });
  });

  it('round-trips params', () => {
    expect(decodeParams(encodeParams([1, 0xffffffff, 0xd170]))).toEqual([1, 0xffffffff, 0xd170]);
    expect(() => encodeParams([1, 2, 3, 4, 5, 6])).toThrow();
  });

  it('rejects bad length words', () => {
    const b = sample();
    new DataView(b.buffer).setUint32(0, 4, true);
    expect(() => decodeContainer(b)).toThrow(/too small/);
    expect(() => decodeContainer(b.slice(0, 8))).toThrow(/too short/);
  });

  it('decoder handles every split point and one-byte feeding', () => {
    const two = new Uint8Array([...sample(), ...encodeContainer({ type: 3, code: 0x2001, transactionId: 7, payload: new Uint8Array(0) })]);
    for (let split = 0; split <= two.length; split++) {
      const d = new ContainerDecoder();
      const got = [...d.push(two.slice(0, split)), ...d.push(two.slice(split))];
      expect(got.map((c) => c.type)).toEqual([2, 3]);
      expect(d.pending).toBe(0);
    }
    const d = new ContainerDecoder();
    const got = [];
    for (const byte of two) got.push(...d.push(Uint8Array.of(byte)));
    expect(got.length).toBe(2);
  });

  it('decoder rejects oversized length', () => {
    const d = new ContainerDecoder();
    expect(() => d.push(Uint8Array.from([0xff, 0xff, 0xff, 0x7f, 0, 0, 0, 0]))).toThrow(/too large/);
  });
});

describe('deviceinfo', () => {
  const di: DeviceInfo = {
    standardVersion: 100,
    vendorExtensionId: 11,
    vendorExtensionVersion: 100,
    vendorExtensionDesc: 'microsoft.com: 1.0;',
    functionalMode: 0,
    operationsSupported: [0x1001, 0x1002, 0x9116, 0x9127],
    eventsSupported: [0xc189],
    devicePropertiesSupported: [0xd111],
    captureFormats: [],
    imageFormats: [0x3801],
    manufacturer: 'Canon Inc.',
    model: 'Canon EOS R100',
    deviceVersion: '1-1.0.0',
    serialNumber: '0123456789',
  };

  it('round-trips a synthetic dataset', () => {
    expect(parseDeviceInfo(encodeDeviceInfo(di))).toEqual(di);
  });

  it('rejects truncation', () => {
    const b = encodeDeviceInfo(di);
    expect(() => parseDeviceInfo(b.slice(0, b.length - 3))).toThrow(/truncated/);
  });
});
