import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ALL_BUILTIN_RECIPES } from '../recipe/builtin';
import type { Recipe } from '../recipe/schema';
import { db, type StoredLook } from '../store/db';
import { BASE_LOOKS, FILM_LOOKS, READY_MADE_LOOKS_URL, carrierLook, loadBuiltinCarrierLooks, type CarrierLook, type Look } from '../style/looks';
import { Keystream } from '../style/carrier-r100';
import { buildLookCarrier } from '../style/look-builder';
import { LOOK_PRESETS } from '../style/look-presets';
import { verifyKeys } from '../style/keys';
import { IDENTITY_SOURCE_LOOK, editableBases, editableBaseId } from '../style/editable-bases';

const KEYS_META = 'canon-style-keys';
/** Preferred base grids for the editor and generated looks, best first. */
export const PREFERRED_BASES = [editableBaseId('standard'), 'builtin:autumn-hues'];
export const DEFAULT_BASE_LOOK = PREFERRED_BASES[0]!;

export function pickBase<T extends { id: string; source: string }>(bases: T[]): T | undefined {
  for (const id of PREFERRED_BASES) {
    const b = bases.find((l) => l.id === id);
    if (b) return b;
  }
  return bases.find((l) => l.source !== 'created' && l.source !== 'generated');
}

/**
 * Editable bases and preset looks. The ready-made ones shipped with the site are used whenever present (no keys
 * needed). Only if they are missing (a checkout without public/looks) are they built here from the keys.
 */
function generatedLooks(keys: Uint8Array | null, raw: CarrierLook[], readyMade: CarrierLook[]): CarrierLook[] {
  if (readyMade.length) return readyMade;
  if (!keys) return [];
  const ks = new Keystream(keys);
  const source = raw.find((l) => l.id === IDENTITY_SOURCE_LOOK);
  let editable: CarrierLook[] = [];
  try {
    editable = source ? editableBases(source.carrier, ks) : [];
  } catch {
    editable = [];
  }
  const base = pickBase([...editable, ...raw]);
  if (!base) return editable;
  const out: CarrierLook[] = [...editable];
  for (const p of LOOK_PRESETS) {
    try {
      const carrier = buildLookCarrier(base.carrier, p.params, p.name, ks);
      out.push(carrierLook(`gen:${p.id}`, p.name, carrier, 'generated', `${p.description} Generated from ${base.name}.`));
    } catch {
      // skip
    }
  }
  return out;
}

interface LibraryState {
  ready: boolean;
  /** Canon style keys from the user's EOS Utility, or null if not loaded. */
  keys: Uint8Array | null;
  setKeys(k: Uint8Array | null): Promise<void>;
  storageError: string | null;
  looks: Look[];
  recipes: Recipe[];
  customRecipeIds: ReadonlySet<string>;
  saveRecipe(r: Recipe): Promise<void>;
  deleteRecipe(id: string): Promise<void>;
  saveLook(l: StoredLook): Promise<void>;
  deleteLook(id: string): Promise<void>;
}

const Ctx = createContext<LibraryState | null>(null);

export function useLibrary(): LibraryState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLibrary outside LibraryProvider');
  return c;
}

function storedToLook(s: StoredLook): CarrierLook | null {
  try {
    return carrierLook(s.id, s.name, s.carrier, s.source, '', s.addedAt);
  } catch {
    return null;
  }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [builtinLooks, setBuiltinLooks] = useState<CarrierLook[]>([]);
  const [readyMade, setReadyMade] = useState<CarrierLook[]>([]);
  const [storedLooks, setStoredLooks] = useState<CarrierLook[]>([]);
  const [custom, setCustom] = useState<Recipe[]>([]);
  const [keys, setKeysState] = useState<Uint8Array | null>(null);

  const reload = useCallback(async () => {
    try {
      const [recipes, looks] = await Promise.all([db.listRecipes(), db.listLooks()]);
      setCustom(recipes.sort((a, b) => a.name.localeCompare(b.name)));
      setStoredLooks(looks.map(storedToLook).filter((l): l is CarrierLook => l !== null));
      setStorageError(null);
    } catch (e) {
      setStorageError(`Browser storage is unavailable (${String(e)}). Custom recipes, looks and backups cannot be saved in this window.`);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const [builtin, ready] = await Promise.all([loadBuiltinCarrierLooks(), loadBuiltinCarrierLooks(READY_MADE_LOOKS_URL, 'generated')]);
      setBuiltinLooks(builtin);
      setReadyMade(ready);
      try {
        const k = await db.getMeta<Uint8Array>(KEYS_META);
        if (k && (await verifyKeys(k))) setKeysState(k);
      } catch {
        // storage unavailable: keys can still be loaded for this visit
      }
      await reload();
      setReady(true);
    })();
  }, [reload]);

  const generated = useMemo(() => generatedLooks(keys, [...builtinLooks, ...storedLooks], readyMade), [keys, builtinLooks, storedLooks, readyMade]);

  const value = useMemo<LibraryState>(
    () => ({
      ready,
      storageError,
      keys,
      setKeys: async (k) => {
        setKeysState(k);
        try {
          if (k) await db.putMeta(KEYS_META, k);
          else await db.deleteMeta(KEYS_META);
        } catch {
          // keep for this visit only
        }
      },
      looks: [...BASE_LOOKS, ...FILM_LOOKS, ...generated, ...builtinLooks, ...storedLooks],
      recipes: [...ALL_BUILTIN_RECIPES, ...custom],
      customRecipeIds: new Set(custom.map((r) => r.id)),
      saveRecipe: async (r) => {
        await db.putRecipe(r);
        await reload();
      },
      deleteRecipe: async (id) => {
        await db.deleteRecipe(id);
        await reload();
      },
      saveLook: async (l) => {
        await db.putLook(l);
        await reload();
      },
      deleteLook: async (id) => {
        await db.deleteLook(id);
        await reload();
      },
    }),
    [ready, storageError, keys, generated, builtinLooks, storedLooks, custom, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
