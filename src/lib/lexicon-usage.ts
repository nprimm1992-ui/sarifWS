/**
 * lexicon-usage — build-time provenance index for lexicon terms.
 *
 * Answers "where is this vocabulary actually used?" by scanning the
 * Praxis and Engagement corpora for each term's alias set, exactly the
 * way rehype-lexicon-link decides what to auto-link in prose:
 *
 *   aliases = term + relatedTerms[] + aka[] + termDisplay lead-in
 *   match   = case-insensitive, word-boundary
 *
 * Derived, never authored: nothing here asks a writer to maintain a
 * back-reference list, and nothing is inferred by an LLM. If a term
 * shows up in an article, that article appears in the term's inspector;
 * if it doesn't, the inspector says so.
 *
 * Cost: O(terms × documents) regex scans at build time only (11 × 18
 * today). Memoized per build process.
 */

import { getCollection } from 'astro:content';

export type LexiconUsageRef = {
  kind: 'praxis' | 'engagement';
  /** Collection entry id — also the route slug. */
  id: string;
  title: string;
  href: string;
  /** Occurrences across the scanned text — drives ordering. */
  hits: number;
};

export type LexiconUsage = {
  praxis: LexiconUsageRef[];
  engagements: LexiconUsageRef[];
  total: number;
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Engagement titles live inside `classification` ("Engagement 001 — Policy
 *  Infrastructure"); the dossier page shows the part after the em dash. */
function engagementTitle(classification: string): string {
  const parts = classification.split('—');
  return (parts.length > 1 ? parts.slice(1).join('—') : classification).trim();
}

function countHits(text: string, aliases: string[]): number {
  let hits = 0;
  for (const alias of aliases) {
    const matches = text.match(new RegExp(`\\b${escapeRegex(alias)}\\b`, 'gi'));
    if (matches) hits += matches.length;
  }
  return hits;
}

let cache: Promise<Map<string, LexiconUsage>> | null = null;

async function build(): Promise<Map<string, LexiconUsage>> {
  const [lexicon, praxis, engagements] = await Promise.all([
    getCollection('lexicon'),
    getCollection('praxis'),
    getCollection('engagements'),
  ]);

  const documents: { kind: 'praxis' | 'engagement'; id: string; title: string; href: string; text: string }[] = [];

  for (const entry of praxis) {
    if (entry.data.draft) continue;
    documents.push({
      kind: 'praxis',
      id: entry.id,
      title: entry.data.title,
      href: `/praxis/${entry.id}/`,
      text: [entry.data.title, entry.data.summary, entry.data.tags.join(' '), entry.body ?? ''].join('\n'),
    });
  }

  for (const entry of engagements) {
    documents.push({
      kind: 'engagement',
      id: entry.id,
      title: engagementTitle(entry.data.classification),
      href: `/engagements/${entry.id}/`,
      text: [
        entry.data.classification,
        entry.data.sector,
        entry.data.statValue,
        entry.data.statLabel,
        ...entry.data.leads,
        ...entry.data.highlights,
      ].join('\n'),
    });
  }

  const out = new Map<string, LexiconUsage>();

  for (const term of lexicon) {
    const data = term.data;
    const aliasSet = new Map<string, string>();
    const push = (value?: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!aliasSet.has(key)) aliasSet.set(key, trimmed);
    };
    push(data.term);
    for (const alias of data.relatedTerms ?? []) push(alias);
    for (const alias of data.aka ?? []) push(alias);
    push(data.termDisplay?.split(' — ')[0]);
    const aliases = Array.from(aliasSet.values());

    const refs: LexiconUsageRef[] = [];
    for (const doc of documents) {
      const hits = countHits(doc.text, aliases);
      if (hits === 0) continue;
      refs.push({ kind: doc.kind, id: doc.id, title: doc.title, href: doc.href, hits });
    }

    const order = (a: LexiconUsageRef, b: LexiconUsageRef) =>
      b.hits - a.hits || a.title.localeCompare(b.title);

    out.set(term.id, {
      praxis: refs.filter((r) => r.kind === 'praxis').sort(order),
      engagements: refs.filter((r) => r.kind === 'engagement').sort(order),
      total: refs.length,
    });
  }

  return out;
}

export function getLexiconUsage(): Promise<Map<string, LexiconUsage>> {
  if (!cache) cache = build();
  return cache;
}
