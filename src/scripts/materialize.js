/**
 * materialize.js — Text decode sequence coordinated with the lobby's
 * boot transition. No overlay, no fake loading screen.
 *
 * Architecture:
 *   The lobby 3D scene starts in an "energized" state (elevated bloom,
 *   chromatic aberration, scan lines) and transitions to its calm final
 *   state over ~1.4s. During this same window, text elements on the
 *   homepage decode from cipher characters to their real content.
 *
 *   The dark canvas IS the substrate. Text emerges against the live 3D
 *   scene. The lobby's visual transition IS the materialization — not
 *   a separate layer pretending to be one.
 *
 * Scope:
 *   Runs ONCE on the homepage ("/") per module lifecycle.
 *   Hard refresh or new session triggers fresh.
 *   Non-homepage entries and subsequent ClientRouter navigations skip.
 *
 * Dependencies: main-ticker (rAF driver), reduced-motion (live pref).
 * Events consumed: sarif:lobby-ready, sarif:lobby-settled.
 * Events dispatched: sarif:materialize-complete.
 */

import { subscribe as tickerSubscribe, unsubscribe as tickerUnsubscribe, PRIORITY_UI } from './main-ticker.js';
import { isReducedMotion, subscribeReducedMotion } from './reduced-motion.js';

const CHAR_RESOLVE_INTERVAL_MS = 22;
const CHAR_CYCLE_COUNT = 3;
const MOBILE_BREAKPOINT = 768;
const MOBILE_TIMING_SCALE = 0.75;
const STAGGER_PER_ELEMENT_MS = 80;
const FALLBACK_TIMEOUT_MS = 3000;

const CIPHER_CHARS = '01アイウエオ░▒▓█▄▀│┤╡╢╣║╗╝┐└┴┬├─┼╞╟╚╔╩╦╠═╬';

let _tickerToken = null;
let _sequenceStartMs = 0;
let _hasEverCompleted = false;
let _lobbySettled = false;
let _isMobile = false;
let _fallbackTimer = null;

/** @type {Array<{el: HTMLElement, text: string, stagger: number, state: string, charIndex: number, cycleCount: number, lastTickMs: number, cipherEl: HTMLElement}>} */
let _decodeTargets = [];

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

/**
 * Prepare a decode target: saves original text, inserts a real span
 * (invisible during decode) and a cipher span (visible overlay).
 */
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
    stagger,
    state: 'waiting',
    charIndex: 0,
    cycleCount: 0,
    lastTickMs: 0,
    cipherEl: cipherSpan,
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
      const chars = Array.from(target.text);
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

        let display = '';
        for (let i = 0; i < chars.length; i++) {
          if (i < target.charIndex) {
            display += chars[i];
          } else if (chars[i] === ' ') {
            display += ' ';
          } else {
            display += getCipherChar();
          }
        }
        target.cipherEl.textContent = display;
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

  if (areAllDecodesDone() && _lobbySettled) {
    markComplete();
  }
}

function onLobbyReady() {
  if (_hasEverCompleted) return;
  // Lobby first frame rendered — the energized visual is visible.
  // Text decode is already running; just acknowledge for coordination.
}

function onLobbySettled() {
  _lobbySettled = true;
  if (_hasEverCompleted) return;
  if (areAllDecodesDone()) {
    markComplete();
  }
}

function initMaterialize() {
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
    skipSequence();
    return;
  }

  els.forEach((el, i) => setupDecodeTarget(el, i));

  if (_decodeTargets.length === 0) {
    skipSequence();
    return;
  }

  document.documentElement.dataset.materialize = 'pending';
  _sequenceStartMs = performance.now();
  _tickerToken = tickerSubscribe(onTick, PRIORITY_UI);

  _fallbackTimer = setTimeout(() => {
    if (!_hasEverCompleted) markComplete();
  }, FALLBACK_TIMEOUT_MS);
}

function onPageLoad() {
  if (_hasEverCompleted) {
    document.documentElement.dataset.materialize = 'complete';
    const els = document.querySelectorAll('[data-materialize-text]');
    els.forEach(el => { el.dataset.materializeText = 'resolved'; });
    return;
  }
  initMaterialize();
}

function onBeforeSwap() {
  if (!_hasEverCompleted) {
    skipSequence();
  }
}

subscribeReducedMotion((reduced) => {
  if (reduced && !_hasEverCompleted) {
    skipSequence();
  }
});

document.addEventListener('sarif:lobby-ready', onLobbyReady);
document.addEventListener('sarif:lobby-settled', onLobbySettled);
document.addEventListener('astro:before-swap', onBeforeSwap);
document.addEventListener('astro:page-load', onPageLoad);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMaterialize, { once: true });
} else {
  initMaterialize();
}
