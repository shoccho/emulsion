import { transformRgb } from '../../style/look-engine';
import { LOOK_PRESETS, presetById } from '../../style/look-presets';
import { useLibrary } from '../library-context';
import { CONTRIBUTING_URL, REPO_URL } from '../project';

// A small "scene" palette for the before/after strips: skin, sky, foliage, and the colours film looks change most.
const SCENE: [number, number, number][] = [
  [0.93, 0.76, 0.64], // light skin
  [0.72, 0.5, 0.38], // darker skin
  [0.45, 0.65, 0.9], // sky
  [0.2, 0.42, 0.75], // deep blue
  [0.35, 0.6, 0.3], // foliage
  [0.75, 0.75, 0.25], // yellow-green
  [0.85, 0.2, 0.18], // red
  [0.95, 0.6, 0.15], // orange
  [0.85, 0.85, 0.82], // highlight
  [0.45, 0.45, 0.45], // mid grey
  [0.15, 0.15, 0.16], // shadow
];
const FEATURED = ['classic-chrome', 'portrait-400', 'gold-200', 'tungsten-800', 'slide-64', 'mono-red-filter', 'teal-orange', 'faded-matte', 'cross-process'];
const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(' ')})`;

function LookStrip({ id }: { id: string }) {
  const p = presetById(id);
  if (!p) return null;
  return (
    <article className="card look-card">
      <h3>{p.name}</h3>
      <div className="look-strip" aria-label={`Colours before and after ${p.name}`}>
        {SCENE.map((c, i) => (
          <div key={i} className="ls-cell">
            <div style={{ background: css(c) }} />
            <div style={{ background: css(transformRgb(c, p.params)) }} />
          </div>
        ))}
      </div>
      <p className="muted small">{p.description}</p>
    </article>
  );
}

export function HomePage() {
  const lib = useLibrary();
  const recipeCount = lib.recipes.length;
  return (
    <>
      <section className="hero">
        <h1>Film looks for your Canon, without the software</h1>
        <p className="lead">
          Emulsion puts film-inspired colour into your Canon EOS R100's picture styles, so your JPEGs come out of the camera already looking the way
          you want. Pick a look, plug in a USB cable, click once. It's free and runs in your browser, with nothing to install.
        </p>
        <div className="row wrap-row">
          <a className="button primary" href="#/recipes">
            Browse {recipeCount} recipes
          </a>
          <a className="button secondary" href="#/camera">
            Connect your camera
          </a>
          <a className="button secondary" href="#/editor">
            Explore the looks
          </a>
        </div>
      </section>

      <section className="card prose">
        <h2>Why this exists</h2>
        <p>
          Fujifilm shooters swap <strong>film simulation recipes</strong>: a handful of settings that make the camera's own JPEGs look like Kodak
          Portra, Classic Chrome or Kodachrome. There's a whole culture of them.
        </p>
        <p>
          Canon cameras can do something similar. Each one has three <strong>User Defined picture style</strong> slots that can hold a custom
          colour look. But filling them normally means installing Canon's EOS Utility, finding a style file, and registering it by hand. Making your
          own takes yet another Canon app. Most people never bother, so the slots sit empty.
        </p>
        <p>
          Emulsion makes it a one-click job: <strong>{LOOK_PRESETS.length} ready-made looks</strong> plus editable versions of Canon's own styles, recipes that also set the camera's white
          balance, and a style editor. All of it works from a web page, with your camera on a cable.
        </p>
      </section>

      <h2>A few of the looks</h2>
      <p className="muted small">Each strip: the top half is the original colour, the bottom half is with the look (a preview; on the camera it is close but not identical).</p>
      <div className="grid3 looks-grid">
        {FEATURED.map((id) => (
          <LookStrip key={id} id={id} />
        ))}
      </div>

      <section className="card prose">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Pick a recipe or look.</strong> Recipes bundle a look with contrast, saturation, sharpness, white balance and noise reduction,
            translated to what the R100 can do.
          </li>
          <li>
            <strong>Connect the camera</strong> with a USB cable, using Chrome or Edge on a computer. The camera's screen goes quiet while it's
            connected; that's normal.
          </li>
          <li>
            <strong>Write it to User Def. 1, 2 or 3.</strong> Emulsion backs up the slot first, writes the look, and reads it back to confirm. White
            balance and the other camera-wide settings can be applied too.
          </li>
          <li>
            <strong>Unplug and shoot.</strong> Choose that User Def. style on the camera. The look is baked into every JPEG; RAW files keep it as a
            setting.
          </li>
        </ol>
      </section>

      <div className="two-col">
        <section className="card prose">
          <h2>Safe by design</h2>
          <ul>
            <li>Every write backs up the slot in your browser first, and you can restore it any time.</li>
            <li>Every write is checked by reading it back, byte for byte.</li>
            <li>Only picture-style slots and a few shooting settings are touched. No firmware, nothing permanent.</li>
            <li>Everything stays in your browser. Nothing is uploaded, and there's no account or tracking.</li>
          </ul>
        </section>
        <section className="card prose">
          <h2>Which cameras?</h2>
          <p>
            <strong>The Canon EOS R100, for now.</strong> The <strong>R50</strong> and other recent Canons very likely can work too. Each model needs
            a quick read-only check by someone who owns one.
          </p>
          <p>
            <a href={CONTRIBUTING_URL}>Help add your camera</a> · <a href={REPO_URL}>Source code</a> (MIT)
          </p>
        </section>
      </div>

      <p className="muted small">
        Looks are approximations <em>inspired by</em> film stocks and film simulations, not reproductions. Not affiliated with Canon or Fujifilm.
      </p>
    </>
  );
}
