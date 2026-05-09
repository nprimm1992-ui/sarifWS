/**
 * POST /api/admin/purge — retention enforcement across every telemetry +
 * transmission table managed by this deployment.
 *
 * Auth: bearer ADMIN_PURGE_TOKEN (distinct from JENSEN_PICKUP_TOKEN so a
 * Jensen-side leak never grants deletion rights).
 *
 * Trigger: driven daily by workers/cron-purge (see workers/cron-purge/src/index.js
 * and workers/cron-purge/wrangler.toml). Operators can also invoke manually
 * via the curl runbook in docs/operations/retention-purge.md.
 *
 * Per-table policy (Round 3 audit remediation, Phase 2.1):
 *
 *   | Table                 | Window   | Carve-out                          |
 *   | --------------------- | -------- | ---------------------------------- |
 *   | ask_queries           | 30 days  | none                               |
 *   | cta_clicks            | 30 days  | none                               |
 *   | client_web_vitals     | 30 days  | none                               |
 *   | client_errors         | 30 days  | none                               |
 *   | csp_reports           | 30 days  | none                               |
 *   | transmissions         | 90 days  | status IN ('sent','archived')      |
 *
 * Engaged transmissions (sent / archived) are retained indefinitely; they
 * form the engagement record and are managed by a separate archival process.
 *
 * Implementation notes:
 *
 * - Each table is processed in a chunked loop (CHUNK rows per statement,
 *   up to MAX_CHUNKS per run). D1's per-statement row cap is ~1,000 but
 *   we stay well below so a backlog does not translate into a single
 *   transaction that exceeds worker wall-clock.
 * - Per-table failures are isolated: a bad state in one table never
 *   blocks the others. The response body carries a `results` array with
 *   either `{ purged }` or `{ error }` per table so the calling cron
 *   Worker can log structured output.
 * - datetime(received_at) is coerced on both sides of the compare so
 *   ISO 8601 ('T') and SQLite's default (' ') are aligned at the day
 *   boundary (the same fix that was shipped for transmissions in the
 *   initial phase A build).
 */

import {
  jsonResponse,
  verifyBearer,
  corsPreflight,
} from '../_shared/validate.js';
import { BODY_LIMITS } from '../_shared/request-guards.js';

const TELEMETRY_TABLES = Object.freeze([
  { name: 'ask_queries', days: 30 },
  { name: 'cta_clicks', days: 30 },
  { name: 'client_web_vitals', days: 30 },
  { name: 'client_errors', days: 30 },
  { name: 'csp_reports', days: 30 },
]);
const TRANSMISSIONS_DAYS = 90;
const CHUNK_SIZE = 500;
const MAX_CHUNKS = 20; // 10k rows/table/run ceiling keeps us inside cron budget.

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  /* Defense-in-depth: reject pathologically large admin POSTs early even
     though this endpoint does not consume a body. Caps the damage a
     leaked token would enable. */
  const lengthHeader = request.headers.get('Content-Length');
  if (lengthHeader != null && lengthHeader !== '') {
    const declared = Number(lengthHeader);
    if (Number.isFinite(declared) && declared > BODY_LIMITS.ADMIN) {
      return jsonResponse({ error: 'Payload too large.' }, 413);
    }
  }

  const expected = env?.ADMIN_PURGE_TOKEN;
  if (!expected || typeof expected !== 'string') {
    console.error('admin_purge_token_not_configured');
    return jsonResponse({ error: 'Purge endpoint not configured' }, 500);
  }
  const authHeader = request.headers.get('Authorization') || '';
  if (!verifyBearer(authHeader, expected)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!env.DB) {
    console.error('d1_binding_missing_on_purge');
    return jsonResponse({ error: 'Storage not configured' }, 500);
  }

  const results = [];
  const startedAt = Date.now();

  for (const table of TELEMETRY_TABLES) {
     
    const outcome = await purgeTable(env.DB, {
      table: table.name,
      windowExpr: `-${table.days} days`,
    });
    results.push({ table: table.name, window_days: table.days, ...outcome });
  }

  const txOutcome = await purgeTransmissions(env.DB);
  results.push({
    table: 'transmissions',
    window_days: TRANSMISSIONS_DAYS,
    ...txOutcome,
  });

  const elapsedMs = Date.now() - startedAt;
  const totalPurged = results.reduce(
    (sum, r) => sum + (Number.isFinite(r.purged) ? r.purged : 0),
    0,
  );
  const errors = results.filter((r) => r.error).length;

  console.log('admin_purge_completed', {
    total_purged: totalPurged,
    tables: results,
    elapsed_ms: elapsedMs,
    errors,
  });

  const status = errors === 0 ? 200 : 207; // 207 Multi-Status when partial.
  return jsonResponse(
    {
      total_purged: totalPurged,
      elapsed_ms: elapsedMs,
      errors,
      results,
    },
    status,
  );
}

/**
 * Chunked delete loop for the telemetry tables. Returns `{ purged }` on
 * success or `{ purged, error }` on failure (partial deletes count).
 *
 * We LIMIT the DELETE rather than running an unbounded statement so a
 * long backlog after an outage does not turn into a single huge
 * transaction. SQLite in D1 supports `DELETE ... LIMIT` only when
 * SQLITE_ENABLE_UPDATE_DELETE_LIMIT is compiled in; Cloudflare's build
 * ships with that enabled.
 */
async function purgeTable(db, { table, windowExpr }) {
  let purgedTotal = 0;
  for (let i = 0; i < MAX_CHUNKS; i += 1) {
    try {
       
      const result = await db
        .prepare(
          `DELETE FROM ${table}
           WHERE ROWID IN (
             SELECT ROWID FROM ${table}
             WHERE datetime(received_at) < datetime('now', ?)
             LIMIT ?
           )`,
        )
        .bind(windowExpr, CHUNK_SIZE)
        .run();
      const purged = result?.meta?.changes ?? 0;
      purgedTotal += purged;
      if (purged < CHUNK_SIZE) {
        return { purged: purgedTotal };
      }
    } catch (err) {
      console.error('admin_purge_table_failed', {
        table,
        message: err?.message ?? String(err),
        purged_so_far: purgedTotal,
      });
      return { purged: purgedTotal, error: err?.message ?? String(err) };
    }
  }
  return { purged: purgedTotal, chunk_cap_hit: true };
}

async function purgeTransmissions(db) {
  let purgedTotal = 0;
  let retainedEngaged = 0;
  try {
    const { results: retainedRows } = await db
      .prepare(
        `SELECT COUNT(*) AS c FROM transmissions
          WHERE datetime(received_at) < datetime('now', ?)
            AND status IN ('sent','archived')`,
      )
      .bind(`-${TRANSMISSIONS_DAYS} days`)
      .all();
    retainedEngaged = Number(retainedRows?.[0]?.c ?? 0);
  } catch (err) {
    console.error('admin_purge_transmissions_count_failed', {
      message: err?.message ?? String(err),
    });
  }

  for (let i = 0; i < MAX_CHUNKS; i += 1) {
    try {
       
      const result = await db
        .prepare(
          `DELETE FROM transmissions
           WHERE ROWID IN (
             SELECT ROWID FROM transmissions
             WHERE datetime(received_at) < datetime('now', ?)
               AND status NOT IN ('sent','archived')
             LIMIT ?
           )`,
        )
        .bind(`-${TRANSMISSIONS_DAYS} days`, CHUNK_SIZE)
        .run();
      const purged = result?.meta?.changes ?? 0;
      purgedTotal += purged;
      if (purged < CHUNK_SIZE) {
        return { purged: purgedTotal, retained_engaged: retainedEngaged };
      }
    } catch (err) {
      console.error('admin_purge_transmissions_failed', {
        message: err?.message ?? String(err),
        purged_so_far: purgedTotal,
      });
      return {
        purged: purgedTotal,
        retained_engaged: retainedEngaged,
        error: err?.message ?? String(err),
      };
    }
  }
  return {
    purged: purgedTotal,
    retained_engaged: retainedEngaged,
    chunk_cap_hit: true,
  };
}
