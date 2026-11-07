import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTargetFloorFps,
  FLOOR_FPS_ACTIVE_DESKTOP,
  FLOOR_FPS_ACTIVE_MOBILE,
  FLOOR_FPS_IDLE_DESKTOP,
  FLOOR_FPS_IDLE_MOBILE,
  FLOOR_FPS_BREATH_DESKTOP,
  FLOOR_FPS_BREATH_MOBILE,
  FLOOR_FPS_REDUCED_DESKTOP,
  INPUT_ACTIVE_FLOOR_MS,
} from '../../src/scripts/lobby-render-floor.mjs';

const now = 10_000;

test('interior visually idle desktop is 30 fps', () => {
  const fps = resolveTargetFloorFps(now, {
    isMobile: false,
    prefersReducedMotion: false,
    lastInputTs: now - INPUT_ACTIVE_FLOOR_MS - 100,
    isLanding: false,
    idleBreathEnvelope: 0,
    isSceneVisuallyIdle: true,
  });
  assert.equal(fps, FLOOR_FPS_IDLE_DESKTOP);
  assert.equal(fps, 30);
});

test('interior visually idle mobile is 24 fps', () => {
  const fps = resolveTargetFloorFps(now, {
    isMobile: true,
    prefersReducedMotion: false,
    lastInputTs: now - 10_000,
    isLanding: false,
    idleBreathEnvelope: 0,
    isSceneVisuallyIdle: true,
  });
  assert.equal(fps, FLOOR_FPS_IDLE_MOBILE);
});

test('idle breath envelope uses breath floor', () => {
  const fps = resolveTargetFloorFps(now, {
    isMobile: false,
    prefersReducedMotion: false,
    lastInputTs: now - 10_000,
    isLanding: false,
    idleBreathEnvelope: 0.5,
    isSceneVisuallyIdle: false,
  });
  assert.equal(fps, FLOOR_FPS_BREATH_DESKTOP);
});

test('recent input uses active floor', () => {
  const fps = resolveTargetFloorFps(now, {
    isMobile: false,
    prefersReducedMotion: false,
    lastInputTs: now - 200,
    isLanding: false,
    idleBreathEnvelope: 0,
    isSceneVisuallyIdle: true,
  });
  assert.equal(fps, FLOOR_FPS_ACTIVE_DESKTOP);
});

test('landing uses active floor', () => {
  const fps = resolveTargetFloorFps(now, {
    isMobile: false,
    prefersReducedMotion: false,
    lastInputTs: now - 10_000,
    isLanding: true,
    idleBreathEnvelope: 0,
    isSceneVisuallyIdle: false,
  });
  assert.equal(fps, FLOOR_FPS_ACTIVE_DESKTOP);
});

test('reduced motion uses reduced floor', () => {
  const fps = resolveTargetFloorFps(now, {
    isMobile: false,
    prefersReducedMotion: true,
    lastInputTs: now - 100,
    isLanding: true,
    idleBreathEnvelope: 0,
    isSceneVisuallyIdle: false,
  });
  assert.equal(fps, FLOOR_FPS_REDUCED_DESKTOP);
});

test('mobile recent input uses 30 fps active', () => {
  const fps = resolveTargetFloorFps(now, {
    isMobile: true,
    prefersReducedMotion: false,
    lastInputTs: now - 50,
    isLanding: false,
    idleBreathEnvelope: 0,
    isSceneVisuallyIdle: true,
  });
  assert.equal(fps, FLOOR_FPS_ACTIVE_MOBILE);
});

test('mobile breath floor', () => {
  const fps = resolveTargetFloorFps(now, {
    isMobile: true,
    prefersReducedMotion: false,
    lastInputTs: now - 10_000,
    isLanding: false,
    idleBreathEnvelope: 0.8,
    isSceneVisuallyIdle: false,
  });
  assert.equal(fps, FLOOR_FPS_BREATH_MOBILE);
});
