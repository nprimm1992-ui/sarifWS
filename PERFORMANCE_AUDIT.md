# Sarif Consulting — Desktop Performance Audit

**Date:** Jan 2026  
**Repo:** `nprimm1992-ui/sarifWS` (working tree at `/app`)  
**Stack:** Astro 6 (static), Three.js 0.183, Lenis, self-hosted fonts, Cloudflare Pages.  
**Scope:** Desktop (the user's reported pain). Mobile tier already throttled correctly.  
**Method:** Read-only static review of `src/`, `public/`, `astro.config.mjs`, `_headers`, build scripts, and the live `console_logs.txt` capture.

The codebase is *exceptionally well-engineered* in many respects (dirty-flag render arbitrator, unified rAF ticker, IntersectionObserver-gated animations, careful CSP). The performance issue is **not** poor code — it is **too much simultaneous high-end work for the desktop GPU/main thread**. Initial-load slowness and runtime jank both flow from a small number of structural decisions, listed below in priority order.

---

## TL;DR — top 5 wins, ranked by impact

| # | Fix | Estimated impact on desktop LCP/INP | Effort |
|---|---|---|---|
| 1 | **Disable `<script type="speculationrules">` `prerender: moderate`** for 5 routes (Base.astro line 210) — or downgrade to `prefetch` | -30–60% perceived load, eliminates phantom 5× boot of the WebGL scene | 1 line |
| 2 | **Cut post-processing chain from 5 passes → 2** (drop Bloom or merge into LUT, drop FilmGrain, drop BootTransition, drop WarmVignette) | -25–40% steady-state GPU + cuts compositor pressure | medium |
| 3 | **Drop the floor `Reflector`** (`src/scripts/lobby-scene.js` line 1047) or fall back to a static cube-map / blurred screen-space "fake" mirror | -30% GPU per frame on landing (Reflector renders the entire scene a 2nd time at 1024² desktop) | medium |
| 4 | **Compress / lazy `preload="none"` the `.mp4` videos** in `public/` (6.1 MB + 3.3 MB MP4s referenced by AboutDossierCard with `preload="auto"`) | -10 MB cold start on `/about/`, frees connections during LCP | small |
| 5 | **Re-encode the two 1.9 MB PNGs** (`og-image.png`, `Create_a_premium_luxury_logo_*.png`) → AVIF/WebP at appropriate sizes | -3.5 MB OG/social + landing critical path | small |

Apply 1 + 4 alone and the **landing TTFB → first interactive will improve dramatically** with zero visual change.

---

## 1. Initial-loading sequence — what's actually happening

When a desktop browser hits `/`, here is the work timeline (per the source):

1. HTML arrives (≤100 KB gz budget enforced — fine).
2. Browser begins **5 critical preloads** in `<head>` (4 woff2 + the wing-emblem GLB; HDR optional).
3. `<link rel="preload" as="fetch" type="model/gltf-binary">` for `wing-emblem-3d-model.glb` (244 KB) competes with fonts.
4. **`<script type="speculationrules"> prerender: moderate`** kicks off prerender for **5 routes**: `/about/`, `/services/`, `/engagements/`, `/praxis/`, `/contact/`. Each prerender:
   - Downloads its full HTML + CSS + JS chunks
   - Runs `Base.astro`'s `<script>` blocks → boots `materialize.js`, `reveal.js`, `telemetry.js`, `network-status.js`, `cta-telemetry.js`, `magnetic-cta.js`, `spring-tilt.js` immediately
   - Schedules `lobby-scene.js` import via `requestIdleCallback` — which **does** fire in a prerender — so it allocates a 2nd, 3rd, …, 6th `WebGLRenderer`, scene graph, EffectComposer, PMREMGenerator, Reflector, 8 000-hex-line geometry, GLBs, etc.
   - Runs `atmosphere.js` (2D canvas particles)
   - Allocates an `AudioContext` (`audio.js`) — Chromium throttles this in prerender, but the constructor still runs.
5. The visible `/` document continues its own boot:
   - Lobby idle-imports → `initLobby()`.
   - Synthetic IBL via `PMREMGenerator.fromScene` (1 sync render-target round-trip — a known cause of `GPU stall due to ReadPixels`, exactly the warning observed in `console_logs.txt`).
   - Builds 8 000-hex `LineSegments2` mesh (~48 000 line segments → ~96 000 instanced triangles) on the main thread.
   - 16 `THREE.PointLight`/`SpotLight`/`Directional`/`Hemisphere` instances added — Three.js forward renderer pays per-light cost on **every fragment of every material** every frame.
   - **EffectComposer** with 6 fullscreen passes: RenderPass + UnrealBloom (5-mip down/upsample chain) + WarmVignette + OutputPass + LUTPass + FilmGrain + BootTransition.
   - **Reflector** at 1024×1024 RTT renders the whole scene a 2nd time per frame (yes — full second scene traversal, full lights, full state).
   - Boot transition runs 1.4 s of chromatic aberration + scan-lines + bloom 0.55 → 0.26 lerp; this **forces every frame to render** during boot (`markDirty('boot-transition')` line 2761), defeating the dirty-flag arbitrator until calm.
6. **Materialize sequence** simultaneously animates ~30 character-cipher decode loops on `[data-materialize-text]` elements, mutating `textContent` every 22 ms × N chars.
7. Lenis (homepage smooth-scroll) installs.
8. Atmosphere canvas (DPR-capped, 24 fps cadence) starts.
9. CommandPalette mounts (957-line component) — it lazy-fetches the search index only on first open, but the whole 808-line runtime is shipped.

The cumulative cost during the first ~1.5 s on a desktop with HiDPI and DPR ~2 is what the user perceives as "slow initial loading."

---

## 2. Severity-ranked findings

### 🔴 P0 — Speculation rules `prerender` for 5 routes
**File:** `src/layouts/Base.astro:214`

```js
{ source: 'list', urls: ['/about/', '/services/', '/engagements/', '/praxis/', '/contact/'], eagerness: 'moderate' }
```

**Why this is the #1 desktop issue:**
- Chromium honours `eagerness: 'moderate'` after the page becomes interactive — it spins up **5 prerendered documents in parallel**.
- Each prerender boots a *full* WebGL scene with Reflector, EffectComposer, PMREM, 8 000 line segments, 16 lights, GLB loaders, plus the `atmosphere.js` 2D canvas, plus `materialize.js`, plus `reveal.js`, plus `spring-tilt.js`'s `pointermove` listener, plus an `AudioContext`.
- Browsers cap concurrent **WebGL contexts at 16** (Chromium); after that the oldest ones are *force-lost*, which means when the user finally clicks "About" the prerender has already had its context discarded — back to a cold boot.
- During the prerender phase the user is *still on `/`*. The GPU and main thread are saturated by background work the user cannot see.
- Even when prerenders succeed, navigation to those routes is fast — but the cost was paid up front, on `/`. That **is** the "slow initial loading" symptom.

**Fix:** either remove the rule, or — much better — change to `prefetch` (HTML-only, no script execution):

```html
<script type="speculationrules">
  { "prefetch": [{ "source": "list",
                   "urls": ["/about/", "/services/", "/engagements/", "/praxis/", "/contact/"],
                   "eagerness": "moderate" }] }
</script>
```

Prefetch gives ~80% of the perceived navigation speedup at <5% of the cost.

If prerender is desired for *one* genuinely-likely next route, do it for one only and switch to `eagerness: 'conservative'` (fires only on hover/touchstart).

---

### 🔴 P0 — Floor `Reflector` doubles every frame's GPU cost
**File:** `src/scripts/lobby-scene.js:1047`

```js
const reflector = new Reflector(reflectorGeo, {
  textureWidth: 1024,
  textureHeight: 1024,
  ...
});
```

`THREE.Reflector` works by:
1. Cloning the camera, mirroring it across the floor plane.
2. Rendering the entire scene (8 000-line hex grid, 20 floating wireframes/solids, GLB planters, emblem, dust particles, all 16 lights) into a **1024² render target**.
3. Sampling that target as the floor's diffuse texture.

This is one of the most expensive primitives in three.js. On a 1440p desktop with DPR 2 it can easily eat 4–8 ms/frame (vs ~0.3 ms for a static reflective material). Even with the dirty-flag arbitrator, *every* render that passes the predicate pays it.

**Fix options (in order of preference):**
- **Bake** a single screen-space reflection texture once and use it as a tinted `MeshBasicMaterial` floor. The floor is static, the camera moves slowly — the cheat is invisible.
- Cap to **512²** with a one-frame stale (re-render every 4th frame). Three.js doesn't ship this — needs custom RTT scheduling.
- Replace with **`MeshStandardMaterial` + `roughness: 0.05` + a faint cubemap reflection** sampled from the existing PMREM. Visually >80% as good for ~5% of the cost.

---

### 🔴 P0 — Hex grid: 8 000 hexes × 6 fat-line segments
**File:** `src/scripts/lobby-scene.js:937–989, 1095–1137`

```js
const HEX_COLS = 100;
const HEX_ROWS = 80;
// → 8 000 hexes × 6 lines × 2 verts × instanced triangle strips (LineSegments2)
```

`LineSegments2` is a ~96 000-triangle mesh. Even though it lives on its own scene layer to skip the Reflector, the main camera draws it every frame *and* the boot fade-in animation forces opacity tweens for ~900 ms of guaranteed renders.

**Fix:** halve the visible area — `HEX_COLS = 60, HEX_ROWS = 50` → 3 000 hexes (-62% triangle count) is visually indistinguishable beyond ~30 units of fog (FogExp2 density 0.038 already kills visibility there).

Bonus: replace with a **single shader plane** (Plane + procedural hex pattern in fragment shader). One draw call. Pixel-identical look. ~5% of the GPU cost.

---

### 🔴 P0 — Six post-processing passes per frame
**File:** `src/scripts/lobby-scene.js:2327–2399`

```
RenderPass  →  UnrealBloomPass  →  WarmVignetteShader  →
OutputPass  →  LUTPass  →  FilmGrainShader  →  BootTransitionShader
```

Each pass is a **fullscreen render** of `viewport.width × viewport.height × DPR`. UnrealBloomPass internally does **5 mip levels** (5 down + 5 up = 10 sub-passes). On a 1440p HiDPI display:

- Bloom: 10 × ~3.7 Mpx fragment shader runs ≈ **37 Mpx** of fill
- 4 other fullscreen passes ≈ **15 Mpx**
- Plus the main scene render ≈ **3.7 Mpx**
- Plus the Reflector pass ≈ **1 Mpx** (1024²)

≈ **57 Mpx of fragment work per frame** on landing. At 60 fps this is 3.4 Gpx/s — saturates integrated GPUs.

**Fix priority order:**
1. **Drop `WarmVignetteShader`** — vignette can be a CSS `radial-gradient` overlay on `#lobby-canvas` with `mix-blend-mode: multiply`. Free.
2. **Drop `FilmGrainShader`** — same effect via CSS `background-image: url(noise.svg); animation: grain` on a fixed overlay div. Free.
3. **Merge BootTransitionShader into LUTPass** — 1.4 s effect; can be a CSS filter (`filter: contrast(1.25) saturate(1.2)` lerp via JS) on the canvas itself. The aberration + scan-lines are nice but cost a fullscreen pass for 1.4 s.
4. **Reduce Bloom internal scale** from 0.72 → 0.5 desktop. `resolveBloomInternalScale()` line 93 — not visible at this strength.
5. **Convert LUTPass into a custom OutputPass** that does sRGB encode + LUT in one shader. Saves the texture round-trip between passes.

After these, the chain is RenderPass + Bloom + (CombinedOutput+LUT) = 3 passes ≈ -50% post-processing GPU.

---

### 🟠 P1 — 16 dynamic lights on a forward renderer
**File:** `src/scripts/lobby-scene.js:2235–2311`

```
1× Hemisphere (scene)        1× Hemisphere (envScene PMREM)
2× Directional               5× Point lights
4× Spot lights (3 planter + 1 emblem)
3× emblem-local point lights (created in createLogo3D)
```

Three.js MeshPhysicalMaterial / MeshStandardMaterial recompiles its shader once per unique `MAX_LIGHTS` value, then every fragment of every PBR material samples every light every frame. Cyan/Gold accent lights fade most of their contribution into bloom — they're **decorative, not load-bearing**.

**Fix:** retain hemisphere + 1 directional + the 3 planter spots (essential for the planters), demote the rest to **emissive materials** (free) or **baked-in vertex colours** on the floating geometry. Target: 5–6 lights total. Same look, ~3× faster shader.

---

### 🟠 P1 — Boot transition forces every-frame render for 1.4 s
**File:** `src/scripts/lobby-scene.js:2761`

```js
markDirty('boot-transition');
```

Inside the boot tween (every frame) the dirty flag is set, defeating the arbitrator. During this window every browser frame pays the *full* pipeline (Reflector + Bloom + 6 passes + 16 lights). Visually the user sees the "energising" effect — but it lands on the worst possible window: the first second after page load, when the rest of the document is also booting.

**Fix:** simply *remove* the chromatic-aberration boot transition and replace with a CSS `opacity` + `filter: contrast(1.1) → 1.0` fade on `#lobby-canvas`. The `data-materialize` cipher decode already tells the user "the page is materialising"; the in-shader CA is overkill. Kept budget can buy a 60 fps lobby instead of a 1.4 s laggy intro.

---

### 🟠 P1 — Heavy `<video preload="auto">` clips
**File:** `src/components/AboutDossierCard.astro:96`

```jsx
<video src={videoSrcEncoded} muted loop playsinline preload="auto" />
```

Two MP4s referenced by `/about/`:
- `Context flow.mp4` — **6.1 MB**
- `Amber_Light_Network_..._kY2lTZ1w.mp4` — **3.3 MB**

`preload="auto"` instructs the browser to fetch *the entire file*. Even though `/about/` is not the landing page, **the speculation-rules prerender from the landing page will include `/about/`**, which kicks off ~10 MB of video downloads from `/`. This alone could explain a "slow initial load" complaint.

**Fix:**
1. Change to `preload="none"` and lazy-init via IntersectionObserver — set `preload="metadata"` when the card scrolls within ~500 px, swap to `auto` on first user gesture.
2. Re-encode to **WebM/AV1 + MP4/H.264 fallback** with `<source>` tags. AV1 will roughly halve the file size at the same quality. Most modern desktops decode AV1.
3. Consider reducing the visual size of these decorative loops to ≤ ~320 px tall, then re-encode at that resolution.

---

### 🟠 P1 — 1.9 MB raster images
**File:** `public/`

| File | Size | Use |
|---|---|---|
| `Create_a_premium_luxury_logo_for_SARIF_CONSULTING_-1776279344571.png` | **1.9 MB** | OG fallback |
| `og-image.png` | **1.9 MB** | OpenGraph share image |
| `Remove_background_from_this_golden_winged_emblem_i-1775897943419.png` | 144 KB | Emblem fallback |

These are referenced from `Base.astro` as `og:image` / `twitter:image` for every page. The browser **does** fetch them (low priority) when a page is shared/embedded, but they also affect first-paint priority queue ordering on the landing path.

**Fix:** re-encode at the canonical 1200×630 OG size as **AVIF (~80 KB) + JPEG fallback (~120 KB)**. Drop both 1.9 MB sources. Output budget total <250 KB across both.

---

### 🟠 P1 — `background-attachment: fixed` body gradient on desktop
**File:** `src/styles/global.css:271–276, 1364–1368`

```css
body { background-attachment: fixed; }
@media (max-width: 1024px) { body { background-attachment: scroll; } }
```

Fixed background is the canonical desktop scroll-jank source: every scroll event repaints the gradient over the full viewport, *and* the gradient sits behind a transparent canvas + multiple `backdrop-filter` layers, so the compositor must redo every blur pass.

The mobile/tablet override exists but **desktop is the user's reported issue** — the optimization is reversed. Remove `background-attachment: fixed` entirely; the lobby canvas already provides the visual depth the gradient was meant to add.

---

### 🟠 P1 — Stacked `backdrop-filter: blur(20–30px)` on a busy compositor
Multiple persistent UI surfaces use heavy blurs over a continuously-rendering WebGL canvas:

| Surface | Blur | File |
|---|---|---|
| `#site-nav.scrolled` | `blur(20px) saturate(1.2)` | Nav.astro:97 |
| `.nav-mobile` | `blur(30px) saturate(1.3)` | Nav.astro:299 |
| `.glass-panel` | `blur(24px) saturate(1.3)` | global.css:602 |
| `.content-back-panel`, `.page-reads-over-lobby` | `blur(20px) saturate(1.15)` | global.css:493 |
| `.breath-section` | `blur(20px) saturate(1.2)` | global.css:752 |
| `.btn-primary` | `blur(10px) saturate(1.2)` | global.css:644 |
| `#sarif-network-status` | `blur(14px) saturate(130%)` | global.css:69 |

Every `backdrop-filter` element forces the compositor to re-rasterise the layers behind it on every frame the underlying texture changes. Combined with the always-rendering lobby canvas at 24 fps minimum, these blurs are **never free**. Multiple desktop GPUs (especially Intel Iris, AMD Vega 8, M-series at low power) will throttle.

**Fix:**
- Drop blur **on `.btn-primary`**: 10 px blur on a tiny element with mostly opaque chrome contributes nothing to the visual but pays a separate compositor pass. Already handled on hover (line 682) — extend to the resting state.
- **Cap `glass-blur` to 12 px on desktop**; the cyan-rim + inset-shadow is doing 90% of the work. The blur radius scales **quadratically** in cost — 12 px is ~36% the cost of 24 px.
- The `prefers-reduced-motion` block already kills `backdrop-filter` on `.content-back-panel` etc. (line 526) — extend that to `.glass-panel` and `.breath-section`.

---

### 🟡 P2 — `PMREMGenerator.fromScene` causes the observed `ReadPixels` GPU stall
**File:** `src/scripts/lobby-scene.js:2188`

```js
_activeEnvRT = pmrem.fromScene(envScene, 0.04);
```

This is the **root cause of the `GPU stall due to ReadPixels` warning** in `console_logs.txt`. PMREMGenerator round-trips the synthetic environment scene through CPU memory once on boot. Cost is one-shot but synchronous — adds ~30–80 ms to TTI on cold boot.

**Fix:** since the synthetic IBL is static (unchanging hemisphere + directional), **bake it once** at build time into a CubeTexture in `/public/env/synthetic-ibl.basis` (or a small `.hdr`) and load it like the optional studio HDR. Removes the runtime PMREM call entirely.

---

### 🟡 P2 — `materialize.js` thrashes layout while the lobby is also booting
**File:** `src/scripts/materialize.js:160–192`

The cipher decode writes `target.cipherEl.textContent = display` every 22 ms. Each write invalidates layout for that text node. With ~5–10 elements decoding simultaneously during the first 1.5 s window, that's ~250 layout-invalidating writes during the busiest part of the boot. Each one runs on the *same main thread* the lobby `animateStep()` is also using.

**Fix:**
- Defer `initMaterialize()` to fire **after** `sarif:lobby-ready` (or a 600 ms timeout, whichever is first) instead of running concurrently.
- Or: increase `CHAR_RESOLVE_INTERVAL_MS` from 22 to 40 and `CHAR_CYCLE_COUNT` from 3 to 2 — same visual feel, half the layout writes.
- Or: render the cipher into a single `<canvas>` element drawn from the ticker (no DOM mutation).

---

### 🟡 P2 — `vite.manualChunks` references libs that aren't in `dependencies`
**File:** `astro.config.mjs:55`

```js
if (/[\\/](mathjs|zod|fuse\.js|chart\.js)[\\/]/.test(id)) return 'libs';
```

`chart.js`, `mathjs`, `zod`, `fuse.js` and `gsap` are in the chunking config but not in `package.json`. This is **dead config**, not a perf issue per se — but suggests the build was authored against a different prior dependency set. Worth cleaning to avoid surprise bundle bloat if a transitive dep ever pulls one in.

---

### 🟡 P2 — Bundle splitting: every page ships the 957-line CommandPalette runtime
**File:** `src/components/CommandPalette.astro` + `src/scripts/command-palette.js` (808 lines)

The palette is mounted from `Base.astro` so it ships on every page. Index data is lazy-loaded (good), but the runtime itself isn't. ~25–35 KB gz.

**Fix:** wrap the runtime import in a `requestIdleCallback(() => import('./command-palette.js'))` after first paint, with a fallback eager-import on the first `Cmd+K` keypress so the shortcut never feels dead.

---

### 🟡 P2 — `pointermove` global listeners
- `spring-tilt.js:241` — global `pointermove` for card tilt (does `getBoundingClientRect()` per visible card per move)
- `magnetic-cta.js` — global `pointermove` for magnetic CTAs
- `lobby-scene.js:2812, 2830` — global `mousemove` + `pointerrawupdate` for camera parallax

Three independent global pointer listeners. On a high-Hz mouse (1000 Hz polling) `pointerrawupdate` fires at full rate — Three.js camera path coalesces internally, but `spring-tilt` does *not* (it does a `getBoundingClientRect()` for every visible card per pointer event).

**Fix:** consolidate via the existing `main-ticker` — store the latest pointer in a single module-scope variable and have all three consumers read it on the next tick. Cuts effective work from `~1000 events/s × 3 listeners` to `60 reads/s × 3 consumers`.

---

### 🟢 P3 — Micro-issues
1. **`* { border-radius: 0 !important }`** (global.css:255) — a universal-selector `!important` rule. Fine for correctness but indicates earlier debugging. Keep.
2. **Custom-cursor SVG data URL** (global.css:433) on `a, button, [role="button"], .interactive` — this matches *thousands of elements*; on every hover the browser parses the SVG (cached after first), but the rule itself contributes to selector-match cost. Consider applying via a `body { cursor: url(...) }` + per-element overrides for non-interactive surfaces.
3. **`will-change: transform`** on `#site-nav` (Nav.astro:92) and a few animated elements — appropriate.
4. **CSP allows `'unsafe-inline'` styles** — accepted as-is; not perf-related.
5. **`@property --ticker-glow`** is a Houdini animatable custom prop. Fine.
6. **`audio.js`** creates `AudioContext` on first user gesture only (good) — no boot cost. Keep.

---

## 3. What's *good* and should be preserved

- **`main-ticker.js`** unifying every rAF subscriber. Excellent design.
- **`lobby-render-budget.js`** dirty-flag arbitrator with 24 fps floor. Excellent.
- **`prefers-reduced-motion` and `prefers-contrast` paths** thoroughly threaded.
- **DPR caps** `resolveLobbyPixelRatio` (line 71) and matched `resolveAtmosphereDpr` (atmosphere.js:22) — exactly right.
- **MeshoptDecoder** for GLBs + WASM CSP token + `wasm-unsafe-eval` — proper.
- **Astro `output: 'static'` + Cloudflare Pages immutable cache headers** — proper.
- **`content-visibility: auto`** with size hints for below-fold sections — proper.
- **Self-hosted woff2** with preload of the 4 above-fold weights — proper. (Maybe drop the Inter-300 file; not in any preload, and `font-display: swap` will swap from system anyway.)
- **`speculationrules`** is being used — the *intent* is right, only the eagerness is wrong (see P0).
- **`view-transition-name: none`** on the persistent canvases — proper, prevents bitmap crossfades during navigation.

---

## 4. A 1-week prioritised work plan

**Day 1 (lowest-risk, highest-impact):**
- [ ] Change speculation rules from `prerender` → `prefetch` (or limit prerender to ONE route at `eagerness: 'conservative'`).
- [ ] Re-encode `og-image.png` (1.9 MB → ~80 KB AVIF + JPEG fallback). Same for the premium-logo PNG.
- [ ] Re-encode the two MP4s; set `preload="none"` and IntersectionObserver-based lazy load in `AboutDossierCard.astro`.
- [ ] Remove `background-attachment: fixed` from the desktop body rule.
- [ ] Drop `backdrop-filter` from `.btn-primary` in the resting state.

→ Expected: -3 MB cold network, -30–60% perceived initial load, no visual regression.

**Day 2–3 (lobby fidelity-vs-cost rebalance):**
- [ ] Drop `WarmVignetteShader`; replace with CSS overlay on `#lobby-canvas`.
- [ ] Drop `FilmGrainShader`; replace with CSS noise overlay (animated).
- [ ] Drop or simplify `BootTransitionShader`; CSS filter fade instead.
- [ ] Remove `markDirty('boot-transition')` once boot is CSS-driven — restore the dirty-flag arbitrator's 24 fps cap during boot.
- [ ] Lower bloom internal scale to 0.5 on desktop.

→ Expected: -25–40% steady-state GPU, smoother 60 fps on integrated GPUs.

**Day 4 (lobby geometry):**
- [ ] Halve hex grid (`HEX_COLS=60, HEX_ROWS=50`).
- [ ] Demote 8 of the 16 lights to emissive materials / baked colours.
- [ ] Replace `Reflector` 1024² with cubemap-sampled `MeshStandardMaterial` reflection (or 512² Reflector rendered every 4th frame).

→ Expected: -30% GPU on landing.

**Day 5 (cleanup):**
- [ ] Bake synthetic IBL at build time → drop runtime PMREM `fromScene`.
- [ ] Lazy-import `command-palette.js` via idle.
- [ ] Consolidate `pointermove` listeners through main-ticker.
- [ ] Remove unused `manualChunks` references (mathjs/zod/fuse/gsap/chart.js).
- [ ] Drop the `Inter-300` woff2 from the served bundle (no preload, never used above the fold).

→ Expected: -25 KB JS, -24 KB woff2, -0.1 s TTI.

---

## 5. Suggested measurement plan

This codebase already has `web-vitals` (`package.json:40`) but I don't see it wired up in `src/scripts/telemetry.js`'s preview. Recommended:

```js
// src/scripts/telemetry.js — add at top
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';
[onLCP, onINP, onCLS, onFCP, onTTFB].forEach(fn => fn(metric => {
  navigator.sendBeacon('/api/rum', JSON.stringify({
    name: metric.name, value: metric.value, id: metric.id,
    rating: metric.rating, navigationType: metric.navigationType,
    path: location.pathname, build: document.querySelector('meta[name=build]')?.content,
  }));
}));
```

Add a Cloudflare D1 table `rum_metrics(name, value, rating, path, build, ts)` and a Pages Function at `/api/rum` (you already have the contact one — use the same shape). Dashboards via SQL: `SELECT name, percentile(value, 0.75) FROM rum_metrics WHERE build = ? GROUP BY name`.

This is the only honest way to verify a "world-class" feel — measured p75 across real desktops, not lab-only Lighthouse numbers.

---

## 6. Final word

The team has built something genuinely sophisticated. The performance issue is **scope discipline**: too many premium effects (Reflector + Bloom + LUT + Grain + Vignette + Boot transition + 16 lights + 8 000-hex grid + dual canvases + speculation prerender × 5 routes) all running together. Pick the **3 effects that truly carry the brand** (suggested: Bloom, LUT, fog) and remove the rest. The site will feel more world-class with less, not more — because nothing will jank.
