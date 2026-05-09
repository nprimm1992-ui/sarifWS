/**
 * Home-page inertial smooth-scroll (Lenis).
 *
 * Intentionally scoped to `/` only. Why hybrid?
 *
 *   - The homepage is a cinematic hero surface: a longer, weighted deceleration
 *     complements the 3D camera dolly and reinforces the sense of moving
 *     *through* the lobby rather than past it.
 *   - Interior pages (about, engagements, services, praxis, contact, policy)
 *     are information-dense. Users arrive with a specific intent (read a
 *     dossier, submit a form, look up a term) and native scroll wins every
 *     time on:
 *       - keyboard navigation (Space, PgUp/PgDn, Home/End, arrow keys)
 *       - anchor-link jumps (scrollIntoView with explicit behavior)
 *       - assistive tech / screen reader cursor tracking
 *       - find-in-page (Cmd/Ctrl-F) scroll-to-match
 *       - OS-level momentum on trackpads (already optimal; Lenis adds lag)
 *
 * The hybrid model gives us the showroom-on-homepage polish and the
 * maximum-accessibility everywhere else.
 *
 * Guards:
 *   - Not the homepage → no-op.
 *   - prefers-reduced-motion → no-op (native scroll; OS-level momentum only).
 *   - Already initialised → idempotent (second call is a no-op).
 *   - Astro ClientRouter swaps → teardown on `astro:before-swap` so interior
 *     pages get clean native scroll.
 *
 * Touch devices (phones / tablets): `syncTouch: false` (default) means
 * Lenis does NOT hijack touch scrolling. iOS / Android users get their
 * OS-tuned momentum, which no JS library has matched. Only wheel and
 * trackpad gestures go through Lenis.
 */

import Lenis from 'lenis';
import { subscribe as tickerSubscribe, unsubscribe as tickerUnsubscribe, PRIORITY_SMOOTH_SCROLL } from './main-ticker.js';

/** Paths that activate Lenis. Kept explicit to avoid false-positives on
 *  routes whose URL starts with `/` (which is all of them). */
const HOME_PATHNAMES = new Set(['/', '/index.html']);

/**
 * Decelerating ease-out. Approximates iOS momentum; feels weighted without
 * the "syrupy" over-long tails that cheaper easings produce. Derived from
 * y = 1 - 2^(-10t). Clamped in [0,1].
 *
 * @param {number} t — progress, 0..1
 * @returns {number}
 */
function easeOutExpo(t) {
  if (t >= 1) return 1;
  return 1.001 - Math.pow(2, -10 * t);
}

/** @type {InstanceType<typeof Lenis> | null} */
let _lenis = null;
/** @type {symbol | null} */
let _tickerToken = null;

function isHomePath() {
  const p = window.location.pathname;
  return HOME_PATHNAMES.has(p);
}

export function initHomeSmoothScroll() {
  if (typeof window === 'undefined') return;
  if (_lenis) return;
  if (!isHomePath()) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  _lenis = new Lenis({
    /* duration is the full-gesture settle time (s). 1.0 is the sweet spot:
       short enough to feel responsive on short flicks, long enough for a
       multi-viewport flick to carry a sense of weight past the hero. */
    duration: 1.0,
    easing: easeOutExpo,
    smoothWheel: true,
    /* Native OS touch momentum is already pixel-perfect on iOS / Android.
       syncTouch:true would replace it with Lenis interpolation and add
       1–2 frames of perceived lag on touch — a net loss. */
    syncTouch: false,
    /* 1.0 is the default; being explicit lets us tune without spelunking
       through Lenis internals. Deliberately NOT boosted — over-multiplied
       wheel speed makes precise reading scroll impossible. */
    wheelMultiplier: 1.0,
  });

  _tickerToken = tickerSubscribe((timestamp) => {
    /* Lenis.raf takes the high-resolution timestamp and advances its
       internal easing integrator. It writes to document.scrollingElement's
       scrollTop synchronously, so every other ticker subscriber that reads
       getDocumentScrollProgress() (lobby, atmosphere, progress bar) sees
       the same interpolated value in the same frame — no stale reads. */
    _lenis?.raf(timestamp);
  }, PRIORITY_SMOOTH_SCROLL);
}

export function teardownHomeSmoothScroll() {
  if (_tickerToken) {
    tickerUnsubscribe(_tickerToken);
    _tickerToken = null;
  }
  if (_lenis) {
    _lenis.destroy();
    _lenis = null;
  }
}

/** @returns {boolean} */
export function isHomeSmoothScrollActive() {
  return _lenis !== null;
}

/**
 * Round-3 P8d — Expose Lenis's current velocity for cinematic coupling.
 *
 * Lenis exposes `.velocity` (px per frame at 60 Hz; empirically ±3 is a
 * typical scroll flick). We return it raw so callers can normalise with
 * their own reference; lobby-scene.js divides by ~4 to land inside ±1
 * before squaring / scaling.
 *
 * Returns 0 when Lenis is inactive (interior routes, reduced-motion
 * users, touch devices with syncTouch:false). Callers must therefore
 * treat 0 as "no signal" rather than "zero velocity" and disable the
 * coupling entirely. Matching the dead-zone (velocity ≈ 0 at rest on
 * the landing route) is why lobby-scene.js exp-smooths the signal with
 * a τ of 200 ms — the final blend lands at 0 whenever the user rests.
 *
 * @returns {number} velocity in pixels / frame (0 when inactive)
 */
export function getHomeScrollVelocity() {
  if (!_lenis) return 0;
  const v = _lenis.velocity;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
