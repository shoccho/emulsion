import { useEffect, useState } from 'react';

/** Hash routing only, so the static build works from any sub-path. Routes: #/ (home), #/camera, #/recipes, #/recipe/<id>, #/editor[/<look id>], #/help (#/looks shows the editor) */
export function useRoute(): string[] {
  const read = () =>
    window.location.hash
      .replace(/^#\/?/, '')
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => {
      setParts(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export const go = (path: string) => {
  window.location.hash = path;
};

/** Per-viewer conveniences only; every access may throw in private windows. */
export const local = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};
