import { useEffect, useMemo, useRef, useState } from 'react';
import { WriteError, type Slot } from '../../canon/registration';
import { Keystream } from '../../style/carrier-r100';
import { buildLookCarrier } from '../../style/look-builder';
import { HUE_BANDS, neutralParams, oklabToRgb, transformRgb, type BandAdjust, type BandKey, type LookParams } from '../../style/look-engine';
import { LOOK_PRESETS, PRESET_GROUPS, presetById, type PresetGroup } from '../../style/look-presets';
import { findKeysInFile } from '../../style/keys';
import type { CarrierLook } from '../../style/looks';
import { baseById, parseCarrierHeader } from '../../canon/styles';
import { downloadText, lookToFile, parseLookFile, readFileText, storedLookId } from '../../store/files';
import { useCamera } from '../camera-context';
import { CameraErrors, ConnectBar, FilePicker, Notice } from '../components';
import { DEFAULT_BASE_LOOK, pickBase, useLibrary } from '../library-context';
import { go } from '../router';
import { ConsentBox, STAGE_TEXT, StageList, useConsent } from '../write';

const MAC_PATH = '/Applications/Canon Utilities/EOS Utility/EU3/EOS Utility 3.app/Contents/PlugIns/EdsCFParse.bundle/Contents/MacOS/EdsCFParse';

function KeysCard() {
  const lib = useLibrary();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const load = async (f: File) => {
    setMsg({ tone: 'info', text: 'Searching the file…' });
    if (f.size > 100_000_000) return setMsg({ tone: 'error', text: 'That file is too large to be the Canon plug-in.' });
    const keys = await findKeysInFile(new Uint8Array(await f.arrayBuffer()));
    if (!keys) return setMsg({ tone: 'error', text: 'The style keys are not in that file. Choose the EdsCFParse file from EOS Utility 3 (path below).' });
    await lib.setKeys(keys);
    setMsg({ tone: 'ok', text: 'Style keys loaded and stored in this browser. Nothing was uploaded.' });
  };
  if (lib.keys) {
    return (
      <div className="connect-bar">
        <span>Style keys loaded from your EOS Utility.</span>
        <button className="link" onClick={() => void lib.setKeys(null)}>
          Forget keys
        </button>
      </div>
    );
  }
  return (
    <details className="card prose">
      <summary>
        <strong>Optional: save and write your own looks</strong>{' '}
        <span className="muted small">(the ready-made looks need none of this)</span>
      </summary>
      <p>
        You can preview any look here. To save or write a look you made yourself, the app needs Canon's picture-style keys. Canon scrambles
        picture-style data with keys that ship inside EOS Utility. This app does not include them; it reads them from your own copy of EOS Utility 3,
        once. The file stays on your computer.
      </p>
      <ol>
        <li>
          Click <strong>Choose the Canon file</strong>.
        </li>
        <li>
          On a Mac, press <code>Cmd+Shift+G</code> in the file dialog and paste:
          <br />
          <code className="path">{MAC_PATH}</code>
        </li>
        <li>
          On Windows, choose <code>EdsCFParse.dll</code> inside the EOS Utility 3 folder under Program Files.
        </li>
      </ol>
      <FilePicker label="Choose the Canon file…" accept="" onFile={(f) => void load(f)} />
      {msg && <Notice tone={msg.tone === 'info' ? 'info' : msg.tone}>{msg.text}</Notice>}
    </details>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="slider">
      <span className="slider-label">
        {label}
        <span className="muted">{fmt ? fmt(value) : value > 0 ? `+${value}` : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(0)} />
    </label>
  );
}

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

// ---------- preview ----------
const CHART_ROWS: [number, number][] = [
  [85, 45],
  [70, 75],
  [55, 100],
  [45, 70],
  [30, 80],
  [50, 30],
];
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
const css = (c: [number, number, number]) => `rgb(${c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255)).join(',')})`;

function ChartPreview({ params }: { params: LookParams }) {
  const cells: [number, number, number][][] = [];
  for (const [l, s] of CHART_ROWS) {
    const row: [number, number, number][] = [];
    for (let h = 0; h < 360; h += 30) row.push(hslToRgb(h, s, l));
    row.push(hslToRgb(0, 0, l));
    cells.push(row);
  }
  cells.push(Array.from({ length: 13 }, (_, i) => hslToRgb(0, 0, 5 + (i / 12) * 90)));
  return (
    <div className="chart-preview" aria-label="Colour chart: top half of each patch is the base, bottom half is with the look">
      {cells.flat().map((c, i) => (
        <div key={i} className="cp-cell">
          <div style={{ background: css(c) }} />
          <div style={{ background: css(transformRgb(c, params)) }} />
        </div>
      ))}
    </div>
  );
}

function PhotoPreview({ params }: { params: LookParams }) {
  const [img, setImg] = useState<ImageData | null>(null);
  const before = useRef<HTMLCanvasElement>(null);
  const after = useRef<HTMLCanvasElement>(null);
  const load = async (f: File) => {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 520 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    setImg(c.getContext('2d')!.getImageData(0, 0, c.width, c.height));
  };
  useEffect(() => {
    if (!img || !before.current || !after.current) return;
    for (const cv of [before.current, after.current]) {
      cv.width = img.width;
      cv.height = img.height;
    }
    before.current.getContext('2d')!.putImageData(img, 0, 0);
    const out = new ImageData(img.width, img.height);
    const cache = new Map<number, [number, number, number]>();
    for (let i = 0; i < img.data.length; i += 4) {
      // quantize to 5 bits per channel for speed
      const key = ((img.data[i]! >> 3) << 10) | ((img.data[i + 1]! >> 3) << 5) | (img.data[i + 2]! >> 3);
      let o = cache.get(key);
      if (!o) {
        o = transformRgb([((key >> 10) * 8 + 4) / 255, (((key >> 5) & 31) * 8 + 4) / 255, ((key & 31) * 8 + 4) / 255], params);
        cache.set(key, o);
      }
      out.data[i] = Math.round(Math.min(1, Math.max(0, o[0])) * 255);
      out.data[i + 1] = Math.round(Math.min(1, Math.max(0, o[1])) * 255);
      out.data[i + 2] = Math.round(Math.min(1, Math.max(0, o[2])) * 255);
      out.data[i + 3] = 255;
    }
    after.current.getContext('2d')!.putImageData(out, 0, 0);
  }, [img, params]);
  return (
    <div>
      <FilePicker label="Preview on a photo…" accept="image/*" onFile={(f) => void load(f)} />
      {img && (
        <div className="photo-preview">
          <figure>
            <canvas ref={before} />
            <figcaption className="muted small">Before</figcaption>
          </figure>
          <figure>
            <canvas ref={after} />
            <figcaption className="muted small">With the look</figcaption>
          </figure>
        </div>
      )}
      <p className="muted small">The preview applies the look to the photo's colours. On the camera it is applied on top of the base style, so results differ a little.</p>
    </div>
  );
}

// ---------- page ----------
export function EditorPage({ lookId }: { lookId?: string }) {
  const lib = useLibrary();
  const cam = useCamera();
  const [presetId, setPresetId] = useState(LOOK_PRESETS[0]!.id);
  const [params, setParams] = useState<LookParams>(() => structuredClone(LOOK_PRESETS[0]!.params));
  const [name, setName] = useState('My look');
  const [baseId, setBaseId] = useState(DEFAULT_BASE_LOOK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot>(2);
  const [consent, setConsent] = useConsent();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  const bases = lib.looks.filter(
    (l): l is CarrierLook => l.kind === 'carrier' && l.source !== 'created' && (l.source !== 'generated' || l.id.startsWith('base:')),
  );
  const base = bases.find((l) => l.id === baseId) ?? pickBase(bases);

  // Load an existing created look for editing.
  useEffect(() => {
    if (!lookId || !lib.ready) return;
    void import('../../store/db').then(async ({ db }) => {
      const stored = (await db.listLooks()).find((l) => l.id === lookId);
      if (stored?.params) {
        setPresetId('');
        setParams(structuredClone(stored.params));
        setName(stored.name);
        if (stored.baseLookId) setBaseId(stored.baseLookId);
        setEditingId(stored.id);
      }
    });
  }, [lookId, lib.ready]);

  const build = useMemo(() => {
    if (!lib.keys || !base) return null;
    try {
      return buildLookCarrier(base.carrier, params, name, new Keystream(lib.keys));
    } catch (e) {
      return e as Error;
    }
  }, [lib.keys, base, params, name]);

  const setBand = (k: BandKey, patch: Partial<BandAdjust>) => setParams((p) => ({ ...p, bands: { ...p.bands, [k]: { ...p.bands[k], ...patch } } }));

  const save = async () => {
    if (!(build instanceof Uint8Array)) return;
    const id = editingId ?? storedLookId();
    await lib.saveLook({ id, name: name.trim() || 'My look', carrier: build, source: 'created', addedAt: new Date().toISOString(), params, baseLookId: base?.id });
    setEditingId(id);
    setMsg({ tone: 'ok', text: `Saved "${name}". Recipes can use it: pick it as the Look in a recipe.` });
    if (!lookId) go(`/editor/${encodeURIComponent(id)}`);
  };

  const write = async () => {
    if (!(build instanceof Uint8Array)) return;
    setMsg(null);
    const h = parseCarrierHeader(build);
    try {
      const out = await cam.write(
        slot,
        {
          style: build,
          words: { base: 'pc', contrast: 0, sharpness: Math.min(7, Math.max(0, h.sharpness)), saturation: 0, colorTone: 0, filter: 0, toning: 0, fineness: Math.min(5, Math.max(1, h.fineness)), threshold: Math.min(5, Math.max(1, h.threshold)) },
        },
        `before writing look "${name}"`,
      );
      setMsg(
        out.verified
          ? { tone: 'ok', text: `Written and verified. Select User Def. ${slot} on the camera to shoot with "${name}".` }
          : { tone: 'warn', text: 'Written, but the read-back did not match. The previous contents were backed up.' },
      );
    } catch (e) {
      setMsg({ tone: 'error', text: `Write failed ${e instanceof WriteError ? STAGE_TEXT[e.stage] : ''}. ${String((e as Error).message ?? e)}` });
    }
  };

  return (
    <>
      <h1>Style editor</h1>
      <p className="muted">
        Make your own picture style: start from a film-inspired preset, adjust colours and tones, preview, then save it as a look or write it to a User Def.
        slot.
      </p>
      <KeysCard />
      {!base && <Notice tone="warn">No base style data available. It comes with the app's built-in looks, or capture one from a camera slot.</Notice>}

      <div className="two-col editor-cols">
        <section>
          <h2>Look</h2>
          <div className="row wrap-row">
            <label className="field">
              <span className="field-label">Start from a preset ({LOOK_PRESETS.length})</span>
              <select
                value={presetId}
                onChange={(e) => {
                  const p = presetById(e.target.value);
                  setPresetId(e.target.value);
                  if (p) setParams(structuredClone(p.params));
                }}
              >
                <option value="">Custom</option>
                {(Object.keys(PRESET_GROUPS) as PresetGroup[]).map((g) => (
                  <optgroup key={g} label={PRESET_GROUPS[g]}>
                    {LOOK_PRESETS.filter((p) => p.group === g).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button
              className="link"
              onClick={() => {
                setPresetId('');
                setParams(neutralParams());
              }}
            >
              Reset
            </button>
          </div>
          {presetById(presetId) && <p className="muted small">{presetById(presetId)!.description}</p>}
          <label className="field">
            <span className="field-label">Name (shown on the camera)</span>
            <input value={name} maxLength={31} onChange={(e) => setName(e.target.value)} />
          </label>
          {bases.length > 1 && (
            <label className="field">
              <span className="field-label">Base</span>
              <select value={base?.id} onChange={(e) => setBaseId(e.target.value)}>
                {bases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <fieldset>
            <legend>Overall</legend>
            <Slider label="Saturation" value={params.saturation} min={-1} max={1} step={0.05} fmt={pct} onChange={(v) => setParams({ ...params, saturation: v })} />
            <Slider label="Contrast" value={params.contrast} min={-1} max={1} step={0.05} fmt={pct} onChange={(v) => setParams({ ...params, contrast: v })} />
            <Slider label="Shadows" value={params.shadows} min={-1} max={1} step={0.05} fmt={pct} onChange={(v) => setParams({ ...params, shadows: v })} />
            <Slider label="Highlights" value={params.highlights} min={-1} max={1} step={0.05} fmt={pct} onChange={(v) => setParams({ ...params, highlights: v })} />
          </fieldset>

          <fieldset>
            <legend>Colours</legend>
            <div className="bands">
              <span />
              <span className="muted small">Hue</span>
              <span className="muted small">Saturation</span>
              <span className="muted small">Lightness</span>
              {HUE_BANDS.map((b) => (
                <BandRow key={b.key} label={b.label} hue={b.center} adj={params.bands[b.key]} onChange={(p) => setBand(b.key, p)} />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Split toning</legend>
            <Slider label="Shadow tint hue" value={params.shadowTint.hue} min={0} max={359} step={1} fmt={(v) => `${v}°`} onChange={(v) => setParams({ ...params, shadowTint: { ...params.shadowTint, hue: v } })} />
            <Slider label="Shadow tint amount" value={params.shadowTint.amount} min={0} max={1} step={0.05} fmt={pct} onChange={(v) => setParams({ ...params, shadowTint: { ...params.shadowTint, amount: v } })} />
            <Slider label="Highlight tint hue" value={params.highlightTint.hue} min={0} max={359} step={1} fmt={(v) => `${v}°`} onChange={(v) => setParams({ ...params, highlightTint: { ...params.highlightTint, hue: v } })} />
            <Slider label="Highlight tint amount" value={params.highlightTint.amount} min={0} max={1} step={0.05} fmt={pct} onChange={(v) => setParams({ ...params, highlightTint: { ...params.highlightTint, amount: v } })} />
          </fieldset>
        </section>

        <section>
          <h2>Preview</h2>
          <ChartPreview params={params} />
          <p className="muted small">Each patch: top half before, bottom half with the look.</p>
          <PhotoPreview params={params} />

          <h2>Save or write</h2>
          {build instanceof Error && <Notice tone="error">{build.message}</Notice>}
          {!lib.keys && <p className="muted small">Saving or writing a look you made needs Canon's keys (see "Optional" above). The ready-made looks can be written from any recipe without them.</p>}
          <div className="row wrap-row">
            <button className="primary" disabled={!(build instanceof Uint8Array)} onClick={() => void save()}>
              {editingId ? 'Save changes' : 'Save as look'}
            </button>
          </div>
          {lib.keys && (
            <div className="write-panel">
              <ConnectBar />
              <CameraErrors />
              {cam.snapshot && (
                <>
                  <label className="field">
                    <span className="field-label">Write to</span>
                    <select value={slot} onChange={(e) => setSlot(Number(e.target.value) as Slot)}>
                      {cam.snapshot.slots.map((s) => (
                        <option key={s.slot} value={s.slot}>
                          User Def. {s.slot} (now: {s.label})
                        </option>
                      ))}
                    </select>
                  </label>
                  {!consent && <ConsentBox given={consent} onChange={setConsent} />}
                  <button className="primary" disabled={!consent || !!cam.busy || !(build instanceof Uint8Array)} onClick={() => void write()}>
                    Write "{name}" to User Def. {slot}
                  </button>
                  <StageList stage={cam.stage} />
                </>
              )}
            </div>
          )}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        </section>
      </div>
      <MyLooks />
    </>
  );
}

/** Looks the user owns: made here, saved from a camera slot, or imported. */
function MyLooks() {
  const lib = useLibrary();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const mine = lib.looks.filter(
    (l): l is CarrierLook => l.kind === 'carrier' && (l.source === 'created' || l.source === 'captured' || l.source === 'imported'),
  );
  const from = { created: 'made here', captured: 'saved from camera', imported: 'imported' } as const;
  return (
    <section>
      <h2>My looks</h2>
      <p className="muted small">Looks you saved. They also appear in every recipe's look list.</p>
      <div className="row wrap-row">
        <FilePicker
          label="Import look file…"
          onFile={(f) => {
            setMsg(null);
            readFileText(f)
              .then((t) => {
                const { name, carrier } = parseLookFile(t);
                return lib.saveLook({ id: storedLookId(), name, carrier, source: 'imported', addedAt: new Date().toISOString() }).then(() => name);
              })
              .then((n) => setMsg({ tone: 'ok', text: `Imported "${n}".` }))
              .catch((e) => setMsg({ tone: 'error', text: String((e as Error).message ?? e) }));
          }}
        />
      </div>
      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}
      {mine.length === 0 ? (
        <p className="muted">None yet. Use Save as look above, or Save as look on the Camera page.</p>
      ) : (
        <div className="grid3">
          {mine.map((l) => (
            <article key={l.id} className="card">
              <div className="slot-head">
                <span className="badge badge-accent">{from[l.source as keyof typeof from]}</span>
              </div>
              <h3>{l.name}</h3>
              <p className="muted small">Based on {baseById(l.header.baseId)?.name ?? 'unknown'}</p>
              <div className="row">
                {l.source === 'created' && (
                  <a className="button secondary" href={`#/editor/${encodeURIComponent(l.id)}`}>
                    Edit
                  </a>
                )}
                <button className="secondary" onClick={() => downloadText(`look-${l.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, JSON.stringify(lookToFile(l)))}>
                  Export
                </button>
                <button className="link danger" onClick={() => void lib.deleteLook(l.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function BandRow({ label, hue, adj, onChange }: { label: string; hue: number; adj: BandAdjust; onChange: (p: Partial<BandAdjust>) => void }) {
  const swatch = css(oklchToRgbApprox(hue));
  return (
    <>
      <span className="band-label">
        <span className="swatch" style={{ background: swatch }} />
        {label}
      </span>
      <input aria-label={`${label} hue`} type="range" min={-30} max={30} step={1} value={adj.hue} onChange={(e) => onChange({ hue: Number(e.target.value) })} onDoubleClick={() => onChange({ hue: 0 })} title={`${adj.hue}°`} />
      <input aria-label={`${label} saturation`} type="range" min={-1} max={1} step={0.05} value={adj.sat} onChange={(e) => onChange({ sat: Number(e.target.value) })} onDoubleClick={() => onChange({ sat: 0 })} title={pct(adj.sat)} />
      <input aria-label={`${label} lightness`} type="range" min={-0.2} max={0.2} step={0.01} value={adj.light} onChange={(e) => onChange({ light: Number(e.target.value) })} onDoubleClick={() => onChange({ light: 0 })} title={pct(adj.light)} />
    </>
  );
}

function oklchToRgbApprox(h: number): [number, number, number] {
  const r = (h * Math.PI) / 180;
  return oklabToRgb(0.7, 0.12 * Math.cos(r), 0.12 * Math.sin(r));
}
