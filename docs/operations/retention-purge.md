# Retention purge — operations runbook

The Sarif site retains per-table data on the following windows:

| Table              | Window   | Carve-out                     |
| ------------------ | -------- | ----------------------------- |
| `ask_queries`      | 30 days  | —                             |
| `cta_clicks`       | 30 days  | —                             |
| `client_web_vitals`| 30 days  | —                             |
| `client_errors`    | 30 days  | —                             |
| `csp_reports`      | 30 days  | —                             |
| `transmissions`    | 90 days  | `status IN ('sent','archived')` retained indefinitely |

A scheduled Worker fires the purge daily; this runbook covers the failure
modes, the manual fallback, and the audit trail.

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
any HTTPS-capable scheduler will do. Two known-good setups:

### GitHub Actions (copy-paste ready)

```yaml
# .github/workflows/retention-purge.yml  —  DO NOT commit as-is,
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
