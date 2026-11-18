// IndexedDB storage: custom recipes, captured/imported looks, slot backups.
// Everything stays in this browser; nothing is sent anywhere.

import type { Recipe } from '../recipe/schema';
import type { Slot } from '../canon/registration';
import type { LookParams } from '../style/look-engine';

export interface StoredLook {
  id: string;
  name: string;
  carrier: Uint8Array;
  source: 'captured' | 'imported' | 'created';
  addedAt: string;
  /** For looks made in the style editor: the settings and the base they were built from, so they can be re-edited. */
  params?: LookParams;
  baseLookId?: string;
}

export interface MetaRecord {
  id: string;
  value: unknown;
}

export interface StoredBackup {
  id: string;
  slot: Slot;
  model: string;
  firmware: string;
  takenAt: string;
  /** Why it was taken: "before writing …", "manual". */
  reason: string;
  /** Label of what was in the slot. */
  label: string;
  style: Uint8Array;
  state: Uint8Array;
}

const DB_NAME = 'recipe-loader';
const DB_VERSION = 2;
type StoreName = 'recipes' | 'looks' | 'backups' | 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['recipes', 'looks', 'backups', 'meta'] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('could not open browser storage'));
    };
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error ?? req.error ?? new Error('storage error'));
        t.onabort = () => reject(t.error ?? new Error('storage transaction aborted'));
      }),
  );
}

const getAll = <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
const put = <T>(store: StoreName, value: T) => tx(store, 'readwrite', (s) => s.put(value)).then(() => undefined);
const del = (store: StoreName, id: string) => tx(store, 'readwrite', (s) => s.delete(id)).then(() => undefined);

export const db = {
  listRecipes: () => getAll<Recipe>('recipes'),
  putRecipe: (r: Recipe) => put('recipes', r),
  deleteRecipe: (id: string) => del('recipes', id),

  listLooks: () => getAll<StoredLook>('looks'),
  putLook: (l: StoredLook) => put('looks', l),
  deleteLook: (id: string) => del('looks', id),

  listBackups: async () => (await getAll<StoredBackup>('backups')).sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
  putBackup: (b: StoredBackup) => put('backups', b),
  deleteBackup: (id: string) => del('backups', id),

  getMeta: async <T,>(id: string): Promise<T | undefined> =>
    (await tx<MetaRecord | undefined>('meta', 'readonly', (s) => s.get(id) as IDBRequest<MetaRecord | undefined>))?.value as T | undefined,
  putMeta: (id: string, value: unknown) => put<MetaRecord>('meta', { id, value }),
  deleteMeta: (id: string) => del('meta', id),
};

/** For tests: forget the cached connection. */
export function resetDbForTests(): void {
  dbPromise = null;
}
