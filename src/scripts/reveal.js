// reveal.js — Intersection Observer staggered card reveals + sheen will-change gating
// Runs on both initial load and View Transitions page navigations

/**
 * Sheen elements share the `sarif-gold-sheen-loop` animation (background-position).
 * Keeping `will-change: background-position` permanently on every sheen element
 * bloats compositor memory, and the paint ticks while offscreen. An
 * IntersectionObserver toggles `.sarif-sheen-active` (grants will-change) and
 * `.sarif-sheen-inactive` (pauses animation) based on viewport intersection.
 */
const SHEEN_SELECTOR = [
  '.sarif-hover-sheen',
  '.contact-info .info-label.ui-eyebrow',
  '.eng-carousel__pill-label',
  '.praxis-preview .preview-num',
  'a#practice-heading.practice-coming__heading-link',
  '.lanes .lane-title.ui-eyebrow',
  '.lanes h2.lane-section-title',
  '.lanes .lane-meta-value--gold',
  'article.proof-entry .proof-entry__classification.ui-eyebrow',
  'article.service-card .service-card__title.ui-eyebrow',
  'article.about-dossier .about-dossier__stat-label.ui-eyebrow',
  'article.ucim-brief .ucim-brief__cell-label.ui-eyebrow',
  'article.ucim-brief .ucim-brief__cue-text.ui-eyebrow',
  '.contact-info a.info-value.info-value--link.ui-eyebrow',
  '.contact-form#contact-form #form-success > p.ui-eyebrow.ui-eyebrow--natural-case',
].join(', ');

/** @type {IntersectionObserver | null} */
let _sheenObserver = null;
/** @type {IntersectionObserver | null} */
let _revealObserver = null;
/** @type {IntersectionObserver | null} */
let _pauseObserver = null;
/** @type {IntersectionObserver[]} */
let _staggerObservers = [];

function disconnectSheenObserver() {
  if (_sheenObserver) {
    _sheenObserver.disconnect();
    _sheenObserver = null;
  }
}

/**
 * Tear down every IntersectionObserver this module owns. Called at the
 * top of initReveal() so Astro ClientRouter soft navigations do not
 * stack new observers on top of the ones from the previous page (which
 * retain references to detached DOM nodes until GC). Stagger observers
 * self-disconnect on first intersect, but if the user navigates away
 * before that fires, the observer survives — so we track and purge
 * them explicitly here.
 */
function disconnectAllObservers() {
  disconnectSheenObserver();
  if (_revealObserver) {
    _revealObserver.disconnect();
    _revealObserver = null;
  }
  if (_pauseObserver) {
    _pauseObserver.disconnect();
    _pauseObserver = null;
  }
  for (const obs of _staggerObservers) obs.disconnect();
  _staggerObservers = [];
}

function initSheenVisibilityGating() {
  disconnectSheenObserver();
  if (typeof IntersectionObserver === 'undefined') return;

  const sheenEls = document.querySelectorAll(SHEEN_SELECTOR);
  if (sheenEls.length === 0) return;

  _sheenObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const inView = entry.isIntersecting;
        entry.target.classList.toggle('sarif-sheen-active', inView);
        entry.target.classList.toggle('sarif-sheen-inactive', !inView);
      }
    },
    // Small margin keeps the activation state stable across fast flicks
    // (sheen turns on just before visible, turns off well after).
    { threshold: 0, rootMargin: '120px 0px 120px 0px' },
  );

  sheenEls.forEach((el) => {
    /* `<details>` lanes (services): sheen is inside closed panels with no
       layout intersection — observer would leave them `inactive` forever
       and the CTA label animation stays paused. Match open-lane behavior
       without gating. */
    if (el.closest('.lane-content')) {
      el.classList.remove('sarif-sheen-inactive');
      el.classList.add('sarif-sheen-active');
      return;
    }
    // Assume offscreen until observer says otherwise; first callback fires
    // synchronously on the next task, so any flash is sub-frame.
    el.classList.add('sarif-sheen-inactive');
    _sheenObserver?.observe(el);
  });
}

function initReveal() {
  // Purge observers from the previous page render before creating new
  // ones. Without this, each ClientRouter soft navigation to a page
  // that re-triggers initReveal leaks observers that still hold
  // references to the old (swapped-out) DOM tree.
  disconnectAllObservers();

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReduced) {
    document.querySelectorAll('.reveal-on-scroll, [data-reveal-item]').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.classList.add('is-visible');
    });
    // Reduced-motion: skip sheen gating entirely. Sheen animation itself is
    // already disabled by the prefers-reduced-motion reset block in global.css,
    // so will-change would serve no purpose.
    return;
  }

  initSheenVisibilityGating();

  // --- Staggered card groups ---
  const staggerGroups = document.querySelectorAll('[data-reveal-group]');

  staggerGroups.forEach((group) => {
    const items = group.querySelectorAll('[data-reveal-item]');
    if (items.length === 0) return;

    // Reset visibility for View Transitions re-init
    items.forEach((item) => item.classList.remove('is-visible'));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            items.forEach((item, i) => {
              setTimeout(() => {
                item.classList.add('is-visible');
              }, i * 100);
            });
            observer.disconnect();
          }
        });
      },
      { 
        threshold: 0.05,  // Lower threshold — trigger when just 5% visible
        rootMargin: '0px 0px -40px 0px'  // Trigger slightly before fully in view
      }
    );

    // Track so disconnectAllObservers() can purge if the user navigates
    // away before the one-shot intersect fires.
    _staggerObservers.push(observer);
    observer.observe(group);
  });

  // --- Individual reveal-on-scroll elements ---
  // ALWAYS run the JS observer as a fallback, even in scroll-timeline browsers.
  // The CSS animation-timeline: view() handles the scroll-linked animation,
  // but adding .is-visible ensures elements are visible as a safety net.
  let revealEls = Array.from(document.querySelectorAll('.reveal-on-scroll'));

  // Coordinate with materialize.js: skip above-fold elements that have
  // data-materialize-text — they will be revealed by the materialization
  // sequence. Only observe below-fold elements for scroll reveal.
  const materializeActive = document.documentElement.dataset.materialize !== 'complete';
  if (materializeActive) {
    revealEls = revealEls.filter(el => {
      if (el.hasAttribute('data-materialize-text')) {
        el.classList.add('is-visible');
        return false;
      }
      return true;
    });
  }

  if (revealEls.length > 0) {
    _revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            _revealObserver?.unobserve(entry.target);
          }
        });
      },
      { 
        threshold: 0.05,
        rootMargin: '0px 0px -20px 0px'
      }
    );

    revealEls.forEach((el) => _revealObserver?.observe(el));
  }

  // --- Pause CSS animations on offscreen containers ---
  // Any element tagged [data-pause-offscreen] gets `.is-offscreen` toggled
  // based on viewport intersection. CSS uses that to pause animation-play-state.
  const pauseEls = document.querySelectorAll('[data-pause-offscreen]');
  if (pauseEls.length > 0 && 'IntersectionObserver' in window) {
    _pauseObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-offscreen', !entry.isIntersecting);
        });
      },
      { threshold: 0, rootMargin: '100px 0px 100px 0px' }
    );
    pauseEls.forEach((el) => {
      el.classList.remove('is-offscreen');
      _pauseObserver?.observe(el);
    });
  }
}

// Safety net: when materialization completes, ensure any above-fold
// reveal-on-scroll elements that were skipped get stamped visible.
document.addEventListener('sarif:materialize-complete', () => {
  document.querySelectorAll('.reveal-on-scroll[data-materialize-text]').forEach(el => {
    el.classList.add('is-visible');
  });
});

// Run on initial page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReveal, { once: true });
} else {
  // DOM already ready
  initReveal();
}

// Re-init on Astro View Transitions page navigation
document.addEventListener('astro:page-load', () => {
  requestAnimationFrame(() => {
    initReveal();
  });
});
