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
