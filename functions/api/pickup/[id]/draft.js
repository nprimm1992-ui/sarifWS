/**
 * POST /api/pickup/:id/draft — write Jensen's draft reply back.
 *
 * Request body (JSON):
 *   jensen_trace_id          string (required) — Jensen-side correlation id
 *   draft_subject            string (required)
 *   draft_body               string (required)
 *   draft_activated_concepts string[] (optional) — lexicon slugs
 *   draft_confidence_band    "clear" | "partial" | "unclear" (optional)
 *   draft_refusal_reason     string | null (optional)
 *   jensen_metadata          object (optional) — non-critical flags
 *
 * Status transitions:
 *   refusal_reason non-null  →  status = 'refused'
 *   otherwise                →  status = 'drafted', drafted_at = now
 *
 * Precondition: the row must already be claimed (jensen_pickup_at NOT NULL).
 * A draft without a preceding claim is a protocol violation and returns 409.
 *
 * Size caps: draft_body 50,000 chars; draft_subject 400 chars;
 * concepts JSON serializes to < 4,000 chars. These are generous defaults
 * that prevent a pathologically large Jensen response from blowing D1 rows.
 */

import {
  jsonResponse,
  nowIso,
  sanitize,
  corsPreflight,
} from '../../_shared/validate.js';
import {
  BODY_LIMITS,
  assertJsonRequest,
  readJsonBody,
} from '../../_shared/request-guards.js';
import { requireJensenAuth } from '../../_shared/pickup-auth.js';

const DRAFT_LIMITS = Object.freeze({
  SUBJECT: 400,
  BODY: 50_000,
  TRACE_ID: 128,
  REFUSAL_REASON: 2_000,
  CONCEPTS_JSON: 4_000,
  METADATA_JSON: 4_000,
});

const CONFIDENCE_BANDS = new Set(['clear', 'partial', 'unclear']);

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

  const ctCheck = assertJsonRequest(request, { maxBytes: BODY_LIMITS.PICKUP_WRITE });
  if (!ctCheck.ok) return ctCheck.response;

  const parsed = await readJsonBody(request, { maxBytes: BODY_LIMITS.PICKUP_WRITE });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const traceId = sanitize(body.jensen_trace_id, DRAFT_LIMITS.TRACE_ID);
  const subject = sanitize(body.draft_subject, DRAFT_LIMITS.SUBJECT);
  const draftBody = sanitize(body.draft_body, DRAFT_LIMITS.BODY);
  const refusalReasonRaw = body.draft_refusal_reason;
  const refusalReason =
    refusalReasonRaw === null || refusalReasonRaw === undefined
      ? null
      : sanitize(refusalReasonRaw, DRAFT_LIMITS.REFUSAL_REASON);

  const confidenceBand =
    typeof body.draft_confidence_band === 'string'
      ? body.draft_confidence_band
      : null;
  if (confidenceBand !== null && !CONFIDENCE_BANDS.has(confidenceBand)) {
    return jsonResponse(
      {
        error:
          "draft_confidence_band must be one of: 'clear', 'partial', 'unclear'.",
      },
      400,
    );
  }

  // Validate: a refusal shortcuts the subject/body requirement; otherwise
  // subject + body are mandatory.
  if (!traceId) {
    return jsonResponse({ error: 'jensen_trace_id is required.' }, 400);
  }
  if (!refusalReason && (!subject || !draftBody)) {
    return jsonResponse(
      {
        error:
          'Non-refusal drafts require draft_subject and draft_body.',
      },
      400,
    );
  }

  const activatedConceptsJson = Array.isArray(body.draft_activated_concepts)
    ? JSON.stringify(body.draft_activated_concepts).slice(
        0,
        DRAFT_LIMITS.CONCEPTS_JSON,
      )
    : null;

  const metadataJson =
    body.jensen_metadata && typeof body.jensen_metadata === 'object'
      ? JSON.stringify(body.jensen_metadata).slice(
          0,
          DRAFT_LIMITS.METADATA_JSON,
        )
      : null;

  if (!env.DB) {
    console.error('d1_binding_missing_on_draft');
    return jsonResponse({ error: 'Storage not configured' }, 500);
  }

  // Confirm the row is claimed before we accept the draft, and enforce
  // idempotency so a repeat POST cannot silently overwrite a prior draft.
  const forceOverwrite = body.force === true;
  try {
    const { results } = await env.DB.prepare(
      `SELECT jensen_pickup_at, status, jensen_trace_id
         FROM transmissions
        WHERE id = ?`,
    )
      .bind(id)
      .all();

    if (!results || results.length === 0) {
      return jsonResponse({ error: 'Transmission not found' }, 404);
    }
    const row = results[0];
    if (!row.jensen_pickup_at) {
      return jsonResponse(
        {
          error:
            'Transmission must be claimed via /claim before posting a draft.',
        },
        409,
      );
    }
    if (row.status === 'sent' || row.status === 'archived') {
      return jsonResponse(
        {
          error: `Draft refused: transmission status is '${row.status}'.`,
        },
        409,
      );
    }
    if (row.status === 'drafted' || row.status === 'refused') {
      if (!forceOverwrite) {
        return jsonResponse(
          {
            error:
              `Draft already exists (status '${row.status}'). Re-POST with "force": true and a new jensen_trace_id to overwrite.`,
          },
          409,
        );
      }
      if (row.jensen_trace_id && row.jensen_trace_id === traceId) {
        return jsonResponse(
          {
            error:
              'Overwrite refused: jensen_trace_id matches the existing draft. Supply a new trace id.',
          },
          409,
        );
      }
    }
  } catch (err) {
    console.error('pickup_draft_precheck_failed', {
      id,
      message: err?.message ?? String(err),
    });
    return jsonResponse({ error: 'Draft precheck failed' }, 500);
  }

  // Dispatch the update. Separate SQL branches keep the bind order obvious.
  try {
    if (refusalReason) {
      await env.DB.prepare(
        `UPDATE transmissions
            SET jensen_trace_id = ?,
                draft_refusal_reason = ?,
                draft_activated_concepts = ?,
                draft_confidence_band = ?,
                jensen_metadata = ?,
                status = 'refused'
          WHERE id = ?`,
      )
        .bind(
          traceId,
          refusalReason,
          activatedConceptsJson,
          confidenceBand,
          metadataJson,
          id,
        )
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE transmissions
            SET jensen_trace_id = ?,
                draft_subject = ?,
                draft_body = ?,
                draft_activated_concepts = ?,
                draft_confidence_band = ?,
                draft_refusal_reason = NULL,
                jensen_metadata = ?,
                drafted_at = ?,
                status = 'drafted'
          WHERE id = ?`,
      )
        .bind(
          traceId,
          subject,
          draftBody,
          activatedConceptsJson,
          confidenceBand,
          metadataJson,
          nowIso(),
          id,
        )
        .run();
    }

    return jsonResponse({ updated: true }, 200);
  } catch (err) {
    console.error('pickup_draft_failed', {
      id,
      message: err?.message ?? String(err),
    });
    return jsonResponse({ error: 'Draft write failed' }, 500);
  }
}
