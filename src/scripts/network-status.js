/**
 * Online/offline live region.
 *
 * Announces connectivity changes through a visually-hidden aria-live
 * region so screen-reader users hear the change and sighted users see a
 * discreet bottom-right pill. The pill auto-dismisses after a short hold
 * when the browser goes back online.
 *
 * Intentionally lightweight — no dependencies, no layout thrash, idempotent
 * on repeated init (safe for View Transitions re-execution).
 */

const REGION_ID = 'sarif-network-status';
const OFFLINE_MSG = 'Offline — your transmission is saved locally and will send when the connection returns.';
const ONLINE_MSG = 'Back online — you can submit again.';
const ONLINE_HOLD_MS = 4000;

function ensureRegion() {
  let el = document.getElementById(REGION_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = REGION_ID;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.dataset.state = 'idle';
  el.textContent = '';
  document.body.appendChild(el);
  return el;
}

function show(region, state, message) {
  region.dataset.state = state;
  region.textContent = message;
}

function clear(region) {
  region.dataset.state = 'idle';
  region.textContent = '';
}

let onlineTimer;

function handleOnline(region) {
  if (onlineTimer) clearTimeout(onlineTimer);
  show(region, 'online', ONLINE_MSG);
  onlineTimer = window.setTimeout(() => clear(region), ONLINE_HOLD_MS);
}

function handleOffline(region) {
  if (onlineTimer) {
    clearTimeout(onlineTimer);
    onlineTimer = undefined;
  }
  show(region, 'offline', OFFLINE_MSG);
}

function init() {
  if (typeof window === 'undefined' || window.__sarifNetworkStatusInstalled) return;
  window.__sarifNetworkStatusInstalled = true;

  const region = ensureRegion();
  if (!navigator.onLine) handleOffline(region);

  window.addEventListener('online', () => handleOnline(region));
  window.addEventListener('offline', () => handleOffline(region));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
