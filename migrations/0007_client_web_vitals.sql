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
