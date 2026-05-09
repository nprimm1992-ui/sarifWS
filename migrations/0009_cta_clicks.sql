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
