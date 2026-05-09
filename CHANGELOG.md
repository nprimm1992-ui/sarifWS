# Changelog

All notable changes to the Sarif Consulting website are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
semantic versioning not currently used — this is a continuously-deployed
site, so we track changes by date-scoped release groups instead.

## [Unreleased]

### Fixed (same-day revert)
- Favicon pipeline: `scripts/optimize-favicon.mjs` now sources from
  `public/favicon.svg` (the same vector referenced by the in-tab
  `<link rel="icon">`), not `phoenix-emblem.svg`. This restores the
  original icon on every raster surface (iOS home-screen, Windows
  taskbar, high-DPI tabs, Android PWA).
- Lobby scene + atmosphere: removed the Save-Data / `effectiveType` /
  `prefers-reduced-data` skip gates introduced in Phase 9. Both scripts
  now load on every page navigation, matching pre-Phase-B behavior. The
  lobby module continues to self-limit rendering to the landing path;
  the atmosphere module continues to respect `prefers-reduced-motion`
  internally.

### Tooling (same-day follow-up)
- Root-level `tsconfig.json` introduced to scope `astro check` away from
  vendored bundles under `vendor/` and `public/ucim-visualizer/`.
- `src/sarif-dom.d.ts` declares the ambient DOM augmentations the site
  already relied on at runtime: `Navigator.connection` +
  `NetworkInformation` (Save-Data / `effectiveType`), plus our own
  idempotent-binding markers (`_bound`, `_capTickerBound`).
- 22 latent type-check errors in pre-Phase-B code (`ServiceCard`,
  `CapabilityTicker`, `contact.astro`, `praxis.astro`) resolved via
  `instanceof` narrows — additive-only, no behavior change.
- `@astrojs/check` and `typescript` added as devDependencies so
  `npm run check:types` runs without an interactive install prompt.

### Verification (local, 2026-04-17)
- `npm run lint` — PASS (0 warnings, 0 errors).
- `npx astro check` — PASS (0 errors, 43 hints).
- `npm run build` — PASS; all post-build sentinels green
  (CSP hash inject, HTML/JS gzip budgets, meta-description sentinel).

## [2026-04-17] — Phase B: World-Class Hardening

### Reliability & Observability
- Client-error beacon: `window.onerror` and `unhandledrejection` captured
  via `navigator.sendBeacon`, rate-limited, dedup'd by SHA-256 stack
  fingerprint, persisted to D1 `client_errors` table.
- Form submission idempotency: `X-Idempotency-Key` header dedupes repeat
  submissions on `/api/transmit` and `/api/contact` for 10 minutes.
- SessionStorage draft persistence for both contact and Praxis forms,
  with sensitive-field redaction on restore and cross-tab sync.
- Double-submit guard: minimum hold on submit buttons, plus `bfcache`-
  aware `pageshow` reset so a back-navigation never leaves a disabled
  button.

### Security
- Generic request guards (`Content-Type`, body-size, `Origin`) applied to
  every mutation endpoint.
- CSP tightened: `'unsafe-inline'` removed from `script-src` via
  post-build SHA-256 hash injection (`scripts/inject-csp-hashes.mjs`).
- CSP reporting endpoint `/api/csp-report` accepts legacy and
  `reports+json` formats, persists to D1 `csp_reports`, rate-limited.
- Permissions-Policy expanded, HSTS `max-age` increased, COOP/CORP
  headers added.
- UCIM iframe given `credentialless` COEP attribute.

### Performance
- Self-hosted fonts (Orbitron, Inter, Space Grotesk) via `@fontsource`,
  with `font-display: swap` and `preload`; Google Fonts CDN eliminated.
- `content-visibility: auto` applied to below-the-fold sections on
  About, Services, Engagements, Lexicon, Privacy, Terms, Accessibility.
- Speculation rules: moderate-eagerness prerender for primary routes,
  conservative prefetch for all internal links.
- Build-time sentinels for JS bundle size and HTML page size; build
  fails if budgets are exceeded.

### Data Lifecycle & Compliance
- Dedicated Cloudflare Worker (`workers/cron-purge/`) for daily
  retention purge, with bearer auth and `/healthz`.
- External-cron runbook documented in `docs/operations/retention-purge.md`.
- DSAR endpoint `/api/admin/dsar` (lookup + delete), audited to D1
  `dsar_audit` table; operator runbook in `docs/operations/dsar.md`.

### SEO
- `BreadcrumbList` JSON-LD injected on every page, derived from the URL
  path.
- `hreflang` links (`en-US`, `x-default`) added.
- Meta-description length sentinel enforces 110–180 characters on
  indexable pages; existing descriptions tightened to fit.
- Atom feed stub published at `/praxis/rss.xml`, linked via
  `<link rel="alternate">` on the Praxis page.

### UX Resilience
- Online/offline live region (`role=status`, `aria-live=polite`)
  announces connectivity changes, visible as a discreet bottom-right
  pill.
- Lobby three.js scene and atmospheric overlay skipped when the browser
  signals `Save-Data`, `2g`/`slow-2g` effective connection, or
  `prefers-reduced-data: reduce`.

### Guardrails
- `.editorconfig` standardizes indentation / EOL / final-newline.
- `npm run check:all` wraps lexicon-version, lint and type-check into
  one bounded command for CI-less local verification.
- `CHANGELOG.md` seeded (this file).
- Findings report committed to `docs/audit-2026-04-phase-b.md`.
