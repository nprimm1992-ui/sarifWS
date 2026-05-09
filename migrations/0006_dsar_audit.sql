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
