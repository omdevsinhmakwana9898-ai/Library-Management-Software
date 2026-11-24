import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import StaticHall from './StaticHall.jsx';

const HeroScene = lazy(() => import('./HeroScene.jsx'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/**
 * Shows a static hall immediately. On desktop only, lazy-loads the three.js
 * hero after first paint. The canvas never captures page scroll (pointer-events:
 * none). Mobile and reduced-motion stay on the static hall.
 */
export default function Scene3D({ still = false }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(false);
  const [visible, setVisible] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 767px)').matches;
    if (still || narrow || !hasWebGL()) return;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    const id = idle(() => {
      setSupported(true);
      setReady(true);
    }, { timeout: 1200 });
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id));
  }, [still]);

  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '100px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {(!supported || !loaded) && (
        <div className={`absolute inset-0 ${loaded ? 'opacity-0' : 'opacity-100'}`}>
          <StaticHall />
        </div>
      )}
      {supported && ready && (
        <Suspense fallback={null}>
          <div className={`absolute inset-0 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
            <HeroScene active={visible} still={still} onReady={() => setLoaded(true)} />
          </div>
        </Suspense>
      )}
    </div>
  );
}
