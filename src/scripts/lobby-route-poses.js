/*
 * lobby-route-poses
 * -----------------
 * Declarative registry mapping each top-level route to an intentional
 * camera framing inside the shared lobby scene. This file owns *what*
 * each route feels like; the camera controller in lobby-scene.js owns
 * *how* we get there (tween, ease, arbitration with scrollProgress and
 * mouse parallax).
 *
 * Design intent — Round 5 (cinematic wide shots):
 *  - Each interior route lives at a distinct vantage on the same
 *    lobby, but the shot language is CINEMATIC WIDE: camera-to-
 *    subject distance ≈ 6–10 units, so the user always sees the
 *    subject planter framed against environmental context (the other
 *    planters, the floor glow, the background fog). No close-ups;
 *    close framings proved too intimate for a route that's about
 *    to reveal a new page of content.
 *  - Interior poses live at Z∈[3.5, 7.2] with FoV∈[50°, 56°].
 *    Compare: the landing pose at (0, 0.6, 7.0) is the "establishing
 *    shot"; interior poses are purposeful re-framings on the same
 *    space, not a different space.
 *  - `target` (explicit lookAt) is non-optional on every interior
 *    pose. The legacy auto-target (camera.x, camera.y-0.5, 0) is
 *    landing-only. Pointing at a planter's world coords gives each
 *    route a "directed gaze" — camera tilt/yaw varies route-to-route
 *    even when Z is similar, which is where the dynamic-angle feel
 *    comes from at wide-shot distances.
 *  - `lutMix` is reserved for per-route mood shifts in [0.85, 1.15].
 *    Conversion-adjacent pages (contact) warm slightly (1.06);
 *    supporting pages desaturate (0.90–0.95). Never push outside
 *    ±15% of baseline — we're tuning mood, not swapping scenes.
 *  - `scrollDolly` is TRUE only on the landing route.
 *  - `parallaxGain` (0..1) scales the mouse-X parallax overlay.
 *    Wide shots tolerate more parallax than close-ups — interior
 *    poses sit in [0.60, 0.80], tighter framings (/praxis/article,
 *    /contact) damp to ~0.55. Defaults to 1.0 so call-sites that
 *    omit the field don't regress.
 *  - `tweenMs` lets a pose with a large angle delta (praxis low
 *    hero, lexicon overhead) take longer than the 900ms default.
 *    At cinematic-wide distances these overrides are smaller than
 *    the close-up era (1000–1100ms vs 1100–1200ms); a shorter Z
 *    delta settles faster without feeling rushed.
 *
 * Scene geometry reference (from lobby-scene.js PLANTER_CONFIG):
 *    Centre terraced garden: (0, -3, -3), footprint ≈ 5.625 units wide
 *    Left concrete planters: (-3, -3, -1.5), footprint ≈ 2.1 units
 *    Right terraced planter: (2.5, -3, -1.5), footprint ≈ 2.1 units
 *    Floor is at Y=-3.0; planter tops cluster around Y ∈ [-2.7, -2.2].
 *
 * Mobile caveat:
 *    PLANTER_CONFIG.slice(0, 1) on mobile loads ONLY the centre garden.
 *    Anchor poses for /services, /engagements, /contact would frame
 *    empty air on mobile, so every route that targets a side planter
 *    has a ROUTE_POSES_MOBILE override re-aiming at the centre garden
 *    from an equivalent angle. resolvePose accepts an `{ isMobile }`
 *    context to pick the right table.
 */

/**
 * @typedef {Object} RoutePose
 * @property {string} id                         stable debug id
 * @property {[number, number, number]} pos      camera world position
 * @property {[number, number, number] | null} target  lookAt; null => legacy auto-target (landing only)
 * @property {number} fov                        base FoV in degrees (before aspect widen)
 * @property {number} lutMix                     LUTPass intensity multiplier
 * @property {boolean} scrollDolly               if true, scrollProgress drives Y between CAM_START_Y and CAM_END_Y
 * @property {number} [parallaxGain]             optional 0..1 multiplier on MOUSE_PARALLAX_GAIN (default 1.0)
 * @property {number} [tweenMs]                  optional tween-duration override in ms (default ROUTE_TWEEN_MS)
 */

/** @type {RoutePose} */
const POSE_LANDING = {
  id: 'landing',
  pos: [0.0, 0.6, 7.0],
  target: null,            // legacy: camera.lookAt(0, y-0.5, 0)
  fov: 52,
  lutMix: 1.0,
  scrollDolly: true,
  parallaxGain: 1.0,
};

/**
 * Desktop table — assumes all three planters are loaded. Every
 * interior route frames a specific planter at close range with an
 * explicit world-space target.
 *
 * @type {Record<string, RoutePose>}
 */
const ROUTE_POSES = Object.freeze({
  '/':              POSE_LANDING,

  /* /about — centred wide on the terraced garden. Camera sits 5.5
     units back with a slight elevation so the full garden + floor
     glow + a whisper of background fog all sit in frame. Target
     angled down (Y=-2.5) so the composition has the garden in the
     lower third — classic establishing-shot framing. */
  '/about': {
    id: 'about',
    pos: [0.0, -0.8, 5.5],
    target: [0.0, -2.5, -3.0],
    fov: 52,
    lutMix: 1.02,
    scrollDolly: false,
    parallaxGain: 0.75,
  },

  /* /services — zoomed-in wide on the LEFT floating cluster. Same
     shot language as /praxis (low camera, wide 54° lens, target
     above eye-line so the subject reads as "looked up at") but
     pushed ~20% closer to the constellation (~6.1 world-units vs
     /praxis's ~7.7). The low Y and slight X-offset from the logo
     pivot give the shot an over-shoulder feel that matches praxis's
     left-of-subject framing. */
  '/services': {
    id: 'services',
    pos: [-1.5, -1.3, 1.0],
    target: [-4.5, 0.5, -4.0],
    fov: 54,
    lutMix: 1.00,
    scrollDolly: false,
    parallaxGain: 0.55,
    tweenMs: 1100,
  },

  /* /engagements — mirrored zoomed wide on the RIGHT floating cluster.
     Navigating /services → /engagements is a pivot through the logo
     at matched composition: same low tilt, same distance, opposite
     constellation. Reads as "turning to face the other side of the
     lobby from the same vantage height". */
  '/engagements': {
    id: 'engagements',
    pos: [1.5, -1.3, 1.0],
    target: [4.5, 0.5, -4.0],
    fov: 54,
    lutMix: 1.00,
    scrollDolly: false,
    parallaxGain: 0.55,
    tweenMs: 1100,
  },

  /* /praxis — low-angle wide on the centre garden tilted upward.
     "Ground-level looking up" reads as deference to the subject —
     the garden dominates the top of frame while the floor glow runs
     the bottom. Offset left so the praxis index's right-hand reading
     column doesn't fight the camera's right-of-frame sightline. */
  '/praxis': {
    id: 'praxis',
    pos: [-1.5, -1.8, 4.5],
    target: [0.2, -2.2, -3.0],
    fov: 54,
    lutMix: 1.03,
    scrollDolly: false,
    parallaxGain: 0.60,
    tweenMs: 1100,
  },

  /* /praxis/article — medium-wide pushed in from /praxis. Slight Z
     dolly (4.5 → 3.5) + warmer LUT + narrower lens implies "you
     committed to this article; we're closer now" without becoming a
     close-up. Used explicitly via <meta name="lobby-pose"> in
     src/pages/praxis/[slug].astro. */
  '/praxis/article': {
    id: 'praxis-article',
    pos: [-1.0, -1.8, 3.5],
    target: [0.2, -2.2, -3.0],
    fov: 50,
    lutMix: 1.05,
    scrollDolly: false,
    parallaxGain: 0.55,
    tweenMs: 1000,
  },

  /* /lexicon — About-style establishing shot, pulled forward. Shares
     the About composition (central garden in the lower third, ground
     glow in frame) but at Z=4.0 with a 50° lens, so the terraced
     garden reads as a dominant, closer anchor. The earlier overhead
     top-down framing made the page feel like a map rather than a
     corpus you step into; this cinematographic push-in matches the
     lexicon's role as canonical reference. */
  '/lexicon': {
    id: 'lexicon',
    pos: [0.0, -0.7, 4.0],
    target: [0.0, -2.4, -3.0],
    fov: 50,
    lutMix: 1.02,
    scrollDolly: false,
    parallaxGain: 0.75,
    tweenMs: 1100,
  },

  /* /contact — mirrored praxis upshot on the centre terraced garden.
     Borrows praxis's visual grammar (low camera Y=-1.8, wide 54° lens,
     target at (~0, -2.2, -3) so the garden reads as "looked up at")
     but flips to the RIGHT of the pivot and warms the LUT to 1.06 —
     the warmest interior — to mark /contact as the conversion end-
     state. /praxis and /contact now bracket the centre garden as
     matched bookends: left-upshot cool vs right-upshot warm. */
  '/contact': {
    id: 'contact',
    pos: [1.5, -1.8, 4.5],
    target: [-0.2, -2.2, -3.0],
    fov: 54,
    lutMix: 1.06,
    scrollDolly: false,
    parallaxGain: 0.60,
    tweenMs: 1100,
  },

  /* /terms — supporting page. Deliberately de-emphasised: Z=5.5 with
     a cool LUT (0.95). Not a headline framing; "the legal copy is
     over here if you need it". */
  '/terms': {
    id: 'terms',
    pos: [-0.3, -0.9, 5.5],
    target: [-0.1, -1.9, -2.5],
    fov: 52,
    lutMix: 0.95,
    scrollDolly: false,
    parallaxGain: 0.75,
  },

  /* /privacy — mirrored supporting pose so nav-adjacent pages read as
     "same surface, other side" rather than duplicate. */
  '/privacy': {
    id: 'privacy',
    pos: [0.3, -0.9, 5.5],
    target: [0.1, -1.9, -2.5],
    fov: 52,
    lutMix: 0.95,
    scrollDolly: false,
    parallaxGain: 0.75,
  },

  /* /accessibility — centred quiet pose. Slightly more open than
     terms/privacy because accessibility copy is operationally
     important and shouldn't feel like fine-print. */
  '/accessibility': {
    id: 'accessibility',
    pos: [0.0, -0.7, 5.8],
    target: [0.0, -1.9, -2.5],
    fov: 52,
    lutMix: 0.95,
    scrollDolly: false,
    parallaxGain: 0.80,
  },

  /* /404 — off-axis wide. "You're off the path" but the lobby is
     still in plain view — wide framing so the user can orient
     themselves back to known territory. Unfamiliar left-side
     composition cues "this isn't where you meant to be". */
  '/404': {
    id: '404',
    pos: [-2.2, -1.6, 5.5],
    target: [-1.5, -2.5, -1.5],
    fov: 56,
    lutMix: 0.90,
    scrollDolly: false,
    parallaxGain: 0.70,
  },

  /* /500 — furthest pull-back in the registry. Warm LUT (1.08) flags
     "something is off" without breaking the scene. The extra dolly
     back to Z=7.2 reads as "the transmission cut out; the room is
     still here, but farther away". */
  '/500': {
    id: '500',
    pos: [0.5, -1.8, 7.2],
    target: [0.0, -2.5, -3.0],
    fov: 54,
    lutMix: 1.08,
    scrollDolly: false,
    parallaxGain: 0.75,
  },
});

/**
 * Mobile overrides — only defined for routes whose desktop pose
 * targets a side planter (which isn't loaded on mobile). Each
 * override re-aims the camera at the centre garden from a spatially
 * equivalent angle so the user still feels a distinct framing per
 * route without looking at empty floor.
 *
 * Routes not listed here inherit ROUTE_POSES verbatim.
 * @type {Record<string, RoutePose>}
 */
const ROUTE_POSES_MOBILE = Object.freeze({
  /* As of Round 5.6 the mobile override table is empty:
   *   - /services + /engagements target FLOATING GEOMETRY clusters.
   *     The floating objects exist on mobile (createFloatingGeometry()
   *     places 12 on mobile vs 20 on desktop) so the desktop framings
   *     work on both devices.
   *   - /contact now targets the CENTRE GARDEN (mirrored-praxis
   *     upshot), which is the one planter guaranteed to load on
   *     mobile (PLANTER_CONFIG.slice(0, 1)).
   *
   * Kept as a live (empty) Object.freeze so resolvePose's
   * context-aware lookup keeps working; if a future pose ever aims
   * at a side planter, add the mobile variant here. */
});

const FALLBACK_INTERIOR_POSE = ROUTE_POSES['/about'];

/**
 * @typedef {Object} SubposeDelta
 * @property {number} [dx]    world-unit delta on camera X
 * @property {number} [dy]    world-unit delta on camera Y
 * @property {number} [dz]    world-unit delta on camera Z (positive = dolly back)
 * @property {number} [dfov]  degrees added to the anchor pose FoV
 * @property {number} [dlut]  additive delta on the LUT mix multiplier
 */

/**
 * Named sub-poses reusable across pages. Keyed by the value of a
 * `data-lobby-subpose="<key>"` attribute on any section inside the
 * interior route's <main>. Keep deltas small — cumulative with the
 * anchor pose, a 0.3 dolly is already noticeable; +3 degrees of FoV is
 * the upper end of what reads as "breathing" rather than a zoom.
 *
 * Round 5 note: sub-pose deltas are NOT re-calibrated when anchor
 * poses move. An anchor at Z=2 treats a `dz: -0.15` as a larger
 * percentage dolly than an anchor at Z=6 does. If a specific sub-pose
 * starts to feel off after the Round-5 anchor rebalance, shrink its
 * delta here — don't unwind the anchor move.
 *
 * Authors can add new keys here without touching the scene code.
 * @type {Record<string, SubposeDelta>}
 */
const ROUTE_SUBPOSES = Object.freeze({
  /* Services deep-dive lanes: gentle pull-back + warm LUT bump as the
     reader advances through offer detail. */
  'services-deep':        { dz: 0.25, dfov: 1.5, dlut: 0.06 },
  /* Engagements carousel: push-in + narrower FoV to centre attention
     on the case in view. */
  'engagements-carousel': { dz: -0.15, dfov: -1, dlut: 0.04 },
  /* Praxis proof entries: stay near the anchor; just a warmth bump. */
  'praxis-proof':         { dz: 0.10, dfov: 0,   dlut: 0.05 },
  /* About dossier numbers: slow drift outward as the reader lands on
     the quantified claims. */
  'about-dossier':        { dz: 0.20, dfov: 1,   dlut: 0.08 },
  /* Lexicon index body: modest pull-back + gentle FoV widen as the
     reader leaves the hero and enters the filter/list surface. Gives
     the list more breathing room without shifting the camera enough
     to feel like a page swap. */
  'lexicon-index':        { dz: 0.35, dfov: 1.5, dlut: 0.04 },
});

/** Maximum cumulative deltas applied on top of an anchor pose. Guards
 *  against a typo in a data- attribute blowing the camera through the
 *  floor. Soft clamp; authors see the attempted value in devtools. */
const SUBPOSE_DELTA_BOUNDS = Object.freeze({
  dx: 1.5,
  dy: 1.5,
  dz: 1.5,
  dfov: 6,
  dlut: 0.25,
});

function clampDelta(value, absBound) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value > absBound) return absBound;
  if (value < -absBound) return -absBound;
  return value;
}

/**
 * Parse the comma-separated delta form `<dx>,<dy>,<dz>,<dfov>,<dlut>`.
 * Missing fields are treated as 0. Whitespace tolerated.
 *
 * @param {string | null | undefined} str
 * @returns {SubposeDelta | null}
 */
export function parseLobbyBeat(str) {
  if (typeof str !== 'string' || str.length === 0) return null;
  const parts = str.split(',').map((p) => p.trim());
  const num = (s) => {
    if (s === undefined || s === '') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    dx:   clampDelta(num(parts[0]), SUBPOSE_DELTA_BOUNDS.dx),
    dy:   clampDelta(num(parts[1]), SUBPOSE_DELTA_BOUNDS.dy),
    dz:   clampDelta(num(parts[2]), SUBPOSE_DELTA_BOUNDS.dz),
    dfov: clampDelta(num(parts[3]), SUBPOSE_DELTA_BOUNDS.dfov),
    dlut: clampDelta(num(parts[4]), SUBPOSE_DELTA_BOUNDS.dlut),
  };
}

/**
 * Compose an anchor pose + a sub-beat delta into a full RoutePose-shaped
 * object suitable for `startPoseTween` in lobby-scene.js. Priority when
 * an element carries both attributes: subpose key wins (it's the
 * reusable contract; the inline beat is for one-off deltas).
 *
 * Returns null when the element opts into neither or the subpose key
 * isn't registered (silent ignore — attributes are author-controlled
 * and a typo should not crash the scene).
 *
 * @param {RoutePose} anchor
 * @param {Element} element
 * @returns {RoutePose | null}
 */
export function resolveSubpose(anchor, element) {
  if (!anchor || !element || typeof element.getAttribute !== 'function') return null;
  let delta = null;
  let idSuffix = null;
  const subposeKey = element.getAttribute('data-lobby-subpose');
  if (subposeKey && ROUTE_SUBPOSES[subposeKey]) {
    delta = ROUTE_SUBPOSES[subposeKey];
    idSuffix = subposeKey;
  } else {
    const beatStr = element.getAttribute('data-lobby-beat');
    if (beatStr) {
      delta = parseLobbyBeat(beatStr);
      /* Inline beats must bake their own signature into the id so that
         applyActiveSectionPose in lobby-scene.js can tell two different
         inline beats apart; otherwise its `_currentSubposeId === nextId`
         short-circuit skips the tween for the second element. We include
         the CLAMPED delta (already normalised above) rather than the
         raw attribute string so equal-after-clamping beats still dedupe. */
      if (delta) {
        idSuffix = `beat:${delta.dx},${delta.dy},${delta.dz},${delta.dfov},${delta.dlut}`;
      }
    }
  }
  if (!delta) return null;

  const dx = delta.dx ?? 0;
  const dy = delta.dy ?? 0;
  const dz = delta.dz ?? 0;
  const dfov = delta.dfov ?? 0;
  const dlut = delta.dlut ?? 0;

  /* A sub-pose never flips scrollDolly — that's an anchor-level contract.
     We ALSO never mutate the target: sub-beats express "a different
     distance/lens on the same subject", not "look somewhere else",
     which would feel like a lateral cut. parallaxGain and tweenMs
     similarly inherit from the anchor so a sub-beat on a hard-damped
     close-up doesn't resurrect seasick parallax mid-scroll. */
  return {
    id: `${anchor.id}:${idSuffix || 'beat'}`,
    pos: [anchor.pos[0] + dx, anchor.pos[1] + dy, anchor.pos[2] + dz],
    target: anchor.target ? [anchor.target[0], anchor.target[1], anchor.target[2]] : null,
    fov: anchor.fov + dfov,
    lutMix: anchor.lutMix + dlut,
    scrollDolly: anchor.scrollDolly,
    parallaxGain: anchor.parallaxGain,
    tweenMs: anchor.tweenMs,
  };
}

/**
 * Normalises a URL pathname to the registry key. Strips trailing
 * slashes, query strings, and fragments so `/services/`, `/services`,
 * and `/services?ref=x` all resolve identically.
 * @param {string | null | undefined} pathname
 * @returns {string}
 */
export function normalizePath(pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0) return '/';
  const stripped = pathname.split('?')[0].split('#')[0];
  if (stripped === '/' || stripped === '') return '/';
  /* remove trailing slashes but keep the single leading slash */
  const trimmed = stripped.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

/**
 * Reads an explicit pose override from the current document. A page
 * can opt in by emitting `<meta name="lobby-pose" content="/404">` (or
 * any other registered pose path) — useful when the URL doesn't
 * convey the intended framing: e.g. Cloudflare Pages serving
 * `/404.html` while the URL bar still shows the typo'd path the user
 * typed.
 *
 * Respects the mobile table: an override that names a route with a
 * mobile variant picks the mobile pose when the caller is on mobile.
 *
 * Runs in the browser only; SSR safety via `typeof document` guard.
 * Returns null when no override is present or the referenced pose
 * isn't registered (defense-in-depth against typos in the meta tag).
 *
 * @param {{isMobile?: boolean}} [ctx]
 * @returns {RoutePose | null}
 */
export function readDocumentPoseOverride(ctx) {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector('meta[name="lobby-pose"]');
  if (!meta) return null;
  const raw = meta.getAttribute('content');
  if (!raw) return null;
  const key = normalizePath(raw);
  if (ctx && ctx.isMobile === true) {
    const mobilePose = ROUTE_POSES_MOBILE[key];
    if (mobilePose) return mobilePose;
  }
  return ROUTE_POSES[key] || null;
}

/**
 * Resolves a pathname (raw, possibly with trailing slash/query) to the
 * pose that should drive the lobby camera for that route. Explicit
 * document-level overrides (via `<meta name="lobby-pose">`) take
 * precedence so a page can specify its own framing even when the
 * pathname doesn't match any registered route.
 *
 *  Edge cases handled:
 *    - null / undefined / non-string  → landing pose
 *    - trailing slashes               → normalised
 *    - querystring / hash             → stripped before lookup
 *    - unknown interior route         → fallback interior pose
 *      (NEVER the landing pose, because that would re-enable
 *       scroll-driven dolly on a page that doesn't expect it)
 *    - <meta name="lobby-pose">       → absolute override
 *    - mobile caller                  → ROUTE_POSES_MOBILE override
 *                                       when registered, else desktop
 *
 * @param {string | null | undefined} pathname
 * @param {{isMobile?: boolean}} [ctx]
 * @returns {RoutePose}
 */
export function resolvePose(pathname, ctx) {
  const override = readDocumentPoseOverride(ctx);
  if (override) return override;
  const key = normalizePath(pathname);
  if (ctx && ctx.isMobile === true) {
    const mobilePose = ROUTE_POSES_MOBILE[key];
    if (mobilePose) return mobilePose;
  }
  const pose = ROUTE_POSES[key];
  if (pose) return pose;
  return FALLBACK_INTERIOR_POSE;
}

/** Exposed for tests / dev HUD. */
export function listPoses() {
  return Object.entries(ROUTE_POSES).map(([path, pose]) => ({ path, ...pose }));
}

export {
  ROUTE_POSES,
  ROUTE_POSES_MOBILE,
  ROUTE_SUBPOSES,
  POSE_LANDING,
  FALLBACK_INTERIOR_POSE,
};
