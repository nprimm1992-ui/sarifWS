/**
 * POST /api/admin/dsar — Data Subject Access Request handler.
 *
 * Authenticated by the same `ADMIN_PURGE_TOKEN` bearer used for /purge.
 * Body (JSON):
 *   { "email": "<subject>", "action": "lookup" | "delete", "reason"?: "..." }
 *
 * Actions:
 *   lookup  — returns metadata (count + status breakdown + date range) for
 *             rows matching the subject's email. Does NOT return raw signal
 *             bodies — compliance is satisfied by proof-of-existence; raw
 *             content flows separately via the operator runbook.
 *   delete  — hard-deletes matching rows across transmissions +
 *             subscriptions. Idempotent on repeat calls.
 *
 * Every invocation writes a row to `dsar_audit` so we can reconstruct the
 * operator's response later. The email is stored as a daily-salted hash,
 * NOT the raw address, so the audit log is itself not a PII leak.
 */

import {
  jsonResponse,
  verifyBearer,
  corsPreflight,
  normalizeEmail,
  validateEmail,
  sanitize,
  hashEmail,
  hashIp,
  extractClientIp,
  nowIso,
  newId,
} from '../_shared/validate.js';
import {
  BODY_LIMITS,
  assertJsonRequest,
  readJsonBody,
} from '../_shared/request-guards.js';

const REASON_MAX = 500;

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const expected = env?.ADMIN_PURGE_TOKEN;
  if (!expected || typeof expected !== 'string') {
    console.error('admin_dsar_token_not_configured');
    return jsonResponse({ error: 'DSAR endpoint not configured' }, 500);
  }
  const authHeader = request.headers.get('Authorization') || '';
  if (!verifyBearer(authHeader, expected)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const ctCheck = assertJsonRequest(request, { maxBytes: BODY_LIMITS.ADMIN });
  if (!ctCheck.ok) return ctCheck.response;

  const parsed = await readJsonBody(request, { maxBytes: BODY_LIMITS.ADMIN });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const action = typeof body.action === 'string' ? body.action : '';
  if (action !== 'lookup' && action !== 'delete') {
    return jsonResponse(
      { error: "action must be 'lookup' or 'delete'." },
      400,
    );
  }

  const email = normalizeEmail(body.email);
  const emailError = validateEmail(email);
  if (emailError) return jsonResponse({ error: emailError }, 400);

  const reason = sanitize(body.reason, REASON_MAX) || null;

  if (!env.DB) {
    console.error('admin_dsar_db_missing');
    return jsonResponse({ error: 'Storage not configured' }, 500);
  }

  const emailHash = await hashEmail(email, env);
  const actorIp = extractClientIp(request);
  const actorIpHash = await hashIp(actorIp, env);

  if (action === 'lookup') {
    try {
      const tx = await env.DB.prepare(
        `SELECT COUNT(*) AS c,
                MIN(received_at) AS first,
                MAX(received_at) AS last
           FROM transmissions
          WHERE prospect_email = ?`,
      )
        .bind(email)
        .all();

      const sub = await env.DB.prepare(
        `SELECT COUNT(*) AS c,
                MIN(received_at) AS first,
                MAX(received_at) AS last
           FROM subscriptions
          WHERE prospect_email = ?`,
      )
        .bind(email)
        .all();

      const statuses = await env.DB.prepare(
        `SELECT status, COUNT(*) AS c
           FROM transmissions
          WHERE prospect_email = ?
          GROUP BY status`,
      )
        .bind(email)
        .all();

      const totalAffected =
        (tx.results?.[0]?.c ?? 0) + (sub.results?.[0]?.c ?? 0);

      await writeAudit(env, {
        action: 'lookup',
        emailHash,
        rowsAffected: totalAffected,
        actorIpHash,
        reason,
      });

      return jsonResponse(
        {
          transmissions: {
            count: tx.results?.[0]?.c ?? 0,
            first_received_at: tx.results?.[0]?.first ?? null,
            last_received_at: tx.results?.[0]?.last ?? null,
            status_breakdown: statuses.results ?? [],
          },
          subscriptions: {
            count: sub.results?.[0]?.c ?? 0,
            first_received_at: sub.results?.[0]?.first ?? null,
            last_received_at: sub.results?.[0]?.last ?? null,
          },
        },
        200,
      );
    } catch (err) {
      console.error('admin_dsar_lookup_failed', {
        message: err?.message ?? String(err),
      });
      return jsonResponse({ error: 'Lookup failed' }, 500);
    }
  }

  // action === 'delete'
  try {
    const txDel = await env.DB.prepare(
      `DELETE FROM transmissions WHERE prospect_email = ?`,
    )
      .bind(email)
      .run();
    const subDel = await env.DB.prepare(
      `DELETE FROM subscriptions WHERE prospect_email = ?`,
    )
      .bind(email)
      .run();

    const rowsAffected =
      (txDel?.meta?.changes ?? 0) + (subDel?.meta?.changes ?? 0);

    await writeAudit(env, {
      action: 'delete',
      emailHash,
      rowsAffected,
      actorIpHash,
      reason,
    });

    return jsonResponse(
      {
        deleted: true,
        transmissions_deleted: txDel?.meta?.changes ?? 0,
        subscriptions_deleted: subDel?.meta?.changes ?? 0,
      },
      200,
    );
  } catch (err) {
    console.error('admin_dsar_delete_failed', {
      message: err?.message ?? String(err),
    });
    return jsonResponse({ error: 'Delete failed' }, 500);
  }
}

async function writeAudit(env, { action, emailHash, rowsAffected, actorIpHash, reason }) {
  if (!env.DB || !emailHash) return;
  try {
    await env.DB.prepare(
      `INSERT INTO dsar_audit (
         id, logged_at, action, email_hash, rows_affected, actor_ip_hash, reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        nowIso(),
        action,
        emailHash,
        rowsAffected,
        actorIpHash,
        reason,
      )
      .run();
  } catch (err) {
    console.error('admin_dsar_audit_write_failed', {
      message: err?.message ?? String(err),
    });
  }
}
