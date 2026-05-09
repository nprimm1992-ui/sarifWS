/**
 * Client-side error + Web Vitals beacon.
 *
 * Two beacons share one endpoint (/api/_internal/log) but are discriminated
 * server-side by the `type` field:
 *   - type absent / 'error' / 'unhandledrejection' → legacy error beacon.
 *   - type = 'web_vital' → real-user performance metric.
 *
 * Error beacon: binds one `window.error` + one `unhandledrejection` handler
 * per session, deduplicates by stack fingerprint, caps at MAX_EVENTS per
 * session, and posts a minimal payload via navigator.sendBeacon (with a
 * keepalive fetch fallback).
 *
 * Web Vitals beacon: Pillar 4b. Subscribes to onLCP/onINP/onCLS/onTTFB from
 * the `web-vitals` library (v4, ~1.8 KB gz, maintained by Google Chrome
 * team). Metrics fire on pagehide/visibilitychange and (for CLS/INP) again
 * on bfcache restore; the library batches per-metric internally. One
 * navigator.sendBeacon per metric-update, same transport as the error path.
 *
 * Intentionally zero-PII on both:
 *   - Page is pathname only (no search/hash).
 *   - Error message is Error.message (truncated); stack_fp is SHA-256 of the
 *     top N stack frames with URLs and line:col stripped.
 *   - Web vital event: name + value + rating + metric id (library UUID) only.
 *
 * Idempotent to Astro's ClientRouter: `astro:before-swap` tears down the
 * listeners and the init runs again on the next page load. web-vitals
 * attaches its own pagehide handler; we do NOT dispose it across route
 * swaps because the same document instance continues under ClientRouter
 * (SPA-style), which matches the library's contract.
 */

const BEACON_URL = '/api/_internal/log';
const MESSAGE_MAX = 500;
const PAGE_MAX = 255;
const METRIC_NAME_MAX = 32;
const METRIC_ID_MAX = 64;
const MAX_EVENTS_PER_SESSION = 20;
const STACK_FRAMES_FOR_FP = 5;
const DEDUPE_WINDOW_MS = 10_000;
const WEB_VITALS_ALLOWED = new Set(['LCP', 'INP', 'CLS', 'TTFB', 'FCP']);

let _abortController = null;
let _eventsSent = 0;
let _webVitalsStarted = false;
const _recentFingerprints = new Map();

function truncate(value, max) {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

async function computeStackFp(error) {
  const stack =
    (error && typeof error.stack === 'string' && error.stack) ||
    (error && typeof error.message === 'string' && error.message) ||
    '';
  const lines = stack
    .split('\n')
    .slice(0, STACK_FRAMES_FOR_FP)
    .map((line) =>
      line
        .replace(/https?:\/\/[^\s)]+/g, '')
        .replace(/:\d+:\d+/g, '')
        .trim(),
    )
    .filter(Boolean);
  const material = lines.join('|') || String(error);

  try {
    const enc = new TextEncoder().encode(material);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return String(material).slice(0, 64);
  }
}

function shouldDedupe(fp) {
  const now = Date.now();
  for (const [key, ts] of _recentFingerprints) {
    if (now - ts > DEDUPE_WINDOW_MS) {
      _recentFingerprints.delete(key);
    }
  }
  if (_recentFingerprints.has(fp)) return true;
  _recentFingerprints.set(fp, now);
  return false;
}

function dispatchBeacon(payload) {
  try {
    const body = JSON.stringify(payload);

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(BEACON_URL, blob)) return;
    }

    if (typeof fetch === 'function') {
      void fetch(BEACON_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => {});
    }
  } catch {
    // Beacon delivery is best-effort.
  }
}

async function reportError(source, error) {
  if (_eventsSent >= MAX_EVENTS_PER_SESSION) return;

  let message;
  if (error instanceof Error) {
    message = error.message || String(error);
  } else if (typeof error === 'string') {
    message = error;
  } else {
    try {
      message = JSON.stringify(error);
    } catch {
      message = Object.prototype.toString.call(error);
    }
  }
  if (!message) message = '';

  const fp = await computeStackFp(error);
  if (shouldDedupe(fp)) return;

  const pagePath =
    (window.location && window.location.pathname) || '/';

  _eventsSent += 1;
  dispatchBeacon({
    page: truncate(pagePath, PAGE_MAX),
    message: truncate(message, MESSAGE_MAX),
    stack_fp: fp,
    source,
  });
}

function tearDown() {
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
}

/**
 * Report one Web Vital sample. Shape matches the Worker's `web_vital`
 * discriminator schema (see functions/api/_internal/log.js). We do NOT
 * share the _eventsSent cap with errors — a single pageload legitimately
 * produces ~4 metric events (LCP, INP, CLS, TTFB) and the library may
 * re-fire INP/CLS on bfcache restore.
 */
function reportWebVital(metric) {
  if (!metric || typeof metric !== 'object') return;
  const name = typeof metric.name === 'string' ? metric.name : '';
  if (!WEB_VITALS_ALLOWED.has(name)) return;
  const value = typeof metric.value === 'number' && Number.isFinite(metric.value)
    ? metric.value
    : null;
  if (value === null) return;

  const pagePath = (window.location && window.location.pathname) || '/';
  const rating = typeof metric.rating === 'string' ? metric.rating : '';
  const id = typeof metric.id === 'string' ? metric.id : '';
  const navigationType = typeof metric.navigationType === 'string' ? metric.navigationType : '';

  dispatchBeacon({
    type: 'web_vital',
    page: truncate(pagePath, PAGE_MAX),
    name: truncate(name, METRIC_NAME_MAX),
    /* web-vitals emits value in ms (LCP/INP/TTFB/FCP) or unitless (CLS).
       We forward verbatim; the Worker rounds before storage. */
    value,
    rating: truncate(rating, 16),
    id: truncate(id, METRIC_ID_MAX),
    navigation_type: truncate(navigationType, 32),
  });
}

/**
 * Subscribe to the four canonical RUM metrics + FCP (cheap bonus signal).
 * Called once per document; ClientRouter swaps leave the document intact,
 * so the library's internal pagehide/visibilitychange hooks continue to
 * fire across virtual route changes. Guarded by `document.prerendering`:
 * metrics collected during speculation rules prerender are synthetic and
 * must not be submitted — the library itself handles that, but we also
 * skip the prerender-surface init to avoid wasting a module download.
 */
async function initWebVitals() {
  if (_webVitalsStarted) return;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (document.prerendering) {
    /* Wait for the document to activate, then re-enter. Addresses
       speculation-rules prerender on Chromium 111+. */
    document.addEventListener(
      'prerenderingchange',
      () => { void initWebVitals(); },
      { once: true },
    );
    return;
  }
  _webVitalsStarted = true;

  try {
    /* Dynamic import keeps the critical-path bundle lean and lets
       browsers that throw on module resolution (none today, but a
       regression-safety net) fall through to a no-op. */
    const mod = await import('web-vitals');
    const { onLCP, onINP, onCLS, onTTFB, onFCP } = mod;
    if (typeof onLCP === 'function') onLCP(reportWebVital);
    if (typeof onINP === 'function') onINP(reportWebVital);
    if (typeof onCLS === 'function') onCLS(reportWebVital);
    if (typeof onTTFB === 'function') onTTFB(reportWebVital);
    if (typeof onFCP === 'function') onFCP(reportWebVital);
  } catch {
    /* Metrics are best-effort; never surface init failures to the user. */
    _webVitalsStarted = false;
  }
}

function initTelemetry() {
  if (typeof window === 'undefined') return;
  tearDown();
  _abortController = new AbortController();
  const { signal } = _abortController;

  window.addEventListener(
    'error',
    (event) => {
      const err = event?.error instanceof Error ? event.error : event?.message || 'Unknown error';
      void reportError('error', err);
    },
    { signal, capture: true },
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = event?.reason;
      void reportError('unhandledrejection', reason);
    },
    { signal },
  );

  document.addEventListener(
    'astro:before-swap',
    () => {
      tearDown();
    },
    { once: true, signal },
  );
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTelemetry, { once: true });
  } else {
    initTelemetry();
  }
  document.addEventListener('astro:page-load', initTelemetry);
  /* Web Vitals: once per document. ClientRouter-driven route changes share
     the same document, so the library's pagehide hook continues to work;
     we intentionally do NOT re-init per astro:page-load. */
  void initWebVitals();
}
