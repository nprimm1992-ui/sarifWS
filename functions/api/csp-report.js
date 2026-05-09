/**
 * POST /api/csp-report — Content-Security-Policy violation sink.
 *
 * Accepts the two wire formats browsers currently emit:
 *   1. application/csp-report              — legacy (Chrome stable)
 *   2. application/reports+json            — Reporting API v1
 *
 * Normalizes both into a single `csp_reports` row. Returns 204 unconditionally
 * so browsers do not learn whether the report was accepted. Daily-salted
 * ip_hash buckets throttle the sink at 60/day per unique (ip, directive).
 */

import {
  sanitize,
  hashIp,
  extractClientIp,
  nowIso,
  newId,
} from './_shared/validate.js';

const MAX_BODY_BYTES = 16_384;
const DOC_URI_MAX = 500;
const DIRECTIVE_MAX = 100;
const BLOCKED_URI_MAX = 500;
const SOURCE_FILE_MAX = 500;
const RATE_LIMIT_MAX_PER_DAY = 60;
const NO_CONTENT_STATUS = 204;

function noContent() {
  return new Response(null, {
    status: NO_CONTENT_STATUS,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: NO_CONTENT_STATUS,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function normalizeLegacy(report) {
  if (!report || typeof report !== 'object') return null;
  return {
    documentUri: sanitize(report['document-uri'] ?? report['documentURI'] ?? '', DOC_URI_MAX),
    violatedDirective: sanitize(
      report['violated-directive'] ?? report['violatedDirective'] ?? '',
      DIRECTIVE_MAX,
    ),
    effectiveDirective: sanitize(
      report['effective-directive'] ?? report['effectiveDirective'] ?? '',
      DIRECTIVE_MAX,
    ),
    blockedUri: sanitize(report['blocked-uri'] ?? report['blockedURI'] ?? '', BLOCKED_URI_MAX),
    sourceFile: sanitize(report['source-file'] ?? report['sourceFile'] ?? '', SOURCE_FILE_MAX),
    lineNumber: Number.isFinite(report['line-number']) ? Number(report['line-number']) : null,
    columnNumber: Number.isFinite(report['column-number']) ? Number(report['column-number']) : null,
  };
}

function normalizeReportingApi(entry) {
  if (!entry || typeof entry !== 'object' || entry.type !== 'csp-violation') return null;
  const body = entry.body && typeof entry.body === 'object' ? entry.body : {};
  return {
    documentUri: sanitize(body.documentURL ?? '', DOC_URI_MAX),
    violatedDirective: sanitize(body.effectiveDirective ?? '', DIRECTIVE_MAX),
    effectiveDirective: sanitize(body.effectiveDirective ?? '', DIRECTIVE_MAX),
    blockedUri: sanitize(body.blockedURL ?? '', BLOCKED_URI_MAX),
    sourceFile: sanitize(body.sourceFile ?? '', SOURCE_FILE_MAX),
    lineNumber: Number.isFinite(body.lineNumber) ? Number(body.lineNumber) : null,
    columnNumber: Number.isFinite(body.columnNumber) ? Number(body.columnNumber) : null,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return noContent();

  let raw;
  try {
    raw = await request.text();
  } catch {
    return noContent();
  }
  if (!raw || raw.length > MAX_BODY_BYTES) return noContent();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return noContent();
  }

  const reports = [];
  if (parsed && parsed['csp-report']) {
    const r = normalizeLegacy(parsed['csp-report']);
    if (r) reports.push(r);
  } else if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const r = normalizeReportingApi(entry);
      if (r) reports.push(r);
    }
  } else if (parsed && typeof parsed === 'object') {
    const r = normalizeReportingApi(parsed);
    if (r) reports.push(r);
  }

  if (reports.length === 0) return noContent();
  if (!env?.DB) return noContent();

  const clientIp = extractClientIp(request);
  let ipHash;
  try {
    ipHash = await hashIp(clientIp, env);
  } catch {
    return noContent();
  }

  if (ipHash) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM csp_reports
          WHERE ip_hash = ?
            AND datetime(received_at) > datetime('now','-1 day')`,
      )
        .bind(ipHash)
        .all();
      const count = results?.[0]?.c ?? 0;
      if (count >= RATE_LIMIT_MAX_PER_DAY) return noContent();
    } catch {
      // Swallow; never surface DB state from this sink.
    }
  }

  const userAgent = sanitize(request.headers.get('User-Agent') || '', 200);

  for (const r of reports) {
    if (!r.documentUri || !r.violatedDirective) continue;
    try {
      await env.DB.prepare(
        `INSERT INTO csp_reports (
           id, received_at,
           document_uri, violated_directive, effective_directive,
           blocked_uri, source_file, line_number, column_number,
           user_agent_fp, ip_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          newId(),
          nowIso(),
          r.documentUri,
          r.violatedDirective,
          r.effectiveDirective || null,
          r.blockedUri || null,
          r.sourceFile || null,
          r.lineNumber,
          r.columnNumber,
          userAgent || null,
          ipHash,
        )
        .run();
    } catch {
      // Best-effort; move on to the next report in the batch.
    }
  }

  return noContent();
}
