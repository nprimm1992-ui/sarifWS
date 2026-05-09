/**
 * POST /api/pickup/:id/claim — atomic single-writer claim.
 *
 * Semantics:
 *   UPDATE transmissions
 *      SET jensen_pickup_at = now
 *    WHERE id = ? AND jensen_pickup_at IS NULL
 *
 * If another Jensen instance already claimed the row, the WHERE clause
 * matches zero rows, changes = 0, and we report { claimed: false,
 * reason: 'already_claimed' }. Prevents double-drafting without needing
 * a lock table.
 *
 * Doctrine: a Jensen claim does NOT move status. The 'triaged' status and
 * 'triaged_at' column are reserved for Nicholas's operator workflow
 * (per the D1 schema comment: "Set when Nicholas opens/acknowledges
 * receipt"). Conflating them would erase Nicholas's review signal from
 * the data. Claim touches only jensen_pickup_at; status moves to
 * 'drafted' or 'refused' when POST /draft lands.
 */

import { jsonResponse, nowIso, corsPreflight } from '../../_shared/validate.js';
import { requireJensenAuth } from '../../_shared/pickup-auth.js';

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context) {
  const { request, env, params } = context;

  const unauthorized = requireJensenAuth(request, env, 'write');
  if (unauthorized) return unauthorized;

  const id = params?.id;
  if (!id || typeof id !== 'string') {
    return jsonResponse({ error: 'Missing transmission id' }, 400);
  }

  if (!env.DB) {
    console.error('d1_binding_missing_on_claim');
    return jsonResponse({ error: 'Storage not configured' }, 500);
  }

  try {
    const result = await env.DB.prepare(
      `UPDATE transmissions
          SET jensen_pickup_at = ?
        WHERE id = ?
          AND jensen_pickup_at IS NULL`,
    )
      .bind(nowIso(), id)
      .run();

    const changes = result?.meta?.changes ?? 0;
    if (changes === 1) {
      return jsonResponse({ claimed: true }, 200);
    }

    // Either the row doesn't exist or it was already claimed. Probe to
    // differentiate (cheap, since id is primary key).
    const { results } = await env.DB.prepare(
      `SELECT jensen_pickup_at FROM transmissions WHERE id = ?`,
    )
      .bind(id)
      .all();

    if (!results || results.length === 0) {
      return jsonResponse({ claimed: false, reason: 'not_found' }, 404);
    }
    return jsonResponse(
      { claimed: false, reason: 'already_claimed' },
      409,
    );
  } catch (err) {
    console.error('pickup_claim_failed', {
      id,
      message: err?.message ?? String(err),
    });
    return jsonResponse({ error: 'Claim failed' }, 500);
  }
}
