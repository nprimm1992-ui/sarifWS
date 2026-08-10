# Sarif Consulting — PRD / Agent Memory

## Original problem statement
User owns https://sarifconsulting.ai (Astro 6 + Cloudflare Pages + D1, repo `nprimm1992-ui/sarifWS`). Wants to "massively improve" and expand: editorial depth (Praxis, Engagements), interactive products (PraxisAsk, Lexicon graph), and resolve audit backlog (E2E in CI, asset optimizers, TS strict, Lighthouse gate). Detailed expansion requirements promised by user — STILL PENDING as of 2026-06.

## Critical environment facts
- **Node >= 22.12 required.** Machine is aarch64. Node 22.12 installed at `/opt/node22`, symlinked to `/usr/local/bin/{node,npm,npx}`. If a fork loses this: re-download `node-v22.12.0-linux-arm64.tar.xz`, extract to /opt/node22, relink, `sudo supervisorctl restart astro`.
- Dev server: supervisor program `astro` runs `npx astro dev --config astro.config.dev.mjs --host 0.0.0.0 --port 3000`. Preview: https://lexicon-lab-17.preview.emergentagent.com
- **DO NOT deploy via Emergent.** Deployment = user pushes to GitHub → Cloudflare Pages builds. We are an AI code editor only.
- Cloudflare Pages Functions (`functions/`) do NOT run under `astro dev`. Test via `npm run build && npx wrangler pages dev dist` or logic review.
- WebGL lobby does not render in headless screenshots (no GPU) — hero looks mostly empty; this is expected, not a bug.
- Any new inline `<script>` in HTML must survive `scripts/inject-csp-hashes.mjs` (postbuild CSP hash injection) — prefer `<script>` module imports Astro bundles externally.
- E2E: `npm run build && npx playwright install chromium && npm run test:e2e` (runs against `astro preview` :4321).

## Cloudflare credentials (reference)
- D1 `sarif-transmissions` ID `241371f5-cdd6-4cf7-9a c1-cea637816af3` — **0 tables live; migrations never applied remotely** (user must run `npx wrangler d1 migrations apply sarif-transmissions --remote`).
- Turnstile sitekeys: oxflow.ai `0x4AAAAAADiWdw9r9e8i5ZdH`, sarifconsulting.ai `0x4AAAAAADiWeIHs_LFExuSo`.

## Architecture (validated 2026-06 deep analysis)
- Astro 6 SSG, trailingSlash always, View Transitions; persistent canvases (`transition:persist`) — one continuous 3D lobby across routes.
- Content collections: lexicon (11 JSON, versioned `2026-04-v2`, 4-category taxonomy, backlink graph in `src/lib/lexicon-graph.ts`), engagements (6 JSON cards, no detail pages), praxis (12 MDX; **10 are ~145-word auto-generated stubs**, only 2 real articles).
- Client: ~25 vanilla JS islands; unified main-ticker (single rAF) + lobby-render-budget dirty-flag arbitrator; lobby-scene.js (3.4k lines) Three.js with Meshopt GLBs, HDR IBL, 4-pass composer; route→camera-pose registry in lobby-route-poses.js (subpose hooks exist).
- Edge: 9 Pages Functions (transmit, contact, ask, csp-report, pickup claim/draft, admin purge/dsar/vitals) — zero-dep, rate-limited, daily-salted ip_hash, 204-always telemetry, CF Access on admin.
- Build gauntlet: UCIM vendored React build → asset scripts → astro build → postbuild sentinels (CSP hashes, HTML/bundle budgets, meta length, praxis layout, lexicon version parity). CI workflow `.github/workflows/ci.yml` runs check:all + build + E2E.
- Search: static `/search-index.json` with BUILD_ID cache-busting → command palette (Cmd+K) + PraxisAsk (retrieval-only, gated at >=12 published articles — currently exactly 12).

## Known issues / backlog (prioritized)
P0 (blocked on user): expansion requirements not yet provided.
P1:
- Praxis seed content: 10 stub articles need real editorial content (feeds PraxisAsk quality).
- Production D1 empty — user action (migrations apply).
- E2E drift: contact.spec.ts uses `[name="message"]` but form field is `signal` (F-01); round7-dossier geometry test assumes removed sidebar (F-02). Suite likely red in CI.
P2:
- Praxis `horizon`/`phase` in schema+search-index but absent from facet UI (F-04) — needs product decision.
- `.sr-only` vs local `.visually-hidden` duplication (F-03).
- TS strict:false, ~160 implicit-any hints (F-06).
- `/api/contact` subscribe has no Turnstile (F-05, accepted risk).
- Asset optimizers not run (`optimize:glbs`, `optimize:videos`); GLBs total ~9.7MB.
- Lexicon noindex/sitemap-filtered — reconsider for SEO.
- README merge garbage; audit-2026-04.md needs superseded banner (F-07).

## Growth vectors already scaffolded in code
- PraxisAsk → LLM grounded-answer layer (ask_queries logging exists for this).
- Lexicon graph visualization (graph data computed, no graph renderer).
- Engagement detail pages (`[slug]` route missing — only collection without one).
- Route-specific lobby sub-poses (resolveSubpose + data-lobby-subpose ready).
- Jensen pickup agent loop (claim/draft API contract complete, no agent).

## Work log
- 2026-06 (this session): Fixed forked env (Node 22 arm64 reinstall, supervisor astro restored, site 200 on :3000). Performed full deep-dive codebase analysis (delivered to user). No code changes.
- Prior session: env setup, astro.config.dev.mjs + supervisor conf created, build verified.
