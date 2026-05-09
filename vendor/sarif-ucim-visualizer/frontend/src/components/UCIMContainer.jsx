import React, { useRef, useEffect, useState } from 'react';
import UCIMFallback from './UCIMFallback';

function detectWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function UCIMContainer() {
  const containerRef = useRef(null);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const embedded = window.self !== window.top;
    /* Iframe viewport is often under 768px even on desktop; that wrongly forced the CSS fallback. */
    const isMobileViewport = !embedded && window.innerWidth < 768;
    const hasWebGL = detectWebGL();

    if (isMobileViewport || !hasWebGL) {
      setUseFallback(true);
      return;
    }

    let mounted = true;
    let viz = null;
    let observer = null;
    let messageHandler = null;

    (async () => {
      try {
        const { UCIMVisualization } = await import('../lib/UCIMVisualization');
        if (!mounted || !containerRef.current) return;

        viz = new UCIMVisualization(containerRef.current);

        /* Standalone page: start only when scrolled into view (saves GPU).
           Embedded in an iframe (e.g. About): the canvas often sits below the in-frame
           header/fold — IntersectionObserver never reaches threshold 0.1, so start()
           never ran and the embed looked blank. */
        observer = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) viz.start();
            else viz.pause();
          },
          { threshold: 0.1, rootMargin: embedded ? '200px 0px 200px 0px' : '0px' },
        );
        observer.observe(containerRef.current);

        /* Parent-frame control channel: pause/resume on route change in host app.
           Defense-in-depth: source identity + origin check. In the Sarif deployment the parent
           and iframe are same-origin; if a future host embeds UCIM cross-origin, this will safely
           no-op and fall back to the IntersectionObserver-driven play/pause behavior. */
        if (embedded) {
          const parentOrigin = window.location.origin;
          messageHandler = (ev) => {
            if (ev.source !== window.parent) return;
            if (ev.origin !== parentOrigin) return;
            const data = ev && ev.data;
            if (!data || typeof data !== 'object') return;
            if (data.type === 'ucim:pause') viz.pause();
            else if (data.type === 'ucim:resume') viz.resume();
          };
          window.addEventListener('message', messageHandler);
          viz.start();
        }
      } catch (err) {
        /* WebGL init or module load failure — surface CSS fallback. */
        if (!mounted) return;
        if (typeof console !== 'undefined') {
          console.error('[UCIM] visualization init failed, falling back to CSS.', err);
        }
        setUseFallback(true);
      }
    })();

    return () => {
      mounted = false;
      if (messageHandler) window.removeEventListener('message', messageHandler);
      if (observer) observer.disconnect();
      if (viz) viz.destroy();
    };
  }, []);

  if (useFallback) {
    return <UCIMFallback />;
  }

  return (
    <div
      ref={containerRef}
      data-testid="ucim-webgl-container"
      className="ucim-container"
      aria-label="Universal Contextual Intelligence Matrix — 3D Visualization"
    />
  );
}
