import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordRenderSample,
  getGpuTier,
  resetGpuQuality,
  setGpuQualityMobile,
} from '../../src/scripts/lobby-gpu-quality.js';

test('resetGpuQuality restores tier 0', () => {
  resetGpuQuality();
  setGpuQualityMobile(false);
  for (let i = 0; i < 30; i++) {
    recordRenderSample(25, { eligible: true });
  }
  assert.ok(getGpuTier() >= 1);
  resetGpuQuality();
  assert.equal(getGpuTier(), 0);
});

test('ineligible samples do not advance tier', () => {
  resetGpuQuality();
  setGpuQualityMobile(false);
  for (let i = 0; i < 60; i++) {
    recordRenderSample(30, { eligible: false });
  }
  assert.equal(getGpuTier(), 0);
});

test('downgrade after sustained high EMA', () => {
  resetGpuQuality();
  setGpuQualityMobile(false);
  for (let i = 0; i < 30; i++) {
    recordRenderSample(22, { eligible: true });
  }
  assert.equal(getGpuTier(), 1);
});

test('upgrade requires sustained low EMA after downgrade', () => {
  resetGpuQuality();
  setGpuQualityMobile(false);
  for (let i = 0; i < 30; i++) {
    recordRenderSample(22, { eligible: true });
  }
  assert.equal(getGpuTier(), 1);
  for (let i = 0; i < 200; i++) {
    recordRenderSample(5, { eligible: true });
  }
  assert.equal(getGpuTier(), 0);
});
