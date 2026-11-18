import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { WriteError, type Slot } from '../../canon/registration';
import { FILTERS, TONINGS } from '../../canon/styles';
import { isBuiltinRecipe } from '../../recipe/builtin';
import { planRecipe, type RecipePlan } from '../../recipe/mapping';
import {
  DYNAMIC_RANGES,
  OVERRIDE_RANGES,
  STRENGTHS,
  WB_MODES,
  newRecipe,
  slugify,
  validateRecipe,
  type CanonOverrides,
  type Recipe,
} from '../../recipe/schema';
import { downloadText, recipesToFile } from '../../store/files';
import { findLook, resolveLook, type Look } from '../../style/looks';
import { useCamera } from '../camera-context';
import { CameraErrors, ConnectBar, Notice, PlanView, signed } from '../components';
import { useLibrary } from '../library-context';
import { go } from '../router';
import { ConsentBox, STAGE_TEXT, StageList, useConsent } from '../write';
import { CameraSettingsPanel } from '../camera-settings-panel';

function range(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v * 10) / 10);
  return out;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="muted small">{hint}</span>}
    </label>
  );
}

function NumSelect({ value, lo, hi, step = 1, onChange, disabled }: { value: number; lo: number; hi: number; step?: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <select value={String(value)} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled}>
      {range(lo, hi, step).map((v) => (
        <option key={v} value={String(v)}>
          {signed(v)}
        </option>
      ))}
    </select>
  );
}

function OptSelect<T extends string>({ value, options, onChange, disabled }: { value: T; options: readonly T[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

const OVERRIDE_LABELS: Record<keyof CanonOverrides, string> = {
  contrast: 'Contrast',
  saturation: 'Saturation',
  colorTone: 'Colour tone',
  sharpness: 'Sharpness strength',
  fineness: 'Sharpness fineness',
  threshold: 'Sharpness threshold',
};

function Editor({ r, set, readOnly, looks }: { r: Recipe; set: (r: Recipe) => void; readOnly: boolean; looks: Look[] }) {
  const look = resolveLook(looks, r);
  const ownMissing = !findLook(looks, r.look);
  const isMono = look?.kind === 'base' && look.base.key === 'monochrome';
  const d = readOnly;
  const upd = (p: Partial<Recipe>) => set({ ...r, ...p });
  const wb = r.whiteBalance;
  const setOverride = (k: keyof CanonOverrides, v: number | null) => {
    const canon: CanonOverrides = { ...(r.canon ?? {}) };
    if (v === null) delete canon[k];
    else canon[k] = v;
    const { canon: _old, ...rest } = r;
    set(Object.keys(canon).length ? { ...rest, canon } : rest);
  };

  return (
    <div className="editor">
      <fieldset disabled={d}>
        <legend>About</legend>
        <Field label="Name">
          <input value={r.name} maxLength={80} onChange={(e) => upd({ name: e.target.value })} />
        </Field>
        {(r.author || r.source) && (
          <p className="small credit">
            {r.author && <>By {r.author}. </>}
            {r.source && (
              <a href={r.source} target="_blank" rel="noopener noreferrer">
                Source page
              </a>
            )}
          </p>
        )}
        <Field label="Notes">
          <textarea value={r.notes ?? ''} maxLength={2000} rows={2} onChange={(e) => upd({ notes: e.target.value || undefined })} />
        </Field>
        <Field
          label="Look"
          hint={
            ownMissing && look
              ? `${look.description} The intended look is not available in this copy of the app.`
              : look
                ? look.description
                : 'This look is not available in this browser. Capture it from a camera slot or import a look file.'
          }
        >
          <select value={r.look} onChange={(e) => upd({ look: e.target.value })}>
            {ownMissing && <option value={r.look}>{r.look} ({look ? `not available here; using ${look.name}` : 'missing'})</option>}
            <optgroup label="Canon base styles">
              {looks
                .filter((l) => l.kind === 'base' && l.group === 'canon')
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Film-style bases">
              {looks
                .filter((l) => l.kind === 'base' && l.group === 'film')
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Generated looks">
              {looks
                .filter((l) => l.kind === 'carrier' && l.source === 'generated' && !l.id.startsWith('base:'))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Style data">
              {looks
                .filter((l) => l.kind === 'carrier' && l.source !== 'generated')
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </Field>
      </fieldset>

      <fieldset disabled={d}>
        <legend>Tone and colour</legend>
        <div className="fields">
          <Field label="Highlight">
            <NumSelect value={r.highlight} lo={-2} hi={4} step={0.5} onChange={(v) => upd({ highlight: v })} />
          </Field>
          <Field label="Shadow">
            <NumSelect value={r.shadow} lo={-2} hi={4} step={0.5} onChange={(v) => upd({ shadow: v })} />
          </Field>
          {!isMono && (
            <Field label="Color">
              <NumSelect value={r.color} lo={-4} hi={4} onChange={(v) => upd({ color: v })} />
            </Field>
          )}
          <Field label="Sharpness">
            <NumSelect value={r.sharpness} lo={-4} hi={4} onChange={(v) => upd({ sharpness: v })} />
          </Field>
          {isMono && (
            <>
              <Field label="Filter effect">
                <OptSelect value={r.monochrome?.filter ?? 'none'} options={FILTERS} onChange={(v) => upd({ monochrome: { toning: r.monochrome?.toning ?? 'none', filter: v } })} />
              </Field>
              <Field label="Toning effect">
                <OptSelect value={r.monochrome?.toning ?? 'none'} options={TONINGS} onChange={(v) => upd({ monochrome: { filter: r.monochrome?.filter ?? 'none', toning: v } })} />
              </Field>
            </>
          )}
          <Field label="Color Chrome Effect">
            <OptSelect value={r.colorChrome} options={STRENGTHS} onChange={(v) => upd({ colorChrome: v })} />
          </Field>
          <Field label="Color Chrome FX Blue">
            <OptSelect value={r.colorChromeBlue} options={STRENGTHS} onChange={(v) => upd({ colorChromeBlue: v })} />
          </Field>
        </div>
      </fieldset>

      <fieldset disabled={d}>
        <legend>Camera settings (set by hand)</legend>
        <div className="fields">
          <Field label="White balance">
            <OptSelect value={wb.mode} options={WB_MODES} onChange={(v) => upd({ whiteBalance: { ...wb, mode: v, kelvin: v === 'kelvin' ? (wb.kelvin ?? 5500) : null } })} />
          </Field>
          {wb.mode === 'kelvin' && (
            <Field label="Kelvin">
              <select value={String(wb.kelvin ?? 5500)} onChange={(e) => upd({ whiteBalance: { ...wb, kelvin: Number(e.target.value) } })}>
                {range(2500, 10000, 100).map((k) => (
                  <option key={k} value={String(k)}>
                    {k} K
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="WB shift red">
            <NumSelect value={wb.shiftR} lo={-9} hi={9} onChange={(v) => upd({ whiteBalance: { ...wb, shiftR: v } })} />
          </Field>
          <Field label="WB shift blue">
            <NumSelect value={wb.shiftB} lo={-9} hi={9} onChange={(v) => upd({ whiteBalance: { ...wb, shiftB: v } })} />
          </Field>
          <Field label="Noise reduction">
            <NumSelect value={r.noiseReduction} lo={-4} hi={4} onChange={(v) => upd({ noiseReduction: v })} />
          </Field>
          <Field label="Dynamic range">
            <OptSelect value={r.dynamicRange} options={DYNAMIC_RANGES} onChange={(v) => upd({ dynamicRange: v })} />
          </Field>
          <Field label="Grain">
            <OptSelect value={r.grain.strength} options={STRENGTHS} onChange={(v) => upd({ grain: { ...r.grain, strength: v } })} />
          </Field>
          <Field label="Grain size">
            <OptSelect value={r.grain.size} options={['small', 'large'] as const} onChange={(v) => upd({ grain: { ...r.grain, size: v } })} />
          </Field>
          <Field label="Clarity">
            <NumSelect value={r.clarity} lo={-5} hi={5} onChange={(v) => upd({ clarity: v })} />
          </Field>
        </div>
      </fieldset>

      <details className="advanced" open={!!r.canon}>
        <summary>Canon values (advanced)</summary>
        <p className="muted small">Leave on "derived" to compute from the settings above, or pick an exact Canon value.</p>
        <fieldset disabled={d}>
          <div className="fields">
            {(Object.keys(OVERRIDE_RANGES) as (keyof CanonOverrides)[])
              .filter((k) => !(isMono && (k === 'saturation' || k === 'colorTone')))
              .map((k) => {
                const [lo, hi] = OVERRIDE_RANGES[k];
                const v = r.canon?.[k];
                return (
                  <Field key={k} label={OVERRIDE_LABELS[k]}>
                    <select value={v === undefined ? '' : String(v)} onChange={(e) => setOverride(k, e.target.value === '' ? null : Number(e.target.value))}>
                      <option value="">derived</option>
                      {range(lo, hi, 1).map((n) => (
                        <option key={n} value={String(n)}>
                          {signed(n)}
                        </option>
                      ))}
                    </select>
                  </Field>
                );
              })}
          </div>
        </fieldset>
      </details>
    </div>
  );
}

function WritePanel({ recipe, plan, look }: { recipe: Recipe; plan: RecipePlan | null; look: Look | undefined }) {
  const cam = useCamera();
  const [slot, setSlot] = useState<Slot>(1);
  const [consent, setConsent] = useConsent();
  const [result, setResult] = useState<{ tone: 'ok' | 'warn' | 'error'; text: ReactNode } | null>(null);

  if (!look || !plan) return <Notice tone="warn">This recipe's look is not available, so it cannot be written. Choose another look.</Notice>;
  if (!cam.snapshot) {
    return (
      <>
        <ConnectBar />
        <CameraErrors />
      </>
    );
  }
  const current = cam.snapshot.slots.find((s) => s.slot === slot);

  const write = async () => {
    setResult(null);
    try {
      const out = await cam.write(slot, plan.target, `before writing "${recipe.name}"`);
      setResult(
        out.verified
          ? {
              tone: 'ok',
              text: (
                <>
                  <strong>Done and verified.</strong> User Def. {slot} now holds "{recipe.name}". Unplug the camera, choose <strong>User Def. {slot}</strong> as the
                  picture style, and set the by-hand settings listed below.
                </>
              ),
            }
          : { tone: 'warn', text: 'Written, but reading it back did not match exactly. The previous contents were backed up (see Camera → Backups).' },
      );
    } catch (e) {
      const where = e instanceof WriteError ? STAGE_TEXT[e.stage] : '';
      setResult({
        tone: 'error',
        text: `The write failed ${where}. ${String((e as Error).message ?? e)} If anything was changed, the backup is under Camera → Backups.`,
      });
    }
  };

  return (
    <div className="write-panel">
      <ConnectBar />
      <CameraErrors />
      <div className="slot-picker" role="radiogroup" aria-label="Slot">
        {cam.snapshot.slots.map((s) => (
          <label key={s.slot} className={`slot-option ${slot === s.slot ? 'selected' : ''}`}>
            <input
              type="radio"
              name="slot"
              checked={slot === s.slot}
              onChange={() => {
                setSlot(s.slot);
                setResult(null);
              }}
              disabled={!!cam.busy}
            />
            <span>
              <strong>User Def. {s.slot}</strong>
              <span className="muted small">now: {s.label}</span>
            </span>
          </label>
        ))}
      </div>
      {current?.kind === 'pc' && !result && (
        <p className="small">
          User Def. {slot} holds the computer style "{current.label}". It will be replaced and backed up. Save it as a look on the Camera page first if
          you want to reuse it.
        </p>
      )}
      {!cam.snapshot.battery.okToWrite && <Notice tone="error">Battery is {cam.snapshot.battery.label}. Charge it before writing.</Notice>}
      {!consent && <ConsentBox given={consent} onChange={setConsent} />}
      <button className="primary big" disabled={!consent || !!cam.busy || !cam.snapshot.battery.okToWrite} onClick={() => void write()}>
        Write to User Def. {slot}
      </button>
      <StageList stage={cam.stage} />
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </div>
  );
}

/** Draft handed from "Duplicate to edit" to the #/recipe/new page. */
let pendingDraft: Recipe | null = null;

export function RecipePage({ id }: { id: string }) {
  const lib = useLibrary();
  const isNew = id === 'new';
  const existing = lib.recipes.find((r) => r.id === id);
  const builtin = isBuiltinRecipe(id);
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setErrors([]);
    setSaved(false);
    if (isNew) {
      setDraft(pendingDraft ?? newRecipe(`recipe-${Date.now().toString(36)}`, 'My recipe'));
      pendingDraft = null;
    }
    else setDraft(existing ? structuredClone(existing) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lib.ready]);

  const recipe = draft;
  const look = recipe ? resolveLook(lib.looks, recipe) : undefined;
  const plan = useMemo(() => (recipe && look ? planRecipe(recipe, look) : null), [recipe, look]);
  const dirty = !!recipe && !builtin && (isNew || JSON.stringify(recipe) !== JSON.stringify(existing));

  if (!lib.ready) return <p className="muted">Loading…</p>;
  if (!recipe) {
    return (
      <>
        <h1>Recipe not found</h1>
        <p>
          <a href="#/recipes">Back to recipes</a>
        </p>
      </>
    );
  }

  const save = async () => {
    let r = recipe;
    if (isNew) {
      const base = slugify(r.name);
      const taken = new Set(lib.recipes.map((x) => x.id));
      let rid = base;
      for (let n = 2; taken.has(rid); n++) rid = `${base}-${n}`;
      r = { ...r, id: rid };
    }
    const v = validateRecipe(r);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    await lib.saveRecipe(v.recipe);
    setErrors([]);
    setSaved(true);
    if (isNew) go(`/recipe/${encodeURIComponent(v.recipe.id)}`);
    else setDraft(v.recipe);
  };

  const duplicate = () => {
    const copy: Recipe = { ...structuredClone(recipe), id: `recipe-${Date.now().toString(36)}`, name: `${recipe.name} (copy)` };
    pendingDraft = copy; // keeps author and source, so credit survives edits
    go('/recipe/new');
  };

  return (
    <>
      <p className="small">
        <a href="#/recipes">← Recipes</a>
      </p>
      <div className="title-row">
        <h1>{recipe.name || 'Untitled'}</h1>
        <span className={`badge ${builtin ? '' : 'badge-accent'}`}>{builtin ? 'built-in' : isNew ? 'new' : 'yours'}</span>
      </div>
      {recipe.notes && builtin && <p className="muted">{recipe.notes}</p>}
      {builtin && recipe.source && (
        <p className="small">
          Recipe by {recipe.author ?? 'its author'} ·{' '}
          <a href={recipe.source} target="_blank" rel="noopener noreferrer">
            original recipe and sample photos
          </a>
        </p>
      )}

      <div className="row wrap-row">
        {builtin ? (
          <button onClick={duplicate}>Duplicate to edit</button>
        ) : (
          <>
            <button className="primary" disabled={!dirty} onClick={() => void save()}>
              {isNew ? 'Save recipe' : dirty ? 'Save changes' : 'Saved'}
            </button>
            {!isNew && (
              <button
                className="link danger"
                onClick={() => {
                  void lib.deleteRecipe(recipe.id).then(() => go('/recipes'));
                }}
              >
                Delete
              </button>
            )}
          </>
        )}
        {!isNew && (
          <button className="secondary" onClick={() => downloadText(`${recipe.id}.json`, recipesToFile([recipe]))}>
            Export
          </button>
        )}
      </div>
      {saved && !dirty && <Notice tone="ok">Saved in this browser.</Notice>}
      {errors.length > 0 && (
        <Notice tone="error">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="two-col">
        <section>
          <h2>{builtin ? 'Settings' : 'Edit'}</h2>
          <Editor r={recipe} set={(r) => setDraft(r)} readOnly={builtin} looks={lib.looks} />
        </section>
        <section>
          <h2>On the R100</h2>
          {plan ? <PlanView plan={plan} /> : <Notice tone="warn">Choose an available look to see how this maps to the camera.</Notice>}
          <h2>Write to camera</h2>
          {dirty && !isNew && <p className="muted small">Writing uses the settings shown, including unsaved changes.</p>}
          <WritePanel recipe={recipe} plan={plan} look={look} />
          {plan && (
            <>
              <h2>Apply camera settings</h2>
              <CameraSettingsPanel target={plan.camera} recipeName={recipe.name || 'Recipe'} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
