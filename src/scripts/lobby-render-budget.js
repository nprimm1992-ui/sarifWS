/**
 * lobby-render-budget.js — Dirty-flag arbitrator for the Three.js lobby scene.
 *
 * Problem: the lobby's animate step called composer.render() every rAF
 * frame unconditionally. After the hero settles (no scroll, no mouse
 * motion, interior-route emblem hidden), the GPU still drew 3–5 ms per
 * frame at 60 Hz — pure battery/thermal waste on long dwell times.
 *
 * Model:
 *   - One-shot triggers (mouse, scroll, resize, context-loss, boot,
 *     envMap swap, asset mount, route tween) call markDirty(reason),
 *     which grants N frames of guaranteed render.
 *   - Continuous triggers (landing-route dust drift, emblem sheen pulse
 *     while phase !== 'hidden', camera lerp residuals) register a
 *     predicate evaluated once per frame. Returning true forces a draw.
 *   - shouldRender() returns true if any one-shot credit remains, any
 *     continuous predicate fires, OR the min-fps floor says "render
 *     anyway." onRendered() consumes one credit and snapshots the
 *     timestamp — used by the floor.
 *
 * Safety:
 *   - Min-fps floor (default 24 fps) guarantees the scene never visibly
 *     freezes if a dirty signal is missed. At 24 fps the slow bob / lerp
 *     of the floating geometry still reads as smooth.
 *   - Predicate errors fail OPEN (mark the frame dirty); a broken
 *     predicate never silently skips rendering.
 *   - resetRenderBudget() wipes state — called on cleanup() and
 *     context-loss teardown so session boundaries are hard.
 *
 * Out of scope:
 *   - Does NOT gate the per-frame math in animateStep (camera lerp,
 *     dust drift, emblem fade, object bob). Those stay so state remains
 *     coherent when a redraw is finally issued. Only composer.render()
 *     / renderer.render() is gated — that's where the actual GPU cost
 *     lives.
 *   - Does NOT replace the main-ticker's visibility pause. When the tab
 *     is hidden the ticker stops calling into this module entirely.
 */

/** Default one-shot credit (frames forced to render after a trigger). */
const ONESHOT_FRAMES_DEFAULT = 1;
/** Resize + DPR changes reach through composer/pmrem/reflector setSize;
 *  a couple of frames ensures the new buffers settle before we skip. */
const ONESHOT_FRAMES_RESIZE = 3;
/** Post-context-loss reinit re-warms materials; give the next frames a
 *  chance to actually commit before we skip. */
const ONESHOT_FRAMES_CONTEXT_LOSS = 2;
/** Boot / resume / envMap load need one guaranteed frame. */
const ONESHOT_FRAMES_BOOT = 1;

/** Floor FPS. Even without dirty signals, render at least this often so
 *  the floating-geometry bob and other slow animations continue to read
 *  as motion rather than frozen. 24 fps is film-speed; perceptually
 *  smooth for the slow bob (full period ≈ 35 s) and the 1.8-Hz emblem
 *  sheen. Kept configurable via setFloorFps() for A/B-style tuning. */
const DEFAULT_MIN_FPS = 24;
/** Upper clamp prevents `setFloorFps(9999)` from defeating the whole
 *  module by forcing a render every frame. */
const MAX_MIN_FPS = 120;
const MS_PER_SECOND = 1000;

let _oneShotCredits = 0;
/** @type {Array<() => boolean>} */
let _continuous = [];
let _lastRenderAt = 0;
let _minFps = DEFAULT_MIN_FPS;

/** Dev-only introspection: track recent one-shot reasons for HUD/debug. */
const MAX_RECENT_REASONS = 24;
/** @type {string[]} */
const _recentReasons = [];
let _frameCount = 0;
let _renderCount = 0;

/**
 * Declare the scene dirty with a reason string. Caller semantics:
 *   - Safe to call from event handlers (mouse, scroll, resize, etc.).
 *   - Safe to call from inside a ticker frame; the credit will carry
 *     into the current or next frame depending on timing.
 *   - Reason is free-form; a small set of well-known reasons gets a
 *     larger credit window (resize, contextLoss, boot).
 *
 * @param {string} reason
 */
export function markDirty(reason) {
  let frames = ONESHOT_FRAMES_DEFAULT;
  if (reason === 'resize') frames = ONESHOT_FRAMES_RESIZE;
  else if (reason === 'contextLoss') frames = ONESHOT_FRAMES_CONTEXT_LOSS;
  else if (
    reason === 'boot' ||
    reason === 'resume' ||
    reason === 'envMap' ||
    reason === 'assetMounted'
  ) {
    frames = ONESHOT_FRAMES_BOOT;
  }
  if (frames > _oneShotCredits) _oneShotCredits = frames;

  _recentReasons.push(reason);
  if (_recentReasons.length > MAX_RECENT_REASONS) _recentReasons.shift();
}

/**
 * Register a per-frame dirty predicate. Evaluated once per frame (cheap
 * boolean test expected); returning true forces a render for that
 * frame. Returns an unsubscribe function.
 *
 * @param {() => boolean} predicate
 * @returns {() => void}
 */
export function registerContinuousSource(predicate) {
  _continuous.push(predicate);
  return () => {
    const idx = _continuous.indexOf(predicate);
    if (idx >= 0) _continuous.splice(idx, 1);
  };
}

/**
 * Arbitrator. Call once per frame, before invoking composer.render().
 * Ordering:
 *   1. One-shot credits always win (cheapest check).
 *   2. Floor-fps safety second (time-based; no predicate cost).
 *   3. Predicates last (may scan live scene state).
 *
 * @returns {boolean}
 */
export function shouldRender() {
  _frameCount++;
  if (_oneShotCredits > 0) return true;

  const now = performance.now();
  const floorIntervalMs = MS_PER_SECOND / _minFps;
  if (_lastRenderAt === 0 || now - _lastRenderAt >= floorIntervalMs) {
    return true;
  }

  for (let i = 0; i < _continuous.length; i++) {
    let dirty;
    try {
      dirty = _continuous[i]() === true;
    } catch (err) {
      /* A broken predicate must not silently skip rendering; fail open
         and log once per session. */
      if (typeof console !== 'undefined' && console.error) {
        console.error('[lobby-render-budget] continuous predicate threw', err);
      }
      dirty = true;
    }
    if (dirty) return true;
  }
  return false;
}

/**
 * Call immediately after composer.render() / renderer.render(). Consumes
 * one one-shot credit (if any) and snapshots the render timestamp for
 * the floor-fps calculation.
 */
export function onRendered() {
  if (_oneShotCredits > 0) _oneShotCredits--;
  _lastRenderAt = performance.now();
  _renderCount++;
}

/**
 * Clamp the safety floor. Mainly a tuning hook — defaults to 24 fps,
 * which is cinematic-smooth for the slow animations in the scene. Pass
 * a higher value to trade GPU for motion fluidity.
 *
 * @param {number} fps
 */
export function setFloorFps(fps) {
  if (typeof fps !== 'number' || !Number.isFinite(fps)) return;
  if (fps <= 0 || fps > MAX_MIN_FPS) return;
  _minFps = fps;
}

/**
 * Wipe every state bucket. Intended for cleanup() / context-loss
 * teardown so a subsequent initLobby() starts clean — no stale
 * predicates bound to the disposed scene, no leaked credits.
 */
export function resetRenderBudget() {
  _oneShotCredits = 0;
  _continuous = [];
  _lastRenderAt = 0;
  _recentReasons.length = 0;
  _frameCount = 0;
  _renderCount = 0;
  _minFps = DEFAULT_MIN_FPS;
}

/**
 * Dev-only snapshot for HUD / console debugging. Shape is stable but
 * not a public contract — read for diagnostics only.
 *
 * @returns {{
 *   oneShotCredits: number,
 *   continuousCount: number,
 *   frameCount: number,
 *   renderCount: number,
 *   skipRatio: number,
 *   minFps: number,
 *   lastRenderAt: number,
 *   recentReasons: string[],
 * }}
 */
export function introspectRenderBudget() {
  return {
    oneShotCredits: _oneShotCredits,
    continuousCount: _continuous.length,
    frameCount: _frameCount,
    renderCount: _renderCount,
    skipRatio: _frameCount === 0 ? 0 : 1 - _renderCount / _frameCount,
    minFps: _minFps,
    lastRenderAt: _lastRenderAt,
    recentReasons: _recentReasons.slice(),
  };
}
