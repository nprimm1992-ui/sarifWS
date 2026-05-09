/*
 * cta-telemetry
 * -------------
 * Delegated click listener that records activations of any element carrying
 * a `data-cta-id` attribute. Uses sendBeacon so the POST survives
 * navigation to a new page (the typical CTA flow). Silent on failure —
 * telemetry must never affect UX.
 *
 * Payload:
 *   { type: 'cta_click', cta_id, page, ts }
 *
 * Backend: functions/api/_internal/log.js (persists to `cta_clicks`).
 *
 * The listener is bound to `document` once per page load and torn down
 * via the ClientRouter swap lifecycle hook so re-binding is idempotent.
 */

const LOG_ENDPOINT = '/api/_internal/log';
const CTA_SELECTOR = '[data-cta-id]';
const MAX_CTA_ID_LEN = 64;

let _wired = false;

const MAX_CTA_VARIANT_LEN = 32;

function reportCtaClick(ctaId, ctaVariant) {
  if (typeof ctaId !== 'string') return;
  const trimmed = ctaId.trim().slice(0, MAX_CTA_ID_LEN);
  if (!trimmed) return;
  const variant =
    typeof ctaVariant === 'string'
      ? ctaVariant.trim().slice(0, MAX_CTA_VARIANT_LEN)
      : '';
  const payload = {
    type: 'cta_click',
    cta_id: trimmed,
    cta_variant: variant || undefined,
    page: location.pathname,
    ts: Date.now(),
  };
  try {
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon(LOG_ENDPOINT, blob)) return;
    // sendBeacon unavailable or rejected — fall back to fetch with keepalive.
    fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* silent */ });
  } catch {
    /* silent */
  }
}

function onClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const cta = target.closest(CTA_SELECTOR);
  if (!(cta instanceof HTMLElement)) return;
  const id = cta.getAttribute('data-cta-id');
  const variant = cta.getAttribute('data-cta-variant');
  if (id) reportCtaClick(id, variant || undefined);
}

function init() {
  if (_wired) return;
  document.addEventListener('click', onClick, { capture: true, passive: true });
  _wired = true;
}

function teardown() {
  if (!_wired) return;
  document.removeEventListener('click', onClick, { capture: true });
  _wired = false;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  // Astro ClientRouter: detach before swap, re-init after page-load, so
  // the listener lives on the persistent document (not the swapped page)
  // without doubling up.
  document.addEventListener('astro:before-swap', teardown);
  document.addEventListener('astro:page-load', init);
}
