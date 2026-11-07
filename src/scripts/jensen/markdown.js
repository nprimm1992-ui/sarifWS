/**
 * The small markdown subset the public voice is allowed to emit.
 * Re-parsing the whole string each frame keeps an unclosed marker literal
 * until its closer arrives. Nothing here becomes HTML.
 */

const BLOCK_TYPES = new Set(['paragraph', 'list']);
const INLINE_TYPES = new Set(['text', 'strong', 'em', 'cite']);

function parseInline(text) {
  const nodes = [];
  let buffer = '';
  let index = 0;
  const flush = () => {
    if (!buffer) return;
    nodes.push({ type: 'text', text: buffer });
    buffer = '';
  };
  while (index < text.length) {
    if (text.startsWith('**', index)) {
      const close = text.indexOf('**', index + 2);
      if (close === -1) {
        buffer += '**';
        index += 2;
        continue;
      }
      flush();
      nodes.push({ type: 'strong', children: parseInline(text.slice(index + 2, close)) });
      index = close + 2;
      continue;
    }
    if (text[index] === '*' && text[index + 1] !== '*') {
      const close = text.indexOf('*', index + 1);
      if (close === -1) {
        buffer += '*';
        index += 1;
        continue;
      }
      flush();
      nodes.push({ type: 'em', children: parseInline(text.slice(index + 1, close)) });
      index = close + 1;
      continue;
    }
    const cite = text.slice(index).match(/^\[(\d{1,3})\]/);
    if (cite && text[index - 1] !== '[' && text[index + cite[0].length] !== ']') {
      flush();
      nodes.push({ type: 'cite', n: Number(cite[1]) });
      index += cite[0].length;
      continue;
    }
    buffer += text[index];
    index += 1;
  }
  flush();
  return nodes;
}

function listKind(lines) {
  const filled = lines.filter((line) => line.trim() !== '');
  if (filled.length === 0) return null;
  const bullet = (line) => /^[-*]\s+\S/.test(line);
  const looseBullet = (line) => /^[-*]\s*$/.test(line);
  const ordered = (line) => /^\d+\.\s+\S/.test(line);
  const looseOrdered = (line) => /^\d+\.\s*$/.test(line);
  if (filled.every((line) => bullet(line) || looseBullet(line)) && filled.some(bullet)) return 'ul';
  if (filled.every((line) => ordered(line) || looseOrdered(line)) && filled.some(ordered)) return 'ol';
  return null;
}

function parseBlock(block) {
  const lines = block.split('\n');
  const kind = listKind(lines);
  if (!kind) return { type: 'paragraph', children: parseInline(block) };
  const items = [];
  for (const line of lines) {
    const match = kind === 'ul' ? line.match(/^[-*]\s+(\S.*)$/) : line.match(/^\d+\.\s+(\S.*)$/);
    if (match) items.push({ children: parseInline(match[1]) });
  }
  return items.length > 0 ? { type: 'list', ordered: kind === 'ol', items } : null;
}

export function parseAnswer(text) {
  const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks.map((block) => parseBlock(block.trim())).filter(Boolean);
}

export function walkAnswer(nodes, visit) {
  for (const node of nodes) {
    visit(node);
    if (node.children) walkAnswer(node.children, visit);
    if (node.items) {
      for (const item of node.items) walkAnswer(item.children, visit);
    }
  }
}

export function answerNodeTypes(ast) {
  const types = new Set();
  walkAnswer(ast, (node) => types.add(node.type));
  return types;
}

export { BLOCK_TYPES, INLINE_TYPES };

function textNode(doc, value) {
  return doc.createTextNode(value);
}

function renderInline(doc, nodes, ctx) {
  const fragment = doc.createDocumentFragment();
  for (const node of nodes) {
    if (node.type === 'text') fragment.append(textNode(doc, node.text));
    else if (node.type === 'strong' || node.type === 'em') {
      const el = doc.createElement(node.type === 'strong' ? 'strong' : 'em');
      el.append(renderInline(doc, node.children, ctx));
      fragment.append(el);
    } else if (node.type === 'cite') {
      const known = ctx.sources?.some((source) => source.n === node.n);
      if (!known) fragment.append(textNode(doc, `[${node.n}]`));
      else {
        const source = ctx.sources.find((item) => item.n === node.n);
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'jensen-cite';
        button.dataset.n = String(node.n);
        button.textContent = String(node.n);
        button.setAttribute('aria-label', ctx.label(node.n, source?.title || ''));
        fragment.append(button);
      }
    }
  }
  return fragment;
}

/** Render an answer AST into `parent`, replacing its children. Text only. */
export function renderAnswer(parent, text, ctx) {
  const doc = parent.ownerDocument;
  const ast = parseAnswer(text);
  const fragment = doc.createDocumentFragment();
  for (const block of ast) {
    if (block.type === 'list') {
      const list = doc.createElement(block.ordered ? 'ol' : 'ul');
      for (const item of block.items) {
        const li = doc.createElement('li');
        li.append(renderInline(doc, item.children, ctx));
        list.append(li);
      }
      fragment.append(list);
    } else {
      const p = doc.createElement('p');
      p.append(renderInline(doc, block.children, ctx));
      fragment.append(p);
    }
  }
  parent.replaceChildren(fragment);
}

/**
 * Coalesce answer paints to one per frame. `schedule` defaults to
 * requestAnimationFrame; tests pass a recorder.
 */
export function createStreamingView(paint, schedule = requestAnimationFrame, cancel = cancelAnimationFrame) {
  let frame = 0;
  let latest = '';
  return {
    update(text) {
      latest = text;
      if (frame) return;
      frame = schedule(() => {
        frame = 0;
        paint(latest);
      });
    },
    flush(text) {
      if (typeof text === 'string') latest = text;
      if (frame) cancel(frame);
      frame = 0;
      paint(latest);
    },
  };
}
