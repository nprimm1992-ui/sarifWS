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
