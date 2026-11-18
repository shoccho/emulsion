import { readFileSync } from 'node:fs';
import { Keystream, decodeCarrier, readGrid } from '../../src/style/carrier-r100';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
const g = readGrid(decodeCarrier(new Uint8Array(readFileSync(process.argv[2]!)), ks)).filter((w) => w.table === 0);
const nz = g.filter((w) => w.v.some((x) => x !== 0) || !w.packed);
console.log(nz.length, 'non-zero or special words:', nz.map((w) => `${w.index}(mod128 ${w.index % 128})${w.packed ? ':' + w.v.join('/') : ':R'}`).join(' '));
