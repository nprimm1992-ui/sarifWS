// lobby-scene.js — Full-page Three.js 3D lobby environment (source of truth; no parallel .ts fork)
// Hex floor with cyan-gold gradient tiles, floating glass geometry,
// golden dust particles emanating from 3D wing emblem
// Post-processed · scroll-driven camera · mouse parallax

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LUTPass } from 'three/addons/postprocessing/LUTPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { getDocumentScrollProgress } from './document-scroll-progress.js';
import { getHomeScrollVelocity } from './home-smooth-scroll.js';
import { subscribe as tickerSubscribe, unsubscribe as tickerUnsubscribe, PRIORITY_SCENE } from './main-ticker.js';
import {
  markDirty,
  registerContinuousSource,
  shouldRender,
  onRendered,
  resetRenderBudget,
} from './lobby-render-budget.js';
import { resolvePose, resolveSubpose, POSE_LANDING } from './lobby-route-poses.js';
import { subscribeReducedMotion } from './reduced-motion.js';

let renderer, scene, camera, composer;
/** main-ticker subscription token; replaces the per-module requestAnimationFrame self-loop. */
let _sceneTickerToken = null;
/* Previously the lobby subscribed to an "active-scroll" monitor and dimmed
   render quality (DPR cap, post-processing bypass, sheen freeze) while the
   user scrolled. In practice the dip was perceptible as a visible quality
   drop rather than a latency improvement, so the visible dips have been
   removed. The unified main-ticker alone delivers the scheduling wins
   (single rAF, priority ordering, pause-on-hidden); per-frame scene fidelity
   is now constant regardless of scroll state. */
/** Incremented on every cleanup so async GLTF / font callbacks never touch a torn-down scene. */
let _lobbySession = 0;
const _reflectors = [];
/** Screen-space fat-line material for the hex floor grid. Held at module
 *  scope so onResize can keep its `resolution` uniform in sync with the
 *  viewport — LineMaterial renders in pixel units and needs the live size. */
let _hexLineMat = null;
/** Logical thickness of the hex grid lines in CSS pixels. 1.5px is 1.5×
 *  the WebGL default (which is clamped to 1px for gl.LINES on virtually
 *  every platform), matching the user-requested "half thicker" feel. */
const HEX_LINE_WIDTH_PX = 1.5;
const MOBILE_BREAKPOINT = 768;

/** Embedded IDE previews often report devicePixelRatio≈1; production Chrome on
 *  HiDPI / scaled Windows uses 1.25–2+, which multiplies fragment cost across
 *  the main pass, bloom, and reflector. Tier caps keep a full-window lobby
 *  closer to preview smoothness without a visible quality cliff on laptops. */
const LOBBY_TIER_FULL_HD_CSS_PIXELS = 1920 * 1080;
const LOBBY_TIER_QHD_CSS_PIXELS = 2560 * 1440;

/**
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {boolean} mobile
 */
/** Tiered caps shave the "preview DPR 1 vs production DPR 2" gap while staying softer
 *  on sharpness than aggressive 1.2× ceilings — reflector + bloom still step down on
 *  very large CSS viewports where fill rate dominates. */
function resolveLobbyPixelRatio(cssWidth, cssHeight, mobile) {
  const raw = Number(window.devicePixelRatio);
  const dpr = Number.isFinite(raw) && raw > 0 ? raw : 1;
  if (mobile) return Math.min(dpr, 1.5);
  let cap = 1.65;
  const px = cssWidth * cssHeight;
  if (px > LOBBY_TIER_QHD_CSS_PIXELS) cap = Math.min(cap, 1.35);
  else if (px > LOBBY_TIER_FULL_HD_CSS_PIXELS) cap = Math.min(cap, 1.5);
  const dm = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  if (typeof dm === 'number' && dm > 0 && dm <= 4) cap = Math.min(cap, 1.38);
  return Math.min(dpr, cap);
}

/** Square Reflector render target edge length (desktop only).
 *  Round 2026 — caps tightened across all tiers. The Reflector renders
 *  the entire scene a 2nd time per frame into this RTT (the dominant
 *  GPU cost on landing), so even a small reduction is a substantial
 *  win. 768/640/512 still produces a perceptually-clean reflection at
 *  the camera's resting Z; the pixel-level difference vs 1024 is below
 *  the post-LUT noise floor on every desktop class we target. */
function resolveDesktopReflectorResolution(cssWidth, cssHeight) {
  const px = cssWidth * cssHeight;
  if (px > LOBBY_TIER_QHD_CSS_PIXELS) return 512;
  if (px > LOBBY_TIER_FULL_HD_CSS_PIXELS) return 640;
  return 768;
}

/** Internal bloom buffer scale (UnrealBloomPass resolution factor).
 *  Round 2026 — desktop scale lowered from 0.72 → 0.5. Bloom is a
 *  blurred bright-pass; its sample radius already smears any high-
 *  frequency detail across multiple pixels, so the visible difference
 *  between 0.5 and 0.72 is below threshold while the fragment work
 *  drops by ~52% on the 5-mip down/upsample chain. */
function resolveBloomInternalScale(mobile, cssWidth, cssHeight) {
  if (mobile) return 0.4;
  const px = cssWidth * cssHeight;
  if (px > LOBBY_TIER_QHD_CSS_PIXELS) return 0.45;
  if (px > LOBBY_TIER_FULL_HD_CSS_PIXELS) return 0.5;
  return 0.5;
}

/* Max delta clamping is handled centrally by main-ticker (100 ms ceiling to
   survive tab sleep/wake without camera snaps). No local clamp needed. */
/** Floating geometry was tuned at ~30 logical ticks per second; scale per real dt when using full rAF. */
const REFERENCE_LOBBY_TICK_HZ = 30;
/** Exponential smoothing equivalents to former per-frame lerps at 30 FPS (desktop). */
const CAMERA_Y_SMOOTH_ALPHA_REF = 0.06;
const CAMERA_X_SMOOTH_ALPHA_REF = 0.04;
const MOUSE_SMOOTH_ALPHA_REF = 0.05;
/** Tighter follow on mobile (per-frame scroll sampling + finger tracking). ~2× desktop ref alphas. */
const CAMERA_Y_SMOOTH_ALPHA_REF_MOBILE = 0.12;
const CAMERA_X_SMOOTH_ALPHA_REF_MOBILE = 0.08;
const MOUSE_SMOOTH_ALPHA_REF_MOBILE = 0.09;
const SMOOTH_REFERENCE_FPS = 30;
/** Module-level handles for the LUT pass so per-route code (Pillar 3
 *  LUT intensity blend) can update it without re-walking the composer
 *  passes array.
 *
 *  Round 2026 — removed `_filmGrainPass` and `_bootTransitionPass`.
 *  Both effects were measurably expensive (a fullscreen fragment shader
 *  pass each, every rendered frame) for purely decorative output. The
 *  film-grain layer is now a CSS overlay on `#lobby-canvas` (animated
 *  SVG noise via `mix-blend-mode`), and the boot-transition effect is
 *  a CSS `filter: contrast()` fade applied to the same canvas during
 *  the boot window. Both are GPU-cheap (the compositor was already
 *  rasterising those layers; mix-blend-mode of a static SVG and a
 *  filter() on a single composited texture are essentially free) and
 *  cut the per-frame post-processing chain from 6 passes → 3. */
let _lutPass = null;
let _bloomPass = null;

/** One-shot flag: true after the first compositor frame has been committed.
 *  When it fires, sarif:first-frame is dispatched — the veil lifts and
 *  the text cipher decode begins. Reset on cleanup() so re-init (e.g.
 *  WebGL context-loss recovery) produces a fresh veil-lift. */
let _firstFrameDispatched = false;

/** Boot transition — CSS-driven fade of the lobby canvas from a slightly
 *  cooler / contrast-boosted "energising" look into its calm steady
 *  state. Replaces the previous in-shader chromatic-aberration pass.
 *  `_bootTransitionActive` remains as a state flag because the bloom
 *  strength still ramps from "hot" → "calm" via the bloom pass uniform
 *  (cheap — single uniform write per frame) and other subsystems
 *  (materialize, planters) consume the same window. */
let _bootTransitionActive = false;
let _bootTransitionStartMs = 0;
const BOOT_TRANSITION_MS = 1400;
const BOOT_BLOOM_STRENGTH_HOT = 0.55;
const BOOT_BLOOM_STRENGTH_CALM_DESKTOP = 0.26;
const BOOT_BLOOM_STRENGTH_CALM_MOBILE = 0.18;

/** Scene materialization — individual object entrance animations.
 *  Each subsystem (hex grid, floating geo, planters, emblem) fades in
 *  on its own timeline within the boot window. The scene assembles
 *  itself progressively from ground plane up. */
const SCENE_MAT_HEX_DELAY_MS = 0;
const SCENE_MAT_HEX_DURATION_MS = 900;
const SCENE_MAT_FLOAT_DELAY_MS = 150;
const SCENE_MAT_FLOAT_DURATION_MS = 700;
const SCENE_MAT_FLOAT_STAGGER_MS = 35;
const SCENE_MAT_PLANTER_DURATION_MS = 700;
/* Emblem delay removed — the GLB is now preloaded so the emblem is
   available from the first frame. It fades in at the start of the
   scene materialization window alongside the hex floor, arriving
   as part of the first revealed composition rather than 500ms later. */
const SCENE_MAT_EMBLEM_DELAY_MS = 0;
let _sceneMaterializeStartMs = 0;
let _sceneMaterializeActive = false;
/** Persists across the full boot window so deferred planter loads still animate
 *  even after hex/float animations complete and flip _sceneMaterializeActive off. */
let _bootLandingInit = false;
/** Target opacity for the hex grid lines once materialized. */
const HEX_OPACITY_FINAL = 0.40;
/** @type {Array<{mats: Array<{mat: THREE.Material, targetOpacity: number}>, model: THREE.Object3D, startMs: number, targetScale: number}>} */
let _planterEntrances = [];

/** Tracks the GPU resources backing scene.environment so each init path
 *  (synthetic hemisphere envScene first, optional HDR upgrade second) can
 *  dispose its predecessor instead of leaking PMREM render targets. */
let _activeEnvRT = null;
let _activeLutTex = null;

/** Dirty-flag rendering (see lobby-render-budget.js):
 *  - CAMERA_LERP_EPSILON: world-unit tolerance below which the camera's
 *    residual motion is sub-pixel on screen. Set to 0.001 (≈ 0.2 px at
 *    typical depth/FOV); once residuals drop below this the arbitrator
 *    stops forcing renders for camera settle.
 *  - SCROLL_DELTA_EPSILON: normalized scroll-progress change small enough
 *    that the scroll-driven camera Y shift is < 1 px on any viewport. */
const CAMERA_LERP_EPSILON = 0.001;
const SCROLL_DELTA_EPSILON = 0.0005;
/** Tracks the last scrollProgress value observed inside animateStep so a
 *  per-frame delta comparison can raise markDirty('scroll') without
 *  needing a separate DOM scroll listener (which would double up with
 *  getDocumentScrollProgress()'s polled read). */
let _lastScrollForDirty = 0;

const _loadMgr = new THREE.LoadingManager();
const _gltfLoader = new GLTFLoader(_loadMgr);
_gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const _texLoader = new THREE.TextureLoader(_loadMgr);

let _totalLoadBytes = 0;
let _loadedBytes = 0;
_loadMgr.onProgress = (_url, loaded, total) => {
  _totalLoadBytes = total;
  _loadedBytes = loaded;
};

function isLandingPath() {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  return p === '/';
}

function injectPreloadHints() {
  const critical = [];
  if (isLandingPath()) {
    critical.push({
      href: '/wing-emblem-3d-model.glb',
      as: 'fetch',
      type: 'model/gltf-binary',
      rel: 'preload',
    });
  }
  const frag = document.createDocumentFragment();
  for (const { href, as, type, rel } of critical) {
    if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (as) link.as = as;
    link.crossOrigin = 'anonymous';
    if (type) link.type = type;
    frag.appendChild(link);
  }
  document.head.appendChild(frag);
}

/** After hero wing loads, warm cache for planter GLBs without competing with first paint. */
function prefetchPlanterAssets() {
  if (!isLandingPath()) return;
  const configs = isMobile ? PLANTER_CONFIG.slice(0, 1) : PLANTER_CONFIG;
  const frag = document.createDocumentFragment();
  for (const cfg of configs) {
    if (document.querySelector(`link[rel="prefetch"][href="${cfg.path}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = cfg.path;
    link.crossOrigin = 'anonymous';
    frag.appendChild(link);
  }
  if (frag.childNodes.length) document.head.appendChild(frag);
}

let mouseX = 0, targetMouseX = 0;
let scrollProgress = 0;
let isMobile = window.innerWidth < MOBILE_BREAKPOINT;
/* Round 5 — Pose selection uses THIS, not live `isMobile`.
 * Planter GLBs are loaded once at boot per the mobile detection at
 * that instant (PLANTER_CONFIG.slice(0, 1) on mobile). Resizing the
 * window across the breakpoint never re-runs the loader, so the set
 * of planters actually in the scene is frozen once init is done.
 * Pose resolution must agree with the scene's reality: a user who
 * boots on mobile and grows their window still only has the centre
 * planter, so side-planter poses would aim the camera at empty floor.
 *
 * Initialised below inside the planter loader where the decision is
 * actually made; a simple mirror of live `isMobile` at boot is a
 * safe default for the window between module load and loader run
 * (during which no route pose can be resolved because the scene is
 * not yet mounted). */
let _useMobilePoses = window.innerWidth < MOBILE_BREAKPOINT;

const LOBBY_BG = 0x1a2e3c;
const CYAN = 0x00d4ff;
const GOLD = 0xc9a227;
/** Clear color, scene.background, and FogExp2 must stay aligned (same hex as LOBBY_BG). */
const FOG_COLOR = LOBBY_BG;

/** Diffuse / IBL fill only (hemisphere + PMREM probe). Do not scale fog/background/vignette here — those are separate art-direction knobs. */
const AMBIENT_LIGHT_INTENSITY_SCALE = 1.5625;

const floatingObjects = [];

const CAM_START_Y = 0.6;
const CAM_END_Y = -2.5;
const CAM_Z = 7;

// ---------------------------------------------------------------------------
// Pillar 3 — Route-aware camera pose controller
// ---------------------------------------------------------------------------
/** Duration in ms of the pose→pose tween on route change. 900 ms is
 *  long enough to register as a purposeful camera move (vs a cut) but
 *  short enough that the next page's content feels immediately
 *  available. Matches Active Theory / Locomotive-class camera beats. */
const ROUTE_TWEEN_MS = 900;
/** FoV settle tolerance in degrees. 0.05° is well below any perceptible
 *  zoom step at typical viewport sizes. */
const POSE_FOV_SETTLE_EPSILON = 0.05;
/** LUT-intensity blend tolerance (unitless 0–1). */
const POSE_LUT_SETTLE_EPSILON = 0.002;

/** Mouse-X parallax overlay gain (world units per normalised pointer X).
 *  Zeroed when prefers-reduced-transparency is set so the camera sticks
 *  to the pose's base X; positional tweens still run so routes still
 *  feel distinct, only the secondary depth cue is disabled. */
const MOUSE_PARALLAX_GAIN = 0.4;

/** Pillar 5b — sub-pose tween duration. Route transitions are
 *  ROUTE_TWEEN_MS (900ms); sub-beats inside a route must be perceptibly
 *  faster or they feel sluggish. 450ms is the cinematic "half-beat"
 *  that reads as a dolly-adjust rather than a route change. */
const SUBPOSE_TWEEN_MS = 450;

/* Round-3 P8a — Camera pose memory
 * ---------------------------------------------------------------------------
 * Pose continuity across document loads within a single tab.
 *
 * Why: direct navigation to an interior route currently snaps into that
 * route's anchor pose on cold boot. That works, but when a user traverses
 * /praxis → /praxis/<article> via a full document load (MPA fallback,
 * search result, hard refresh), the camera jump reads as a cut even
 * though both routes belong to the same cinematic space.
 *
 * How: on `astro:before-swap` and `visibilitychange=hidden` we snapshot
 * the current pose (including mid-tween interp) to sessionStorage. On
 * the next `initScene()` within the same tab (which is a cold boot for
 * that document), we seed `_poseBase` to the snapshot, then immediately
 * start a tween to the URL's anchor pose. The user sees the camera
 * begin where it last was and settle into the new route — one
 * continuous motion across the document boundary.
 *
 * Cap at POSE_MEMORY_MAX_AGE_MS so stale memory (e.g. user left the tab
 * open overnight, came back to a cold load) doesn't drag the first
 * frame to an irrelevant pose. sessionStorage already scopes memory to
 * the tab's lifetime; the age cap is a second seatbelt.
 *
 * Reduced-motion: the snapshot is still written (informational; cheap)
 * but `startPoseTween` snaps instead of animating, so the user sees no
 * cross-document animation either way — behaviourally identical to
 * today for motion-sensitive users.
 */
const POSE_MEMORY_KEY = 'sarif:lobby-pose';
const POSE_MEMORY_MAX_AGE_MS = 300_000;

/* Round-4 audit §3.2 — pose memory hardening.
 *
 * Before this, readPoseMemory() trusted the snapshot's `ts` field even
 * when it was from the future (system clock skew, device sleep wake-up
 * before NTP resync, testing clocks). A future `ts` never exceeds the
 * 5-minute age cap in that direction — `Date.now() - ts` goes negative —
 * so the snapshot was accepted indefinitely.
 *
 * We also stamp a build identifier into the snapshot. When the pose
 * shape or pose IDs change between deploys, a snapshot produced by a
 * previous deploy would otherwise be interpreted as a pose in the new
 * deploy (possibly mapping to a different id, or to a removed pose).
 * Invalidating on mismatch is the safest way to guarantee a pose change
 * is never load-bearing on stale persisted state.
 *
 * BUILD_ID is injected at build time by Astro via import.meta.env or
 * defaults to the string 'dev' for local dev servers. If the snapshot
 * was written under a different build, we drop it.
 *
 * Clock skew tolerance: we allow snapshots up to POSE_MEMORY_SKEW_GRACE_MS
 * in the future to survive normal NTP drift; anything beyond is treated
 * as corrupt and dropped.
 */
const POSE_MEMORY_SKEW_GRACE_MS = 30_000;
 
const POSE_MEMORY_BUILD_ID = (() => {
  try {
     
    const fromEnv = import.meta?.env?.BUILD_ID;
    if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  } catch {
    /* Defensive: some bundler configurations throw on `import.meta.env`
       access outside Vite. Fall through to the 'dev' sentinel so the
       pose memory still functions locally without a build stamp. */
  }
  return 'dev';
})();

/* Round-3 P8c — Idle camera breathing.
 * ---------------------------------------------------------------------------
 * After a user goes motionless for IDLE_BREATH_ONSET_MS, add a slow
 * ±IDLE_BREATH_AMP_Y Y-axis sine at IDLE_BREATH_PERIOD_S. The visual
 * effect is "the lobby is alive even when the camera is parked": the
 * room subtly inhales/exhales. Matches modern WebGL sites (GSAP
 * showreel, Rauno, Active Theory) where idle periods are never dead.
 *
 * Sourcing: uses the existing 24 fps floor from the dirty-flag
 * arbitrator — no new continuous dirty source. The envelope itself
 * (attack / release) is measured in seconds, so on floor frames it
 * still advances enough to produce the perceptible bob.
 *
 * Interruption budget: < 120 ms release on any input event so the
 * next user action (mouse move, scroll, key) does not fight the idle
 * bob. Attack is slower (~1 s) so onset feels like the room "settling"
 * rather than kicking in.
 *
 * Reduced-motion: amplitude is zeroed at the envelope level. The
 * envelope itself still runs so input tracking stays consistent, but
 * the camera offset it multiplies is always 0.
 */
const IDLE_BREATH_ONSET_MS = 6_000;
const IDLE_BREATH_AMP_Y = 0.003;
const IDLE_BREATH_PERIOD_S = 9;
const IDLE_BREATH_ATTACK_TAU_MS = 900;
const IDLE_BREATH_RELEASE_TAU_MS = 90;
let _lastInputTs = 0;
let _idleBreathEnvelope = 0;

/* Round-3 P8d — Scroll-velocity cinematography.
 * ---------------------------------------------------------------------------
 * Couple Lenis's per-frame scroll velocity on the landing route into
 * two tiny camera modulations: FOV and LUT intensity. Effect: a strong
 * scroll flick widens the lens fractionally + warms the grade for a
 * beat, then relaxes as the scroll decays. Subtle — the numbers below
 * are deliberately small so the user perceives the coupling as
 * "responsive air" rather than a visible wobble.
 *
 * Scope: landing only. Interior routes have Lenis disabled, so
 * getHomeScrollVelocity() returns 0 there (we still do the 200 ms
 * smoothing pass because lobbies inherit state across routes via the
 * persistent canvas — letting the filter re-equilibrate on re-entry).
 *
 * Normalisation: Lenis velocity is pixels-per-frame at 60 Hz. A
 * confident wheel flick is ~3-4. Divide by SCROLL_VELOCITY_REF to land
 * inside ±1 before applying the FOV_GAIN and LUT_GAIN coefficients.
 *
 * Reduced-motion / reduced-transparency: gains zeroed at compute time;
 * the filter still ticks (negligible cost) so no state-bleed when the
 * user flips the preference mid-session.
 */
const SCROLL_VELOCITY_REF = 4.0;
const SCROLL_VELOCITY_FOV_GAIN = 0.5;
const SCROLL_VELOCITY_LUT_GAIN = 0.03;
const SCROLL_VELOCITY_TAU_MS = 200;
let _scrollVelocityFiltered = 0;

function markUserInput(now) {
  _lastInputTs = typeof now === 'number' ? now : performance.now();
}

function readPoseMemory() {
  try {
    const raw = sessionStorage.getItem(POSE_MEMORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const ts = typeof parsed.ts === 'number' ? parsed.ts : 0;
    if (!ts) return null;
    const now = Date.now();
    const age = now - ts;
    /* Upper bound: don't resume into a stale pose more than 5 min old.
       Lower bound: tolerate minor future drift (NTP resync after sleep
       wake, slight inter-tab clock variance) but reject snapshots from
       meaningfully-in-the-future timestamps (corruption / tampering). */
    if (age > POSE_MEMORY_MAX_AGE_MS) return null;
    if (age < -POSE_MEMORY_SKEW_GRACE_MS) return null;
    /* Build-id guard: a snapshot produced by a different deploy may
       refer to a pose id that no longer exists in this build, or a
       pose whose numeric shape changed. Drop it rather than risk
       seeding `_poseBase` with a semantically-different value. */
    if (typeof parsed.build === 'string' && parsed.build !== POSE_MEMORY_BUILD_ID) {
      return null;
    }
    const nums = ['x', 'y', 'z', 'fov', 'lutMix'];
    for (const k of nums) {
      if (typeof parsed[k] !== 'number' || !Number.isFinite(parsed[k])) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePoseMemory() {
  try {
    const snapshot = {
      x: _poseBase.x,
      y: _poseBase.y,
      z: _poseBase.z,
      tx: _poseBase.tx,
      ty: _poseBase.ty,
      tz: _poseBase.tz,
      fov: _poseBase.fov,
      lutMix: _poseBase.lutMix,
      scrollDolly: _poseBase.scrollDolly,
      id: _poseBase.id,
      parallaxGain: _poseBase.parallaxGain,
      ts: Date.now(),
      build: POSE_MEMORY_BUILD_ID,
    };
    sessionStorage.setItem(POSE_MEMORY_KEY, JSON.stringify(snapshot));
  } catch {
    /* sessionStorage can throw under privacy modes / quota — pose memory
       is a nice-to-have, not a correctness requirement. Swallow. */
  }
}

/** Build a RoutePose-shaped object from a persisted snapshot so
 *  `snapPoseBaseTo` can seed `_poseBase` with it verbatim.
 *  parallaxGain defaults to 1.0 when absent so snapshots written by
 *  prior builds (without the field) still rehydrate cleanly under
 *  the same BUILD_ID window; the mismatched-build guard in
 *  `readPoseMemory` would normally discard them, but keeping this
 *  defensive saves us on a dev-server where BUILD_ID is static. */
function poseFromMemory(mem) {
  const hasTarget = (
    typeof mem.tx === 'number' && typeof mem.ty === 'number' && typeof mem.tz === 'number'
  );
  return {
    id: typeof mem.id === 'string' ? mem.id : 'memory',
    pos: [mem.x, mem.y, mem.z],
    target: hasTarget ? [mem.tx, mem.ty, mem.tz] : null,
    fov: mem.fov,
    lutMix: mem.lutMix,
    scrollDolly: typeof mem.scrollDolly === 'boolean' ? mem.scrollDolly : true,
    parallaxGain:
      typeof mem.parallaxGain === 'number' && Number.isFinite(mem.parallaxGain)
        ? mem.parallaxGain
        : 1.0,
  };
}

/** Pillar 5a — IntersectionObserver tuning.
 *
 *  Activation band is a viewport inset by 20% top and 20% bottom — i.e.
 *  the middle 60% of the viewport. A section is "active" whenever ANY
 *  part of its bounding box overlaps that band, and leaves active state
 *  when it is completely outside it.
 *
 *  Threshold is 0 (not a non-zero fraction like 0.5) because the max
 *  achievable intersectionRatio equals min(1, bandHeight / sectionHeight).
 *  For sections taller than the band (about.astro methodology at
 *  data-cv-size="xl" renders ≥ 2000px, band is ≈ 480px on an 800px
 *  viewport), that ratio caps around 0.24 and a 0.5 threshold would
 *  never fire. Using threshold 0 + rootMargin lets the rootMargin alone
 *  define the activation boundary, which works for both short and tall
 *  sections. The stack in applyActiveSectionPose() handles hysteresis
 *  (once a section is active, the sub-pose stays applied until the
 *  section fully leaves the band).
 */
const SECTION_OBSERVER_THRESHOLD = 0;
const SECTION_OBSERVER_ROOT_MARGIN = '-20% 0px -20% 0px';

/** @type {{x:number,y:number,z:number,tx:number|null,ty:number|null,tz:number|null,fov:number,lutMix:number,scrollDolly:boolean,id:string,parallaxGain:number}} */
const _poseBase = {
  x: 0, y: CAM_START_Y, z: CAM_Z,
  tx: null, ty: null, tz: null,
  fov: 52,
  lutMix: 1.0,
  scrollDolly: true,
  id: 'landing',
  /* Round 5 — mouse-X parallax scaler. 1.0 preserves the original
     feel; interior close-ups (Z<3) damp this to ~0.3 so pointer
     jitter at close range doesn't read as seasick. Cross-fades
     alongside position during a route tween. */
  parallaxGain: 1.0,
};

/** Tween state. While `active`, every frame advances `t` and writes
 *  eased values into `_poseBase`. On reversal mid-tween we re-capture
 *  `from*` from the current `_poseBase` snapshot so the new tween
 *  starts from where the user is actually seeing — never a snap-back. */
const _poseTween = {
  active: false,
  startMs: 0,
  duration: 0,
  fromX: 0, fromY: 0, fromZ: 0,
  fromTx: 0, fromTy: 0, fromTz: 0,
  fromFov: 52,
  fromLutMix: 1.0,
  /* Round 5 — captured parallaxGain at tween start so the overlay
     strength blends smoothly alongside position/FoV. Without this,
     leaving a damped pose (e.g. /about at 0.35) for a wider pose
     (e.g. /lexicon at 0.50) would step the parallax multiplier at
     tween-settle instead of interpolating. */
  fromParallaxGain: 1.0,
  toPose: /** @type {import('./lobby-route-poses.js').RoutePose} */ (POSE_LANDING),
};

/** Cubic ease-in-out, matches the feel of existing emblem tween. */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a, b, t) { return a + (b - a) * t; }

/** Snap `_poseBase` to a pose without a tween. Used on cold boot (no
 *  reverse animation makes sense before the first frame) and on the
 *  reduced-motion path. */
function snapPoseBaseTo(pose) {
  _poseBase.x = pose.pos[0];
  _poseBase.y = pose.pos[1];
  _poseBase.z = pose.pos[2];
  if (pose.target) {
    _poseBase.tx = pose.target[0];
    _poseBase.ty = pose.target[1];
    _poseBase.tz = pose.target[2];
  } else {
    _poseBase.tx = _poseBase.ty = _poseBase.tz = null;
  }
  _poseBase.fov = pose.fov;
  _poseBase.lutMix = pose.lutMix;
  _poseBase.scrollDolly = pose.scrollDolly;
  _poseBase.id = pose.id;
  /* Defensive coerce: parallaxGain is optional on the pose schema;
     fall back to 1.0 (original feel) when omitted. A NaN or negative
     value here would flip the sign of pointer parallax — clamp to a
     sane [0, 1.25] so authoring errors degrade gracefully. */
  _poseBase.parallaxGain = clampParallaxGain(pose.parallaxGain);
  _poseTween.active = false;
}

/** Clamp a pose's parallaxGain to a safe range. Unset → 1.0 (original
 *  feel); NaN / non-number → 1.0; sign flipped or > 1.25 → clamped. */
function clampParallaxGain(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1.0;
  if (value < 0) return 0;
  if (value > 1.25) return 1.25;
  return value;
}

/** Begin (or re-retarget) a tween toward `pose`. Captures current
 *  `_poseBase` into the `from*` slots so a reversal-mid-tween reads as
 *  a smooth C-curve rather than a snap.
 *  @param {import('./lobby-route-poses.js').RoutePose} pose
 *  @param {number} durationMs
 */
function startPoseTween(pose, durationMs) {
  if (!pose) return;
  if (durationMs <= 0 || _prefersReducedMotionLocked) {
    /* Reduced-motion: no animation. Applies LUT / fov / position
       instantly so the rest of the scene doesn't desync. */
    snapPoseBaseTo(pose);
    markDirty('route-snap');
    return;
  }
  /* Capture `from*` from the LIVE visible framing, not from
     `_poseBase`. Three distinct cases make this mandatory:
       1. Leaving landing while scrolled: `_poseBase.y` is the static
          landing pose Y (0.6), but the camera is actually wherever
          scrollProgress has it (e.g. -0.95). Using `_poseBase.y` would
          snap the camera up before easing down — a visible hitch.
       2. Reversal mid-tween: the previous target hasn't settled yet.
          `_poseBase` already holds the *interpolated* value, but the
          per-frame camera smoothing may be trailing by a few units.
          Using camera.position preserves visible continuity.
       3. On mouse-X parallax: camera.position.x carries the parallax
          overlay (base + mouseX*0.4). We strip it so the tween
          anchors to the underlying pose-base X; parallax is
          re-layered each frame by updateCamera, so the visible X
          stays where the user's cursor dictates.
     Z has no overlay — reading camera.position.z directly is correct.

     Round 5: MOUSE_PARALLAX_GAIN is now scaled per-pose via
     `_poseBase.parallaxGain`. When stripping the overlay from
     camera.position.x we must use the CURRENT effective multiplier
     (base gain × live pose gain × reduced-transparency toggle) —
     hard-coding 0.4 would leave a residual pointer-offset baked into
     the tween start, producing a visible X-jitter on route change. */
  const liveParallax = computeEffectiveParallax();
  if (camera) {
    _poseTween.fromX = camera.position.x - mouseX * liveParallax;
    _poseTween.fromY = camera.position.y;
    _poseTween.fromZ = camera.position.z;
  } else {
    _poseTween.fromX = _poseBase.x;
    _poseTween.fromY = _poseBase.y;
    _poseTween.fromZ = _poseBase.z;
  }
  if (_poseBase.tx !== null && _poseBase.ty !== null && _poseBase.tz !== null) {
    _poseTween.fromTx = _poseBase.tx;
    _poseTween.fromTy = _poseBase.ty;
    _poseTween.fromTz = _poseBase.tz;
  } else {
    /* Coming from legacy auto-target. Freeze the auto-target into
       explicit coordinates at the moment of capture so the tween can
       blend it with the new explicit target continuously. Using the
       live camera (minus parallax on X) matches the on-screen framing
       exactly. */
    const lookX = camera ? camera.position.x - mouseX * liveParallax : 0;
    const lookY = (camera ? camera.position.y : _poseBase.y) - 0.5;
    _poseTween.fromTx = lookX;
    _poseTween.fromTy = lookY;
    _poseTween.fromTz = 0;
  }
  _poseTween.fromFov = _poseBase.fov;
  _poseTween.fromLutMix = _poseBase.lutMix;
  _poseTween.fromParallaxGain = _poseBase.parallaxGain;
  _poseTween.toPose = pose;
  _poseTween.startMs = performance.now();
  _poseTween.duration = durationMs;
  _poseTween.active = true;
  markDirty('route');
}

/** Current effective mouse-parallax offset in world units per
 *  normalised pointer X. Factors in the base scene gain, the active
 *  pose's per-pose scaler, and the reduced-transparency zero. Shared
 *  between the tween-start capture path (`startPoseTween`) and the
 *  per-frame camera update (`updateCamera`) so both always agree on
 *  "what is the overlay right now". Divergence would show as an
 *  X-jump at tween start when the pose's parallaxGain is below 1.0. */
function computeEffectiveParallax() {
  if (_reducedTransparency) return 0;
  return MOUSE_PARALLAX_GAIN * _poseBase.parallaxGain;
}

/** Advance the pose tween and write the current interpolated values
 *  into `_poseBase`. Idempotent / safe when inactive. */
function updatePoseTween(timestampMs) {
  if (!_poseTween.active) return;
  const to = _poseTween.toPose;
  const elapsed = timestampMs - _poseTween.startMs;
  const raw = elapsed / _poseTween.duration;
  const done = raw >= 1;
  const t = done ? 1 : easeInOutCubic(raw);

  _poseBase.x = lerp(_poseTween.fromX, to.pos[0], t);
  _poseBase.y = lerp(_poseTween.fromY, to.pos[1], t);
  _poseBase.z = lerp(_poseTween.fromZ, to.pos[2], t);

  if (to.target) {
    _poseBase.tx = lerp(_poseTween.fromTx, to.target[0], t);
    _poseBase.ty = lerp(_poseTween.fromTy, to.target[1], t);
    _poseBase.tz = lerp(_poseTween.fromTz, to.target[2], t);
  } else {
    /* Destination uses legacy auto-target. Blend the captured `from`
       target toward the live auto-target during the tween; once
       settled, drop back to null so updateCamera resumes its cheap
       auto path without the null-check cost.
       Note: the legacy auto-target is (0, camera.y - 0.5, 0) — NOT
       (camera.x, camera.y - 0.5, 0). Using camera.position.x here
       would make the auto-target jitter with mouse parallax during
       the tween, then snap to x=0 at settle. Matching x=0 here keeps
       the tween's last frame flush with the post-settle behaviour. */
    const autoX = 0;
    const autoY = (camera ? camera.position.y : _poseBase.y) - 0.5;
    const autoZ = 0;
    _poseBase.tx = lerp(_poseTween.fromTx, autoX, t);
    _poseBase.ty = lerp(_poseTween.fromTy, autoY, t);
    _poseBase.tz = lerp(_poseTween.fromTz, autoZ, t);
  }

  /* Pillar 4f: reduced-transparency snaps FOV to the destination so
     the lens change (which reads as a strong depth cue) never animates.
     Positional lerp still runs — routes still feel distinct. */
  _poseBase.fov = _reducedTransparency ? to.fov : lerp(_poseTween.fromFov, to.fov, t);
  _poseBase.lutMix = lerp(_poseTween.fromLutMix, to.lutMix, t);
  /* Round 5 — lerp the parallaxGain alongside position so the mouse-X
     overlay magnitude cross-fades smoothly with the camera's distance
     to subject. Clamped on settle so a pose whose optional gain field
     is missing reads as the 1.0 default, never the previous pose's
     residual value. */
  const toGain = clampParallaxGain(to.parallaxGain);
  _poseBase.parallaxGain = lerp(_poseTween.fromParallaxGain, toGain, t);

  if (done) {
    if (!to.target) {
      /* Drop the explicit auto-target we synthesised during the blend. */
      _poseBase.tx = _poseBase.ty = _poseBase.tz = null;
    }
    _poseBase.scrollDolly = to.scrollDolly;
    _poseBase.id = to.id;
    _poseBase.parallaxGain = toGain;
    _poseTween.active = false;
  } else {
    /* During the tween we hold the *destination's* scrollDolly flag
       off until we've arrived — otherwise scrolling mid-tween would
       fight the animation on the Y axis. Landing→interior starts with
       dolly disabled; interior→landing re-enables only at settle. */
    _poseBase.scrollDolly = false;
  }
}

/** Continuous-dirty predicate used by the render arbitrator.
 *
 *  Returns true *only* while the easing pose tween is actively
 *  running; the LUT intensity, FOV, and lens-dolly aren't tracked
 *  here because they're slaved to `_poseTween.active` (they are
 *  driven from the same easing `t`, so once the tween settles, they
 *  settle in the same frame).
 *
 *  The register-call in the pose arbitrator keeps the renderer
 *  pumping through the full tween even when mouse / scroll deltas
 *  are zero — a pure camera-only route transition still needs
 *  per-frame pixels. */
function poseTweenDirty() {
  return Boolean(_poseTween.active);
}

// ---------------------------------------------------------------------------
// Atmosphere — cyan/celadon tech-blue environment with radial edge darkening
// ---------------------------------------------------------------------------
/* Round 2026 — three shader passes were removed from the composer chain
 * here (WarmVignetteShader, FilmGrainShader, BootTransitionShader). Each
 * was a fullscreen fragment-shader pass; together they accounted for an
 * estimated 25–35% of the post-processing GPU cost on desktop without
 * carrying the brand. Their visual effect is now produced by CSS
 * compositor-only layers attached to `#lobby-canvas`:
 *   - vignette  → radial-gradient overlay (`.lobby-vignette`)
 *   - grain     → animated SVG noise overlay (`.lobby-grain`)
 *   - boot fade → `filter: contrast()` transition on the canvas itself,
 *                 driven by the `data-lobby-boot` attribute on <html>
 * The DOM hook + animations live in src/styles/global.css; the JS toggles
 * the boot attribute around the boot window so the same 1.4 s
 * "energising" feel is preserved. Bloom strength still ramps via the
 * UnrealBloomPass uniform during the same window — that's a single
 * uniform write per frame, near-free. */

/* Film-grain ShaderPass and BootTransitionShader removed in the Round
 *  2026 perf pass — see the comment block above. The film-grain SVG
 *  noise overlay (`.lobby-grain` in global.css) carries the visual
 *  weight at zero per-frame fragment cost; the boot transition is now
 *  a CSS contrast() filter on the canvas itself, ramped via the
 *  `data-lobby-boot` attribute on <html> (toggled below in initScene).
 *  These two passes alone contributed roughly 12 Mpx of fragment work
 *  per rendered frame at 1440p HiDPI — eliminated entirely. */

/** Default LUT blend intensity on the landing route. Per-route blends
 *  (Pillar 3) override this via lutPass.intensity. */
const LUT_INTENSITY_DEFAULT = 0.85;

/** HDR IBL URLs. Desktop and mobile are pre-downsized by
 *  scripts/downsize-hdr.mjs (256×128 / 128×64). Both are optional — the
 *  synthetic hemisphere envScene below ships as the default and remains
 *  the load-failure fallback, so no error path ever produces a dark
 *  scene. */
const HDR_ENV_URL_DESKTOP = '/env/lobby-studio.hdr';
const HDR_ENV_URL_MOBILE  = '/env/lobby-studio-mobile.hdr';

/** Colour LUT URLs. Primary is the default grade; high-contrast is
 *  swapped in for prefers-contrast: more users. Authored by
 *  scripts/generate-lut.mjs (32³ LUT2D horizontal strip, 1024×32,
 *  WebP lossless). Pillar 4a: WebP lossless keeps both variants under
 *  the ≤60 KB asset budget while remaining pixel-identical to the raw
 *  grade output, so the sampled LUT is bit-exact on the GPU. */
const LUT_URL_PRIMARY       = '/luts/sarif-primary.webp';
const LUT_URL_HIGH_CONTRAST = '/luts/sarif-high-contrast.webp';

// ---------------------------------------------------------------------------
// Hex-grid constants
// ---------------------------------------------------------------------------
const HEX_R  = 0.8;
// Kept for grid math symmetry; currently unused at runtime.
const _HEX_H = HEX_R * Math.sqrt(3);
void _HEX_H;
/* Round 2026 — grid extents halved (was 100×80 = 8000 hexes / 96k
 * triangles via LineSegments2). FogExp2(density=0.038) drops the line
 * material's contribution to ~e^(-(40*0.038)^2) ≈ 10% visibility at
 * 40 units and ~3% at 50 units, so anything beyond the new 60×50
 * footprint was already invisible at the camera's resting Z=7. The
 * smaller grid drops geometry processing by 62.5% while changing the
 * rendered pixels by a delta well below the LineMaterial's per-fragment
 * AA threshold. */
const HEX_COLS = 60;
const HEX_ROWS = 50;

// ---------------------------------------------------------------------------
// Deterministic PRNG (Mulberry32)
// ---------------------------------------------------------------------------
function createRng(seed) {
  let s = seed | 0;
  return function rand() {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Hex Floor Grid — single layer, cyan-to-gold gradient per-vertex color
// ---------------------------------------------------------------------------
function buildHexLinesColored(hexRadius, cols, rows) {
  const verts = [];
  const vertColors = [];
  const hexHeight = hexRadius * Math.sqrt(3);
  const totalW = cols * hexRadius * 1.5;
  const totalH = rows * hexHeight;

  const cyanC = new THREE.Color(CYAN);
  const goldC = new THREE.Color(GOLD);
  const tempC = new THREE.Color();
  const maxDist = Math.sqrt((totalW / 2) ** 2 + (totalH / 2) ** 2);
  const invFade = 1 / (maxDist * 0.6);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * hexRadius * 1.5 - totalW / 2;
      const z = row * hexHeight - totalH / 2 + (col % 2 === 1 ? hexHeight / 2 : 0);

      const t = Math.min(Math.sqrt(x * x + z * z) * invFade, 1.0);
      tempC.copy(cyanC).lerp(goldC, t);

      for (let i = 0; i < 6; i++) {
        const a1 = (Math.PI / 3) * i;
        const a2 = (Math.PI / 3) * ((i + 1) % 6);
        verts.push(
          x + hexRadius * Math.cos(a1), 0, z + hexRadius * Math.sin(a1),
          x + hexRadius * Math.cos(a2), 0, z + hexRadius * Math.sin(a2),
        );
        vertColors.push(tempC.r, tempC.g, tempC.b, tempC.r, tempC.g, tempC.b);
      }
    }
  }
  return { verts, vertColors };
}

function createHexGridFloor() {
  const group = new THREE.Group();

  const FLOOR_SIZE = 300;

  if (isMobile) {
    const mobileReflectorGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
    const mobileReflector = new Reflector(mobileReflectorGeo, {
      textureWidth: 512,
      textureHeight: 512,
      color: 0xc8b898,
      clipBias: 0.003,
    });
    mobileReflector.rotation.x = -Math.PI / 2;
    mobileReflector.position.y = -3;
    _reflectors.push(mobileReflector);
    group.add(mobileReflector);

    const mobileBlendMat = new THREE.ShaderMaterial({
      uniforms: {
        uTintColor:   { value: new THREE.Color(0xe8dcc8) },
        uTintOpacity: { value: 0.32 },
        uBgColor:     { value: new THREE.Color(LOBBY_BG) },
        uFadeStart:   { value: 8.0 },
        uFadeEnd:     { value: 40.0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vWorldXZ;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldXZ = worldPos.xz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTintColor;
        uniform float uTintOpacity;
        uniform vec3 uBgColor;
        uniform float uFadeStart;
        uniform float uFadeEnd;
        varying vec2 vWorldXZ;
        void main() {
          float dist = length(vWorldXZ);
          float edge = smoothstep(uFadeStart, uFadeEnd, dist);
          vec3 color = mix(uTintColor, uBgColor, edge);
          float alpha = mix(uTintOpacity, 1.0, edge);
          gl_FragColor = vec4(color, alpha);
        }`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const mobileBlend = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), mobileBlendMat);
    mobileBlend.rotation.x = -Math.PI / 2;
    mobileBlend.position.y = -2.99;
    group.add(mobileBlend);
  } else {
    const reflectorGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
    const refl = resolveDesktopReflectorResolution(window.innerWidth, window.innerHeight);
    const reflector = new Reflector(reflectorGeo, {
      textureWidth: refl,
      textureHeight: refl,
      color: 0xc8b898,
      clipBias: 0.003,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -3;
    _reflectors.push(reflector);
    group.add(reflector);

    const blendMat = new THREE.ShaderMaterial({
      uniforms: {
        uTintColor:   { value: new THREE.Color(0xe8dcc8) },
        uTintOpacity: { value: 0.28 },
        uBgColor:     { value: new THREE.Color(LOBBY_BG) },
        uFadeStart:   { value: 10.0 },
        uFadeEnd:     { value: 45.0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vWorldXZ;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldXZ = worldPos.xz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTintColor;
        uniform float uTintOpacity;
        uniform vec3 uBgColor;
        uniform float uFadeStart;
        uniform float uFadeEnd;
        varying vec2 vWorldXZ;
        void main() {
          float dist = length(vWorldXZ);
          float edge = smoothstep(uFadeStart, uFadeEnd, dist);
          vec3 color = mix(uTintColor, uBgColor, edge);
          float alpha = mix(uTintOpacity, 1.0, edge);
          gl_FragColor = vec4(color, alpha);
        }`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const blendPlane = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), blendMat);
    blendPlane.rotation.x = -Math.PI / 2;
    blendPlane.position.y = -2.99;
    group.add(blendPlane);
  }

  const { verts, vertColors } = buildHexLinesColored(HEX_R, HEX_COLS, HEX_ROWS);

  /* LineSegments2 + LineMaterial render lines as instanced triangle strips
     at a real pixel linewidth. Plain THREE.LineSegments (gl.LINES) is
     clamped to 1px on every modern browser regardless of material
     linewidth, so we use the fat-lines pipeline to honour the requested
     thickness. Geometry input format is identical to the old flat
     position/color arrays — LineSegmentsGeometry.setPositions/setColors
     takes the same paired-endpoint layout buildHexLinesColored produces. */
  const hexGeo = new LineSegmentsGeometry();
  hexGeo.setPositions(verts);
  hexGeo.setColors(vertColors);

  const hexStartOpacity = (_isLanding && !_prefersReducedMotionLocked) ? 0 : HEX_OPACITY_FINAL;
  _hexLineMat = new LineMaterial({
    vertexColors: true,
    transparent: true,
    opacity: hexStartOpacity,
    linewidth: HEX_LINE_WIDTH_PX,
    worldUnits: false,
    depthWrite: false,
    /* Participate in scene fog (FogExp2 @ LOBBY_BG) so far-field lines fade
       into the background. The original ShaderMaterial did a hand-rolled
       smoothstep(8,50) alpha fade; LineMaterial's built-in fog on
       FogExp2(density=0.038) reaches ~e^(-(50*0.038)^2) ≈ 2.7% visibility
       at 50 units, i.e. effectively the same vanish distance without the
       per-fragment branch. */
    fog: true,
  });
  _hexLineMat.resolution.set(window.innerWidth, window.innerHeight);

  const hexMesh = new LineSegments2(hexGeo, _hexLineMat);
  hexMesh.position.y = -2.99;
  /* LineSegments2 computes its bounds from the instance buffer; call once
     so frustum culling uses real bounds instead of the default zero box
     (which would flicker the grid at wide FOV / edge-of-screen). */
  hexMesh.computeLineDistances();
  /* Move the hex grid off layer 0 so the floor Reflector's virtual camera
     (which renders layer 0 only) doesn't double-paint the grid as a
     reflection beneath itself. The main camera has layer 1 enabled in
     initScene, so the user still sees the grid at full strength. */
  hexMesh.layers.set(1);
  group.add(hexMesh);

  return group;
}

// ---------------------------------------------------------------------------
// Floating Wireframe Geometry — expanded collection
// ---------------------------------------------------------------------------
function createWireframeObject(geometry, color, scale, position) {
  const grp = new THREE.Group();
  grp.position.copy(position);

  const shellTargetOpacity = 0.3;
  const lineTargetOpacity = color === CYAN ? 0.55 : 0.5;
  const shouldAnimate = _isLanding && !_prefersReducedMotionLocked;

  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 0.88, thickness: 0.2,
    roughness: 0.08, clearcoat: 0.8, clearcoatRoughness: 0.05,
    ior: 1.45, transparent: true, opacity: shouldAnimate ? 0 : shellTargetOpacity, depthWrite: false,
  });
  const shell = new THREE.Mesh(geometry, shellMat);
  shell.scale.setScalar(scale);
  grp.add(shell);

  const edges = new THREE.EdgesGeometry(geometry);
  const lineMat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: shouldAnimate ? 0 : lineTargetOpacity,
  });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wireframe.scale.setScalar(scale);
  grp.add(wireframe);

  const _r = createRng(Math.abs(position.x * 1000 + position.y * 100 + position.z * 10) | 0);
  grp.userData = {
    rotSpeed: new THREE.Vector3(
      (_r() - 0.5) * 0.004,
      (_r() - 0.5) * 0.005,
      (_r() - 0.5) * 0.003,
    ),
    bobPhase: _r() * Math.PI * 2,
    bobSpeed: 0.002 + _r() * 0.002,
    bobAmp: 0.10 + _r() * 0.14,
    baseY: position.y,
    _matTargets: [
      { mat: shellMat, targetOpacity: shellTargetOpacity },
      { mat: lineMat, targetOpacity: lineTargetOpacity },
    ],
  };
  return grp;
}

function createSolidPyramid(position, scale = 0.8) {
  const grp = new THREE.Group();
  grp.position.copy(position);

  const geo = new THREE.ConeGeometry(0.3, 0.5, 4);
  const shouldAnimate = _isLanding && !_prefersReducedMotionLocked;

  const coreMat = new THREE.MeshStandardMaterial({
    color: GOLD, emissive: GOLD, emissiveIntensity: 0.8,
    metalness: 0.92, roughness: 0.1,
    transparent: shouldAnimate, opacity: shouldAnimate ? 0 : 1,
  });
  const core = new THREE.Mesh(geo, coreMat);
  core.scale.setScalar(scale);
  core.renderOrder = 0;
  grp.add(core);

  const edges = new THREE.EdgesGeometry(geo);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xf0d060, transparent: true, opacity: shouldAnimate ? 0 : 0.6,
  });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wireframe.scale.setScalar(scale * 1.08);
  wireframe.renderOrder = 1;
  grp.add(wireframe);

  const _r = createRng(Math.abs(position.x * 1000 + position.y * 100 + position.z * 10 + 1) | 0);
  grp.userData = {
    rotSpeed: new THREE.Vector3((_r() - 0.5) * 0.002, 0.0025, 0.001),
    bobPhase: _r() * Math.PI * 2,
    bobSpeed: 0.0024, bobAmp: 0.08, baseY: position.y,
    _matTargets: [
      { mat: coreMat, targetOpacity: 1.0 },
      { mat: lineMat, targetOpacity: 0.6 },
    ],
  };
  return grp;
}

function createSolidBall(position, scale = 0.8) {
  const grp = new THREE.Group();
  grp.position.copy(position);

  const geo = new THREE.SphereGeometry(0.25, 16, 12);
  const shouldAnimate = _isLanding && !_prefersReducedMotionLocked;

  const coreMat = new THREE.MeshStandardMaterial({
    color: GOLD, emissive: GOLD, emissiveIntensity: 0.8,
    metalness: 0.92, roughness: 0.1,
    transparent: shouldAnimate, opacity: shouldAnimate ? 0 : 1,
  });
  const core = new THREE.Mesh(geo, coreMat);
  core.scale.setScalar(scale);
  core.renderOrder = 0;
  grp.add(core);

  const edges = new THREE.EdgesGeometry(geo);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xf0d060, transparent: true, opacity: shouldAnimate ? 0 : 0.5,
  });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wireframe.scale.setScalar(scale * 1.06);
  wireframe.renderOrder = 1;
  grp.add(wireframe);

  const _r = createRng(Math.abs(position.x * 1000 + position.y * 100 + position.z * 10 + 2) | 0);
  grp.userData = {
    rotSpeed: new THREE.Vector3(0, (_r() - 0.5) * 0.003, 0),
    bobPhase: _r() * Math.PI * 2,
    bobSpeed: 0.0018, bobAmp: 0.10, baseY: position.y,
    _matTargets: [
      { mat: coreMat, targetOpacity: 1.0 },
      { mat: lineMat, targetOpacity: 0.5 },
    ],
  };
  return grp;
}

function createFloatingGeometry() {
  const objects = [];
  const rand = createRng(88321);

  const COLS = 6;
  const ROWS = 4;
  const DEPTH_LAYERS = 3;
  const X_SPAN = 16;
  const Y_SPAN = 6;
  const Z_NEAR = 1;
  const Z_FAR = -10;
  const LOGO_SX = 2.8;
  const LOGO_SY = 2.0;

  const cellW = X_SPAN / COLS;
  const cellH = Y_SPAN / ROWS;
  const cellD = (Z_NEAR - Z_FAR) / DEPTH_LAYERS;

  const geoPool = [
    () => new THREE.IcosahedronGeometry(0.5, 0),
    () => new THREE.OctahedronGeometry(0.4, 0),
    () => new THREE.DodecahedronGeometry(0.4, 0),
    () => new THREE.BoxGeometry(0.55, 0.55, 0.55),
    () => new THREE.TorusGeometry(0.3, 0.10, 8, 20),
    () => new THREE.TetrahedronGeometry(0.45, 0),
  ];

  const slots = [];
  for (let layer = 0; layer < DEPTH_LAYERS; layer++) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cx = -X_SPAN / 2 + cellW * (col + 0.5);
        const cy = -Y_SPAN / 2 + cellH * (row + 0.5) + 0.5;
        const cz = Z_NEAR - cellD * (layer + 0.5);
        slots.push({ cx, cy, cz, layer, row, col });
      }
    }
  }

  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  const targetCount = isMobile ? 12 : 20;
  let placed = 0;

  const typePattern = [
    'wire', 'pyramid', 'wire', 'ball', 'wire', 'wire',
    'pyramid', 'wire', 'ball', 'wire', 'pyramid', 'wire',
    'ball', 'wire', 'pyramid', 'wire', 'ball', 'wire',
    'pyramid', 'ball',
  ];
  const colorPattern = [GOLD, CYAN, CYAN, GOLD, GOLD, CYAN];

  for (const slot of slots) {
    if (placed >= targetCount) break;

    const jitterX = (rand() - 0.5) * cellW * 0.6;
    const jitterY = (rand() - 0.5) * cellH * 0.5;
    const jitterZ = (rand() - 0.5) * cellD * 0.4;

    const x = slot.cx + jitterX;
    const y = slot.cy + jitterY;
    const z = slot.cz + jitterZ;

    if (Math.abs(x) < LOGO_SX && Math.abs(y - 0.25) < LOGO_SY) continue;
    if (y < -1.5 && Math.abs(x) < 5 && z < -1 && z > -5.5) continue;

    const depthNorm = (z - Z_FAR) / (Z_NEAR - Z_FAR);
    const scale = 0.5 + depthNorm * 0.6;

    const pos = new THREE.Vector3(x, y, z);
    const kind = typePattern[placed % typePattern.length];

    if (kind === 'pyramid') {
      objects.push(createSolidPyramid(pos, scale));
    } else if (kind === 'ball') {
      objects.push(createSolidBall(pos, scale));
    } else {
      const geoIdx = Math.floor(rand() * geoPool.length);
      const color = colorPattern[placed % colorPattern.length];
      objects.push(createWireframeObject(geoPool[geoIdx](), color, scale, pos));
    }
    placed++;
  }
  return objects;
}

const LOGO_3D_CENTER = new THREE.Vector3(0, 0.25, 0);

// ---------------------------------------------------------------------------
// 3D Logo — Arc mark + text, all in-scene Three.js geometry
// ---------------------------------------------------------------------------
let _logoGroup = null;
const _emblemMats = [];
const _emblemLights = [];
const _emblemLightBaseIntensities = [];
/** Scene-level lights that illuminate the emblem from the outside (spot + two
 *  point lights). Captured once in initScene for fade-tween scaling. */
const _emblemSceneLights = [];
const _emblemSceneLightBaseIntensities = [];
/** Base scale of the logo group at mount (1.5 on mobile, 2.0 desktop).
 *  Locked once so the fade tween can interpolate from 0.85× → 1.0× base. */
let _logoBaseScale = 1;

/* -- Emblem fade state machine ------------------------------------------
   Phases: 'visible' (resting; cost = zero branch), 'fadingOut', 'hidden'
   (resting; _logoGroup.visible=false), 'fadingIn'. Driven from animateStep()
   via tickEmblemFade(). Single tween value _emblemT in [0,1] drives:
     - group scale: lerp(_logoBaseScale * EMBLEM_SCALE_MIN, _logoBaseScale, t)
     - material opacity on every mesh in _logoGroup (traversed)
     - emblem point-light intensities (both group-local and scene-level)
   Fully deterministic; honors prefers-reduced-motion by snapping t to
   target. No GSAP, no easing lib; one cubic ease-out baked in. */
const EMBLEM_FADE_MS = 420;
const EMBLEM_SCALE_MIN = 0.85;
let _emblemPhase = 'hidden';
let _emblemPhaseStart = 0;
let _emblemT = 0;
let _emblemTargetVisible = false;

function easeOutCubic(x) {
  const clamped = x < 0 ? 0 : x > 1 ? 1 : x;
  return 1 - Math.pow(1 - clamped, 3);
}

function setEmblemTarget(visible) {
  if (_emblemTargetVisible === visible) return;
  _emblemTargetVisible = visible;

  /* Lazy-kickoff the GLB + font rasterisation the first time the emblem is
     actually asked to appear. For users who arrived on an interior route and
     then navigate TO /, this is when we incur the 247 KB GLB fetch — not on
     their initial page load. */
  if (visible) ensureLogoAssetsLoaded();

  if (_prefersReducedMotionLocked) {
    _emblemT = visible ? 1 : 0;
    _emblemPhase = visible ? 'visible' : 'hidden';
    _emblemPhaseStart = 0;
    applyEmblemT();
    return;
  }

  /* Start from the current _emblemT so a rapid back-and-forth reverses
     mid-tween rather than snapping. */
  _emblemPhase = visible ? 'fadingIn' : 'fadingOut';
  _emblemPhaseStart = 0;
}

function tickEmblemFade(timestamp) {
  if (_emblemPhase === 'visible' || _emblemPhase === 'hidden') return;
  if (_emblemPhaseStart === 0) {
    /* First frame of this transition; the remaining distance at _emblemT
       maps to a partial-duration tween so reversals feel proportional. */
    const remaining = _emblemPhase === 'fadingIn' ? (1 - _emblemT) : _emblemT;
    _emblemPhaseStart = timestamp - (1 - remaining) * EMBLEM_FADE_MS;
  }
  const elapsed = timestamp - _emblemPhaseStart;
  const raw = Math.min(1, Math.max(0, elapsed / EMBLEM_FADE_MS));
  const eased = easeOutCubic(raw);
  _emblemT = _emblemPhase === 'fadingIn' ? eased : 1 - eased;
  applyEmblemT();
  if (raw >= 1) {
    _emblemPhase = _emblemPhase === 'fadingIn' ? 'visible' : 'hidden';
    _emblemPhaseStart = 0;
  }
}

/** Cache of materials under _logoGroup, keyed by their "was transparent
 *  originally" flag, so we can restore the wing's metal mats to
 *  transparent:false when the emblem comes to rest in the 'visible' phase
 *  (avoids permanently forcing them into the transparent render pass). */
const _logoFadeMatCache = new WeakMap();

function applyEmblemT() {
  const t = _emblemT;
  const resting = _emblemPhase === 'visible' || _emblemPhase === 'hidden';
  if (_logoGroup) {
    _logoGroup.visible = t > 0;
    const s = _logoBaseScale * (EMBLEM_SCALE_MIN + (1 - EMBLEM_SCALE_MIN) * t);
    _logoGroup.scale.setScalar(s);

    _logoGroup.traverse((child) => {
      const mat = child.material;
      if (!mat) return;
      const apply = (m) => {
        if (!_logoFadeMatCache.has(m)) {
          _logoFadeMatCache.set(m, {
            transparent: m.transparent === true,
            opacity: typeof m.opacity === 'number' ? m.opacity : 1,
          });
        }
        const original = _logoFadeMatCache.get(m);
        if (resting && _emblemPhase === 'visible') {
          m.transparent = original.transparent;
          m.opacity = original.opacity;
        } else {
          m.transparent = true;
          m.opacity = original.opacity * t;
        }
      };
      if (Array.isArray(mat)) mat.forEach(apply); else apply(mat);
    });
  }
  for (let i = 0; i < _emblemSceneLights.length; i++) {
    _emblemSceneLights[i].intensity = _emblemSceneLightBaseIntensities[i] * t;
  }
  /* Group-local emblem point lights: updateEmblemSheen() overwrites these
     every frame with a pulsing multiplier. That function is updated to fold
     in _emblemT so the per-frame intensity is (base * pulse * _emblemT). */
}

function createLogoTextPlane(text, fontSize, fontWeight, color, letterSpace, worldWidth, worldHeight) {
  const RES = 512;
  const fontPx = fontSize * (RES / 256);
  const fontStr = `${fontWeight} ${fontPx}px "Orbitron", system-ui, sans-serif`;
  const lsPx = letterSpace * (RES / 256);

  const measure = document.createElement('canvas').getContext('2d');
  measure.font = fontStr;
  if (measure.letterSpacing !== undefined) {
    measure.letterSpacing = `${lsPx}px`;
  }
  const metrics = measure.measureText(text);
  const measuredW = Math.ceil(metrics.width + lsPx * 2);
  const canvasH = Math.ceil(worldHeight * RES);
  const canvasW = Math.max(measuredW + 40, Math.ceil(worldWidth * RES));
  const actualWorldW = canvasW / RES;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (ctx.letterSpacing !== undefined) {
    ctx.letterSpacing = `${lsPx}px`;
  }
  ctx.fillText(text, canvasW / 2, canvasH / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.premultiplyAlpha = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  const geo = new THREE.PlaneGeometry(actualWorldW, worldHeight);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.01,
    metalness: 0.7,
    roughness: 0.25,
    emissive: new THREE.Color(color),
    emissiveIntensity: 1.4,
    emissiveMap: tex,
  });

  return new THREE.Mesh(geo, mat);
}

/** Gate for the 247 KB wing-emblem GLB + font-dependent text plane rasterisation.
 *  The emblem only ever renders on the landing route; interior-first-load users
 *  (someone arriving on /contact from an email link) should not pay this bandwidth
 *  cost. Reset on cleanup so a context-loss recovery re-fetches only if needed. */
let _logoAssetsLoaded = false;

/** Assemble the emblem GLB, fallback PNG, and text planes into the existing
 *  _logoGroup. Idempotent: no-ops if already queued. Called synchronously when
 *  the lobby boots on landing, or lazily from setEmblemTarget(true) on the first
 *  navigation TO landing from an interior route. */
function ensureLogoAssetsLoaded() {
  if (_logoAssetsLoaded) return;
  if (!_logoGroup) return;
  _logoAssetsLoaded = true;
  const session = _lobbySession;
  const group = _logoGroup;

  _gltfLoader.load('/wing-emblem-3d-model.glb', (gltf) => {
    if (session !== _lobbySession) return;
    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 1.214;
    const scaleFactor = targetSize / maxDim;
    model.scale.setScalar(scaleFactor);

    model.position.set(-center.x * scaleFactor + 0.25, -center.y * scaleFactor + 0.38, -center.z * scaleFactor + 0.08);
    model.rotation.y = Math.PI / 2;

    model.traverse((child) => {
      if (child.isMesh) {
        const mat = child.material;
        mat.color = new THREE.Color(0xf5d050);
        mat.metalness = 0.88;
        mat.roughness = 0.10;
        mat.emissive = new THREE.Color(0xe8b830);
        mat.emissiveIntensity = 1.8;
        mat.envMapIntensity = 1.2;
        mat.needsUpdate = true;
        child.castShadow = false;
        child.receiveShadow = false;
        _emblemMats.push(mat);
      }
    });

    const emblemGlow = new THREE.PointLight(0xe8c040, 1.5, 7);
    emblemGlow.position.set(0.25, 0.40, 0.5);
    group.add(emblemGlow);
    _emblemLights.push(emblemGlow);

    const emblemRim = new THREE.PointLight(0xffd860, 0.75, 5);
    emblemRim.position.set(-0.3, 0.5, -0.4);
    group.add(emblemRim);
    _emblemLights.push(emblemRim);

    const emblemUnder = new THREE.PointLight(0xd4a020, 0.6, 4);
    emblemUnder.position.set(0.2, -0.2, 0.3);
    group.add(emblemUnder);
    _emblemLights.push(emblemUnder);

    _emblemLights.forEach(l => _emblemLightBaseIntensities.push(l.intensity));

    group.add(model);
    /* Pre-compile the emblem's materials before the first render so the
       model appears without a per-frame shader-compile hitch. */
    if (renderer && camera) renderer.compile(group, camera);
    /* Re-apply the current fade t so the freshly-added meshes + point lights
       inherit the in-flight opacity / intensity rather than snapping to 1.0. */
    applyEmblemT();
    markDirty('assetMounted');
    prefetchPlanterAssets();
  }, undefined, () => {
    _texLoader.load('/phoenix-emblem.png', (fallbackTex) => {
      if (session !== _lobbySession) {
        fallbackTex.dispose();
        return;
      }
      fallbackTex.colorSpace = THREE.SRGBColorSpace;
      fallbackTex.premultiplyAlpha = false;
      const fallbackMat = new THREE.MeshBasicMaterial({
        map: fallbackTex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      });
      const fallbackMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), fallbackMat);
      fallbackMesh.position.set(0, 0.30, 0.08);
      group.add(fallbackMesh);
      if (renderer && camera) renderer.compile(group, camera);
      applyEmblemT();
      markDirty('assetMounted');
      prefetchPlanterAssets();
    });
  });

  document.fonts.ready.then(() => {
    if (session !== _lobbySession) return;
    const sarifText = createLogoTextPlane(
      'SARIF', 100, '700', '#e8c040', 18, 2.8, 0.50,
    );
    sarifText.position.set(0.04, -0.42, 0.05);
    group.add(sarifText);

    const consultingText = createLogoTextPlane(
      'CONSULTING', 54, '400', '#e0b838', 14, 2.6, 0.30,
    );
    consultingText.position.set(0.04, -0.72, 0.05);
    group.add(consultingText);

    /* Newly-added children inherit the group's current material state;
       re-run applyEmblemT so their opacity matches the in-flight fade rather
       than popping in at 1.0 when the emblem is mid-transition. */
    applyEmblemT();
    markDirty('assetMounted');
  });
}

/** Create an empty, correctly-scaled/positioned Group placeholder. Actual
 *  GLB + text rasterisation is deferred to ensureLogoAssetsLoaded() so
 *  interior-first-load users don't pay the ~247 KB emblem bandwidth when
 *  they'll never see it. */
function createLogo3D() {
  const group = new THREE.Group();
  group.scale.setScalar(isMobile ? 1.5 : 2.0);
  group.position.copy(LOGO_3D_CENTER);
  _logoGroup = group;
  return group;
}

const EMBLEM_CENTER = new THREE.Vector3(0.50, 0.25, 0);
let _sceneStartTime = 0;
let _isLanding = false;

// ---------------------------------------------------------------------------
// Lobby Planters — center garden (performance) + side concrete pair; floor glow spots
// ---------------------------------------------------------------------------
const FLOOR_Y = -3.0;

const PLANTER_CONFIG = [
  {
    path: '/terraced-garden-3d-model-low.glb',
    position: new THREE.Vector3(0, FLOOR_Y, -3),
    targetFootprint: 5.625,
    rotationY: -Math.PI / 2,
  },
  {
    path: '/concrete-planters-3d-model.glb',
    position: new THREE.Vector3(-3, FLOOR_Y, -1.5),
    targetFootprint: 2.1,
    rotationY: -Math.PI / 2 + Math.PI / 6,
  },
  {
    path: '/terraced-concrete-planter-3d-model.glb',
    position: new THREE.Vector3(2.5, FLOOR_Y, -1.5),
    targetFootprint: 2.1,
    rotationY: -Math.PI / 2 - Math.PI / 6,
  },
];

function addPlanterToScene(targetScene, cfg, gltf) {
  const model = gltf.scene;

  model.rotation.y = cfg.rotationY;
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const footprint = Math.max(size.x, size.z);
  const scaleFactor = cfg.targetFootprint / (footprint || 1);
  model.scale.setScalar(scaleFactor);

  model.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(model);
  const finalCenter = new THREE.Vector3();
  finalBox.getCenter(finalCenter);

  model.position.set(
    cfg.position.x - finalCenter.x + model.position.x,
    cfg.position.y - finalBox.min.y + model.position.y,
    cfg.position.z - finalCenter.z + model.position.z,
  );

  const shouldAnimate = _isLanding && !_prefersReducedMotionLocked && _bootLandingInit;
  const matEntries = [];

  model.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.envMapIntensity = 0.6;
      if (mat.roughness !== undefined) {
        mat.roughness = Math.max(mat.roughness, 0.4);
      }
      if (shouldAnimate) {
        const target = mat.opacity !== undefined ? mat.opacity : 1.0;
        mat.transparent = true;
        mat.opacity = 0;
        matEntries.push({ mat, targetOpacity: target });
      }
      mat.needsUpdate = true;
    }
    child.castShadow = false;
    child.receiveShadow = false;
  });

  if (shouldAnimate) {
    const entranceScale = scaleFactor * 0.93;
    model.scale.setScalar(entranceScale);
    _planterEntrances.push({
      mats: matEntries,
      model,
      startMs: performance.now(),
      targetScale: scaleFactor,
    });
    _sceneMaterializeActive = true;
    markDirty('assetMounted');
  }

  targetScene.add(model);
  if (renderer && camera) renderer.compile(model, camera);
  markDirty('assetMounted');
}

/** One planter at a time after decode — limits bandwidth + main-thread decode contention vs parallel loads. */
function loadLobbyPlantersSequential(targetScene, session) {
  /* Freeze the mobile-vs-desktop planter decision into the pose
     selector at the same moment it's baked into the scene. After
     this point, any live resize of `isMobile` is cosmetic — the
     planters physically present in the scene are locked. */
  _useMobilePoses = isMobile;
  const configs = isMobile ? PLANTER_CONFIG.slice(0, 1) : PLANTER_CONFIG;
  let index = 0;

  function loadNext() {
    if (session !== _lobbySession) return;
    if (index >= configs.length) return;
    const cfg = configs[index];
    index += 1;
    _gltfLoader.load(cfg.path, (gltf) => {
      if (session !== _lobbySession) return;
      addPlanterToScene(targetScene, cfg, gltf);
      loadNext();
    }, undefined, (err) => {
      if (import.meta.env.DEV) {
        console.warn(`Planter load failed: ${cfg.path}`, err);
      }
      loadNext();
    });
  }

  loadNext();
}

const PLANTER_DEFER_IDLE_MS = 800;

function scheduleLobbyPlanters(targetScene, session) {
  const startSequential = () => {
    if (session !== _lobbySession) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => loadLobbyPlantersSequential(targetScene, session));
    });
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(startSequential, { timeout: PLANTER_DEFER_IDLE_MS });
  } else {
    setTimeout(startSequential, 48);
  }
}

// ---------------------------------------------------------------------------
// Ambient Dust Particles — bright motes floating through the scene
// ---------------------------------------------------------------------------
let _dustMesh = null;
const dustData = [];

function createDustParticles() {
  const count = isMobile ? 140 : 150;
  const rand = createRng(44102);

  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    let x, y, z;
    const cluster = rand();

    if (cluster < 0.4) {
      const r = 0.5 + rand() * 3.0;
      const theta = rand() * Math.PI * 2;
      x = EMBLEM_CENTER.x + Math.cos(theta) * r;
      y = EMBLEM_CENTER.y + (rand() - 0.5) * 3.0;
      z = EMBLEM_CENTER.z + Math.sin(theta) * r;
      sizes[i] = 2.0 + rand() * 3.5;
      alphas[i] = 0.5 + rand() * 0.5;
    } else {
      const spread = isMobile ? 14 : 22;
      x = (rand() - 0.5) * spread;
      y = -3 + rand() * 8;
      z = (rand() - 0.5) * spread;
      sizes[i] = 1.2 + rand() * 2.5;
      alphas[i] = 0.2 + rand() * 0.5;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    dustData.push({
      baseX: x, baseY: y, baseZ: z,
      driftY: 0.001 + rand() * 0.003,
      phase: rand() * Math.PI * 2,
      flickerSpeed: 0.5 + rand() * 2.0,
      baseAlpha: alphas[i],
    });
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      /* Mirror the actual DPR the renderer is drawing at — the
         renderer caps at 1.5 on mobile / 2 on desktop (see
         setPixelRatio calls), so hardcoding Math.min(devicePixelRatio, 2)
         drifts on high-DPR phones and yields slightly oversized points.
         Reading from renderer keeps shader and canvas in lockstep. */
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aAlpha;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (4.0 / -mvPos.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 12.0);
        gl_Position = projectionMatrix * mvPos;
      }`,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, d);
        float core = smoothstep(0.3, 0.0, d);
        vec3 goldEdge = vec3(0.83, 0.66, 0.15);
        vec3 goldBright = vec3(1.0, 0.88, 0.35);
        vec3 hotCore = vec3(1.0, 0.97, 0.80);
        vec3 col = mix(goldEdge, goldBright, glow);
        col = mix(col, hotCore, core * 0.7);
        float alpha = vAlpha * glow;
        alpha += core * 0.3;
        gl_FragColor = vec4(col * (1.0 + core * 0.5), alpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  _dustMesh = new THREE.Points(geo, mat);
  return _dustMesh;
}

function updateDustParticles(time) {
  if (!_dustMesh) return;
  const positions = _dustMesh.geometry.attributes.position.array;
  const alphaAttr = _dustMesh.geometry.attributes.aAlpha.array;
  const t = time * 0.001;
  const elapsed = time - _sceneStartTime;
  const dustBirthDuration = 4000;

  for (let i = 0; i < dustData.length; i++) {
    const d = dustData[i];

    const targetX = d.baseX + Math.sin(t * 0.5 + d.phase) * 0.8;
    const loopY = ((d.baseY + t * d.driftY * 60) % 11) - 3;
    const targetZ = d.baseZ + Math.cos(t * 0.4 + d.phase) * 0.6;

    if (_isLanding) {
      const birthDelay = (i / dustData.length) * dustBirthDuration;
      const age = elapsed - birthDelay;

      if (age < 0) {
        positions[i * 3] = EMBLEM_CENTER.x;
        positions[i * 3 + 1] = EMBLEM_CENTER.y;
        positions[i * 3 + 2] = EMBLEM_CENTER.z;
        alphaAttr[i] = 0;
        continue;
      }

      const birthFade = Math.min(age / 2000, 1.0);
      const expand = 1 - Math.pow(1 - Math.min(age / 3000, 1.0), 2);

      positions[i * 3]     = EMBLEM_CENTER.x + (targetX - EMBLEM_CENTER.x) * expand;
      positions[i * 3 + 1] = EMBLEM_CENTER.y + (loopY - EMBLEM_CENTER.y) * expand;
      positions[i * 3 + 2] = EMBLEM_CENTER.z + (targetZ - EMBLEM_CENTER.z) * expand;

      alphaAttr[i] = d.baseAlpha * birthFade * (0.5 + 0.5 * Math.sin(t * d.flickerSpeed + d.phase));
    } else {
      positions[i * 3]     = targetX;
      positions[i * 3 + 1] = loopY;
      positions[i * 3 + 2] = targetZ;

      alphaAttr[i] = d.baseAlpha * (0.5 + 0.5 * Math.sin(t * d.flickerSpeed + d.phase));
    }
  }
  _dustMesh.geometry.attributes.position.needsUpdate = true;
  _dustMesh.geometry.attributes.aAlpha.needsUpdate = true;
  _dustMesh.material.uniforms.uTime.value = t;
}


// ---------------------------------------------------------------------------
// Static SVG Fallback (prefers-reduced-motion / no WebGL)
// ---------------------------------------------------------------------------
function createStaticFallback() {
  if (document.getElementById('lobby-fallback')) return;

  const canvas = document.getElementById('lobby-canvas');
  if (canvas) canvas.style.display = 'none';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', '0 0 1200 800');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
  svg.setAttribute('aria-hidden', 'true');
  svg.id = 'lobby-fallback';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
  grad.setAttribute('id', 'lobbyGrad');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#4a8a9a');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#0c1a24');
  grad.appendChild(s1); grad.appendChild(s2);
  defs.appendChild(grad); svg.appendChild(defs);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '1200'); bg.setAttribute('height', '800');
  bg.setAttribute('fill', 'url(#lobbyGrad)');
  svg.appendChild(bg);

  [[200,300],[350,200],[500,400],[650,150],[800,350],
   [950,250],[300,550],[600,600],[850,500],[150,150]].forEach(([cx, cy]) => {
    const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      pts.push(`${cx + 30 * Math.cos(a)},${cy + 30 * Math.sin(a)}`);
    }
    hex.setAttribute('points', pts.join(' '));
    hex.setAttribute('fill', 'none');
    hex.setAttribute('stroke', 'rgba(0,212,255,0.12)');
    hex.setAttribute('stroke-width', '0.5');
    svg.appendChild(hex);
  });

  document.body.appendChild(svg);
}

// ---------------------------------------------------------------------------
// HDR + LUT async loaders (Pillar 2)
// ---------------------------------------------------------------------------
/** Attempt to replace the synthetic IBL with a real studio HDR. No-ops
 *  cleanly if the HDR is absent, times out, or fails CORS / decode.
 *  The synthetic envScene set up in initScene remains the canonical
 *  fallback; this path exists to upgrade visual quality when the asset
 *  is shipped, without coupling the build to the asset's presence.
 *
 *  When public/env/*.hdr are absent at build time, Base.astro omits the
 *  matching <meta name="lobby-hdr-*"> flags so we never hit the network
 *  for a guaranteed 404 on production. */
function hdrEnvMarkedShippedForDevice(mobile) {
  const name = mobile ? 'lobby-hdr-mobile' : 'lobby-hdr-desktop';
  const meta = typeof document !== 'undefined' ? document.querySelector(`meta[name="${name}"]`) : null;
  return meta?.getAttribute('content') === '1';
}

function tryUpgradeEnvironmentToHDR(sessionAtStart) {
  if (!renderer || !scene) return;
  const mobile = isMobile;
  if (!hdrEnvMarkedShippedForDevice(mobile)) return;
  const url = mobile ? HDR_ENV_URL_MOBILE : HDR_ENV_URL_DESKTOP;
  const loader = new HDRLoader();
  loader.load(url, (tex) => {
    if (sessionAtStart !== _lobbySession) { tex.dispose(); return; }
    if (!renderer || !scene) { tex.dispose(); return; }
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const hdrRT = pmrem.fromEquirectangular(tex);
    tex.dispose();
    pmrem.dispose();
    /* Free the synthetic RT before swapping; keeping both would leak a
       PMREM-sized render target (a few hundred KB of VRAM) for the life
       of the session. */
    if (_activeEnvRT) _activeEnvRT.dispose();
    _activeEnvRT = hdrRT;
    scene.environment = hdrRT.texture;
    markDirty('envMap');
  }, undefined, (err) => {
    /* Silent fallback. HDR 404 is the EXPECTED steady state until the
       user drops in a source HDR; only log in dev so builds don't spam. */
    if (import.meta.env.DEV) {
      const msg = err && err.message ? err.message : String(err || 'unknown');
      console.info('[lobby-scene] HDR env map unavailable; using synthetic IBL:', url, msg);
    }
  });
}

/** Fetch a LUT2D image (32³ horizontal strip, 1024×32, WebP lossless by
 *  default — any horizontal-strip image with W === H*H is accepted) and
 *  repack it into a Three.js Data3DTexture for LUTPass. Same
 *  session-guard and silent-fail pattern as the HDR upgrade: the
 *  LUTPass stays live with a null LUT if the asset is missing or the
 *  browser rejects the format, which is a neutral passthrough. */
function tryLoadLutTexture(sessionAtStart) {
  if (!_lutPass) return;
  const highContrast =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-contrast: more)').matches;
  const url = highContrast ? LUT_URL_HIGH_CONTRAST : LUT_URL_PRIMARY;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = () => {
    if (sessionAtStart !== _lobbySession) return;
    if (!_lutPass) return;
    try {
      const tex = decodeLut2DImage(img);
      if (_activeLutTex) _activeLutTex.dispose();
      _activeLutTex = tex;
      _lutPass.lut = tex;
      markDirty('envMap');
    } catch (err) {
      if (import.meta.env.DEV) {
        console.info('[lobby-scene] LUT decode failed; passthrough retained:', err);
      }
    }
  };
  img.onerror = () => {
    if (import.meta.env.DEV) {
      console.info('[lobby-scene] LUT unavailable; passthrough retained:', url);
    }
  };
  img.src = url;
}

/** Repack a decoded 4096×64 RGB(A) LUT2D image into a 64×64×64
 *  Data3DTexture. Two source layouts are auto-detected from image
 *  aspect ratio:
 *    horizontal strip (legacy): W = size*size, H = size. Slice k at
 *      x∈[k*size, (k+1)*size); within a slice, pixel (i,j) holds the
 *      graded colour for (r=i, g=j, b=k).
 *    vertical strip (compression-optimal, current): W = size,
 *      H = size*size. Slice k at y∈[k*size, (k+1)*size); within a
 *      slice, pixel (i,j) holds (r=i, g=j, b=k).
 *  Destination layout (Three.js Data3DTexture) stores data in XYZ-major
 *  order: data[((z * H + y) * W + x) * 4]. */
function decodeLut2DImage(img) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  let size;
  let vertical;
  if (W > 0 && H > 0 && W === H * H) {
    size = H;
    vertical = false;
  } else if (W > 0 && H > 0 && H === W * W) {
    size = W;
    vertical = true;
  } else {
    throw new Error(`invalid LUT dimensions: ${W}×${H}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('LUT decode: 2D context unavailable');
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, W, H).data;
  const out = new Uint8Array(size * size * size * 4);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const sx = vertical ? r : (b * size + r);
        const sy = vertical ? (b * size + g) : g;
        const si = (sy * W + sx) * 4;
        const di = ((b * size + g) * size + r) * 4;
        out[di + 0] = src[si + 0];
        out[di + 1] = src[si + 1];
        out[di + 2] = src[si + 2];
        out[di + 3] = 255;
      }
    }
  }
  const tex = new THREE.Data3DTexture(out, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Scene Initialisation
// ---------------------------------------------------------------------------
function initScene(canvas) {
  const pathNorm = window.location.pathname.replace(/\/+$/, '') || '/';
  _isLanding = pathNorm === '/';
  const session = _lobbySession;
  const w = canvas.offsetWidth  || window.innerWidth;
  const h = canvas.offsetHeight || window.innerHeight;

  /* With the reveal veil covering the canvas during startup, the CSS
     filter energising effect (contrast/brightness boost) is no longer
     useful — users never see the hot initial state, they only see the
     1400ms cool-down which reads as an unwanted dimming after reveal.
     The in-scene bloom ramp (JS-driven, HOT→CALM) still provides the
     energising feel; just stamp 'calm' immediately so the CSS filter
     stays at contrast(1) brightness(1) throughout. */
  const startOnLanding = _isLanding;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-lobby-boot', 'calm');
  }

  renderer = new THREE.WebGLRenderer({
    canvas, antialias: !isMobile, alpha: false,
    powerPreference: isMobile ? 'low-power' : 'high-performance',
  });
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(resolveLobbyPixelRatio(w, h, isMobile));
  renderer.setClearColor(FOG_COLOR, 1);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.038);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  envScene.add(new THREE.HemisphereLight(0x8a7a60, 0x4a5a4a, 1.2 * AMBIENT_LIGHT_INTENSITY_SCALE));
  const envDir = new THREE.DirectionalLight(0xdcc090, 0.9 * AMBIENT_LIGHT_INTENSITY_SCALE);
  envDir.position.set(1, 2, 3);
  envScene.add(envDir);
  /* Synthetic hemisphere IBL ships as the default. A real studio HDR
     (if present at /env/lobby-studio.hdr) will asynchronously upgrade
     the environment below — materials re-render with the new PMREM
     target the next frame. If the HDR 404s, this synthetic rig stays
     and the visual register is indistinguishable from before, so the
     build never depends on the optional HDR asset. */
  _activeEnvRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = _activeEnvRT.texture;
  pmrem.dispose();

  /* Async HDR upgrade (Pillar 2 · 2a). Non-blocking; never throws to the
     init path. The loaded HDR is downsized at build time — 256×128
     desktop / 128×64 mobile — so the network cost is well under the LCP
     budget even when the asset exists. */
  tryUpgradeEnvironmentToHDR(_lobbySession);

  /* Pillar 3 — resolve the cold-boot pose from the current URL.
     Normally we snap into it (no tween on first frame). Round-3 P8a
     augments this with pose memory: if a fresh snapshot exists in
     sessionStorage, seed _poseBase from the snapshot instead and let
     the route tween below carry the camera into the new anchor. The
     effect is a single continuous motion across the document
     boundary rather than a hard cut. */
  const bootPose = resolvePose(window.location.pathname, { isMobile: _useMobilePoses });
  const poseMemory = readPoseMemory();
  const useMemory = Boolean(poseMemory) && poseMemory.id !== bootPose.id;
  if (useMemory) {
    snapPoseBaseTo(poseFromMemory(poseMemory));
  } else {
    snapPoseBaseTo(bootPose);
  }
  const baseFov = _poseBase.fov;
  const fov = (w / h < 1) ? baseFov + (1 - w / h) * 22 : baseFov;
  camera = new THREE.PerspectiveCamera(fov, w / h, 0.5, 200);
  camera.position.set(_poseBase.x, _poseBase.y, _poseBase.z);
  /* Pose memory continuation: camera is seeded at the previous
     document's last pose, now animate into the new URL's anchor. On
     reduced-motion this snaps (startPoseTween internal guard); on
     useMemory=false this is effectively a no-op because _poseBase is
     already at bootPose — the ease hits settle at t=0. Round 5:
     honour the per-pose tweenMs override so dramatic routes
     (praxis low-hero, lexicon overhead) take longer to settle. */
  if (useMemory) {
    startPoseTween(bootPose, bootPose.tweenMs ?? ROUTE_TWEEN_MS);
  }
  /* Layer 1 is reserved for objects the main camera renders but the
     floor Reflector must NOT capture (currently: the hex grid lines, so
     they don't appear mirrored in the reflector below them). Three.js
     Reflectors default to layer 0 only, so leaving their virtual camera
     untouched is enough — we just need the user-facing camera to see
     both layers. */
  camera.layers.enable(1);

  scene.add(new THREE.HemisphereLight(0x9a8a6a, 0x6a8a6a, 1.4 * AMBIENT_LIGHT_INTENSITY_SCALE));

  const mainDir = new THREE.DirectionalLight(0xdcc0a0, 1.3);
  mainDir.position.set(2, 10, 4);
  scene.add(mainDir);

  const warmFill = new THREE.DirectionalLight(0xe0c080, 0.8);
  warmFill.position.set(-2, 6, -2);
  scene.add(warmFill);

  const cyanLight = new THREE.PointLight(CYAN, 0.14, 28);
  cyanLight.position.set(-5, 1, -2);
  scene.add(cyanLight);

  const cyanLight2 = new THREE.PointLight(CYAN, 0.10, 24);
  cyanLight2.position.set(5, 0.5, -4);
  scene.add(cyanLight2);

  const goldLight = new THREE.PointLight(GOLD, 0.9, 40);
  goldLight.position.set(0, 1.0, 2);
  scene.add(goldLight);

  const goldFill = new THREE.PointLight(0xddb540, 0.7, 24);
  goldFill.position.set(0, -1.5, 4);
  scene.add(goldFill);

  const floorGlow1 = new THREE.PointLight(0xe0c890, 1.3, 22);
  floorGlow1.position.set(-3, -1.0, -1.5);
  scene.add(floorGlow1);

  const floorGlow2 = new THREE.PointLight(0xe0c890, 1.3, 22);
  floorGlow2.position.set(2.5, -1.0, -1.5);
  scene.add(floorGlow2);

  const floorGlowCenter = new THREE.PointLight(0xf0d8a0, 1.5, 26);
  floorGlowCenter.position.set(0, -0.5, -3);
  scene.add(floorGlowCenter);

  const planterSpotCenter = new THREE.SpotLight(0xf0e0c0, 1.8, 24, Math.PI / 5, 0.5, 0.8);
  planterSpotCenter.position.set(0, 3, -1);
  planterSpotCenter.target.position.set(0, FLOOR_Y, -3);
  scene.add(planterSpotCenter);
  scene.add(planterSpotCenter.target);

  const planterSpotL = new THREE.SpotLight(0xe8d8a8, 1.2, 20, Math.PI / 6, 0.6, 1.0);
  planterSpotL.position.set(-3, 2, 0.5);
  planterSpotL.target.position.set(-3, FLOOR_Y, -1.5);
  scene.add(planterSpotL);
  scene.add(planterSpotL.target);

  const planterSpotR = new THREE.SpotLight(0xe8d8a8, 1.2, 20, Math.PI / 6, 0.6, 1.0);
  planterSpotR.position.set(2.5, 2, 0.5);
  planterSpotR.target.position.set(2.5, FLOOR_Y, -1.5);
  scene.add(planterSpotR);
  scene.add(planterSpotR.target);

  /* Scene-level emblem lights are authored unconditionally so the fade tween
     can scale them smoothly when leaving/returning to the landing route.
     When the emblem is hidden (interior routes), their intensity goes to 0
     which is visually equivalent to removing them; their cost at zero is
     negligible (Three.js still dispatches the uniform update but contributes
     no bloom / no diffuse). */
  const logoSpot = new THREE.SpotLight(0xfff0d0, 2.6, 22, Math.PI / 4.5, 0.35, 0.7);
  logoSpot.position.set(0, 5, 5);
  logoSpot.target.position.copy(LOGO_3D_CENTER);
  scene.add(logoSpot);
  scene.add(logoSpot.target);

  const logoFront = new THREE.PointLight(0xe8c060, 1.1, 10);
  logoFront.position.set(0, 0.3, 3);
  scene.add(logoFront);

  const logoHalo = new THREE.PointLight(0xf0d050, 0.45, 12);
  logoHalo.position.set(0, 1.0, 1.5);
  scene.add(logoHalo);

  _emblemSceneLights.push(logoSpot, logoFront, logoHalo);
  for (const l of _emblemSceneLights) _emblemSceneLightBaseIntensities.push(l.intensity);

  scene.add(createHexGridFloor());
  createFloatingGeometry().forEach(obj => { scene.add(obj); floatingObjects.push(obj); });
  scene.add(createDustParticles());

  /* Logo group is always created; visibility is driven by the emblem fade
     state machine (onRouteChange). On interior routes, _logoGroup.visible
     is set false so the rAF loop doesn't rasterise the GLB / text planes. */
  const logo = createLogo3D();
  scene.add(logo);
  _logoBaseScale = logo.scale.x;

  scheduleLobbyPlanters(scene, session);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  /* Bloom is part of the render tier; retained on every route per design
     instruction. When the emblem is hidden the bloom threshold keeps halo
     wash under control because there are no bright emissives left in the
     scene to bloom. Promoted to module scope so the boot transition can
     lerp its strength from "hot" → calm. */
  const bloomScale = resolveBloomInternalScale(isMobile, w, h);
  const calmBloom = isMobile ? BOOT_BLOOM_STRENGTH_CALM_MOBILE : BOOT_BLOOM_STRENGTH_CALM_DESKTOP;
  _bloomPass = new UnrealBloomPass(
    new THREE.Vector2(canvas.width * bloomScale, canvas.height * bloomScale),
    startOnLanding ? BOOT_BLOOM_STRENGTH_HOT : calmBloom,
    isMobile ? 0.6  : 0.5,
    isMobile ? 0.90 : 0.85,
  );
  composer.addPass(_bloomPass);

  /* OutputPass applies tone-mapping + sRGB encoding. Placing it BEFORE
     LUTPass means the LUT operates on display-referred values — matching
     the colour space the LUT is authored in (see generate-lut.mjs: the
     grade assumes numerically sRGB-looking inputs). Putting LUTPass
     before OutputPass would mean applying an sRGB-space transform to
     linear-light HDR values, which mis-maps the shadow/highlight zones
     and clips HDR highlights at the LUT edge. */
  composer.addPass(new OutputPass());

  /* Cinematic grade (Pillar 2 · 2b). LUTPass in display-referred space
     lets the LUT act the way a Resolve / Baselight grade would: on
     tone-mapped, sRGB-encoded pixels. `intensity` starts at the
     landing default; Pillar 3 animates it per-route. If the LUT
     texture load fails (asset missing / 4xx / decode error), the pass
     is added with a null LUT, which LUTPass passes through unchanged
     — no error path ever produces a broken frame. */
  _lutPass = new LUTPass({ intensity: LUT_INTENSITY_DEFAULT });
  composer.addPass(_lutPass);
  tryLoadLutTexture(_lobbySession);

  /* Round 2026 — Film grain + boot-transition + warm-vignette ShaderPass
     additions removed. Composer chain is now Render → Bloom → Output →
     LUT (4 passes total, was 7). Visual equivalents handled by CSS
     overlays on `#lobby-canvas`; see global.css `.lobby-vignette` and
     `.lobby-grain`, plus the `data-lobby-boot` attribute on <html>
     toggled below. */
  if (startOnLanding && !_prefersReducedMotionLocked) {
    _bootTransitionActive = true;
    _bootTransitionStartMs = performance.now();
    _sceneMaterializeActive = true;
    _sceneMaterializeStartMs = performance.now();
    _bootLandingInit = true;
    /* data-lobby-boot='energising' was already set at the top of initScene()
       so the CSS filter is committed before the first render. */
  } else {
    _bootTransitionActive = false;
    _sceneMaterializeActive = false;
    _bootLandingInit = false;
    /* data-lobby-boot='calm' was already set at the top of initScene(). */
  }
}

// ---------------------------------------------------------------------------
// Animation Loop
// ---------------------------------------------------------------------------
/** Maps a discrete lerp factor at SMOOTH_REFERENCE_FPS to frame-rate–independent alpha for interval dtSec. */
function smoothAlphaFromRef(alphaAtRefFps, dtSec) {
  if (dtSec <= 0) return 0;
  if (alphaAtRefFps >= 1) return 1;
  if (alphaAtRefFps <= 0) return 0;
  const refDt = 1 / SMOOTH_REFERENCE_FPS;
  const lambda = -Math.log(1 - alphaAtRefFps) / refDt;
  const a = 1 - Math.exp(-lambda * dtSec);
  return a > 1 ? 1 : a < 0 ? 0 : a;
}

/** Pillar-3 camera update: arbitrates pose-driven Y (interior routes)
 *  vs scroll-driven Y (landing route only), layers mouse-X parallax on
 *  top, advances the FoV blend and LUT-intensity blend, and resolves
 *  the lookAt target (explicit pose target vs legacy auto-target).
 *
 *  Frame budget: all math runs unconditionally (state must stay
 *  coherent even on skipped renders — otherwise the next forced render
 *  would snap). Only the composer.render() call in animateStep is
 *  gated by the dirty-flag arbitrator. */
function updateCamera(dtSec) {
  /* Base Y arbitration. Landing pose (and ONLY landing pose) uses the
     scroll-driven dolly, because the landing page's body is long and
     scrolling is the primary navigation affordance. Interior pages use
     the pose's fixed Y so vertical scrolling reads as "reading the
     page", not "moving through the lobby". */
  let baseY;
  if (_poseBase.scrollDolly) {
    baseY = CAM_START_Y + (CAM_END_Y - CAM_START_Y) * scrollProgress;
  } else {
    baseY = _poseBase.y;
  }
  const baseX = _poseBase.x;
  const baseZ = _poseBase.z;

  const ay = smoothAlphaFromRef(
    isMobile ? CAMERA_Y_SMOOTH_ALPHA_REF_MOBILE : CAMERA_Y_SMOOTH_ALPHA_REF,
    dtSec,
  );
  const ax = smoothAlphaFromRef(
    isMobile ? CAMERA_X_SMOOTH_ALPHA_REF_MOBILE : CAMERA_X_SMOOTH_ALPHA_REF,
    dtSec,
  );
  /* Mouse-X parallax overlay: the pose's base X is the anchor; the
     user's pointer nudges camera.x by ±MOUSE_PARALLAX_GAIN units around
     it, scaled by the active pose's parallaxGain (1.0 = original feel,
     lower = damped for close-ups). Pillar 4f: when prefers-reduced-
     transparency is set, `computeEffectiveParallax` returns 0 and the
     camera simply chases the pose base X. Using the shared helper
     here (vs recomputing inline) keeps startPoseTween's capture and
     updateCamera's frame loop byte-identical on the overlay math. */
  const targetX = baseX + mouseX * computeEffectiveParallax();
  camera.position.y += (baseY - camera.position.y) * ay;
  camera.position.x += (targetX - camera.position.x) * ax;

  /* Round-3 P8c — Idle camera breathing envelope + offset.
     Envelope runs in seconds from dtSec so it advances correctly on
     the 24 fps floor (no dedicated continuous dirty source). Attack
     (entering idle) is slow — the room settles in. Release (on input)
     is fast — the bob dies before the next frame of user-driven
     motion so it never fights pointer parallax. Reduced-transparency
     zeros amplitude alongside reduced-motion; together they mean
     motion-sensitive and parallax-sensitive users get no residual
     motion beyond explicit pose tweens. */
  const nowForIdle = performance.now();
  const idleMs = nowForIdle - _lastInputTs;
  const wantIdle = idleMs > IDLE_BREATH_ONSET_MS && !_prefersReducedMotionLocked && !_reducedTransparency;
  const targetEnv = wantIdle ? 1 : 0;
  const tauMs = targetEnv > _idleBreathEnvelope
    ? IDLE_BREATH_ATTACK_TAU_MS
    : IDLE_BREATH_RELEASE_TAU_MS;
  /* First-order IIR: env += (target - env) * (1 - exp(-dt/tau)). */
  const alpha = 1 - Math.exp(-(dtSec * 1000) / tauMs);
  _idleBreathEnvelope += (targetEnv - _idleBreathEnvelope) * alpha;
  if (_idleBreathEnvelope > 0.001) {
    /* No markDirty here: the arbitrator's existing 24 fps floor
       renders far faster than the 9 s breath period, so the bob
       remains visible without introducing a new continuous dirty
       source. Adding one would defeat the point of the dirty-flag
       system (idle scenes would render at vsync instead of at the
       floor). */
    const phase = (nowForIdle / 1000) * (2 * Math.PI / IDLE_BREATH_PERIOD_S);
    camera.position.y += Math.sin(phase) * IDLE_BREATH_AMP_Y * _idleBreathEnvelope;
  }

  /* Z is tween-driven and already smooth from the pose ease curve;
     assigning directly avoids a double-smoothing that would make route
     transitions feel mushy. On the landing pose Z is constant (7.0),
     so this is a no-op at steady state. */
  camera.position.z = baseZ;

  /* Round-3 P8d — Normalise + smooth scroll velocity.
     getHomeScrollVelocity() returns 0 outside the landing route (Lenis
     disabled) and for reduced-motion users. Clamp to ±1 after ref
     normalisation so a catastrophic scroll (e.g. Home/End key over a
     very long document) never exits the intended modulation range.
     Exp-smooth with τ = 200 ms so flicks read as sharp-then-decay
     rather than instant snaps. */
  const rawScrollVel = getHomeScrollVelocity();
  const normalisedScrollVel = Math.max(-1, Math.min(1, rawScrollVel / SCROLL_VELOCITY_REF));
  const svAlpha = 1 - Math.exp(-(dtSec * 1000) / SCROLL_VELOCITY_TAU_MS);
  _scrollVelocityFiltered += (normalisedScrollVel - _scrollVelocityFiltered) * svAlpha;
  const scrollVelActive =
    _poseBase.scrollDolly && !_prefersReducedMotionLocked && !_reducedTransparency;
  const scrollFovDelta = scrollVelActive
    ? _scrollVelocityFiltered * SCROLL_VELOCITY_FOV_GAIN
    : 0;
  const scrollLutDelta = scrollVelActive
    ? Math.abs(_scrollVelocityFiltered) * SCROLL_VELOCITY_LUT_GAIN
    : 0;

  /* FoV blend. Portrait orientations widen FoV to preserve composition;
     we keep that heuristic on top of the pose-driven base.
     P8d layers scrollFovDelta on top of both — the pose's base FOV
     determines the route framing; scroll velocity is a sub-degree
     modulation that survives the POSE_FOV_SETTLE_EPSILON gate when
     the user is actively scrolling. */
  if (camera.aspect > 0) {
    const portraitWiden = (camera.aspect < 1) ? (1 - camera.aspect) * 22 : 0;
    const nextFov = _poseBase.fov + portraitWiden + scrollFovDelta;
    if (Math.abs(camera.fov - nextFov) > POSE_FOV_SETTLE_EPSILON) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
  }

  /* LUT intensity blend. `_lutPass` is created lazily by the LUT loader
     and may be null if the asset failed to decode — in that case there's
     nothing to blend, which is the correct visual fallback (the scene
     just renders un-graded). Pillar 4f: reduced-transparency floors the
     intensity to 0 (neutral passthrough).
     P8d: scroll velocity adds a small absolute-value warmth bump, so
     scroll direction is irrelevant — both up-flicks and down-flicks
     enrich the grade identically. */
  if (_lutPass) {
    const nextIntensity = _reducedTransparency
      ? 0
      : LUT_INTENSITY_DEFAULT * _poseBase.lutMix + scrollLutDelta;
    if (Math.abs(_lutPass.intensity - nextIntensity) > POSE_LUT_SETTLE_EPSILON) {
      _lutPass.intensity = nextIntensity;
    }
  }

  /* LookAt resolution. Explicit pose target (interior routes) vs
     legacy auto-target (landing / settled auto path). The auto path's
     `camera.position.y - 0.5` keeps the horizon just below the hex
     floor line, matching the original framing exactly. */
  if (_poseBase.tx !== null && _poseBase.ty !== null && _poseBase.tz !== null) {
    camera.lookAt(_poseBase.tx, _poseBase.ty, _poseBase.tz);
  } else {
    camera.lookAt(0, camera.position.y - 0.5, 0);
  }
}

function updateEmblemSheen(time) {
  if (_emblemMats.length === 0) return;
  /* When the emblem is fully hidden there's nothing to animate; skip the
     per-frame cost entirely. During a tween _emblemT is in (0,1) and we
     still want the shimmer to scale down smoothly. */
  if (_emblemPhase === 'hidden') return;
  const t = time * 0.001;
  const slow = Math.sin(t * 0.4) * 0.5 + 0.5;
  const fast = Math.sin(t * 1.1 + 1.8) * 0.5 + 0.5;
  const pulse = slow * 0.7 + fast * 0.3;
  const fadeScale = _emblemT;

  const emissiveScale = (1.0 + pulse * 0.24) * fadeScale;
  for (const mat of _emblemMats) {
    mat.emissiveIntensity = 1.8 * emissiveScale;
  }

  for (let i = 0; i < _emblemLights.length; i++) {
    _emblemLights[i].intensity = _emblemLightBaseIntensities[i] * (1.0 + pulse * 0.20) * fadeScale;
  }
}

/** Advances the scene materialization — hex grid, floating geometry, and
 *  planter entrance tweens. Called every frame from animateStep. */
function tickSceneMaterialize(timestamp) {
  if (!_sceneMaterializeActive) return;

  const elapsed = timestamp - _sceneMaterializeStartMs;
  let allDone = true;

  /* --- Hex grid line fade-in --- */
  if (_hexLineMat) {
    const hexElapsed = elapsed - SCENE_MAT_HEX_DELAY_MS;
    if (hexElapsed >= 0) {
      const hexT = Math.min(hexElapsed / SCENE_MAT_HEX_DURATION_MS, 1.0);
      const hexEased = 1 - Math.pow(1 - hexT, 2);
      _hexLineMat.opacity = HEX_OPACITY_FINAL * hexEased;
      if (hexT < 1) allDone = false;
    } else {
      allDone = false;
    }
  }

  /* --- Floating geometry staggered fade-in --- */
  for (let i = 0; i < floatingObjects.length; i++) {
    const obj = floatingObjects[i];
    const targets = obj.userData._matTargets;
    if (!targets) continue;

    const objDelay = SCENE_MAT_FLOAT_DELAY_MS + i * SCENE_MAT_FLOAT_STAGGER_MS;
    const objElapsed = elapsed - objDelay;

    if (objElapsed < 0) {
      allDone = false;
      continue;
    }

    const t = Math.min(objElapsed / SCENE_MAT_FLOAT_DURATION_MS, 1.0);
    if (t < 1) allDone = false;

    const eased = 1 - Math.pow(1 - t, 2.5);
    for (const entry of targets) {
      entry.mat.opacity = entry.targetOpacity * eased;
      if (t >= 1 && !entry.mat._matDone) {
        entry.mat.opacity = entry.targetOpacity;
        if (entry.targetOpacity >= 1) entry.mat.transparent = false;
        entry.mat.needsUpdate = true;
        entry.mat._matDone = true;
      }
    }
  }

  /* --- Planter entrance tweens --- */
  for (let i = _planterEntrances.length - 1; i >= 0; i--) {
    const pe = _planterEntrances[i];
    const peElapsed = timestamp - pe.startMs;
    const t = Math.min(peElapsed / SCENE_MAT_PLANTER_DURATION_MS, 1.0);
    const eased = 1 - Math.pow(1 - t, 3);

    const currentScale = pe.targetScale * (0.93 + 0.07 * eased);
    pe.model.scale.setScalar(currentScale);

    for (const entry of pe.mats) {
      entry.mat.opacity = entry.targetOpacity * eased;
    }

    if (t >= 1) {
      pe.model.scale.setScalar(pe.targetScale);
      for (const entry of pe.mats) {
        entry.mat.opacity = entry.targetOpacity;
        if (entry.targetOpacity >= 1) entry.mat.transparent = false;
        entry.mat.needsUpdate = true;
      }
      _planterEntrances.splice(i, 1);
    } else {
      allDone = false;
    }
  }

  if (allDone && _planterEntrances.length === 0) {
    _sceneMaterializeActive = false;
  }
}

function updateObjects(time, dtSec) {
  const tick = REFERENCE_LOBBY_TICK_HZ * dtSec;
  floatingObjects.forEach(obj => {
    const ud = obj.userData;
    obj.rotation.x += ud.rotSpeed.x * tick;
    obj.rotation.y += ud.rotSpeed.y * tick;
    obj.rotation.z += ud.rotSpeed.z * tick;
    ud.bobPhase += ud.bobSpeed * tick;
    obj.position.y = ud.baseY + Math.sin(ud.bobPhase) * ud.bobAmp;
  });

  updateDustParticles(time);
  updateEmblemSheen(time);
}

/**
 * Unified-ticker step function. Called by main-ticker each rAF with a
 * clamped dtSec — no per-module lastFrameTime tracking, no self-rAF.
 * Pause / resume on tab visibility is managed upstream by the ticker.
 */
function animateStep(timestamp, dtSec) {
  if (!renderer || !scene || !camera) return;
  if (_sceneStartTime === 0) _sceneStartTime = timestamp;

  /* dt is already clamped by main-ticker (max 100 ms). The first frame has
     dt=0 by design; smoothAlphaFromRef(ref, 0) returns 0 so no smoothing
     is applied — scene simply renders at its current state. That's the
     correct boot behaviour; do NOT early-return or the canvas would stay
     unrendered for one extra frame. */

  const nextScrollProgress = getDocumentScrollProgress();
  if (Math.abs(nextScrollProgress - _lastScrollForDirty) > SCROLL_DELTA_EPSILON) {
    /* User is scrolling (or the document relayout shifted progress).
       Grant a render credit ONLY when the active pose uses scroll to
       drive the camera (landing). On pose-locked interior routes the
       lobby is a static backdrop — scroll is purely reading the HTML
       content, so forcing a composer.render() on every delta would
       waste GPU cycles without changing the rendered pixels.
       The arbitrator's 24 fps floor still keeps subtle motion (object
       bob) alive. Polling inside the ticker instead of a scroll
       listener guarantees every sampled delta is honoured exactly
       once regardless of event coalescing. */
    if (_poseBase.scrollDolly) markDirty('scroll');
    _lastScrollForDirty = nextScrollProgress;
    /* Round-3 P8c — scroll is user input for the idle-breathing
       envelope even on pose-locked routes (no dirty render, but the
       envelope still resets so the next floor frame drops the bob). */
    markUserInput(timestamp);
  }
  scrollProgress = nextScrollProgress;

  const am = smoothAlphaFromRef(
    isMobile ? MOUSE_SMOOTH_ALPHA_REF_MOBILE : MOUSE_SMOOTH_ALPHA_REF,
    dtSec,
  );
  mouseX += (targetMouseX - mouseX) * am;

  /* Pose tween must advance before the camera lerp: updateCamera reads
     `_poseBase` as its anchor, so a stale base would lag the tween by
     one frame and dilute the ease-in-out at either end. */
  updatePoseTween(timestamp);
  updateCamera(dtSec);
  tickSceneMaterialize(timestamp);
  tickEmblemFade(timestamp);
  updateObjects(timestamp, dtSec);

  /* Boot transition (Round 2026 — CSS-driven).
     The chromatic-aberration / scan-line / exposure shader pass that
     used to ride here is gone; its visual layer is now a CSS contrast()
     fade keyed off the `data-lobby-boot` attribute on <html> (set in
     initScene, cleared at the end of this window). What remains here
     is the bloom-strength ramp from "hot" → "calm" — a single uniform
     write per rendered frame, essentially free, and the visible cue
     that ties the in-shader bloom to the out-of-shader fade. We also
     no longer call markDirty('boot-transition') every frame: the
     dirty-flag arbitrator's 24 fps floor keeps the bloom ramp
     perceptually smooth without forcing every frame through the full
     post-processing chain during the page's busiest window. */
  if (_bootTransitionActive) {
    const elapsed = timestamp - _bootTransitionStartMs;
    const rawT = Math.min(elapsed / BOOT_TRANSITION_MS, 1.0);
    const t = 1.0 - Math.pow(1.0 - rawT, 3);

    if (_bloomPass) {
      const calmBloom = isMobile ? BOOT_BLOOM_STRENGTH_CALM_MOBILE : BOOT_BLOOM_STRENGTH_CALM_DESKTOP;
      _bloomPass.strength = BOOT_BLOOM_STRENGTH_HOT + (calmBloom - BOOT_BLOOM_STRENGTH_HOT) * t;
    }

    if (rawT >= 1.0) {
      _bootTransitionActive = false;
      if (_bloomPass) {
        _bloomPass.strength = isMobile ? BOOT_BLOOM_STRENGTH_CALM_MOBILE : BOOT_BLOOM_STRENGTH_CALM_DESKTOP;
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-lobby-boot', 'calm');
      }
      document.dispatchEvent(new CustomEvent('sarif:lobby-settled'));
    }
  }

  /* Dirty-flag arbitrator (lobby-render-budget.js) decides whether this
     frame earns a composer.render(). Per-frame math above always runs so
     scene state stays coherent; only the expensive GPU work is gated.
     The arbitrator guarantees a render at least every 1000/24 ms via its
     safety floor, so slow animations (floating-geometry bob, camera
     settle) never visibly freeze even without a continuous source. */
  if (shouldRender()) {
    if (composer) composer.render();
    else renderer.render(scene, camera);
    onRendered();

    /* First rendered frame — lift the reveal veil and start text decode.
       This fires once per lobby lifetime (reset by cleanup). The event
       is the single synchronisation point for all startup-sequence
       consumers; it supersedes the old DOMContentLoaded-triggered decode
       start so everything arrives in one coordinated moment. */
    if (!_firstFrameDispatched) {
      _firstFrameDispatched = true;
      document.dispatchEvent(new CustomEvent('sarif:first-frame', {
        detail: { timestamp },
      }));
    }
  }
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------
let _gyroActive = false;

function onDeviceOrientation(e) {
  if (e.gamma == null) return;
  const gamma = Math.max(-30, Math.min(30, e.gamma));
  targetMouseX = (gamma / 30) * 0.06;
  markDirty('orientation');
}

function initGyroParallax() {
  if (!isMobile || !('DeviceOrientationEvent' in window)) return;

  const attach = () => {
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    _gyroActive = true;
  };

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const trigger = () => {
      DeviceOrientationEvent.requestPermission()
        .then((state) => { if (state === 'granted') attach(); })
        .catch(() => {});
    };
    document.addEventListener('touchstart', trigger, { once: true, passive: true });
  } else {
    attach();
  }
}

let _lastPointerDirtyTime = 0;
const POINTER_DIRTY_INTERVAL_MS = 16; // ~60 Hz cap on markDirty from pointer

function onMouseMove(e) {
  if (_gyroActive) return;
  targetMouseX = (e.clientX / window.innerWidth - 0.5) * 0.08;
  const now = performance.now();
  if (now - _lastPointerDirtyTime >= POINTER_DIRTY_INTERVAL_MS) {
    _lastPointerDirtyTime = now;
    markDirty('mouse');
  }
  markUserInput();
}

/** pointerrawupdate fires at the device's raw polling rate (up to 1000 Hz
 *  on gaming mice) before browser coalescing. Shaves the 1–2 frame latency
 *  that `mousemove` eats on 120 Hz+ pointers, which is visible as a subtle
 *  camera-lag on high-refresh-rate displays. Mouse pointers drive both
 *  parallax and the idle clock; touch / pen pointers are parallax-exempt
 *  (gyro handles that surface) but *still* reset the idle breathing
 *  envelope — a tap-heavy mobile session should never read as "idle". */
function onPointerRawUpdate(e) {
  if (_gyroActive) return;
  if (e.pointerType && e.pointerType !== 'mouse') {
    /* Non-mouse: skip parallax, still record user activity. Without
       this, a user scrolling/tapping a mobile page would accumulate
       idle time because mousemove/pointerrawupdate are mouse-gated
       and keydown doesn't fire for touch. The result was the idle
       breath envelope attacking during active reading sessions. */
    markUserInput();
    return;
  }
  targetMouseX = (e.clientX / window.innerWidth - 0.5) * 0.08;
  const now = performance.now();
  if (now - _lastPointerDirtyTime >= POINTER_DIRTY_INTERVAL_MS) {
    _lastPointerDirtyTime = now;
    markDirty('mouse');
  }
  markUserInput();
}

/** P8c — Any keystroke is user activity. Capture phase so nested
 *  focus-trap handlers can't stopPropagation us into idle-breath
 *  continuing during e.g. palette typing. No markDirty — the existing
 *  subsystems already dirty-flag when keyboard navigation moves focus
 *  into a visible element. */
function onKeydown() {
  markUserInput();
}

/** Feature-detect pointerrawupdate support. Chromium reflects unknown event
 *  names as undefined on window, so `'onpointerrawupdate' in window` is the
 *  canonical positive test. Safari and Firefox currently return false,
 *  which routes them to the mousemove fallback. */
const SUPPORTS_POINTER_RAW_UPDATE =
  typeof window !== 'undefined' && 'onpointerrawupdate' in window;

function onResize() {
  if (!renderer || !camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const wasMobile = isMobile;
  isMobile = w < MOBILE_BREAKPOINT;

  camera.aspect = w / h;
  /* Use the active pose's FoV as the base on resize so a portrait↔
     landscape flip on an interior route doesn't momentarily snap the
     FoV back to the landing value. updateCamera will continue to
     refine this on subsequent frames if a tween is in flight. */
  const baseFovResize = _poseBase.fov;
  camera.fov = (w / h < 1) ? baseFovResize + (1 - w / h) * 22 : baseFovResize;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(resolveLobbyPixelRatio(w, h, isMobile));

  if (composer) composer.setSize(w, h);

  /* LineMaterial needs explicit viewport dimensions in CSS pixels to keep
     its screen-space linewidth stable across resizes / DPR changes. */
  if (_hexLineMat) _hexLineMat.resolution.set(w, h);

  /* Projection matrix + composer buffers changed; force a multi-frame
     render credit so the new target sizes settle on-screen before the
     dirty-flag arbitrator resumes skipping. */
  markDirty('resize');

  if (wasMobile !== isMobile) {
    cleanup();
    initLobby();
  }
  /* scrollProgress is read every frame by animateStep(), so no explicit nudge
     here — next ticker frame will recalibrate automatically. */
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
/* Persistence model: the canvas is authored in Base.astro with
   transition:persist, and the WebGL context survives across ClientRouter
   swaps. We only truly tear down on real page unload or GPU context loss.
   astro:after-swap fires after the new page DOM is in place; we use it to
   sync route-dependent state (emblem visibility). */
let _lifecycleHooksAttached = false;
/** Tracks the user's motion preference. Historically this was locked on
 *  first init to avoid flicker, but Round-3 audit §3.1 requires live
 *  response to OS preference toggles. We now treat a *change* as the
 *  only trigger for a teardown+reinit (see {@link onLiveReducedMotion}):
 *  passive reads inside the scene (section observer, pose snap path,
 *  SVG fallback reassert) keep honouring this value frame to frame
 *  without introducing mid-frame flicker. */
let _prefersReducedMotionLocked = null;
/** Pending post-context-loss re-init handle so we don't double-schedule. */
let _contextLossReinitScheduled = false;

/**
 * Pillar 4f — prefers-reduced-transparency.
 *
 * Distinct from prefers-reduced-motion: a user can be motion-tolerant but
 * parallax-sensitive (e.g. vestibular-adjacent disorders triggered by
 * depth cues rather than explicit motion). When this flag is live we:
 *   - zero the mouse-X parallax overlay (MOUSE_PARALLAX_GAIN → 0)
 *   - floor LUTPass intensity to 0 (neutral passthrough)
 *   - snap FOV to the destination on route change (no tween)
 * Positional pose tweens still run so routes still read as distinct
 * rooms; only the secondary intensity cues are suppressed.
 *
 * Updated live via a MediaQueryList listener: the AbortController is
 * aborted in cleanup() so cold bfcache-restore re-attaches cleanly.
 */
let _reducedTransparency = false;
let _reducedTransparencyMql = null;
let _reducedTransparencyController = null;

function attachReducedTransparencyListener() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  if (_reducedTransparencyMql) return;
  let mql;
  try {
    mql = window.matchMedia('(prefers-reduced-transparency: reduce)');
  } catch {
    /* Older Safari (<17) will throw or return a bogus MediaQueryList for
       this unsupported query — treat as "not set" and move on. */
    return;
  }
  _reducedTransparency = !!mql.matches;
  _reducedTransparencyController = new AbortController();
  _reducedTransparencyMql = mql;
  const handle = (ev) => {
    _reducedTransparency = !!ev.matches;
    /* Force a composite because LUT intensity / parallax settlement
       are all dirty-gated; without an explicit mark the new state
       could sit for a frame before anything drove a render. */
    markDirty('reduced-transparency');
    /* Snap LUT intensity immediately when transitioning INTO
       reduced-transparency so users don't wait for the blend to settle. */
    if (_reducedTransparency && _lutPass) {
      _lutPass.intensity = 0;
    }
  };
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handle, { signal: _reducedTransparencyController.signal });
  } else if (typeof mql.addListener === 'function') {
    /* Safari <14 legacy path: no AbortSignal support; detachment in
       cleanup() calls removeListener explicitly. */
    mql.addListener(handle);
    _reducedTransparencyMql._legacyHandle = handle;
  }
}

function detachReducedTransparencyListener() {
  if (_reducedTransparencyController) {
    _reducedTransparencyController.abort();
    _reducedTransparencyController = null;
  }
  if (_reducedTransparencyMql && _reducedTransparencyMql._legacyHandle) {
    try { _reducedTransparencyMql.removeListener(_reducedTransparencyMql._legacyHandle); } catch { /* noop */ }
    delete _reducedTransparencyMql._legacyHandle;
  }
  _reducedTransparencyMql = null;
}

function ensureLifecycleHooks() {
  if (_lifecycleHooksAttached) return;
  _lifecycleHooksAttached = true;

  /* True teardown only on document unload. `pagehide` is the bfcache-
     friendly unload signal and fires on every navigation and tab close
     modern browsers expose; `beforeunload` is unreliable (Safari skips
     it on swipe-back; Chrome discourages it for bfcache). Using both
     was redundant teardown — keep pagehide alone. webglcontextlost
     (wired below) handles the GPU-crash path. */
  window.addEventListener('pagehide', cleanup);

  /* bfcache restore path — pagehide already ran cleanup(), so the canvas is
     still in the DOM (persistent) but the renderer/scene are torn down. When
     the user hits back from an external site, re-init transparently. Only
     runs for persisted=true; cold loads are driven by the astro:page-load
     handler in user-scripts. */
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && !renderer) initLobby();
    else if (event.persisted) markDirty('resume');
  });

  /* ClientRouter route change — sync emblem visibility to new pathname.
     The canvas stays mounted; no teardown, no reinit, no flash. */
  document.addEventListener('astro:after-swap', () => {
    onRouteChange(window.location.pathname);
  });

  /* Round-3 P8a — Pose memory snapshot triggers.
     Capture the current pose at every point where the user could be
     about to leave this document or this tab:
       · astro:before-swap fires on ClientRouter navigations. Snapshot
         here so an MPA fallback (or a subsequent full reload) starts
         with the pose the user had mid-swap.
       · visibilitychange=hidden covers tab switches, minimise, OS
         app-switch on mobile. Users who return via back/forward to a
         new document load get continuity even if the page was backgrounded.
       · pagehide is already wired to cleanup(); writing on pagehide
         additionally catches hard reload + close-and-reopen within the
         tab's session lifetime.
     All writes are cheap (JSON.stringify of ~10 numbers, < 200 bytes). */
  document.addEventListener('astro:before-swap', writePoseMemory);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writePoseMemory();
  });
  window.addEventListener('pagehide', writePoseMemory);

  /* Round-3 §3.1 — live prefers-reduced-motion. Flip between the full
     Three.js scene and the static SVG fallback when the user toggles
     the OS preference mid-session. subscribeReducedMotion invokes the
     callback immediately with the current value; we skip that initial
     call (first-init path handles it via the inline matchMedia read
     below) and only act on genuine transitions. */
  subscribeReducedMotion(onLiveReducedMotion);
}

/**
 * Live callback for prefers-reduced-motion transitions.
 *
 * Rationale: the WebGL pipeline and the static fallback are mutually
 * exclusive (one owns the canvas, the other owns an SVG sibling). On a
 * genuine flip we tear down whichever branch is live and re-init the
 * other. No-ops when the preference is unchanged, which covers the
 * unconditional initial invocation from subscribeReducedMotion.
 *
 * @param {boolean} reduced
 */
function onLiveReducedMotion(reduced) {
  if (_prefersReducedMotionLocked === null) {
    /* First subscription tick before initLobby ran. Let initLobby seed
       the lock from the same helper — we don't want to guess here. */
    return;
  }
  if (reduced === _prefersReducedMotionLocked) return;
  /* Persist the user's current pose before the teardown so the reinit
     (even in the static-fallback branch) resumes at the same camera
     anchor the user had. writePoseMemory is cheap and idempotent. */
  try {
    writePoseMemory();
  } catch {
    /* pose memory is best-effort — never block a cleanup on it. */
  }
  _prefersReducedMotionLocked = reduced;
  cleanup();
  initLobby();
}

let _contextLossHandlersAttached = false;
function attachContextLossHandlers(canvas) {
  /* Attach once per document. The canvas is a persistent DOM element so a
     single listener outlives any number of init/cleanup cycles. Repeated
     attach would stack listeners and multiply the recovery work. */
  if (_contextLossHandlersAttached) return;
  _contextLossHandlersAttached = true;
  /* A persistent WebGL context will eventually hit webglcontextlost on some
     devices (GPU reset, driver timeout). Recovery path: tear down fully,
     then schedule a re-init on the next rAF so the browser has time to
     release and restore the underlying context. */
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    if (_contextLossReinitScheduled) return;
    _contextLossReinitScheduled = true;
    cleanup();
    requestAnimationFrame(() => {
      _contextLossReinitScheduled = false;
      initLobby();
      /* Recovery draws need a couple of guaranteed frames to commit new
         materials / PMREM targets before the arbitrator begins skipping. */
      markDirty('contextLoss');
    });
  });
}

/**
 * Pillar 5 — scroll-linked section cinematography.
 *
 * Any interior section can opt into a camera sub-beat by annotating
 * the element with either:
 *   - data-lobby-subpose="<key>"  (keyed delta in ROUTE_SUBPOSES)
 *   - data-lobby-beat="<dx>,<dy>,<dz>,<dfov>,<dlut>"  (inline deltas)
 *
 * The observer watches all such elements inside <main id="main-content">.
 * As sections enter the centre band of the viewport, they push onto a
 * stack; leaving the band pops them. The top-of-stack element defines
 * the current sub-pose (or the anchor pose when the stack is empty).
 *
 * Lifecycle:
 *   - initSectionObserver() is called from onRouteChange(), after the
 *     anchor pose has been resolved, with the up-to-date anchor.
 *   - teardownSectionObserver() disconnects the observer and drops
 *     stack state; invoked from onRouteChange() before re-creating it,
 *     and from cleanup() for true teardown.
 */
let _sectionObserver = null;
/** Stack of active elements (most-recently-entered at the end). */
const _activeSectionStack = [];
/** Anchor pose captured at observer-init time. Used to compose
 *  sub-poses without re-resolving the pathname on every intersection. */
let _sectionAnchorPose = null;
/** The pose currently applied by sub-beat logic; null means "holding
 *  the anchor pose". Tracked so we can skip redundant tween re-targets
 *  when the observer fires with no state change (e.g. scroll within
 *  one section emits repeated IntersectionObserverEntry events in some
 *  browsers). */
let _currentSubposeId = null;

function teardownSectionObserver() {
  if (_sectionObserver) {
    _sectionObserver.disconnect();
    _sectionObserver = null;
  }
  _activeSectionStack.length = 0;
  _sectionAnchorPose = null;
  _currentSubposeId = null;
}

function applyActiveSectionPose() {
  /* Top of stack wins; falls back to the anchor when empty. This is
     called after every entry change. Sub-beats never fire while a
     route-level tween is in-flight (prevents audible stutter on
     rapid-navigate-then-scroll); we just let the route tween settle
     first and the next IntersectionObserverEntry will re-apply. */
  const anchor = _sectionAnchorPose;
  if (!anchor) return;

  const top = _activeSectionStack.length > 0
    ? _activeSectionStack[_activeSectionStack.length - 1]
    : null;

  let nextPose = anchor;
  if (top) {
    const sub = resolveSubpose(anchor, top);
    if (sub) nextPose = sub;
  }

  /* Skip re-targeting if nothing changed. `id` on the composed sub-pose
     bakes in the anchor id + the subpose key / 'beat', so two identical
     sub-beats in a row are idempotent. */
  const nextId = nextPose === anchor ? `${anchor.id}:anchor` : nextPose.id;
  if (_currentSubposeId === nextId) return;
  _currentSubposeId = nextId;

  startPoseTween(nextPose, SUBPOSE_TWEEN_MS);
}

function initSectionObserver(pathname) {
  teardownSectionObserver();

  /* Only interior routes run section beats. Landing page already uses
     scrollProgress to drive the dolly; layering sub-beats on top would
     fight the existing contract. */
  if (isLandingPathForString(pathname)) return;

  /* Reduced-motion: skip the observer entirely. A sub-pose change under
     reduced motion is applied as an instant snap (see startPoseTween);
     letting scroll trigger snaps turns every scroll movement into a
     discrete camera jump, which is strictly more motion-noise than the
     baseline static pose these users expect. Route-level pose snaps
     (one per navigation) remain — that's a discrete event at a user-
     initiated boundary, not scroll-coupled. */
  if (_prefersReducedMotionLocked) return;

  /* IntersectionObserver isn't always available on ancient WebViews;
     the section beats are a polish layer, so silently degrade. */
  if (typeof IntersectionObserver === 'undefined' || typeof document === 'undefined') return;

  const main = document.getElementById('main-content') || document.querySelector('main');
  if (!main) return;

  const candidates = main.querySelectorAll('[data-lobby-beat], [data-lobby-subpose]');
  if (candidates.length === 0) return;

  _sectionAnchorPose = resolvePose(pathname, { isMobile: _useMobilePoses });

  _sectionObserver = new IntersectionObserver(
    (entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target;
        const idx = _activeSectionStack.indexOf(el);
        if (entry.isIntersecting) {
          /* Push to top-of-stack. If already present, promote by
             removing and re-appending — this makes the "most recently
             entered" rule correct even when two sections share the
             hysteresis band briefly. */
          if (idx !== -1) _activeSectionStack.splice(idx, 1);
          _activeSectionStack.push(el);
          changed = true;
        } else if (idx !== -1) {
          _activeSectionStack.splice(idx, 1);
          changed = true;
        }
      }
      if (changed) applyActiveSectionPose();
    },
    {
      threshold: SECTION_OBSERVER_THRESHOLD,
      rootMargin: SECTION_OBSERVER_ROOT_MARGIN,
    },
  );

  for (const el of candidates) {
    _sectionObserver.observe(el);
  }
}

/** Called on first init and on every astro:after-swap. Idempotent. */
function onRouteChange(pathname) {
  const landing = isLandingPathForString(pathname);
  /* _isLanding drives the dust-particle emergence-from-emblem animation
     branch inside updateDustParticles. Returning to the landing route
     replays that emergence; leaving it reverts dust to ambient drift. */
  if (landing && !_isLanding) {
    /* Re-arm the dust emergence timeline by rebasing _sceneStartTime. */
    _sceneStartTime = 0;
  }
  _isLanding = landing;
  setEmblemTarget(landing);
  /* Pillar 3 — resolve the route to its pose and start the camera
     tween. `resolvePose` is defensive against unknown routes (falls
     back to a quiet interior pose); reduced-motion is handled inside
     startPoseTween (it snaps instead of animating). Round 5: honour
     the per-pose `tweenMs` override so dramatic framings (praxis
     low-hero, lexicon overhead) can take longer than the 900ms
     default — a 5-unit Z dolly in 900ms reads as rushed. */
  const nextPose = resolvePose(pathname, { isMobile: _useMobilePoses });
  startPoseTween(nextPose, nextPose.tweenMs ?? ROUTE_TWEEN_MS);
  /* Pillar 5 — rebuild the section observer against the new route's
     anchor pose. teardown-then-reinit ensures zero leaks across N
     navigations; see initSectionObserver for the stack/hysteresis
     contract. Runs AFTER the anchor tween starts so the observer's
     anchor snapshot matches what the camera is heading toward. */
  initSectionObserver(pathname);
  /* Emblem fade tween and the per-route camera dolly need guaranteed
     frames across the transition — grant a dirty credit that the
     continuous sources will carry forward while _emblemPhase is
     fadingIn/fadingOut or _poseTween.active is true. */
  markDirty('route');
  if (landing) {
    /* Tall landing page: planter prefetch stays landing-only, and the
       emblem preload hint is only useful when we're actually about to
       render the emblem. Hints are idempotent (dedup on rel+href). */
    prefetchPlanterAssets();
  }
  /* scrollProgress is read every frame by animateStep(); on route change the
     next ticker frame recalibrates against the new document layout without
     any explicit nudge. */

  /* Reduced-motion / no-WebGL users rely on the SVG fallback. It's injected
     directly into <body>, so Astro's ClientRouter diff removes it on the
     first swap. Re-assert after every route change (createStaticFallback is
     idempotent). */
  if (_prefersReducedMotionLocked && !renderer) {
    createStaticFallback();
  }
}

function isLandingPathForString(pathname) {
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  return p === '/';
}

function cleanup() {
  _lobbySession++;
  _firstFrameDispatched = false;
  /* Dirty-flag arbitrator holds predicates that closure-capture the
     disposed scene/camera; wipe them before the traversal below tears
     those objects down, so a later ticker frame cannot evaluate a
     predicate against freed GL resources. */
  resetRenderBudget();
  _lastScrollForDirty = 0;
  if (_sceneTickerToken) {
    tickerUnsubscribe(_sceneTickerToken);
    _sceneTickerToken = null;
  }
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('pointerrawupdate', onPointerRawUpdate);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('keydown', onKeydown, { capture: true });
  window.removeEventListener('deviceorientation', onDeviceOrientation);
  _gyroActive = false;
  _idleBreathEnvelope = 0;
  _lastInputTs = 0;

  detachReducedTransparencyListener();
  teardownSectionObserver();

  for (const ref of _reflectors) { ref.dispose(); }
  _reflectors.length = 0;
  floatingObjects.length = 0;
  dustData.length = 0;
  _dustMesh = null;
  _sceneStartTime = 0;
  /* The material itself is disposed by the scene.traverse sweep below; just
     drop the module-level handle so a post-cleanup resize doesn't touch a
     disposed GL resource. */
  _hexLineMat = null;
  _logoGroup = null;
  _emblemMats.length = 0;
  _emblemLights.length = 0;
  _emblemLightBaseIntensities.length = 0;
  _emblemSceneLights.length = 0;
  _emblemSceneLightBaseIntensities.length = 0;
  _logoAssetsLoaded = false;
  _isLanding = false;
  _totalLoadBytes = 0;
  _loadedBytes = 0;

  if (composer) { composer.dispose(); composer = null; }
  /* Pillar 2 GPU resources: the PMREM env target and the LUT Data3DTexture
     are owned here (scene.environment and _lutPass reference them), so we
     dispose explicitly before the renderer goes away. Passes themselves
     are disposed by composer.dispose(). */
  if (_activeEnvRT) { _activeEnvRT.dispose(); _activeEnvRT = null; }
  if (_activeLutTex) { _activeLutTex.dispose(); _activeLutTex = null; }
  _lutPass = null;
  _bloomPass = null;
  _bootTransitionActive = false;
  _sceneMaterializeActive = false;
  _bootLandingInit = false;
  _planterEntrances = [];
  /* Round 2026 — also clear the CSS-driven boot attribute so a
     subsequent re-init starts from a known state. The renderer will
     re-set it inside initScene per the route's needs. */
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-lobby-boot');
  }
  /* Pillar 3 — reset the pose tween so a post-cleanup ticker frame
     (e.g. WebGL context-loss → re-init sequence) doesn't try to lerp
     against values captured against a freed camera. The next initLobby
     will snap _poseBase to the current URL's pose. */
  _poseTween.active = false;
  _poseBase.scrollDolly = true;
  _poseBase.tx = _poseBase.ty = _poseBase.tz = null;
  if (renderer) { renderer.dispose(); renderer = null; }
  camera = null;
  if (scene) {
    const disposeMat = (m) => {
      if (!m) return;
      const texProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'];
      for (const p of texProps) { if (m[p]) m[p].dispose(); }
      m.dispose();
    };
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(disposeMat);
        else disposeMat(obj.material);
      }
    });
    scene = null;
  }

  const fallback = document.getElementById('lobby-fallback');
  if (fallback) fallback.remove();
}

export function initLobby() {
  if (renderer) {
    // Already initialized; just sync route-dependent state (emblem visibility).
    onRouteChange(window.location.pathname);
    return;
  }

  ensureLifecycleHooks();

  injectPreloadHints();

  /* Reduced-motion seed. Round-3 §3.1 makes this live via the shared
     subscribeReducedMotion helper (wired in ensureLifecycleHooks); the
     first-init value comes from the same global matchMedia the helper
     uses. The live callback is the only writer after this point. */
  if (_prefersReducedMotionLocked === null) {
    _prefersReducedMotionLocked = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  const prefersReduced = _prefersReducedMotionLocked;

  const canvas = document.getElementById('lobby-canvas');
  if (!canvas) {
    /* Base.astro authors the canvas as a persistent element; if it's missing
       the layout contract is broken. Bail gracefully rather than mounting a
       non-persistent replacement that would flash on the first swap. */
    return;
  }

  if (prefersReduced) {
    canvas.style.display = 'none';
    createStaticFallback();
    return;
  }

  /* A previous init may have hidden the canvas for the reduced-motion
     or no-WebGL branch. Clear it so a live-toggle back to motion-on
     restores the GL path on the same element. */
  canvas.style.removeProperty('display');

  const testCanvas = document.createElement('canvas');
  const testCtx = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
  if (!testCtx) {
    canvas.style.display = 'none';
    createStaticFallback();
    return;
  }
  /* Release the probe context before WebGLRenderer allocates the real one.
     Some drivers enforce a low max-context limit; holding a throwaway
     context can make the lobby fail in standalone browsers while a lean
     embedded preview still succeeds. */
  const loseProbe = testCtx.getExtension('WEBGL_lose_context');
  if (loseProbe) loseProbe.loseContext();
  testCanvas.width = 0;
  testCanvas.height = 0;

  attachContextLossHandlers(canvas);
  attachReducedTransparencyListener();

  isMobile = window.innerWidth < MOBILE_BREAKPOINT;
  try {
    initScene(canvas);
  } catch (err) {
    if (import.meta.env.DEV && typeof console !== 'undefined' && console.error) {
      console.error('[lobby-scene] WebGL scene init failed', err);
    }
    cleanup();
    canvas.style.display = 'none';
    createStaticFallback();
    return;
  }

  /* Prefer the lower-latency pointerrawupdate where the platform exposes
     it; fall back to mousemove (which is everywhere). Exactly one of the
     two is attached to avoid duplicate per-event work. */
  if (SUPPORTS_POINTER_RAW_UPDATE) {
    window.addEventListener('pointerrawupdate', onPointerRawUpdate, { passive: true });
  } else {
    window.addEventListener('mousemove', onMouseMove, { passive: true });
  }
  window.addEventListener('resize', onResize, { passive: true });
  /* Round-3 P8c — keydown resets the idle-breathing envelope. Mouse /
     scroll are already covered by onMouseMove / onPointerRawUpdate /
     animateStep's scroll-delta branch. Capture phase + passive so we
     observe without interfering with anything else on the page. */
  window.addEventListener('keydown', onKeydown, { passive: true, capture: true });
  /* Seed the input timestamp so the onset clock starts at init instead
     of 1970. Otherwise `now - 0` would instantly trip the idle path
     and the camera would be breathing before the user has settled. */
  _lastInputTs = performance.now();
  /* No scroll listener: animateStep() reads getDocumentScrollProgress() every
     frame from the unified ticker, which supersedes both the window.scroll
     listener and the visualViewport/ResizeObserver subscription the module
     used to carry. One read per frame is the minimum required, and scroll
     events would only drive additional redundant reads. */

  initGyroParallax();

  /* First-init emblem state. When the scene materialization is active,
     the emblem starts hidden and fades in after a delay so it appears
     AFTER the floor/geometry begin assembling — the seal on the
     composition. On interior routes or reduced-motion, snap immediately. */
  const startingOnLanding = isLandingPathForString(window.location.pathname);
  const emblemDelayed = startingOnLanding && !_prefersReducedMotionLocked;
  _emblemTargetVisible = emblemDelayed ? false : startingOnLanding;
  _emblemPhase = emblemDelayed ? 'hidden' : (startingOnLanding ? 'visible' : 'hidden');
  _emblemT = emblemDelayed ? 0 : (startingOnLanding ? 1 : 0);
  _emblemPhaseStart = 0;
  applyEmblemT();

  if (emblemDelayed) {
    const bootSession = _lobbySession;
    setTimeout(() => {
      if (_lobbySession !== bootSession) return;
      setEmblemTarget(true);
      markDirty('emblem-materialize');
    }, SCENE_MAT_EMBLEM_DELAY_MS);
  }
  /* Also sync _isLanding (used by dust particle emergence animation) and
     landing-only preload hints. */
  _isLanding = startingOnLanding;
  if (startingOnLanding) {
    /* Kick off the emblem GLB + text rasterisation now so the hero is ready
       on first paint. setEmblemTarget didn't fire a load here because the
       target matches the snapped state. */
    ensureLogoAssetsLoaded();
    prefetchPlanterAssets();
  }

  /* Register continuous dirty sources for motion that's always driving
     visible pixels while certain conditions hold:
       - emblem phase != 'hidden' → fade tween or sheen pulse is live
       - _isLanding → dust emergence / drift is strongly animated
       - camera lerp residual above epsilon → mouse / scroll / route
         tween has left a sub-settled target the next frame must chase
     Objects' slow bob rides the arbitrator's min-fps floor (24 fps);
     the projected per-frame bob delta at that rate is well below 1 px,
     so registering it explicitly would defeat the whole arbitrator. */
  registerContinuousSource(() => _emblemPhase !== 'hidden');
  registerContinuousSource(() => _isLanding === true);
  registerContinuousSource(() => _bootTransitionActive || _sceneMaterializeActive || _planterEntrances.length > 0);
  registerContinuousSource(cameraLerpResidualDirty);
  /* Pillar 3 — keep rendering while a route pose tween is in flight,
     even when mouse / scroll / emblem are all idle (pure camera-only
     transitions still need per-frame pixels). */
  registerContinuousSource(poseTweenDirty);

  /* Boot credit guarantees the first composed frame lands regardless of
     predicate state — avoids a one-frame black flash on cold init. */
  markDirty('boot');
  _lastScrollForDirty = 0;

  document.dispatchEvent(new CustomEvent('sarif:lobby-ready', {
    detail: { cached: _lobbySession > 1, bootTransition: _bootTransitionActive },
  }));

  /* Pre-warm all shader variants before starting the render loop. Uses
     KHR_parallel_shader_compile on a background thread so the main thread
     is not blocked. The veil still covers the canvas during this window, so
     compile time is invisible. Once complete, the ticker starts and the
     first render fires — ensuring every shader is resident before any camera
     move that would otherwise trigger an on-demand compile stall. */
  const sessionAtCompile = _lobbySession;
  renderer.compileAsync(scene, camera).catch(() => {}).then(() => {
    if (_lobbySession !== sessionAtCompile) return;
    if (_sceneTickerToken) tickerUnsubscribe(_sceneTickerToken);
    _sceneTickerToken = tickerSubscribe(animateStep, PRIORITY_SCENE);
  });
}

/** Camera lerp residual predicate for the dirty-flag arbitrator. Returns
 *  true while the camera's exponential smoothing hasn't yet converged
 *  within CAMERA_LERP_EPSILON of its current target on either axis. The
 *  ultimate target for X is (targetMouseX * 0.4) — camera.position.x
 *  chases (mouseX * 0.4) and mouseX itself chases targetMouseX, so a
 *  single check against targetMouseX covers the two-stage lerp chain. */
function cameraLerpResidualDirty() {
  if (!camera) return false;
  /* Two-stage lerp chain: mouseX → targetMouseX (via `am`) and
     camera.position.x → (_poseBase.x + mouseX*0.4) (via `ax`). Checking
     against targetMouseX covers both stages without per-frame state. */
  const baseY = _poseBase.scrollDolly
    ? CAM_START_Y + (CAM_END_Y - CAM_START_Y) * scrollProgress
    : _poseBase.y;
  const baseX = _poseBase.x + targetMouseX * 0.4;
  if (Math.abs(baseX - camera.position.x) > CAMERA_LERP_EPSILON) return true;
  if (Math.abs(baseY - camera.position.y) > CAMERA_LERP_EPSILON) return true;
  return false;
}
