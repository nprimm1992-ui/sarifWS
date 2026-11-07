/** Deterministic brief. No model call. The visitor edits the result before it is sent. */

export const SIGNAL_MIN = 20;
export const SIGNAL_MAX = 10_000;
const SENTENCE_MAX = 280;
const PAD = 'Visitor asked Jensen on sarifconsulting.ai.';

export function firstSentence(text) {
  const flat = String(text || '')
    .replace(/\[(\d{1,3})\]/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.!?…])/g, '$1')
    .trim();
  if (!flat) return '';
  const match = flat.match(/^.{1,280}?[.!?…](?=\s|$)/u);
  if (match) return match[0];
  return flat.length <= SENTENCE_MAX ? flat : `${flat.slice(0, SENTENCE_MAX - 1)}…`;
}

export function composeBrief({ turns, scopeBrief, page }) {
  const parts = [];
  if (page?.title) parts.push(`Page: ${page.title} (${page.path || '/'})`);
  if (scopeBrief) parts.push(String(scopeBrief).trim());
  for (const turn of turns || []) {
    if (!turn?.question) continue;
    parts.push(`Q: ${turn.question.trim()}`);
    const sentence = firstSentence(turn.answer);
    if (sentence) parts.push(`A: ${sentence}`);
  }
  let text = parts.join('\n\n').trim();
  if (text.length < SIGNAL_MIN) text = `${text}\n\n${PAD}`.trim();
  if (text.length > SIGNAL_MAX) text = text.slice(0, SIGNAL_MAX);
  return text;
}
