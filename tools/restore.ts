// Restore a slot from a backup saved by noop-write/copy-slot (fixtures-private/backups/<stamp>-slotN-*).
// Usage: npm run restore -- <backup-prefix> [toSlot] --yes
// Uses the same CameraService.writeTarget path as the web app.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WebUSB } from 'usb';
import { WebUsbTransport } from '../src/ptp/webusb-transport';
import { CameraService, describeSlot, targetFromBackup } from '../src/canon/camera-service';
import { R100_USB } from '../src/canon/ops';
import type { Slot } from '../src/canon/registration';
import { readWords } from '../src/canon/slot-state';

const prefix = process.argv[2];
if (!prefix || !process.argv.includes('--yes')) {
  console.error('usage: npm run restore -- <fixtures-private/backups/...-slotN> [toSlot] --yes');
  process.exit(2);
}
const meta = JSON.parse(await readFile(`${prefix}.json`, 'utf8')) as { slot: Slot };
const style = new Uint8Array(await readFile(`${prefix}-style.bin`));
const state = new Uint8Array(await readFile(`${prefix}-state.bin`));
const to = (Number(process.argv[3]) || meta.slot) as Slot;
console.log(`restoring "${describeSlot(meta.slot, style, state).label}" ${JSON.stringify(readWords(state))} into User Def. ${to}`);

const webusb = new WebUSB({ allowAllDevices: true });
const device = (await webusb.getDevices()).find((d) => d.vendorId === R100_USB.vendorId && d.productId === R100_USB.productId);
if (!device) {
  console.error('No EOS R100 (04A9:3312) found.');
  process.exit(1);
}
const svc = new CameraService(new WebUsbTransport(device), 'usb', { log: (l) => console.log(l) });
try {
  const { result, snapshot } = await svc.writeTarget(
    to,
    targetFromBackup({ style, state }),
    async (b) => {
      const dir = join('fixtures-private', 'backups');
      await mkdir(dir, { recursive: true });
      const base = join(dir, `${b.takenAt.replace(/[:.]/g, '-')}-slot${b.slot}`);
      await writeFile(`${base}-style.bin`, b.style);
      await writeFile(`${base}-state.bin`, b.state);
      await writeFile(`${base}.json`, JSON.stringify({ slot: b.slot, model: b.model, firmware: b.firmware, takenAt: b.takenAt }));
      console.log(`backup saved: ${base}-*`);
    },
    (stage) => console.log(`stage: ${stage}`),
  );
  console.log(result.verified ? 'VERIFIED' : 'NOT VERIFIED');
  for (const s of snapshot.slots) console.log(`User Def. ${s.slot}: ${s.label} ${JSON.stringify(readWords(s.state))}`);
  process.exit(result.verified ? 0 : 3);
} catch (e) {
  console.error(String(e));
  process.exit(1);
}
