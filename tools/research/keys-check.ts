import { readFileSync } from 'node:fs';
import { findKeysInFile } from '../../src/style/keys';
const f = new Uint8Array(readFileSync('/Applications/Canon Utilities/EOS Utility/EU3/EOS Utility 3.app/Contents/PlugIns/EdsCFParse.bundle/Contents/MacOS/EdsCFParse'));
const t = Date.now();
const k = await findKeysInFile(f);
const ref = new Uint8Array(readFileSync('fixtures-private/keys/canon-tables.bin'));
console.log('found:', !!k, 'equal to extracted:', !!k && k.every((x, i) => x === ref[i]), `${Date.now() - t} ms`);
