/**
 * GET /api/admin/vitals — Real-user Web Vitals aggregation (P7e).
 *
 * Auth: Cloudflare Access JWT (verified by functions/api/admin/_middleware.js).
 *       Optional bearer defense-in-depth via `ADMIN_METRICS_TOKEN` when set.
 *
 * Query params:
 *   range  — '24h' | '7d' | '30d'            (default 24h)
 *   page   — exact pathname filter           (optional; default all)
 *
 * Response:
 *   {
 *     ok: true,
 *     range, page_filter,
 *     samples_total,
 *     generated_at,
 *     overall:  [{ name, samples, p50, p75, p95, good_pct }],
 *     by_page:  [{ page, samples, metrics: [{ name, samples, p50, p75, p95, good_pct }] }],
 *     timeseries: [{ bucket, name, samples, p75 }]
 *   }
 *
 * Privacy: no PII. Returns aggregated counts + percentiles only. Raw rows
 * never leave D1; IP hashes and user agents are not surfaced.
 *
 * SQL strategy: SQLite doesn't ship PERCENTILE_CONT, but its window
 * functions + aggregate subselects are enough. For each (name, page)
 * bucket we compute p50/p75/p95 by selecting the NTH row ordered by
 * value_x10k. We clamp the result set to a window of (range × metrics)
 * so even heavy traffic stays under 1ms per-bucket compute.
 */

import { verifyBearer } from '../_shared/validate.js';

const RANGE_MAP = Object.freeze({
  '24h': { hours: 24, bucketHours: 1, maxBuckets: 24 },
  '7d': { hours: 24 * 7, bucketHours: 6, maxBuckets: 28 },
  '30d': { hours: 24 * 30, bucketHours: 24, maxBuckets: 30 },
});

const WEB_VITAL_NAMES = ['LCP', 'INP', 'CLS', 'TTFB', 'FCP'];
const MAX_PAGES_RETURNED = 20;

function jsonOk(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function jsonErr(status, code, message) {
  return new Response(
    JSON.stringify({ ok: false, code, message }),
    {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}

function decodeValue(x10k) {
  if (typeof x10k !== 'number' || !Number.isFinite(x10k)) return 0;
  return x10k / 10_000;
}

/**
 * Compute p50/p75/p95 + good% for a (name, [page?]) slice in one D1
 * round-trip. Uses a CTE to materialize the ordered set once, then
 * selects the row at NTILE boundaries. Works for small samples too
 * (N=1..3) — the MIN() wrapper just returns the single row.
 */
async function computeMetric(env, { name, page, sinceIso }) {
  const bindings = [name, sinceIso];
  let pageClause = '';
  if (page) {
    pageClause = 'AND page = ?';
    bindings.push(page);
  }

  const sql = `
    WITH ordered AS (
      SELECT value_x10k,
             rating,
             ROW_NUMBER() OVER (ORDER BY value_x10k ASC) AS rn,
             COUNT(*)    OVER ()                         AS total
      FROM client_web_vitals
      WHERE name = ?
        AND received_at >= ?
        ${pageClause}
    )
    SELECT
      MAX(total) AS samples,
      MIN(CASE WHEN rn = CAST((total + 1) / 2.0 AS INTEGER) THEN value_x10k END) AS p50,
      MIN(CASE WHEN rn = CAST((total * 75 + 99) / 100 AS INTEGER) THEN value_x10k END) AS p75,
      MIN(CASE WHEN rn = CAST((total * 95 + 99) / 100 AS INTEGER) THEN value_x10k END) AS p95,
      SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) AS good_count
    FROM ordered
  `;

  const { results } = await env.DB.prepare(sql).bind(...bindings).all();
  const row = results?.[0] ?? {};
  const samples = row.samples ?? 0;
  if (samples === 0) {
    return { name, samples: 0, p50: null, p75: null, p95: null, good_pct: null };
  }
  return {
    name,
    samples,
    p50: decodeValue(row.p50 ?? 0),
    p75: decodeValue(row.p75 ?? 0),
    p95: decodeValue(row.p95 ?? 0),
    good_pct: row.good_count != null ? (row.good_count / samples) * 100 : null,
  };
}

async function computeTopPages(env, sinceIso) {
  const { results } = await env.DB.prepare(
    `SELECT page, COUNT(*) AS samples
       FROM client_web_vitals
       WHERE received_at >= ?
       GROUP BY page
       ORDER BY samples DESC
       LIMIT ?`,
  )
    .bind(sinceIso, MAX_PAGES_RETURNED)
    .all();
  return results?.map((r) => ({ page: String(r.page), samples: Number(r.samples) })) ?? [];
}

async function computeTimeseries(env, { name, page, sinceIso, bucketHours }) {
  // Bucket by floor((unixepoch() - since) / bucketSeconds). SQLite's
  // strftime gives us ISO stamps; we compute an integer bucket index in
  // SQL and reformat server-side for human readability.
  const bindings = [name, sinceIso, bucketHours * 3600];
  let pageClause = '';
  if (page) {
    pageClause = 'AND page = ?';
    bindings.push(page);
  }

  const sql = `
    WITH base AS (
      SELECT value_x10k,
             CAST(
               (strftime('%s', received_at) - strftime('%s', ?)) / ?
               AS INTEGER
             ) AS bucket
      FROM client_web_vitals
      WHERE name = ?
        AND received_at >= ?
        ${pageClause}
    ),
    ordered AS (
      SELECT bucket,
             value_x10k,
             ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY value_x10k ASC) AS rn,
             COUNT(*)    OVER (PARTITION BY bucket) AS total
      FROM base
    )
    SELECT bucket,
           MAX(total) AS samples,
           MIN(CASE WHEN rn = CAST((total * 75 + 99) / 100 AS INTEGER) THEN value_x10k END) AS p75
      FROM ordered
      GROUP BY bucket
      ORDER BY bucket ASC
  `;

  const { results } = await env.DB
    .prepare(sql)
    .bind(sinceIso, bucketHours * 3600, name, sinceIso, ...(page ? [page] : []))
    .all();

  return (
    results?.map((r) => ({
      bucket: Number(r.bucket),
      samples: Number(r.samples ?? 0),
      p75: decodeValue(r.p75 ?? 0),
    })) ?? []
  );
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // Secondary bearer check when ADMIN_METRICS_TOKEN is present. Access
  // middleware already ran; this is defense-in-depth for automation that
  // bypasses the browser flow (e.g. a synthetic health check with a
  // service token).
  const metricsToken = env?.ADMIN_METRICS_TOKEN;
  if (metricsToken && typeof metricsToken === 'string') {
    const auth = request.headers.get('Authorization') || '';
    if (!verifyBearer(auth, metricsToken)) {
      return jsonErr(401, 'unauthorized', 'Unauthorized.');
    }
  }

  if (!env?.DB) {
    return jsonErr(500, 'storage_unconfigured', 'Metrics storage not configured.');
  }

  const url = new URL(request.url);
  const rangeKey = url.searchParams.get('range') || '24h';
  const range = RANGE_MAP[rangeKey] || RANGE_MAP['24h'];
  const pageFilter = url.searchParams.get('page')?.slice(0, 255) || null;

  const sinceIso = new Date(Date.now() - range.hours * 3600_000).toISOString();

  try {
    const overall = await Promise.all(
      WEB_VITAL_NAMES.map((name) =>
        computeMetric(env, { name, page: pageFilter, sinceIso }),
      ),
    );

    const topPages = pageFilter
      ? [{ page: pageFilter, samples: 0 }]
      : await computeTopPages(env, sinceIso);

    const byPage = await Promise.all(
      topPages.map(async (p) => {
        const metrics = await Promise.all(
          WEB_VITAL_NAMES.map((name) =>
            computeMetric(env, { name, page: p.page, sinceIso }),
          ),
        );
        const pageSamples = metrics.reduce((a, m) => a + (m.samples || 0), 0);
        return { page: p.page, samples: pageSamples, metrics };
      }),
    );

    // Timeseries: LCP only by default — adding all 5 would 5x the query
    // cost for a visual that's mostly read at a glance.
    const timeseries = await computeTimeseries(env, {
      name: 'LCP',
      page: pageFilter,
      sinceIso,
      bucketHours: range.bucketHours,
    });

    const samplesTotal = overall.reduce((a, m) => a + (m.samples || 0), 0);

    return jsonOk({
      ok: true,
      range: rangeKey,
      page_filter: pageFilter,
      samples_total: samplesTotal,
      generated_at: new Date().toISOString(),
      overall,
      by_page: byPage.filter((p) => p.samples > 0),
      timeseries,
    });
  } catch (err) {
    console.error('admin_vitals_failed', { message: err?.message ?? String(err) });
    return jsonErr(500, 'aggregation_failed', 'Aggregation failed.');
  }
}
