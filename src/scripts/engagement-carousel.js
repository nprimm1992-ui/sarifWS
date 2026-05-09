/**
 * Engagement dossier carousel — scroll-snap, controls, pills, keyboard.
 * Hash updates on user navigation (not on initial paint).
 */
function slideIndexFromScroll(viewport, slides) {
  const w = viewport.clientWidth;
  const center = viewport.scrollLeft + w / 2;
  let best = 0;
  let bestDist = Infinity;
  slides.forEach((slide, i) => {
    const mid = slide.offsetLeft + slide.offsetWidth / 2;
    const dist = Math.abs(mid - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

function bindCarousel(root) {
  if (root.dataset.carouselBound === 'true') return;
  root.dataset.carouselBound = 'true';

  const viewport = root.querySelector('[data-carousel-viewport]');
  const slides = [...root.querySelectorAll('[data-carousel-slide]')];
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');
  const pills = [...root.querySelectorAll('[data-carousel-pill]')];
  const statusEl = root.querySelector('[data-carousel-status]');

  if (!viewport || slides.length === 0) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = slides.length;

  let activeIndex = 0;
  /** Ignore scroll-derived index while programmatic smooth scroll runs */
  let ignoreScrollSyncUntil = 0;
  /** rAF handle for coalescing per-frame visual updates during scroll. */
  let scrollRafId = 0;
  /** Hash-sync fallback for engines without `scrollend` (older Safari / IE-era
   *  polyfilled bundles). Resets on each scroll event; fires ~180ms after the
   *  last scroll, matching the old debounce feel but decoupled from the
   *  visual update above. Cancelled whenever scrollend fires. */
  let hashSyncFallbackId = 0;
  const HASH_SYNC_FALLBACK_MS = 180;
  const SUPPORTS_SCROLLEND = typeof window !== 'undefined' && 'onscrollend' in window;

  function replaceHashIfNeeded() {
    const id = slides[activeIndex]?.dataset.carouselSlideId;
    if (!id) return;
    try {
      const next = `#${id}`;
      if (window.location.hash !== next) {
        history.replaceState(null, '', next);
      }
    } catch {
      /* ignore replaceState in opaque origins */
    }
  }

  function updateUI(syncHash) {
    slides.forEach((slide, i) => {
      const on = i === activeIndex;
      slide.classList.toggle('is-active', on);
      slide.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    pills.forEach((pill, i) => {
      const on = i === activeIndex;
      pill.setAttribute('aria-current', on ? 'true' : 'false');
      pill.classList.toggle('is-active', on);
    });

    if (prevBtn) prevBtn.disabled = activeIndex === 0;
    if (nextBtn) nextBtn.disabled = activeIndex === count - 1;

    if (statusEl) {
      statusEl.textContent = `Engagement ${activeIndex + 1} of ${count}`;
    }

    if (syncHash) replaceHashIfNeeded();
  }

  function goTo(i, smooth, syncHash) {
    if (scrollRafId) {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = 0;
    }
    if (hashSyncFallbackId) {
      clearTimeout(hashSyncFallbackId);
      hashSyncFallbackId = 0;
    }
    const next = Math.max(0, Math.min(count - 1, i));
    activeIndex = next;
    const slide = slides[activeIndex];
    if (!slide) return;

    const useSmooth = smooth && !reduceMotion;
    if (useSmooth) {
      ignoreScrollSyncUntil = performance.now() + 550;
    }

    viewport.scrollTo({
      left: slide.offsetLeft,
      behavior: useSmooth ? 'smooth' : 'instant',
    });
    updateUI(syncHash);
  }

  function applyScrollDerivedIndex(syncHash) {
    const nextIdx = slideIndexFromScroll(viewport, slides);
    if (nextIdx !== activeIndex) {
      activeIndex = nextIdx;
      updateUI(syncHash);
    }
  }

  /* During continuous scroll we coalesce to one frame-aligned visual update
     (pill highlight, aria-current, status text). The URL hash only syncs on
     scrollend — mid-flick hash updates produced URL thrash and fought the
     browser's own scroll-restoration. setTimeout(100) was a blunt debounce
     that inserted up to a 100ms lag before the pill caught up; rAF-coalesce
     lands the visual within the next frame without over-updating. */
  function onScroll() {
    if (performance.now() < ignoreScrollSyncUntil) return;
    if (reduceMotion) {
      applyScrollDerivedIndex(true);
      return;
    }
    if (!scrollRafId) {
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = 0;
        applyScrollDerivedIndex(false);
      });
    }
    /* Hash-sync fallback for engines missing the scrollend event. Reset on
       every scroll tick so it only fires once after the user has stopped. */
    if (!SUPPORTS_SCROLLEND) {
      if (hashSyncFallbackId) clearTimeout(hashSyncFallbackId);
      hashSyncFallbackId = window.setTimeout(() => {
        hashSyncFallbackId = 0;
        if (performance.now() < ignoreScrollSyncUntil) return;
        applyScrollDerivedIndex(true);
      }, HASH_SYNC_FALLBACK_MS);
    }
  }

  prevBtn?.addEventListener('click', () => goTo(activeIndex - 1, true, true));
  nextBtn?.addEventListener('click', () => goTo(activeIndex + 1, true, true));

  pills.forEach((pill, i) => {
    pill.addEventListener('click', () => goTo(i, true, true));
  });

  viewport.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(activeIndex - 1, true, true);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(activeIndex + 1, true, true);
    }
  });

  const swipeHint = root.querySelector('[data-swipe-hint]');
  if (swipeHint) {
    const dismissHint = () => {
      swipeHint.classList.add('is-hidden');
      viewport.removeEventListener('scroll', dismissHint);
      viewport.removeEventListener('touchstart', dismissHint);
    };
    viewport.addEventListener('scroll', dismissHint, { passive: true, once: true });
    viewport.addEventListener('touchstart', dismissHint, { passive: true, once: true });
  }

  viewport.addEventListener('scroll', onScroll, { passive: true });
  viewport.addEventListener(
    'scrollend',
    () => {
      if (scrollRafId) {
        cancelAnimationFrame(scrollRafId);
        scrollRafId = 0;
      }
      if (hashSyncFallbackId) {
        clearTimeout(hashSyncFallbackId);
        hashSyncFallbackId = 0;
      }
      if (performance.now() < ignoreScrollSyncUntil) return;
      /* scrollend is the canonical "scroll has stopped" signal; sync hash
         here so the URL reflects the settled slide exactly once per
         interaction rather than racing against intermediate frames. */
      applyScrollDerivedIndex(true);
    },
    { passive: true }
  );

  const ro = new ResizeObserver(() => {
    goTo(activeIndex, false, false);
  });
  ro.observe(viewport);

  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (hash) {
    const idx = slides.findIndex((s) => s.dataset.carouselSlideId === hash);
    if (idx >= 0) {
      activeIndex = idx;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => goTo(idx, false, false));
      });
      return;
    }
  }

  updateUI(false);
  requestAnimationFrame(() => goTo(0, false, false));
}

function initEngagementCarousels() {
  document.querySelectorAll('[data-eng-carousel]').forEach(bindCarousel);
}

function run() {
  initEngagementCarousels();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run, { once: true });
} else {
  run();
}

document.addEventListener('astro:page-load', () => {
  requestAnimationFrame(run);
});
