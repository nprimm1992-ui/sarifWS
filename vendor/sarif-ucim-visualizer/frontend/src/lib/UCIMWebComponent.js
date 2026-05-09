/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  UCIM Web Component — <ucim-visualization>                  ║
 * ║  Universal Contextual Intelligence Matrix                   ║
 * ║  Self-contained Custom Element for Astro / vanilla HTML     ║
 * ║                                                             ║
 * ║  Peer dependencies: three (>=0.160), gsap (>=3.12)          ║
 * ║  Usage: <ucim-visualization></ucim-visualization>           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { UCIMVisualization } from './UCIMVisualization.js';

/* ─── Constants ──────────────────────────────────────────────── */

const LABELS = [
  'Market Position', 'Competitive Landscape', 'Organizational Context',
  'Risk Architecture', 'Revenue Structure', 'Stakeholder Mapping',
  'Strategic Alignment', 'Operational Reality',
];

const FB_NODES = [
  [78, 48], [69, 72], [50, 82], [31, 72],
  [22, 48], [31, 24], [50, 14], [69, 24],
];

const FB_CROSS = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[0,4],[2,6]];

/* ─── Scoped CSS (injected into shadow root) ─────────────────── */

const STYLES = /* css */ `
  :host {
    display: block;
    width: 100%;
    contain: layout style;
  }

  *, *::before, *::after { border-radius: 0; box-sizing: border-box; }

  .ucim-container {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #0a0f1a;
  }

  /* Cinematic vignette */
  .ucim-container::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 50%, rgba(10,15,26,0.5) 80%, #0a0f1a 100%);
    pointer-events: none;
    z-index: 5;
  }

  /* ── Glass-morphism labels ── */
  .ucim-label {
    position: absolute;
    transform: translateX(-50%);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.92);
    pointer-events: none;
    white-space: nowrap;
    z-index: 10;
    padding: 3px 10px;
    background: rgba(10, 15, 26, 0.5);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 212, 255, 0.1);
    border-left: 2px solid rgba(0, 212, 255, 0.45);
    text-shadow: 0 0 8px rgba(0, 212, 255, 0.15);
    transition: opacity 0.12s ease;
  }

  /* ═══ CSS Fallback ═══ */
  .ucim-fallback {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
  }

  .ucim-fb-bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 50%, #1a1a2e 0%, #0a0f1a 65%);
  }

  .ucim-fb-grid {
    position: absolute; inset: 0; opacity: 0.04;
    background-image:
      linear-gradient(30deg, #00d4ff 12%, transparent 12.5%, transparent 87%, #00d4ff 87.5%, #00d4ff),
      linear-gradient(150deg, #00d4ff 12%, transparent 12.5%, transparent 87%, #00d4ff 87.5%, #00d4ff),
      linear-gradient(30deg, #00d4ff 12%, transparent 12.5%, transparent 87%, #00d4ff 87.5%, #00d4ff),
      linear-gradient(150deg, #00d4ff 12%, transparent 12.5%, transparent 87%, #00d4ff 87.5%, #00d4ff),
      linear-gradient(60deg, rgba(0,212,255,0.3) 25%, transparent 25.5%, transparent 75%, rgba(0,212,255,0.3) 75%),
      linear-gradient(60deg, rgba(0,212,255,0.3) 25%, transparent 25.5%, transparent 75%, rgba(0,212,255,0.3) 75%);
    background-size: 40px 70px;
    background-position: 0 0, 0 0, 20px 35px, 20px 35px, 0 0, 20px 35px;
    animation: ucim-grid-pulse 4s ease-in-out infinite;
  }

  .ucim-fb-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; }

  .ucim-fb-line {
    stroke-dasharray: 120; stroke-dashoffset: 120;
    animation: ucim-line-draw 1.8s ease-out forwards;
  }
  .ucim-fb-line-active {
    animation: ucim-line-draw 1.8s ease-out forwards, ucim-line-flow 4s linear infinite 2s;
  }

  .ucim-fb-particle {
    position: absolute; background: #d4af37; opacity: 0; z-index: 2;
    animation: ucim-particle-drift linear infinite;
  }

  .ucim-fb-center {
    position: absolute; left: 50%; top: 50%;
    transform: translate(-50%, -50%); z-index: 4;
  }
  .ucim-fb-center-glow {
    position: absolute; left: 50%; top: 50%; width: 60px; height: 60px;
    transform: translate(-50%, -50%) rotate(45deg);
    border: 1px solid rgba(0, 212, 255, 0.15);
    animation: ucim-halo-pulse 3.5s ease-in-out infinite;
    box-shadow: 0 0 25px rgba(0, 212, 255, 0.08);
  }
  .ucim-fb-center-ring {
    position: absolute; left: 50%; top: 50%; width: 42px; height: 42px;
    transform: translate(-50%, -50%) rotate(45deg);
    border: 1px solid rgba(212, 175, 55, 0.3);
    animation: ucim-ring-spin 12s linear infinite;
  }
  .ucim-fb-center-inner {
    width: 26px; height: 26px; background: #d4af37; transform: rotate(45deg);
    animation: ucim-center-pulse 3s ease-in-out infinite;
    box-shadow: 0 0 20px rgba(212, 175, 55, 0.6), 0 0 50px rgba(212, 175, 55, 0.2);
  }

  .ucim-fb-node {
    position: absolute; transform: translate(-50%, -50%);
    z-index: 3; opacity: 0;
    animation: ucim-node-appear 0.6s ease-out forwards;
  }
  .ucim-fb-node-diamond {
    width: 10px; height: 10px; background: transparent;
    border: 1.5px solid rgba(212, 175, 55, 0.6); transform: rotate(45deg);
    margin: 0 auto 6px;
    box-shadow: 0 0 6px rgba(0, 212, 255, 0.3), inset 0 0 3px rgba(0, 212, 255, 0.15);
    animation: ucim-node-glow 4s ease-in-out infinite;
  }
  .ucim-fb-node-label {
    display: block; font-family: 'Space Grotesk', sans-serif;
    font-size: 7px; font-weight: 500; letter-spacing: 0.08em;
    text-transform: uppercase; color: rgba(255, 255, 255, 0.55);
    text-align: center; white-space: nowrap;
  }

  @keyframes ucim-grid-pulse  { 0%,100%{opacity:.03} 50%{opacity:.06} }
  @keyframes ucim-line-draw   { to{stroke-dashoffset:0} }
  @keyframes ucim-line-flow   { to{stroke-dashoffset:-20} }
  @keyframes ucim-particle-drift {
    0%{transform:translate(0,0);opacity:0} 12%{opacity:.5} 88%{opacity:.5}
    100%{transform:translate(var(--dx),var(--dy));opacity:0}
  }
  @keyframes ucim-halo-pulse  { 0%,100%{transform:translate(-50%,-50%) rotate(45deg) scale(1);opacity:.5} 50%{transform:translate(-50%,-50%) rotate(45deg) scale(1.15);opacity:.9} }
  @keyframes ucim-ring-spin   { to{transform:translate(-50%,-50%) rotate(405deg)} }
  @keyframes ucim-center-pulse {
    0%,100%{transform:rotate(45deg) scale(1);box-shadow:0 0 20px rgba(212,175,55,.6),0 0 50px rgba(212,175,55,.2)}
    50%{transform:rotate(45deg) scale(1.1);box-shadow:0 0 35px rgba(212,175,55,.8),0 0 80px rgba(212,175,55,.35)}
  }
  @keyframes ucim-node-appear { from{opacity:0;transform:translate(-50%,-50%) scale(0)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
  @keyframes ucim-node-glow   { 0%,100%{box-shadow:0 0 6px rgba(0,212,255,.3),inset 0 0 3px rgba(0,212,255,.15)} 50%{box-shadow:0 0 14px rgba(0,212,255,.6),inset 0 0 6px rgba(0,212,255,.3)} }

  @media (max-width: 768px) {
    .ucim-fb-center-inner { width: 20px; height: 20px; }
    .ucim-fb-center-glow  { width: 46px; height: 46px; }
    .ucim-fb-center-ring  { width: 34px; height: 34px; }
    .ucim-fb-node-label   { font-size: 6px; }
    .ucim-label { font-size: 9px; padding: 2px 7px; }
  }
  @media (max-width: 480px) {
    .ucim-fb-node-label { display: none; }
  }
`;

/* ─── Fallback HTML generator ────────────────────────────────── */

function buildFallbackHTML() {
  const seed = [17,53,89,23,67,41,73,11,97,29,61,47,83,19,59,71,37,91,7,43,79,31,3,63];
  const particles = seed.map((s, i) => {
    const left = 8 + (s / 100) * 84;
    const top = 8 + ((s * 3 + 17) % 100) / 100 * 84;
    const size = 1.5 + (s % 30) / 10;
    const delay = (s % 80) / 10;
    const dur = 5 + (s % 70) / 10;
    const dx = -25 + (s % 50);
    const dy = -25 + ((s * 7) % 50);
    return `<div class="ucim-fb-particle" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;animation-delay:${delay.toFixed(1)}s;animation-duration:${dur.toFixed(1)}s;--dx:${dx}px;--dy:${dy}px"></div>`;
  }).join('');

  const primaryLines = FB_NODES.map(([x, y], i) =>
    `<line x1="50" y1="50" x2="${x}" y2="${y}" stroke="#00d4ff" stroke-width="0.18" stroke-opacity="0.22" class="ucim-fb-line-active" style="animation-delay:${i * 0.25}s"/>`
  ).join('');

  const crossLines = FB_CROSS.map(([a, b], i) =>
    `<line x1="${FB_NODES[a][0]}" y1="${FB_NODES[a][1]}" x2="${FB_NODES[b][0]}" y2="${FB_NODES[b][1]}" stroke="#00d4ff" stroke-width="0.1" stroke-opacity="0.12" class="ucim-fb-line" style="animation-delay:${(1.5 + i * 0.18).toFixed(2)}s"/>`
  ).join('');

  const nodes = FB_NODES.map(([left, top], i) => `
    <div class="ucim-fb-node" style="left:${left}%;top:${top}%;animation-delay:${(0.6 + i * 0.2).toFixed(1)}s">
      <div class="ucim-fb-node-diamond" style="animation-delay:${((i * 37) % 20) / 10}s"></div>
      <span class="ucim-fb-node-label">${LABELS[i]}</span>
    </div>`
  ).join('');

  return `
    <div class="ucim-fallback" aria-label="Universal Contextual Intelligence Matrix">
      <div class="ucim-fb-bg"></div>
      <div class="ucim-fb-grid"></div>
      <svg class="ucim-fb-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        ${primaryLines}${crossLines}
      </svg>
      ${particles}
      <div class="ucim-fb-center">
        <div class="ucim-fb-center-glow"></div>
        <div class="ucim-fb-center-ring"></div>
        <div class="ucim-fb-center-inner"></div>
      </div>
      ${nodes}
    </div>`;
}

/* ─── Custom Element ─────────────────────────────────────────── */

class UCIMVisualizationElement extends HTMLElement {

  static get observedAttributes() {
    return ['bloom-strength', 'fallback-only'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._viz = null;
    this._observer = null;
  }

  connectedCallback() {
    this._ensureFont();

    /* Inject styles */
    const style = document.createElement('style');
    style.textContent = STYLES;
    this._shadow.appendChild(style);

    /* Root container */
    const root = document.createElement('div');
    this._shadow.appendChild(root);

    if (this._shouldUseFallback()) {
      root.innerHTML = buildFallbackHTML();
      return;
    }

    /* WebGL path */
    const container = document.createElement('div');
    container.className = 'ucim-container';
    container.setAttribute('aria-label', 'Universal Contextual Intelligence Matrix — 3D Visualization');
    root.appendChild(container);

    /* Wait one frame so the container has layout dimensions */
    requestAnimationFrame(() => {
      if (!this.isConnected) return;

      this._viz = new UCIMVisualization(container);

      this._observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) this._viz?.start();
        else this._viz?.pause();
      }, { threshold: 0.1 });

      this._observer.observe(this);
    });
  }

  disconnectedCallback() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    if (this._viz) { this._viz.destroy(); this._viz = null; }
  }

  attributeChangedCallback(name, _old, val) {
    if (name === 'bloom-strength' && this._viz?.bloomPass) {
      this._viz.bloomPass.strength = parseFloat(val) || 0.55;
    }
  }

  /* ── Helpers ── */

  _shouldUseFallback() {
    if (this.hasAttribute('fallback-only')) return true;
    if (window.innerWidth < 768) return true;
    try {
      const c = document.createElement('canvas');
      return !(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return true; }
  }

  _ensureFont() {
    if (document.querySelector('link[data-ucim-font]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap';
    link.setAttribute('data-ucim-font', '');
    document.head.appendChild(link);
  }
}

/* ─── Register ───────────────────────────────────────────────── */

if (!customElements.get('ucim-visualization')) {
  customElements.define('ucim-visualization', UCIMVisualizationElement);
}

export { UCIMVisualizationElement, UCIMVisualization };
