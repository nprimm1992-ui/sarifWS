/**
 * /api/catalogue.json — the priced catalogue. Floors, not invoices.
 * Jensen must price from this artifact and from nowhere else.
 */
import type { APIRoute } from 'astro';
import { buildCatalogue } from '../../lib/public-corpus';

export const prerender = true;

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(buildCatalogue()), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
};
