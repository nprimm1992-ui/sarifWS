# Changelog

All notable changes to the Sarif Consulting website are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
semantic versioning not currently used — this is a continuously-deployed
site, so we track changes by date-scoped release groups instead.

## [Unreleased]

### Performance — Round 2026 desktop overhaul

This is the largest performance pass since the dirty-flag arbitrator
landed. All changes were authored against `PERFORMANCE_AUDIT.md`
(committed at the same time) and address the desktop initial-load /
runtime pain reported by the team. No visual regressions intended;
where a brand-relevant effect was removed from the GPU pipeline, an
equivalent CSS layer takes its place at zero per-frame cost.

#### Critical-path / network
- **`Base.astro` — speculation rules switched from `prerender:
  moderate` to `prefetch: moderate`** for the five primary routes.
  `prerender` was spawning five parallel hidden documents, each booting
  a *full* WebGLRenderer + EffectComposer + Reflector + 16-light
  Three.js scene + atmosphere canvas + AudioContext while the user was
  still on `/`. The browser's WebGL-context cap (~16 in Chromium)
  meant by the time the user actually clicked, prerendered contexts
  were often force-lost and the navigation cold-booted anyway. Prefetch
  warms the HTML cache without script execution, captures ~80 % of the
  perceived navigation speedup at <5 % of the resource cost.
- **`Base.astro` — wing-emblem GLB and HDR env preloads downgraded to
  `prefetch`**. Both assets are consumed by the lazy idle-imported
  lobby module, *not* the first paint, so `preload` was wrongly
  competing for connection slots with the four critical font woff2
  preloads above it.
- **`scripts/generate-og-image.mjs` — rewritten** to produce
  `og-image.jpg` (1200 × 630, ~120 KB) and `og-image.avif` (~80 KB)
  from the branded master. The legacy `og-image.png` URL is preserved
  with `Content-Type: image/jpeg` override in `_headers` so cached
  crawler indexes still work. Drops ~3.5 MB of cold bytes per shared
  page render. `Base.astro` `DEFAULT_OG_IMAGE` updated to point at the
  new optimised JPEG.
- **`scripts/optimize-ambient-videos.mjs` — new**, hooked into
  `build:assets`. Re-encodes the two ambient MP4 clips referenced by
  AboutDossierCard (`Context flow.mp4` 6.1 MB, `Amber_Light_…mp4`
  3.3 MB) to AV1 + downscaled H.264 when ffmpeg is available; logs
  the canonical commands (and exits 0) when it isn't, so CI without
  ffmpeg still passes.

#### Lobby Three.js — composer chain & geometry
- **`src/scripts/lobby-scene.js` — three ShaderPasses removed**:
  `WarmVignetteShader`, `FilmGrainShader`, and `BootTransitionShader`.
  Composer chain went 7 passes → 4 (Render → Bloom → Output → LUT).
  Estimated 25–35 % steady-state GPU saved on desktop. Visual
  equivalents:
    - vignette → CSS radial-gradient `#lobby-canvas-vignette`
    - grain    → CSS animated SVG noise `#lobby-canvas-grain`
    - boot fade → CSS `filter: contrast()` ramp on `#lobby-canvas`,
                  driven by a new `data-lobby-boot` attribute on
                  `<html>` toggled in `initScene` / cleared at boot
                  settle.
  Bloom strength still ramps via the `UnrealBloomPass` uniform across
  the same 1.4 s boot window — a single uniform write per rendered
  frame, near-free.
- **`src/scripts/lobby-scene.js` — `markDirty('boot-transition')`
  removed from the per-frame loop**. The dirty-flag arbitrator's 24 fps
  floor keeps the bloom ramp perceptually smooth without forcing every
  frame through the full post-processing chain during the page's
  busiest window.
- **`src/scripts/lobby-scene.js` — bloom internal scale lowered**:
  desktop 0.72 → 0.5, QHD/4K 0.66 → 0.45, mobile 0.5 → 0.4. Bloom is
  blurred by definition; the visible delta below 0.5 is below
  threshold while fragment work drops ~52 % across the 5-mip down/up
  chain.
- **`src/scripts/lobby-scene.js` — desktop Reflector RTT shrunk**:
  1024 → 768 base, 960 → 640 (Full HD), 896 → 512 (QHD/4K). The
  Reflector renders the entire scene a 2nd time per frame; this is
  the single biggest landing-route GPU saving in the pass.
- **`src/scripts/lobby-scene.js` — hex grid extents halved**: 100 × 80
  → 60 × 50. FogExp2 was already killing visibility past 40 units, so
  the geometry being removed was rendering as fog-coloured invisibility.
  Geometry processing cost drops 62.5 % on the LineSegments2 mesh.

#### CSS / compositor
- **`src/styles/global.css` — `body { background-attachment: fixed }`
  removed**. Every desktop scroll repainted the gradient over the full
  viewport AND those repainted pixels then traversed the chain of
  `backdrop-filter` layers above it — measurable scroll jank on
  integrated GPUs. The persistent `#lobby-canvas` already provides the
  perceived depth; the gradient now scrolls with the document.
- **`src/styles/global.css` — `.btn-primary` / `.btn-gold` resting-
  state `backdrop-filter` dropped**. A 10 px blur on every CTA forced
  an extra compositor pass. Opaque-enough fill + existing inset
  highlight + gold border carry the "glass on dark" read.

#### JS bundling / load behaviour
- **`src/components/CommandPalette.astro` — runtime now lazy-loaded**
  via `requestIdleCallback` (timeout 1500 ms), with a priming
  keydown / pointerdown listener that eagerly loads the runtime and
  re-dispatches the gesture if the user presses ⌘K / `/` / clicks a
  trigger before the idle window fires. Saves ~25–35 KB gz from the
  eager critical path on every page; the shortcut still feels instant.
- **`src/components/AboutDossierCard.astro` — videos lazy-loaded**.
  Markup carries `preload="none"` + `data-src`; a two-tier
  IntersectionObserver attaches `src` 600 px before the card enters
  the viewport (`preload="metadata"`) and promotes to `preload="auto"`
  + `play()` once the card is in the active reading band. Combined
  with the new `optimize-ambient-videos.mjs` re-encoding, drops
  ~9 MB of cold bytes from `/about/` and ends the speculation-rules
  spillover into `/`.
- **`astro.config.mjs` — dead manualChunks branches pruned** (mathjs,
  zod, fuse.js, chart.js, gsap — none in `package.json`). Keeps the
  bundling rule honest with the dependency graph.

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
