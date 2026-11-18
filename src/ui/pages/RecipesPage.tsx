import { useState } from 'react';
import { parseRecipeFile, slugify } from '../../recipe/schema';
import { downloadText, readFileText, recipesToFile } from '../../store/files';
import { resolveLook } from '../../style/looks';
import { FilePicker, Notice } from '../components';
import { useLibrary } from '../library-context';

export function RecipesPage() {
  const lib = useLibrary();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const custom = lib.recipes.filter((r) => lib.customRecipeIds.has(r.id));

  const importFile = async (f: File) => {
    setMsg(null);
    try {
      const { recipes, errors } = parseRecipeFile(await readFileText(f));
      const taken = new Set(lib.recipes.map((r) => r.id));
      for (const r of recipes) {
        let id = r.id;
        for (let n = 2; taken.has(id); n++) id = `${slugify(r.id)}-${n}`;
        taken.add(id);
        await lib.saveRecipe({ ...r, id });
      }
      if (errors.length) setMsg({ tone: recipes.length ? 'warn' : 'error', text: `Imported ${recipes.length}. Problems: ${errors.join(' ')}` });
      else setMsg({ tone: 'ok', text: `Imported ${recipes.length} recipe${recipes.length === 1 ? '' : 's'}.` });
    } catch (e) {
      setMsg({ tone: 'error', text: String((e as Error).message ?? e) });
    }
  };

  return (
    <>
      <h1>Recipes</h1>
      <p className="muted">
        Film-style recipes written in Fujifilm terms. Each one shows what goes into the camera, what to set by hand, and what this camera cannot do.
      </p>
      <div className="row wrap-row">
        <a className="button primary" href="#/recipe/new">
          New recipe
        </a>
        <FilePicker label="Import recipe file…" onFile={(f) => void importFile(f)} />
        {custom.length > 0 && (
          <button className="secondary" onClick={() => downloadText('my-recipes.json', recipesToFile(custom))}>
            Export my recipes
          </button>
        )}
      </div>
      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}
      <div className="grid3 recipes">
        {lib.recipes.map((r) => {
          const look = resolveLook(lib.looks, r);
          const isCustom = lib.customRecipeIds.has(r.id);
          return (
            <a key={r.id} className="card recipe-card" href={`#/recipe/${encodeURIComponent(r.id)}`}>
              <div className="slot-head">
                <span className={`badge ${isCustom ? 'badge-accent' : ''}`}>{isCustom ? 'yours' : 'built-in'}</span>
                {!look && lib.ready && <span className="badge badge-warn">look missing</span>}
              </div>
              <h3>{r.name}</h3>
              <p className="muted small">
                {look?.name ?? r.look}
                {r.author && r.author !== 'Recipe Loader' && <> · by {r.author}</>}
              </p>
              {r.notes && <p className="small clamp">{r.notes}</p>}
            </a>
          );
        })}
      </div>
    </>
  );
}
