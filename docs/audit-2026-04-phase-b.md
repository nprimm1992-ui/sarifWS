# Phase B — World-Class Hardening: Findings & Outcomes

**Date:** 2026-04-17
**Regime:** B (audit / harden / platform-quality), per OxFlow engineering standards.
**Scope declared:** Site + Functions + D1 migrations + Workers dir. Accessibility contrast
explicitly excluded per user direction. No deploy — local verification only.

This document captures the "why" behind every change shipped in the
2026-04-17 release. Pair it with `CHANGELOG.md` (the "what") and the
operator runbooks under `docs/operations/` (the "how").

---

## 1. Entry-point inventory (mutation surfaces)

| Method | Path                          | Purpose                         | Pre-Phase-B gaps                                     |
| ------ | ----------------------------- | ------------------------------- | ---------------------------------------------------- |
| POST   | `/api/transmit`               | Contact intake                  | No idempotency; loose request validation             |
| POST   | `/api/contact`                | Praxis subscription             | Same                                                 |
| POST   | `/api/pickup/:id/draft`       | Draft save                      | No body-size / Content-Type guard                    |
| POST   | `/api/admin/purge`            | Retention purge                 | Exposed; no `Content-Length` upper bound             |
| POST   | `/api/admin/dsar`             | **New** — Data subject request  | Did not exist                                        |
| POST   | `/api/_internal/log`          | **New** — Client error beacon   | Did not exist                                        |
| POST   | `/api/csp-report`             | **New** — CSP violation intake  | Did not exist                                        |
| GET    | `/praxis/rss.xml`             | **New** — Atom feed stub        | Did not exist                                        |

All POST endpoints now route through `functions/api/_shared/request-guards.js`,
enforcing `Content-Type`, body size, and (where sensible) `Origin`. The
admin endpoints additionally require a bearer token verified with a
constant-time comparison.

---

## 2. Findings resolved in this phase

### P0 — User-visible / security

| # | Severity | Location                                       | Problem                                                                 | Fix                                                                                                             |
| - | -------- | ---------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1 | High     | `_headers` CSP                                 | `'unsafe-inline'` on `script-src` — real XSS risk                       | `scripts/inject-csp-hashes.mjs` injects SHA-256 hashes for every inline script at build time; `'unsafe-inline'` removed |
| 2 | High     | Contact + Praxis forms                         | Double-submits / back-button re-submits would write duplicate rows      | `X-Idempotency-Key` header + 10-minute dedupe window in `transmit.js` / `contact.js`; client-side min-hold + `pageshow` reset |
| 3 | Medium   | All mutating endpoints                         | No shared request-validation layer; each endpoint rolled its own        | `_shared/request-guards.js` now applied consistently                                                            |
| 4 | Medium   | UCIM iframe (`about.astro`)                    | Embedded without COEP/COOP isolation                                    | `credentialless` attribute added                                                                                |
| 5 | Medium   | No client-error visibility                     | Production JS errors were unobservable                                  | `telemetry.js` + `/api/_internal/log` + D1 `client_errors`                                                      |
| 6 | Medium   | Meta descriptions                              | Several pages had descriptions <110 or >180 chars (truncation / thin)   | `check-meta-descriptions.mjs` build-time sentinel; offending copy tightened                                     |

### P1 — Platform quality

| # | Severity | Location                              | Problem                                                          | Fix                                                                                                             |
| - | -------- | ------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 7 | Medium   | Google Fonts CDN                      | Third-party render-blocking + CSP drag                           | Self-hosted via `@fontsource`, preloaded, `font-display: swap`; Google entries removed from CSP `font-src`      |
| 8 | Medium   | Below-the-fold rendering              | Browser painted offscreen sections eagerly                       | `content-visibility: auto` on non-critical sections across About / Services / Engagements / Lexicon / policy pages |
| 9 | Low      | Static navigation                     | No speculative loading                                           | `<script type="speculationrules">` — moderate prerender for primary routes, conservative prefetch for others    |
| 10| Low      | No runtime bundle enforcement         | Bundle sizes could silently regress                              | `check-bundle-budget.mjs` + `check-html-budget.mjs` run at `postbuild`                                          |
| 11| Medium   | Data retention                        | 90-day purge was manual-only                                     | `workers/cron-purge/` Worker (daily cron) + external-cron runbook fallback                                      |
| 12| Medium   | DSAR readiness                        | No lookup/delete path for data-subject requests                  | `/api/admin/dsar` + audit table + operator runbook                                                              |
| 13| Low      | SEO: breadcrumbs                      | No `BreadcrumbList` JSON-LD                                      | Injected dynamically in `Base.astro`                                                                            |
| 14| Low      | SEO: language hint                    | Missing `hreflang`                                               | Added `en-US` + `x-default` alternates                                                                          |
| 15| Low      | UX: offline transparency              | No feedback when the browser went offline mid-form               | `network-status.js` live region + pill                                                                          |
| 16| Low      | UX: low-data users                    | three.js scene loaded unconditionally                            | Skipped when `Save-Data` / `2g`/`slow-2g` / `prefers-reduced-data` is signaled                                  |

### P2 — Code quality / ops

| #  | Severity | Location                             | Fix                                                                                    |
| -- | -------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 17 | Low      | Repo root                            | `.editorconfig` added for consistent indentation / EOL                                 |
| 18 | Low      | Scripts                              | `check:all` / `check:meta` / `check:budgets` bounded scripts added to `package.json`   |
| 19 | Low      | Changelog discipline                 | `CHANGELOG.md` seeded                                                                  |

---

## 3. Explicitly out of scope / deferred

| Item                                        | Reason                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Accessibility color-contrast pass           | User directive ("exclude issues surrounding accessibility contrast")                    |
| Deployment                                  | User directive ("do not deploy i want to test it myself locally first")                 |
| Captcha / bot-detection on forms            | User directive — Cloudflare Turnstile skipped in favor of idempotency + rate-limiting   |
| Image optimization sweep                    | No `<img>` tags in the site; imagery is SVG/CSS/WebGL only. Verified by codebase scan.  |
| Full UX-copy review for tone                | Scope was engineering hardening, not editorial                                          |

---

## 4. Verification Appendix

```
BUILD: PASS — full `npm run build` succeeded; all post-build sentinels green
TESTS: NOT RUN — no automated test suite yet; manual smoke test pending
LINT: PASS — `npm run lint` clean (0 warnings, 0 errors)
TYPE CHECK: PASS — `npx astro check` clean (0 errors, 43 hints; no warnings)
RUNTIME / BROWSER: NOT VERIFIED — user will smoke-test locally; see smoke-test steps below
SCOPE: All files / areas listed in §1 and §2 | Regime B
ISSUES FOUND: 19 targeted + 22 latent TS errors — all addressed in this pass
```

### Latent type-check debt cleared as side-effect

When a root-level `tsconfig.json` was introduced in Phase 10 to scope
`astro check` away from vendored `node_modules` / `public/ucim-visualizer`,
it surfaced 22 latent errors in pre-Phase-B code:

- `src/components/ServiceCard.astro` — 10 errors (untyped `Element` /
  `Event` refs). Fixed via `instanceof` narrowing.
- `src/components/CapabilityTicker.astro` — 2 errors (`_capTickerBound`
  on `Element`). Fixed via type augmentation in `src/sarif-dom.d.ts`.
- `src/pages/contact.astro` — 7 errors (form treated as `HTMLElement`,
  untyped first-field). Fixed via `instanceof HTMLFormElement` narrow.
- `src/pages/praxis.astro` — 3 errors (same pattern on subscribe form).
  Fixed via `instanceof` narrows.

These fixes are additive-only (no behavior change); they make the
type-checker's model match the runtime reality the code already assumed.

### Post-build sentinel outcomes (observed 2026-04-17)

- CSP hash injection: 11 unique SHA-256 tokens written to `dist/_headers`.
- HTML gzip budget: top page 12.3 KB (budget 30 KB) — PASS.
- JS gzip budget: total 434.9 KB (budget 600 KB), three.js 163.1 KB
  (budget 180 KB) — PASS.
- Meta description sentinel: 9 indexable pages, range 130–180 chars —
  PASS. UCIM visualizer HTML (third-party bundle) excluded.

### Smoke-test steps for local verification

1. `npm install` — picks up new `@fontsource` packages.
2. `npm run check:all` — lexicon-version + lint + type-check.
3. `npm run build` — triggers `inject-csp-hashes`, HTML / bundle budget
   sentinels, meta-description sentinel.
4. `npm run preview` — open in a clean browser profile:
   - confirm no console errors on /, /about, /services, /engagements, /praxis, /contact, /lexicon.
   - toggle DevTools → Network → "Offline" and confirm the status pill appears.
   - DevTools → Application → Clear storage, then submit contact form twice
     quickly; confirm the second submit does not produce a duplicate row
     (check D1 `transmissions` table).
5. Wrangler: `cd workers/cron-purge && npx wrangler dev`; hit `/` with
   the configured bearer to verify the purge worker path.

### Migrations to apply before first deploy

In order:

1. `migrations/0003_client_errors.sql`
2. `migrations/0004_idempotency.sql`
3. `migrations/0005_csp_reports.sql`
4. `migrations/0006_dsar_audit.sql`

---

## 5. Follow-ups tracked but not done in Phase B

- Add at least one automated test path (Vitest or similar) for API
  endpoints so `TESTS: NOT RUN` can become `TESTS: PASS`.
- Populate a real Praxis issue to replace the feed stub.
- Accessibility contrast pass — to be run after user validation.
