# sarif-cron-purge

A tiny Cloudflare Worker that triggers the Sarif site's retention purge
on a daily schedule. Cloudflare Pages Functions can't register cron
triggers directly — this Worker is the minimum-viable scheduler.

## What it does

1. Fires once daily at `0 3 * * *` UTC.
2. POSTs to `${PURGE_ORIGIN}${PURGE_PATH}` with `Authorization: Bearer ${ADMIN_PURGE_TOKEN}`.
3. Logs the JSON summary (or the failure mode) to Workers Logs. Does not throw.

The purge logic itself lives in
[`functions/api/admin/purge.js`](../../functions/api/admin/purge.js) and deletes
transmissions older than 90 days unless their status blocks retention.

## One-time setup

```bash
cd workers/cron-purge
npm install
wrangler secret put ADMIN_PURGE_TOKEN   # paste the same token the site uses
wrangler deploy
```

Verify after deploy:

```bash
curl https://sarif-cron-purge.<your-subdomain>.workers.dev/healthz
# → ok
```

## Local smoke test

```bash
npx wrangler dev
# In a second terminal:
curl -i -X POST http://127.0.0.1:8787/__scheduled
```

`__scheduled` is the Wrangler dev hook that simulates a cron firing. The
Worker logs will show either `cron_purge_ok` or the specific failure mode.

## Rotation

When the site's `ADMIN_PURGE_TOKEN` rotates:

```bash
wrangler secret put ADMIN_PURGE_TOKEN   # paste the new value
```

No redeploy needed — the secret picks up on the next scheduled run.

## Why a separate Worker?

- Pages Functions don't support `[triggers] crons`. Keeping the schedule
  here lets the Pages project stay single-purpose (HTTP handlers only).
- The Worker has no D1 binding, no KV, no secrets besides the bearer token
  — blast radius if the Worker itself is compromised is limited to
  invoking the already-auth'd purge endpoint.

## Fallback

If this Worker fails for N consecutive days, the external-cron runbook at
[`docs/operations/retention-purge.md`](../../docs/operations/retention-purge.md)
documents a manual `curl` equivalent plus a sample GitHub Actions
workflow.
