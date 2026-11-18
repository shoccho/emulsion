import { readFileSync } from 'node:fs';
import { Keystream, decodeCarrier } from '../../src/style/carrier-r100';
import { hasColourTable } from '../../src/style/look-builder';
const ks = new Keystream(new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin')));
for (const f of process.argv.slice(2)) console.log(f.split('/').pop(), 'has colour table:', hasColourTable(decodeCarrier(new Uint8Array(readFileSync(f)), ks)));
