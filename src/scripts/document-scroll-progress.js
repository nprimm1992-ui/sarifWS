/**
 * Full-document scroll fraction [0, 1] — shared by the lobby camera and the top progress bar.
 * `getDocumentScrollProgress` reads `scrollY` each call but caches scroll extent (scrollHeight /
 * viewport height) and refreshes it only via `subscribeScrollableLayoutUpdates` after the first call.
 * `subscribeScrollableLayoutUpdates` notifies when layout or visual viewport may change max scroll
 * (ResizeObserver, visualViewport resize/scroll — coalesced to one rAF flush).
 */

/** Visible viewport height; Visual Viewport tracks mobile browser chrome (URL bar) more accurately than innerHeight alone. */
function getViewportExtentHeight() {
  const vv = window.visualViewport;
  if (vv && typeof vv.height === 'number' && vv.height > 0 && Number.isFinite(vv.scale) && vv.scale > 0) {
    return vv.height;
  }
  return window.innerHeight;
}

/**
 * Cached scrollHeight avoids forced reflow on every rAF read.
 * Updated via subscribeScrollableLayoutUpdates (ResizeObserver + visualViewport).
 */
let _cachedScrollHeight = 0;
let _cachedViewportHeight = 0;
let _scrollCacheInitialized = false;

function _refreshScrollCache() {
  const root = document.scrollingElement ?? document.documentElement;
  _cachedScrollHeight = root.scrollHeight;
  _cachedViewportHeight = getViewportExtentHeight();
}

export function getDocumentScrollProgress() {
  if (!_scrollCacheInitialized) {
    _scrollCacheInitialized = true;
    _refreshScrollCache();
    subscribeScrollableLayoutUpdates(_refreshScrollCache);
  }
  const scrollable = Math.max(0, _cachedScrollHeight - _cachedViewportHeight);
  if (scrollable <= 0) return 0;
  const y = window.scrollY ?? 0;
  const t = y / scrollable;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

// ---------------------------------------------------------------------------
// Layout + visual viewport → coalesced rAF flush (one RO + optional VV listeners)
// ---------------------------------------------------------------------------

/** @type {ResizeObserver | null} */
let _layoutObserver = null;
/** @type {Set<() => void>} */
const _layoutCallbacks = new Set();
let _layoutFlushScheduled = false;

/** @type {(() => void) | null} */
let _visualViewportHandler = null;
let _visualViewportListenersAttached = false;

function _flushLayoutCallbacks() {
  _layoutFlushScheduled = false;
  for (const cb of _layoutCallbacks) {
    try {
      cb();
    } catch {
      /* caller-owned; avoid breaking coalesced flush */
    }
  }
}

function _scheduleLayoutFlush() {
  if (_layoutFlushScheduled) return;
  _layoutFlushScheduled = true;
  requestAnimationFrame(_flushLayoutCallbacks);
}

function _attachVisualViewportListeners() {
  const vv = window.visualViewport;
  if (!vv || _visualViewportListenersAttached) return;
  _visualViewportHandler = () => _scheduleLayoutFlush();
  vv.addEventListener('resize', _visualViewportHandler, { passive: true });
  vv.addEventListener('scroll', _visualViewportHandler, { passive: true });
  _visualViewportListenersAttached = true;
}

function _detachVisualViewportListeners() {
  const vv = window.visualViewport;
  if (_visualViewportListenersAttached && _visualViewportHandler && vv) {
    vv.removeEventListener('resize', _visualViewportHandler);
    vv.removeEventListener('scroll', _visualViewportHandler);
  }
  _visualViewportListenersAttached = false;
  _visualViewportHandler = null;
}

/**
 * @param {() => void} callback invoked when document layout or visual viewport may have changed scrollable extent
 * @returns {() => void} unsubscribe
 */
export function subscribeScrollableLayoutUpdates(callback) {
  _layoutCallbacks.add(callback);
  if (!_layoutObserver && typeof ResizeObserver !== 'undefined') {
    _layoutObserver = new ResizeObserver(_scheduleLayoutFlush);
    _layoutObserver.observe(document.documentElement);
  }
  _attachVisualViewportListeners();
  return () => {
    _layoutCallbacks.delete(callback);
    if (_layoutCallbacks.size === 0) {
      if (_layoutObserver) {
        _layoutObserver.disconnect();
        _layoutObserver = null;
      }
      _detachVisualViewportListeners();
    }
  };
}
