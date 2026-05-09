# Admin Access — Cloudflare Access Setup

This document walks an operator through standing up Cloudflare Access for the
Sarif Consulting admin surfaces:

- `/admin/*` — static HTML dashboards (e.g. `/admin/vitals`).
- `/api/admin/*` — JSON endpoints (e.g. `/api/admin/purge`, `/api/admin/vitals`).

The admin surface is **fail-closed**: if the Access JWT is missing, invalid, or
the environment is not configured, the middleware returns `401` (API) or
redirects to the Access login flow (HTML). There is no public fallback.

## Why Access, not just a bearer token

A plain bearer still works as a second factor — `/api/admin/purge` keeps
`ADMIN_PURGE_TOKEN` for defense-in-depth — but a leaked bearer alone must
not suffice. Access provides:

- Identity federation (Google / Entra / OTP / SSO of choice).
- Session timeouts, revocation, audit trail.
- A signed `Cf-Access-Jwt-Assertion` header verified at the edge.

The middleware in `functions/_shared/cf-access.js` verifies the JWT signature
against the team's JWKS (`https://{TEAM_DOMAIN}/cdn-cgi/access/certs`), then
validates `iss`, `aud`, `exp`, and optional `nbf`.

## One-time setup

### 1. Create the Access application

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications**.
2. **Add application** → **Self-hosted**.
3. **Application name**: `Sarif Consulting Admin`.
4. **Session duration**: 24 hours (reduce for tighter ops).
5. **Application domain**: add *two* paths:
   - `sarifconsulting.ai/admin/*`
   - `sarifconsulting.ai/api/admin/*`
6. **Identity providers**: attach the IdP(s) you trust (Google Workspace,
   Entra, etc.). Do not enable `OneTimePin` for production unless MFA is
   enforced on the receiving mailbox.
7. **Policies**: add an **Allow** policy bound to the specific operator
   emails or a group. Do not use wildcards.
8. Save. Copy the **Application Audience (AUD)** tag from the overview tab —
   it is a 64-char hex string. You need this below.

### 2. Configure Pages environment variables

In the Pages project → **Settings → Environment Variables**, add:

| Variable                | Environment | Value                                            |
|-------------------------|-------------|--------------------------------------------------|
| `CF_ACCESS_TEAM_DOMAIN` | Production  | `<your-team>.cloudflareaccess.com`               |
| `CF_ACCESS_AUD`         | Production  | 64-char hex AUD from step 1                      |
| `CF_ACCESS_TEAM_DOMAIN` | Preview     | same team domain (or a preview-specific app)     |
| `CF_ACCESS_AUD`         | Preview     | AUD for the preview Access app                   |

You can also set them via the CLI:

```bash
wrangler pages project list
wrangler pages secret put CF_ACCESS_TEAM_DOMAIN --project-name sarif-consulting
wrangler pages secret put CF_ACCESS_AUD        --project-name sarif-consulting
```

The `wrangler.toml` in this repo lists both names in `[vars]` with empty
values so the binding is declared even when dashboard config has not yet
been populated. An empty value causes the middleware to fail closed.

### 3. Verify

After deploy:

```bash
curl -i https://sarifconsulting.ai/api/admin/purge
# Expect: 401 Unauthorized, WWW-Authenticate: CfAccess

curl -i https://sarifconsulting.ai/admin/vitals
# Expect: 302 to https://<TEAM_DOMAIN>/cdn-cgi/access/login?...
```

A browser hitting `/admin/vitals` should redirect to Access login, complete
the IdP handshake, and land back on the dashboard.

## Handler-level defense-in-depth

Individual handlers can *additionally* require a bearer. For instance
`/api/admin/purge` keeps its `ADMIN_PURGE_TOKEN` bearer check after the
Access gate. This keeps legacy automation working and survives temporary
Access misconfigurations (the bearer still rejects if Access is accidentally
dropped from the path rule).

New admin endpoints should prefer Access alone — bearers are a migration
concession, not the steady state.

## Failure modes

| Symptom                           | Likely cause                                       |
|-----------------------------------|----------------------------------------------------|
| All admin routes return `500`     | `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` unset   |
| 401 after fresh login             | `CF_ACCESS_AUD` mismatch between app and env var   |
| 401 after working for weeks       | Access session expired — re-auth                   |
| `unknown_kid`                     | Cloudflare rotated the JWKS; cold start will refresh |
| 302 loop on `/admin/*`            | IdP callback URL misconfigured in Access app       |

See `functions/_shared/cf-access.js` for the full verification state machine.
