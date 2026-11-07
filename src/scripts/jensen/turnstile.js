/**
 * Explicit Turnstile. The widget stays invisible unless Cloudflare asks
 * the visitor to interact. getToken waits for the callback instead of
 * reading an empty field.
 */

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const DEFAULT_TIMEOUT_MS = 8_000;

let sitekey = '';
let widgetId = null;
let scriptPromise = null;
let pending = null;
let currentToken = '';

function api() {
  return globalThis.turnstile || null;
}

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (api()) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptPromise = null;
      reject(new Error('turnstile'));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

/** Fetch the script on visitor intent. Rendering waits for a visible panel. */
export function preloadTurnstile(key) {
  if (!key) return;
  loadScript().catch(() => {
    /* mountTurnstile retries on open, and getToken reports the failure. */
  });
}

export function mountTurnstile(container, key) {
  sitekey = key || '';
  if (!sitekey || !container || container.dataset.mounted === '1') return Promise.resolve();
  container.dataset.mounted = '1';
  return loadScript().then(() => {
    const turnstile = api();
    if (!turnstile) return;
    widgetId = turnstile.render(container, {
      sitekey,
      theme: 'dark',
      appearance: 'interaction-only',
      callback(token) {
        currentToken = token || '';
        pending?.resolve(currentToken);
        pending = null;
      },
      'expired-callback'() {
        currentToken = '';
      },
      'error-callback'() {
        currentToken = '';
        pending?.reject(new Error('turnstile'));
        pending = null;
      },
    });
  }).catch(() => {
    container.dataset.mounted = '';
  });
}

export function getToken({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!sitekey) return Promise.resolve('');
  if (currentToken) return Promise.resolve(currentToken);
  const turnstile = api();
  const existing = turnstile && widgetId ? turnstile.getResponse(widgetId) : '';
  if (existing) {
    currentToken = existing;
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending = null;
      reject(new Error('turnstile-timeout'));
    }, timeoutMs);
    pending = {
      resolve(token) {
        clearTimeout(timer);
        resolve(token);
      },
      reject(err) {
        clearTimeout(timer);
        reject(err);
      },
    };
  });
}

export function resetTurnstile() {
  currentToken = '';
  const turnstile = api();
  if (turnstile && widgetId) turnstile.reset(widgetId);
}
