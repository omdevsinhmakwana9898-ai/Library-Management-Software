import { lazy, Suspense } from 'react';
import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import { usePathname, LEGAL_ROUTES } from './router.js';
import { DEMO_PATH } from './config.js';
import { LegalRoute } from './pages/LegalPages.jsx';
import { DemoPage } from './pages/DemoPage.jsx';

const HomeBelowFold = lazy(() => import('./components/HomeBelowFold.jsx'));

function Home() {
  return (
    <>
      <a href="#main" className="sr-only z-[60] rounded-lg bg-gold-400 px-4 py-2 font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Suspense fallback={null}>
          <HomeBelowFold />
        </Suspense>
      </main>
    </>
  );
}

export default function App() {
  const path = usePathname();
  if (path === DEMO_PATH) return <DemoPage />;
  if (LEGAL_ROUTES[path]) return <LegalRoute path={path} />;
  return <Home />;
}
