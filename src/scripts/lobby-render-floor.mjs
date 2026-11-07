/**
 * Pure render-floor FPS policy for the lobby dirty-flag arbitrator.
 * Testable without WebGL / lobby-scene globals.
 */

export const FLOOR_FPS_ACTIVE_DESKTOP = 60;
export const FLOOR_FPS_ACTIVE_MOBILE = 30;
export const FLOOR_FPS_IDLE_DESKTOP = 30;
export const FLOOR_FPS_IDLE_MOBILE = 24;
export const FLOOR_FPS_BREATH_DESKTOP = 30;
export const FLOOR_FPS_BREATH_MOBILE = 24;
export const FLOOR_FPS_REDUCED_DESKTOP = 24;
export const FLOOR_FPS_REDUCED_MOBILE = 20;
export const INPUT_ACTIVE_FLOOR_MS = 800;

/**
 * @typedef {{
 *   isMobile: boolean,
 *   prefersReducedMotion: boolean,
 *   lastInputTs: number,
 *   isLanding: boolean,
 *   idleBreathEnvelope: number,
 *   isSceneVisuallyIdle: boolean,
 * }} RenderFloorState
 */

/**
 * @param {number} now
 * @param {RenderFloorState} state
 * @returns {number}
 */
export function resolveTargetFloorFps(now, state) {
  const idleFloor = state.isMobile ? FLOOR_FPS_IDLE_MOBILE : FLOOR_FPS_IDLE_DESKTOP;
  const activeFloor = state.isMobile ? FLOOR_FPS_ACTIVE_MOBILE : FLOOR_FPS_ACTIVE_DESKTOP;
  const breathFloor = state.isMobile ? FLOOR_FPS_BREATH_MOBILE : FLOOR_FPS_BREATH_DESKTOP;
  const reducedFloor = state.isMobile ? FLOOR_FPS_REDUCED_MOBILE : FLOOR_FPS_REDUCED_DESKTOP;

  if (state.prefersReducedMotion) return reducedFloor;
  if (now - state.lastInputTs < INPUT_ACTIVE_FLOOR_MS) return activeFloor;
  if (state.isLanding) return activeFloor;
  if (state.idleBreathEnvelope > 0.001) return breathFloor;
  if (state.isSceneVisuallyIdle) return idleFloor;
  return activeFloor;
}

/**
 * @param {number} targetFps
 * @param {boolean} isMobile
 * @returns {boolean}
 */
export function isRenderFloorIdle(targetFps, isMobile) {
  const idleFloor = isMobile ? FLOOR_FPS_IDLE_MOBILE : FLOOR_FPS_IDLE_DESKTOP;
  return targetFps <= idleFloor;
}
