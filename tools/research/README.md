# Cipher research tools (Node, no dependencies)

All take the key file `fixtures-private/keys/canon-tables.bin` (1025 bytes, extracted locally from the
owner's own EOS Utility 3 `EdsCFParse` plug-in; never commit it). Keystream byte k = T1[k % 512] ^ T2[k % 513] ^ 0x37.

- `packed10.mjs <keys> <carrier> <offset> <words>`: score every keystream start by "top 2 bits of each u32 are zero".
- `walk10.mjs <keys> <carrier> <offset>`: map packed-10-bit blocks and their keystream starts.
- `decode.mjs <keys> <carrier> <out>`: decode an R100 carrier with the known block map.
- `dump.mjs <keys> <file> <from> <to> <delta>`: hex dump with keystream index = offset + delta.

Findings: docs/M0-findings.md, "Cipher".
