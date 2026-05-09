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
