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
