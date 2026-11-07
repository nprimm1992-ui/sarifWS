/**
 * Trace geometry and "show me where".
 * layoutTrace and locateExcerpt are pure. The DOM helpers no-op without a document.
 */

const WIDTH = 280;
const HEIGHT = 112;
const MIN_NEEDLE = 8;

export function layoutTrace(sources) {
  const items = [...(sources || [])].sort((a, b) => a.n - b.n);
  const sections = [];
  for (const item of items) {
    if (!sections.includes(item.section)) sections.push(item.section || 'site');
  }
  const nodes = items.map((item, index) => {
    const section = item.section || 'site';
    const sectionIndex = Math.max(0, sections.indexOf(section));
    const t = items.length === 1 ? 0.5 : index / (items.length - 1);
    const x = Math.round(86 + t * 172);
    const y = Math.round(16 + (sectionIndex % 3) * 28);
    return { id: item.n, n: item.n, section, x, y };
  });
  return {
    width: WIDTH,
    height: HEIGHT,
    center: { id: 'jensen', x: 28, y: 44 },
    nodes,
    edges: nodes.map((node) => ({ from: 'jensen', to: node.n })),
  };
}

function fold(value) {
  const map = [];
  let text = '';
  let pending = false;
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (/\s/.test(ch)) {
      pending = text.length > 0;
      continue;
    }
    if (pending) {
      text += ' ';
      map.push(index);
    }
    pending = false;
    text += ch.toLowerCase();
    map.push(index);
  }
  return { text, map };
}

/** Character offsets into `haystack` for a published excerpt, or null. */
export function locateExcerpt(haystack, excerpt) {
  const needle = String(excerpt || '').replace(/[…\s]+$/u, '').trim();
  if (needle.length < MIN_NEEDLE) return null;
  const direct = String(haystack || '').indexOf(needle);
  if (direct >= 0) return { start: direct, end: direct + needle.length };
  const folded = fold(String(haystack || ''));
  const target = fold(needle).text.slice(0, 160);
  if (target.length < MIN_NEEDLE) return null;
  const at = folded.text.indexOf(target);
  if (at < 0) return null;
  const start = folded.map[at];
  const endAt = folded.map[Math.min(folded.map.length - 1, at + target.length - 1)];
  if (start == null || endAt == null) return null;
  return { start, end: endAt + 1 };
}

export function findPassageRange(main, excerpt) {
  if (!main || typeof main.textContent !== 'string') return null;
  const located = locateExcerpt(main.textContent, excerpt);
  if (!located) return null;
  const doc = main.ownerDocument;
  if (!doc?.createTreeWalker || !doc.createRange) return null;
  const showText = globalThis.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = doc.createTreeWalker(main, showText);
  let seen = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = node.nodeValue || '';
    const next = seen + value.length;
    if (!startNode && located.start < next) {
      startNode = node;
      startOffset = located.start - seen;
    }
    if (startNode && located.end <= next) {
      endNode = node;
      endOffset = located.end - seen;
      break;
    }
    seen = next;
  }
  if (!startNode || !endNode) return null;
  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export function highlightPassage(range, smooth) {
  const api = globalThis.CSS;
  const HighlightCtor = globalThis.Highlight;
  if (!range || !api?.highlights || typeof HighlightCtor !== 'function') return false;
  api.highlights.set('jensen-passage', new HighlightCtor(range));
  const node = range.startContainer;
  const host = node.nodeType === 1 ? node : node.parentElement;
  host?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  return true;
}
