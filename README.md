# Emulsion

**Film-style looks and recipes for the Canon EOS R100, straight from your browser.**

Plug the camera into your computer with a USB cable, open the site in Chrome, pick a look, and it lands in one of the camera's
three *User Defined* picture-style slots. No Canon software needed.

👉 **[shoccho.github.io/emulsion](https://shoccho.github.io/emulsion/)**

## What it does

- **35 ready-made looks** you can write to the camera in one click. They include film-inspired colour (Chrome-style, Portrait 400,
  Golden 200, Tungsten 800, Slide 64…), black and white (Fine mono, Mono red filter, Sepia…), creative grades (Teal and orange,
  Faded matte, Cross process…), and *editable* versions of Canon's own styles.
- **Recipes**, including five Classic Chrome recipes by [Fuji X Weekly](https://fujixweekly.com/). Each one is mapped to what the
  R100 can do: look, contrast, saturation, colour tone, sharpness, and the camera-wide white balance, WB shift, noise reduction and
  highlight tone priority. The camera-wide settings are applied over USB too.
- **A style editor** to make your own look with hue bands, tone and split toning, with a live preview on a chart or your own photo.
- **Backups first.** Every write reads the slot and saves a backup in your browser before changing anything, then reads it back and
  reports "verified" only if every byte matches.

Everything runs in the browser. Nothing is uploaded.

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
