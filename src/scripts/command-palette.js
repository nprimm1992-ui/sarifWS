/**
 * Command palette runtime.
 *
 * Surface is authored in src/components/CommandPalette.astro; this
 * module owns state + behaviour:
 *   - Global shortcuts (Cmd/Ctrl+K, `/`, or `[data-command-palette-trigger]`).
 *   - Lazy fetch of /search-index.json on first open; in-memory cache
 *     keyed to the document's build id so a deploy invalidates safely.
 *   - Token-intersection scoring with per-field weights.
 *   - Scope filtering (all / praxis / lexicon / engagement / page)
 *     with live per-scope counts.
 *   - Keyboard nav:
 *       ↑ ↓ Home End   — move virtual selection across results.
 *       Enter          — open selected result (Cmd/Ctrl+Enter = new tab).
 *       Tab            — cycle real focus input ↔ scope toolbar.
 *       ← → inside toolbar — switch scope (roving tabindex, live apply).
 *       Escape         — close, return focus to trigger.
 *   - Query highlighting in titles via a DOM-safe <mark> fragment
 *     builder (never sets innerHTML on untrusted content).
 *   - Empty / loading / populated states driven by hidden attributes.
 *
 * Performance:
 *   - Index is < 50 KB compressed; in-memory search is O(n) per
 *     keystroke with n well under 100. A prefix trie would add
 *     complexity without measurable benefit.
 *
 * Accessibility:
 *   - Combobox + listbox per ARIA APG 1.2. aria-activedescendant
 *     drives the SR-visible selection so the user keeps typing.
 *   - Scope buttons follow the radio-in-toolbar pattern — exactly
 *     one is pressed; arrow keys move + activate.
 *   - Result <a>s carry tabindex="-1" to stay out of the Tab ring;
 *     Enter and click both activate; middle/Cmd/Ctrl-click fall
 *     through to native browser behaviour (new tab / window).
 */

const INDEX_URL = '/search-index.json';
const MAX_RESULTS = 30;

/* Build-id fetch. Document stamp wins for the URL version token;
   the server-returned `buildId` inside the payload invalidates the
   in-memory cache if CDN edges drift out of sync with the document. */
function currentBuildId() {
  if (typeof document === 'undefined') return 'dev';
  const meta = document.querySelector('meta[name="build"]');
  const content = meta?.getAttribute('content');
  return content && content.length > 0 ? content : 'dev';
}

const TYPE_ORDER = ['praxis', 'lexicon', 'engagement', 'page'];
const TYPE_LABELS = {
  praxis: 'Praxis',
  lexicon: 'Lexicon',
  engagement: 'Engagements',
  page: 'Pages',
};
const TYPE_GLYPHS = {
  praxis: 'P',
  lexicon: 'L',
  engagement: 'E',
  page: '§',
};
const FIELD_WEIGHTS = { title: 3, tags: 2, summary: 1 };

/** @typedef {{id: string, type: string, title: string, url: string, summary: string, tags: string[], meta: Record<string, unknown>}} IndexItem */

/** @type {IndexItem[] | null} */
let _index = null;
/** @type {Promise<IndexItem[]> | null} */
let _indexLoadPromise = null;
let _indexBuildId = null;
/** @type {HTMLElement | null} */
let _root = null;
/** @type {HTMLInputElement | null} */
let _input = null;
/** @type {HTMLElement | null} */
let _results = null;
/** @type {HTMLElement | null} */
let _empty = null;
/** @type {HTMLElement | null} */
let _count = null;
/** @type {HTMLButtonElement | null} */
let _clearBtn = null;
/** @type {HTMLElement | null} */
let _scopesEl = null;
/** @type {HTMLButtonElement[]} */
let _scopeButtons = [];
/** @type {HTMLElement | null} */
let _returnFocusEl = null;
/** @type {IndexItem[]} */
let _currentMatches = [];
let _selectedIndex = 0;
let _bound = false;
/** Active scope; 'all' means no filter. */
let _scope = 'all';

function queryRoot() {
  if (_root && document.body.contains(_root)) return _root;
  const el = document.getElementById('command-palette');
  if (!(el instanceof HTMLElement)) return null;
  _root = el;
  const input = el.querySelector('[data-command-palette-input]');
  const results = el.querySelector('[data-command-palette-results]');
  const empty = el.querySelector('[data-command-palette-empty]');
  const count = el.querySelector('[data-command-palette-count]');
  const clear = el.querySelector('[data-command-palette-clear]');
  const scopes = el.querySelector('[data-command-palette-scopes]');
  _input = input instanceof HTMLInputElement ? input : null;
  _results = results instanceof HTMLElement ? results : null;
  _empty = empty instanceof HTMLElement ? empty : null;
  _count = count instanceof HTMLElement ? count : null;
  _clearBtn = clear instanceof HTMLButtonElement ? clear : null;
  _scopesEl = scopes instanceof HTMLElement ? scopes : null;
  _scopeButtons = _scopesEl
    ? Array.from(_scopesEl.querySelectorAll('button[data-scope]')).filter(
        (b) => b instanceof HTMLButtonElement,
      )
    : [];
  return el;
}

async function ensureIndex() {
  const buildId = currentBuildId();
  if (_index && _indexBuildId !== buildId) {
    _index = null;
  }
  if (_index) return _index;
  if (_indexLoadPromise) return _indexLoadPromise;
  const fetchUrl = `${INDEX_URL}?v=${encodeURIComponent(buildId)}`;
  _indexLoadPromise = (async () => {
    try {
      const res = await fetch(fetchUrl, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : [];
      _index = items;
      _indexBuildId =
        typeof json?.buildId === 'string' && json.buildId.length > 0
          ? json.buildId
          : buildId;
      return items;
    } catch (err) {
      console.warn('[command-palette] failed to load search index', err);
      _index = [];
      _indexBuildId = buildId;
      return [];
    } finally {
      _indexLoadPromise = null;
    }
  })();
  return _indexLoadPromise;
}

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreItem(item, queryTokens) {
  if (!queryTokens.length) return 0;
  const titleTokens = tokenize(item.title);
  const tagTokens = Array.isArray(item.tags) ? tokenize(item.tags.join(' ')) : [];
  const summaryTokens = tokenize(item.summary);
  let score = 0;
  for (const qt of queryTokens) {
    let tokenScore = 0;
    for (const tt of titleTokens) {
      if (tt === qt) tokenScore += 3 * FIELD_WEIGHTS.title;
      else if (tt.startsWith(qt)) tokenScore += 2 * FIELD_WEIGHTS.title;
      else if (tt.includes(qt)) tokenScore += 1 * FIELD_WEIGHTS.title;
    }
    for (const tt of tagTokens) {
      if (tt === qt) tokenScore += 2 * FIELD_WEIGHTS.tags;
      else if (tt.startsWith(qt)) tokenScore += 1 * FIELD_WEIGHTS.tags;
    }
    for (const tt of summaryTokens) {
      if (tt === qt) tokenScore += 1 * FIELD_WEIGHTS.summary;
      else if (tt.startsWith(qt)) tokenScore += 0.5 * FIELD_WEIGHTS.summary;
    }
    /* AND semantics: every query token must match somewhere or the
       item is dropped. A fuzzy OR mode would generate noise at this
       dataset size. */
    if (tokenScore === 0) return 0;
    score += tokenScore;
  }
  return score;
}

/**
 * Compute the full match set for the current query, before scope
 * filtering. Returns items ranked by score, capped to a generous
 * ceiling so the scope-filtered subset always has headroom.
 */
function computeAllMatches(query) {
  const tokens = tokenize(query);
  if (!tokens.length) {
    /* Empty-query curated default: a cross-section so the first-run
       view isn't just the first N praxis articles. */
    const praxis = (_index ?? []).filter((i) => i.type === 'praxis').slice(0, 8);
    const lexicon = (_index ?? []).filter((i) => i.type === 'lexicon').slice(0, 6);
    const pages = (_index ?? []).filter((i) => i.type === 'page').slice(0, 6);
    return [...praxis, ...lexicon, ...pages];
  }
  const scored = [];
  for (const item of _index ?? []) {
    const s = scoreItem(item, tokens);
    if (s > 0) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.item);
}

function applyScope(items) {
  if (_scope === 'all') return items.slice(0, MAX_RESULTS);
  return items.filter((i) => i.type === _scope).slice(0, MAX_RESULTS);
}

/* ------------------------------------------------------------------ *
 *  Rendering                                                         *
 * ------------------------------------------------------------------ */

/**
 * Build a DocumentFragment that renders `text` with any occurrence of
 * a query token wrapped in <mark>. Uses textContent on every node —
 * no innerHTML — so arbitrary content is always safely escaped.
 */
function buildHighlightedFragment(text, tokens) {
  const frag = document.createDocumentFragment();
  const str = String(text ?? '');
  if (!str) return frag;
  const clean = tokens.filter(Boolean);
  if (clean.length === 0) {
    frag.appendChild(document.createTextNode(str));
    return frag;
  }
  const pattern = clean
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  let re;
  try {
    re = new RegExp(`(${pattern})`, 'gi');
  } catch {
    frag.appendChild(document.createTextNode(str));
    return frag;
  }
  let lastIdx = 0;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > lastIdx) {
      frag.appendChild(document.createTextNode(str.slice(lastIdx, m.index)));
    }
    const mark = document.createElement('mark');
    mark.className = 'command-palette__mark';
    mark.textContent = m[0];
    frag.appendChild(mark);
    lastIdx = re.lastIndex;
    /* Guard against zero-width matches causing an infinite loop. */
    if (re.lastIndex === m.index) re.lastIndex += 1;
  }
  if (lastIdx < str.length) {
    frag.appendChild(document.createTextNode(str.slice(lastIdx)));
  }
  return frag;
}

function metaLineFor(item) {
  const meta = item.meta || {};
  if (item.type === 'praxis') {
    const parts = [];
    if (meta.lens) parts.push(String(meta.lens));
    if (meta.horizon) parts.push(String(meta.horizon));
    if (meta.phase) parts.push(String(meta.phase));
    return parts.join(' · ');
  }
  if (item.type === 'lexicon') {
    const parts = [];
    if (meta.num) parts.push(`L-${String(meta.num).padStart(2, '0')}`);
    if (meta.category) parts.push(String(meta.category).toUpperCase());
    return parts.join(' · ');
  }
  if (item.type === 'engagement') {
    const parts = [];
    if (meta.num) parts.push(`E-${String(meta.num).padStart(2, '0')}`);
    if (meta.accent) parts.push(String(meta.accent).toUpperCase());
    return parts.join(' · ');
  }
  return '';
}

function badgeFor(item) {
  if (item.type !== 'lexicon') return null;
  const cat = item?.meta?.category;
  return typeof cat === 'string' && cat.length > 0 ? cat : null;
}

function render(matches, queryTokens) {
  _currentMatches = matches;
  if (!_results || !_input) return;
  _results.innerHTML = '';

  if (matches.length === 0) {
    _empty?.removeAttribute('hidden');
    _input.setAttribute('aria-expanded', 'false');
    _input.removeAttribute('aria-activedescendant');
    return;
  }
  _empty?.setAttribute('hidden', '');
  _input.setAttribute('aria-expanded', 'true');

  /* Group by type only when the active scope is "all"; otherwise
     results are already homogeneous and grouping adds clutter. */
  const shouldGroup = _scope === 'all';
  const grouped = new Map();
  if (shouldGroup) {
    for (const m of matches) {
      if (!grouped.has(m.type)) grouped.set(m.type, []);
      grouped.get(m.type).push(m);
    }
  }

  const groups = shouldGroup
    ? TYPE_ORDER.map((t) => ({ type: t, items: grouped.get(t) ?? [] })).filter(
        (g) => g.items.length > 0,
      )
    : [{ type: _scope, items: matches }];

  let globalIndex = 0;
  for (const group of groups) {
    if (shouldGroup) {
      const heading = document.createElement('li');
      heading.className = 'command-palette__section';
      heading.setAttribute('role', 'presentation');
      heading.textContent = TYPE_LABELS[group.type] ?? group.type;
      _results.appendChild(heading);
    }
    for (const item of group.items) {
      _results.appendChild(renderItem(item, globalIndex, queryTokens));
      globalIndex += 1;
    }
  }
  highlightSelected();
}

function renderItem(item, index, queryTokens) {
  const li = document.createElement('li');
  li.setAttribute('role', 'presentation');

  const a = document.createElement('a');
  a.setAttribute('role', 'option');
  a.id = `command-palette-opt-${index}`;
  a.href = item.url;
  a.dataset.url = item.url;
  a.dataset.index = String(index);
  a.className = 'command-palette__item';
  /* Keep result anchors out of the Tab ring — Tab moves between the
     input and the scope toolbar. Results are navigated via the
     virtual aria-activedescendant pattern. Anchors remain in the
     accessibility tree and receive click/Enter naturally. */
  a.tabIndex = -1;
  a.setAttribute('aria-selected', index === _selectedIndex ? 'true' : 'false');

  const glyph = document.createElement('span');
  glyph.className = 'command-palette__item-glyph';
  glyph.dataset.type = item.type;
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = TYPE_GLYPHS[item.type] ?? '•';
  a.appendChild(glyph);

  const body = document.createElement('div');
  body.className = 'command-palette__item-body';

  const title = document.createElement('div');
  title.className = 'command-palette__item-title';
  const titleText = document.createElement('span');
  titleText.className = 'command-palette__item-title-text';
  titleText.appendChild(buildHighlightedFragment(item.title, queryTokens));
  title.appendChild(titleText);
  const badge = badgeFor(item);
  if (badge) {
    const badgeEl = document.createElement('span');
    badgeEl.className = 'command-palette__item-badge';
    badgeEl.textContent = badge;
    title.appendChild(badgeEl);
  }
  body.appendChild(title);

  const summary = document.createElement('p');
  summary.className = 'command-palette__item-summary';
  summary.appendChild(buildHighlightedFragment(item.summary, queryTokens));
  body.appendChild(summary);

  const meta = metaLineFor(item);
  if (meta) {
    const metaEl = document.createElement('div');
    metaEl.className = 'command-palette__item-meta';
    metaEl.textContent = meta;
    body.appendChild(metaEl);
  }

  a.appendChild(body);

  const enter = document.createElement('span');
  enter.className = 'command-palette__item-enter';
  enter.setAttribute('aria-hidden', 'true');
  enter.textContent = '↵';
  a.appendChild(enter);

  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
      close();
      return;
    }
    e.preventDefault();
    navigateTo(item.url, false);
  });

  li.appendChild(a);
  return li;
}

function highlightSelected() {
  if (!_results || !_input) return;
  const options = _results.querySelectorAll('[role="option"]');
  if (options.length === 0) {
    _input.removeAttribute('aria-activedescendant');
    return;
  }
  if (_selectedIndex < 0) _selectedIndex = 0;
  if (_selectedIndex >= options.length) _selectedIndex = options.length - 1;
  for (const opt of options) {
    if (!(opt instanceof HTMLElement)) continue;
    const idx = Number(opt.dataset.index ?? '-1');
    const selected = idx === _selectedIndex;
    opt.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) {
      _input.setAttribute('aria-activedescendant', opt.id);
      opt.scrollIntoView({ block: 'nearest' });
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Status line + scope counts                                        *
 * ------------------------------------------------------------------ */

function updateStatus(query, allMatches, scopedMatches) {
  if (!_count) return;
  const trimmed = query.trim();
  if (!trimmed) {
    _count.textContent = '';
    return;
  }
  const all = allMatches.length;
  const scoped = scopedMatches.length;
  if (_scope === 'all') {
    _count.textContent = all === 1 ? '1 MATCH' : `${all} MATCHES`;
  } else {
    _count.textContent = `${scoped}/${all} IN SCOPE`;
  }
}

function updateScopeCounts(allMatches) {
  if (_scopeButtons.length === 0) return;
  const counts = {
    all: allMatches.length,
    praxis: 0,
    lexicon: 0,
    engagement: 0,
    page: 0,
  };
  for (const m of allMatches) {
    if (counts[m.type] !== undefined) counts[m.type] += 1;
  }
  for (const btn of _scopeButtons) {
    const scope = btn.dataset.scope || 'all';
    const countEl = btn.querySelector('.command-palette__scope-count');
    if (!(countEl instanceof HTMLElement)) continue;
    const n = counts[scope] ?? 0;
    /* Hide the count slot entirely for "all" when the index is empty
       so the chip doesn't read "All 0" during the initial fetch. */
    if (n === 0 && scope === 'all') {
      countEl.textContent = '';
    } else {
      countEl.textContent = String(n);
    }
  }
}

function updateClearVisibility() {
  if (!_input || !_clearBtn) return;
  const hasValue = _input.value.length > 0;
  if (hasValue) _clearBtn.removeAttribute('hidden');
  else _clearBtn.setAttribute('hidden', '');
}

/* ------------------------------------------------------------------ *
 *  Main search entry-point                                           *
 * ------------------------------------------------------------------ */

function runSearch() {
  if (!_input) return;
  const query = _input.value;
  const tokens = tokenize(query);
  const allMatches = computeAllMatches(query);
  const scoped = applyScope(allMatches);
  updateScopeCounts(allMatches);
  updateStatus(query, allMatches, scoped);
  updateClearVisibility();
  _selectedIndex = 0;
  render(scoped, tokens);
}

/* ------------------------------------------------------------------ *
 *  Scope state                                                       *
 * ------------------------------------------------------------------ */

function setScope(next, opts = { focus: false }) {
  if (!_scopeButtons.length) return;
  const target = _scopeButtons.find((b) => b.dataset.scope === next);
  if (!target) return;
  _scope = next;
  for (const btn of _scopeButtons) {
    const pressed = btn.dataset.scope === next;
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    btn.tabIndex = pressed ? 0 : -1;
  }
  if (opts.focus) target.focus();
  runSearch();
}

function activeScopeIndex() {
  return Math.max(
    0,
    _scopeButtons.findIndex((b) => b.dataset.scope === _scope),
  );
}

/* ------------------------------------------------------------------ *
 *  Navigation                                                        *
 * ------------------------------------------------------------------ */

function navigateTo(url, newTab) {
  close();
  if (newTab) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = url;
  }
}

function activateSelected(newTab) {
  const item = _currentMatches[_selectedIndex];
  if (!item) return;
  navigateTo(item.url, newTab);
}

/* ------------------------------------------------------------------ *
 *  Open / close / inert                                              *
 * ------------------------------------------------------------------ */

const BACKGROUND_SELECTOR = '#perspective-root, main';

function setBackgroundInert(value) {
  const nodes = document.querySelectorAll(BACKGROUND_SELECTOR);
  nodes.forEach((n) => {
    if (!(n instanceof HTMLElement)) return;
    if (value) n.setAttribute('inert', '');
    else n.removeAttribute('inert');
  });
}

function open() {
  const root = queryRoot();
  if (!root || !_input) return;
  _returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.removeAttribute('hidden');
  root.setAttribute('aria-hidden', 'false');
  _input.value = '';
  _selectedIndex = 0;
  /* Reset scope to "all" on every open so the user gets a predictable
     full-index starting point. Persisting scope across opens sounds
     cleaner in theory but surprises repeat visitors who expect their
     previous narrow scope to have been intentional-for-that-session. */
  setScope('all');
  ensureIndex().then(() => {
    runSearch();
  });
  requestAnimationFrame(() => _input?.focus());
  document.documentElement.classList.add('command-palette-open');
  setBackgroundInert(true);
}

function close() {
  const root = queryRoot();
  if (!root) return;
  root.setAttribute('hidden', '');
  root.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('command-palette-open');
  setBackgroundInert(false);
  if (_input) {
    _input.removeAttribute('aria-activedescendant');
    _input.setAttribute('aria-expanded', 'false');
  }
  if (_count) _count.textContent = '';
  if (_returnFocusEl && document.body.contains(_returnFocusEl)) {
    _returnFocusEl.focus();
  }
  _returnFocusEl = null;
}

function isOpen() {
  const root = queryRoot();
  return Boolean(root && !root.hasAttribute('hidden'));
}

function isTypingContext(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 *  Event handlers                                                    *
 * ------------------------------------------------------------------ */

function isScopeFocused() {
  const active = document.activeElement;
  return active instanceof HTMLElement && _scopeButtons.includes(active);
}

function onGlobalKeydown(e) {
  /* Open triggers. */
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (isOpen()) close();
    else open();
    return;
  }
  if (e.key === '/' && !isTypingContext(e.target) && !isOpen()) {
    e.preventDefault();
    open();
    return;
  }
  if (!isOpen()) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }

  /* Tab cycling between the input and the scope toolbar. Real focus
     lives in exactly one of those two places at any given time. */
  if (e.key === 'Tab') {
    e.preventDefault();
    if (isScopeFocused()) {
      _input?.focus();
    } else {
      const idx = activeScopeIndex();
      _scopeButtons[idx]?.focus();
    }
    return;
  }

  /* When focus is inside the scope toolbar, arrow keys move+activate
     and Home/End jump to the ends. Defer to the scope handler so we
     don't also trigger result navigation. */
  if (isScopeFocused()) {
    const count = _scopeButtons.length;
    const idx = activeScopeIndex();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (idx + 1) % count;
      const nextScope = _scopeButtons[nextIdx]?.dataset.scope;
      if (nextScope) setScope(nextScope, { focus: true });
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (idx - 1 + count) % count;
      const prevScope = _scopeButtons[prevIdx]?.dataset.scope;
      if (prevScope) setScope(prevScope, { focus: true });
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      const s = _scopeButtons[0]?.dataset.scope;
      if (s) setScope(s, { focus: true });
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      const s = _scopeButtons[count - 1]?.dataset.scope;
      if (s) setScope(s, { focus: true });
      return;
    }
    /* Enter/Space on a scope button: already handled by native
       button activation via the click listener below. */
  }

  /* Results navigation — only when the input has real focus. If the
     user explicitly tabbed into the scope toolbar, arrows belong to
     scope navigation (handled above). */
  const hasMatches = _currentMatches.length > 0;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!hasMatches) return;
    _selectedIndex = Math.min(_selectedIndex + 1, _currentMatches.length - 1);
    highlightSelected();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!hasMatches) return;
    _selectedIndex = Math.max(_selectedIndex - 1, 0);
    highlightSelected();
    return;
  }
  if (e.key === 'Home' && document.activeElement === _input) {
    /* Let Home work in the input normally unless the caret is at the
       start already and results are visible — the shortcut is most
       useful there. Simpler: do nothing special; users can Cmd/Ctrl+Home
       the list via ArrowUp repeatedly if needed. */
    return;
  }
  if (e.key === 'End' && document.activeElement === _input) {
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    activateSelected(e.metaKey || e.ctrlKey);
    return;
  }
}

function onInput() {
  if (!_input) return;
  runSearch();
}

function onBackdropClick(e) {
  const target = e.target;
  if (target instanceof Element && target.hasAttribute('data-command-palette-close')) {
    close();
  }
}

function onScopeClick(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest('button[data-scope]');
  if (!(btn instanceof HTMLButtonElement)) return;
  const scope = btn.dataset.scope;
  if (!scope) return;
  /* Preserve whichever element had focus before the click — if the
     user clicked with the mouse from the input, don't steal focus. */
  const cameFromInput = document.activeElement === _input;
  setScope(scope, { focus: !cameFromInput });
}

function onClearClick() {
  if (!_input) return;
  _input.value = '';
  _input.focus();
  runSearch();
}

function onTriggerClick(e) {
  const target = e.target;
  if (target instanceof Element && target.closest('[data-command-palette-trigger]')) {
    e.preventDefault();
    open();
  }
}

export function initCommandPalette() {
  const root = queryRoot();
  if (!root) return;
  if (_bound) return;
  _bound = true;
  window.addEventListener('keydown', onGlobalKeydown);
  _input?.addEventListener('input', onInput);
  root.addEventListener('click', onBackdropClick);
  document.addEventListener('click', onTriggerClick);
  _scopesEl?.addEventListener('click', onScopeClick);
  _clearBtn?.addEventListener('click', onClearClick);
}

/* ClientRouter navigations tear down the DOM; rebind after swap. */
if (typeof document !== 'undefined') {
  document.addEventListener('astro:before-swap', () => {
    if (isOpen()) close();
    _bound = false;
    _root = null;
    _input = null;
    _results = null;
    _empty = null;
    _count = null;
    _clearBtn = null;
    _scopesEl = null;
    _scopeButtons = [];
  });
}
