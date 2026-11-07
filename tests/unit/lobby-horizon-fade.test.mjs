import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEX_FLOOR_RADIUS,
  HEX_GRID_COLS,
  HEX_GRID_ROWS,
  computeHexGridExtentRadius,
} from '../../src/scripts/lobby-hex-floor.js';
import {
  HORIZON_NAVY_CAM_END,
  HORIZON_NAVY_FADE_END_FRAC,
  HORIZON_NAVY_FADE_START_FRAC,
  computeHorizonNavyMix,
  resolveHorizonFadeEdges,
} from '../../src/scripts/lobby-horizon-fade.mjs';

const EXTENT = computeHexGridExtentRadius(HEX_GRID_COLS, HEX_GRID_ROWS, HEX_FLOOR_RADIUS);

test('computeHorizonNavyMix is zero at origin on landing camera', () => {
  assert.equal(computeHorizonNavyMix(0, 0, 0, 7, EXTENT), 0);
});

test('computeHorizonNavyMix reaches full navy before hex grid edge', () => {
  const edge = EXTENT * HORIZON_NAVY_FADE_END_FRAC;
  const mix = computeHorizonNavyMix(edge - 1, 0, 0, 7, EXTENT);
  assert.ok(mix > 0.85, `expected near 1 at grid edge, got ${mix}`);
});

test('computeHorizonNavyMix follows camera horizon on -Z axis', () => {
  const mix = computeHorizonNavyMix(0, -HORIZON_NAVY_CAM_END + 2, 0, 7, EXTENT);
  assert.ok(mix > 0.7, `expected strong navy mix at far -Z, got ${mix}`);
});

test('resolveHorizonFadeEdges starts inside hex footprint', () => {
  const edges = resolveHorizonFadeEdges(EXTENT);
  assert.ok(edges.radialStart < EXTENT * HORIZON_NAVY_FADE_START_FRAC + 0.01);
  assert.ok(edges.radialEnd < EXTENT);
});
