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

## Implemented June 2026 (session 3b) — Atlas deep links
- `lexicon-graph.ts`: new derived field `atlasLink` = `/lexicon/?term=<id>` on every enriched entry (`permalink` stays the citation-stable `#id` anchor).
- `LexiconTermLink.astro` (auto-linked terms in Praxis prose): anchor href, "Open in atlas →", Related / Referenced-by chips and the superseded pointer all target `?term=` now. Pinned-popover behaviour unchanged; cmd/middle-click opens the Atlas view in a new tab.
- `search-index.json.ts`: lexicon results (⌘K palette) point at the Atlas view too.
- `lexicon-page.ts`: new `openTermParamTarget()` — a `?term=` arrival expands the matching register entry WITHOUT scrolling (Atlas owns the viewport; the flat corpus still mirrors the selection for scroll/print/Ctrl+F).
- Test: `praxis article: lexicon terms deep-link into the atlas view` (asserts every in-prose term href matches `/lexicon/?term=…`, then follows one and verifies atlas selection + register mirror). **Suite 41 passed / 1 skipped / 0 failed.**

## Implemented June 2026 (session 3c) — Term provenance
- New `src/lib/lexicon-usage.ts`: build-time provenance index. For each lexicon term it builds the same alias set the rehype auto-linker uses (`term` + `relatedTerms[]` + `aka[]` + `termDisplay` lead-in) and word-boundary/case-insensitive scans every published Praxis article (title + summary + tags + body) and every Engagement (classification, sector, stat, leads[], highlights[]), returning `{ praxis[], engagements[], total }` with per-document hit counts. Memoized per build; derived, never authored, no LLM inference.
- Atlas inspector cards gained a **"Used in"** section: one row per citing document with kind tag (Praxis / Exhibit), title, hit count (`7×`), linking to `/praxis/<slug>/` or `/engagements/<slug>/`. Terms with no citations render "Not yet cited in the published corpus." (1 term today). Engagement citations are currently zero because dossier copy is still placeholder — they will appear automatically once real narratives land.
- testids: `atlas-use-praxis-<slug>`, `atlas-use-engagement-<slug>`.
- Test: `lexicon atlas: inspector shows term provenance that navigates to the source`. **Suite 42 passed / 1 skipped / 0 failed.**

## Implemented June 2026 (session 3d) — Frameless atlas (true float)
User brief: "remove the backdrop of the graph to make it feel like it's floating in the 3D background".
- `.atlas__stage` is now genuinely frameless: no border, no chamfer/clip-path, no gradient fill, no `backdrop-filter` dimming, no inset shadows. The WebGL diorama is visible straight through the field — orbiting reveals the terraced monolith moving behind/among the nodes.
- Legibility moved onto the marks instead of a panel:
  • every edge is a PAIR (`.atlas__edge-under` 3.4px rgba(2,9,15,.6) + `.atlas__edge` 1px cyan) so a hairline survives both the dark sky and the bright ground; hot/dim state now lives on `.atlas__edge-pair` (group opacity), tests still key off `[data-edge-a]`;
  • each node gained `.atlas__shade` (dark disc) beneath its halo — reads as its own shadow on the bright ground, invisible on the dark sky;
  • labels/captions use paint-order stroke at 5px rgba(2,8,14,.85–.92); HUD copy, readout and key hints carry text-shadows.
  • an `<ellipse data-atlas-scrim>` with a radial dark gradient TRACKS the projected field each frame (centre + radii from the live node bbox), clamped inside the frame so a clipped gradient can never re-draw a panel edge. `prefers-reduced-transparency` swaps it for an opaque bed.
- **Synthetic floor grid removed entirely** (markup, CSS, runtime): the real diorama now supplies the depth reference, and the fake plane clipped as an ugly band at the stage edge.
- Suite updated (scrim + edge-underlay assertions replace the grid assertion). **42 passed / 1 skipped / 0 failed.**

## Implemented June 2026 (session 3e) — Octagonal matrix layout
User brief: "make the graph resemble an octagonal sacred geometry like matrix".
- **Force simulation and PRNG deleted.** Layout is now a deterministic three-ring octagonal armature: the most-connected term is the AXIS at centre, the next eight are seated on the primary octagon (order = category, then degree, so each channel occupies a contiguous arc), remaining terms sit on an outer octagon rotated by a half-step. Depth follows the geometry: axis nearest (z +84), primary ring alternates ±34 (antiprism, so orbit reveals it as a solid), outer ring recedes (−104). Constants: R_CORE 118 / R_RING 226 / R_OUTER 358, FLAT 0.7 (the figure is flattened on Y — a plate seen slightly from above, which also fits a 16:10 frame without cropping).
- **Sacred-geometry armature** rendered as `[data-poly]` polylines + `[data-ax]` line pairs in the figure's own z-plane, re-projected every frame so it turns WITH the matrix: 3 concentric octagons + 1 half-step-rotated octagon (the eight-pointed star), 8 radial spokes core→outer, and the {8/3} octagram chording the primary ring. Cyan rings, gold core + octagram, dashed star, all with dark underlays; the whole group drops to 0.35 opacity while a term is selected.
- Channel captions now sit on the outer margin at the mean bearing of their own arc; focus mode snaps neighbours to the same 45° bearings; `fitVisible` frames the whole figure via `data-atlas-extent-x/y` so the armature is never cropped (all 11 nodes verified in-frame at 1600×1000).
- Tests: scene spec asserts 4 rings / 8 spokes / 8 octagram chords. **Suite 42 passed / 1 skipped / 0 failed.**

## Implemented June 2026 (session 3f) — Backdrop restored
User asked for the stage backdrop back after the frameless experiment. `.atlas__stage` again carries the instrument-window treatment: hairline cyan border, `--clip-card` chamfer, radial vignette fill, `backdrop-filter: blur(3px) saturate(.9) brightness(.55)` and inset glow. The diorama still shows through (dimmed ~2 stops); `prefers-reduced-transparency` gets an opaque bed, `prefers-contrast: more` a bright border.
Kept from the frameless pass (they now help on orbit into the light): per-edge dark underlays, node shade discs, heavy paint-order label halos, armature underlays, HUD text-shadows. The tracking scrim stays but at ~40% of its previous alpha so it reads as bloom on top of the dimmed bed rather than mud. Suite 42 passed / 1 skipped.

## Backlog (prioritized)
P0 (user action): apply D1 migrations remotely (see above).
P1: Praxis editorial rebuild (10 stub articles) — USER DEFERRED, wait for their content/direction. Engagement dossier content rebuild (user will supply copy; design ready).
P2: PraxisAsk LLM grounded-answer layer (ask_queries logging already exists for it); praxis horizon/phase facet decision (schema has them, UI doesn't); TS strict rollout; asset optimizers (optimize:glbs/videos, GLBs ~9.7MB); lexicon noindex reconsideration; README merge-garbage cleanup; audit-2026-04.md superseded banner.

## Work log
- 2026-06 session 1: env setup (previous fork), deep analysis, PRD created.
- 2026-06 session 2: dossier pages, constellation, poses, e2e green, palette/materialize/h1 bug fixes, testing_agent pass.
- 2026-06 session 3f (this): stage backdrop restored (instrument window) on top of the octagonal matrix.
- 2026-06 session 3e: octagonal sacred-geometry matrix layout replaces the force sim.
- 2026-06 session 3d: frameless atlas — panel/backdrop removed, contrast moved onto the marks, floor grid deleted.
- 2026-06 session 3c: term provenance ("Used in") inside the Atlas inspector.
- 2026-06 session 3b: Praxis/palette lexicon links now deep-link into the Atlas (`?term=`).
- 2026-06 session 3: Lexicon Atlas — graph is now the page (3D projected field + inspector + traversal + focus mode + deep links + filter unification). Suite green.
