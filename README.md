# Emulsion

**Film looks for your Canon, without the software.**

Emulsion puts film-inspired colour into a Canon EOS R100's picture styles, so your JPEGs come out of the camera already looking the way
you want. Pick a look in your browser, plug in a USB cable, click once. Free, open source, with nothing to install.

👉 **[shoccho.github.io/emulsion](https://shoccho.github.io/emulsion/)**

## Why

Fujifilm shooters swap **film simulation recipes**: a handful of settings that make the camera's own JPEGs look like Kodak Portra,
Classic Chrome or Kodachrome, with no editing afterwards. Sites like [Fuji X Weekly](https://fujixweekly.com/) publish hundreds of
them.

Canon cameras can do something similar. Each one has three **User Defined picture style** slots that hold a custom colour look. But
filling them normally means installing Canon's EOS Utility on a computer, finding a `.pf2` style file, and registering it by hand.
Making your own needs yet another Canon app. In practice almost nobody does it, and those slots sit empty.

Emulsion makes it a one-click job from a web page, and gives Canon shooters the recipe culture Fujifilm shooters have.

## What you get

- **28 ready-made looks**, plus editable versions of Canon's own styles, written to the camera in one click:
  - film-inspired colour: Chrome-style, Portrait 400, Golden 200, Tungsten 800, Slide 64…
  - black and white: Fine mono, Mono red filter, Sepia…
  - creative grades: Teal and orange, Faded matte, Cross process…
- **Recipes**, including five Classic Chrome recipes by Fuji X Weekly. Each one is translated to what the R100 can do:
  - in the slot: look, contrast, saturation, colour tone and sharpness;
  - camera-wide: white balance, WB shift, noise reduction and highlight tone priority, also applied over USB.
- **A style editor** for building your own look from hue bands, tone and split toning, previewed on a chart or your own photo.
  Saving your own looks needs Canon's keys from EOS Utility (optional; see below).
- **Safe writes.** Every write backs up the slot in your browser first, then reads it back and reports "verified" only if every byte
  matches. Nothing is uploaded; there's no account or tracking.

## How to use it

1. Open the site in **Chrome or Edge** on a computer.
2. Pick a recipe (or a look) and choose a slot: User Def. 1, 2 or 3.
3. Connect the camera with a USB cable, switch it on, and click **Write**. Optionally apply the recipe's white balance too.
4. Unplug, choose that User Def. style on the camera, and shoot. The look is baked into every JPEG; RAW files keep it as a setting.

## Cameras

| Camera | Status |
|---|---|
| Canon EOS R100 | ✅ Works (tested on firmware 1.3.0) |
| Canon EOS R50 | 🔍 Probably possible. Needs an owner to check it |
| Other recent Canon EOS | 🔍 Same as above |

Other cameras are refused on purpose until someone confirms their picture-style data layout, because a wrong write isn't worth the
risk. **Have another Canon? [Help add it](CONTRIBUTING.md).** The first step is a read-only report that changes nothing on the camera.

## Browsers

- **Chrome or Edge on a Mac:** works. Quit EOS Utility, Image Capture and Photos first; only one program can use the camera.
- **Chrome on Android:** expected to work with a USB-C cable; not tested yet.
- **Windows:** the camera must be switched to the WinUSB driver (for example with Zadig) before a browser can use it.
- **Linux:** needs a udev rule for USB id `04a9:3312`.
- **Safari and Firefox:** no WebUSB. You can still look around with the demo camera.

## How it works

The site talks to the camera with PTP (the standard camera USB protocol) through WebUSB, using Canon's vendor commands to read and
write the User Defined slots and camera settings.

Canon scrambles picture-style data. The ready-made looks are shipped as **finished style data** that the camera accepts as-is, so
using them needs no keys and no Canon software. **This repository contains no Canon software, no Canon keys and no Canon Picture
Style files.** The build fails if any key material or Canon style file ends up in the site (`tools/check-no-keys.ts`).

Saving or writing a look *you* made in the editor does need Canon's keys. The site can read them once from your own copy of EOS
Utility 3; they stay in your browser. That part is optional.

The protocol and data-format notes are in [docs/M0-findings.md](docs/M0-findings.md).

## Development

```sh
npm ci
npm run dev        # http://localhost:5173
npm test
npm run build      # also runs the no-keys check
```

`npm run build:looks` rebuilds the ready-made looks in `public/looks/` after changing presets. It needs private inputs that are
never committed (Canon's keys from your own EOS Utility, plus style data from your own camera), so maintainers run it locally and
commit only the finished files.

Tools in `tools/` drive a real camera from Node over USB (probe, backups, experiments). Any tool that writes to the camera backs up
first and says what it will change.

## Disclaimer

Unofficial and not affiliated with Canon or Fujifilm. "Canon", "EOS", "Fujifilm" and film stock names belong to their owners; looks
are approximations *inspired by* film simulations, not reproductions. Writing to a camera's settings is at your own risk.

## License

[MIT](LICENSE)
