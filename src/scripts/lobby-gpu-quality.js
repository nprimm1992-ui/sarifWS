/**
 * lobby-gpu-quality.js — Adaptive GPU tier based on measured render duration.
 *
 * Tiers adjust DPR, bloom, and reflector resolution via lobby-display-tier.mjs.
 * Hysteresis prevents oscillation; sampling excludes boot / planter / tab-hidden windows.
 */

const EMA_ALPHA = 0.12;
const MAX_TIER = 2;

/** Desktop thresholds (ms) — 16.67 ms = 60 Hz frame budget. */
const DOWNGRADE_EMA_MS_DESKTOP = 15;
const UPGRADE_EMA_MS_DESKTOP = 11;
/** Mobile adds +2 ms budget. */
const DOWNGRADE_EMA_MS_MOBILE = 18;
const UPGRADE_EMA_MS_MOBILE = 13;

const DOWNGRADE_CONSECUTIVE = 28;
const UPGRADE_CONSECUTIVE = 90;

let _tier = 0;
let _emaMs = 0;
let _consecutiveOver = 0;
let _consecutiveUnder = 0;
let _isMobile = false;

/**
 * @param {boolean} mobile
 */
export function setGpuQualityMobile(mobile) {
  _isMobile = mobile === true;
}

/**
 * @returns {number}
 */
export function getGpuTier() {
  return _tier;
}

export function resetGpuQuality() {
  _tier = 0;
  _emaMs = 0;
  _consecutiveOver = 0;
  _consecutiveUnder = 0;
}

/**
 * @param {number} durationMs
 * @param {{ eligible?: boolean }} [opts]
 * @returns {number} current tier (may have changed)
 */
export function recordRenderSample(durationMs, opts = {}) {
  if (!opts.eligible) {
    _consecutiveOver = 0;
    _consecutiveUnder = 0;
    return _tier;
  }

  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    return _tier;
  }

  if (_emaMs === 0) _emaMs = durationMs;
  else _emaMs += EMA_ALPHA * (durationMs - _emaMs);

  const downgradeThreshold = _isMobile ? DOWNGRADE_EMA_MS_MOBILE : DOWNGRADE_EMA_MS_DESKTOP;
  const upgradeThreshold = _isMobile ? UPGRADE_EMA_MS_MOBILE : UPGRADE_EMA_MS_DESKTOP;

  if (_emaMs > downgradeThreshold) {
    _consecutiveOver++;
    _consecutiveUnder = 0;
    if (_consecutiveOver >= DOWNGRADE_CONSECUTIVE && _tier < MAX_TIER) {
      _tier++;
      _consecutiveOver = 0;
      _consecutiveUnder = 0;
    }
  } else if (_emaMs < upgradeThreshold) {
    _consecutiveUnder++;
    _consecutiveOver = 0;
    if (_consecutiveUnder >= UPGRADE_CONSECUTIVE && _tier > 0) {
      _tier--;
      _consecutiveOver = 0;
      _consecutiveUnder = 0;
    }
  } else {
    _consecutiveOver = 0;
    _consecutiveUnder = 0;
  }

  return _tier;
}

/**
 * Dev introspection.
 * @returns {{ tier: number, emaMs: number, consecutiveOver: number, consecutiveUnder: number }}
 */
export function introspectGpuQuality() {
  return {
    tier: _tier,
    emaMs: _emaMs,
    consecutiveOver: _consecutiveOver,
    consecutiveUnder: _consecutiveUnder,
  };
}
