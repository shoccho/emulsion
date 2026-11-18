// Generates "plain base" Picture Style files (Canon base style, no colour adjustments) for registering with
// EOS Utility once, so their compiled grids can be captured as editor bases. Output: fixtures-private/pf2-bases/
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Keystream } from '../src/style/carrier-r100';
import { plainBaseFromTemplate, readPf2, writePf2 } from '../src/style/pf2';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
const template = readPf2(new Uint8Array(readFileSync('fixtures-private/eos-utility/WW05_AUTUMN_HUES.pf2')), ks);
// round-trip check on the template
const again = writePf2(template, ks);
const orig = new Uint8Array(readFileSync('fixtures-private/eos-utility/WW05_AUTUMN_HUES.pf2'));
console.log('template re-encodes byte-exact:', again.length === orig.length && again.every((x, i) => x === orig[i]));
const bases: [string, number][] = [['STANDARD', 0x81], ['PORTRAIT', 0x82], ['LANDSCAPE', 0x83], ['NEUTRAL', 0x84], ['FAITHFUL', 0x85], ['MONOCHROME', 0x86], ['FINE DETAIL', 0x88]];
mkdirSync('fixtures-private/pf2-bases', { recursive: true });
for (const [name, id] of bases) {
  const f = writePf2(plainBaseFromTemplate(template, id, `BASE ${name}`), ks);
  readPf2(f, ks); // must parse back
  const path = `fixtures-private/pf2-bases/BASE_${name.replace(' ', '_')}.pf2`;
  writeFileSync(path, f);
  console.log('wrote', path, f.length, 'bytes');
}
