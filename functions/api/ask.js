/**
 * POST /api/ask — RAG-lite Praxis assistant query log (P9d).
 *
 * Accepts:
 *   - query        (string, ≤ 500 char)
 *   - result_count (int, optional)
 *   - top_result   (string slug, optional)
 *
 * Returns 204 unconditionally (as with other telemetry beacons) so a
 * misconfigured client cannot infer storage state. The endpoint is
 * write-only by design: the search itself happens entirely in the
 * browser against the static search index, so no ranking logic lives
 * here. The log exists to feed editorial planning (what questions are
 * our readers actually asking) and will feed a future LLM-assisted
 * answer surface.
 *
 * PII posture:
 *   - query text is stored in clear because it IS the signal. UI copy
 *     makes this explicit at the point of entry.
 *   - IP is hashed through the daily-rotated salt (hashIp / IP_HASH_SALT).
 *   - No user IDs, cookies, or session tokens are read or written.
 *
 * Rate limiting:
 *   - 5 queries / 10 s per IP (soft, anti-spam).
 *   - 200 queries / day per IP (hard cap, anti-scrape).
 *   - Both enforced via COUNT() on received_at buckets, matching the
 *     pattern in _internal/log.js.
 */

import {
  sanitize,
  hashIp,
  extractClientIp,
  nowIso,
  newId,
} from './_shared/validate.js';
import { isAllowedOrigin, buildCorsHeaders } from './_shared/request-guards.js';

const QUERY_MAX = 500;
const TOP_RESULT_MAX = 128;
const RATE_LIMIT_BURST_MAX = 5;
const RATE_LIMIT_BURST_WINDOW_SECONDS = 10;
const RATE_LIMIT_DAILY_MAX = 200;
/* Round-4 phase-5 polish — when CF-Connecting-IP and X-Forwarded-For
   are both absent we can't bucket by caller, so every unknown-IP
   request would otherwise share a single "no bucket" and bypass
   throttling. Apply a tighter shared-null bucket cap so a broken
   proxy or spoofed header can't pin the endpoint. These are site-
   wide ceilings on *all* null-IP callers collectively, not per-
   caller, so keep them low relative to the per-IP caps. */
const RATE_LIMIT_NULL_BURST_MAX = 3;
const RATE_LIMIT_NULL_DAILY_MAX = 50;
const MAX_BODY_BYTES = 2_048;
const NO_CONTENT_STATUS = 204;
const METHOD_NOT_ALLOWED_STATUS = 405;

function noContent() {
  return new Response(null, {
    status: NO_CONTENT_STATUS,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, {
    status: NO_CONTENT_STATUS,
    headers: {
      'Cache-Control': 'no-store',
      ...buildCorsHeaders(origin),
    },
  });
}

export function onRequest({ request }) {
  /* Block non-POST/OPTIONS explicitly so crawlers don't get a 204 on
     GET and treat the endpoint as scrapable. */
  const method = request.method.toUpperCase();
  if (method === 'POST' || method === 'OPTIONS') return undefined;
  return new Response(null, {
    status: METHOD_NOT_ALLOWED_STATUS,
    headers: { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin)) return noContent();

  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return noContent();

  let raw;
  try {
    raw = await request.text();
  } catch {
    return noContent();
  }
  if (!raw || raw.length > MAX_BODY_BYTES) return noContent();

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return noContent();
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return noContent();

  const query = sanitize(body.query, QUERY_MAX);
  if (!query) return noContent();

  const topResult = sanitize(body.top_result, TOP_RESULT_MAX);
  const resultCount = Number.isFinite(body.result_count)
    ? Math.max(0, Math.min(1_000, Math.trunc(Number(body.result_count))))
    : 0;

  const clientIp = extractClientIp(request);
  let ipHash;
  try {
    ipHash = await hashIp(clientIp, env);
  } catch {
    return noContent();
  }

  if (!env?.DB) return noContent();

  const userAgent = sanitize(request.headers.get('User-Agent') || '', 200);

  try {
    const burstLimit = ipHash ? RATE_LIMIT_BURST_MAX : RATE_LIMIT_NULL_BURST_MAX;
    const dailyLimit = ipHash ? RATE_LIMIT_DAILY_MAX : RATE_LIMIT_NULL_DAILY_MAX;
    /* Two code paths because D1's bound-param placeholder cannot be
       used in an `IS NULL` predicate — sqlite treats `= NULL` as
       always-false rather than a null match. Split the query into a
       hash match and a null-bucket match so both buckets are
       enforceable. */
    const { results } = ipHash
      ? await env.DB.prepare(
          `SELECT
             SUM(CASE WHEN datetime(received_at) > datetime('now', ?) THEN 1 ELSE 0 END) AS burst,
             COUNT(*) AS daily
           FROM ask_queries
           WHERE ip_hash = ?
             AND datetime(received_at) > datetime('now', '-1 day')`,
        )
          .bind(`-${RATE_LIMIT_BURST_WINDOW_SECONDS} seconds`, ipHash)
          .all()
      : await env.DB.prepare(
          `SELECT
             SUM(CASE WHEN datetime(received_at) > datetime('now', ?) THEN 1 ELSE 0 END) AS burst,
             COUNT(*) AS daily
           FROM ask_queries
           WHERE ip_hash IS NULL
             AND datetime(received_at) > datetime('now', '-1 day')`,
        )
          .bind(`-${RATE_LIMIT_BURST_WINDOW_SECONDS} seconds`)
          .all();
    const burst = Number(results?.[0]?.burst ?? 0);
    const daily = Number(results?.[0]?.daily ?? 0);
    if (burst >= burstLimit) return noContent();
    if (daily >= dailyLimit) return noContent();
  } catch {
    /* Rate-limit read failing must not leak into the response. */
  }

  try {
    await env.DB.prepare(
      `INSERT INTO ask_queries (
         id, received_at, query, result_count, top_result,
         user_agent_fp, ip_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        nowIso(),
        query,
        resultCount,
        topResult || null,
        userAgent || null,
        ipHash,
      )
      .run();
  } catch {
    /* Best-effort. 204 in all paths. */
  }

  return noContent();
}
