// M0.6: copy a PC-registered style from one slot to another, then verify.
// Usage: npm run copy-slot -- <fromSlot> <toSlot> --yes
// Target state = target's live state, with word 2 = 0x40 + toSlot and words 3..10 from the source state
// (layout from docs/M0-findings.md 0.3/0.4). Backs up the target first.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WebUSB } from 'usb';
import { WebUsbTransport } from '../src/ptp/webusb-transport';
import { CanonSession } from '../src/canon/session';
import { R100_USB } from '../src/canon/ops';
import { readSlot, writeSlot, type Slot } from '../src/canon/registration';
import { pcStyleState, isPcStyleState } from '../src/canon/slot-state';

const from = Number(process.argv[2]) as Slot;
const to = Number(process.argv[3]) as Slot;
if (![1, 2, 3].includes(from) || ![1, 2, 3].includes(to) || from === to || !process.argv.includes('--yes')) {
  console.error('usage: npm run copy-slot -- <from 1|2|3> <to 1|2|3> --yes');
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
  const src = await readSlot(s, from);
  if (!isPcStyleState(src.state, from)) throw new Error(`slot ${from} does not hold a PC-registered style`);
  const result = await writeSlot(s, {
    slot: to,
    style: src.style,
    state: (live) => pcStyleState(live, src.state, to),
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
