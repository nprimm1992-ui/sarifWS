// atmosphere.js — Light-theme atmospheric particle overlay + cursor afterglow
// Layer 3: sits above Three.js canvas (layer 0) and content (layer 2), below nav chrome.
// CTM: reset via setTransform each resize; draw/clear in CSS pixel space (matches capped DPR buffer).
// Driven by the unified main-ticker (shared with lobby + UI); the ticker owns
// visibility-pause and rAF. Canvas is authored in Base.astro with
// transition:persist so it survives every ClientRouter navigation;
// initAtmosphere() is idempotent and re-entrant-safe.

import { subscribe as tickerSubscribe, unsubscribe as tickerUnsubscribe, PRIORITY_OVERLAY } from './main-ticker.js';

const REFERENCE_ATMOSPHERE_HZ = 30;
const TARGET_ATMOSPHERE_FPS = 24;
const MIN_FRAME_INTERVAL_MS = 1000 / TARGET_ATMOSPHERE_FPS;
const DESKTOP_PARTICLES = 20;
const MOBILE_PARTICLES = 8;
const MOBILE_BREAKPOINT = 768;
const ATMOSPHERE_TIER_FULL_HD = 1920 * 1080;
const ATMOSPHERE_TIER_QHD = 2560 * 1440;

/** Match lobby-scene tiered DPR caps so the overlay canvas does not raster at 2×
 *  while WebGL runs at 1.2–1.35× on large HiDPI desktops. */
function resolveAtmosphereDpr() {
  const raw = Number(window.devicePixelRatio);
  const dpr = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const mobile = w < MOBILE_BREAKPOINT;
  if (mobile) return Math.min(dpr, 1.5);
  let cap = 1.65;
  const px = w * h;
  if (px > ATMOSPHERE_TIER_QHD) cap = Math.min(cap, 1.35);
  else if (px > ATMOSPHERE_TIER_FULL_HD) cap = Math.min(cap, 1.5);
  const dm = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  if (typeof dm === 'number' && dm > 0 && dm <= 4) cap = Math.min(cap, 1.38);
  return Math.min(dpr, cap);
}

let canvas, ctx;
/** main-ticker subscription token; replaces the per-module rAF loop. */
let _atmosphereTickerToken = null;
let particles = [];
let afterglows = [];
let isMobile = false;
let _lastDrawTime = 0;
/** Accumulates ticker dt across skipped repaint frames so particle drift stays time-correct at ~24 fps draw cadence. */
let _accumulatedDtSec = 0;
/** Bound for cleanup on real page unload (avoids duplicate document listeners on re-init). */
let documentMouseMoveHandler = null;
/** Logical viewport (CSS px); kept in sync with handleResize for draw/clear and DPR alignment */
let logicalWidth = 0;
let logicalHeight = 0;
let dprUsed = 1;
/** Guards the one-time module init (listeners, unload hooks). The canvas itself
 *  is persistent across ClientRouter navigations; only real unload tears down. */
let _atmosphereInitialized = false;
let _prefersReducedMotionLocked = null;
/** Guards once-per-document listeners that must survive pagehide → bfcache
 *  → pageshow cycles (the pageshow listener itself must not be torn down
 *  with cleanupAtmosphere, or there'd be nothing to drive re-init). */
let _atmosphereDocumentHooksAttached = false;

function createParticle(w, h) {
  const isCyan = Math.random() < 0.15;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    size: 1.5 + Math.random() * 4,
    opacity: isCyan ? 0.04 + Math.random() * 0.06 : 0.02 + Math.random() * 0.03,
    driftSpeedX: (Math.random() - 0.5) * 0.12,
    driftSpeedY: -0.03 - Math.random() * 0.08,
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: 0.002 + Math.random() * 0.003,
    isCyan,
  };
}

function initParticles() {
  const w = logicalWidth > 0 ? logicalWidth : window.innerWidth;
  const h = logicalHeight > 0 ? logicalHeight : window.innerHeight;
  isMobile = w < MOBILE_BREAKPOINT;
  const count = isMobile ? MOBILE_PARTICLES : DESKTOP_PARTICLES;

  particles = [];
  for (let i = 0; i < count; i++) {
    particles.push(createParticle(w, h));
  }
}

function drawParticles(w, h, tickScale) {
  for (const p of particles) {
    p.phase += p.phaseSpeed * tickScale;
    p.x += (p.driftSpeedX + Math.sin(p.phase) * 0.06) * tickScale;
    p.y += p.driftSpeedY * tickScale;

    if (p.y < -p.size) { p.y = h + p.size; p.x = Math.random() * w; }
    if (p.x < -p.size) p.x = w + p.size;
    if (p.x > w + p.size) p.x = -p.size;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
    if (p.isCyan) {
      ctx.fillStyle = `rgba(0, 212, 255, ${p.opacity})`;
    } else {
      ctx.fillStyle = `rgba(40, 38, 35, ${p.opacity})`;
    }
    ctx.fill();
  }
}

function drawAfterglows() {
  const now = performance.now();
  for (let i = afterglows.length - 1; i >= 0; i--) {
    const ag = afterglows[i];
    const age = now - ag.born;
    if (age > 200) {
      afterglows.splice(i, 1);
      continue;
    }
    const fade = 1 - age / 200;
    ctx.beginPath();
    ctx.arc(ag.x, ag.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 212, 255, ${0.03 * fade})`;
    ctx.fill();
  }
}

/** main-ticker step. Ticker supplies clamped dtSec and handles visibility. */
function animateStep(timestamp, dtSec) {
  if (!ctx || logicalWidth <= 0 || logicalHeight <= 0) return;

  _accumulatedDtSec += dtSec;

  const elapsed = timestamp - _lastDrawTime;
  if (_lastDrawTime !== 0 && elapsed < MIN_FRAME_INTERVAL_MS) return;
  _lastDrawTime = timestamp;

  const tickScale = REFERENCE_ATMOSPHERE_HZ * _accumulatedDtSec;
  _accumulatedDtSec = 0;

  ctx.clearRect(0, 0, logicalWidth, logicalHeight);
  drawParticles(logicalWidth, logicalHeight, tickScale);
  drawAfterglows();
}

function onAtmospherePageShow(event) {
  if (event.persisted && !_atmosphereInitialized) initAtmosphere();
}

function handleMouseMove(e) {
  afterglows.push({ x: e.clientX, y: e.clientY, born: performance.now() });
  if (afterglows.length > 8) afterglows.shift();
}

function onDocumentMouseMove(e) {
  const target = e.target;
  if (target && target.closest('a, button, [role="button"], .interactive, details summary')) {
    handleMouseMove(e);
  }
}

function handleResize() {
  if (!canvas || !ctx) return;
  dprUsed = resolveAtmosphereDpr();
  logicalWidth = window.innerWidth;
  logicalHeight = window.innerHeight;

  canvas.width = Math.floor(logicalWidth * dprUsed);
  canvas.height = Math.floor(logicalHeight * dprUsed);
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;

  ctx.setTransform(dprUsed, 0, 0, dprUsed, 0, 0);

  const wasMobile = isMobile;
  isMobile = logicalWidth < MOBILE_BREAKPOINT;
  if (wasMobile !== isMobile) initParticles();
}

function cleanupAtmosphere() {
  /* True teardown only — runs on pagehide/beforeunload. Releases canvas ctx
     and handlers so the browser can reclaim memory if the document is
     retained for bfcache. Visibility-pause of the tick loop is handled by
     the shared ticker; no per-module visibilitychange listener to remove. */
  if (_atmosphereTickerToken) {
    tickerUnsubscribe(_atmosphereTickerToken);
    _atmosphereTickerToken = null;
  }
  window.removeEventListener('resize', handleResize);
  if (documentMouseMoveHandler) {
    document.removeEventListener('mousemove', documentMouseMoveHandler);
    documentMouseMoveHandler = null;
  }
  canvas = null;
  ctx = null;
  particles = [];
  afterglows = [];
  logicalWidth = 0;
  logicalHeight = 0;
  dprUsed = 1;
  _accumulatedDtSec = 0;
  _lastDrawTime = 0;
  _atmosphereInitialized = false;
}

export function initAtmosphere() {
  /* Reduced-motion decision locked once per document to keep behaviour
     stable across SPA navigations. If the user toggles the OS preference
     mid-session, the lobby + atmosphere don't flicker on/off. */
  if (_prefersReducedMotionLocked === null) {
    _prefersReducedMotionLocked = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  if (_prefersReducedMotionLocked) return;

  if (_atmosphereInitialized) return;
  _atmosphereInitialized = true;

  /* Canvas is authored in Base.astro as a persistent transition target.
     If missing, the layout contract is broken — bail rather than creating
     a non-persistent canvas that would flash between pages. */
  canvas = document.getElementById('atmosphere-canvas');
  if (!canvas) {
    _atmosphereInitialized = false;
    return;
  }

  ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas = null;
    _atmosphereInitialized = false;
    return;
  }

  handleResize();
  initParticles();

  window.addEventListener('resize', handleResize, { passive: true });

  /* Unload + bfcache-restore hooks attach exactly once per document. They
     must survive cleanupAtmosphere() (which runs on pagehide) or the
     restore path would have nothing listening for it. */
  if (!_atmosphereDocumentHooksAttached) {
    _atmosphereDocumentHooksAttached = true;
    window.addEventListener('pagehide', cleanupAtmosphere);
    window.addEventListener('beforeunload', cleanupAtmosphere);
    window.addEventListener('pageshow', onAtmospherePageShow);
  }

  documentMouseMoveHandler = onDocumentMouseMove;
  document.addEventListener('mousemove', documentMouseMoveHandler, { passive: true });

  /* Subscribe to the unified ticker (auto-pauses on tab hidden / resumes on
     visibilitychange + pageshow). No self-rAF here. */
  if (_atmosphereTickerToken) tickerUnsubscribe(_atmosphereTickerToken);
  _atmosphereTickerToken = tickerSubscribe(animateStep, PRIORITY_OVERLAY);
}
