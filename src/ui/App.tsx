import { CameraProvider, useCamera } from './camera-context';
import { LibraryProvider, useLibrary } from './library-context';
import { useRoute } from './router';
import { Notice } from './components';
import { CameraPage } from './pages/CameraPage';
import { RecipesPage } from './pages/RecipesPage';
import { RecipePage } from './pages/RecipePage';
import { HelpPage } from './pages/HelpPage';
import { EditorPage } from './pages/EditorPage';
import { HomePage } from './pages/HomePage';
import { APP_NAME, CONTRIBUTING_URL, REPO_URL } from './project';

const NAV = [
  { href: '#/camera', key: 'camera', label: 'Camera' },
  { href: '#/recipes', key: 'recipes', label: 'Recipes' },
  { href: '#/editor', key: 'editor', label: 'Style editor' },
  { href: '#/help', key: 'help', label: 'Help' },
];

function Shell() {
  const route = useRoute();
  const lib = useLibrary();
  const cam = useCamera();
  const top = route[0] ?? '';
  // #/looks was merged into the style editor; old links land there.
  const active = top === 'recipe' ? 'recipes' : top === 'looks' ? 'editor' : top;

  let page;
  if (top === 'recipes') page = <RecipesPage />;
  else if (top === 'recipe') page = <RecipePage id={route[1] ?? 'new'} />;
  else if (top === 'help') page = <HelpPage />;
  else if (top === 'editor' || top === 'looks') page = <EditorPage key={route[1] ?? 'new'} lookId={top === 'editor' ? route[1] : undefined} />;
  else if (top === 'camera') page = <CameraPage />;
  else page = <HomePage />;

  return (
    <>
      <header className="app-header">
        <div className="wrap header-inner">
          <a className="brand" href="#/">
            {APP_NAME} <span className="muted">for Canon EOS R100</span>
          </a>
          <nav aria-label="Main">
            {NAV.map((n) => (
              <a key={n.key} href={n.href} aria-current={active === n.key ? 'page' : undefined}>
                {n.label}
              </a>
            ))}
          </nav>
          <span className={`status-dot ${cam.snapshot ? 'on' : ''}`} title={cam.snapshot ? 'Camera connected' : 'No camera'}>
            {cam.snapshot ? (cam.kind === 'demo' ? 'Demo camera' : 'Camera connected') : 'Not connected'}
          </span>
          <a className="gh-link" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Emulsion on GitHub" title="Source code on GitHub">
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </header>
      <main className="wrap">
        {lib.storageError && <Notice tone="warn">{lib.storageError}</Notice>}
        {page}
      </main>
      <footer className="wrap footer muted small">
        Unofficial tool. Not affiliated with Canon or Fujifilm. Looks are approximations "inspired by" film simulations, not
        reproductions. Everything runs in your browser; nothing is uploaded. Use at your own risk. Works with the EOS R100 today;{' '}
        <a href={CONTRIBUTING_URL}>help add your Canon</a>. <a href={REPO_URL}>Source code</a> (MIT).
      </footer>
    </>
  );
}

export function App() {
  return (
    <LibraryProvider>
      <CameraProvider>
        <Shell />
      </CameraProvider>
    </LibraryProvider>
  );
}
