# Retention purge — operations runbook

The Sarif site retains per-table data on the following windows:

| Table              | Window   | Carve-out                     |
| ------------------ | -------- | ----------------------------- |
| `ask_queries`      | 30 days  | —                             |
| `cta_clicks`       | 30 days  | —                             |
| `client_web_vitals`| 30 days  | —                             |
| `client_errors`    | 30 days  | —                             |
| `csp_reports`      | 30 days  | —                             |
| `subscriptions`    | 90 days  | — (all rows expire)           |
| `transmissions`    | 90 days  | `status IN ('sent','archived')` retained indefinitely |

A scheduled Worker fires the purge daily; this runbook covers the failure
modes, the manual fallback, and the audit trail.

> **`subscriptions` was added to this table in Aug 2026.** It had been
> omitted from retention entirely since it was introduced: written by
> `functions/api/contact.js` with prospect name, email, organization and a
> free-text brief, but touched by no purge path. `functions/api/admin/dsar.js`
> *did* delete from it, so on-request erasure worked while the automatic
> 90-day expiry the privacy page promises silently did not apply to it.

## ⚠️ Known gap — the purge is not currently running

The privacy page promises a 90-day purge. Until the steps below are completed
in the Cloudflare account, **that purge does not run** and personal data
accumulates with no expiry mechanism. This was latent while D1 had no tables;
the migrations were applied in Aug 2026, which made it real.

### Resolved in code (Aug 2026)

The **architectural contradiction is fixed**. The Worker previously sent
`Authorization: Bearer $ADMIN_PURGE_TOKEN` only, while
`functions/api/admin/_middleware.js` requires a valid **Cloudflare Access JWT**
*before* the handler's bearer check is reached — so it would have received 401
indefinitely, and its own `cron_purge_unauthorized` branch logged once a day
and returned, making the failure silent.

`workers/cron-purge/` now uses the **Access service-token** design (the
preferred option: one gate, no widening of the bearer's blast radius):

- It sends `CF-Access-Client-Id` / `CF-Access-Client-Secret`, so Access mints
  the JWT at the edge and forwards the request. **No middleware change was
  needed** — `verifyCfAccessJwt` validates signature, issuer, audience and
  expiry and does not require an `email` claim, so a service-token JWT passes
  exactly like a human one.
- Missing service-token credentials now **fail loudly before the request**
  (`cron_purge_access_service_token_missing`) instead of producing an anonymous
  daily 401 that reads as "auth problem, someday" rather than "retention has
  never run".
- A non-JSON 2xx is now treated as a **failure**
  (`cron_purge_access_login_interstitial`). Access serves an interactive login
  page when it does not recognize the caller as a service token; a naive
  `res.ok` check read that HTML 200 as success. That was the most dangerous
  shape of this bug — a green log line for a purge that never ran.

### Outstanding — operator actions in the Cloudflare account

Code cannot complete these; they are account configuration.

1. **Configure Access.** `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` are unset on
   the Pages project, so `POST /api/admin/purge` currently returns
   `500 {"error":"Admin access not configured."}`. This is deliberate
   fail-closed behaviour, not a bug.
2. **Create an Access service token** and add it to the Access application
   policy (**Include → Service Auth → this token**). Without the policy entry,
   Access rejects the token at the edge and the Pages Function is never
   reached.
3. **Deploy the cron Worker** with all three secrets set:
   ```bash
   cd workers/cron-purge
   wrangler secret put ADMIN_PURGE_TOKEN
   wrangler secret put CF_ACCESS_CLIENT_ID
   wrangler secret put CF_ACCESS_CLIENT_SECRET
   wrangler deploy
   ```
4. **Verify a real run** — see "Verifying a purge ran" below. Do not treat this
   gap as closed until `cron_purge_ok` appears in Workers Logs with row counts.

Note that rotating `ADMIN_PURGE_TOKEN` means updating **both** the Pages
environment and this Worker's secret, or the nightly purge starts failing 401
and retention silently stops.

## Primary path — scheduled Worker

`workers/cron-purge/` deploys a dedicated Cloudflare Worker that fires
`0 3 * * *` UTC and POSTs to `/api/admin/purge`. See
[`workers/cron-purge/README.md`](../../workers/cron-purge/README.md) for
setup. Workers Logs surface three event shapes:

| Log key                 | Meaning                                              |
| ----------------------- | ---------------------------------------------------- |
| `cron_purge_ok`         | Purge ran; `summary` has the row counts.             |
| `cron_purge_http_error` | The endpoint returned 5xx; retry tomorrow.           |
| `cron_purge_unauthorized` | Token drift — rotate Worker secret immediately.    |
| `cron_purge_timeout`    | Upstream did not respond within 30s; investigate D1. |

If three consecutive days log the same failure, escalate to the manual
fallback below.

## Manual fallback — operator `curl`

When the Worker is unhealthy (or the operator just wants to force a run),
POST directly to the Pages endpoint:

```bash
# PowerShell
curl -sfL -X POST `
  -H "Authorization: Bearer $env:ADMIN_PURGE_TOKEN" `
  https://sarifconsulting.ai/api/admin/purge
```

```bash
# POSIX
curl -sfL -X POST \
  -H "Authorization: Bearer ${ADMIN_PURGE_TOKEN}" \
  https://sarifconsulting.ai/api/admin/purge
```

Expected success response (example counts):

```json
{
  "total_purged": 128,
  "elapsed_ms": 740,
  "errors": 0,
  "results": [
    { "table": "ask_queries",       "window_days": 30, "purged": 17 },
    { "table": "cta_clicks",        "window_days": 30, "purged": 42 },
    { "table": "client_web_vitals", "window_days": 30, "purged": 61 },
    { "table": "client_errors",     "window_days": 30, "purged": 3  },
    { "table": "csp_reports",       "window_days": 30, "purged": 1  },
    { "table": "transmissions",     "window_days": 90, "purged": 4, "retained_engaged": 9 }
  ]
}
```

A `207 Multi-Status` response means one or more tables failed while others
succeeded — inspect the `results[]` entries for `error` fields.

Failure responses:

| HTTP | Meaning                                        |
| ---- | ---------------------------------------------- |
| 401  | Token missing or wrong.                        |
| 403  | Origin blocked (if called from a browser).     |
| 413  | Someone POSTed a body ≥ 4 KB. Remove the body. |
| 500  | D1 binding missing or table error; check logs. |

## Third-party cron as a second fallback

If the Cloudflare Worker itself is unavailable (e.g. account suspension),
any HTTPS-capable scheduler will do. Two known-good setups.

> **All external callers need the Access service-token headers too.** The
> snippets below show the bearer only for brevity; a bearer-only request is
> rejected 401 by Cloudflare Access before the purge handler runs. Add both:
>
> ```
> -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID"
> -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
> ```
>
> And watch for a non-JSON 2xx: that is the Access login page, meaning the
> purge did **not** run.

### GitHub Actions (copy-paste ready)

```yaml
# .github/workflows/retention-purge.yml  —  SECOND FALLBACK ONLY. The primary
# scheduler is workers/cron-purge (above). DO NOT commit as-is,
# copy into a private repo. Requires Actions secret ADMIN_PURGE_TOKEN.

name: Retention purge (daily)

on:
  schedule:
    - cron: "0 3 * * *"     # 03:00 UTC daily
  workflow_dispatch:

jobs:
  purge:
    runs-on: ubuntu-latest
    steps:
      - name: POST /api/admin/purge
        env:
          ADMIN_PURGE_TOKEN: ${{ secrets.ADMIN_PURGE_TOKEN }}
        run: |
          curl --fail --silent --show-error \
            -X POST \
            -H "Authorization: Bearer $ADMIN_PURGE_TOKEN" \
            https://sarifconsulting.ai/api/admin/purge
```

### cron-job.org

- **URL**: `https://sarifconsulting.ai/api/admin/purge`
- **Method**: POST
- **Schedule**: Every day at `03:00` (server time UTC).
- **Additional settings → Headers**:
  - `Authorization: Bearer <ADMIN_PURGE_TOKEN>`
- **Notifications**: Enable on HTTP error (email).

## Verifying a purge ran

After any run, query the live D1 directly:

```bash
wrangler d1 execute sarif-consulting --remote --command \
  "SELECT COUNT(*) AS still_pending FROM transmissions WHERE datetime(received_at) < datetime('now','-91 day') AND status NOT IN ('sent','archived');"
```

The count should be zero. Anything non-zero means the run silently skipped
rows — inspect them, escalate, and consider a manual second invocation.

## Audit trail

The endpoint itself does not write to an audit table today. Cloudflare's
structured logs (`cron_purge_ok` etc.) are the only trail. If you need a
stronger audit trail (SOC 2, DSAR response), convert the endpoint to
also insert a row into a future `retention_audit` table — tracked in the
Phase B findings report.
