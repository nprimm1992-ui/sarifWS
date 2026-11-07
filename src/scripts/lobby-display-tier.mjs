/**
 * Shared lobby display resolution tiers — DPR, bloom, reflector RT.
 * Used by lobby-scene.js, lobby-floor.js, and atmosphere.js.
 *
 * Reflector quality is decoupled from main-pass DPR: the mirror uses its own
 * resolution ladder and MSAA policy so we can keep a lean framebuffer while
 * restoring hero fidelity when motion or input is active.
 */

export const LOBBY_TIER_FULL_HD_CSS_PIXELS = 1920 * 1080;
export const LOBBY_TIER_QHD_CSS_PIXELS = 2560 * 1440;

/** Main-pass + bloom multipliers when adaptive GPU tier degrades. */
export const GPU_TIER_MULTIPLIERS = {
  0: { dpr: 1.0, bloom: 1.0 },
  1: { dpr: 0.92, bloom: 0.85 },
  2: { dpr: 0.85, bloom: 0.72 },
};

/**
 * Reflector RT scale — less aggressive than DPR so tier-1 GPUs keep a readable mirror.
 * @type {Record<number, number>}
 */
export const REFLECTOR_GPU_MULTIPLIERS = {
  0: 1.0,
  1: 0.85,
  2: 0.65,
};

export const REFLECTOR_BASE_DESKTOP = 1024;
export const REFLECTOR_BASE_DESKTOP_LARGE = 1024;
export const REFLECTOR_BASE_MOBILE = 512;
/** Desktop boot window: low RT before post-settle ladder. */
export const REFLECTOR_BOOT_DESKTOP = 512;
/** Tier-0 desktop idle reading: 1024 × 0.75 → 768 snapped. */
export const REFLECTOR_IDLE_SCALE_TIER0 = 0.75;

const REFLECTOR_SNAP_SIZES = [512, 640, 768, 1024];

/**
 * @param {number} raw
 * @returns {number}
 */
export function snapReflectFloorRes(raw) {
  let best = REFLECTOR_SNAP_SIZES[0];
  for (const size of REFLECTOR_SNAP_SIZES) {
    if (size <= raw) best = size;
    else break;
  }
  return best;
}

/**
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {boolean} mobile
 * @returns {number}
 */
export function resolveBaselineDprCap(cssWidth, cssHeight, mobile) {
  if (mobile) return 1.35;
  let cap = 1.15;
  const px = cssWidth * cssHeight;
  if (px > LOBBY_TIER_QHD_CSS_PIXELS) cap = 1.1;
  else if (px > LOBBY_TIER_FULL_HD_CSS_PIXELS) cap = 1.12;
  const dm = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  if (typeof dm === 'number' && dm > 0 && dm <= 4) cap = Math.min(cap, 1.15);
  return cap;
}

/**
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {boolean} mobile
 * @param {number} [gpuTier]
 * @param {number} [devicePixelRatio]
 * @returns {number}
 */
export function resolveLobbyDprCap(cssWidth, cssHeight, mobile, gpuTier = 0, devicePixelRatio = 1) {
  const raw = Number(devicePixelRatio);
  const dpr = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const tier = GPU_TIER_MULTIPLIERS[gpuTier] ?? GPU_TIER_MULTIPLIERS[0];
  const cap = resolveBaselineDprCap(cssWidth, cssHeight, mobile) * tier.dpr;
  return Math.min(dpr, cap);
}

/**
 * @param {boolean} mobile
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {boolean} [motionActive]
 * @param {number} [gpuTier]
 * @returns {number}
 */
export function resolveBloomScale(mobile, cssWidth, cssHeight, motionActive = true, gpuTier = 0) {
  const tier = GPU_TIER_MULTIPLIERS[gpuTier] ?? GPU_TIER_MULTIPLIERS[0];
  if (mobile) {
    let scale = motionActive ? 0.4 : 0.32;
    return scale * tier.bloom;
  }
  const px = cssWidth * cssHeight;
  let scale = 0.42;
  if (px > LOBBY_TIER_QHD_CSS_PIXELS) scale = 0.38;
  else if (px > LOBBY_TIER_FULL_HD_CSS_PIXELS) scale = 0.42;
  if (!motionActive) scale *= 0.72;
  return scale * tier.bloom;
}

/**
 * Baseline reflector RT size before GPU tier scaling.
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {boolean} mobile
 * @param {boolean} [motionActive]
 * @param {number} [gpuTier]
 * @returns {number}
 */
export function resolveReflectFloorBaseRes(cssWidth, cssHeight, mobile, motionActive = true, gpuTier = 0) {
  if (mobile) return REFLECTOR_BASE_MOBILE;
  const px = cssWidth * cssHeight;
  let base = px > LOBBY_TIER_QHD_CSS_PIXELS ? REFLECTOR_BASE_DESKTOP_LARGE : REFLECTOR_BASE_DESKTOP;
  if (!motionActive && gpuTier === 0) base *= REFLECTOR_IDLE_SCALE_TIER0;
  return base;
}

/**
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {boolean} mobile
 * @param {number} [gpuTier]
 * @param {boolean} [motionActive]
 * @param {boolean} [bootPhase]
 * @returns {number}
 */
export function resolveReflectFloorRes(cssWidth, cssHeight, mobile, gpuTier = 0, motionActive = true, bootPhase = false) {
  if (bootPhase && !mobile) return REFLECTOR_BOOT_DESKTOP;
  const tierMult = REFLECTOR_GPU_MULTIPLIERS[gpuTier] ?? REFLECTOR_GPU_MULTIPLIERS[0];
  const base = resolveReflectFloorBaseRes(cssWidth, cssHeight, mobile, motionActive, gpuTier);
  return snapReflectFloorRes(base * tierMult);
}

/**
 * MSAA on the reflector pass is expensive — reserve for tier-0 desktop when the mirror
 * is visually primary (motion, landing). Boot phase always MSAA 0.
 * @param {boolean} mobile
 * @param {number} [gpuTier]
 * @param {boolean} [motionActive]
 * @param {boolean} [bootPhase]
 * @returns {number}
 */
export function resolveReflectFloorMultisample(mobile, gpuTier = 0, motionActive = true, bootPhase = false) {
  if (mobile || bootPhase || !motionActive) return 0;
  return gpuTier === 0 ? 4 : 0;
}

/**
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {boolean} mobile
 * @param {number} [gpuTier]
 * @param {boolean} [motionActive]
 * @param {boolean} [bootPhase]
 * @returns {{ resolution: number, multisample: number }}
 */
export function resolveReflectFloorProfile(cssWidth, cssHeight, mobile, gpuTier = 0, motionActive = true, bootPhase = false) {
  return {
    resolution: resolveReflectFloorRes(cssWidth, cssHeight, mobile, gpuTier, motionActive, bootPhase),
    multisample: resolveReflectFloorMultisample(mobile, gpuTier, motionActive, bootPhase),
  };
}
