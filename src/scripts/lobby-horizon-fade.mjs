/**
 * Shared horizon fade — floor + hex grout blend to Sarif navy before the sky line.
 * Uses radial distance from grid center AND horizontal distance from camera so the
 * fade aligns with the on-screen horizon, not just world origin.
 */

/** Radial fade begins inside the authored hex footprint (fraction of hexExtent). */
export const HORIZON_NAVY_FADE_START_FRAC = 0.58;

/** Full navy on the floor just inside the hex grid outer edge. */
export const HORIZON_NAVY_FADE_END_FRAC = 0.92;

/** Camera-horizontal fade — matches landing pose (0, 7) vanishing line. */
export const HORIZON_NAVY_CAM_START = 26;

export const HORIZON_NAVY_CAM_END = 50;

/** Default landing camera XZ for baked LineSegments2 vertex falloff. */
export const HORIZON_LANDING_CAM_X = 0;

export const HORIZON_LANDING_CAM_Z = 7;

/**
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 * @returns {number}
 */
export function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * @param {number} hexExtent
 * @returns {{ radialStart: number, radialEnd: number, camStart: number, camEnd: number }}
 */
export function resolveHorizonFadeEdges(hexExtent) {
  return {
    radialStart: hexExtent * HORIZON_NAVY_FADE_START_FRAC,
    radialEnd: hexExtent * HORIZON_NAVY_FADE_END_FRAC,
    camStart: HORIZON_NAVY_CAM_START,
    camEnd: HORIZON_NAVY_CAM_END,
  };
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} camX
 * @param {number} camZ
 * @param {number} hexExtent
 * @returns {number} 0 = full gold floor, 1 = full navy
 */
export function computeHorizonNavyMix(x, z, camX, camZ, hexExtent) {
  const { radialStart, radialEnd, camStart, camEnd } = resolveHorizonFadeEdges(hexExtent);
  const radialMix = smoothstep(radialStart, radialEnd, Math.hypot(x, z));
  const camMix = smoothstep(camStart, camEnd, Math.hypot(x - camX, z - camZ));
  return Math.max(radialMix, camMix);
}

/**
 * Shader uniforms for horizon navy mix (reflector + procedural hex).
 *
 * @param {number} hexExtent
 */
export function createHorizonFadeUniforms(hexExtent) {
  const edges = resolveHorizonFadeEdges(hexExtent);
  return {
    navyFadeRadialStart: { value: edges.radialStart },
    navyFadeRadialEnd: { value: edges.radialEnd },
    navyFadeCamStart: { value: edges.camStart },
    navyFadeCamEnd: { value: edges.camEnd },
  };
}

/** GLSL helper — requires cameraPosition from three/common. */
export const HORIZON_NAVY_MIX_GLSL = /* glsl */ `
float horizonNavyMix(vec2 xz, vec2 camXZ, float radialStart, float radialEnd, float camStart, float camEnd) {
  float radialMix = smoothstep(radialStart, radialEnd, length(xz));
  float camMix = smoothstep(camStart, camEnd, length(xz - camXZ));
  return max(radialMix, camMix);
}
`;
