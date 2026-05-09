/**
 * Round-3 P9a — Search index endpoint.
 *
 * Emitted as a static JSON file at `/search-index.json` during
 * `astro build`. The command palette (src/components/CommandPalette.astro)
 * fetches it lazily on first open and performs client-side fuzzy
 * filtering against its entries.
 *
 * Why static JSON vs a server endpoint:
 *   - The site is hosted on Cloudflare Pages. A function endpoint
 *     would add a roundtrip and a cold-start tax for every palette
 *     open; static JSON is edge-cached for free.
 *   - The dataset is < 50 KB even with all content expanded — well
 *     under the budget for a single-fetch client search.
 *   - Deterministic: the index matches the build exactly, so stale
 *     results after a content change cannot silently diverge.
 *
 * Shape per-entry: { id, type, title, url, summary, tags, meta }.
 * `meta` carries per-type facets (lens/horizon/phase for praxis,
 * lexicon num, engagement classification). The palette only ever
 * reads `title`, `summary`, `tags`, and `meta.lens|horizon|phase`
 * for display; other fields live there for future expansion
 * (RAG-lite assistant, P9d).
 */

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

type IndexItem = {
  id: string;
  type: 'praxis' | 'lexicon' | 'engagement' | 'page';
  title: string;
  url: string;
  summary: string;
  tags: string[];
  meta: Record<string, string | number | undefined>;
};

/* Static route catalogue. Kept in source so the palette always
 * surfaces nav entries even when content collections are empty. */
const STATIC_PAGES: IndexItem[] = [
  {
    id: 'page-home',
    type: 'page',
    title: 'Home',
    url: '/',
    summary: 'Landing lobby — overview of Sarif Consulting.',
    tags: ['home', 'landing'],
    meta: {},
  },
  {
    id: 'page-services',
    type: 'page',
    title: 'Services',
    url: '/services/',
    summary: 'Capabilities across intelligence, digital, narrative, and media.',
    tags: ['services', 'capabilities'],
    meta: {},
  },
  {
    id: 'page-engagements-overview',
    type: 'page',
    title: 'Engagements',
    url: '/engagements/',
    summary: 'Case dossiers from recent work.',
    tags: ['engagements', 'case-studies'],
    meta: {},
  },
  {
    id: 'page-lexicon-overview',
    type: 'page',
    title: 'Lexicon',
    url: '/lexicon/',
    summary: 'Operational vocabulary and framework references.',
    tags: ['lexicon', 'terms', 'glossary'],
    meta: {},
  },
  {
    id: 'page-praxis-overview',
    type: 'page',
    title: 'Praxis',
    url: '/praxis/',
    summary: 'Field-notes and long-form analyses.',
    tags: ['praxis', 'articles', 'writing'],
    meta: {},
  },
  {
    id: 'page-about',
    type: 'page',
    title: 'About',
    url: '/about/',
    summary: 'Methodology, team, and operating principles.',
    tags: ['about', 'team'],
    meta: {},
  },
  {
    id: 'page-contact',
    type: 'page',
    title: 'Contact',
    url: '/contact/',
    summary: 'Open a secure transmission.',
    tags: ['contact', 'transmit'],
    meta: {},
  },
];

export const GET: APIRoute = async () => {
  const praxisEntries = await getCollection('praxis', (entry) => !entry.data.draft);
  const lexiconEntries = await getCollection('lexicon');
  const engagementEntries = await getCollection('engagements');

  const praxisItems: IndexItem[] = praxisEntries.map((entry) => ({
    id: `praxis-${entry.id}`,
    type: 'praxis',
    title: entry.data.title,
    url: `/praxis/${entry.id}/`,
    summary: entry.data.summary,
    tags: entry.data.tags,
    meta: {
      lens: entry.data.lens,
      horizon: entry.data.horizon,
      phase: entry.data.phase,
      publishDate: entry.data.publishDate.toISOString(),
    },
  }));

  const lexiconItems: IndexItem[] = lexiconEntries
    /* Deprecated entries are excluded from default palette results
       so users don't land on retired vocabulary first. The term
       remains discoverable via direct URL; future "show deprecated"
       toggle can re-surface them. */
    .filter((entry) => entry.data.status !== 'deprecated')
    .slice()
    .sort((a, b) => (a.data.sort ?? 0) - (b.data.sort ?? 0))
    .map((entry) => ({
      id: `lexicon-${entry.id}`,
      type: 'lexicon',
      title: entry.data.termDisplay ?? entry.data.term,
      url: `/lexicon/#${entry.id}`,
      summary: entry.data.definition,
      tags: [...(entry.data.tags ?? []), ...(entry.data.aka ?? [])],
      meta: {
        num: entry.data.num,
        category: entry.data.category,
        status: entry.data.status,
      },
    }));

  const engagementItems: IndexItem[] = engagementEntries
    .slice()
    .sort((a, b) => (a.data.sort ?? 0) - (b.data.sort ?? 0))
    .map((entry) => ({
      id: `engagement-${entry.id}`,
      type: 'engagement',
      title: entry.data.classification,
      url: `/engagements/#${entry.id}`,
      summary: `${entry.data.sector} · ${entry.data.statValue} ${entry.data.statLabel}`,
      tags: [entry.data.sector, entry.data.accent],
      meta: {
        num: entry.data.num,
        accent: entry.data.accent,
      },
    }));

  /* Round-4 §3.4 — build stamp.
   *
   * Consumers (CommandPalette, PraxisAsk) append `?v=<buildId>` when
   * requesting this file and compare the `buildId` on the parsed payload
   * against their cached copy. If they differ, the in-memory cache is
   * invalidated before the next search. This protects users who keep a
   * tab open across a deploy from silently searching a stale index when
   * the CDN serves a newer copy.
   *
   * BUILD_ID is injected by astro.config.mjs (see the vite.define block)
   * and ultimately sourced from CF_PAGES_COMMIT_SHA / GITHUB_SHA on CI,
   * or a timestamp during local `astro build`. */
  const buildId = (import.meta.env as Record<string, string | undefined>)?.BUILD_ID ?? 'dev';

  const payload = {
    generatedAt: new Date().toISOString(),
    buildId,
    items: [
      ...STATIC_PAGES,
      ...praxisItems,
      ...lexiconItems,
      ...engagementItems,
    ],
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
};
