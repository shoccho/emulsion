import { CONTRIBUTING_URL } from '../project';

export function HelpPage() {
  return (
    <>
      <h1>Help</h1>

      <section className="card prose">
        <h2>Which cameras?</h2>
        <p>
          <strong>Canon EOS R100 only, for now.</strong> Everything here was worked out and tested on an R100 (firmware 1.3.0). Other cameras are
          refused on purpose, because the picture-style data inside the camera can differ between models, and a wrong write is not worth the risk.
        </p>
        <p>
          <strong>The R50 could be supported</strong>, and probably other recent Canons too. They speak the same USB protocol and use the same Picture
          Style files. What has to be checked per model is the size and layout of the style data. That takes an owner, a USB cable and about an hour,
          starting with a read-only check that changes nothing on the camera.
        </p>
        <p>
          Have one? <a href={CONTRIBUTING_URL}>See how to help add your camera</a>.
        </p>
      </section>

      <section className="card prose">
        <h2>Which browsers and computers work?</h2>
        <ul>
          <li>
            <strong>Mac with Chrome or Edge:</strong> works with no setup (tested on an EOS R100, firmware 1.3.0). Quit EOS Utility, Image Capture and Photos
            first, because only one program can use the camera at a time.
          </li>
          <li>
            <strong>Android phone with Chrome:</strong> expected to work with a USB-C cable. Not tested yet.
          </li>
          <li>
            <strong>Windows:</strong> blocked by default. Windows gives the camera its own driver, which browsers cannot use. A tool called Zadig can switch
            the camera to the "WinUSB" driver; after that, EOS Utility and File Explorer cannot see the camera until you switch the driver back in Device
            Manager. Only do this if you are comfortable with it.
          </li>
          <li>
            <strong>Linux with Chrome:</strong> needs a udev rule that lets your user open the camera (USB id <code>04a9:3312</code>), and the desktop's file
            manager must not grab the camera.
          </li>
          <li>
            <strong>Safari and Firefox:</strong> do not support USB devices. Use the demo camera to look around.
          </li>
        </ul>
      </section>

      <section className="card prose">
        <h2>Connecting fails</h2>
        <ul>
          <li>
            <strong>"Chrome could not take control of the camera":</strong> another program has it. Quit EOS Utility, Image Capture, Photos or any tethering
            software, unplug the cable, plug it back in, and try again.
          </li>
          <li>
            <strong>The camera is not in the list:</strong> check it is switched on and the cable carries data (some cables only charge).
          </li>
          <li>
            <strong>"The camera stopped answering":</strong> switch the camera off and on, then connect again.
          </li>
          <li>
            <strong>The camera menu does not respond:</strong> that is normal while the cable is connected. Unplug to use the camera.
          </li>
        </ul>
      </section>

      <section className="card prose">
        <h2>What happens when you write a recipe</h2>
        <ol>
          <li>The app checks the camera is an EOS R100 and the battery is not low.</li>
          <li>It reads the chosen User Def. slot and saves a backup in this browser before changing anything.</li>
          <li>It locks the camera's buttons, writes the style data and the slot settings, then unlocks.</li>
          <li>It reads the slot back and reports "verified" only if every byte matches.</li>
        </ol>
        <p>A failed write is never retried automatically. Restore any backup from the Camera page.</p>
      </section>

      <section className="card prose">
        <h2>Why not every Fujifilm setting?</h2>
        <p>
          A User Def. slot holds a colour look plus contrast, saturation, colour tone and sharpness. White balance, noise reduction and dynamic range are
          camera-wide settings, so each recipe lists them for you to set by hand. Grain, clarity and Color Chrome have no Canon equivalent. Highlight and
          shadow become one contrast value.
        </p>
        <p>Looks are approximations inspired by film simulations. They will not match a Fujifilm camera.</p>
      </section>

      <section className="card prose">
        <h2>Privacy</h2>
        <p>
          Everything happens in your browser. Recipes, looks and backups are stored in this browser only. The camera's serial number is never stored or
          shown. Nothing is uploaded.
        </p>
        <p className="muted small">
          Read-only camera probe, used to add support for new models: <a href="spike.html">spike.html</a>. Its report hides the serial number and
          any owner, artist or copyright text.
        </p>
      </section>
    </>
  );
}
