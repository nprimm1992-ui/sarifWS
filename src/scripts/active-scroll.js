/**
 * ActiveScroll monitor.
 *
 * Emits a boolean "is the user actively scrolling right now?" signal to
 * subscribers. `true` the moment a scroll event fires; returns to `false`
 * IDLE_MS after the last scroll event.
 *
 * Why: during active scroll, visual motion of the page itself masks
 * post-processing fidelity. A 1.0-DPR scene with no bloom pass is
 * indistinguishable from the full-quality render when the viewport is
 * translating rapidly. We free 3–6 ms/frame of GPU work during the window
 * when the user couldn't perceive it anyway, then restore full quality when
 * scrolling settles (<IDLE_MS of inactivity).
 *
 * The monitor is singleton across the document and attaches its listeners
 * lazily (first subscribe) so pages that never subscribe pay nothing.
 */

/** Ms of no-scroll-event inactivity before active → idle transition. 150 ms
 *  matches the `scrollend` spec's typical fire delay and feels snappy — the
 *  quality restoration lands ~9 frames after the user lifts off.
 *
 *  Tuning note: too small produces visible quality flicker on short scrolls
 *  (quality dips then restores mid-gesture); too large leaves quality dipped
 *  long after scroll has stopped, which becomes perceptible in the 3D scene. */
const IDLE_MS = 150;

/** @type {Set<(active: boolean) => void>} */
const _subs = new Set();

let _active = false;
let _idleTimerId = 0;
let _listenersAttached = false;

function clearIdleTimer() {
  if (_idleTimerId) {
    clearTimeout(_idleTimerId);
    _idleTimerId = 0;
  }
}

function emit(active) {
  if (_active === active) return;
  _active = active;
  for (const fn of _subs) {
    try {
      fn(active);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[active-scroll] subscriber threw', err);
      }
    }
  }
}

function onScroll() {
  if (!_active) emit(true);
  clearIdleTimer();
  _idleTimerId = window.setTimeout(() => {
    _idleTimerId = 0;
    emit(false);
  }, IDLE_MS);
}

function attachListenersOnce() {
  if (_listenersAttached || typeof window === 'undefined') return;
  _listenersAttached = true;
  /* Passive is critical here: a non-passive scroll listener would force the
     main thread to wait for this handler before committing each scroll
     frame, which would DIRECTLY HURT scroll smoothness — exactly the
     opposite of this module's intent. */
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  /* When the user tabs away mid-scroll, we want to emit idle immediately so
     any background-quality restoration happens before the next paint. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearIdleTimer();
      emit(false);
    }
  });
}

/**
 * Subscribe to active-scroll transitions.
 * @param {(active: boolean) => void} fn — called with true on scroll-start,
 *   false IDLE_MS after the last scroll event.
 * @returns {() => void} unsubscribe
 */
export function subscribe(fn) {
  attachListenersOnce();
  _subs.add(fn);
  /* Sync the new subscriber to current state so it can install correct
     initial quality settings without waiting for the first transition. */
  try {
    fn(_active);
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[active-scroll] initial-sync subscriber threw', err);
    }
  }
  return () => {
    _subs.delete(fn);
  };
}

/** @returns {boolean} */
export function isActive() {
  return _active;
}
