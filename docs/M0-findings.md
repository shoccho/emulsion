# M0 findings — Canon EOS R100

Camera: EOS R100, USB `04A9:3312`, firmware `3-1.3.0`. Host: macOS (Apple silicon), Node `usb` 3.3.0 (libusb WebUSB shim).
Raw dumps: `fixtures-private/` (gitignored).

## 0.1 Reachability — PASS (macOS, Node/libusb)

- Interface claimed with no driver changes and no need to stop `ptpcamerad`.
- **Chrome 157 WebUSB on macOS: PASS.** Full read-only session from `http://localhost:5173/` (device picker → claim → DeviceInfo → session → D17F/D170–D172 read → clean disconnect). No `ptpcamerad` interference, no setup. Result in `fixtures-private/chrome/`.
- DeviceInfo: 557 bytes, 157 operations.

Advertised operations (relevant):

| Op | Advertised |
|---|---|
| 0x9110 SetDevicePropValueEx | yes |
| 0x9114 / 0x9115 / 0x9116 remote mode / event mode / GetEvent | yes |
| 0x9127 RequestDevicePropValue | yes |
| 0x911B / 0x911C UI lock / unlock | yes |
| 0x911D KeepDeviceOn | yes |
| **0x9189 GetPictureStylePCFlavorParam** | **no** (corrects PLAN.md 5.2 / 5.3) |
| **0x918A SetPictureStylePCFlavorParam** | **no** |

DeviceInfo lists no `0xD1xx` properties; Canon EOS properties arrive only through GetEvent (expected).

## 0.2 Read-only session — PASS

Sequence: OpenSession(1) → SetRemoteMode(1) → SetEventMode(1) → GetEvent drain → 9127(D17F, D170, D171, D172) with GetEvent polls → SetEventMode(0) → SetRemoteMode(0) → CloseSession. All responses `0x2001`. No cleanup errors. 6 GetEvent calls total.

**Slot read path:** `0x9127(D170..D172)` then GetEvent returns the slot's style parameter. `0x9189` is not available, so this is the backup/readback path (corrects PLAN.md).

| Prop | Size | Meaning |
|---|---|---|
| `D17F` FlavorLUTParams (descriptor) | 15,080 B | Starts `e8 3a 00 00` (= length) `0c 00 00 20`, base `0x81`. Mostly high-entropy (ciphered). Present. |
| `D170/D171/D172` PictureStyleParam1–3 | 16,720 B each | All three currently **empty**: length word `0x4150` then zeros. Same size the EOS RP reports. |
| `D163/D164/D165` PictureStyleExUserSet1–3 | 44 B each | Slot state, **extended layout**. `D160–D162` (legacy) are absent. Arrive in the initial drain; never requested with 9127. |
| `D157–D15E` | 40 B each | Probably the 8 built-in style presets' user adjustments (Auto, Standard, Portrait, …). Order [?]. |
| `D111` BatteryPower | 4 B | value `2` at time of test. Scale [?]. |

Slot state as int32 words (current camera):

```
D163 (User Def. 1): 44, 1, 0x85, 0, 0, -4, -4, 0, 0, 2, 2
D164 (User Def. 2): 44, 1, 0x87, 0, 4, 0, 0, 0, 0, 2, 4
D165 (User Def. 3): 44, 1, 0x87, 0, 4, 0, 0, 0, 0, 2, 4
```

Word 2 = base style (`0x85` Faithful, `0x87` Auto per Canon numbering [R]). Other words' meaning [?] — to be pinned down in 0.3.

## 0.3 Field offsets — in progress

Method: unplug, change one setting in the camera menu, replug, `npm run probe -- read`, `npm run diff`.
Note: the camera menu is unusable while the cable is in, even with no session open.

| Change made | Diff result |
|---|---|
| User Def. 2 Contrast 0 → +1 | `D164` int32[3] (offset 12): 0 → 1. Also `D110` 129 → 34 (= selected style: 0x81 Standard → 0x22 User Def. 2). `D113`, `D17C` changed on every dump (counters/clocks; ignore). |

| User Def. 2 Saturation 0 → +1, Fineness +1 step | `D164` [5]: 0 → 1; [9]: 2 → 3 |
| User Def. 3 Colour tone 0 → +2, Strength +1, Threshold −1 | `D165` [4]: 4 → 5; [6]: 0 → 2; [10]: 4 → 3 |

Slot state (44 B, int32 LE words), confirmed:

| Word | Offset | Field |
|---|---|---|
| 0 | 0 | size (44) |
| 1 | 4 | 1 (validity?) |
| 2 | 8 | base style (0x85 Faithful, 0x87 Auto, …) |
| 3 | 12 | contrast (−4…+4) |
| 4 | 16 | sharpness strength (0…7) |
| 5 | 20 | saturation (−4…+4) |
| 6 | 24 | colour tone (−4…+4) |
| 7 | 28 | monochrome filter effect (0 none, 1 Yellow, …) |
| 8 | 32 | monochrome toning effect (0 none, 1 Sepia, …) |
| 9 | 36 | sharpness fineness |
| 10 | 40 | sharpness threshold |

Base style change (User Def. 2 Auto → Standard: word 2 135 → 129; User Def. 3 → Monochrome: 135 → 134, filter Yellow → [7]=1, toning Sepia → [8]=1) **resets the slot's other words to that base's defaults** (e.g. contrast/saturation back to 0, fineness back to 2). Base ids confirmed: 0x81 Standard, 0x86 Monochrome, 0x87 Auto, 0x85 Faithful (seen).

`D110` = currently selected picture style (0x81 Standard … 0x21–0x23 User Def. 1–3).

## 0.4 Ground-truth pairs — 1 of 5–8

| Input | Slot | Saved as |
|---|---|---|
| `WW05_AUTUMN_HUES.pf2` (1,247 B, Canon download) | User Def. 3 | `fixtures-private/eos-utility/WW05_AUTUMN_HUES.slot3-*.bin` |

After EOS Utility registration:

- Slot state `D165`: `44, 1, 0x43, 0, 3, 0, 0, 0, 0, 4, 4`. Word 2 became **0x43** (looks like "PC style in slot 3": 0x40 + slot [?, confirm with another slot]). Sharpness strength 3, fineness 4, threshold 4 came from the file.
- Style `D172` (16,720 B):
  - `0`: u32 length 0x4150 (16720)
  - `4`: u32 1 (valid; empty slot has 0)
  - `8`: u16 0x4148 (16712 = length − 8), u8 base style 0x81, u8 0
  - `12`: style name, ASCII NUL-padded ("AUTUMN HUES")
  - `48`: u32 3, …, `0xDEADBEEF` ×2 at 60, u32 4, u32 4 at 68, then control bytes
  - `~88` to end: high-entropy (ciphered colour data), no long zero runs
  - Matches the RP note: Canon's 16,752-byte carrier with its 36-byte envelope stripped, plus 4-byte length.

### Second pair: `WW01_NOSTALGIA.pf2` → User Def. 2

- `D164`: `44, 1, 0x42, 0, 0, 0, 0, 0, 0, 2, 2`. **Confirms base word = 0x40 + slot for PC-registered styles.**
- `D171` header: valid 1, base `0x84` (Neutral), name "NOSTALGIA". Style header mirrors the state: offset 48 = sharpness strength (A: 3, N: 0), offsets 68/72 = fineness/threshold (A: 4/4, N: 2/2).
- The two ciphered bodies share long identical runs at recurring offsets (e.g. 131–340, and every ~1 KB): same keystream at the same offsets, so equal plaintext gives equal ciphertext. Supports runtime keystream recovery (PLAN.md decision 2).
- Slot 3 (Autumn Hues) unchanged after the 0.5 no-op write.

## 0.5 No-op write — PASS (2026-11-18, owner approved)

All `0x2001`: SetUILock → `0x9110` (16,728 B = 8 + 16,720 style) → `0x9110` (52 B = 8 + 44 state) → ResetUILock → readback via `0x9127(D172)` byte-identical. Clean disconnect. Backup in `fixtures-private/backups/2026-11-18T14-35-47-486Z-slot3-*`.
Caveat: the state comparison uses the latest `D165` seen in events; if the camera did not re-emit `D165` after the write, that half of "verified" is weak. Style readback is a fresh request, so the style half is strong.
Still to confirm by eye: take a JPEG with User Def. 3 and check the look is unchanged.

The transport sequence (PLAN.md 5.3, corrected) works on the R100.

## 0.6 Cross-slot write — PASS over USB (2026-11-18, owner approved); photo check pending

`npm run copy-slot -- 3 1 --yes`: Autumn Hues style from slot 3 written into User Def. 1 with state = slot 1 live bytes, word 2 = 0x41, words 3..10 from slot 3. All `0x2001`, verified in-session; a separate fresh read-only session confirms `D170` is byte-identical to the EOS Utility slot 3 dump and `D163` = `44, 1, 0x41, 0, 3, 0, 0, 0, 0, 4, 4`. Slot 1 backup (Faithful-based settings) in `fixtures-private/backups/2026-11-18T14-40-54-462Z-slot1-*`.

**Gate:** pending the owner's photo check, 0.6 passes → v1 (precompiled path) is feasible.

`npm run noop-write -- 3 --yes`: in one session, back up slot 3 to `fixtures-private/backups/`, then UI lock → `0x9110(D172, same style bytes)` → `0x9110(D165, same 44 state bytes)` → UI unlock → read back via `0x9127` and compare byte-for-byte.

## Base-style write — PASS (2026-11-18, owner approved)

`npm run restore -- fixtures-private/backups/2026-11-18T14-40-54-462Z-slot1 --yes` (same path as the web app's `CameraService.writeTarget`): empty style data (length word + zeros) + state `44, 1, 0x85, 0, 0, -4, -4, 0, 0, 2, 2` into User Def. 1. All `0x2001`, verified. Slot 1 reads back as Faithful. So both target kinds work on hardware: built-in base (empty style + base id) and PC style (style data + 0x40+slot).

## Camera settings over USB — PASS (2026-11-18)

Calibration: owner set Daylight, WB shift A2 G1, High ISO NR Low, HTP On in the menu; diff:

| Setting | Prop | Encoding (R100) |
|---|---|---|
| White balance | `D109` | libgphoto2 EOS table. Allowed (menu order): 0 AWB, 23 AWB White, 1 Daylight, 8 Shade, 2 Cloudy, 3 Tungsten, 4 White fluorescent, 5 Flash, 6 Custom, 9 Colour temperature |
| Colour temperature | `D10A` | Kelvin, 2500–10000 step 100 |
| WB shift A/B | `D10B` | **+ = amber**, −9..9 |
| WB shift G/M | `D10C` | **+ = green** (opposite of the app's +magenta convention), −9..9 |
| High ISO NR | `D178` | Low = 1 measured; allowed list (menu order) `[3,1,0,2,4]` = Off, Low, Standard, High, Multi Shot. **Differs from libgphoto2's 6D table.** |
| Highlight tone priority | `D13B` | 0 Off, 1 On (D+) |
| Auto Lighting Optimizer | — | No change observed (greyed out while HTP is on); libgphoto2's `D1C1` is not reported by the R100. Stays by hand. |
| (mirror) | `D1B4` | EVF WB mode, follows `D109` |

Allowed-value lists arrive as `0xC18A` events; the app refuses any value not on the list before writing anything.

Write: `0x9110` with 12-byte data (`u32 12, u32 prop, i32 value`). `npm run settings-test -- fxw-kodachrome-64` and `-- fxw-kodak-portra-400-v2`: applied, read back equal in-session and in a fresh session, undo restored the original values exactly.

## Cipher — SOLVED for PF2 files and the R100 carrier (2026-11-18)

**Keys.** The two Canon tables (512 + 513 bytes) are in EOS Utility 3's plug-in
`EOS Utility 3.app/Contents/PlugIns/EdsCFParse.bundle/Contents/MacOS/EdsCFParse` (macOS, 1,147,520 bytes),
stored contiguously at file offset 313964 (and again at 880540, the second architecture slice).
Keystream byte for index k: `T1[k % 512] ^ T2[k % 513] ^ 0x37`. Saved privately to
`fixtures-private/keys/canon-tables.bin`; never commit. (The public pf2_decomp tables equal these XOR a
constant, except their last 12 bytes of each table are wrong.)

**PF2 files** (version 0x2000): payload decodes with keystream index = payload byte index. Records are
**big-endian** TLV (u16 tag, u16 type, u32 len). Both Canon files decode completely and end exactly at
payload end: 0x1002 name, 0x1009 base (0x81 / 0x84), 0x100a "Canon INC.", 0x1010, 0x1018/0x1019 (300 B
tone data), 0x1021/0x1029 (240 B colour data = 60 i32), 0x100c, 0x100d name, 0xFFFF end. No checksum record
in this old version.

**R100 carrier (16,720 B)** — the keystream start per block is FIXED (same for Autumn Hues and Nostalgia):

| Bytes | Content | Keystream start |
|---|---|---|
| 0–87 | plain header (len, valid, base, name, sharpness at 48, 0xDEADBEEF×2, fineness/threshold 68/72, control words) | — |
| 88–331 | little-endian TLV: 0x100a copyright, 0x100d name, end marker, zero padding | 8917 |
| 332–4447 | table 1: 5 header words, then 1024 packed words | 47325 |
| 4448–8543 | table 2: 1024 packed words | 209211 |
| 8544–12639 | table 3: 1024 packed words | 47345 |
| 12640–16719 | table 4: 1020 packed words | 209211 |

Packed word = three 10-bit fields (bits 0–9, 10–19, 20–29), values are signed 10-bit (e.g. 1002 = −22):
small per-node colour corrections. Tables 1≈3 and 2≈4. ~116 of 4097 words have top bits set (sub-headers
or a different encoding; not yet attributed). Table-1 header word 0 (0xAE14F053) and the plain control
words are identical in both styles, so they are not content checksums: no checksum found yet.

**Meaning of the grid is NOT yet known** (axes, node layout, colour space, why two table pairs).

## Colour grid meaning — photo experiments (2026-11-18, owner approved)

Setup: camera fixed on a tripod facing `tools/research/chart.html` on the Mac screen; M mode, MF, Daylight WB,
ALO/HTP off. Each round: write a variant of Autumn Hues into User Def. 2 (backup, verify), select it
(`D110 = 0x22`), remote capture (`0x9128(3,1)` / `0x9129(3)`), wait for **`0xC1A7` ObjectAddedEx64** (the R100 does
not send 0xC181), `GetObjectInfo`/`GetObject` the JPEG. Compare with `tools/compare.ts` / `tools/research/shift.ts`.
The camera accepted every modified style (all writes verified). Photos: `fixtures-private/exp/`.

| Variant | Result vs unchanged Autumn Hues |
|---|---|
| Standard (base, empty style) vs Autumn Hues | ΔE 4.4: Autumn Hues adds chroma to greens/magentas |
| fields 0 and 1 × 0.5 (all tables) | chroma −40…50 % in every hue, hue kept, L −2…−5 |
| field 0 + 60 | greys Δa +24, Δb 0 → **field 0 = Cr (red difference)** |
| field 1 + 60 | greys Δa +18, Δb −28 → **field 1 = Cb (blue difference)** |
| field 2 + 60 | greys ΔL +10, no colour shift → **field 2 = Y (luma)** |
| tables 1+3 chroma 0 | ΔE 43, near monochrome |
| tables 2+4 chroma 0 | ΔE 0.8 (noise): not used for these JPEGs |
| table 1 chroma 0 | ΔE 43: **table 1 alone drives JPEG colour** |
| table 3 chroma 0 | ΔE 0.8: not used (Adobe RGB / movie / other mode?) |

Each grid word stores an **output colour (Cr, Cb, Y)**; table 1 has 1024 words (992 packed, 32 in the other
encoding). Values span about −512…511 on each axis. Y runs in groups of five along one grid axis.

Consequence: a look can be built by applying any colour transform to the stored output colours of a base grid
(base style → transform), without knowing each node's input coordinate. Open question: where to get a plain base
grid (Standard / Neutral) without Canon-made style files. Candidate: the camera's own descriptor `D17F`.

## Generated look on hardware — PASS (2026-11-18)

`npm run exp -- look classic-chrome`: Chrome-style preset built by `src/style/look-builder.ts` on the Autumn Hues
base, written to User Def. 2 (verified), photographed. **Lighting drift warning:** the scene darkened by ~15 L
between sessions (screen dimming / room light); always shoot a fresh reference (`variant orig`) right before or
after a test. Against the same-session reference: greys ΔL −1.7; chroma by Lab hue (before → camera / predicted):
red 44.7 → 25.5 / 28.3, yellow 45.8 → 33.0 / 29.4, green 66.5 → 40.5 / 33.4, cyan 38.5 → 21.5 / 21.1,
blue 23.5 → 21.5 / 15.3, magenta 60.9 → 40.5 / 37.7. Mean ΔE camera vs prediction 12.9 (effect 22).
Direction matches in every hue; the camera desaturates greens and blues somewhat less than the engine.
Grid interpretation used: y = Y/512, cb = Cb/1024, cr = Cr/1024 (BT.601), looks applied as deltas.

## Plain bases and table structure (2026-11-19)

Generated plain-base PF2 files (`tools/make-base-pf2.ts`: Autumn Hues template, base id changed, colour blocks
0x1021/0x1029 zeroed; the writer re-encodes Canon's file byte-exact). EOS Utility accepted them; captured
Standard, Neutral, Faithful (`tools/capture-bases.ts`), then the owner's slots were restored from backup.

- Plain Standard / Neutral / Faithful carriers differ only in header (base id, name, sharpness words).
  **Their colour tables are empty**: all colour words zero, table-1 header words 2–4 zero. The camera then uses
  its built-in rendering for the base. A filled table (Autumn Hues) replaces that rendering with absolute output
  colours (hence "chroma 0" → near-monochrome).
- So a "plain base" needs no EOS Utility: base id + empty table. For the editor, a base needs a *filled* table;
  next step is an **identity table** (outputs = inputs) so all 8 Canon bases can be edited.
- **Metadata words** in tables 1 and 3 (same 66 positions in every style; values vary by style): 64–67,
  88–90, 192–195, 216–219, 320–323, 344–347, 448–451, 472–475, 576–579, 601–603, 704–707, 729–732, 832–835,
  857–860, 960–963, 985–988, 1020–1023. Never edited (`SPECIAL_INDICES` in `src/style/look-builder.ts`).
- **Colour nodes form a regular RGB lattice** of 5×5×5 sub-cubes (runs of 5 step R by ≈8 %, groups of 5 step G,
  blocks of 25 step B), tiling the RGB cube. Autumn Hues (close to Standard) approximates the identity.

## Editable bases (identity tables) — photo-verified (2026-11-19)

The table is applied **on top of the base style's own processing** (identity + Neutral id ≈ plain Neutral), but
some styles (Portrait, Landscape, partly Faithful) also have a built-in colour table that a custom table replaces.
Method: correct the Autumn Hues table toward each plain style by fitting the editor's own look parameters to
tripod photo pairs (`tools/research/fit-identity.ts`), then put that style's id + default sharpness in the header
(`src/style/editable-bases.ts`, corrections in `src/style/identity-params.ts`).

Mean ΔE, identity table vs plain Canon style, shot back to back (noise floor: two plain Standard shots = 1.08):
Standard 1.60 · Neutral 2.13 (first pass only) · Faithful 2.22 · Fine Detail 2.57 · Monochrome 0.08 ·
Landscape 4.16 (was 10.7) · Portrait 4.78 (was 9.9). Auto not done (scene-adaptive).
Landscape/Portrait residuals vary with lightness (e.g. greens differ in highlights but not mid-tones), which the
lightness-independent hue-band model cannot express; a per-node correction would be needed.

## Where the keys come from (2026-11-19)

- The keys are **not generated**. They are two fixed constant arrays in Canon's EdsCFParse plug-in, named
  `Key1` (512 bytes, x86_64 vmaddr 0x48a60, `__TEXT,__const`) and `Key2` (513 bytes, 0x48c60), stored back to back
  and referenced directly by the parser code. The arm64 slice holds the same arrays. There is no seed or
  formula to recover, so the app cannot do without them: they come either from a Canon file or from the app itself.
- **Correction:** the earlier extraction took a 1025-byte window starting 12 bytes into Key1. Its "T1" ran 12 bytes
  into Key2, and its "T2" ran 12 bytes past Key2 into the type-name string `16CEdsXmlAtt`. The right layout rotates
  each array left by 12 *within itself* (`toAppLayout` in src/style/keys.ts), which keeps all measured block keystream
  starts valid. The old window was wrong at 4.6% of keystream indices: 0 bytes in the TLV block, 62 words in each table.
- **Consequence:** the "66 metadata positions" (SPECIAL_INDICES) were mostly decoding errors. With the right keys, a plain
  Canon base decodes to an all-zero colour table except words 1020–1023 (trailer), and Autumn Hues has 3 non-packed
  words instead of 115. In tables 1 and 3 every bad word lay inside SPECIAL_INDICES, which the builder never edits,
  so **nothing written to the camera was affected**. Those 62 colour nodes stayed at the base style's values. That is
  likely part of the residual error in the editable bases (they were frozen at Autumn Hues colours).
- The app now finds Key1‖Key2 by fingerprint and converts to its layout. Keys saved by the old version fail
  verification, so the editor asks for the file again. The old private file is kept as
  fixtures-private/keys/canon-tables-OLD-misaligned.bin.
- Still to do: unfreeze the 62 nodes (SPECIAL_INDICES → 1020–1023) and re-fit and photo-verify the editable bases.

## Shipping looks without keys (option A, 2026-11-19)

- The site ships **finished style data only**: 7 editable Canon bases and 28 presets in `public/looks/r100/`
  (35 × 16,720 B, about 0.6 MB), built locally by `npm run build:looks` with the private keys. Writing a look to the
  camera needs no keys, so users need no EOS Utility. Only saving or writing *their own* editor looks still needs the keys,
  and that step is now optional and collapsed in the editor.
- **What a shipped file contains** (`src/style/shippable.ts`): our header, our tables 1 and 3, tables 2 and 4 from the
  *plain* Standard style (our own empty style compiled by EOS Utility; no Canon look), and new name records with copyright
  "UNOFFICIAL". Nothing of Autumn Hues remains except trivial values (black, clamped-minimum nodes, trailer words) and
  the 5 table-header numbers, which are checked in tests/shippable.test.ts.
- **The 62 frozen nodes are now edited** (SPECIAL_INDICES = 1020–1023 only) and negative-Y nodes are transformed too.
  Together with the plain tables 2 and 4, this changes camera output compared with the photo-verified bases, so the
  shipped files need a camera check before publishing (`npm run exp -- shipped base:standard`).
- **Tables 2 and 4 hypothesis:** they differ per style but showed no effect on sRGB JPEGs. They may be the Adobe RGB
  (or RAW/DPP) versions. If so, shipped looks render as plain Standard in Adobe RGB. Untested.
- **Guards:** `npm run build` strips `public/carriers` (Canon's files) from `dist`, then `tools/check-no-keys.ts` scans
  `dist` and `public/looks` for any 16-byte run of the keys (raw, hex, base64; both layouts) and for Canon style files,
  and fails the build if it finds one. The check was itself tested with a planted base64 fragment.
