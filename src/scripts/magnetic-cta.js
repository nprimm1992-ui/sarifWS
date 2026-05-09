/**
 * Round-3 P8e — Magnetic CTAs.
 *
 * Any element carrying `[data-cta-magnetic]` becomes a weak magnet for
 * the cursor: within MAGNETIC_RADIUS_PX it translates up to
 * MAGNETIC_MAX_PX toward the cursor along a critically-damped spring.
 * The effect reads as "important controls lean toward you" without
 * displacing the control more than a few pixels — never enough to
 * miss a click.
 *
 * Single delegated `pointermove` listener on document, so the cost is
 * O(1) in handlers regardless of the number of magnetic CTAs. Per-
 * element state lives in a module-local Map keyed by the element so
 * we can cheaply iterate on each ticker frame.
 *
 * Reduced-motion: returns an identity transform. A user who disables
 * motion doesn't just want "smaller" animation — they want the
 * control to stay put. Attach is a no-op under reduced-motion so we
 * never mount the listener either.
 *
 * Lifecycle: installed once on first import, re-scanned on
 * `astro:page-load`. Teardown happens on `astro:before-swap` so
 * leaving-page transforms don't persist visually; the next page's
 * onPageLoad re-scans.
 */

/* Inside this radius (CSS pixels from element's visible centre) the
 * magnet applies force. 80 px matches the "hover halo" on existing
 * CTAs — any closer and you'd miss the effect; any farther and the
 * translate would trigger for users merely passing by. */
const MAGNETIC_RADIUS_PX = 80;
/* Maximum translate magnitude in any direction. 6 px reads as a
 * deliberate lean without crossing into the click-miss territory
 * cited in ISO 9241-9's pointing-device guidelines. */
const MAGNETIC_MAX_PX = 6;
/* Spring stiffness and damping — critically damped by construction
 * (damping = 2√stiffness). 180/26.8 gives a ~300 ms settle on a 6 px
 * step, slightly faster than a route tween so the magnet tracks
 * pointer moves perceptibly live. */
const MAGNETIC_STIFFNESS = 180;
const MAGNETIC_DAMPING = 2 * Math.sqrt(MAGNETIC_STIFFNESS);

/** @typedef {{el: HTMLElement, tx: number, ty: number, vx: number, vy: number, targetX: number, targetY: number, active: boolean, centerX: number, centerY: number, halfW: number, halfH: number}} MagnetState */

import { subscribeReducedMotion } from './reduced-motion.js';

/** @type {Map<HTMLElement, MagnetState>} */
const _magnets = new Map();
/** @type {number | null} */
let _rafHandle = null;
let _lastFrameMs = 0;
let _listenersAttached = false;
let _reducedMotion = false;

function scan() {
  if (_reducedMotion) return;
  const elements = document.querySelectorAll('[data-cta-magnetic]');
  const seen = new Set();
  for (const raw of elements) {
    if (!(raw instanceof HTMLElement)) continue;
    seen.add(raw);
    if (!_magnets.has(raw)) {
      _magnets.set(raw, {
        el: raw,
        tx: 0, ty: 0, vx: 0, vy: 0,
        targetX: 0, targetY: 0,
        active: false,
        centerX: 0, centerY: 0,
        halfW: 0, halfH: 0,
      });
    }
  }
  /* Drop elements that disappeared between scans (ClientRouter page
     swap removed them, hidden by filter, etc). Keeps the Map bounded
     to what's actually on screen. */
  for (const el of _magnets.keys()) {
    if (!seen.has(el)) {
      el.style.removeProperty('transform');
      _magnets.delete(el);
    }
  }
}

function refreshMetrics(state) {
  const rect = state.el.getBoundingClientRect();
  state.centerX = rect.left + rect.width / 2;
  state.centerY = rect.top + rect.height / 2;
  state.halfW = rect.width / 2;
  state.halfH = rect.height / 2;
}

/** @param {PointerEvent} e */
function onPointerMove(e) {
  if (_reducedMotion) return;
  const cx = e.clientX;
  const cy = e.clientY;
  for (const state of _magnets.values()) {
    refreshMetrics(state);
    const dx = cx - state.centerX;
    const dy = cy - state.centerY;
    /* Proximity test uses the larger of the two radii: the configured
       halo plus the element's own half-extent, so a wide button's
       magnet doesn't die while the cursor is still above the button. */
    const r = MAGNETIC_RADIUS_PX;
    const reachX = state.halfW + r;
    const reachY = state.halfH + r;
    if (Math.abs(dx) > reachX || Math.abs(dy) > reachY) {
      state.targetX = 0;
      state.targetY = 0;
      state.active = state.tx !== 0 || state.ty !== 0 || Math.abs(state.vx) > 0.01 || Math.abs(state.vy) > 0.01;
      continue;
    }
    /* Normalise to the halo and cap at MAGNETIC_MAX_PX. */
    const nx = Math.max(-1, Math.min(1, dx / reachX));
    const ny = Math.max(-1, Math.min(1, dy / reachY));
    state.targetX = nx * MAGNETIC_MAX_PX;
    state.targetY = ny * MAGNETIC_MAX_PX;
    state.active = true;
  }
  ensureFrameLoop();
}

function onPointerLeave() {
  for (const state of _magnets.values()) {
    state.targetX = 0;
    state.targetY = 0;
    state.active = state.tx !== 0 || state.ty !== 0 || Math.abs(state.vx) > 0.01 || Math.abs(state.vy) > 0.01;
  }
  ensureFrameLoop();
}

function ensureFrameLoop() {
  if (_rafHandle !== null) return;
  _lastFrameMs = performance.now();
  _rafHandle = requestAnimationFrame(step);
}

/** @param {number} now */
function step(now) {
  _rafHandle = null;
  const dt = Math.min(0.05, (now - _lastFrameMs) / 1000);
  _lastFrameMs = now;
  let anyActive = false;
  for (const state of _magnets.values()) {
    /* Critically-damped spring integrated via semi-implicit Euler.
       Preserves stability for large dt (tab-wake) without introducing
       the overshoot a naive explicit Euler would at low refresh. */
    const ax = -MAGNETIC_STIFFNESS * (state.tx - state.targetX) - MAGNETIC_DAMPING * state.vx;
    const ay = -MAGNETIC_STIFFNESS * (state.ty - state.targetY) - MAGNETIC_DAMPING * state.vy;
    state.vx += ax * dt;
    state.vy += ay * dt;
    state.tx += state.vx * dt;
    state.ty += state.vy * dt;
    if (
      Math.abs(state.tx - state.targetX) < 0.05 &&
      Math.abs(state.ty - state.targetY) < 0.05 &&
      Math.abs(state.vx) < 0.05 &&
      Math.abs(state.vy) < 0.05
    ) {
      state.tx = state.targetX;
      state.ty = state.targetY;
      state.vx = state.vy = 0;
      state.active = state.targetX !== 0 || state.targetY !== 0;
    }
    if (state.tx === 0 && state.ty === 0) {
      state.el.style.removeProperty('transform');
    } else {
      /* translate3d forces the composition layer, which keeps the
         repaint off the main thread. Using CSS variables on the
         element would be cleaner but some CTAs already use transform
         elsewhere; we own the full string to avoid conflicts. */
      state.el.style.transform = `translate3d(${state.tx.toFixed(2)}px, ${state.ty.toFixed(2)}px, 0)`;
    }
    if (state.active) anyActive = true;
  }
  if (anyActive) {
    _rafHandle = requestAnimationFrame(step);
  }
}

function attachListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerout', onPointerLeave, { passive: true });
}

function detachListeners() {
  if (!_listenersAttached) return;
  _listenersAttached = false;
  document.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerout', onPointerLeave);
  if (_rafHandle !== null) {
    cancelAnimationFrame(_rafHandle);
    _rafHandle = null;
  }
  for (const state of _magnets.values()) {
    state.el.style.removeProperty('transform');
  }
  _magnets.clear();
}

function onPageLoad() {
  if (_reducedMotion) {
    detachListeners();
    return;
  }
  attachListeners();
  scan();
}

function onBeforeSwap() {
  /* Teardown transforms so they don't persist into the next page's
     initial paint while the view transition is running. The
     astro:page-load below will re-scan and re-attach. */
  detachListeners();
}

/**
 * Shared reduced-motion subscription. We re-apply the same branch the
 * cold path runs so toggling the preference mid-session takes effect on
 * the next interaction without a full reload.
 *
 * @param {boolean} reduced
 */
function onReducedMotionChange(reduced) {
  _reducedMotion = reduced;
  if (reduced) {
    detachListeners();
  } else if (typeof document !== 'undefined' && document.readyState !== 'loading') {
    attachListeners();
    scan();
  }
}

if (typeof document !== 'undefined') {
  /* The returned unsubscribe is intentionally unused — motion preference
     lives for the document lifetime. If we ever need teardown (e.g. for
     a test harness) the helper returns a closure to call. */
  subscribeReducedMotion(onReducedMotionChange);
  document.addEventListener('astro:page-load', onPageLoad);
  document.addEventListener('astro:before-swap', onBeforeSwap);
  /* Cold load path — astro:page-load fires for the first page too, but
     only after the module evaluates. Running scan() now means the
     initial CTAs are magnetised on the very first frame rather than
     after Astro finishes route wiring. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageLoad, { once: true });
  } else {
    onPageLoad();
  }
}
