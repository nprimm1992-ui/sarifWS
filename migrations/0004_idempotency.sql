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
