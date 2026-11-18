import { WebUSB } from 'usb';
import { WebUsbTransport } from '../../src/ptp/webusb-transport';
import { CanonSession } from '../../src/canon/session';
import { R100_USB } from '../../src/canon/ops';
const device = (await new WebUSB({ allowAllDevices: true }).getDevices()).find((d) => d.vendorId === R100_USB.vendorId && d.productId === R100_USB.productId);
if (!device) throw new Error('no R100');
const t = new WebUsbTransport(device);
const s = new CanonSession(t, { log: (l) => (l.startsWith('GetEvent') ? undefined : console.log(l)) });
await t.open();
try {
  await s.connect();
  await s.drain();
  const on = await s.call(0x9128, [3, 1]);
  console.log('release on ->', on.responseCode.toString(16));
  await s.call(0x9129, [3]);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    for (const ev of await s.pollOnce()) {
      if (ev.kind === 'prop') continue;
      const body = 'body' in ev ? ev.body : new Uint8Array();
      console.log(`t=${i * 250}ms event 0x${ev.type.toString(16)} ${ev.kind} body ${body.length}B ${Array.from(body.slice(0, 32), (b) => b.toString(16).padStart(2, '0')).join(' ')}`);
    }
  }
} finally {
  console.log(await s.disconnect());
  await t.close();
}
