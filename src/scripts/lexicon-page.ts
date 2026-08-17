/**
 * lexicon-page — client-side island for /lexicon/.
 *
 * With the flat register removed, the Atlas is the sole surface. This
 * island owns the filter input and category chips (both rendered inside
 * the Atlas component), derives the visible node set from Atlas nodes,
 * and dispatches `lexicon:filter` so the Atlas runtime can hide/show
 * nodes and re-fit its camera.
 *
 * Responsibilities:
 *   1. Filter input — debounced, matches node term, category, and
 *      definition substrings. Live-region reports result count.
 *   2. Category chips — multi-select. "All" chip resets the set.
 *   3. URL state — `?q=` and `?cat=` are serialized on change and
 *      restored on load + history back/forward.
 *   4. Keyboard — `/` focuses filter, `Esc` clears it.
 *   5. Copy actions — citation and permalink buttons inside the
 *      Atlas inspector cards.
 *
 * Single-file island; no external dependencies.
 */

export {};

type AtlasNodeEl = HTMLAnchorElement & {
  dataset: DOMStringMap & {
    node?: string;
    cat?: string;
    catLabel?: string;
    term?: string;
    def?: string;
    num?: string;
  };
};

type ControlState = {
  q: string;
  categories: Set<string>;
};

const FILTER_DEBOUNCE_MS = 120;
const CATEGORY_ALL = 'all';
const COPY_FEEDBACK_MS = 1800;

let state: ControlState = { q: '', categories: new Set<string>() };
let debounceTimer: number | null = null;
let controller: AbortController | null = null;

/* ---------- DOM accessors ---------- */
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
function $nodes(): AtlasNodeEl[] {
  return Array.from(document.querySelectorAll<AtlasNodeEl>('[data-node]'));
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

function matchesFilter(node: AtlasNodeEl, q: string, cats: Set<string>): boolean {
  if (cats.size > 0) {
    const nodeCat = node.dataset.cat ?? '';
    if (!cats.has(nodeCat)) return false;
  }
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = [
    node.dataset.term ?? '',
    node.dataset.catLabel ?? '',
    node.dataset.num ?? '',
    node.dataset.def ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

function applyFilter(opts: { pushUrl?: boolean } = {}) {
  const nodes = $nodes();
  const { q, categories } = state;

  let visibleCount = 0;
  const visibleIds: string[] = [];

  for (const node of nodes) {
    const matches = matchesFilter(node, q, categories);
    if (matches) {
      visibleCount++;
      const id = node.dataset.node;
      if (id) visibleIds.push(id);
    }
  }

  const total = nodes.length;
  const countEl = $count();
  if (countEl) countEl.textContent = `${visibleCount} of ${total}`;

  if (opts.pushUrl) writeStateToUrl(false);

  document.dispatchEvent(
    new CustomEvent('lexicon:filter', {
      detail: { q, categories: Array.from(categories), visibleIds },
    }),
  );

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
    if (filterInput && document.activeElement === filterInput) {
      if (filterInput.value) {
        clearFilter();
      } else {
        filterInput.blur();
      }
    }
    return;
  }
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

/* ---------- Event wiring ---------- */

function wire() {
  const root = $pageRoot();
  if (!root || root.dataset.lexPageWired === 'true') return;
  root.dataset.lexPageWired = 'true';

  controller = new AbortController();
  const { signal } = controller;

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
}

function unwire() {
  const root = $pageRoot();
  if (!root) return;
  root.dataset.lexPageWired = '';
  controller?.abort();
  controller = null;
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

document.addEventListener('astro:before-swap', unwire);
document.addEventListener('astro:page-load', () => {
  if ($pageRoot()) wire();
});

init();
