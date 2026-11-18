// M0.5: the safest possible first write. Reads a slot and writes the exact same bytes back.
// Usage: npm run noop-write -- <slot 1|2|3> --yes
// Saves a backup to fixtures-private/backups/ before writing.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WebUSB } from 'usb';
import { WebUsbTransport } from '../src/ptp/webusb-transport';
import { CanonSession } from '../src/canon/session';
import { R100_USB } from '../src/canon/ops';
import { readSlot, writeSlot, type Slot } from '../src/canon/registration';

const slot = Number(process.argv[2]) as Slot;
if (![1, 2, 3].includes(slot) || !process.argv.includes('--yes')) {
  console.error('usage: npm run noop-write -- <1|2|3> --yes');
  process.exit(2);
}

const webusb = new WebUSB({ allowAllDevices: true });
const device = (await webusb.getDevices()).find((d) => d.vendorId === R100_USB.vendorId && d.productId === R100_USB.productId);
if (!device) {
  console.error('No EOS R100 (04A9:3312) found.');
  process.exit(1);
}

const t = new WebUsbTransport(device);
const s = new CanonSession(t, { log: (l) => (l.startsWith('GetEvent') ? undefined : console.log(l)) });
await t.open();
let exitCode = 0;
try {
  await s.connect();
  console.log(`connected: ${s.info!.model} fw ${s.info!.firmware}`);
  const current = await readSlot(s, slot);
  const result = await writeSlot(s, {
    slot,
    style: current.style,
    onBackup: async (b) => {
      const dir = join('fixtures-private', 'backups');
      await mkdir(dir, { recursive: true });
      const base = join(dir, `${b.takenAt.replace(/[:.]/g, '-')}-slot${b.slot}`);
      await writeFile(`${base}-style.bin`, b.style);
      await writeFile(`${base}-state.bin`, b.state);
      await writeFile(`${base}.json`, JSON.stringify({ slot: b.slot, model: b.model, firmware: b.firmware, takenAt: b.takenAt }));
      console.log(`backup saved: ${base}-*`);
    },
  });
  console.log(result.verified ? 'VERIFIED: readback equals what was written' : 'NOT VERIFIED: readback differs');
  if (!result.verified) exitCode = 3;
} catch (e) {
  console.error(String(e));
  exitCode = 1;
} finally {
  const errs = await s.disconnect();
  if (errs.length) console.error('cleanup errors:', errs);
  await t.close().catch((e) => console.error('close failed', e));
}
process.exit(exitCode);
