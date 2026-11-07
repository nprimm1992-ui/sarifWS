import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLobbyDprCap,
  resolveBloomScale,
  resolveReflectFloorRes,
  resolveReflectFloorMultisample,
  resolveReflectFloorProfile,
  snapReflectFloorRes,
  LOBBY_TIER_FULL_HD_CSS_PIXELS,
  LOBBY_TIER_QHD_CSS_PIXELS,
} from '../../src/scripts/lobby-display-tier.mjs';

test('snapReflectFloorRes picks nearest allowed size', () => {
  assert.equal(snapReflectFloorRes(900), 768);
  assert.equal(snapReflectFloorRes(560), 512);
  assert.equal(snapReflectFloorRes(1100), 1024);
});

test('tier 0 desktop DPR caps are tightened vs legacy 1.65', () => {
  const w = 1280;
  const h = 720;
  const cap = resolveLobbyDprCap(w, h, false, 0, 2);
  assert.ok(cap <= 1.15);
});

test('QHD desktop DPR cap at tier 0', () => {
  const w = 2560;
  const h = 1441;
  const cap = resolveLobbyDprCap(w, h, false, 0, 2);
  assert.ok(cap <= 1.1);
});

test('mobile DPR cap at tier 0', () => {
  const cap = resolveLobbyDprCap(390, 844, true, 0, 3);
  assert.ok(cap <= 1.35);
});

test('GPU tier multipliers reduce DPR and bloom monotonically', () => {
  const w = 1280;
  const h = 720;
  const dpr0 = resolveLobbyDprCap(w, h, false, 0, 2);
  const dpr2 = resolveLobbyDprCap(w, h, false, 2, 2);
  assert.ok(dpr2 < dpr0);

  const bloom0 = resolveBloomScale(false, w, h, true, 0);
  const bloom2 = resolveBloomScale(false, w, h, true, 2);
  assert.ok(bloom2 < bloom0);

  const ref0 = resolveReflectFloorRes(w, h, false, 0, true);
  const ref2 = resolveReflectFloorRes(w, h, false, 2, true);
  assert.ok(ref2 < ref0);
});

test('tier 0 desktop reflector restores 1024 when motion active', () => {
  const w = 1280;
  const h = 720;
  assert.equal(resolveReflectFloorRes(w, h, false, 0, true), 1024);
  assert.equal(resolveReflectFloorMultisample(false, 0, true), 4);
});

test('tier 0 desktop reflector eases to 768 without MSAA when visually idle', () => {
  const w = 1280;
  const h = 720;
  assert.equal(resolveReflectFloorRes(w, h, false, 0, false), 768);
  assert.equal(resolveReflectFloorMultisample(false, 0, false), 0);
});

test('reflector profile bundles resolution and multisample', () => {
  const profile = resolveReflectFloorProfile(1280, 720, false, 0, true);
  assert.deepEqual(profile, { resolution: 1024, multisample: 4 });
});

test('boot phase reflector uses 512 and MSAA 0 on desktop', () => {
  const w = 1280;
  const h = 720;
  assert.equal(resolveReflectFloorRes(w, h, false, 0, true, true), 512);
  assert.equal(resolveReflectFloorMultisample(false, 0, true, true), 0);
  assert.deepEqual(resolveReflectFloorProfile(w, h, false, 0, true, true), { resolution: 512, multisample: 0 });
});

test('full HD breakpoint constant matches usage', () => {
  assert.equal(LOBBY_TIER_FULL_HD_CSS_PIXELS, 1920 * 1080);
  assert.equal(LOBBY_TIER_QHD_CSS_PIXELS, 2560 * 1440);
});
