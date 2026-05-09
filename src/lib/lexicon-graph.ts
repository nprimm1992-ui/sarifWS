/**
 * lexicon-graph — build-time enrichment + indexing layer for the lexicon.
 *
 * Single source of truth for every lexicon consumer (page renderer, JSON
 * API endpoints, search-index builder, command palette). Reads the Astro
 * content collection, inverts the `related[]` graph to produce incoming
 * backlinks, groups by category, and exposes a typed surface with
 * zero-author-maintenance derived data.
 *
 * Call sites:
 *   - src/pages/lexicon.astro                (page render)
 *   - src/pages/api/lexicon.json.ts          (full corpus endpoint)
 *   - src/pages/api/lexicon/[id].json.ts     (per-term endpoint)
 *   - src/pages/search-index.json.ts         (palette feed)
 *
 * Invariants:
 *   - Entries without `category` fall into "uncategorized" (render as a
 *     distinct group at the end). Today all 11 seeded entries have a
 *     category; this is defensive for future additions.
 *   - Backlinks are STRICTLY derived from the `related` edges declared
 *     in JSON. We do not mine prose or use LLMs to hallucinate links.
 *   - `updatedAt` is the max `lastReviewed` across entries, which lets
 *     the page surface a single authoritative "updated" stamp without
 *     the author maintaining it separately.
 *
 * Performance: getCollection is memoized by Astro, and the
 * edge-inversion is O(E) where E is the total number of declared
 * related edges (33 today). We do not memoize further here.
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import type { LexiconCategory } from '../content.config';
import { LEXICON_VERSION } from './lexicon-version';

/** Shared "pointer to another lexicon entry" shape — used for outgoing
 *  `related[]` and the computed incoming backlinks. Label is the
 *  human-visible display string; id is the slug used in the URL hash. */
export type LexiconEdge = { id: string; label: string };

/** A lexicon entry enriched with (a) its id (from filename), (b) the
 *  incoming backlinks computed from the rest of the corpus, and (c) a
 *  few render-ready convenience fields so consumers don't reimplement
 *  the citation / permalink shape. */
export type EnrichedLexiconEntry = {
  id: string;
  num: string;
  term: string;
  termDisplay?: string;
  definition: string;
  matters: string;
  appears: string;
  related: LexiconEdge[];
  /**
   * Incoming backlinks — every other entry whose `related[]` points at
   * this entry's id. Computed once per build, zero author cost.
   */
  incoming: LexiconEdge[];
  category: LexiconCategory | 'uncategorized';
  tags: string[];
  aka: string[];
  status: 'active' | 'deprecated';
  supersededBy?: string;
  lastReviewed?: Date;
  relatedTerms: string[];
  sort?: number;
  /** `/lexicon/#id` — relative permalink. Consumers that need an
   *  absolute URL should prepend `Astro.site`. */
  permalink: string;
  /** One-line canonical citation: `SARIF · Lexicon <ver> · L-<num> · <Term>`. */
  citation: string;
};

/** Display metadata per category. Lives here so the page, the pinned
 *  popover, and any future machine consumer get the same strings. */
export type LexiconCategoryMeta = {
  id: LexiconCategory | 'uncategorized';
  label: string;
  description: string;
  /** Two-character abbreviation shown in the left rail glyph slot. */
  glyph: string;
  /** Display order on the page. */
  order: number;
};

export const LEXICON_CATEGORY_META: Record<LexiconCategory | 'uncategorized', LexiconCategoryMeta> = {
  doctrine: {
    id: 'doctrine',
    label: 'Doctrine',
    description: 'What the firm believes — principles, problems, reframings.',
    glyph: 'DO',
    order: 1,
  },
  substrate: {
    id: 'substrate',
    label: 'Substrate',
    description: 'What the firm runs on — proprietary infrastructure.',
    glyph: 'SU',
    order: 2,
  },
  discipline: {
    id: 'discipline',
    label: 'Discipline',
    description: 'How the firm works — standards applied on every deliverable.',
    glyph: 'DI',
    order: 3,
  },
  engagement: {
    id: 'engagement',
    label: 'Engagement',
    description: 'How clients and audience meet the firm — public surfaces.',
    glyph: 'EN',
    order: 4,
  },
  uncategorized: {
    id: 'uncategorized',
    label: 'Uncategorized',
    description: 'Entries pending taxonomic review.',
    glyph: 'UN',
    order: 99,
  },
};

export type LexiconGraph = {
  byId: Map<string, EnrichedLexiconEntry>;
  byCategory: Map<LexiconCategory | 'uncategorized', EnrichedLexiconEntry[]>;
  /** Entries in display order (sort field → num string). */
  flat: EnrichedLexiconEntry[];
  /** Categories in display order, with their populated entry lists. */
  groups: { meta: LexiconCategoryMeta; entries: EnrichedLexiconEntry[] }[];
  version: string;
  /** Max `lastReviewed` across entries; null if no entries declare one. */
  updatedAt: Date | null;
  count: number;
  activeCount: number;
  deprecatedCount: number;
  categoryCount: number;
};

type LexiconCollectionEntry = CollectionEntry<'lexicon'>;

function formatCitation(num: string, termDisplayOrTerm: string): string {
  return `SARIF · Lexicon ${LEXICON_VERSION} · L-${num} · ${termDisplayOrTerm}`;
}

function coerceCategory(raw: string | undefined): LexiconCategory | 'uncategorized' {
  if (raw === 'doctrine' || raw === 'substrate' || raw === 'discipline' || raw === 'engagement') {
    return raw;
  }
  return 'uncategorized';
}

/** Compare by numeric `num` string (zero-padded two-digit, so
 *  lexicographic compare matches numeric compare). Falls back to sort
 *  field if provided. */
function compareEntries(a: LexiconCollectionEntry, b: LexiconCollectionEntry): number {
  const sa = a.data.sort;
  const sb = b.data.sort;
  if (typeof sa === 'number' && typeof sb === 'number' && sa !== sb) return sa - sb;
  return a.data.num.localeCompare(b.data.num);
}

/** Build the complete graph. Expensive pieces (collection read,
 *  backlink inversion) run once per consumer; if multiple consumers
 *  want to share work within a single request they can call this
 *  function and hand the result around. */
export async function buildLexiconGraph(): Promise<LexiconGraph> {
  const rawEntries = await getCollection('lexicon');
  const sorted = rawEntries.slice().sort(compareEntries);

  /* First pass: enrich without incoming — we need every entry present
     in a map before we can invert the edges, since a related target
     may appear later in the corpus. */
  const byId = new Map<string, EnrichedLexiconEntry>();
  for (const entry of sorted) {
    const termDisplayOrTerm = entry.data.termDisplay ?? entry.data.term;
    const enriched: EnrichedLexiconEntry = {
      id: entry.id,
      num: entry.data.num,
      term: entry.data.term,
      termDisplay: entry.data.termDisplay,
      definition: entry.data.definition,
      matters: entry.data.matters,
      appears: entry.data.appears,
      related: entry.data.related ?? [],
      incoming: [],
      category: coerceCategory(entry.data.category),
      tags: entry.data.tags ?? [],
      aka: entry.data.aka ?? [],
      status: entry.data.status,
      supersededBy: entry.data.supersededBy,
      lastReviewed: entry.data.lastReviewed,
      relatedTerms: entry.data.relatedTerms ?? [],
      sort: entry.data.sort,
      permalink: `/lexicon/#${entry.id}`,
      citation: formatCitation(entry.data.num, termDisplayOrTerm),
    };
    byId.set(entry.id, enriched);
  }

  /* Second pass: invert the related edges to populate incoming[]. Use
     a Set to de-duplicate in the pathological case where author lists
     the same related id twice. We prefer the *source* entry's display
     label (termDisplay ?? term) for the incoming pointer, not the
     related edge's own label, because the label that reads best for a
     backlink is the label of the referrer ("Jensen references this"),
     not the referrer's opinion of what this term is called. */
  const incomingSeen = new Map<string, Set<string>>();
  for (const src of byId.values()) {
    for (const edge of src.related) {
      const dst = byId.get(edge.id);
      if (!dst) {
        /* Broken related pointer. Surface via a console warning in dev
           but don't crash the build. */
        console.warn(
          `[lexicon-graph] ${src.id} references unknown entry "${edge.id}". ` +
            `Fix src/content/lexicon/${src.id}.json or the target filename.`,
        );
        continue;
      }
      let seen = incomingSeen.get(dst.id);
      if (!seen) {
        seen = new Set<string>();
        incomingSeen.set(dst.id, seen);
      }
      if (seen.has(src.id)) continue;
      seen.add(src.id);
      dst.incoming.push({
        id: src.id,
        label: src.termDisplay ?? src.term,
      });
    }
  }

  /* Sort incoming edges for stable output (by the referrer's num, so
     backlinks appear in lexicon order regardless of JSON file read
     order). */
  for (const entry of byId.values()) {
    entry.incoming.sort((a, b) => {
      const na = byId.get(a.id)?.num ?? a.id;
      const nb = byId.get(b.id)?.num ?? b.id;
      return na.localeCompare(nb);
    });
  }

  const flat = sorted.map((e) => byId.get(e.id)!);

  /* Group by category. Preserve display order (sort flat order within
     each group) and only include categories that actually have
     entries — empty categories shouldn't render a ghost header. */
  const byCategory = new Map<LexiconCategory | 'uncategorized', EnrichedLexiconEntry[]>();
  for (const entry of flat) {
    const bucket = byCategory.get(entry.category) ?? [];
    bucket.push(entry);
    byCategory.set(entry.category, bucket);
  }

  const groups = Array.from(byCategory.entries())
    .map(([id, entries]) => ({ meta: LEXICON_CATEGORY_META[id], entries }))
    .sort((a, b) => a.meta.order - b.meta.order);

  const lastReviewedDates = flat
    .map((e) => e.lastReviewed)
    .filter((d): d is Date => d instanceof Date);
  const updatedAt = lastReviewedDates.length
    ? new Date(Math.max(...lastReviewedDates.map((d) => d.getTime())))
    : null;

  const activeCount = flat.filter((e) => e.status === 'active').length;
  const deprecatedCount = flat.length - activeCount;

  return {
    byId,
    byCategory,
    flat,
    groups,
    version: LEXICON_VERSION,
    updatedAt,
    count: flat.length,
    activeCount,
    deprecatedCount,
    categoryCount: groups.length,
  };
}

/** Memoized graph accessor. The graph is a pure function of the
 *  on-disk corpus; re-computing it once per `LexiconTermLink`
 *  instance would be wasteful on a page with ten auto-wrapped terms.
 *  Module-scope promise cache is safe because the Astro build process
 *  is single-threaded per worker. */
let _graphPromise: Promise<LexiconGraph> | null = null;
export function getLexiconGraph(): Promise<LexiconGraph> {
  if (!_graphPromise) _graphPromise = buildLexiconGraph();
  return _graphPromise;
}

/** Convenience: month-year string for hero meta ("April 2026"). */
export function formatUpdatedMonth(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Convenience: ISO day ("2026-04-18") for revision lines on entries. */
export function formatIsoDay(d: Date | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}
