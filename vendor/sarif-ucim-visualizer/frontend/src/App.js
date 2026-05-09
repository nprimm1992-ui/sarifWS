import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import UCIMContainer from '@/components/UCIMContainer';

/**
 * CRA should inline `process.env.PUBLIC_URL` from package.json `homepage`.
 * If it is ever missing in the bundle, BrowserRouter gets no basename and
 * routes never match `/ucim-visualizer/` (console: "No routes matched location …").
 */
function getRouterBasename() {
  const fromEnv =
    typeof process !== 'undefined' && process.env.PUBLIC_URL
      ? String(process.env.PUBLIC_URL).replace(/\/$/, '')
      : '';
  /* `homepage: "."` sets PUBLIC_URL to "." — not a valid Router basename */
  if (fromEnv && fromEnv !== '.') return fromEnv;
  if (typeof window === 'undefined') return '';
  const { pathname } = window.location;
  const m = pathname.match(/^(\/ucim-visualizer)(?:\/|$)/);
  return m ? m[1] : '';
}

/* ── Demo: Web Component route (verifies standalone bundle) ── */
function WebComponentDemo() {
  React.useEffect(() => {
    import('@/lib/UCIMWebComponent.js');
  }, []);

  return (
    <div className="ucim-page" data-testid="ucim-wc-demo">
      <header className="ucim-header">
        <p className="ucim-eyebrow">Web Component Demo</p>
        <h1 className="ucim-title">Standalone Bundle Test</h1>
        <p className="ucim-subtitle">
          This route uses the &lt;ucim-visualization&gt; custom element directly.
        </p>
      </header>
      <main className="ucim-main">
        {/* The custom element renders via Shadow DOM — no React needed */}
        <ucim-visualization data-testid="ucim-wc-element" />
      </main>
    </div>
  );
}

/* ── Primary demo page ── */
function Home() {
  return (
    <div className="ucim-page" data-testid="ucim-page">
      <header className="ucim-header">
        <p className="ucim-eyebrow" data-testid="ucim-eyebrow">Sarif Consulting</p>
        <h1 className="ucim-title" data-testid="ucim-title">
          Universal Contextual<br />Intelligence Matrix
        </h1>
        <p className="ucim-subtitle" data-testid="ucim-subtitle">
          Eight dimensions of strategic depth, assembled in real time.
        </p>
      </header>
      <main className="ucim-main">
        <UCIMContainer />
      </main>
      <footer className="ucim-footer">
        <p className="ucim-caption" data-testid="ucim-caption">
          Every engagement begins with architecture, not assumptions.
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  const basename = getRouterBasename() || undefined;
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/web-component" element={<WebComponentDemo />} />
        {/* Static hosts often keep `index.html` in the path; basename alone may not normalize it */}
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
