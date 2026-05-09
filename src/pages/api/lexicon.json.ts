/**
 * /api/lexicon.json — full lexicon corpus as machine-readable JSON.
 *
 * Consumed by: external integrations, future RAG pipelines (Jensen),
 * RFP attachments, and the lexicon page's own "Download JSON" button.
 *
 * Shape (schemaVersion 1):
 *   {
 *     source: "Sarif Consulting",
 *     artifact: "lexicon",
 *     schemaVersion: 1,
 *     version: "2026-04-v2",            // human-facing lexicon version
 *     updatedAt: "2026-04-18" | null,
 *     count: 11,
 *     categories: [ { id, label, description, count } ],
 *     entries: [ FullEntry, ... ]
 *   }
 *
 * FullEntry shape is stable; breaking changes increment schemaVersion
 * and (by convention) ship under a parallel path (/api/lexicon.v2.json)
 * rather than silently rewriting the existing one.
 *
 * Cache policy: the corpus is static per build, so we set a long
 * s-maxage. Consumers that want a specific build can pass `?v=<id>`
 * to bust the browser cache; the CDN key ignores query strings by
 * default and keeps serving the edge copy.
 */
import type { APIRoute } from 'astro';
import { buildLexiconGraph, type EnrichedLexiconEntry } from '../../lib/lexicon-graph';

const SCHEMA_VERSION = 1;

function absolutize(site: URL | undefined, path: string): string {
  if (!site) return path;
  const origin = site.toString().replace(/\/$/, '');
  return `${origin}${path}`;
}

function serializeEntry(e: EnrichedLexiconEntry, site: URL | undefined) {
  return {
    id: e.id,
    num: e.num,
    term: e.term,
    termDisplay: e.termDisplay ?? null,
    category: e.category,
    status: e.status,
    aka: e.aka,
    supersededBy: e.supersededBy ?? null,
    lastReviewed: e.lastReviewed ? e.lastReviewed.toISOString().slice(0, 10) : null,
    definition: e.definition,
    matters: e.matters,
    appears: e.appears,
    related: e.related,
    incoming: e.incoming,
    permalink: absolutize(site, e.permalink),
    citation: e.citation,
  };
}

export const GET: APIRoute = async ({ site }) => {
  const graph = await buildLexiconGraph();

  const payload = {
    source: 'Sarif Consulting',
    artifact: 'lexicon',
    schemaVersion: SCHEMA_VERSION,
    version: graph.version,
    updatedAt: graph.updatedAt ? graph.updatedAt.toISOString().slice(0, 10) : null,
    count: graph.count,
    activeCount: graph.activeCount,
    deprecatedCount: graph.deprecatedCount,
    categories: graph.groups.map((g) => ({
      id: g.meta.id,
      label: g.meta.label,
      description: g.meta.description,
      count: g.entries.length,
    })),
    entries: graph.flat.map((e) => serializeEntry(e, site)),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
};
