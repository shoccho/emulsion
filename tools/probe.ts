// Node runner for the M0 read-only probe.
// Usage: npm run probe -- [info|read]
// Writes results to fixtures-private/<timestamp>-<level>/ (gitignored, never commit).

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WebUSB } from 'usb';
import { WebUsbTransport } from '../src/ptp/webusb-transport';
import { runProbe, type ProbeLevel } from '../src/canon/probe';
import { CANON_VENDOR_ID } from '../src/canon/ops';

const level = (process.argv[2] ?? 'info') as ProbeLevel;
if (level !== 'info' && level !== 'read') {
  console.error('usage: npm run probe -- [info|read]');
  process.exit(2);
}

const webusb = new WebUSB({ allowAllDevices: true });
const devices = (await webusb.getDevices()).filter((d) => d.vendorId === CANON_VENDOR_ID);
if (devices.length === 0) {
  console.error('No Canon USB device found. Is the camera on and connected by cable?');
  process.exit(1);
}
const device = devices[0]!;
console.log(`found ${device.productName ?? '?'} ${device.vendorId.toString(16)}:${device.productId.toString(16)}`);

const verbose = process.env.VERBOSE === '1';
const t = new WebUsbTransport(device, { log: verbose ? (l) => console.log('  usb', l) : undefined });
await t.open();
let result;
try {
  result = await runProbe(t, { level, log: (l) => console.log(l) });
} finally {
  await t.close().catch((e) => console.error('close failed:', e));
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = join('fixtures-private', `${stamp}-${level}`);
await mkdir(dir, { recursive: true });
for (const [name, bytes] of Object.entries(result.blobs)) await writeFile(join(dir, name), bytes);
const { blobs, ...summary } = result;
const blobSizes = Object.fromEntries(Object.entries(blobs).map(([k, v]) => [k, v.length]));
await writeFile(join(dir, 'summary.json'), JSON.stringify({ usb: { vendorId: device.vendorId, productId: device.productId }, ...summary, blobSizes }, null, 2));

console.log('\nadvertised (relevant):');
for (const [k, v] of Object.entries(result.advertised)) console.log(`  ${v ? 'yes' : ' no'}  ${k}`);
if (Object.keys(result.props).length) {
  console.log('\nproperties seen in events:');
  for (const [k, v] of Object.entries(result.props)) console.log(`  ${k} ${v.name.padEnd(24)} ${String(v.bytes).padStart(6)}B  ${v.firstBytesHex}`);
}
if (result.cleanupErrors.length) console.log('\nCLEANUP ERRORS:', result.cleanupErrors);
console.log(`\nsaved to ${dir}`);
