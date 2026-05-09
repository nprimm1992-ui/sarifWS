/**
 * P9d — RAG-lite Praxis assistant runtime.
 *
 * Binds to the PraxisAsk component. Responsibilities:
 *   - Lazy-load /search-index.json on first keystroke.
 *   - Restrict matching to type === 'praxis'.
 *   - Token-intersection scoring weighted by title > tags > summary.
 *   - Render the top 3 matches as accessible listbox options with
 *     excerpt + highlighted query terms.
 *   - Keyboard navigation (↑ ↓ Enter Escape Home End) on the listbox
 *     via aria-activedescendant; focus stays in the input.
 *   - Debounced query logging to /api/ask (at most once per 800ms of
 *     typing quiet time, and at most once per distinct query).
 *
 * Reliability:
 *   - The logging beacon is best-effort (keepalive) and never blocks
 *     the UI. A failed POST is silent.
 *   - If the index fetch fails, the UI shows a graceful error state
 *     and the user can still navigate the site via the command palette
 *     (Cmd+K) or regular nav.
 *
 * Accessibility:
 *   - ARIA APG "Combobox with Listbox Popup" v1.2 pattern.
 *   - Every result is a real <a> so right-click / new-tab works.
 *   - Query highlighting uses <mark>; no color-only encoding.
 */

const INDEX_URL = '/search-index.json';
const MAX_RESULTS = 3;

/** Round-4 §3.4 — document build stamp for cache-busting. */
function currentBuildId() {
  if (typeof document === 'undefined') return 'dev';
  const meta = document.querySelector('meta[name="build"]');
  const content = meta?.getAttribute('content');
  return content && content.length > 0 ? content : 'dev';
}
const DEBOUNCE_MS = 160;
const LOG_DEBOUNCE_MS = 800;
const MIN_QUERY_CHARS = 2;
const FIELD_WEIGHTS = { title: 3, tags: 2, summary: 1 };

/** @typedef {{id: string, type: string, title: string, url: string, summary: string, tags: string[], meta: Record<string, unknown>}} IndexItem */

/** @type {IndexItem[] | null} */
let _index = null;
/** @type {Promise<IndexItem[]> | null} */
let _indexLoadPromise = null;
/** Build id of the currently-cached index; used to cache-bust on deploy. */
let _indexBuildId = null;
/** True when the last index fetch failed — drives the retry surface. */
let _indexLoadFailed = false;
/** @type {HTMLElement | null} */
let _root = null;
/** @type {HTMLInputElement | null} */
let _input = null;
/** @type {HTMLElement | null} */
let _resultsEl = null;
/** @type {HTMLButtonElement | null} */
let _clearBtn = null;
/** @type {HTMLElement | null} */
let _statusEl = null;
/** @type {HTMLElement | null} */
let _comboEl = null;
let _renderTimer = 0;
let _logTimer = 0;
let _lastLoggedQuery = '';
/** @type {IndexItem[]} */
let _current = [];
let _selectedIndex = -1;
let _bound = false;

function queryDom() {
  const root = document.querySelector('[data-praxis-ask]');
  if (!(root instanceof HTMLElement)) return false;
  _root = root;
  const input = root.querySelector('[data-praxis-ask-input]');
  const results = root.querySelector('[data-praxis-ask-results]');
  const clear = root.querySelector('[data-praxis-ask-clear]');
  const status = root.querySelector('[data-praxis-ask-status]');
  _input = input instanceof HTMLInputElement ? input : null;
  _resultsEl = results instanceof HTMLElement ? results : null;
  _clearBtn = clear instanceof HTMLButtonElement ? clear : null;
  _statusEl = status instanceof HTMLElement ? status : null;
  /* Per ARIA APG 1.2 the input carries role="combobox"; point _comboEl
     at the same node so the aria-expanded updates land on the single
     authoritative owner. */
  _comboEl = _input;
  return Boolean(_input && _resultsEl);
}

async function ensureIndex() {
  const buildId = currentBuildId();
  /* Drop cache when the build id changes — keeps a long-lived tab in
     sync with the current deploy even when the CDN serves fresh. */
  if (_index && _indexBuildId !== buildId) {
    _index = null;
    _indexLoadFailed = false;
  }
  if (_index) return _index;
  if (_indexLoadPromise) return _indexLoadPromise;
  const fetchUrl = `${INDEX_URL}?v=${encodeURIComponent(buildId)}`;
  _indexLoadPromise = (async () => {
    try {
      const res = await fetch(fetchUrl, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : [];
      _index = items.filter((i) => i && i.type === 'praxis');
      _indexBuildId =
        typeof json?.buildId === 'string' && json.buildId.length > 0
          ? json.buildId
          : buildId;
      _indexLoadFailed = false;
      return _index;
    } catch (err) {
      console.warn('[praxis-ask] index load failed', err);
      _index = null;
      _indexBuildId = null;
      _indexLoadFailed = true;
      return [];
    } finally {
      _indexLoadPromise = null;
    }
  })();
  return _indexLoadPromise;
}

/** Manual retry entrypoint for the error-state button. Clears flags
 *  and kicks ensureIndex() followed by a re-render of the current
 *  query. Exposed to the DOM via a click handler on the retry button. */
async function retryIndex() {
  _indexLoadFailed = false;
  _index = null;
  _indexBuildId = null;
  await ensureIndex();
  if (_input) {
    const query = _input.value.trim();
    if (query.length >= MIN_QUERY_CHARS) {
      render(search(query), query);
    } else {
      render([], query);
    }
  }
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
    /* AND semantics across query tokens — same rationale as the
       command palette: two-word queries should not surface
       single-word matches. */
    if (tokenScore === 0) return 0;
    score += tokenScore;
  }
  return score;
}

function search(query) {
  const tokens = tokenize(query);
  if (!tokens.length || !_index) return [];
  const scored = [];
  for (const item of _index) {
    const s = scoreItem(item, tokens);
    if (s > 0) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map((x) => x.item);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(text, queryTokens) {
  if (!text) return '';
  const safe = escapeHtml(text);
  if (!queryTokens.length) return safe;
  /* Unique, sorted longest-first so a longer token masks a shorter
     sub-token (e.g. "coherence" wins over "co"). */
  const unique = [...new Set(queryTokens)].sort((a, b) => b.length - a.length);
  const pattern = unique
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!pattern) return safe;
  return safe.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

function setExpanded(expanded) {
  if (_comboEl) _comboEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (_resultsEl) _resultsEl.hidden = !expanded;
}

function updateClearVisibility() {
  if (!_clearBtn || !_input) return;
  _clearBtn.hidden = _input.value.length === 0;
}

function setStatus(msg) {
  if (_statusEl) _statusEl.textContent = msg;
}

function render(matches, query) {
  _current = matches;
  _selectedIndex = matches.length > 0 ? 0 : -1;
  if (!_resultsEl || !_input) return;
  _resultsEl.innerHTML = '';
  if (matches.length === 0) {
    if (_indexLoadFailed && query && query.length >= MIN_QUERY_CHARS) {
      /* Round-4 §3.4 — explicit error surface instead of silent empty
         state. A network blip (CDN timeout, captive portal, offline)
         would previously render "No results" and strand the user with
         no actionable signal. Give them a retry button and a clear
         fallback path to the full article list. */
      const errWrap = document.createElement('div');
      errWrap.className = 'praxis-ask__error';
      errWrap.setAttribute('role', 'alert');
      const msg = document.createElement('p');
      msg.className = 'praxis-ask__error-copy';
      msg.textContent =
        "We couldn't load the field-notes index. Check your connection and try again, or browse the full list below.";
      const actions = document.createElement('div');
      actions.className = 'praxis-ask__error-actions';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'praxis-ask__error-retry';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        retryIndex();
      });
      actions.appendChild(retry);
      errWrap.appendChild(msg);
      errWrap.appendChild(actions);
      _resultsEl.appendChild(errWrap);
      setExpanded(true);
      setStatus("Couldn't load index. Retry available.");
      _input.removeAttribute('aria-activedescendant');
      return;
    }
    if (query && query.length >= MIN_QUERY_CHARS) {
      const empty = document.createElement('p');
      empty.className = 'praxis-ask__empty';
      empty.textContent = 'No Praxis articles match that yet. Try a broader term or browse the list below.';
      _resultsEl.appendChild(empty);
      setExpanded(true);
      setStatus('No results');
    } else {
      setExpanded(false);
      setStatus('');
    }
    _input.removeAttribute('aria-activedescendant');
    return;
  }
  const tokens = tokenize(query);
  matches.forEach((item, idx) => {
    const a = document.createElement('a');
    a.id = `praxis-ask-opt-${idx}`;
    a.className = 'praxis-ask__result';
    a.href = item.url;
    a.setAttribute('role', 'option');
    a.setAttribute('aria-selected', idx === _selectedIndex ? 'true' : 'false');
    a.dataset.praxisAskResultId = item.id;
    const lens = item?.meta?.lens;
    const horizon = item?.meta?.horizon;
    const phase = item?.meta?.phase;
    const metaParts = [lens, horizon, phase].filter(Boolean).map(String);
    a.innerHTML = `
      <span class="praxis-ask__result-meta">${metaParts.map(escapeHtml).join(' · ')}</span>
      <p class="praxis-ask__result-title">${highlight(item.title, tokens)}</p>
      <p class="praxis-ask__result-summary">${highlight(item.summary, tokens)}</p>
    `;
    _resultsEl.appendChild(a);
  });
  setExpanded(true);
  _input.setAttribute('aria-activedescendant', `praxis-ask-opt-${_selectedIndex}`);
  setStatus(`${matches.length} result${matches.length === 1 ? '' : 's'}`);
}

function moveSelection(delta) {
  if (_current.length === 0) return;
  const next = (_selectedIndex + delta + _current.length) % _current.length;
  setSelection(next);
}

function setSelection(idx) {
  if (!_resultsEl || !_input) return;
  if (idx < 0 || idx >= _current.length) return;
  _selectedIndex = idx;
  const items = _resultsEl.querySelectorAll('[role="option"]');
  items.forEach((node, i) => {
    if (node instanceof HTMLElement) {
      node.setAttribute('aria-selected', i === idx ? 'true' : 'false');
      if (i === idx) {
        node.scrollIntoView({ block: 'nearest' });
      }
    }
  });
  _input.setAttribute('aria-activedescendant', `praxis-ask-opt-${idx}`);
}

function commitSelection() {
  if (_selectedIndex < 0 || _selectedIndex >= _current.length) return false;
  const item = _current[_selectedIndex];
  if (!item?.url) return false;
  /* Log the click as the "top result" so analytics can see which
     answer earned the engagement. Best-effort. */
  logQuery(_input?.value ?? '', _current.length, item.id, /*force*/ true);
  window.location.href = item.url;
  return true;
}

function logQuery(query, resultCount, topResultId, force = false) {
  const trimmed = String(query || '').trim();
  if (trimmed.length < MIN_QUERY_CHARS) return;
  if (!force && trimmed === _lastLoggedQuery) return;
  _lastLoggedQuery = trimmed;
  const payload = JSON.stringify({
    query: trimmed,
    result_count: resultCount,
    top_result: topResultId ?? null,
  });
  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon('/api/ask', blob)) return;
    }
    fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* Best-effort; never surface to the user. */
    });
  } catch {
    /* Ignore — telemetry must never affect UX. */
  }
}

async function onInput() {
  if (!_input) return;
  updateClearVisibility();
  const value = _input.value;
  await ensureIndex();
  if (_renderTimer) window.clearTimeout(_renderTimer);
  _renderTimer = window.setTimeout(() => {
    if (!_input) return;
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_CHARS) {
      render([], trimmed);
      return;
    }
    const matches = search(trimmed);
    render(matches, trimmed);
  }, DEBOUNCE_MS);

  if (_logTimer) window.clearTimeout(_logTimer);
  _logTimer = window.setTimeout(() => {
    const trimmed = value.trim();
    if (trimmed.length >= MIN_QUERY_CHARS) {
      const matches = search(trimmed);
      logQuery(trimmed, matches.length, matches[0]?.id ?? null);
    }
  }, LOG_DEBOUNCE_MS);
}

function onKeydown(evt) {
  if (!_input) return;
  switch (evt.key) {
    case 'ArrowDown':
      evt.preventDefault();
      moveSelection(1);
      break;
    case 'ArrowUp':
      evt.preventDefault();
      moveSelection(-1);
      break;
    case 'Home':
      if (_current.length > 0) {
        evt.preventDefault();
        setSelection(0);
      }
      break;
    case 'End':
      if (_current.length > 0) {
        evt.preventDefault();
        setSelection(_current.length - 1);
      }
      break;
    case 'Enter':
      if (_current.length > 0) {
        evt.preventDefault();
        commitSelection();
      }
      break;
    case 'Escape':
      if (_input.value.length > 0) {
        evt.preventDefault();
        clearQuery();
      }
      break;
    default:
      break;
  }
}

function clearQuery() {
  if (!_input) return;
  _input.value = '';
  _lastLoggedQuery = '';
  updateClearVisibility();
  render([], '');
  _input.focus();
}

function onResultsClick(evt) {
  const target = evt.target instanceof Element ? evt.target.closest('[role="option"]') : null;
  if (!(target instanceof HTMLAnchorElement)) return;
  /* Let the browser navigate normally (respect ctrl-click for new
     tab) — but log first. */
  const id = target.dataset.praxisAskResultId ?? null;
  logQuery(_input?.value ?? '', _current.length, id, /*force*/ true);
}

function bind() {
  if (_bound) return;
  if (!queryDom() || !_input || !_resultsEl) return;
  _bound = true;
  _input.addEventListener('input', onInput);
  _input.addEventListener('keydown', onKeydown);
  _resultsEl.addEventListener('click', onResultsClick);
  _clearBtn?.addEventListener('click', clearQuery);
  updateClearVisibility();
}

function teardown() {
  if (!_bound) return;
  if (_input) {
    _input.removeEventListener('input', onInput);
    _input.removeEventListener('keydown', onKeydown);
  }
  _resultsEl?.removeEventListener('click', onResultsClick);
  _clearBtn?.removeEventListener('click', clearQuery);
  if (_renderTimer) window.clearTimeout(_renderTimer);
  if (_logTimer) window.clearTimeout(_logTimer);
  _renderTimer = 0;
  _logTimer = 0;
  _root = null;
  _input = null;
  _resultsEl = null;
  _clearBtn = null;
  _statusEl = null;
  _comboEl = null;
  _current = [];
  _selectedIndex = -1;
  _lastLoggedQuery = '';
  _bound = false;
}

export function initPraxisAsk() {
  if (typeof window === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
  /* Astro view transitions swap the DOM out from under us. Unbind on
     before-swap and rebind after page-load so the handlers track the
     new markup instance. */
  document.addEventListener('astro:before-swap', teardown);
  document.addEventListener('astro:page-load', bind);
}
