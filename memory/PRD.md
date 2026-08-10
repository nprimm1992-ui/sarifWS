# Sarif Consulting — PRD / Agent Memory

## Original problem statement
User owns https://sarifconsulting.ai (Astro 6 + Cloudflare Pages + D1, repo `nprimm1992-ui/sarifWS`). Wants to "massively improve" and expand: editorial depth (Praxis, Engagements), interactive products (PraxisAsk, Lexicon graph), and resolve audit backlog. Praxis article rewrite EXPLICITLY DEFERRED by user ("lets revisit the praxis articles later"). Engagement dossier CONTENT will also be rewritten by user later — current copy is placeholder; the page DESIGN is final ("world class... real time R&D / high tech lab or exhibition hall").

## Critical environment facts
- **Node >= 22.12 required; machine is aarch64.** Node 22.12 at `/root/node22` (persistent volume). `/opt` and `/usr/local` get WIPED by platform resets — never install there. Symlinks in /usr/local/bin may vanish; supervisor conf references /root/node22 directly.
- Dev server: supervisor program `astro` → `/root/node22/bin/npx astro dev --config astro.config.dev.mjs --host 0.0.0.0 --port 3000`. Preview: https://lexicon-lab-17.preview.emergentagent.com
- Playwright browsers at `/root/pw-browsers` (persistent). Run suite: `export PATH=/root/node22/bin:$PATH PLAYWRIGHT_BROWSERS_PATH=/root/pw-browsers PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321`, start `npx astro preview --host 127.0.0.1 --port 4321` against fresh `npm run build`, then `npx playwright test`. (Playwright's own webServer resolves system node 20 → fails; always use PLAYWRIGHT_BASE_URL.)
- **DO NOT deploy via Emergent.** User pushes to GitHub → Cloudflare Pages builds. We are an AI code editor only.
- Cloudflare Pages Functions (`functions/`) do NOT run under astro dev/preview — /api/* 404s in preview (expected).
- WebGL doesn't render in headless browsers (no GPU): site falls back to static backdrop + materialize 4s fallback. E2E suite runs with WebGL DISABLED by design (playwright.config.ts launchOptions) — software-GL rendering starves parallel workers otherwise.
- New inline `<script>` must survive `scripts/inject-csp-hashes.mjs`; meta descriptions must be 110–180 chars AFTER escaping (strip apostrophes/&); build sentinels fail hard.

## Cloudflare credentials (reference)
- D1 `sarif-transmissions` ID `241371f5-cdd6-4cf7-9ac1-cea637816af3` — **0 tables live; user must run `npx wrangler d1 migrations apply sarif-transmissions --remote`** (all edge writes silently fail until then).
- Turnstile sitekeys: oxflow.ai `0x4AAAAAADiWdw9r9e8i5ZdH`, sarifconsulting.ai `0x4AAAAAADiWeIHs_LFExuSo`.

## Architecture (validated by deep analysis, June 2026)
- Astro 6 SSG, trailingSlash always, View Transitions, persistent WebGL lobby (route→camera-pose registry in `src/scripts/lobby-route-poses.js`).
- Collections: lexicon (11 JSON, versioned 2026-04-v2, graph in `src/lib/lexicon-graph.ts`), engagements (6 JSON), praxis (12 MDX; 10 are ~145-word STUBS — content rewrite deferred).
- Build gauntlet: UCIM vendored build → asset pipeline → astro build → sentinels (CSP hashes, budgets, meta lengths, praxis layout, lexicon version parity). CI: `.github/workflows/ci.yml` (lint, typecheck, build, e2e).
- Search: /search-index.json + BUILD_ID cache-bust → command palette (Cmd+K) + PraxisAsk (corpus-gated ≥12).

## Implemented June 2026 (this session) — ALL TESTED GREEN
1. **Engagement Dossier Pages** `/engagements/eng-001/..eng-006/` (`src/pages/engagements/[slug].astro`): exhibition-hall design — telemetry strip, specimen plaque (sticky, scan-sweep, accent-themed per engagement), mandate panel, operations-log timeline rail, circular prev/next exhibit walk, hall index link, contact CTA. Per-exhibit accent CSS vars mirror ProofEntry accents. Meta-description generator guarantees sentinel window. data-testids: exhibit-page/-telemetry/-plaque/-stat/-mandate/-log/-log-entry/-prev-link/-next-link/-hall-link/-return-link/-contact-cta/-plaque-contact-link/-services-link.
2. **Six lobby camera poses** + `exhibit-log` subpose in lobby-route-poses.js — slow orbit arc around the right floating cluster (gallery-walk effect between exhibits).
3. **Exhibition index directory** on /engagements/ (exhibit-directory-link-eng-00N) + "Open full dossier" link in ProofEntry cards (open-dossier-<id>); EngagementCarousel passes href through.
4. **Lexicon Constellation** (`src/components/lexicon/LexiconConstellation.astro` + `src/scripts/lexicon-constellation.js`): build-time seeded force layout → static SVG (no-JS safe, every node is <a href="#id">), 11 nodes/24 edges, 4 category colors + legend, hover/focus neighbor highlight + definition tooltip, click → hashchange auto-expands entry (existing lexicon-page.ts handler). Short `term` used for labels (termDisplay collided).
5. **search-index.json**: engagement URLs now point to detail pages (/engagements/eng-00N/).
6. **E2E suite repaired → 37 passed / 1 skip / 0 failed (46s)**:
   - playwright.config.ts: workers=2, timeout 60s, WebGL disabled via launchOptions (root cause of audit's 18/25 failures = software-GL CPU starvation).
   - round7-dossier facet-width assertion fixed (bar shares row with Ask widget).
   - New `tests/e2e/exhibits.spec.ts` (5 specs: dossier chrome, six routes, directory, constellation render, click-to-expand).
   - materialize.spec.ts: retargeted stale wordmark/CTA cipher assertions (only nav links carry data-materialize-text now).
7. **Real product bugs found & fixed**:
   - CommandPalette.astro: first Ctrl+K after idle warm-up double-handled (priming listener never removed → open then instant close). Priming listeners now removed on runtime load.
   - `.command-palette[hidden]{display:none}` — closed dialog previously stayed in layout/paint.
   - materialize.js: interior direct entries now skipSequence() immediately in seedDecode (was stuck 'pending' behind veil up to 4s on no-GL clients).
   - Duplicate <h1> on all 12 praxis articles (in-body markdown H1 removed; layout owns the title).
8. Hygiene: test-results/ + playwright-report/ gitignored and untracked; stray `-e` line removed from .gitignore.
- Testing: repo e2e suite green + testing_agent iteration_1.json = 100% frontend pass, no issues.

## Backlog (prioritized)
P0 (user action): apply D1 migrations remotely (see above).
P1: Praxis editorial rebuild (10 stub articles) — USER DEFERRED, wait for their content/direction. Engagement dossier content rebuild (user will supply copy; design ready).
P2: PraxisAsk LLM grounded-answer layer (ask_queries logging already exists for it); praxis horizon/phase facet decision (schema has them, UI doesn't); TS strict rollout; asset optimizers (optimize:glbs/videos, GLBs ~9.7MB); lexicon noindex reconsideration; README merge-garbage cleanup; audit-2026-04.md superseded banner.

## Work log
- 2026-06 session 1: env setup (previous fork), deep analysis, PRD created.
- 2026-06 session 2 (this): dossier pages, constellation, poses, e2e green, palette/materialize/h1 bug fixes, testing_agent pass.
