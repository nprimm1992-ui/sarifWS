# UCIM WebGL Visualization — Astro 6 Integration Guide

## Overview

The UCIM (Universal Contextual Intelligence Matrix) visualization is a self-contained WebGL component built with vanilla Three.js + GSAP. It ships as a **Web Component** (`<ucim-visualization>`) that handles its own lifecycle, IntersectionObserver, WebGL detection, and mobile CSS fallback.

No React dependency. No framework coupling. Drop it into any Astro page.

---

## Architecture

```
UCIMVisualization.js     ← Core Three.js engine (standalone class)
UCIMWebComponent.js      ← Custom Element wrapper (registers <ucim-visualization>)
UCIMVisualization.astro  ← Astro component wrapper (optional convenience layer)
```

**Dependency chain:**

```
<ucim-visualization>  (Custom Element)
  └── UCIMVisualization  (vanilla Three.js class)
        ├── three          (peer dep — you already have this)
        ├── gsap           (peer dep)
        └── three/examples/jsm/postprocessing/*  (included in three)
```

---

## Quick Start

### 1. Install peer dependencies

```bash
# Your Astro project already has three — just add gsap
yarn add gsap
```

### 2. Copy the source files

Place these into your Astro project:

```
src/
  lib/
    UCIMVisualization.js    ← Copy from deliverable
    UCIMWebComponent.js     ← Copy from deliverable
  components/
    UCIMVisualization.astro ← Copy from deliverable (optional)
```

### 3. Use in an Astro page

**Option A — Astro component (recommended)**

```astro
---
// src/pages/about.astro
import Layout from '../layouts/Layout.astro';
import UCIMVisualization from '../components/UCIMVisualization.astro';
---

<Layout title="About — Sarif Consulting">
  <section class="ucim-section">
    <UCIMVisualization />
  </section>
</Layout>
```

**Option B — Raw custom element**

```astro
---
// src/pages/about.astro
---

<ucim-visualization></ucim-visualization>

<script>
  import '../lib/UCIMWebComponent.js';
</script>
```

**Option C — Vanilla HTML (no Astro)**

```html
<script type="module">
  import './path/to/UCIMWebComponent.js';
</script>

<ucim-visualization></ucim-visualization>
```

---

## Configuration

### Attributes

| Attribute          | Type     | Default | Description                                      |
|--------------------|----------|---------|--------------------------------------------------|
| `bloom-strength`   | `number` | `0.55`  | Bloom intensity. `0` = off, `1.0` = maximum glow |
| `fallback-only`    | `flag`   | —       | Force CSS fallback even on WebGL-capable devices  |

```html
<!-- Reduced bloom for coexisting with another WebGL scene -->
<ucim-visualization bloom-strength="0.3"></ucim-visualization>

<!-- Force fallback for testing -->
<ucim-visualization fallback-only></ucim-visualization>
```

### Astro component props

```astro
<UCIMVisualization bloomStrength={0.3} />
<UCIMVisualization fallbackOnly />
<UCIMVisualization class="my-custom-wrapper" />
```

---

## How It Works

### Lifecycle

1. **`connectedCallback`** — Element enters the DOM
   - Loads Space Grotesk font (idempotent — skips if already loaded)
   - Injects scoped CSS into Shadow DOM
   - Detects WebGL + viewport width
   - If mobile (`< 768px`) or no WebGL → renders CSS fallback
   - Otherwise → creates `UCIMVisualization` instance

2. **IntersectionObserver** — Triggers when element enters viewport
   - `isIntersecting: true` → `viz.start()` (starts GSAP timeline + render loop)
   - `isIntersecting: false` → `viz.pause()` (stops render loop + timeline)

3. **`disconnectedCallback`** — Element removed from DOM
   - Kills GSAP timeline
   - Disposes all Three.js geometries, materials, textures
   - Removes WebGL canvas from DOM
   - Disconnects IntersectionObserver

### Animation Timeline (16s loop)

```
0s ──────── 8s ──────── 12s ──────── 16s ── restart
│  ASSEMBLE  │   HOLD    │  DISSOLVE  │
│            │           │            │
│ Hex grid   │ Breathing │ Lines      │
│ Particles  │ pulse on  │ retract    │
│ Central ◆  │ central   │ Nodes      │
│ Nodes ◇×8  │ node      │ shrink     │
│ Lines ──── │           │ Fade out   │
│ Cross web  │ Slow      │            │
│ Labels     │ rotation  │            │
```

### CSS Fallback

Activated when:
- `window.innerWidth < 768`
- WebGL context creation fails
- `fallback-only` attribute is set

The fallback renders:
- Radial gradient background matching the 3D scene
- CSS hex grid pattern (animated pulse)
- SVG connection lines (animated draw + flow)
- Pulsing gold diamond center with cyan halo ring
- 8 orbital diamond nodes with labels
- 24 drifting gold particles

No WebGL context. Pure CSS/SVG. Battery-friendly.

---

## Performance Considerations

### Dual WebGL Context

Your homepage already runs a Three.js scene. The UCIM on the About page creates a second WebGL context. Recommendations:

1. **Use IntersectionObserver** (built-in) — the render loop only runs when visible
2. **Lower bloom on shared pages**: `bloom-strength="0.3"`
3. **Dispose on route change** — If using View Transitions, the `disconnectedCallback` handles cleanup automatically
4. **Consider `fallback-only` on low-end devices** — You can detect this in Astro:

```astro
<script>
  const gpu = navigator.gpu;
  const lowEnd = navigator.hardwareConcurrency <= 4;
  if (lowEnd) {
    document.querySelector('ucim-visualization')
      ?.setAttribute('fallback-only', '');
  }
</script>
```

### Bundle Size

| Module                | Gzipped   |
|-----------------------|-----------|
| `UCIMVisualization.js`| ~8 KB     |
| `UCIMWebComponent.js` | ~5 KB     |
| `three` (tree-shaken) | ~140 KB   |
| `gsap`                | ~25 KB    |

Three.js and GSAP are your largest dependencies. Since you already ship Three.js on the homepage, the incremental cost of the UCIM is ~13 KB gzipped.

### prefers-reduced-motion

The visualization respects `prefers-reduced-motion: reduce`. When active:
- GSAP timeline seeks to the hold state (10s) and pauses
- Renders a single static frame showing the fully assembled matrix
- No continuous animation, no render loop

---

## Customization

### Changing Node Labels

Edit the `LABELS` array at the top of `UCIMVisualization.js`:

```js
const LABELS = [
  'Market Position',
  'Competitive Landscape',
  'Organizational Context',
  'Risk Architecture',
  'Revenue Structure',
  'Stakeholder Mapping',
  'Strategic Alignment',
  'Operational Reality',
];
```

Also update the `LABELS` array in `UCIMWebComponent.js` (used by the CSS fallback).

### Changing Colors

Edit the `C` constant in `UCIMVisualization.js`:

```js
const C = { BG: 0x0a0f1a, GOLD: 0xd4af37, CYAN: 0x00d4ff };
```

### Changing Orbital Positions

Edit the `POS` array in `UCIMVisualization.js`. Each entry is `[x, y, z]` in Three.js world units. The orbital radius is approximately 3.0–3.5 units.

### Changing Animation Duration

Edit the GSAP timeline in `_buildTimeline()`. Key timestamps:
- Assemble: `0` to `~8s`
- Hold: `8s` to `12s`
- Dissolve: `12s` to `~16s`

---

## Troubleshooting

### Visualization doesn't appear

1. Check browser console for WebGL errors
2. Verify `three` and `gsap` are installed: `yarn list three gsap`
3. Check the element is in the viewport (IntersectionObserver threshold is 0.1)
4. Try adding `style="min-height: 400px"` to ensure the container has dimensions

### Labels not showing Space Grotesk

The Web Component auto-loads the font from Google Fonts. If your CSP blocks external fonts, host the font locally and update `_ensureFont()` in `UCIMWebComponent.js`.

### Performance issues on mobile

The component automatically falls back to CSS on viewports < 768px. If you need the WebGL version on tablets, adjust the width threshold in `_shouldUseFallback()`.

### Two WebGL contexts warning

This is expected if your homepage also uses Three.js. The UCIM pauses its render loop when not visible, so GPU cost is minimal when off-screen.

---

## File Reference

| File | Purpose | Size |
|------|---------|------|
| `UCIMVisualization.js` | Core Three.js engine — standalone class with GSAP timeline, bloom post-processing, custom GLSL shaders | ~680 lines |
| `UCIMWebComponent.js` | Custom Element wrapper — Shadow DOM, CSS injection, fallback generator, IntersectionObserver, font loading | ~280 lines |
| `UCIMVisualization.astro` | Astro convenience wrapper — typed props, scoped styles, client-side import | ~50 lines |
| `ASTRO_INTEGRATION.md` | This document | — |
