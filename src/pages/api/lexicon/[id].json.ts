/**
 * /api/lexicon/[id].json — single lexicon term as JSON.
 *
 * Pre-rendered at build time via getStaticPaths so every entry gets
 * its own edge-cacheable file. A 404 is emitted implicitly by Astro
 * for any unknown id.
 *
 * Shape (schemaVersion 1):
 *   {
 *     source: "Sarif Consulting",
 *     artifact: "lexicon",
 *     schemaVersion: 1,
 *     version: "2026-04-v2",
 *     updatedAt: "2026-04-18" | null,
 *     entry: FullEntry
 *   }
 *
 * FullEntry shape matches /api/lexicon.json entries for consumer
 * ergonomics (one parser, two endpoints).
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { buildLexiconGraph, type EnrichedLexiconEntry } from '../../../lib/lexicon-graph';

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

export const getStaticPaths: GetStaticPaths = async () => {
  const graph = await buildLexiconGraph();
  return graph.flat.map((entry) => ({
    params: { id: entry.id },
    props: { entryId: entry.id },
  }));
};

export const GET: APIRoute = async ({ params, site }) => {
  const id = params.id;
  if (typeof id !== 'string' || !id) {
    return new Response(JSON.stringify({ error: 'missing id' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  const graph = await buildLexiconGraph();
  const entry = graph.byId.get(id);
  if (!entry) {
    return new Response(JSON.stringify({ error: 'not found', id }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const payload = {
    source: 'Sarif Consulting',
    artifact: 'lexicon',
    schemaVersion: SCHEMA_VERSION,
    version: graph.version,
    updatedAt: graph.updatedAt ? graph.updatedAt.toISOString().slice(0, 10) : null,
    entry: serializeEntry(entry, site),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
};
