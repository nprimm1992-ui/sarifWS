# UCIM WebGL Animated Visualization Component — PRD

## Original Problem Statement
Build a self-contained, high-performance 3D React component representing the Universal Contextual Intelligence Matrix for sarifconsulting.ai. "Cyber-Renaissance" aesthetic using vanilla Three.js + GSAP, portable to Astro 6.

## Architecture
- **Core**: `UCIMVisualization` class (vanilla Three.js + GSAP) — framework-agnostic
- **Web Component**: `<ucim-visualization>` custom element with Shadow DOM
- **Post-Processing**: EffectComposer + UnrealBloomPass
- **Custom Shaders**: GLSL hex grid (animated ripple), particle (twinkle/glow)
- **React Wrapper**: UCIMContainer for React-based demo
- **Fallback**: CSS-animated version for mobile/no-WebGL

## Deliverables
| File | Purpose |
|------|---------|
| `UCIMVisualization.js` | Core Three.js engine (standalone class) |
| `UCIMWebComponent.js` | Custom Element wrapper (Shadow DOM, CSS, fallback, IntersectionObserver) |
| `UCIMVisualization.astro` | Astro convenience component |
| `ASTRO_INTEGRATION.md` | Comprehensive integration docs |

## What's Been Implemented
### Phase 1 (Initial Build) — 2026-04-15
- Core 3D scene, basic materials, GSAP timeline, hex grid, particles, 8 orbital nodes, connection system, labels, CSS fallback

### Phase 2 (Bleeding-Edge Upgrade) — 2026-04-15
- Bloom post-processing, custom GLSL shaders, energy runners, energy halo, star field, camera sway, glass-morphism labels, film grain/scan lines, React StrictMode fix, GSAP flat-key fix

### Phase 3 (Standalone Bundle) — 2026-04-15
- Web Component (`<ucim-visualization>`) with Shadow DOM encapsulation
- Auto font loading (Space Grotesk), IntersectionObserver, WebGL detection
- Configurable attributes: `bloom-strength`, `fallback-only`
- Astro component wrapper with typed props
- Comprehensive integration documentation
- /web-component demo route proving standalone operation

## Prioritized Backlog
- P0: All core features implemented and tested (100% pass rate x3 iterations)
- P1: Selective bloom (isolate bloom to connections/particles)
- P2: Environment map for metallic reflections
- P2: Configurable node labels/positions via constructor params or attributes
- P3: Astro View Transitions integration guide
