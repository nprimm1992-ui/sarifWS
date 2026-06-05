/**
 * materialize.js — Reveal veil + text cipher decode for the homepage.
 *
 * Architecture:
 *   Two responsibilities, one coordination point (sarif:first-frame):
 *
 *   1. Reveal veil: lobby-scene.js fires sarif:first-frame after its first
 *      compositor render. This module lifts the #sarif-veil (420ms fade),
 *      removing the opaque placeholder that hid the black canvas during
 *      WebGL initialisation. The scene is already alive behind the veil;
 *      lifting it reveals an energised, fully-rendered world.
 *
 *   2. Text cipher decode: begins at sarif:first-frame in sync with the
 *      veil lift. Text and scene arrive together as one composed moment.
 *      Completion fires sarif:materialize-complete to activate scroll
 *      reveals (~600ms after first-frame).
 *
 *   Fallback: if sarif:first-frame never fires (WebGL unsupported, JS
 *   error, non-homepage), a setTimeout removes the veil and skips the
 *   cipher sequence so content is always visible within 4s.
 *
 * Scope:
 *   Veil management only on homepage ("/"); veil element is not rendered
 *   on interior routes. Text decode runs on "/" only; interior routes skip.
 *
 * Dependencies: main-ticker (rAF driver), reduced-motion (live pref).
 * Events consumed: sarif:first-frame, sarif:lobby-settled.
 * Events dispatched: sarif:materialize-complete.
 */

import { subscribe as tickerSubscribe, unsubscribe as tickerUnsubscribe, PRIORITY_UI } from './main-ticker.js';
import { isReducedMotion, subscribeReducedMotion } from './reduced-motion.js';

const CHAR_RESOLVE_INTERVAL_MS = 40;
const CHAR_CYCLE_COUNT = 3;
const MOBILE_BREAKPOINT = 768;
const MOBILE_TIMING_SCALE = 0.75;
const STAGGER_PER_ELEMENT_MS = 80;
/** Hard fallback: if first-frame never fires, force-remove veil + skip decode. */
const FALLBACK_TIMEOUT_MS = 4000;
/** Duration of the veil CSS opacity transition (must match global.css). */
const VEIL_TRANSITION_MS = 420;

const CIPHER_CHARS = '01アイウエオ░▒▓█▄▀│┤╡╢╣║╗╝┐└┴┬├─┼╞╟╚╔╩╦╠═╬';

let _tickerToken = null;
let _sequenceStartMs = 0;
let _hasEverCompleted = false;
let _isMobile = false;
let _fallbackTimer = null;
let _veilRemoveTimer = null;

/** @type {Array<{el: HTMLElement, text: string, stagger: number, state: string, charIndex: number, cycleCount: number, lastTickMs: number, cipherEl: HTMLElement}>} */
let _decodeTargets = [];

// ---------------------------------------------------------------------------
// Veil management
// ---------------------------------------------------------------------------

function liftVeil() {
  const html = document.documentElement;
  /* Guard both terminal states: 'lifting' (transition in progress, timer
     already set) and 'gone' (already removed from compositor). A second
     call from skipSequence() on non-homepage routes is the common case. */
  if (html.dataset.veil === 'lifting' || html.dataset.veil === 'gone') return;

  if (isReducedMotion()) {
    /* Snap the veil away immediately — no fade for reduced-motion users. */
    html.dataset.veil = 'gone';
    return;
  }

  html.dataset.veil = 'lifting';

  /* After the CSS transition completes, pull the element from the
     compositor entirely so it no longer consumes a layer slot. */
  _veilRemoveTimer = setTimeout(() => {
    _veilRemoveTimer = null;
    if (document.documentElement.dataset.veil === 'lifting') {
      document.documentElement.dataset.veil = 'gone';
    }
  }, VEIL_TRANSITION_MS + 50);
}

// ---------------------------------------------------------------------------
// Text cipher decode helpers
// ---------------------------------------------------------------------------

function getTimingScale() {
  return _isMobile ? MOBILE_TIMING_SCALE : 1;
}

function getCipherChar() {
  return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
}

function generateCipherString(length) {
  let s = '';
  for (let i = 0; i < length; i++) s += getCipherChar();
  return s;
}

function setupDecodeTarget(el, index) {
  if (el.querySelector('.materialize-real')) return;

  const text = el.textContent || '';
  if (!text.trim()) return;

  const chars = Array.from(text);

  const realSpan = document.createElement('span');
  realSpan.className = 'materialize-real';
  realSpan.textContent = text;

  const cipherSpan = document.createElement('span');
  cipherSpan.className = 'materialize-cipher';
  cipherSpan.setAttribute('aria-hidden', 'true');
  cipherSpan.textContent = generateCipherString(chars.length);

  el.textContent = '';
  el.appendChild(realSpan);
  el.appendChild(cipherSpan);

  const order = parseInt(el.dataset.materializeOrder || '0', 10);
  const stagger = (index + order) * STAGGER_PER_ELEMENT_MS;

  _decodeTargets.push({
    el,
    text,
    chars,
    stagger,
    state: 'waiting',
    charIndex: 0,
    cycleCount: 0,
    lastTickMs: 0,
    cipherEl: cipherSpan,
    displayBuf: Array(chars.length),
  });
}

function markComplete() {
  if (_hasEverCompleted) return;
  _hasEverCompleted = true;

  document.documentElement.dataset.materialize = 'complete';

  for (const target of _decodeTargets) {
    target.el.dataset.materializeText = 'resolved';
    target.state = 'done';
  }

  if (_tickerToken) {
    tickerUnsubscribe(_tickerToken);
    _tickerToken = null;
  }
  if (_fallbackTimer !== null) {
    clearTimeout(_fallbackTimer);
    _fallbackTimer = null;
  }

  document.dispatchEvent(new CustomEvent('sarif:materialize-complete'));
}

function skipSequence() {
  liftVeil();

  _hasEverCompleted = true;
  document.documentElement.dataset.materialize = 'complete';

  const els = document.querySelectorAll('[data-materialize-text]');
  els.forEach(el => { el.dataset.materializeText = 'resolved'; });

  if (_tickerToken) {
    tickerUnsubscribe(_tickerToken);
    _tickerToken = null;
  }
  if (_fallbackTimer !== null) {
    clearTimeout(_fallbackTimer);
    _fallbackTimer = null;
  }

  document.dispatchEvent(new CustomEvent('sarif:materialize-complete'));
}

function tickDecode(elapsedMs) {
  const scale = getTimingScale();

  for (const target of _decodeTargets) {
    if (target.state === 'done') continue;

    const scaledStagger = target.stagger * scale;

    if (target.state === 'waiting') {
      if (elapsedMs >= scaledStagger) {
        target.state = 'decoding';
        target.el.dataset.materializeText = 'decoding';
        target.lastTickMs = elapsedMs;
      }
      continue;
    }

    if (target.state === 'decoding') {
      const { chars, displayBuf } = target;
      const resolveInterval = CHAR_RESOLVE_INTERVAL_MS * scale;

      if (elapsedMs - target.lastTickMs >= resolveInterval) {
        target.lastTickMs = elapsedMs;
        target.cycleCount++;

        if (target.cycleCount >= CHAR_CYCLE_COUNT) {
          target.charIndex++;
          target.cycleCount = 0;
        }

        if (target.charIndex >= chars.length) {
          target.state = 'done';
          target.el.dataset.materializeText = 'resolved';
          continue;
        }

        for (let i = 0; i < chars.length; i++) {
          displayBuf[i] = (i < target.charIndex || chars[i] === ' ') ? chars[i] : getCipherChar();
        }
        target.cipherEl.textContent = displayBuf.join('');
      }
    }
  }
}

function areAllDecodesDone() {
  return _decodeTargets.length > 0 && _decodeTargets.every(t => t.state === 'done');
}

function onTick(timestamp) {
  if (_hasEverCompleted) return;

  const elapsed = timestamp - _sequenceStartMs;
  tickDecode(elapsed);

  if (areAllDecodesDone()) {
    markComplete();
  }
}

// ---------------------------------------------------------------------------
// Boot coordination
// ---------------------------------------------------------------------------

/**
 * Called by sarif:first-frame (lobby first GPU render committed).
 * Lifts the veil and starts text cipher decode simultaneously — one
 * coordinated reveal moment.
 */
function onFirstFrame() {
  if (_hasEverCompleted) {
    /* Already skipped (reduced-motion, non-homepage, fallback timeout).
       Just ensure the veil is gone — decode already completed. */
    liftVeil();
    return;
  }

  liftVeil();
  startDecode();
}

function onLobbySettled() {
  // Informational — reserved for future subsystems.
}

function startDecode() {
  if (_hasEverCompleted) return;

  if (location.pathname !== '/') {
    skipSequence();
    return;
  }

  _isMobile = window.innerWidth < MOBILE_BREAKPOINT;

  if (isReducedMotion()) {
    skipSequence();
    return;
  }

  const els = document.querySelectorAll('[data-materialize-text="pending"]');
  if (els.length === 0) {
    /* Nothing to decode — complete immediately but veil already lifted. */
    _hasEverCompleted = true;
    document.documentElement.dataset.materialize = 'complete';
    if (_fallbackTimer !== null) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
    document.dispatchEvent(new CustomEvent('sarif:materialize-complete'));
    return;
  }

  els.forEach((el, i) => setupDecodeTarget(el, i));

  if (_decodeTargets.length === 0) {
    _hasEverCompleted = true;
    document.documentElement.dataset.materialize = 'complete';
    if (_fallbackTimer !== null) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
    document.dispatchEvent(new CustomEvent('sarif:materialize-complete'));
    return;
  }

  document.documentElement.dataset.materialize = 'pending';
  _sequenceStartMs = performance.now();
  _tickerToken = tickerSubscribe(onTick, PRIORITY_UI);
}

/**
 * Seed: called immediately on DOMContentLoaded to prepare the decode
 * targets in the DOM (inject cipher spans) so the structure is ready
 * before first-frame fires. Does NOT start the ticker — that waits for
 * first-frame so the text begins decoding in sync with the veil lift.
 */
function seedDecode() {
  if (_hasEverCompleted) return;
  if (location.pathname !== '/') return;
  if (isReducedMotion()) return;

  _isMobile = window.innerWidth < MOBILE_BREAKPOINT;
  document.documentElement.dataset.materialize = 'pending';
}

// ---------------------------------------------------------------------------
// Page lifecycle
// ---------------------------------------------------------------------------

function onPageLoad() {
  if (_hasEverCompleted) {
    document.documentElement.dataset.materialize = 'complete';
    const els = document.querySelectorAll('[data-materialize-text]');
    els.forEach(el => { el.dataset.materializeText = 'resolved'; });
    /* Veil is already gone from first load; ensure state is correct on
       soft-nav back to homepage. */
    if (document.documentElement.dataset.veil !== 'gone') {
      document.documentElement.dataset.veil = 'gone';
    }
    return;
  }
  seedDecode();
}

function onBeforeSwap() {
  if (!_hasEverCompleted) {
    skipSequence();
  }
  if (_veilRemoveTimer !== null) {
    clearTimeout(_veilRemoveTimer);
    _veilRemoveTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Module boot
// ---------------------------------------------------------------------------

subscribeReducedMotion((reduced) => {
  if (reduced && !_hasEverCompleted) {
    skipSequence();
  }
});

document.addEventListener('sarif:first-frame', onFirstFrame, { once: true });
document.addEventListener('sarif:lobby-settled', onLobbySettled);
document.addEventListener('astro:before-swap', onBeforeSwap);
document.addEventListener('astro:page-load', onPageLoad);

/* Set a hard fallback timeout: if sarif:first-frame never fires (WebGL
   unsupported, lobby JS error, etc.), force the veil off and skip the
   cipher so the page is always usable within FALLBACK_TIMEOUT_MS. */
_fallbackTimer = setTimeout(() => {
  _fallbackTimer = null;
  if (!_hasEverCompleted) {
    skipSequence();
  } else {
    /* Decode already done but veil might still be lifting. */
    liftVeil();
  }
}, FALLBACK_TIMEOUT_MS);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedDecode, { once: true });
} else {
  seedDecode();
}
