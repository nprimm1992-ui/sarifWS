/**
 * Per-asset GLB optimization parameters for scripts/optimize-glbs.mjs.
 *
 * Side planters (Tripo exports) carry 400k+ upload vertices — meshopt alone
 * cannot shrink them. simplifyRatio targets ~60k–100k verts after weld.
 */

/** @typedef {{ simplifyRatio: number, simplifyError: number }} GlbOptimizeProfile */

/** @type {Record<string, GlbOptimizeProfile>} */
export const GLB_MANIFEST = {
  'concrete-planters-3d-model.glb': { simplifyRatio: 0.2, simplifyError: 0.01 },
  'terraced-concrete-planter-3d-model.glb': { simplifyRatio: 0.2, simplifyError: 0.01 },
  'terraced-garden-3d-model-low.glb': { simplifyRatio: 0.6, simplifyError: 0.005 },
  'wing-emblem-3d-model.glb': { simplifyRatio: 0.6, simplifyError: 0.005 },
};

/** Default profile for GLBs not listed in the manifest. */
export const GLB_DEFAULT_PROFILE = { simplifyRatio: 0.5, simplifyError: 0.01 };

/**
 * @param {string} filename
 * @returns {GlbOptimizeProfile}
 */
export function profileForGlb(filename) {
  return GLB_MANIFEST[filename] ?? GLB_DEFAULT_PROFILE;
}

/**
 * Max upload vertices before simplify is applied. Re-running optimize on
 * committed GLBs must not re-simplify — each pass would shrink geometry again.
 * @type {Record<string, number>}
 */
export const GLB_SIMPLIFY_SKIP_VERTS = {
  'concrete-planters-3d-model.glb': 120_000,
  'terraced-concrete-planter-3d-model.glb': 120_000,
  'terraced-garden-3d-model-low.glb': 55_000,
  'wing-emblem-3d-model.glb': 25_000,
};

/**
 * @param {string} filename
 * @param {number | null} uploadVertexCount
 * @returns {boolean}
 */
export function shouldSimplifyGlb(filename, uploadVertexCount) {
  const threshold = GLB_SIMPLIFY_SKIP_VERTS[filename];
  if (threshold == null) return true;
  if (uploadVertexCount == null) return true;
  return uploadVertexCount > threshold;
}
