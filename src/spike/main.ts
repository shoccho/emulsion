// M0 browser spike: same read-only probe as tools/probe.ts, over navigator.usb.

import { WebUsbTransport } from '../ptp/webusb-transport';
import { runProbe, type ProbeLevel, type ProbeResult } from '../canon/probe';
import { CANON_VENDOR_ID } from '../canon/ops';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $('log');
const saveBtn = $<HTMLButtonElement>('save');
let last: ProbeResult | null = null;

const log = (l: string) => {
  logEl.textContent += l + '\n';
};

if (!('usb' in navigator)) {
  $('support').innerHTML = '<b class="warn">This browser has no WebUSB. Use Chrome, Edge or Opera on desktop or Android.</b>';
}

async function go(level: ProbeLevel) {
  logEl.textContent = '';
  let device: USBDevice;
  try {
    device = await navigator.usb.requestDevice({ filters: [{ vendorId: CANON_VENDOR_ID }] });
  } catch (e) {
    log(`No device chosen: ${String(e)}`);
    return;
  }
  log(`device ${device.productName ?? '?'} ${device.vendorId.toString(16)}:${device.productId.toString(16)}`);
  const t = new WebUsbTransport(device, { log: (l) => log('  usb ' + l) });
  try {
    await t.open();
  } catch (e) {
    log(`OPEN/CLAIM FAILED: ${String(e)}`);
    log(`platform: ${navigator.userAgent}`);
    log('On macOS another app (Image Capture / Photos / ptpcamerad) may hold the camera. On Windows the driver must be WinUSB (Zadig).');
    return;
  }
  try {
    last = await runProbe(t, { level, log });
    log('\nadvertised:');
    for (const [k, v] of Object.entries(last.advertised)) log(`  ${v ? 'yes' : ' no'}  ${k}`);
    log('\nprops:');
    for (const [k, v] of Object.entries(last.props)) log(`  ${k} ${v.name} ${v.bytes}B ${v.firstBytesHex}`);
    if (last.cleanupErrors.length) log(`CLEANUP ERRORS: ${last.cleanupErrors.join('; ')}`);
    saveBtn.disabled = false;
  } catch (e) {
    log(`PROBE FAILED: ${String(e)}`);
  } finally {
    await t.close().catch((e) => log(`close failed: ${String(e)}`));
  }
}

function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

saveBtn.onclick = () => {
  if (!last) return;
  const { blobs, ...summary } = last;
  const json = JSON.stringify({ ...summary, ua: navigator.userAgent, blobs: Object.fromEntries(Object.entries(blobs).map(([k, v]) => [k, toB64(v)])) }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `canon-probe-${last.info.model.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Date.now()}.json`;
  a.click();
};

$('info').onclick = () => void go('info');
$('read').onclick = () => void go('read');
