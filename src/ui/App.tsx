import { CameraProvider, useCamera } from './camera-context';
import { LibraryProvider, useLibrary } from './library-context';
import { useRoute } from './router';
import { Notice } from './components';
import { CameraPage } from './pages/CameraPage';
import { RecipesPage } from './pages/RecipesPage';
import { RecipePage } from './pages/RecipePage';
import { HelpPage } from './pages/HelpPage';
import { EditorPage } from './pages/EditorPage';
import { APP_NAME, CONTRIBUTING_URL, REPO_URL } from './project';

const NAV = [
  { href: '#/', key: '', label: 'Camera' },
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
  else page = <CameraPage />;

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
