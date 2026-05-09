/**
 * Round-3 P8e — Spring tilt for cards.
 *
 * Any element matching TILT_SELECTOR receives up to ±TILT_MAX_DEG
 * rotateX/rotateY modulation based on cursor position relative to the
 * element's centre. The rotation is critically-damped so a fast
 * cursor move reads as a confident lean instead of a jitter chase.
 *
 * Applied to a dedicated `.tilt-inner` wrapper, not the outer card.
 * This isolates the rotate transform from the card's own hover
 * transitions (translate / scale / box-shadow), which resolves the
 * long-standing conflict ServiceCard's previous inline tilt created.
 * If a `.tilt-inner` child is missing, the script no-ops — opt-in by
 * markup is explicit.
 *
 * Reduced-motion: the whole pipeline is suppressed at attach time so
 * matchMedia-aware users never see a transform applied. Opt-in per
 * instance via `[data-tilt-disabled]` on the outer element.
 *
 * Shares the single delegated `pointermove` + one rAF loop with
 * `magnetic-cta.js`-style architecture, but lives in its own module
 * so the two can be toggled independently (e.g. a card might be
 * magnetic but not tilt, or vice versa).
 */

import { subscribeReducedMotion } from './reduced-motion.js';

const TILT_SELECTOR = [
  '.lane',
  '.preview-entry',
  '.eng-carousel__slide',
  '.praxis-card',
  '.service-card-wrapper',
].join(', ');
/* Max rotation magnitude. ±3° is shallow enough to never distort
 * text legibility but deep enough to register as a deliberate
 * parallax cue when the cursor crosses a card. */
const TILT_MAX_DEG = 3;
/* Critical-damp spring constants (same derivation as magnetic-cta).
 * Slightly slower than magnet because rotation reads differently —
 * 500 ms settle on a 3° step feels like a considered lean. */
const TILT_STIFFNESS = 90;
const TILT_DAMPING = 2 * Math.sqrt(TILT_STIFFNESS);
/* Small Z translate to reinforce the lean visually (matches
 * ServiceCard's existing translateZ(6px) idiom). Kept on the inner
 * wrapper so outer box-shadow interpolations stay on the card. */
const TILT_TRANSLATE_Z_PX = 6;

/** @typedef {{outer: HTMLElement, inner: HTMLElement, rx: number, ry: number, vrx: number, vry: number, targetRx: number, targetRy: number, hovering: boolean, visible: boolean}} TiltState */

/** @type {Map<HTMLElement, TiltState>} */
const _tilts = new Map();
/** @type {number | null} */
let _rafHandle = null;
let _lastFrameMs = 0;
let _reducedMotion = false;
let _listenersAttached = false;

/* Round-4 phase-5 polish — IntersectionObserver throttles the per-
   card hit-test in onPointerMove. Without it, a page with many
   tracked cards (e.g. the full preview grid + carousel) pays a
   getBoundingClientRect per card per pointer event even when a card
   is scrolled far off-screen. The observer flips a `visible` flag
   and only visible cards get tested. 20% threshold matches the
   margin where a card is interactive in practice — once a card is
   visibly entering the viewport, its tilt can be set up eagerly so
   the first pointer sample after scroll lands on a live state. */
/** @type {IntersectionObserver | null} */
let _visibilityObserver = null;

function ensureVisibilityObserver() {
  if (_visibilityObserver) return _visibilityObserver;
  if (typeof IntersectionObserver === 'undefined') return null;
  _visibilityObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const target = entry.target;
        if (!(target instanceof HTMLElement)) continue;
        const state = _tilts.get(target);
        if (!state) continue;
        state.visible = entry.isIntersecting;
        /* If a card scrolls offscreen mid-tilt, collapse the target
           so the spring settles to rest rather than holding a lean
           the user can't see (and can't cancel with pointerleave). */
        if (!state.visible && state.hovering) {
          state.hovering = false;
          state.targetRx = 0;
          state.targetRy = 0;
          ensureFrameLoop();
        }
      }
    },
    { threshold: 0.2 },
  );
  return _visibilityObserver;
}

function resolveInner(outer) {
  const child = outer.querySelector('.tilt-inner');
  return child instanceof HTMLElement ? child : null;
}

function scan() {
  if (_reducedMotion) return;
  const elements = document.querySelectorAll(TILT_SELECTOR);
  const seen = new Set();
  for (const raw of elements) {
    if (!(raw instanceof HTMLElement)) continue;
    if (raw.hasAttribute('data-tilt-disabled')) continue;
    const inner = resolveInner(raw);
    if (!inner) continue;
    seen.add(raw);
    if (!_tilts.has(raw)) {
      /* Set perspective on the outer once. Using CSS would be cleaner
         but every stylesheet consumer would have to opt in — by
         setting it here we make `[data-tilt-inner]` or `.tilt-inner`
         the single opt-in surface. */
      if (!raw.style.perspective) raw.style.perspective = '900px';
      _tilts.set(raw, {
        outer: raw,
        inner,
        rx: 0, ry: 0, vrx: 0, vry: 0,
        targetRx: 0, targetRy: 0,
        hovering: false,
        /* Default to visible=true so the first pointermove before
           the observer's first callback is still responsive. The
           observer flips it false for anything actually off-screen
           on the next tick. */
        visible: true,
      });
      raw.addEventListener('pointerleave', onLeave, { passive: true });
      const observer = ensureVisibilityObserver();
      observer?.observe(raw);
    }
  }
  for (const el of _tilts.keys()) {
    if (!seen.has(el)) {
      const state = _tilts.get(el);
      if (state) state.inner.style.removeProperty('transform');
      el.removeEventListener('pointerleave', onLeave);
      _visibilityObserver?.unobserve(el);
      _tilts.delete(el);
    }
  }
}

/** @param {PointerEvent} e */
function onPointerMove(e) {
  if (_reducedMotion) return;
  const cx = e.clientX;
  const cy = e.clientY;
  /* Hit-test O(n) over magnetic cards. n is small (a few cards on any
     given view) so this is cheap compared with one getBoundingClientRect
     per card per frame would be; here we only test when the pointer
     actually moves. */
  for (const state of _tilts.values()) {
    /* Skip the rect test entirely for cards the IntersectionObserver
       has flagged as off-screen. They stay at rest until they scroll
       back in. This is the phase-5 polish that keeps the pointer-
       path O(visible cards), not O(all tracked cards). */
    if (!state.visible) continue;
    const rect = state.outer.getBoundingClientRect();
    const inside =
      cx >= rect.left && cx <= rect.right &&
      cy >= rect.top && cy <= rect.bottom;
    if (!inside) {
      if (state.hovering) {
        state.hovering = false;
        state.targetRx = 0;
        state.targetRy = 0;
      }
      continue;
    }
    state.hovering = true;
    const nx = (cx - rect.left) / rect.width;
    const ny = (cy - rect.top) / rect.height;
    state.targetRy = (nx - 0.5) * 2 * TILT_MAX_DEG;
    state.targetRx = (0.5 - ny) * 2 * TILT_MAX_DEG;
  }
  ensureFrameLoop();
}

/** @param {PointerEvent} e */
function onLeave(e) {
  const outer = e.currentTarget;
  if (!(outer instanceof HTMLElement)) return;
  const state = _tilts.get(outer);
  if (!state) return;
  state.hovering = false;
  state.targetRx = 0;
  state.targetRy = 0;
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
  for (const state of _tilts.values()) {
    const axr = -TILT_STIFFNESS * (state.rx - state.targetRx) - TILT_DAMPING * state.vrx;
    const ayr = -TILT_STIFFNESS * (state.ry - state.targetRy) - TILT_DAMPING * state.vry;
    state.vrx += axr * dt;
    state.vry += ayr * dt;
    state.rx += state.vrx * dt;
    state.ry += state.vry * dt;
    const settled =
      Math.abs(state.rx - state.targetRx) < 0.02 &&
      Math.abs(state.ry - state.targetRy) < 0.02 &&
      Math.abs(state.vrx) < 0.02 &&
      Math.abs(state.vry) < 0.02;
    if (settled) {
      state.rx = state.targetRx;
      state.ry = state.targetRy;
      state.vrx = state.vry = 0;
    } else {
      anyActive = true;
    }
    if (state.rx === 0 && state.ry === 0) {
      state.inner.style.removeProperty('transform');
    } else {
      state.inner.style.transform =
        `rotateX(${state.rx.toFixed(2)}deg) rotateY(${state.ry.toFixed(2)}deg) translateZ(${TILT_TRANSLATE_Z_PX}px)`;
    }
  }
  if (anyActive) {
    _rafHandle = requestAnimationFrame(step);
  }
}

function attachListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  document.addEventListener('pointermove', onPointerMove, { passive: true });
}

function detachListeners() {
  if (!_listenersAttached) return;
  _listenersAttached = false;
  document.removeEventListener('pointermove', onPointerMove);
  for (const state of _tilts.values()) {
    state.inner.style.removeProperty('transform');
    state.outer.removeEventListener('pointerleave', onLeave);
    _visibilityObserver?.unobserve(state.outer);
  }
  _tilts.clear();
  if (_rafHandle !== null) {
    cancelAnimationFrame(_rafHandle);
    _rafHandle = null;
  }
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
  detachListeners();
}

/**
 * Respond to live prefers-reduced-motion changes. Mirrors the cold path
 * branch in onPageLoad so the user can toggle OS motion settings mid-
 * session and have tilt apply or strip on the very next frame.
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
  subscribeReducedMotion(onReducedMotionChange);
  document.addEventListener('astro:page-load', onPageLoad);
  document.addEventListener('astro:before-swap', onBeforeSwap);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageLoad, { once: true });
  } else {
    onPageLoad();
  }
}
