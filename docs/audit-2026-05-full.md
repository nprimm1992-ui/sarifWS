# Sarif Consulting — Full contextual audit (May 2026)

**Regime:** B (inventory + security, a11y, performance, content, tests).  
**Scope:** Entire repo: Astro SSG, client bundles, Cloudflare Pages Functions, D1 migrations, build scripts, Playwright E2E.  
**Supersedes for operational truth:** Much of [docs/audit-2026-04.md](audit-2026-04.md) is **obsolete** (CSP, `/api/contact` hardening, pickup tokens, UCIM loading, OG/favicon generation, etc. have since shipped). This document is the current audit record.

---

## Executive summary

The codebase presents a **mature** static marketing site with **defense-in-depth** at the edge: strict CSP (hashed inline scripts, documented `style-src` trade-off), Turnstile-gated contact transmission, daily-salted IP/email hashing, D1 persistence, CF Access on `/admin/*` and `/api/admin/*`, chunked retention purges, and DSAR tooling. Client-side architecture is sophisticated (persistent WebGL lobby, view transitions, Lenis, command palette) with explicit reduced-motion and WebGL-fallback paths.

**Highest-value follow-ups:** (1) **Align E2E with the live DOM** (contact field name `signal` vs test `message`; Praxis facet geometry test assumes removed sidebar layout). (2) **Normalize screen-reader-only patterns** (`.sr-only` vs per-page `.visually-hidden`). (3) **Decide** whether Praxis `horizon` / `phase` remain author-only metadata or should sync with URL/filters. (4) **Re-verify Playwright in CI** — this audit run saw widespread failures (see Verification Appendix); several look environment- or selector-related, not necessarily production regressions.

---

## 1. Entry-point inventory

### 1.1 Static pages (`src/pages/`)

| Route | Role | Notable client/edge |
|-------|------|---------------------|
| `/` | Home | Lobby, tickers, speculation rules |
| `/about/` | About + UCIM embed | Lazy iframe, postMessage handshake |
| `/services/` | Services | Engagement ticker strip |
| `/engagements/` | Case cards | Carousel script |
| `/praxis/` | Article index | Facet bar, PraxisAsk, filters script |
| `/praxis/[slug]/` | MDX dossier | `praxis-dossier-open.js`, Picture assets |
| `/lexicon/` | Term grid | `lexicon-page.ts`, live region |
| `/contact/` | Signal form | Turnstile, `/api/transmit`, sequencer UI |
| `/privacy/`, `/terms/`, `/accessibility/` | Legal / a11y | Mostly static |
| `/404`, `/500` | Errors | `lobbyPose` override |
| `/admin/vitals/` | Admin dashboard | Static HTML + **CF Access** HTML middleware |

### 1.2 Astro-generated endpoints

| Path | Output |
|------|--------|
| `/search-index.json` | Client search corpus + Praxis meta (`lens`, `horizon`, `phase`) |
| `/api/lexicon.json` | Full lexicon dump |
| `/api/lexicon/[id].json` | Single entry permalinks |
| `/praxis/rss.xml` | Atom feed |

### 1.3 Cloudflare Pages Functions (`functions/`)

| Path | Auth | Storage / side effects |
|------|------|-------------------------|
| `POST /api/transmit` | Origin + JSON body limits | D1 `transmissions`, Turnstile, mail relay |
| `POST /api/contact` | Same pattern | D1 `subscriptions` (Praxis subscribe), mail relay — **no Turnstile** |
| `POST /api/ask` | Soft CORS | D1 `ask_queries`, 204 responses |
| `POST /api/csp-report` | None | D1 `csp_reports` |
| `GET /api/pickup` | Jensen bearer (`pickup-auth.js`) | Lists unclaimed rows |
| `POST /api/pickup/:id/claim` | Write token | Atomic claim |
| `POST /api/pickup/:id/draft` | Write token | Draft/refusal with **overwrite guard** (`force` + trace id) |
| `POST /api/admin/purge` | CF Access JWT + `ADMIN_PURGE_TOKEN` | Retention deletes |
| `POST /api/admin/dsar` | CF Access JWT + bearer | Lookup/delete by email |
| `GET /api/admin/vitals` | CF Access JWT | Telemetry read (handler in sibling file) |
| `functions/api/admin/_middleware.js` | CF Access JWT | **Fails closed** if team domain / AUD unset |
| `functions/admin/_middleware.js` | CF Access JWT | HTML admin gate + login redirect |

Shared modules: [`functions/api/_shared/validate.js`](../functions/api/_shared/validate.js) (sanitization, IP/email hash, outbound URL allowlist, CORS helpers), [`request-guards.js`](../functions/api/_shared/request-guards.js), [`pickup-auth.js`](../functions/api/_shared/pickup-auth.js), [`cf-access.js`](../functions/_shared/cf-access.js).

### 1.4 D1 migrations (`migrations/`)

`0001` transmissions → `0002` subscriptions → idempotency → errors → CSP → DSAR → vitals → uniqueness → CTA → ask_queries. Matches purge/dsar/ask/csp handlers.

### 1.5 Client modules (`src/scripts/` — grouped)

- **3D / scene:** `lobby-scene.js`, `lobby-route-poses.js`, `lobby-render-budget.js`
- **Motion / a11y:** `reduced-motion.js`, `reveal.js`, `active-scroll.js`, `home-smooth-scroll.js`, `spring-tilt.js`
- **Navigation:** `nav.js`, `command-palette.js`
- **Conversion / telemetry:** `form-draft.js`, `magnetic-cta.js`, `praxis-ask.js`, `cta-telemetry.js`, `telemetry.js`
- **Praxis:** `praxis-dossier-open.js`
- **Ambient:** `audio.js` (AbortController + `astro:before-swap` teardown), `atmosphere.js`, `network-status.js`
- **Other:** `engagement-carousel.js`, `main-ticker.js`, `document-scroll-progress.js`, `lexicon-page.ts`

### 1.6 Build / ops scripts (`scripts/`)

UCIM sync, CSP hash injection ([`inject-csp-hashes.mjs`](../scripts/inject-csp-hashes.mjs)), HTML/bundle/meta/praxis-layout budgets, lexicon version parity, OG + favicon + LUT + HDR pipeline.

---

## 2. Security & privacy (P0 review)

| Topic | Assessment |
|-------|------------|
| **CSP** | [`public/_headers`](../public/_headers): strict defaults + `wasm-unsafe-eval`, `blob:` connect, `inline-speculation-rules`, Turnstile + Insights hosts. Post-build SHA-256 replaces `unsafe-inline` on **scripts** only; `style-src 'unsafe-inline'` documented as Astro scoped-CSS trade-off. |
| **Reporting** | [`functions/api/csp-report.js`](../functions/api/csp-report.js) normalizes legacy + Reporting API; rate-limited; 204 always. |
| **Contact abuse** | [`transmit.js`](../functions/api/transmit.js): Turnstile (fail-closed in production if misconfigured), honeypot, origin required, IP + email rate limits, idempotency, outbound URL allowlist. |
| **Subscribe path** | [`contact.js`](../functions/api/contact.js): origin + rate limit + D1 + same mail allowlist — **no Turnstile** (smaller abuse surface than full signal, still worth monitoring). |
| **Secrets** | Documented in [`wrangler.toml`](../wrangler.toml); client only sees `PUBLIC_*` (e.g. Turnstile site key, optional beacon). |
| **IP hashing** | [`validate.js`](../functions/api/_shared/validate.js): `IP_HASH_BASE_SALT` **required** when `ENVIRONMENT=production`. |
| **Admin** | JWT verification with JWKS cache; misconfiguration → 500 JSON/HTML as appropriate; bearer second factor on purge/dsar. |
| **Pickup** | Split read/write/legacy token model in `pickup-auth.js`; draft overwrite requires explicit `force` and new trace id when status already drafted/refused. |
| **Privacy tooling** | DSAR audit uses hashed email in `dsar_audit`; retention purge documented in purge handler. |

**Residual risks (P1):** Praxis subscription endpoint is easier to automate than Turnstile-gated transmit; `ask` accepts missing `Origin` (by design) but has burst/daily caps — acceptable for telemetry.

---

## 3. Accessibility & UX (P0 review)

| Topic | Assessment |
|-------|------------|
| **Skip link** | Present in [`Base.astro`](../src/layouts/Base.astro) → `#main-content`. |
| **Landmarks** | `main#main-content`; nav/footer components; command palette dialog pattern (verify focus trap in tests). |
| **Motion** | `lobby-scene.js`: reduced motion → hide canvas + static fallback; Praxis dossier script respects reduced motion (per prior round). `audio.js` shortens fade when reduced motion. |
| **SR-only consistency** | Global [`.sr-only`](../src/styles/global.css); several templates define **local** `.visually-hidden` ([`contact.astro`](../src/pages/contact.astro), [`lexicon.astro`](../src/pages/lexicon.astro), [`CommandPalette.astro`](../src/components/CommandPalette.astro)). **Recommendation:** converge on one utility to reduce drift. |
| **Semantics** | Praxis dossier uses structured case chrome; contact form uses `signal` field name (matches API). |

---

## 4. Performance & WebGL (P0/P1)

| Topic | Assessment |
|-------|------------|
| **Lobby** | [`initLobby`](../src/scripts/lobby-scene.js): singleton WebGL init; route changes adjust emblem/camera; `cleanup` on teardown paths; main-ticker + render budget. **First hit on a deep-linked non-home route** still pays full init if `renderer` was never created — acceptable trade-off but real on cold ingress to `/praxis/`, etc. |
| **Chunks** | `manualChunks` isolates `three`; Vite still warns chunk &gt; 500 kB — monitor `three` + UCIM sizes ([`package.json`](../package.json) postbuild budgets pass). |
| **UCIM** | [`about.astro`](../src/pages/about.astro): `loading="lazy"`, IntersectionObserver-gated `src`, ready handshake — April audit “eager iframe” issue **resolved**. |
| **Audio** | [`audio.js`](../src/scripts/audio.js): teardown via `AbortController` before re-binding; `astro:before-swap` removes duplicate listener stacking — April audit stacking issue **resolved**. |
| **Speculation rules** | Moderate prerender on five primary routes in `Base.astro`. |

---

## 5. Content, SEO & schema (P1)

| Topic | Assessment |
|-------|------------|
| **Sitemap** | [`astro.config.mjs`](../astro.config.mjs): `/lexicon` filtered out of sitemap — **intentional** (noindex surface); confirm product intent for discoverability. |
| **JSON-LD** | ProfessionalService + optional breadcrumbs in `Base.astro`. |
| **Praxis schema vs UI** | [`content.config.ts`](../src/content.config.ts) still requires `horizon` and `phase`; index UI facets use **lens + tags only** ([`praxis.astro`](../src/pages/praxis.astro) `FACET_KEYS`). Search still exposes horizon/phase in [`search-index.json.ts`](../src/pages/search-index.json.ts). **Optional:** strip obsolete URL query keys in facet state; or reintroduce facets; or relax schema if fields become optional metadata only. |
| **Stale docs** | [`docs/audit-2026-04.md`](audit-2026-04.md) lists resolved P0s — **archive or add banner** pointing here. |

---

## 6. Testing matrix

| Spec file | Intent | Coverage gap / notes |
|----------|--------|----------------------|
| `nav-routes.spec.ts` | h1 + **zero console errors** | Fails on **404 resource** console noise under `astro preview` in this run; filter may need narrowing or preview asset paths fixed. |
| `contact.spec.ts` | Form + validation | **Bug:** expects `[name="message"]` but production uses **`signal`** — test never asserts main field correctly. |
| `praxis.spec.ts` | Facets + navigation | Card click may conflict with WebGL hit targets; prefer `evaluate` navigation pattern from round7. |
| `palette.spec.ts` / `round4.spec.ts` | Cmd+K, focus, scroll lock | Timeouts in this Windows agent run — likely **headless focus / keyboard** sensitivity; verify in CI/Linux. |
| `round7-dossier.spec.ts` | Layout + dossier chrome | **Geometry test obsolete:** facets are a **full-width horizontal bar** (`grid-area: facets`), not a left sidebar — `facetsRect.right <= cardRect.left` is no longer valid. Replace with row-order / non-intersection in Y, or distinct selectors. |

**Live POST / Turnstile:** Correctly absent from E2E per [`tests/e2e/README.md`](../tests/e2e/README.md).

---

## 7. Ranked findings

| ID | Sev | Area | Finding | Suggested fix |
|----|-----|------|---------|----------------|
| F-01 | P1 | Tests | `contact.spec.ts` uses `message`; form field is `signal`. | Update required-names to `signal` (or add `data-testid`). |
| F-02 | P1 | Tests | `round7-dossier` overlap test assumes sidebar facets; layout is horizontal strip. | Rewrite assertion (vertical separation or grid row metrics). |
| F-03 | P1 | A11y | Duplicate `.visually-hidden` vs global `.sr-only`. | Normalize utilities; one source of truth in `global.css`. |
| F-04 | P2 | Product | Praxis `horizon`/`phase` in schema but not in index facet UI. | Document intent; optional URL param cleanup; or simplify schema. |
| F-05 | P2 | Abuse | `/api/contact`subscribe has no Turnstile. | Accept or add lightweight challenge if spam appears. |
| F-06 | P2 | Hygiene | `astro check` reports implicit-`any` hints in `vitals.astro`, `[slug].astro`. | Tighten types when touching those files. |
| F-07 | P2 | Docs | April 2026 audit file contradicts current code. | Banner “superseded by audit-2026-05-full.md” or archive. |
| F-08 | P3 | Perf | Main Three chunk remains large. | Already budgeted; consider lazy route-only decoupling if needed. |

*No open P0 security regressions identified in code review relative to current patterns.*

---

## 8. Verification appendix (this audit run)

```
BUILD: PASS — npm run build (UCIM build, asset scripts, astro build, inject-csp-hashes, HTML/bundle/meta/praxis checks)
CHECKS: PASS (with hints) — npm run check:types → 0 errors; 162 hints (implicit any, deprecated execCommand, etc.)
LINT: PASS — npm run lint
TESTS: FAIL — npm run test:e2e → 18 failed / 25 total in this environment (see below)
RUNTIME / BROWSER: not verified — Turnstile, CF Access admin, subjective animation not exercised manually in this pass
SCOPE: Regime B — full repo read + representative deep file review
ISSUES FOUND: 8 tracked (F-01–F-08); E2E failures additional signal for test/env drift
```

**E2E failure snapshot (Windows / Chromium / local preview):**

- **nav-routes:** Console errors reported as **404 failed resources** (three occurrences) — investigate which URLs 404 in `dist` preview.
- **contact:** Timeout / visibility on `[name="name"]` — may cascade from page not settling if console/network blocked; **F-01** still a definite spec bug for `message` vs `signal`.
- **palette / round4:** Keyboard shortcuts and focus timeouts — common in headless Windows; retry on Linux CI.
- **round7 geometry:** **F-02** — test assumption mismatch with horizontal facet bar.
- **round7 article tests:** Passed (chrome + runtime state).

---

## 9. Handoff cross-checks (from prior threads)

| Item | Status |
|------|--------|
| Praxis URL `?horizon=` / `?phase=` | Still possible; facet script ignores keys — cosmetic URL noise only unless stripped in `writeState`. |
| `docs/audit-2026-04.md` | Stale; see F-07. |
| “Web access off” | Outside repo — clarify Cursor sandbox vs CF Access vs site copy when reported. |

---

*End of audit — May 7, 2026.*
