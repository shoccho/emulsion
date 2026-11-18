# Contributing

Thanks for helping! The most valuable contribution right now is **adding support for more Canon cameras.** Emulsion works with the
EOS R100 today. The **R50** and other recent Canon EOS bodies very likely can work too, but each model has to be checked first.

## Add your camera

### Why each model needs checking

All recent Canons speak the same USB protocol and use the same Picture Style files. What can differ between models is **how the
camera stores a picture style inside a User Defined slot**: the size of the data, which property holds it, and its internal layout.
On the R100, a slot is 16,720 bytes of style data plus 44 bytes of settings. Writing data in the wrong layout could confuse the
camera, so the app refuses every model that hasn't been confirmed.

### Step 1: send a camera report (anyone, about 5 minutes, read-only)

This changes **nothing** on your camera. It only reads.

1. In the camera menu, note what's in your three **User Def.** picture-style slots. It helps a lot if one of them holds a Canon
   Picture Style file such as *Autumn Hues* (free from Canon, registered with EOS Utility). Note which slot holds it.
2. Quit EOS Utility, Image Capture, Photos, or anything else that might grab the camera.
3. Connect the camera by USB and switch it on.
4. In Chrome or Edge, open **[the camera probe](https://shoccho.github.io/emulsion/spike.html)**.
5. Click **1. Device info only**, then **2. Read-only session**, then **Save results**. You get a `canon-probe-….json` file.
6. [Open an issue](https://github.com/shoccho/emulsion/issues/new?template=camera-report.md) with the **Camera report** template,
   fill in the model, firmware version, computer and browser, and what's in each User Def. slot, then attach the file.

**Privacy:** the report hides your camera's serial number and any owner, artist or copyright name stored in the camera. It contains
camera settings, model and firmware, and the raw picture-style data in your slots. Have a look before posting if you like; it's
plain JSON.

### Step 2: confirm the layout (developers with the camera, about an hour)

With a report in hand, we compare your camera with the R100:

- **USB product id and model name.** The R100 is `04a9:3312`, "Canon EOS R100".
- **Supported operations.** The R100 uses `0x9110` SetDevicePropValueEx, `0x9116` GetEvent, and `0x911B`/`0x911C` UI lock/unlock.
- **Slot properties and sizes.** On the R100, style data is `0xD170`–`0xD172` (16,720 B) and slot settings are `0xD163`–`0xD165` (44 B).
- **Style data layout.** Does a Canon style file decode with the R100's block layout? This needs Canon's keys from your own EOS
  Utility, kept locally in the gitignored `fixtures-private/keys/` (see `src/style/keys.ts`); they're never committed.
- **Camera settings.** White balance, WB shift, noise reduction and highlight tone priority codes, and their allowed values.

Then, on the actual camera:

1. **No-op write:** write a slot's own data back unchanged and check it reads back identically (`tools/noop-write.ts`).
2. **Copy test:** copy one slot to another (`tools/copy-slot.ts`), then restore it (`tools/restore.ts`).
3. **A look:** write one ready-made look and take a photo to check it renders as expected.

The Node tools in `tools/` currently look for the R100's USB id; adapt the filter for your model. Every tool that writes backs up
first. Read the tool before running it.

### Step 3: enable it in the app

Once the layout is confirmed, support for a model means:

- adding its USB product id and model name next to the R100's (`src/canon/ops.ts`, `src/ui/camera-context.tsx`, and the model
  checks in `src/canon/registration.ts` and `src/canon/camera-service.ts`);
- making the R100-specific sizes and block layout (`STYLE_LENGTH_R100`, `STATE_LENGTH_R100` in `src/canon/registration.ts`,
  `R100_BLOCKS` in `src/style/carrier-r100.ts`) per-model;
- if the layout differs, building that model's ready-made looks too;
- tests, and a line in the camera table in the README.

Please write down what you learn in `docs/` even if it's a dead end. That's how the R100 got working.

## Supported cameras

| Camera | Status | Notes |
|---|---|---|
| EOS R100 | ✅ Supported | Firmware 1.3.0 |
| EOS R50 | Wanted | Same generation of software support; layout unconfirmed |
| Other EOS R / M / DSLR | Wanted | Send a camera report |

## Other ways to help

- **Looks:** presets live in `src/style/look-presets.ts`. You can tune one in the editor's preview and send the numbers. The shipped
  files in `public/looks/` are rebuilt by a maintainer (`npm run build:looks`), because that step needs Canon's keys.
- **Recipes:** `src/recipe/builtin.ts`. Please credit the original author and link the source.
- **Photos:** before/after shots of a look on a real camera help tune the looks to match their preview.
- **Bugs:** open an issue with the browser, OS, camera and firmware, and what you clicked.

## Ground rules

- **Never commit** Canon's keys, Canon software, Canon Picture Style files, or real camera dumps. `fixtures-private/` and
  `public/carriers/` are gitignored for this reason, and the build fails if key material reaches the site.
- **Every write path backs up first**, writes, then verifies by reading back. No automatic retries after a failed write.
- Keep the app working offline and entirely in the browser: no servers, no uploads, no tracking.

## Development

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

TypeScript is strict and tests use Vitest. Tests that need private files (keys, camera dumps) skip themselves when the files aren't
there.

By contributing you agree your contribution is licensed under the [MIT License](LICENSE).
