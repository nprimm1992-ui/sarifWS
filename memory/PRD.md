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

## Implemented June 2026 (session 3) — Lexicon Atlas
User brief: "the graph becomes the page… drop-down definitions absorbed into the graph"; "immersed within the 3D background… even if it's a high-end illusion"; "award winning / world class 3D animations/reactions"; "should feel like the UCIM graph mentioned in the lexicon". Register list kept (demoted) per agreement.

**New:** `src/components/lexicon/LexiconAtlas.astro` + `src/scripts/lexicon-atlas.js`.
**Deleted:** LexiconConstellation.astro + lexicon-constellation.js (superseded).

- **3D substrate, hand-rolled projection.** Every term has world coords (x,y from the build-time seeded force sim; z from category channel + degree — doctrine nearest, substrate deepest). A perspective camera (yaw/pitch/zoom/look-at + screen bias) re-projects nodes, edges, a receding floor grid (plane wy=240) and channel captions each frame in the runtime island. Constants MIRRORED in both files (FOCAL 1500, CAM_DIST 1500, HOME_YAW -0.18, HOME_PITCH -0.13); build-time markup ships the home-camera projection so the scene is complete with JS off (verified).
- **Immersion:** stage has no opaque fill — `backdrop-filter: brightness(0.55) blur(3px)` + vignette dims the WebGL diorama behind the page so it reads as the sky behind the field. New lobby subpose `lexicon-atlas` (dz +0.55, dfov +2.5) pulls the diorama back while the graph is on screen. Ambient camera drift + pointer parallax; drag to orbit, wheel/pinch zoom, Fit/±/Focus buttons.
- **Inspector absorbs the dropdowns:** selecting a node opens a docked glass panel (bottom sheet ≤900px) with L-num, channel, status, revised, definition, AKA, copy citation/permalink, "Register ↓". Entrance is a 3D rotateY/translateZ arrival with staggered children. Camera flies to frame the term WITH its neighbourhood (`fitNodes(egoNodes())`), non-neighbours recede +250 z and haze out, touched edges flow (animated dash away from the origin), origin pulses a sonar ring, and `cam.bx/by` slides the field out from under the panel.
- **Traversal:** Related/Referenced-by render as buttons (`data-atlas-goto`) that re-select and re-frame; a trail line records the walk (max 5).
- **Focus mode (F / button):** hides non-neighbours and re-lays the ego graph on a ring, neighbours sorted by their original bearing so the mental map survives; camera refits.
- **One control surface:** filter input + channel chips MOVED from the register panel into the Atlas header. `lexicon-page.ts` `applyFilter()` now dispatches `lexicon:filter` {q, categories, visibleIds}; the Atlas hides non-matching nodes/edges, lights the filtered channel caption, and refits. Register stays in sync (same island).
- **Deep links:** selection writes `?term=<id>` (replaceState); `?term=` and `/lexicon/#id` both select on load; `hashchange` selects. Escape clears selection and strips the param.
- **Device scaling:** viewBox height tracks the stage aspect at runtime (no letterboxing) and glyph scale is decoupled from camera zoom (`uiScale = clamp(1176/stageWidth, 0.9, 2.0)`) so marks/labels keep a physical size on phones; ≤600px labels only render for touched/selected nodes.
- **Register demoted** to a "Full register" section below (print / no-JS / Ctrl+F complete). All `.lex-controls` CSS + sticky nav-offset hacks removed from lexicon.astro.
- data-testids: lexicon-atlas, atlas-stage, atlas-readout(-selected), atlas-filter-input, atlas-zoom-in/-out, atlas-reset, atlas-focus-toggle, lexicon-node-<id>, atlas-inspector(-close), atlas-card-term-<id>, atlas-goto-<id>, atlas-trail.
- Tests: `tests/e2e/exhibits.spec.ts` lexicon specs rewritten → scene render, select+inspector+traversal+URL+Escape, deep link, filter/register sync, register hash arrival. **Full suite 40 passed / 1 skipped / 0 failed.** eslint + astro check clean; all build sentinels green (lexicon HTML 21.6 KB gz, well under budget).
- NOTE for future agents: node clicks in tests must dispatch a bubbling `MouseEvent('click', {bubbles, cancelable})` — the live camera moves node boxes between Playwright's hit-test and dispatch (real clicks are fine for users; only automation flakes).

## Backlog (prioritized)
P0 (user action): apply D1 migrations remotely (see above).
P1: Praxis editorial rebuild (10 stub articles) — USER DEFERRED, wait for their content/direction. Engagement dossier content rebuild (user will supply copy; design ready).
P2: PraxisAsk LLM grounded-answer layer (ask_queries logging already exists for it); praxis horizon/phase facet decision (schema has them, UI doesn't); TS strict rollout; asset optimizers (optimize:glbs/videos, GLBs ~9.7MB); lexicon noindex reconsideration; README merge-garbage cleanup; audit-2026-04.md superseded banner.

## Work log
- 2026-06 session 1: env setup (previous fork), deep analysis, PRD created.
- 2026-06 session 2: dossier pages, constellation, poses, e2e green, palette/materialize/h1 bug fixes, testing_agent pass.
- 2026-06 session 3 (this): Lexicon Atlas — graph is now the page (3D projected field + inspector + traversal + focus mode + deep links + filter unification). Suite green.
