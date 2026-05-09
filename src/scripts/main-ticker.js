/**
 * Unified rAF driver. Every per-frame consumer on the page subscribes here
 * instead of running its own requestAnimationFrame loop.
 *
 * Why:
 *   Before this module, the lobby (Three.js), the atmosphere canvas, and the
 *   mobile progress bar each owned a separate rAF. Three independent wake-ups
 *   per frame pay three sets of scheduler overhead and produce three separate
 *   render batches the compositor has to reconcile. Fusing them into one loop
 *   gives deterministic ordering (Lenis -> document progress -> lobby camera
 *   -> atmosphere -> progress bar), one scheduler wake-up, and a single pause
 *   point when the tab is hidden.
 *
 * Contract:
 *   - subscribe(fn, priority) returns a token; fn is called each frame with
 *     (timestamp, dtSec) where dtSec is clamped to MAX_FRAME_DT_SEC to keep
 *     physics/tween math sane after tab wake-up or visibility resume.
 *   - priority is an integer; lower runs first. Use the PRIORITY_* constants.
 *   - unsubscribe(token) removes the callback; safe to call inside a callback
 *     (the frame's iteration snapshots the subscriber list up-front).
 *   - The loop auto-pauses on document.hidden and auto-resumes on
 *     visibilitychange (visible) and pageshow(persisted=true) so bfcache
 *     restores are covered.
 *   - The loop lazy-starts when the first subscriber is added and lazy-stops
 *     when the last unsubscribes. No "already running but nothing to do" case.
 */

/** Hard ceiling on dt passed to subscribers; prevents huge time steps after
 *  tab sleep/wake or throttled animation frames. 100 ms matches the existing
 *  MAX_ANIM_DT_SEC used by lobby-scene and atmosphere. */
const MAX_FRAME_DT_SEC = 0.1;

export const PRIORITY_SMOOTH_SCROLL = 10; // Lenis (homepage)
export const PRIORITY_INPUT = 20;         // wheel / pointer derived state updates
export const PRIORITY_SCENE = 30;         // Three.js lobby
export const PRIORITY_OVERLAY = 40;       // atmosphere canvas
export const PRIORITY_UI = 50;            // progress bar, decorative UI

/**
 * @typedef {Object} Subscriber
 * @property {symbol} token
 * @property {(timestamp: number, dtSec: number) => void} fn
 * @property {number} priority
 */

/** @type {Subscriber[]} */
let _subs = [];
let _rafId = 0;
let _lastTimestamp = 0;
let _paused = false;
let _lifecycleHooksAttached = false;

function sortSubs() {
  _subs.sort((a, b) => a.priority - b.priority);
}

function runFrame(timestamp) {
  _rafId = 0;
  if (_paused || _subs.length === 0) return;

  const dtMs = _lastTimestamp === 0 ? 0 : timestamp - _lastTimestamp;
  _lastTimestamp = timestamp;
  let dtSec = dtMs / 1000;
  if (dtSec < 0) dtSec = 0;
  if (dtSec > MAX_FRAME_DT_SEC) dtSec = MAX_FRAME_DT_SEC;

  // Snapshot: subscribers may unsubscribe (or subscribe) during their own tick.
  const snapshot = _subs.slice();
  for (const sub of snapshot) {
    try {
      sub.fn(timestamp, dtSec);
    } catch (err) {
      // A failing subscriber must not stop the ticker for everyone else.
      // Error surfacing is the subscriber's responsibility.
      if (typeof console !== 'undefined' && console.error) {
        console.error('[main-ticker] subscriber threw', err);
      }
    }
  }

  if (_subs.length > 0 && !_paused) {
    _rafId = requestAnimationFrame(runFrame);
  }
}

function start() {
  if (_rafId || _paused) return;
  // Reset timestamp so first-frame dtSec is 0, not a huge gap since the last
  // frame before the pause.
  _lastTimestamp = 0;
  _rafId = requestAnimationFrame(runFrame);
}

function stop() {
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = 0;
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    _paused = true;
    stop();
  } else {
    _paused = false;
    if (_subs.length > 0) start();
  }
}

function onPageShow(ev) {
  // bfcache restore keeps the module state, but the rAF loop is gone — restart it.
  if (ev && ev.persisted) {
    _paused = document.hidden;
    if (!_paused && _subs.length > 0) start();
  }
}

function attachLifecycleHooksOnce() {
  if (_lifecycleHooksAttached || typeof document === 'undefined') return;
  _lifecycleHooksAttached = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
}

/**
 * Subscribe to the unified rAF. Returns a token opaque to callers.
 * @param {(timestamp: number, dtSec: number) => void} fn
 * @param {number} [priority] — see PRIORITY_* constants. Lower runs first.
 * @returns {symbol}
 */
export function subscribe(fn, priority = PRIORITY_UI) {
  attachLifecycleHooksOnce();
  const token = Symbol('main-ticker-sub');
  _subs.push({ token, fn, priority });
  sortSubs();
  if (!_paused && !_rafId) start();
  return token;
}

/**
 * @param {symbol | null | undefined} token
 */
export function unsubscribe(token) {
  if (!token) return;
  const next = [];
  for (const sub of _subs) {
    if (sub.token !== token) next.push(sub);
  }
  _subs = next;
  if (_subs.length === 0) stop();
}

/**
 * Pause the ticker externally (e.g. when a long-running modal should freeze
 * background animation). Subscribers remain registered and resume() restarts.
 */
export function pause() {
  _paused = true;
  stop();
}

/** Resume a paused ticker. No-op if there are no subscribers. */
export function resume() {
  _paused = false;
  if (_subs.length > 0) start();
}

/** @returns {boolean} */
export function isRunning() {
  return _rafId !== 0;
}

/** Test / introspection hook. */
export function subscriberCount() {
  return _subs.length;
}
