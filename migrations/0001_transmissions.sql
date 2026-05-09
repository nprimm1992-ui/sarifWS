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
