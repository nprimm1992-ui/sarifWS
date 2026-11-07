import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GLB_MANIFEST,
  GLB_DEFAULT_PROFILE,
  profileForGlb,
  shouldSimplifyGlb,
} from '../../scripts/glb-manifest.mjs';

test('GLB_MANIFEST lists all lobby planter assets with simplify ratios', () => {
  const expected = [
    'concrete-planters-3d-model.glb',
    'terraced-concrete-planter-3d-model.glb',
    'terraced-garden-3d-model-low.glb',
    'wing-emblem-3d-model.glb',
  ];
  for (const name of expected) {
    assert.ok(GLB_MANIFEST[name], `missing manifest entry for ${name}`);
    assert.ok(GLB_MANIFEST[name].simplifyRatio > 0 && GLB_MANIFEST[name].simplifyRatio <= 1);
    assert.ok(GLB_MANIFEST[name].simplifyError > 0);
  }
});

test('side planters use aggressive simplify ratio', () => {
  assert.equal(profileForGlb('concrete-planters-3d-model.glb').simplifyRatio, 0.2);
  assert.equal(profileForGlb('terraced-concrete-planter-3d-model.glb').simplifyRatio, 0.2);
});

test('profileForGlb falls back to default for unknown files', () => {
  assert.deepEqual(profileForGlb('unknown.glb'), GLB_DEFAULT_PROFILE);
});

test('shouldSimplifyGlb skips re-simplify when upload verts are within budget', () => {
  assert.equal(shouldSimplifyGlb('concrete-planters-3d-model.glb', 100_000), false);
  assert.equal(shouldSimplifyGlb('concrete-planters-3d-model.glb', 150_000), true);
  assert.equal(shouldSimplifyGlb('terraced-garden-3d-model-low.glb', 50_000), false);
  assert.equal(shouldSimplifyGlb('unknown.glb', 10_000), true);
  assert.equal(shouldSimplifyGlb('concrete-planters-3d-model.glb', null), true);
});
