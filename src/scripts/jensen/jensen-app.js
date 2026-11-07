/**
 * Public Jensen panel. Built with DOM APIs. Model text never touches innerHTML.
 * mount() is safe to call again on the same root.
 */

import '../../styles/jensen.css';
import { subscribeReducedMotion } from '../reduced-motion.js';
import { COPY, problemCopy } from './copy.js';
import { pageContext, scopeSkusFrom } from './context.js';
import {
  emptyThread,
  loadThread,
  reduceHandoff,
  reduceThread,
  saveThread,
} from './state.js';
import { composeBrief, SIGNAL_MAX, SIGNAL_MIN } from './brief.js';
import { createStreamingView, renderAnswer } from './markdown.js';
import { findPassageRange, highlightPassage, layoutTrace } from './trace.js';
import { describeUrl, JensenError, openSession, streamTurn, transmit } from './transport.js';
import { getToken, mountTurnstile, preloadTurnstile, resetTurnstile } from './turnstile.js';

const MESSAGE_MAX = 2000;
const COUNTER_AT = 1800;
const SCOPE_KEY = 'sarif:scope';
const HIGHLIGHT_KEY = 'sarif:jensen-highlight';
const HIGHLIGHT_TTL_MS = 30_000;
const PUBLIC_ORIGIN = 'https://sarifconsulting.ai';
const SVG = 'http://www.w3.org/2000/svg';
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let api = null;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'hidden') node.hidden = true;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function sigil() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'jensen-sigil');
  const hub = document.createElementNS(SVG, 'circle');
  hub.setAttribute('cx', '12');
  hub.setAttribute('cy', '12');
  hub.setAttribute('r', '2.1');
  hub.setAttribute('fill', 'currentColor');
  const spokes = document.createElementNS(SVG, 'path');
  spokes.setAttribute('d', 'M12 9.6 V5.2 M13.6 13.4 L17.4 15.6 M10.4 13.4 L6.6 15.6');
  spokes.setAttribute('fill', 'none');
  spokes.setAttribute('stroke', 'currentColor');
  spokes.setAttribute('stroke-width', '1.2');
  svg.append(hub, spokes);
  for (const [cx, cy] of [['12', '4.2'], ['18.2', '16.4'], ['5.8', '16.4']]) {
    const node = document.createElementNS(SVG, 'circle');
    node.setAttribute('cx', cx);
    node.setAttribute('cy', cy);
    node.setAttribute('r', '1.5');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '1.2');
    svg.append(node);
  }
  return svg;
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return `$${amount.toLocaleString('en-US')}`;
}

function safeHref(url) {
  if (typeof url !== 'string' || !url) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (parsed.origin === location.origin || parsed.origin === PUBLIC_ORIGIN) return parsed.href;
  } catch {
    return '';
  }
  return '';
}

function asCode(err) {
  if (err?.name === 'AbortError') return 'abort';
  if (err instanceof JensenError) return err.code || 'network';
  if (err?.message === 'turnstile-timeout' || err?.message === 'turnstile') return 'challenge';
  return 'network';
}

function isMobile() {
  return window.matchMedia('(max-width: 639px)').matches;
}

export function mount(root) {
  if (!root) return null;
  if (api?.root === root) return api;

  const launcher = root.querySelector('#jensen-launcher');
  const label = root.querySelector('.jensen-launcher-label');
  const dot = root.querySelector('.jensen-launcher-dot');
  let thread = loadThread(sessionStorage) || emptyThread();
  let page = pageContext(location.pathname, document.title);
  let skus = scopeSkusFrom(location.search, sessionStorage.getItem(SCOPE_KEY) || '');
  let handoff = 'closed';
  let motion = 'full';
  let busy = false;
  let offline = false;
  let errorCode = '';
  let briefDirty = false;
  let preview = null;
  let sessionPromise = null;
  let abort = null;
  let pinned = true;
  let returnMode = false;
  let decoded = false;

  const panel = el('div', {
    id: 'jensen-panel',
    role: 'dialog',
    'aria-modal': 'false',
    'aria-labelledby': 'jensen-title',
    'data-lenis-prevent': 'true',
    'data-testid': 'jensen-panel',
    hidden: true,
  });
  panel.dataset.phase = 'opening';
  panel.dataset.motion = motion;

  const backdrop = el('button', { type: 'button', class: 'jensen-backdrop', 'aria-label': COPY.close });
  const title = el('span', { id: 'jensen-title', class: 'jensen-name', tabindex: '-1', text: COPY.name });
  function iconButton(label, draw) {
    const button = el('button', { type: 'button', class: 'jensen-iconbtn', 'aria-label': label });
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', draw);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.4');
    path.setAttribute('stroke-linecap', 'square');
    svg.append(path);
    button.append(svg);
    return button;
  }
  const newThreadBtn = iconButton(COPY.newThread, 'M8 3.5 V12.5 M3.5 8 H12.5');
  const expandBtn = iconButton(COPY.expand, 'M3 6.5 V3.5 H6.5 M9.5 3.5 H13 V6.5 M13 9.5 V13 H9.5 M6.5 13 H3 V9.5');
  expandBtn.classList.add('jensen-expand');
  expandBtn.setAttribute('aria-pressed', 'false');
  const closeBtn = iconButton(COPY.close, 'M4 4 L12 12 M12 4 L4 12');
  const reading = el('p', { class: 'jensen-reading', 'data-testid': 'jensen-reading' });
  const scopeChip = el('p', { class: 'jensen-scope-chip' });
  const empty = el('p', { id: 'jensen-empty', class: 'jensen-empty', 'data-testid': 'jensen-empty', text: COPY.empty });
  const starters = el('div', { id: 'jensen-starters', class: 'jensen-starters' });
  const log = el('ol', { id: 'jensen-log', class: 'jensen-log', role: 'log', 'aria-live': 'polite', 'data-testid': 'jensen-log' });
  const alert = el('div', { id: 'jensen-alert', class: 'jensen-alert', hidden: true });
  const status = el('p', { id: 'jensen-status', class: 'jensen-status', role: 'status', 'aria-live': 'polite', 'data-testid': 'jensen-status' });
  const input = el('textarea', { id: 'jensen-input', maxlength: String(MESSAGE_MAX), required: true, placeholder: COPY.placeholder, rows: '2', 'data-testid': 'jensen-input' });
  const sendBtn = el('button', { id: 'jensen-send', type: 'submit', text: COPY.send, 'data-testid': 'jensen-send' });
  const counter = el('span', { class: 'jensen-counter', hidden: true });
  const form = el('form', { id: 'jensen-form', class: 'jensen-composer' }, [
    el('label', { class: 'jensen-sr', for: 'jensen-input', text: COPY.question }),
    input,
    el('div', { class: 'jensen-composer-row' }, [counter, sendBtn]),
  ]);
  const briefBtn = el('button', { id: 'jensen-brief', type: 'button', text: COPY.brief, 'data-testid': 'jensen-brief' });
  const briefInput = el('textarea', { id: 'jensen-brief-text', maxlength: String(SIGNAL_MAX), 'data-testid': 'jensen-brief-text' });
  const nameInput = el('input', { id: 'jensen-name', name: 'name', required: true, maxlength: '200', autocomplete: 'name' });
  const emailInput = el('input', { id: 'jensen-email', name: 'email', type: 'email', required: true, maxlength: '254', autocomplete: 'email' });
  const orgInput = el('input', { id: 'jensen-org', name: 'organization', maxlength: '200', autocomplete: 'organization' });
  const urlInput = el('input', { id: 'jensen-url', name: 'organization_url', type: 'url', maxlength: '500', inputmode: 'url' });
  const honey = el('input', { class: 'jensen-hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const sheetError = el('p', { id: 'jensen-handoff-error', class: 'jensen-sheet-error', hidden: true });
  const previewBlock = el('div', { class: 'jensen-preview', hidden: true });
  const sentBlock = el('p', { class: 'jensen-sent', hidden: true, text: COPY.sent });
  const backBtn = el('button', { type: 'button', text: COPY.back });
  const continueBtn = el('button', { type: 'button', class: 'jensen-primary', text: COPY.continue });
  const sendBriefBtn = el('button', { type: 'submit', class: 'jensen-primary', text: COPY.sendBrief });
  const contactFields = el('div', { class: 'jensen-contact' }, [
    el('label', { for: 'jensen-name', text: COPY.nameLabel }), nameInput,
    el('label', { for: 'jensen-email', text: COPY.emailLabel }), emailInput,
    el('label', { for: 'jensen-org', text: COPY.orgLabel }), orgInput,
    el('label', { for: 'jensen-url', class: 'jensen-url-label', text: COPY.urlLabel }), urlInput,
    honey,
    previewBlock,
  ]);
  const closeSheetBtn = iconButton(COPY.closeBrief, 'M10 3.5 L5.5 8 L10 12.5');
  closeSheetBtn.setAttribute('data-testid', 'jensen-brief-close');
  const sheetForm = el('form', { id: 'jensen-sheet', class: 'jensen-sheet', hidden: true }, [
    el('div', { class: 'jensen-sheet-head' }, [closeSheetBtn, el('h3', { text: COPY.reviewTitle })]),
    el('p', { class: 'jensen-sheet-help', text: COPY.reviewHelp }),
    el('label', { class: 'jensen-sr', for: 'jensen-brief-text', text: COPY.reviewTitle }),
    briefInput,
    contactFields,
    sheetError,
    sentBlock,
    el('div', { class: 'jensen-sheet-actions' }, [backBtn, continueBtn, sendBriefBtn]),
  ]);
  const turnstileSlot = el('div', { class: 'jensen-turnstile' });
  const context = el('div', { class: 'jensen-context' }, [reading, scopeChip]);
  const foot = el('footer', { class: 'jensen-foot' }, [briefBtn, el('p', { text: COPY.privacy })]);
  const behindSheet = [context, empty, starters, log, form, foot];

  const head = el('header', { class: 'jensen-head' }, [
    el('div', { class: 'jensen-id' }, [
      sigil(),
      el('div', {}, [title, el('p', { class: 'jensen-eyebrow', text: COPY.eyebrow })]),
    ]),
    el('div', { class: 'jensen-head-actions' }, [newThreadBtn, expandBtn, closeBtn]),
  ]);
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    panel.append(el('span', { class: `jensen-corner jensen-corner-${corner}`, 'aria-hidden': 'true' }));
  }
  panel.append(
    head,
    context,
    empty,
    starters,
    log,
    alert,
    status,
    form,
    foot,
    sheetForm,
    turnstileSlot,
  );
  root.append(backdrop, panel);
  root.dataset.jensenApp = 'sarif:jensen-app';

  function setStatus(text) {
    if (status.textContent === text) return;
    status.textContent = text;
  }

  function syncLauncher() {
    if (!launcher) return;
    const answering = busy && panel.hidden;
    launcher.classList.toggle('is-ready', !busy && !returnMode && panel.hidden);
    launcher.classList.toggle('is-answering', answering);
    launcher.classList.toggle('is-threaded', thread.turns.length > 0);
    launcher.classList.toggle('is-return', returnMode);
    if (label) label.textContent = returnMode ? COPY.returnToConversation : COPY.launcher;
    if (dot) dot.hidden = thread.turns.length === 0;
    launcher.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
  }

  function paintChrome() {
    page = pageContext(location.pathname, document.title);
    skus = scopeSkusFrom(location.search, sessionStorage.getItem(SCOPE_KEY) || '');
    reading.textContent = COPY.reading(page.title);
    if (skus.length === 0) scopeChip.hidden = true;
    else {
      scopeChip.hidden = false;
      scopeChip.textContent = skus.length === 1 ? COPY.scopeOne : COPY.scopeMany(skus.length);
    }
    empty.hidden = thread.turns.length > 0;
    starters.hidden = thread.turns.length > 0;
    starters.replaceChildren();
    if (thread.turns.length === 0) {
      for (const prompt of page.starters) {
        const button = el('button', { type: 'button', class: 'jensen-starter', text: prompt });
        button.addEventListener('click', () => { void submit(prompt); });
        starters.append(button);
      }
    }
    const showUrl = thread.capabilities?.prebrief === true;
    urlInput.parentElement?.querySelector('.jensen-url-label')?.toggleAttribute('hidden', !showUrl);
    urlInput.hidden = !showUrl;
    panel.setAttribute('aria-modal', isMobile() ? 'true' : 'false');
    log.setAttribute('aria-busy', busy ? 'true' : 'false');
    syncLauncher();
    paintAlert();
    paintSheet();
  }

  function paintAlert() {
    if (!errorCode && !offline) {
      alert.hidden = true;
      alert.replaceChildren();
      return;
    }
    const code = offline ? 'public_disabled' : errorCode;
    const copy = problemCopy(code);
    alert.hidden = false;
    alert.replaceChildren();
    alert.append(el('p', { class: 'jensen-alert-title', text: copy.title }), el('p', { text: copy.detail }));
    const failedTurn = lastTurn()?.status === 'error';
    const row = el('div', { class: 'jensen-alert-actions' });
    for (const action of copy.actions) {
      if (action === 'brief') row.append(el('button', { type: 'button', 'data-action': 'brief', text: COPY.brief }));
      if (action === 'new-thread') row.append(el('button', { type: 'button', 'data-action': 'new-thread', text: COPY.newThread }));
      // A failed turn carries its own Try again; a second one here would be noise.
      if (action === 'retry' && !failedTurn) row.append(el('button', { type: 'button', 'data-action': 'retry', text: COPY.retry }));
    }
    if (row.childElementCount > 0) alert.append(row);
  }

  function lastTurn() {
    return thread.turns[thread.turns.length - 1];
  }

  function latestScopeBrief() {
    for (let index = thread.turns.length - 1; index >= 0; index -= 1) {
      const brief = thread.turns[index].scope?.brief;
      if (typeof brief === 'string' && brief.trim()) return brief;
    }
    return '';
  }

  function paintSheet() {
    const open = handoff !== 'closed';
    sheetForm.hidden = !open;
    panel.classList.toggle('is-briefing', open);
    for (const node of behindSheet) node.inert = open;
    closeSheetBtn.disabled = handoff === 'sending';
    const reviewing = handoff === 'review';
    const contacting = handoff === 'contact' || handoff === 'sending' || handoff === 'failed';
    briefInput.hidden = handoff === 'sent';
    contactFields.hidden = !contacting;
    continueBtn.hidden = !reviewing;
    backBtn.hidden = !contacting;
    sendBriefBtn.hidden = !contacting;
    sentBlock.hidden = handoff !== 'sent';
    const heading = sheetForm.querySelector('h3');
    const help = sheetForm.querySelector('.jensen-sheet-help');
    if (heading instanceof HTMLElement) heading.hidden = handoff === 'sent';
    if (help instanceof HTMLElement) help.hidden = handoff === 'sent';
    sendBriefBtn.disabled = handoff === 'sending';
    const url = urlInput.value.trim();
    const described = preview && preview.url === url && preview.ok;
    sendBriefBtn.textContent = url && thread.capabilities?.prebrief && !described && !preview ? COPY.describe : COPY.sendBrief;
    previewBlock.hidden = !(preview && preview.url === url);
    previewBlock.replaceChildren();
    if (preview && preview.url === url) {
      previewBlock.append(el('p', { class: 'jensen-who', text: COPY.previewTitle }), el('p', { text: preview.text }));
    }
  }

  function sourceList(items, cited, settled) {
    const list = el('ul', { class: settled ? 'jensen-sources is-settled' : 'jensen-sources' });
    items.forEach((source, index) => {
      const card = el('li', { class: 'jensen-source', 'data-source': String(source.n) });
      if (cited) card.classList.add('is-cited');
      if (!settled) card.style.animationDelay = `${index * 40}ms`;
      card.append(el('span', { class: 'jensen-glyph', text: (source.section || 's').slice(0, 1).toUpperCase(), 'aria-hidden': 'true' }));
      const body = el('div', {});
      if (source.section) body.append(el('p', { class: 'jensen-source-kicker', text: source.section }));
      body.append(el('p', { class: 'jensen-source-title', text: source.title || 'Published page' }));
      if (source.excerpt) body.append(el('p', { class: 'jensen-source-excerpt', text: source.excerpt }));
      const href = safeHref(source.url);
      if (href) {
        const link = el('a', { href, text: COPY.openPage, 'data-excerpt': source.excerpt || '' });
        body.append(link);
      }
      card.append(body);
      list.append(card);
    });
    return list;
  }

  function traceSvg(turn) {
    const layout = layoutTrace(turn.sources);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('class', 'jensen-trace');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', COPY.traceLabel);
    const center = document.createElementNS(SVG, 'circle');
    center.setAttribute('cx', String(layout.center.x));
    center.setAttribute('cy', String(layout.center.y));
    center.setAttribute('r', '5');
    center.setAttribute('class', 'jensen-trace-hub');
    svg.append(center);
    for (const edge of layout.edges) {
      const node = layout.nodes.find((item) => item.n === edge.to);
      if (!node) continue;
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', String(layout.center.x));
      line.setAttribute('y1', String(layout.center.y));
      line.setAttribute('x2', String(node.x));
      line.setAttribute('y2', String(node.y));
      line.setAttribute('class', 'jensen-trace-edge');
      svg.append(line);
    }
    for (const node of layout.nodes) {
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('cx', String(node.x));
      dot.setAttribute('cy', String(node.y));
      dot.setAttribute('r', '4');
      dot.setAttribute('data-n', String(node.n));
      dot.setAttribute('class', turn.cited.includes(node.n) ? 'jensen-trace-node is-cited' : 'jensen-trace-node');
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('x', String(node.x));
      label.setAttribute('y', String(Math.min(layout.height - 4, node.y + 16)));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'jensen-trace-label');
      label.textContent = node.section;
      svg.append(dot, label);
    }
    return svg;
  }

  /*
   * The log is a live region, so a turn's nodes are kept and only its answer
   * block is swapped when the turn changes. Rebuilding the whole log would
   * make screen readers announce the entire thread again.
   */
  const rendered = new Map();
  let firstPaint = true;

  function turnSignature(turn, showSources, showScope) {
    return [
      turn.status,
      turn.answer.length,
      turn.sources.length,
      turn.cited.join(','),
      turn.legacy.length,
      showSources,
      showScope && Boolean(turn.scope),
    ].join('|');
  }

  function paintLog() {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 64;
    const showSources = thread.capabilities?.sources === true;
    const showScope = thread.capabilities?.scope === true;
    const live = new Set(thread.turns.map((turn) => turn.id));
    for (const [id, entry] of rendered) {
      if (live.has(id)) continue;
      entry.item.remove();
      rendered.delete(id);
    }
    thread.turns.forEach((turn, index) => {
      let entry = rendered.get(turn.id);
      if (!entry) {
        const item = el('li', { class: 'jensen-turn', 'data-turn': turn.id }, [
          el('div', { class: 'jensen-q' }, [
            el('span', { class: 'jensen-who', text: COPY.you }),
            el('p', { text: turn.question }),
          ]),
        ]);
        entry = { item, answer: null, sig: '', settled: firstPaint };
        rendered.set(turn.id, entry);
      }
      const sig = turnSignature(turn, showSources, showScope);
      if (entry.sig !== sig) {
        const answer = answerBlock(turn, showSources, showScope, entry.settled);
        if (entry.answer) entry.answer.replaceWith(answer);
        else entry.item.append(answer);
        entry.answer = answer;
        entry.sig = sig;
        if (showSources && turn.sources.length > 0 && turn.status !== 'retrieving') entry.settled = true;
      }
      if (log.children[index] !== entry.item) log.insertBefore(entry.item, log.children[index] || null);
    });
    firstPaint = false;
    if (pinned || nearBottom) log.scrollTop = log.scrollHeight;
  }

  function answerBlock(turn, showSources, showScope, settled) {
    const inFlight = turn.status === 'streaming' || turn.status === 'composing' || turn.status === 'retrieving';
    const answer = el('div', { class: 'jensen-a' });
    // Hidden while in flight; the status line narrates progress and the finished answer is announced once.
    if (inFlight) answer.setAttribute('aria-hidden', 'true');
    answer.append(el('span', { class: 'jensen-who', text: COPY.jensen }));
    const body = el('div', { class: 'jensen-answer', 'data-answer': turn.id });
    if (turn.answer) {
      renderAnswer(body, turn.answer, {
        sources: showSources ? turn.sources : [],
        label: COPY.sourceLabel,
      });
    }
    if (turn.status === 'streaming') body.classList.add('jensen-caret');
    answer.append(body);
    if (turn.status === 'stopped') answer.append(el('p', { class: 'jensen-stopped', text: COPY.stopped }));
    if (showSources && turn.status === 'retrieving' && turn.sources.length === 0) {
      const hold = el('div', { class: 'jensen-shimmers' });
      for (let index = 0; index < 3; index += 1) hold.append(el('div', { class: 'jensen-shimmer' }));
      answer.append(hold);
    }
    if (showSources && turn.sources.length > 0 && inFlight) {
      answer.append(el('p', { class: 'jensen-reading-count', text: turn.sources.length === 1 ? COPY.readingOne : COPY.readingMany(turn.sources.length) }));
    }
    if (showSources && turn.sources.length > 0 && turn.status !== 'retrieving') {
      answer.append(traceSvg(turn));
      const cited = new Set(turn.cited);
      const used = turn.status === 'complete' ? turn.sources.filter((source) => cited.has(source.n)) : turn.sources;
      const rest = turn.status === 'complete' ? turn.sources.filter((source) => !cited.has(source.n)) : [];
      if (used.length > 0) answer.append(sourceList(used, true, settled));
      if (rest.length > 0) {
        const details = el('details', { class: 'jensen-also' });
        details.append(el('summary', { text: COPY.alsoRead }));
        details.append(sourceList(rest, false, settled));
        answer.append(details);
      }
    } else if (!showSources && turn.legacy.length > 0) {
      const list = el('ul', { class: 'jensen-sources' });
      for (const source of turn.legacy) {
        const href = safeHref(source.url);
        const row = el('li', {});
        if (href) row.append(el('a', { href, text: source.title || href }));
        else row.textContent = source.title || 'Published page';
        list.append(row);
      }
      answer.append(list);
    }
    if (showScope && turn.scope) answer.append(scopeCard(turn.scope));
    const actions = el('div', { class: 'jensen-actions' });
    if (!inFlight && turn.answer.trim()) actions.append(el('button', { type: 'button', 'data-copy': turn.id, text: COPY.copy }));
    if (turn.status === 'error' || turn.status === 'stopped') {
      actions.append(el('button', { type: 'button', 'data-retry': turn.id, text: COPY.retry }));
    }
    if (actions.childElementCount > 0) answer.append(actions);
    return answer;
  }

  function scopeCard(scope) {
    const card = el('div', { class: 'jensen-scope' });
    card.append(el('span', { class: 'jensen-who', text: COPY.scope }));
    const items = Array.isArray(scope.items) ? scope.items : [];
    if (items.length > 0) {
      const list = el('ul', {});
      for (const item of items) {
        const quoted = item.kind === 'quote' || Number(item.from) === 0;
        const price = quoted ? COPY.quoted : COPY.fromPrice(money(item.from));
        list.append(el('li', { text: `${item.title} — ${price}` }));
      }
      card.append(list);
    }
    const amount = Number(scope.floor);
    const quotes = Number(scope.quote_count) || 0;
    let line = COPY.floorMissing;
    if (scope.available && Number.isFinite(amount) && amount === 0 && quotes > 0) line = COPY.floorQuoted;
    else if (scope.available && Number.isFinite(amount) && money(amount)) line = COPY.floorFrom(money(amount));
    card.append(el('p', { class: 'jensen-floor', text: line }));
    return card;
  }

  function paint() {
    paintChrome();
    paintLog();
    grow();
  }

  function grow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    const used = input.value.length;
    counter.hidden = used < COUNTER_AT;
    counter.textContent = COPY.counter(used, MESSAGE_MAX);
  }

  function save() {
    try {
      saveThread(sessionStorage, thread);
    } catch {
      setStatus(COPY.copyFailed);
    }
  }

  function rememberHighlight(excerpt, href) {
    let path = href;
    try {
      path = new URL(href, location.origin).pathname;
    } catch {
      /* Keep the original href when it is not a URL. */
    }
    try {
      sessionStorage.setItem(HIGHLIGHT_KEY, JSON.stringify({ excerpt, path, at: Date.now() }));
    } catch {
      /* highlight is optional */
    }
  }

  function applyHighlight() {
    let pending;
    try {
      pending = JSON.parse(sessionStorage.getItem(HIGHLIGHT_KEY) || 'null');
    } catch {
      return;
    }
    if (!pending || pending.path !== location.pathname) return;
    if (Date.now() - Number(pending.at) > HIGHLIGHT_TTL_MS) {
      sessionStorage.removeItem(HIGHLIGHT_KEY);
      return;
    }
    const main = document.querySelector('main');
    const range = main ? findPassageRange(main, pending.excerpt) : null;
    if (range) highlightPassage(range, motion === 'full');
    sessionStorage.removeItem(HIGHLIGHT_KEY);
  }

  async function ensureSession() {
    if (thread.sessionId) return thread.sessionId;
    if (sessionPromise) return sessionPromise;
    setStatus(COPY.statusWarming);
    sessionPromise = (async () => {
      const token = await getToken({ timeoutMs: 8000 });
      const session = await openSession(token);
      resetTurnstile();
      thread = reduceThread(thread, {
        type: 'session',
        sessionId: session.session_id,
        capabilities: session.capabilities,
      });
      offline = false;
      save();
      return thread.sessionId;
    })();
    try {
      return await sessionPromise;
    } finally {
      sessionPromise = null;
    }
  }

  function streamingBody() {
    const turn = lastTurn();
    if (!turn || turn.status !== 'streaming') return null;
    const node = rendered.get(turn.id)?.answer?.querySelector('.jensen-answer');
    return node ? { turn, node } : null;
  }

  const streamView = createStreamingView((text) => {
    const target = streamingBody();
    if (!target) return;
    target.node.classList.add('jensen-caret');
    renderAnswer(target.node, text, {
      sources: thread.capabilities?.sources ? target.turn.sources : [],
      label: COPY.sourceLabel,
    });
    if (pinned) log.scrollTop = log.scrollHeight;
  });

  function handleFrame(frame) {
    if (!frame || frame.malformed || !frame.data) return;
    const data = frame.data;
    if (frame.event === 'phase' && (data.name === 'retrieving' || data.name === 'composing')) {
      thread = reduceThread(thread, { type: 'phase', name: data.name });
      setStatus(data.name === 'retrieving' ? COPY.statusReading : COPY.statusComposing);
      paintLog();
    } else if (frame.event === 'sources' && Array.isArray(data.items)) {
      thread = reduceThread(thread, { type: 'sources', items: data.items });
      const count = data.items.length;
      if (count > 0) setStatus(count === 1 ? COPY.readingOne : COPY.readingMany(count));
      paintLog();
    } else if (frame.event === 'scope' && thread.capabilities?.scope === true) {
      thread = reduceThread(thread, { type: 'scope', scope: data });
      paintLog();
    } else if (frame.event === 'delta' && typeof data.content === 'string') {
      thread = reduceThread(thread, { type: 'delta', text: data.content });
      if (!streamingBody()) paintLog();
      else streamView.update(lastTurn().answer);
    } else if (frame.event === 'citation') {
      thread = reduceThread(thread, { type: 'legacy', url: data.url, title: data.title });
      paintLog();
    } else if (frame.event === 'turn_end') {
      const cited = Array.isArray(data.cited) ? data.cited.filter((n) => Number.isInteger(n)) : [];
      streamView.flush(lastTurn()?.answer ?? '');
      thread = reduceThread(thread, { type: 'complete', cited });
      setStatus('');
      paint();
    }
  }

  async function runTurn(sessionId, question, signal) {
    await streamTurn({
      sessionId,
      message: question,
      skus,
      signal,
      onEvent: handleFrame,
    });
    const turn = thread.turns[thread.turns.length - 1];
    if (turn && (turn.status === 'retrieving' || turn.status === 'composing' || turn.status === 'streaming')) {
      thread = reduceThread(thread, { type: 'stop' });
      paint();
    }
  }

  async function submit(raw) {
    const question = String(raw || '').trim();
    if (!question || busy) return;
    busy = true;
    errorCode = '';
    const id = crypto.randomUUID();
    thread = reduceThread(thread, { type: 'begin', id, question });
    input.value = '';
    grow();
    paint();
    sendBtn.textContent = COPY.stop;
    const controller = new AbortController();
    abort = controller;
    let attempt = 0;
    try {
      while (attempt < 2) {
        attempt += 1;
        try {
          const sessionId = await ensureSession();
          if (!sessionId) {
            offline = true;
            thread = { ...thread, turns: thread.turns.filter((turn) => turn.id !== id) };
            input.value = question;
            openBrief({ pending: question });
            return;
          }
          await runTurn(sessionId, question, controller.signal);
          return;
        } catch (err) {
          const code = asCode(err);
          if (code === 'abort') {
            thread = reduceThread(thread, { type: 'stop' });
            return;
          }
          if (code === 'session' && attempt < 2) {
            thread = reduceThread(thread, { type: 'forget-session' });
            continue;
          }
          if (code === 'public_disabled') {
            offline = true;
            thread = { ...thread, turns: thread.turns.filter((turn) => turn.id !== id) };
            input.value = question;
            openBrief({ pending: question });
            return;
          }
          if (code === 'network' || code === 'challenge') {
            thread = { ...thread, turns: thread.turns.filter((turn) => turn.id !== id) };
            input.value = question;
          } else {
            thread = reduceThread(thread, { type: 'fail' });
          }
          errorCode = code;
          return;
        }
      }
    } finally {
      busy = false;
      abort = null;
      sendBtn.textContent = COPY.send;
      save();
      paint();
    }
  }

  function ensureChallenge() {
    void mountTurnstile(turnstileSlot, root.dataset.sitekey || '');
  }

  function openPanel() {
    returnMode = false;
    panel.hidden = false;
    root.classList.add('is-open');
    ensureChallenge();
    if (motion === 'full') {
      panel.dataset.phase = 'opening';
      requestAnimationFrame(() => { panel.dataset.phase = 'open'; });
    } else {
      panel.dataset.phase = 'open';
    }
    if (!decoded && motion === 'full') {
      decoded = true;
      let step = 0;
      const timer = setInterval(() => {
        step += 1;
        title.textContent = COPY.name.split('').map((ch, index) => (
          index < step ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        )).join('');
        if (step >= COPY.name.length) {
          clearInterval(timer);
          title.textContent = COPY.name;
        }
      }, 36);
    }
    // On phones, focusing the composer would raise the keyboard over the answer.
    if (isMobile()) title.focus({ preventScroll: true });
    else input.focus();
    syncLauncher();
    if (!thread.sessionId) {
      ensureSession().then(() => {
        if (!busy) setStatus('');
        paint();
      }).catch((err) => {
        const code = asCode(err);
        if (!busy) setStatus('');
        if (code === 'public_disabled') {
          offline = true;
          openBrief({ focus: !isMobile() });
        } else if (code !== 'abort') errorCode = code;
        paint();
      });
    }
  }

  function closePanel(focusLauncher = true) {
    if (panel.hidden) return;
    let settled = false;
    const onEnd = (event) => {
      if (event.target !== panel) return;
      finish();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      panel.removeEventListener('transitionend', onEnd);
      panel.hidden = true;
      panel.dataset.phase = 'opening';
      root.classList.remove('is-open');
      syncLauncher();
      if (focusLauncher) launcher?.focus();
    };
    let timer = 0;
    if (motion === 'full') {
      panel.dataset.phase = 'closing';
      timer = setTimeout(finish, 180);
      panel.addEventListener('transitionend', onEnd);
    } else finish();
  }

  function openBrief({ pending = '', focus = true } = {}) {
    if (!briefDirty) {
      const turns = pending ? [...thread.turns, { question: pending, answer: '' }] : thread.turns;
      briefInput.value = composeBrief({ turns, scopeBrief: latestScopeBrief(), page });
    }
    ensureChallenge();
    handoff = reduceHandoff('closed', 'review');
    sheetError.hidden = true;
    paintSheet();
    if (focus) briefInput.focus();
  }

  function closeBrief() {
    if (handoff === 'closed' || handoff === 'sending') return;
    handoff = reduceHandoff(handoff, 'close');
    sheetError.hidden = true;
    paintSheet();
    briefBtn.focus();
  }

  function retryTurn(turnId) {
    const turn = thread.turns.find((item) => item.id === turnId);
    if (!turn || busy) return;
    thread = { ...thread, turns: thread.turns.filter((item) => item.id !== turnId) };
    errorCode = '';
    void submit(turn.question);
  }

  async function sendBrief(event) {
    event.preventDefault();
    if (handoff === 'sending') return;
    if (honey.value.trim()) return;
    const signalText = briefInput.value.trim();
    if (signalText.length < SIGNAL_MIN) {
      sheetError.hidden = false;
      sheetError.textContent = COPY.briefTooShort;
      return;
    }
    const url = urlInput.value.trim();
    if (url && !url.startsWith('https://')) {
      sheetError.hidden = false;
      sheetError.textContent = COPY.urlRejected;
      return;
    }
    if (!nameInput.value.trim() || !emailInput.validity.valid) {
      sheetError.hidden = false;
      sheetError.textContent = COPY.briefInvalid;
      return;
    }
    sheetError.hidden = true;
    if (url && thread.capabilities?.prebrief && (!preview || preview.url !== url)) {
      handoff = 'sending';
      paintSheet();
      try {
        const sessionId = await ensureSession();
        const text = sessionId ? await describeUrl(sessionId, url) : '';
        preview = { url, text: text || COPY.previewFailed, ok: Boolean(text) };
      } catch {
        preview = { url, text: COPY.previewFailed, ok: false };
      }
      handoff = 'contact';
      paintSheet();
      return;
    }
    let signal = signalText;
    if (preview?.ok && preview.url === url) {
      const extra = `\n\nPublic page: ${url}\n${preview.text}`;
      if (signal.length + extra.length <= SIGNAL_MAX) signal += extra;
    }
    handoff = 'sending';
    paintSheet();
    try {
      const token = await getToken({ timeoutMs: 8000 });
      await transmit({
        signal,
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        organization: orgInput.value.trim(),
        turnstileToken: token,
        website: '',
      });
      resetTurnstile();
      briefDirty = false;
      preview = null;
      sheetForm.reset();
      handoff = 'sent';
      setStatus(COPY.sentTitle);
    } catch (err) {
      handoff = 'failed';
      sheetError.hidden = false;
      sheetError.textContent = asCode(err) === 'challenge' ? COPY.challenge : COPY.briefFailed;
    }
    paintSheet();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) {
      abort?.abort();
      return;
    }
    void submit(input.value);
  });
  sendBtn.addEventListener('click', (event) => {
    if (!busy) return;
    event.preventDefault();
    abort?.abort();
  });
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  log.addEventListener('scroll', () => {
    pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 64;
  });
  log.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const copyBtn = target.closest('[data-copy]');
    if (copyBtn) {
      const turn = thread.turns.find((item) => item.id === copyBtn.getAttribute('data-copy'));
      if (!turn) return;
      navigator.clipboard?.writeText(turn.answer).then(
        () => setStatus(COPY.copied),
        () => setStatus(COPY.copyFailed),
      );
      return;
    }
    const retry = target.closest('[data-retry]');
    if (retry) {
      retryTurn(retry.getAttribute('data-retry') || '');
      return;
    }
    const cite = target.closest('.jensen-cite');
    if (cite) {
      const n = cite.getAttribute('data-n');
      log.querySelectorAll('.jensen-source').forEach((card) => {
        card.classList.toggle('is-hot', card.getAttribute('data-source') === n);
      });
      log.querySelector(`.jensen-source[data-source="${n}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    const link = target.closest('a[href]');
    if (link instanceof HTMLAnchorElement) {
      rememberHighlight(link.getAttribute('data-excerpt') || '', link.href);
      if (isMobile()) {
        returnMode = true;
        closePanel(false);
      }
    }
  });
  log.addEventListener('mouseover', (event) => pulseCite(event.target));
  log.addEventListener('focusin', (event) => pulseCite(event.target));
  function pulseCite(target) {
    const cite = target instanceof Element ? target.closest('.jensen-cite') : null;
    panel.querySelectorAll('.jensen-trace-node').forEach((node) => {
      node.classList.toggle('is-pulse', Boolean(cite) && node.getAttribute('data-n') === cite?.getAttribute('data-n'));
    });
  }
  alert.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-action="new-thread"]')) {
      thread = reduceThread(thread, { type: 'reset' });
      offline = false;
      errorCode = '';
      save();
      paint();
      return;
    }
    if (target.closest('[data-action="retry"]')) {
      const failed = lastTurn();
      if (failed?.status === 'error') {
        retryTurn(failed.id);
        return;
      }
      const question = input.value.trim() || failed?.question || '';
      errorCode = '';
      void submit(question);
      return;
    }
    if (target.closest('[data-action="brief"]')) openBrief();
  });
  closeBtn.addEventListener('click', () => closePanel(true));
  backdrop.addEventListener('click', () => closePanel(true));
  newThreadBtn.addEventListener('click', () => {
    thread = reduceThread(thread, { type: 'reset' });
    offline = false;
    errorCode = '';
    briefDirty = false;
    save();
    paint();
  });
  expandBtn.addEventListener('click', () => {
    const expanded = panel.classList.toggle('is-expanded');
    expandBtn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    expandBtn.setAttribute('aria-label', expanded ? COPY.dock : COPY.expand);
  });
  briefBtn.addEventListener('click', () => openBrief());
  closeSheetBtn.addEventListener('click', closeBrief);
  continueBtn.addEventListener('click', () => {
    if (briefInput.value.trim().length < SIGNAL_MIN) {
      sheetError.hidden = false;
      sheetError.textContent = COPY.briefTooShort;
      return;
    }
    sheetError.hidden = true;
    handoff = 'contact';
    paintSheet();
    nameInput.focus();
  });
  backBtn.addEventListener('click', () => {
    handoff = 'review';
    paintSheet();
    briefInput.focus();
  });
  briefInput.addEventListener('input', () => { briefDirty = true; });
  urlInput.addEventListener('input', () => paintSheet());
  sheetForm.addEventListener('submit', (event) => { void sendBrief(event); });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) closePanel(false);
    if (event.key === 'Escape' && !panel.hidden && panel.contains(document.activeElement)) {
      event.preventDefault();
      if (handoff !== 'closed') closeBrief();
      else closePanel(true);
      return;
    }
    if (event.key !== 'Tab' || panel.hidden || !isMobile()) return;
    const focusable = [...panel.querySelectorAll('button, textarea, input, a[href], summary')]
      .filter((node) => node instanceof HTMLElement && !node.hidden && node.tabIndex !== -1 && !node.disabled
        && node.offsetParent !== null && !node.closest('[inert]'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const viewport = window.visualViewport;
  if (viewport) {
    const applyViewport = () => {
      root.style.setProperty('--jensen-vvh', `${viewport.height}px`);
      root.style.setProperty('--jensen-vv-top', `${viewport.offsetTop}px`);
    };
    viewport.addEventListener('resize', applyViewport);
    viewport.addEventListener('scroll', applyViewport);
    applyViewport();
  }
  window.addEventListener('resize', () => panel.setAttribute('aria-modal', isMobile() ? 'true' : 'false'));
  subscribeReducedMotion((reduced) => {
    motion = reduced ? 'reduced' : 'full';
    panel.dataset.motion = motion;
    if (launcher) launcher.dataset.motion = motion;
  });

  paint();
  applyHighlight();

  api = {
    root,
    open: openPanel,
    close: () => closePanel(true),
    warm: () => preloadTurnstile(root.dataset.sitekey || ''),
    ask(question, autoSend) {
      openPanel();
      if (autoSend && question) void submit(question);
      else if (question) {
        input.value = question;
        grow();
        input.focus();
      }
    },
    onPageLoad() {
      paintChrome();
      applyHighlight();
    },
  };
  return api;
}
