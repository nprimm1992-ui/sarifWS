/**
 * lexicon-page — client-side island for /lexicon/.
 *
 * Progressive enhancement: every feature here degrades safely to the
 * no-JS baseline (filter and chips become no-ops; entries are still
 * individually disclosable via native `<details>`; anchor links work;
 * rail links work).
 *
 * Responsibilities:
 *   1. Filter input — debounced, matches entry term, aka, and
 *      definition substrings. Live-region reports result count.
 *   2. Category chips — multi-select. "All" chip resets the set.
 *   3. URL state — `?q=` and `?cat=` are serialized on change and
 *      restored on load + history back/forward.
 *   4. Keyboard — `/` focuses filter, `Esc` clears it, `j`/`k`
 *      navigate between visible entries (vim-style), ignored when a
 *      form input is focused so it doesn't hijack typing.
 *   5. Hash arrival — on load or `astro:page-load`, open the entry
 *      matching the hash, scroll to it, and flag it for the :target
 *      pulse animation.
 *   6. Scroll-spy — IntersectionObserver on entries sets
 *      `aria-current="true"` on the corresponding rail link.
 *   7. Copy actions — citation and permalink buttons fall back to a
 *      legacy execCommand pattern if the Clipboard API isn't
 *      available (http://... local previews, etc.).
 *   8. Print — expands every entry before print, restores after.
 *
 * Single-file island; no external dependencies.
 */

/* Force module semantics so top-level declarations (init, wire, etc.)
   don't collide with other global-script islands sharing the same
   namespace during type-check. Imported as a side-effect module from
   src/pages/lexicon.astro. */
export {};

type LexiconEntryEl = HTMLDetailsElement & {
  dataset: DOMStringMap & {
    lexId?: string;
    lexCategory?: string;
    lexStatus?: string;
    lexNum?: string;
    lexTerm?: string;
  };
};

type ControlState = {
  q: string;
  categories: Set<string>;
};

/* ---------- Constants ---------- */
const FILTER_DEBOUNCE_MS = 120;
const TARGET_PULSE_CLASS = 'lex-pulse-target';
const CATEGORY_ALL = 'all';
const COPY_FEEDBACK_MS = 1800;
const SCROLLSPY_MARGIN = '-40% 0px -50% 0px';

let state: ControlState = { q: '', categories: new Set<string>() };
let debounceTimer: number | null = null;
let scrollSpy: IntersectionObserver | null = null;
/**
 * Single AbortController for every listener wired in `wire()`. Each
 * `addEventListener` call passes `{ signal: controller.signal }`, so
 * `unwire()` only needs to call `controller.abort()` to tear down
 * every listener in one call — no bookkeeping, no listener that can
 * silently escape cleanup.
 *
 * Why: Astro ClientRouter swaps the DOM without reloading the page.
 * Each visit to /lexicon/ calls `wire()` fresh. Without a matching
 * removal path for the window-level listeners (popstate, hashchange,
 * beforeprint, afterprint) and the delegated root click, handlers
 * would stack on every visit — invisible until multiple duplicate
 * fires per user action or memory growth over a long session.
 */
let controller: AbortController | null = null;

/* ---------- DOM accessors (lazy; evaluated on init) ---------- */
function $pageRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-lex-page]');
}
function $filter(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('[data-lex-filter]');
}
function $count(): HTMLElement | null {
  return document.getElementById('lex-filter-count');
}
function $announce(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-lex-announce]');
}
function $chips(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lex-category]'));
}
function $entries(): LexiconEntryEl[] {
  return Array.from(document.querySelectorAll<LexiconEntryEl>('[data-lex-entry]'));
}
function $groups(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-lex-group]'));
}
function $railLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-lex-rail-link]'));
}
function $emptyState(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-lex-empty]');
}

/* ---------- State → URL serialization ---------- */

function readStateFromUrl(): ControlState {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') ?? '';
  const catStr = params.get('cat') ?? '';
  const categories = new Set(
    catStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return { q, categories };
}

function writeStateToUrl(replace = false) {
  const params = new URLSearchParams(window.location.search);
  if (state.q) params.set('q', state.q);
  else params.delete('q');
  if (state.categories.size > 0) params.set('cat', Array.from(state.categories).join(','));
  else params.delete('cat');
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  if (replace) {
    window.history.replaceState(null, '', next);
  } else {
    window.history.pushState(null, '', next);
  }
}

/* ---------- Filter evaluation ---------- */

function matchesFilter(entry: LexiconEntryEl, q: string, cats: Set<string>): boolean {
  /* Category gate: if any categories selected, entry must be in one. */
  if (cats.size > 0) {
    const entryCat = entry.dataset.lexCategory ?? '';
    if (!cats.has(entryCat)) return false;
  }
  if (!q) return true;
  const needle = q.toLowerCase();
  /* Attribute-based text (term + aka + num) plus visible panel copy
     from textContent. Cheap for modest corpus size. */
  const hay = [
    entry.dataset.lexTerm ?? '',
    entry.dataset.lexNum ?? '',
    entry.textContent ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

function applyFilter(opts: { pushUrl?: boolean } = {}) {
  const entries = $entries();
  const groups = $groups();
  const rail = $railLinks();
  const { q, categories } = state;

  let visibleCount = 0;
  const visibleIds = new Set<string>();

  for (const entry of entries) {
    const matches = matchesFilter(entry, q, categories);
    entry.dataset.filteredOut = matches ? 'false' : 'true';
    if (matches) {
      visibleCount++;
      const id = entry.dataset.lexId;
      if (id) visibleIds.add(id);
    }
  }

  /* Hide group headers whose entries are all filtered out, so the
     category bar doesn't read as "Doctrine (0)". */
  for (const group of groups) {
    const inGroup = group.querySelectorAll<LexiconEntryEl>('[data-lex-entry]');
    const anyVisible = Array.from(inGroup).some((e) => e.dataset.filteredOut !== 'true');
    group.dataset.filteredHidden = anyVisible ? 'false' : 'true';
  }

  /* Rail: dim links whose target is hidden. */
  for (const link of rail) {
    const target = link.dataset.lexTarget ?? '';
    link.dataset.filteredOut = visibleIds.has(target) ? 'false' : 'true';
    link.style.display = visibleIds.has(target) ? '' : 'none';
  }

  /* Count + empty state.
     Use the HTML `hidden` ATTRIBUTE (not the IDL reflection) plus a
     data-lex-state marker on <main> so CSS can discriminate the two
     states without having to know about the attribute. The paired
     stylesheet rule `.lex-empty[hidden] { display: none !important }`
     guarantees the empty panel can never appear alongside a populated
     list even if some later rule touches `display`. */
  const total = entries.length;
  const countEl = $count();
  if (countEl) countEl.textContent = `${visibleCount} of ${total}`;
  const empty = $emptyState();
  const mainEl = document.getElementById('lex-main');
  if (visibleCount > 0) {
    if (empty) empty.setAttribute('hidden', '');
    if (mainEl) mainEl.dataset.lexState = 'results';
  } else {
    if (empty) empty.removeAttribute('hidden');
    if (mainEl) mainEl.dataset.lexState = 'empty';
  }

  /* URL sync */
  if (opts.pushUrl) writeStateToUrl(false);

  announce(`${visibleCount} of ${total} terms`);
}

function announce(text: string) {
  const el = $announce();
  if (el) el.textContent = text;
}

/* ---------- Category chips ---------- */

function updateChipsUi() {
  for (const chip of $chips()) {
    const cat = chip.dataset.lexCategory ?? '';
    let pressed: boolean;
    if (cat === CATEGORY_ALL) {
      pressed = state.categories.size === 0;
    } else {
      pressed = state.categories.has(cat);
    }
    chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  }
}

function onChipClick(chip: HTMLButtonElement) {
  const cat = chip.dataset.lexCategory ?? '';
  if (cat === CATEGORY_ALL) {
    state.categories.clear();
  } else if (state.categories.has(cat)) {
    state.categories.delete(cat);
  } else {
    state.categories.add(cat);
  }
  updateChipsUi();
  applyFilter({ pushUrl: true });
}

/* ---------- Filter input ---------- */

function onFilterInput(ev: Event) {
  const input = ev.currentTarget as HTMLInputElement;
  state.q = input.value;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    applyFilter({ pushUrl: true });
    debounceTimer = null;
  }, FILTER_DEBOUNCE_MS);
}

function clearFilter() {
  state.q = '';
  const input = $filter();
  if (input) input.value = '';
  applyFilter({ pushUrl: true });
}

/* ---------- Keyboard shortcuts ---------- */

function isTypingInField(): boolean {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement)) return false;
  if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true;
  if (a.isContentEditable) return true;
  return false;
}

function focusVisibleEntry(direction: 1 | -1) {
  const visible = $entries().filter((e) => e.dataset.filteredOut !== 'true');
  if (visible.length === 0) return;
  const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const currentEntry = current?.closest<LexiconEntryEl>('[data-lex-entry]');
  let idx = currentEntry ? visible.indexOf(currentEntry) : -1;
  idx = idx === -1 ? (direction === 1 ? 0 : visible.length - 1) : idx + direction;
  if (idx < 0) idx = 0;
  if (idx >= visible.length) idx = visible.length - 1;
  const next = visible[idx];
  const summary = next.querySelector<HTMLElement>('summary');
  if (summary) {
    summary.focus({ preventScroll: false });
    next.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented) return;
  const filterInput = $filter();
  const typing = isTypingInField();

  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (filterInput) {
      e.preventDefault();
      filterInput.focus();
      filterInput.select();
    }
    return;
  }

  if (e.key === 'Escape') {
    /* If filter has content, clear it and stay focused. Otherwise
       blur the filter and let other Escape handlers (popover, etc.)
       run. We don't preventDefault so sibling listeners still fire. */
    if (filterInput && document.activeElement === filterInput) {
      if (filterInput.value) {
        clearFilter();
      } else {
        filterInput.blur();
      }
    }
    return;
  }

  if ((e.key === 'j' || e.key === 'k') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    focusVisibleEntry(e.key === 'j' ? 1 : -1);
  }
}

/* ---------- Hash arrival + target pulse ---------- */

function openAndPulseHashTarget() {
  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (!hash) return;
  const target = document.getElementById(hash);
  if (!(target instanceof HTMLElement)) return;
  if (!target.matches('[data-lex-entry]')) return;
  const details = target as LexiconEntryEl;
  details.open = true;
  /* Next frame: scroll + pulse. The native `:target` pseudo handles
     the border animation; we also scrollIntoView for view-transitions
     and hash-on-same-page jumps that the browser may not re-scroll. */
  requestAnimationFrame(() => {
    details.scrollIntoView({ block: 'start', behavior: 'auto' });
    /* Force re-trigger the animation by toggling a class when the
       same hash is revisited (browsers don't re-fire :target
       animation on repeated hash-set-to-same-value). */
    details.classList.remove(TARGET_PULSE_CLASS);
    void details.offsetWidth;
    details.classList.add(TARGET_PULSE_CLASS);
    window.setTimeout(() => {
      details.classList.remove(TARGET_PULSE_CLASS);
    }, 1400);
  });
}

/* ---------- Scroll-spy (rail) ---------- */

function initScrollSpy() {
  if (!('IntersectionObserver' in window)) return;
  scrollSpy?.disconnect();
  scrollSpy = new IntersectionObserver(
    (entries) => {
      /* Track the topmost entry currently intersecting. */
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length === 0) return;
      const topId = (visible[0].target as HTMLElement).id;
      for (const link of $railLinks()) {
        if (link.dataset.lexTarget === topId) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
    },
    { rootMargin: SCROLLSPY_MARGIN, threshold: 0 },
  );
  for (const entry of $entries()) scrollSpy.observe(entry);
}

/* ---------- Copy-to-clipboard ---------- */

function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function showCopyFeedback(button: HTMLElement) {
  button.dataset.state = 'copied';
  const originalLabel = button.getAttribute('aria-label') ?? '';
  button.setAttribute('aria-label', 'Copied');
  announce('Copied to clipboard');
  window.setTimeout(() => {
    button.dataset.state = '';
    if (originalLabel) button.setAttribute('aria-label', originalLabel);
  }, COPY_FEEDBACK_MS);
}

async function handleCopyClick(button: HTMLElement) {
  const cite = button.getAttribute('data-cite');
  const targetId = button.getAttribute('data-lex-copy-target');
  const href = button.getAttribute('data-href');

  let payload = '';
  if (cite) {
    payload = cite;
  } else if (targetId) {
    const src = document.getElementById(targetId);
    if (src) payload = src.textContent?.trim() ?? '';
  } else if (href) {
    const origin = window.location.origin;
    payload = `${origin}${href}`;
  }
  if (!payload) return;
  const ok = await copyToClipboard(payload);
  if (ok) showCopyFeedback(button);
}

/* ---------- Print ---------- */

function onBeforePrint() {
  for (const entry of $entries()) {
    if (!entry.dataset.lexPrintWasClosed) {
      entry.dataset.lexPrintWasClosed = entry.open ? 'false' : 'true';
    }
    entry.open = true;
  }
}

function onAfterPrint() {
  for (const entry of $entries()) {
    if (entry.dataset.lexPrintWasClosed === 'true') entry.open = false;
    delete entry.dataset.lexPrintWasClosed;
  }
}

/* ---------- Event wiring ---------- */

function wire() {
  const root = $pageRoot();
  if (!root || root.dataset.lexPageWired === 'true') return;
  root.dataset.lexPageWired = 'true';

  /* Fresh controller per wire() call. `unwire()` aborts it to detach
     every listener registered below in one step. */
  controller = new AbortController();
  const { signal } = controller;

  /* Restore state from URL, then mirror it into the DOM. */
  state = readStateFromUrl();
  const filterInput = $filter();
  if (filterInput) {
    filterInput.value = state.q;
    filterInput.addEventListener('input', onFilterInput, { signal });
  }
  for (const chip of $chips()) {
    chip.addEventListener('click', () => onChipClick(chip), { signal });
  }
  updateChipsUi();
  applyFilter({ pushUrl: false });

  document.addEventListener('keydown', onKeydown, { signal });

  const resetBtn = document.querySelector<HTMLButtonElement>('[data-lex-reset]');
  if (resetBtn) {
    resetBtn.addEventListener(
      'click',
      () => {
        state.q = '';
        state.categories.clear();
        if (filterInput) filterInput.value = '';
        updateChipsUi();
        applyFilter({ pushUrl: true });
        if (filterInput) filterInput.focus();
      },
      { signal },
    );
  }

  /* Copy buttons — citation and permalink copies. Use event
     delegation to pick up buttons inside details panels without
     re-binding when a panel is opened. */
  root.addEventListener(
    'click',
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLElement>(
        '[data-lex-copy-cite], [data-lex-copy-link], [data-lex-copy-target]',
      );
      if (btn) {
        e.preventDefault();
        handleCopyClick(btn);
      }
    },
    { signal },
  );

  initScrollSpy();
  openAndPulseHashTarget();

  /* Popstate restores URL-driven state on back/forward. */
  window.addEventListener(
    'popstate',
    () => {
      state = readStateFromUrl();
      if (filterInput) filterInput.value = state.q;
      updateChipsUi();
      applyFilter({ pushUrl: false });
    },
    { signal },
  );

  /* Hash change on same page — re-open and pulse the new target. */
  window.addEventListener('hashchange', openAndPulseHashTarget, { signal });

  /* Print integration. */
  window.addEventListener('beforeprint', onBeforePrint, { signal });
  window.addEventListener('afterprint', onAfterPrint, { signal });
}

function unwire() {
  const root = $pageRoot();
  if (!root) return;
  root.dataset.lexPageWired = '';
  /* Single-call teardown for every listener wired above. */
  controller?.abort();
  controller = null;
  if (scrollSpy) {
    scrollSpy.disconnect();
    scrollSpy = null;
  }
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
}

/* Re-initialize on Astro view-transition swaps so the next /lexicon/
   visit in the same session picks up fresh DOM. */
document.addEventListener('astro:before-swap', unwire);
document.addEventListener('astro:page-load', () => {
  if ($pageRoot()) wire();
});

init();
