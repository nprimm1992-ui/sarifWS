// @ts-check
/**
 * Round-7 — Praxis dossier runtime.
 *
 * Responsibilities:
 *   1. Sealed → opened cinematic on first visit of an article per
 *      session. Uses Web Animations API (`element.animate()`) for
 *      compound timing that CSS alone cannot express (clip-path
 *      inset → polygon is not CSS-interpolable, subregions stagger).
 *   2. Reading-progress HUD: updates the mono counter in the file-
 *      strip header and a visually-hidden aria-live region for AT.
 *   3. Session-guard: within-session re-visits (browser Back/Forward,
 *      Astro client router swaps, SPA-like nav) skip the cinematic
 *      so the animation is a one-time "you've opened this file"
 *      moment, not a noise-on-every-click annoyance.
 *
 * Accessibility posture:
 *   - `prefers-reduced-motion: reduce` shortcuts the open animation
 *     entirely — the case is simply opened.
 *   - AT progress announcements fire only on 10 % step transitions
 *     so screen readers don't drown in chatter.
 *   - All decorative chrome (`praxis-case__seal`, footer, watermark)
 *     is aria-hidden at the markup level; the script never promotes
 *     those regions into the accessibility tree.
 *
 * Runtime posture:
 *   - Idempotent: safe to call `init()` on both initial load and
 *     `astro:page-load` swaps. Re-binding cleans up prior handlers.
 *   - rAF-throttled scroll math; no layout thrash in the HUD loop.
 *   - IntersectionObserver with `rootMargin: 0` activates scroll-
 *     tracking only while the case body intersects the viewport.
 */

const OPEN_STORAGE_PREFIX = 'sarif:praxis-opened:';
const SCANLINE_DURATION_MS = 900;
const CASE_OPEN_DURATION_MS = 640;
const CASE_OPEN_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const PROGRESS_STEP = 10;

/** @type {{ caseEl: HTMLElement; cleanup: () => void } | null} */
let _current = null;

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * @param {string} slug
 */
function hasOpenedBefore(slug) {
  try {
    return sessionStorage.getItem(OPEN_STORAGE_PREFIX + slug) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {string} slug
 */
function markOpened(slug) {
  try {
    sessionStorage.setItem(OPEN_STORAGE_PREFIX + slug, '1');
  } catch {
    // Storage may be blocked (incognito, disabled); accept re-anim on refresh.
  }
}

/**
 * Drive the sealed → opened cinematic.
 *
 * Staging:
 *   0 ms      — sealed state painted (CSS-applied via data attr).
 *   0-640 ms  — case clip-path expands, opacity lifts.
 *   120-420 ms— title plate fades + translateY in.
 *   150-500 ms— hero scales 1.04 → 1.0, opacity in.
 *   280-680 ms— body fades in.
 *   400-780 ms— stamp + watermark fade in.
 *   520-900 ms— seal scales/rotates to identity; gold pulse.
 *   0-900 ms  — scanline sweeps (driven by CSS keyframes).
 *
 * @param {HTMLElement} caseEl
 */
function runOpenCinematic(caseEl) {
  caseEl.setAttribute('data-praxis-open', 'sealed');

  // Force layout so the sealed frame commits before we begin the
  // animation. Without this, setting the attribute and reading in
  // the same microtask can collapse into a single frame.
  void caseEl.getBoundingClientRect();

  requestAnimationFrame(() => {
    caseEl.setAttribute('data-praxis-open', 'opening');

    const animations = /** @type {Array<Promise<unknown>>} */ ([]);

    const pushAnim = (/** @type {Element | null | undefined} */ el, /** @type {Keyframe[]} */ keyframes, /** @type {KeyframeAnimationOptions} */ options) => {
      if (!el || typeof (/** @type {HTMLElement} */ (el)).animate !== 'function') return;
      // `fill: 'backwards'` holds the first keyframe DURING the delay
      // window (so elements stay hidden/offset until their stagger
      // begins) but releases the last keyframe on finish — letting
      // CSS reassert. This is critical for the case element, whose
      // final keyframe is a rectangular `inset(0 0 0 0)` that would
      // otherwise permanently override the octagonal `var(--clip-card)`
      // chamfer. All other targets have CSS defaults that already
      // match their animation end-state, so release is transparent.
      const anim = /** @type {HTMLElement} */ (el).animate(keyframes, {
        fill: 'backwards',
        easing: CASE_OPEN_EASE,
        ...options,
      });
      animations.push(anim.finished.catch(() => undefined));
    };

    // Case — clip-path inset → polygon is not interpolable, so we
    // animate the inset stage and let the 'open' attribute swap
    // to the octagonal clip via CSS at the final frame.
    pushAnim(caseEl, [
      { clipPath: 'inset(48% 5% 48% 5% round 2px)', opacity: 0.85 },
      { clipPath: 'inset(16% 2% 16% 2% round 2px)', opacity: 0.95, offset: 0.45 },
      { clipPath: 'inset(2% 0% 2% 0% round 2px)', opacity: 1, offset: 0.85 },
      { clipPath: 'inset(0% 0% 0% 0% round 2px)', opacity: 1 },
    ], { duration: CASE_OPEN_DURATION_MS });

    const titlePlate = caseEl.querySelector('.praxis-case__title-plate');
    pushAnim(titlePlate, [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 400, delay: 120 });

    const heroPicture = caseEl.querySelector('.praxis-case__hero picture img');
    pushAnim(heroPicture, [
      { opacity: 0, transform: 'scale(1.04)' },
      { opacity: 1, transform: 'scale(1)' },
    ], { duration: 500, delay: 150 });

    const body = caseEl.querySelector('.praxis-case__body');
    pushAnim(body, [
      { opacity: 0 },
      { opacity: 1 },
    ], { duration: 500, delay: 280 });

    const stamp = caseEl.querySelector('.praxis-case__stamp');
    pushAnim(stamp, [
      { opacity: 0 },
      { opacity: 1 },
    ], { duration: 380, delay: 400 });

    const watermark = caseEl.querySelector('.praxis-case__hero-watermark');
    pushAnim(watermark, [
      { opacity: 0 },
      { opacity: 0.08 },
    ], { duration: 380, delay: 400 });

    const footer = caseEl.querySelector('.praxis-case__footer');
    pushAnim(footer, [
      { opacity: 0 },
      { opacity: 1 },
    ], { duration: 400, delay: 500 });

    const seal = caseEl.querySelector('.praxis-case__seal');
    pushAnim(seal, [
      { opacity: 0, transform: 'scale(1.35) rotate(-6deg)', filter: 'drop-shadow(0 0 12px rgba(221, 184, 61, 0.55))' },
      { opacity: 0.92, transform: 'scale(1.04) rotate(1deg)', filter: 'drop-shadow(0 0 10px rgba(221, 184, 61, 0.45))', offset: 0.7 },
      { opacity: 0.92, transform: 'scale(1) rotate(0deg)', filter: 'drop-shadow(0 0 4px rgba(221, 184, 61, 0.25))' },
    ], { duration: 720, delay: 520 });

    Promise.allSettled(animations).then(() => {
      caseEl.setAttribute('data-praxis-open', 'open');
    });

    // Safety net: scanline is CSS-driven. Remove the 'opening' attr
    // shortly after the scanline finishes so the ::after pseudo-
    // element detaches and compositor memory is released.
    setTimeout(() => {
      if (caseEl.getAttribute('data-praxis-open') === 'opening') {
        caseEl.setAttribute('data-praxis-open', 'open');
      }
    }, SCANLINE_DURATION_MS + 120);
  });
}

/**
 * Reading-progress HUD.
 *
 * Tracks how far the user has scrolled through `.praxis-case__body`
 * (not the document, because the case is embedded inside a wider
 * layout). Emits:
 *   - numeric updates to `[data-praxis-progress]` (continuous)
 *   - AT announcements on 10 % step transitions
 *
 * @param {HTMLElement} caseEl
 * @returns {() => void} cleanup
 */
function bindProgressHud(caseEl) {
  const body = /** @type {HTMLElement | null} */ (caseEl.querySelector('.praxis-case__body'));
  const numeric = /** @type {HTMLElement | null} */ (caseEl.querySelector('[data-praxis-progress]'));
  const live = /** @type {HTMLElement | null} */ (caseEl.querySelector('[data-praxis-progress-sr]'));

  if (!body || !numeric) {
    return () => undefined;
  }

  let rafId = 0;
  let lastStep = -1;
  let lastValue = -1;
  let active = false;

  const compute = () => {
    rafId = 0;
    const rect = body.getBoundingClientRect();
    const viewport = window.innerHeight || document.documentElement.clientHeight || 0;
    if (viewport <= 0 || rect.height <= 0) return;

    // 0 % when body top aligns with the top of the viewport.
    // 100 % when body bottom aligns with the bottom of the viewport.
    const scrolled = Math.max(0, -rect.top);
    const total = Math.max(1, rect.height - viewport);
    const raw = Math.min(1, Math.max(0, scrolled / total));
    const value = Math.round(raw * 100);

    if (value !== lastValue) {
      lastValue = value;
      numeric.textContent = String(value);
    }

    const step = Math.floor(value / PROGRESS_STEP) * PROGRESS_STEP;
    if (step !== lastStep && live) {
      lastStep = step;
      // Only announce past first 10 % threshold — avoids a chatty
      // "0 percent read" at page arrival.
      if (step > 0) {
        live.textContent = `${step} percent read`;
      }
    }
  };

  const schedule = () => {
    if (!active || rafId) return;
    rafId = requestAnimationFrame(compute);
  };

  const onScroll = () => schedule();
  const onResize = () => schedule();

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      active = entry.isIntersecting;
      if (active) {
        schedule();
      }
    }
  }, { rootMargin: '0px', threshold: 0 });

  io.observe(body);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  // Compute an initial value so the HUD is not stuck at 0 if the
  // user lands partway down (e.g. deep-link with #hash).
  schedule();

  return () => {
    io.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    if (rafId) cancelAnimationFrame(rafId);
  };
}

function init() {
  const article = /** @type {HTMLElement | null} */ (document.querySelector('.praxis-article[data-praxis-slug]'));
  if (!article) {
    if (_current) {
      _current.cleanup();
      _current = null;
    }
    return;
  }
  const caseEl = /** @type {HTMLElement | null} */ (article.querySelector('[data-praxis-case]'));
  if (!caseEl) return;

  // If this exact case element is already bound (same node), the HUD
  // listeners are still valid — don't rebind and don't re-run the
  // animation. This prevents the double-init race on first render
  // (inline module boot + astro:page-load both firing) from cutting
  // off an in-flight cinematic by flipping to 'open' early.
  if (_current && _current.caseEl === caseEl) return;

  if (_current) {
    _current.cleanup();
    _current = null;
  }

  const slug = article.dataset.praxisSlug || '';
  const alreadyOpened = slug ? hasOpenedBefore(slug) : true;
  const motionOk = !prefersReducedMotion();

  // A prior navigation in the same session may have left
  // `data-praxis-open='open'` on this node (Astro ClientRouter swap).
  // In that case, respect whatever's there; only initialize state if
  // the attribute is missing.
  const alreadyStamped = caseEl.hasAttribute('data-praxis-open');

  if (!alreadyStamped) {
    if (!alreadyOpened && motionOk) {
      runOpenCinematic(caseEl);
      if (slug) markOpened(slug);
    } else {
      caseEl.setAttribute('data-praxis-open', 'open');
    }
  }

  const cleanupProgress = bindProgressHud(caseEl);

  _current = {
    caseEl,
    cleanup: () => {
      cleanupProgress();
    },
  };
}

// Run on initial load + Astro client-router swaps. The client
// router fires `astro:page-load` once on first load AND on every
// subsequent swap, so this single listener covers both paths.
document.addEventListener('astro:page-load', init);

// Fallback for environments where the client router is disabled or
// hasn't booted yet (rare; e.g. a stale deploy without <ClientRouter/>
// or when this module loads after page-load has already fired).
// The caseEl-identity guard in `init()` makes this safe to call
// alongside `astro:page-load` without double-animating.
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  queueMicrotask(init);
} else {
  document.addEventListener('DOMContentLoaded', init, { once: true });
}
