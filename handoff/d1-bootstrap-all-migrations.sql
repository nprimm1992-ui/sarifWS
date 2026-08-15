-- ============================================================
-- Sarif Consulting — D1 schema bootstrap
-- Database: sarif-transmissions (241371f5-cdd6-4cf7-9ac1-cea637816af3)
-- Contains migrations 0001-0010 concatenated IN ORDER.
--
-- RUN THIS EXACTLY ONCE, against a database with ZERO tables.
--
-- Most statements are idempotent (CREATE TABLE/INDEX IF NOT EXISTS), BUT
-- migration 0004 uses two `ALTER TABLE ... ADD COLUMN` statements, and
-- SQLite has no `ADD COLUMN IF NOT EXISTS`. Re-running this whole script
-- on an already-migrated database therefore FAILS with:
--     duplicate column name: idempotency_key
-- That failure is safe (it aborts before doing damage) but it means this
-- file is NOT a general-purpose "sync" script.
--
-- Verified 2026-08: executes cleanly on an empty SQLite database, producing
-- 8 tables and 29 indexes (including uq_transmissions_idempotency_key).
--
-- No BEGIN/COMMIT: D1 manages transactions per statement/batch.
-- ============================================================

-- >>>>>>>>>>>>>>>> BEGIN 0001_transmissions.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — transmissions store
-- D1 (SQLite 3.45+). Enum constraints via CHECK; all timestamps UTC ISO 8601.
-- Migration 0001: initial schema for the Contact Transmission Rebuild (Phase A, scope B).
--
-- Retention: 90 days for rows with status NOT IN ('sent','archived'); the
-- engaged subset is retained indefinitely as the engagement record. Daily
-- enforcement lives in workers/cron-purge (daily cron) which POSTs to
-- functions/api/admin/purge.js.

CREATE TABLE IF NOT EXISTS transmissions (
  -- Identity
  id TEXT PRIMARY KEY,                          -- UUID v4, generated at API
  reference_id TEXT NOT NULL UNIQUE,            -- Internal only: TX-YYYY-MM-XXXX; never shown to prospect

  -- Lifecycle timestamps (UTC ISO 8601)
  received_at TEXT NOT NULL,                    -- Set at insert
  triaged_at TEXT,                              -- Set when Nicholas opens/acknowledges receipt
  jensen_pickup_at TEXT,                        -- Set atomically when Jensen claims (prevents double-processing)
  drafted_at TEXT,                              -- Set when Jensen writes a draft back
  sent_at TEXT,                                 -- Set when Nicholas sends acknowledgment

  -- Status (schema-level + API-layer defense in depth)
  status TEXT NOT NULL DEFAULT 'received'
    CHECK(status IN ('received','triaged','drafted','sent','refused','ignored','archived')),

  -- Raw signal (API caps 20 <= len <= 10000)
  raw_signal TEXT NOT NULL,
  signal_length INTEGER NOT NULL,

  -- Contact details (prospect-provided)
  prospect_name TEXT NOT NULL,
  prospect_email TEXT NOT NULL,                 -- Lowercased at API
  prospect_organization TEXT,                   -- Nullable

  -- Jensen integration (populated by /api/pickup once Jensen-side is live)
  jensen_trace_id TEXT,
  draft_subject TEXT,
  draft_body TEXT,
  draft_activated_concepts TEXT,                -- JSON array of lexicon slugs
  draft_confidence_band TEXT
    CHECK(draft_confidence_band IS NULL
          OR draft_confidence_band IN ('clear','partial','unclear')),
  draft_refusal_reason TEXT,
  jensen_metadata TEXT,                         -- JSON escape-hatch for non-critical Jensen flags

  -- Corpus pointer (lookup lexicon state from git at this version)
  lexicon_version TEXT NOT NULL,

  -- Audit / abuse analysis
  ip_hash TEXT,                                 -- SHA-256(ip + daily_salt) — rate-limit, not tracking
  user_agent_fp TEXT,                           -- First 200 chars of UA; truncated for D1 efficiency
  consent_version TEXT NOT NULL                 -- Which consent-line wording the prospect saw
);

CREATE INDEX IF NOT EXISTS idx_transmissions_status             ON transmissions(status);
CREATE INDEX IF NOT EXISTS idx_transmissions_received_at        ON transmissions(received_at);
CREATE INDEX IF NOT EXISTS idx_transmissions_jensen_pickup_at   ON transmissions(jensen_pickup_at);
CREATE INDEX IF NOT EXISTS idx_transmissions_jensen_trace_id    ON transmissions(jensen_trace_id);
CREATE INDEX IF NOT EXISTS idx_transmissions_prospect_email     ON transmissions(prospect_email);

-- Composite index supporting the rate-limit query:
--   SELECT COUNT(*) FROM transmissions
--     WHERE ip_hash = ? AND received_at > datetime('now','-1 day');
-- Cheap on small tables; future-proofs abuse checks at scale.
CREATE INDEX IF NOT EXISTS idx_transmissions_ip_hash_received ON transmissions(ip_hash, received_at);

-- >>>>>>>>>>>>>>>> END 0001_transmissions.sql <<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>> BEGIN 0002_subscriptions.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — Praxis subscription intake
-- D1 (SQLite 3.45+). Mirrors transmissions' privacy/audit columns for rate-limit parity.
-- Migration 0002: adds subscriptions table used by the Praxis subscribe form (/api/contact).

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,                          -- UUID v4, generated at API
  received_at TEXT NOT NULL,                    -- UTC ISO 8601 at insert

  -- Contact details (prospect-provided)
  prospect_name TEXT NOT NULL,
  prospect_email TEXT NOT NULL,                 -- Lowercased at API
  prospect_organization TEXT,                   -- Nullable
  service TEXT,                                 -- Interest tag from the form
  brief TEXT,                                   -- Short note (capped at API)

  -- Audit / abuse analysis (daily-rotated hash; NOT the raw IP)
  ip_hash TEXT,
  user_agent_fp TEXT,
  consent_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_received_at        ON subscriptions(received_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_prospect_email     ON subscriptions(prospect_email);

-- Composite index supporting the rate-limit query:
--   SELECT COUNT(*) FROM subscriptions
--     WHERE ip_hash = ? AND datetime(received_at) > datetime('now','-1 day');
CREATE INDEX IF NOT EXISTS idx_subscriptions_ip_hash_received   ON subscriptions(ip_hash, received_at);

-- >>>>>>>>>>>>>>>> END 0002_subscriptions.sql <<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>> BEGIN 0003_client_errors.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — client error beacon
-- D1 (SQLite 3.45+). All timestamps UTC ISO 8601.
-- Migration 0003: reliability observability (Phase B).
--
-- The client-side `/src/scripts/telemetry.js` wires `window.error` +
-- `unhandledrejection` handlers and POSTs a minimal payload here. We store
-- only what is needed to triage a reproducible bug; no PII, no URLs with
-- query strings, no stack traces beyond a hashed fingerprint.
--
-- Retention: 30 days, enforced by workers/cron-purge (daily cron) which
-- POSTs to functions/api/admin/purge.js.

CREATE TABLE IF NOT EXISTS client_errors (
  id TEXT PRIMARY KEY,                          -- UUID v4, generated at API
  received_at TEXT NOT NULL,                    -- UTC ISO 8601 at insert

  -- Where + what (truncated at API for schema safety)
  page TEXT NOT NULL,                           -- Astro.url.pathname; max 255
  message TEXT NOT NULL,                        -- error.message; max 500
  stack_fp TEXT NOT NULL,                       -- SHA-256 of top 5 stack frames
  source TEXT,                                  -- 'error' | 'unhandledrejection'

  -- Audit / abuse analysis (mirrors transmissions posture)
  user_agent_fp TEXT,
  ip_hash TEXT                                  -- Daily-rotated, not the raw IP
);

CREATE INDEX IF NOT EXISTS idx_client_errors_received_at ON client_errors(received_at);
CREATE INDEX IF NOT EXISTS idx_client_errors_stack_fp    ON client_errors(stack_fp);
CREATE INDEX IF NOT EXISTS idx_client_errors_ip_hash     ON client_errors(ip_hash, received_at);

-- >>>>>>>>>>>>>>>> END 0003_client_errors.sql <<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>> BEGIN 0004_idempotency.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — idempotency key columns
-- D1 (SQLite 3.45+).
-- Migration 0004: adds idempotency_key to transmissions + subscriptions
-- so duplicate submits (retry clicks, bfcache restores, hotspot reconnects)
-- return the cached success response without re-persisting or re-mailing.

ALTER TABLE transmissions ADD COLUMN idempotency_key TEXT;
ALTER TABLE subscriptions ADD COLUMN idempotency_key TEXT;

-- A per-submitter key is only unique within a 10-minute window on the API;
-- we index it alongside received_at so the lookup is cheap.
CREATE INDEX IF NOT EXISTS idx_transmissions_idempotency
  ON transmissions(idempotency_key, received_at);

CREATE INDEX IF NOT EXISTS idx_subscriptions_idempotency
  ON subscriptions(idempotency_key, received_at);

-- >>>>>>>>>>>>>>>> END 0004_idempotency.sql <<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>> BEGIN 0005_csp_reports.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — CSP violation reports
-- D1 (SQLite 3.45+).
-- Migration 0005: CSP reporting sink for /api/csp-report.
--
-- Stores only the fields required to triage a policy violation. Disposition
-- and referrer are dropped entirely; blocked_uri is truncated.
--
-- Retention: 30 days, enforced by workers/cron-purge (daily cron) which
-- POSTs to functions/api/admin/purge.js.

CREATE TABLE IF NOT EXISTS csp_reports (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,

  document_uri TEXT NOT NULL,                   -- max 500 chars
  violated_directive TEXT NOT NULL,             -- max 100 chars
  effective_directive TEXT,
  blocked_uri TEXT,                             -- max 500 chars
  source_file TEXT,                             -- max 500 chars
  line_number INTEGER,
  column_number INTEGER,

  user_agent_fp TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_csp_reports_received_at ON csp_reports(received_at);
CREATE INDEX IF NOT EXISTS idx_csp_reports_directive   ON csp_reports(violated_directive);
CREATE INDEX IF NOT EXISTS idx_csp_reports_ip_hash     ON csp_reports(ip_hash, received_at);

-- >>>>>>>>>>>>>>>> END 0005_csp_reports.sql <<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>> BEGIN 0006_dsar_audit.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — DSAR audit log
-- D1 (SQLite 3.45+).
-- Migration 0006: audit trail for Data Subject Access Requests
-- processed through /api/admin/dsar.
--
-- Every lookup AND every delete writes a row here. We store only what is
-- required to defend the action to an auditor:
--   - email_hash: SHA-256 of the targeted email (daily-salted), NOT the
--                 raw email. Lets us prove "this DSAR concerned that
--                 subject" without retaining the subject's identifier.
--   - action: lookup | delete
--   - rows_affected: count returned to the operator
--   - actor_ip_hash: operator IP hash (same daily-rotated salt)
--   - reason: optional short note from the operator

CREATE TABLE IF NOT EXISTS dsar_audit (
  id TEXT PRIMARY KEY,
  logged_at TEXT NOT NULL,

  action TEXT NOT NULL
    CHECK(action IN ('lookup','delete')),

  email_hash TEXT NOT NULL,
  rows_affected INTEGER NOT NULL,

  actor_ip_hash TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_dsar_audit_logged_at ON dsar_audit(logged_at);
CREATE INDEX IF NOT EXISTS idx_dsar_audit_email     ON dsar_audit(email_hash, logged_at);

-- >>>>>>>>>>>>>>>> END 0006_dsar_audit.sql <<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>> BEGIN 0007_client_web_vitals.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — real-user Web Vitals beacon
-- D1 (SQLite 3.45+). All timestamps UTC ISO 8601.
-- Migration 0007: performance observability (Pillar 4b, Round Two upgrade).
--
-- The client-side `/src/scripts/telemetry.js` subscribes to LCP/INP/CLS/
-- TTFB (+FCP as a bonus) via the `web-vitals` library and POSTs each
-- sample to /api/_internal/log with { type: 'web_vital', ... }. The
-- Worker routes those inserts to this table.
--
-- Design notes:
--  * value_x10k is integer-encoded (value * 10000, rounded) so that CLS
--    (unitless, typically 0–1) and time metrics (ms) share one numeric
--    column without losing sub-millisecond precision for CLS.
--    Query-time reconstruct as value = value_x10k / 10000.0.
--  * `metric_id` is the web-vitals library's own UUID per session-metric
--    update — unique, so we can dedupe on the server if a beacon retries.
--  * No PII. No Referer. No session tokens. `page` is pathname only.
--  * Retention: 30 days, enforced by workers/cron-purge (daily cron)
--    which POSTs to functions/api/admin/purge.js.

CREATE TABLE IF NOT EXISTS client_web_vitals (
  id TEXT PRIMARY KEY,                          -- UUID v4, generated at API
  received_at TEXT NOT NULL,                    -- UTC ISO 8601 at insert

  page TEXT NOT NULL,                           -- pathname; max 255
  name TEXT NOT NULL,                           -- 'LCP' | 'INP' | 'CLS' | 'TTFB' | 'FCP'
  value_x10k INTEGER NOT NULL,                  -- round(value * 10000)
  rating TEXT,                                  -- 'good' | 'needs-improvement' | 'poor' | ''
  metric_id TEXT,                               -- library UUID per metric update
  navigation_type TEXT,                         -- 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender' | 'restore' | ''

  user_agent_fp TEXT,
  ip_hash TEXT                                  -- Daily-rotated, not the raw IP
);

CREATE INDEX IF NOT EXISTS idx_client_web_vitals_received_at ON client_web_vitals(received_at);
CREATE INDEX IF NOT EXISTS idx_client_web_vitals_name_page   ON client_web_vitals(name, page, received_at);
CREATE INDEX IF NOT EXISTS idx_client_web_vitals_ip_hash     ON client_web_vitals(ip_hash, received_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_web_vitals_metric_id ON client_web_vitals(metric_id)
  WHERE metric_id IS NOT NULL;

-- >>>>>>>>>>>>>>>> END 0007_client_web_vitals.sql <<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>> BEGIN 0008_transmissions_idempotency_unique.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — enforce per-key idempotency at the storage layer
-- D1 (SQLite 3.45+).
-- Migration 0008: adds a partial unique index on transmissions.idempotency_key
-- that excludes NULL rows. SQLite already treats NULLs as distinct for
-- UNIQUE, but expressing the partial index explicitly gives us:
--
--   1. A stable ON CONFLICT target for `INSERT ... ON CONFLICT(idempotency_key)
--      WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id`, which is
--      how the contact endpoint now deduplicates retries.
--   2. A clearer documented intent: only non-NULL keys are deduplicated.
--      Anonymous submissions (clients that do not generate a key) are still
--      accepted and simply rely on in-app idempotency (bfcache guard + form
--      button disable).
--
-- The older non-unique index (idx_transmissions_idempotency) remains useful
-- for the existing lookup-by-key path in the handler; we keep it in place.
--
-- Safety: this migration is additive. Existing rows with duplicate idempotency
-- keys (should be none — the application level has always deduplicated) will
-- block the index creation. If operators hit that, drop the older rows via
-- `DELETE FROM transmissions WHERE idempotency_key = '<dup>' AND id <> '<keep>'`
-- before re-running.

CREATE UNIQUE INDEX IF NOT EXISTS uq_transmissions_idempotency_key
  ON transmissions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- >>>>>>>>>>>>>>>> END 0008_transmissions_idempotency_unique.sql <<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>> BEGIN 0009_cta_clicks.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — CTA click telemetry
-- D1 (SQLite 3.45+).
-- Migration 0009: adds the `cta_clicks` table + rate-limit companion that
-- records which CTAs a visitor engaged with. Purpose is narrow:
--
--   1. Tell us which outros, subscribe buttons, and hero CTAs actually
--      convert so we can retire or relocate dead ones.
--   2. Feed the /admin/vitals dashboard (P7e) with an engagement pane.
--
-- PII posture: we store NO user identifiers. Page path and CTA id are
-- both non-secret values chosen by our own markup. IP is hashed through
-- the existing daily-rotated salt (`hashIp` in _shared/validate.js).
-- Retention matches web vitals: 30 days, enforced by workers/cron-purge
-- (daily cron) which POSTs to functions/api/admin/purge.js.
--
-- Indexing: by (cta_id, received_at) for per-CTA funnels and by
-- (page, received_at) for page-local heatmap queries.

CREATE TABLE IF NOT EXISTS cta_clicks (
  id             TEXT NOT NULL PRIMARY KEY,
  received_at    TEXT NOT NULL,
  page           TEXT NOT NULL,
  cta_id         TEXT NOT NULL,
  cta_variant    TEXT,
  ip_hash        TEXT,
  user_agent_fp  TEXT
);

CREATE INDEX IF NOT EXISTS idx_cta_clicks_id_time
  ON cta_clicks(cta_id, received_at);

CREATE INDEX IF NOT EXISTS idx_cta_clicks_page_time
  ON cta_clicks(page, received_at);

CREATE INDEX IF NOT EXISTS idx_cta_clicks_ip_time
  ON cta_clicks(ip_hash, received_at);

-- >>>>>>>>>>>>>>>> END 0009_cta_clicks.sql <<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>> BEGIN 0010_ask_queries.sql <<<<<<<<<<<<<<<<
-- Sarif Consulting — RAG-lite Praxis assistant queries
-- D1 (SQLite 3.45+).
-- Migration 0010: adds the `ask_queries` table to capture the text of
-- questions posed against the Praxis corpus via the RAG-lite assistant
-- (P9d). Purpose is two-fold:
--
--   1. Learn what readers *actually* ask so editorial planning can
--      prioritise the next round of field notes.
--   2. Feed the eventual LLM-assisted answer generation phase with a
--      curated prompt corpus — every query that surfaced an unhelpful
--      result set is a candidate for a new article or a clarifying
--      edit on an existing one.
--
-- PII posture: we store the raw query text because it IS the product
-- signal. Users must consent (see docs/privacy and the UI copy that
-- accompanies the input). IP is hashed through the existing daily
-- salted hash (hashIp in functions/_shared/validate.js). Retention
-- matches other telemetry: 30 days, enforced by workers/cron-purge
-- (daily cron) which POSTs to functions/api/admin/purge.js.
--
-- Rate limiting: burst cap of 5 queries per 10 s per IP, plus a daily
-- cap of 200 per IP. Enforced in functions/api/ask.js via COUNT() on
-- ip_hash + received_at > now-10 s (and the same table for the 24h
-- bucket), mirrors the web_vitals pattern. Daily cap prevents a single
-- user pinning the endpoint for scraping.

CREATE TABLE IF NOT EXISTS ask_queries (
  id           TEXT NOT NULL PRIMARY KEY,
  received_at  TEXT NOT NULL,
  query        TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  top_result   TEXT,
  ip_hash      TEXT,
  user_agent_fp TEXT
);

CREATE INDEX IF NOT EXISTS idx_ask_queries_time
  ON ask_queries(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_ask_queries_ip_time
  ON ask_queries(ip_hash, received_at);

-- >>>>>>>>>>>>>>>> END 0010_ask_queries.sql <<<<<<<<<<<<<<<<

