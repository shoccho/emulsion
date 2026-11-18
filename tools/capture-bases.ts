// After registering Picture Style files with EOS Utility: reads the three User Def. slots and saves every
// computer-loaded style as a built-in base look (public/carriers/r100/, gitignored) + updates index.json.
// Read-only on the camera.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { WebUSB } from 'usb';
import { WebUsbTransport } from '../src/ptp/webusb-transport';
import { CameraService } from '../src/canon/camera-service';
import { R100_USB } from '../src/canon/ops';
import { baseById } from '../src/canon/styles';

const d = (await new WebUSB({ allowAllDevices: true }).getDevices()).find((x) => x.productId === R100_USB.productId);
if (!d) throw new Error('No EOS R100 found');
const snap = await new CameraService(new WebUsbTransport(d), 'usb').readSnapshot();
const indexPath = 'public/carriers/r100/index.json';
const index: { id: string; name: string; file: string; description?: string }[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : [];
for (const s of snap.slots) {
  if (s.kind !== 'pc') {
    console.log(`User Def. ${s.slot}: ${s.label} (base style, nothing to capture)`);
    continue;
  }
  if (s.header.name.startsWith('BASE ')) {
    console.log(`User Def. ${s.slot}: "${s.header.name}" is a plain base (empty colour table); not added as an editor base`);
    continue;
  }
  const slug = s.header.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = `${slug}.bin`;
  writeFileSync(`public/carriers/r100/${file}`, s.style);
  const plain = s.header.name.startsWith('BASE ');
  const based = baseById(s.header.baseId)?.name ?? 'unknown';
  const entry = {
    id: `builtin:${slug}`,
    name: plain ? `Canon ${based} (plain)` : s.header.name.charAt(0) + s.header.name.slice(1).toLowerCase(),
    file,
    description: plain ? `Canon ${based} with no adjustments, compiled for the R100. Best neutral starting point for the editor.` : `Canon Picture Style, based on ${based}.`,
  };
  const i = index.findIndex((e) => e.id === entry.id);
  if (i >= 0) index[i] = entry;
  else index.push(entry);
  console.log(`User Def. ${s.slot}: captured "${s.header.name}" -> ${file}`);
}
writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log(`index now has ${index.length} looks`);
