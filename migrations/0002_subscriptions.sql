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
