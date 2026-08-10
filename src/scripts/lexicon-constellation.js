/**
 * Lexicon Constellation runtime — hover/focus neighbor highlighting
 * and the definition tooltip for the build-time-rendered SVG graph.
 *
 * The SVG itself is fully functional without this module (every node
 * is a plain <a href="#id"> whose hash arrival is handled by
 * lexicon-page.ts). This island only adds:
 *   - adjacency-based highlight: hovering/focusing a node dims the
 *     rest of the map and lights the touched edges + neighbor nodes,
 *   - a definition tooltip anchored above the active node,
 *   - Escape / pointerleave teardown.
 *
 * Follows the repo's island discipline: idempotent bind, teardown on
 * astro:before-swap, rebind on astro:page-load.
 */

let _bound = false;
let _root = null;
let _viewport = null;
let _tip = null;
/** @type {Map<string, Set<string>>} node id → neighbor ids */
let _adjacency = new Map();
let _abort = null;

function buildAdjacency() {
  _adjacency = new Map();
  const edges = _root.querySelectorAll('[data-edge-a]');
  for (const edge of edges) {
    const a = edge.getAttribute('data-edge-a');
    const b = edge.getAttribute('data-edge-b');
    if (!a || !b) continue;
    if (!_adjacency.has(a)) _adjacency.set(a, new Set());
    if (!_adjacency.has(b)) _adjacency.set(b, new Set());
    _adjacency.get(a).add(b);
    _adjacency.get(b).add(a);
  }
}

function clearFocus() {
  if (!_root) return;
  delete _root.dataset.focus;
  for (const el of _root.querySelectorAll('.is-hot, .is-origin')) {
    el.classList.remove('is-hot', 'is-origin');
  }
  if (_tip) _tip.hidden = true;
}

function setFocus(nodeEl) {
  if (!_root || !(nodeEl instanceof Element)) return;
  const id = nodeEl.getAttribute('data-node');
  if (!id) return;
  clearFocus();
  _root.dataset.focus = id;

  const neighbors = _adjacency.get(id) ?? new Set();
  nodeEl.classList.add('is-hot', 'is-origin');
  for (const node of _root.querySelectorAll('[data-node]')) {
    const nid = node.getAttribute('data-node');
    if (nid && neighbors.has(nid)) node.classList.add('is-hot');
  }
  for (const edge of _root.querySelectorAll('[data-edge-a]')) {
    const a = edge.getAttribute('data-edge-a');
    const b = edge.getAttribute('data-edge-b');
    if (a === id || b === id) edge.classList.add('is-hot');
  }

  showTip(nodeEl);
}

function showTip(nodeEl) {
  if (!_tip || !_viewport) return;
  const term = nodeEl.getAttribute('data-term') ?? '';
  const def = nodeEl.getAttribute('data-def') ?? '';
  const num = nodeEl.getAttribute('data-num') ?? '';
  const cat = nodeEl.getAttribute('data-cat-label') ?? '';

  _tip.querySelector('[data-lex-map-tip-term]').textContent = term;
  _tip.querySelector('[data-lex-map-tip-def]').textContent = def;
  _tip.querySelector('[data-lex-map-tip-num]').textContent = num ? `L-${num}` : '';
  _tip.querySelector('[data-lex-map-tip-cat]').textContent = cat;

  const nodeRect = nodeEl.getBoundingClientRect();
  const vpRect = _viewport.getBoundingClientRect();
  const cx = nodeRect.left + nodeRect.width / 2 - vpRect.left + _viewport.scrollLeft;
  const top = nodeRect.top - vpRect.top;

  _tip.hidden = false;
  /* Clamp horizontally so the tooltip never clips the panel edge.
     Measured after unhide so offsetWidth is real. */
  const half = _tip.offsetWidth / 2;
  const clampedX = Math.max(half + 8, Math.min(_viewport.scrollWidth - half - 8, cx));
  _tip.style.left = `${clampedX}px`;
  if (top - _tip.offsetHeight - 18 < 0) {
    /* Not enough headroom — flip below the node. */
    _tip.style.top = `${top + nodeRect.height + 6}px`;
    _tip.style.transform = 'translate(-50%, 0)';
  } else {
    _tip.style.top = `${top}px`;
    _tip.style.transform = 'translate(-50%, calc(-100% - 14px))';
  }
}

function onOver(evt) {
  const node = evt.target instanceof Element ? evt.target.closest('[data-node]') : null;
  if (node) setFocus(node);
}

function onOut(evt) {
  const node = evt.target instanceof Element ? evt.target.closest('[data-node]') : null;
  if (!node) return;
  const to = evt.relatedTarget instanceof Element ? evt.relatedTarget.closest('[data-node]') : null;
  if (!to) clearFocus();
}

function onKeydown(evt) {
  if (evt.key === 'Escape') clearFocus();
}

function bind() {
  if (_bound) return;
  const root = document.querySelector('[data-lex-map]');
  if (!(root instanceof HTMLElement)) return;
  _root = root;
  _viewport = root.querySelector('[data-lex-map-viewport]');
  _tip = root.querySelector('[data-lex-map-tip]');
  if (!_viewport || !_tip) return;
  buildAdjacency();

  _abort = new AbortController();
  const { signal } = _abort;
  root.addEventListener('pointerover', onOver, { signal });
  root.addEventListener('pointerout', onOut, { signal });
  root.addEventListener('focusin', onOver, { signal });
  root.addEventListener('focusout', onOut, { signal });
  root.addEventListener('keydown', onKeydown, { signal });
  /* Node click = hash navigation to the entry below; the tooltip
     would otherwise linger over the scrolled view. */
  root.addEventListener('click', (evt) => {
    const node = evt.target instanceof Element ? evt.target.closest('[data-node]') : null;
    if (node) clearFocus();
  }, { signal });
  _bound = true;
}

function teardown() {
  if (!_bound) return;
  _abort?.abort();
  _abort = null;
  clearFocus();
  _root = null;
  _viewport = null;
  _tip = null;
  _adjacency = new Map();
  _bound = false;
}

export function initLexiconConstellation() {
  if (typeof window === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
  document.addEventListener('astro:before-swap', teardown);
  document.addEventListener('astro:page-load', bind);
}
