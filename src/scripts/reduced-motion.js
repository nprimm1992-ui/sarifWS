/**
 * Shared prefers-reduced-motion observer.
 *
 * Round-3 audit remediation §3.1 — until this module, each motion consumer
 * sampled the media query once at init and cached the value. Users who
 * toggled the OS preference mid-session (accessibility triage, users on
 * dimmed battery modes, etc.) were stuck with whichever truth the page
 * loaded under. That is exactly the scenario the WCAG "animation from
 * interactions" SC expects us to honour at runtime.
 *
 * Design:
 *
 * - Single `matchMedia` handle shared by every subscriber. Browsers cache
 *   the MediaQueryList internally too, but coalescing here keeps the
 *   listener count at one regardless of how many modules subscribe.
 * - Safari < 14 exposes the older `addListener` API. Detect and adapt.
 * - `subscribe(cb)` returns an unsubscribe closure so consumers can
 *   tear down cleanly on `astro:before-swap`.
 * - `isReducedMotion()` returns the live value for one-shot reads.
 *
 * Consumers treat the subscribe callback as idempotent: it is invoked
 * once immediately with the current value and again on every transition.
 */

/** @type {MediaQueryList | null} */
let _mql = null;
/** @type {Set<(reduced: boolean) => void>} */
const _subscribers = new Set();

function ensureMql() {
  if (_mql) return _mql;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  _mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (evt) => {
    const value = Boolean(evt.matches);
    for (const cb of _subscribers) {
      try {
        cb(value);
      } catch (err) {
        console.warn('[reduced-motion] subscriber threw', err);
      }
    }
  };
  if (typeof _mql.addEventListener === 'function') {
    _mql.addEventListener('change', handler);
  } else if (typeof _mql.addListener === 'function') {
    /* Legacy Safari < 14 / old Edge path — MediaQueryList.addListener
       is the pre-2020 deprecated API but remains the only way to
       observe these queries on those engines. */
    _mql.addListener(handler);
  }
  return _mql;
}

/**
 * Live snapshot of the user's motion preference. Safe on server — returns
 * `false` when `window` is absent.
 */
export function isReducedMotion() {
  const mql = ensureMql();
  return Boolean(mql?.matches);
}

/**
 * Subscribe to live preference changes. `cb` is invoked immediately with
 * the current value so subscribers can initialise without a second read.
 * Returns an unsubscribe function.
 *
 * @param {(reduced: boolean) => void} cb
 * @returns {() => void}
 */
export function subscribeReducedMotion(cb) {
  const mql = ensureMql();
  _subscribers.add(cb);
  try {
    cb(Boolean(mql?.matches));
  } catch (err) {
    console.warn('[reduced-motion] initial callback threw', err);
  }
  return () => {
    _subscribers.delete(cb);
  };
}
