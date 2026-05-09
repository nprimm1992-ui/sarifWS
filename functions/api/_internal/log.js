/**
 * POST /api/_internal/log — Client error + Web Vitals beacon sink.
 *
 * Dispatches on the request body's `type` discriminator:
 *   - absent / 'error' / 'unhandledrejection' → client_errors.
 *   - 'web_vital'                             → client_web_vitals (Pillar 4b).
 *
 * Always returns 204 regardless of outcome so the client has no
 * side-channel into our storage state. Hard caps:
 *   - Accepts only application/json or text/plain (sendBeacon default).
 *   - Rejects non-matching Origin when one is present.
 *   - Throttles per daily-rotated ip_hash on each table (separate budgets).
 *   - Errors: page, message (500 char), stack_fp (64 char), source.
 *   - Web vitals: page, name, value (int * 10000), rating, metric_id,
 *     navigation_type. No URLs, no query strings, no session tokens.
 */

import {
  sanitize,
  hashIp,
  extractClientIp,
  nowIso,
  newId,
} from '../_shared/validate.js';
import { isAllowedOrigin, buildCorsHeaders } from '../_shared/request-guards.js';

const PAGE_MAX = 255;
const MESSAGE_MAX = 500;
const METRIC_NAME_MAX = 32;
const METRIC_ID_MAX = 64;
const METRIC_RATING_MAX = 16;
const METRIC_NAV_TYPE_MAX = 32;
const CTA_ID_MAX = 64;
const CTA_VARIANT_MAX = 32;
const CTA_RATE_LIMIT_MAX_PER_DAY = 300;
const SOURCE_VALUES = new Set(['error', 'unhandledrejection']);
const WEB_VITAL_NAMES = new Set(['LCP', 'INP', 'CLS', 'TTFB', 'FCP']);
const WEB_VITAL_RATINGS = new Set(['good', 'needs-improvement', 'poor', '']);
/* Round-trip precision scale for value_x10k: CLS (~0.0–1.0) retains 4
   decimal places; time metrics (ms) retain 4 decimals rarely needed but
   lossless for sub-ms values. One column, mixed units — name column
   disambiguates at query time. */
const METRIC_VALUE_SCALE = 10_000;
/* Defensive value ceiling: LCP on a catastrophic page can legitimately
   reach tens of seconds, but values above 5 minutes are almost certainly
   measurement errors (prerender bleed, clock skew). Clamp then store. */
const METRIC_VALUE_MAX_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 8_192;
const RATE_LIMIT_MAX_PER_DAY = 30;
/* Web Vitals generate ~5 events per pageload, with bfcache re-fires. A
   legitimate user browsing 20 pages produces ~100 events per day.
   200/day cap leaves headroom for heavy users without letting a runaway
   client flood the endpoint. */
const WEB_VITAL_RATE_LIMIT_MAX_PER_DAY = 200;
const NO_CONTENT_STATUS = 204;

function noContent() {
  return new Response(null, {
    status: NO_CONTENT_STATUS,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin');
  return new Response(null, {
    status: NO_CONTENT_STATUS,
    headers: {
      'Cache-Control': 'no-store',
      ...buildCorsHeaders(origin),
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Origin gate: sendBeacon may omit Origin; if present, require allowlist.
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin)) {
    return noContent();
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return noContent();
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return noContent();
  }

  if (!raw || raw.length > MAX_BODY_BYTES) {
    return noContent();
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return noContent();
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return noContent();
  }

  const clientIp = extractClientIp(request);
  let ipHash;
  try {
    ipHash = await hashIp(clientIp, env);
  } catch {
    // Prod without salt still returns 204; never 500 from the beacon.
    return noContent();
  }

  if (!env?.DB) {
    return noContent();
  }

  const userAgent = sanitize(request.headers.get('User-Agent') || '', 200);

  /* Dispatch on the explicit `type` discriminator. Legacy beacons (no
     type field) fall through to the error path so we don't break the
     live client. */
  const type = typeof body.type === 'string' ? body.type : '';
  if (type === 'web_vital') {
    await persistWebVital(env, body, { ipHash, userAgent });
    return noContent();
  }

  if (type === 'cta_click') {
    await persistCtaClick(env, body, { ipHash, userAgent });
    return noContent();
  }

  await persistError(env, body, { ipHash, userAgent });
  return noContent();
}

async function persistCtaClick(env, body, { ipHash, userAgent }) {
  const page = sanitize(body.page, PAGE_MAX);
  const ctaId = sanitize(body.cta_id, CTA_ID_MAX);
  const ctaVariant = sanitize(body.cta_variant, CTA_VARIANT_MAX);

  if (!page || !ctaId) return;

  if (ipHash) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM cta_clicks
          WHERE ip_hash = ?
            AND datetime(received_at) > datetime('now','-1 day')`,
      )
        .bind(ipHash)
        .all();
      const count = results?.[0]?.c ?? 0;
      if (count >= CTA_RATE_LIMIT_MAX_PER_DAY) return;
    } catch {
      // Never surface rate-limit state back to the client.
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO cta_clicks (
         id, received_at, page, cta_id, cta_variant,
         user_agent_fp, ip_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        nowIso(),
        page,
        ctaId,
        ctaVariant || null,
        userAgent || null,
        ipHash,
      )
      .run();
  } catch {
    // Best-effort; do not leak persistence state to the client.
  }
}

async function persistError(env, body, { ipHash, userAgent }) {
  const page = sanitize(body.page, PAGE_MAX);
  const message = sanitize(body.message, MESSAGE_MAX);
  const stackFp = sanitize(body.stack_fp, 64);
  const source = typeof body.source === 'string' ? body.source : '';

  if (!page || !message || !stackFp) return;
  if (!SOURCE_VALUES.has(source)) return;

  if (ipHash) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM client_errors
          WHERE ip_hash = ?
            AND datetime(received_at) > datetime('now','-1 day')`,
      )
        .bind(ipHash)
        .all();
      const count = results?.[0]?.c ?? 0;
      if (count >= RATE_LIMIT_MAX_PER_DAY) return;
    } catch {
      // Swallow; we do NOT want the beacon to leak rate-limit state.
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO client_errors (
         id, received_at, page, message, stack_fp, source,
         user_agent_fp, ip_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId(), nowIso(), page, message, stackFp, source, userAgent || null, ipHash)
      .run();
  } catch {
    // D1 insert failure is not surfaced — beacon is best-effort.
  }
}

async function persistWebVital(env, body, { ipHash, userAgent }) {
  const page = sanitize(body.page, PAGE_MAX);
  const name = sanitize(body.name, METRIC_NAME_MAX);
  const rating = sanitize(body.rating, METRIC_RATING_MAX);
  const metricId = sanitize(body.id, METRIC_ID_MAX);
  const navigationType = sanitize(body.navigation_type, METRIC_NAV_TYPE_MAX);
  const rawValue = body.value;

  if (!page || !name) return;
  if (!WEB_VITAL_NAMES.has(name)) return;
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return;
  if (rawValue < 0 || rawValue > METRIC_VALUE_MAX_MS) return;
  if (rating && !WEB_VITAL_RATINGS.has(rating)) return;

  const valueX10k = Math.round(rawValue * METRIC_VALUE_SCALE);

  if (ipHash) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM client_web_vitals
          WHERE ip_hash = ?
            AND datetime(received_at) > datetime('now','-1 day')`,
      )
        .bind(ipHash)
        .all();
      const count = results?.[0]?.c ?? 0;
      if (count >= WEB_VITAL_RATE_LIMIT_MAX_PER_DAY) return;
    } catch {
      // Swallow. Absent/unmigrated table also falls through here and is
      // handled by the INSERT catch below.
    }
  }

  /* ON CONFLICT target must match the partial unique index created in
     migration 0007 (`... ON client_web_vitals(metric_id) WHERE
     metric_id IS NOT NULL`). SQLite requires the WHERE predicate on the
     conflict target to be textually equivalent to the index predicate,
     otherwise the upsert falls through to a plain INSERT that will
     collide and abort. Rows with metric_id = NULL are not covered by
     the partial index and are therefore always plain inserts, which is
     the intended behavior for client-provided ids we cannot dedupe on. */
  try {
    await env.DB.prepare(
      `INSERT INTO client_web_vitals (
         id, received_at, page, name, value_x10k, rating,
         metric_id, navigation_type, user_agent_fp, ip_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(metric_id) WHERE metric_id IS NOT NULL DO UPDATE SET
         received_at = excluded.received_at,
         value_x10k = excluded.value_x10k,
         rating = excluded.rating,
         navigation_type = excluded.navigation_type`,
    )
      .bind(
        newId(),
        nowIso(),
        page,
        name,
        valueX10k,
        rating || null,
        metricId || null,
        navigationType || null,
        userAgent || null,
        ipHash,
      )
      .run();
  } catch {
    // D1 insert failure (including missing table in an un-migrated env)
    // is silently swallowed — beacon is best-effort.
  }
}
