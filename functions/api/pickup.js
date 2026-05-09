/**
 * GET /api/pickup — Jensen-side unclaimed transmissions queue.
 *
 * Auth: bearer JENSEN_PICKUP_TOKEN (constant-time compare).
 * Filter: jensen_pickup_at IS NULL AND status = 'received'.
 * Order: oldest first (FIFO), capped at 50.
 *
 * This endpoint ships dormant in Phase A. The Jensen app will consume it
 * once its contact_drafting surface mode is live. It is authenticated and
 * read-only; the paired POST /api/pickup/:id/claim handles the atomic
 * claim to prevent two Jensen instances from drafting the same signal.
 */

import { jsonResponse, corsPreflight } from './_shared/validate.js';
import { requireJensenAuth } from './_shared/pickup-auth.js';

const PICKUP_LIMIT = 50;

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const unauthorized = requireJensenAuth(request, env, 'read');
  if (unauthorized) return unauthorized;

  if (!env.DB) {
    console.error('d1_binding_missing_on_pickup');
    return jsonResponse({ error: 'Storage not configured' }, 500);
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, reference_id, received_at, raw_signal,
              prospect_name, prospect_email, prospect_organization,
              lexicon_version
         FROM transmissions
        WHERE jensen_pickup_at IS NULL
          AND status = 'received'
        ORDER BY received_at ASC
        LIMIT ?`,
    )
      .bind(PICKUP_LIMIT)
      .all();

    return jsonResponse({ transmissions: results ?? [] }, 200);
  } catch (err) {
    console.error('pickup_list_failed', {
      message: err?.message ?? String(err),
    });
    return jsonResponse({ error: 'Pickup query failed' }, 500);
  }
}
