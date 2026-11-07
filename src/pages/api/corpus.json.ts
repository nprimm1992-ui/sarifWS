/**
 * /api/corpus.json — published pages Jensen is allowed to answer from.
 * Static per build. Drafts and external dossier links are excluded.
 */
import type { APIRoute } from 'astro';
import { buildCorpus } from '../../lib/public-corpus';

export const prerender = true;

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(buildCorpus()), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
};
