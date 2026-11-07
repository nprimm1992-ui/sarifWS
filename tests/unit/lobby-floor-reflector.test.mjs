import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOBBY_BACKDROP_LAYER,
  LOBBY_BG_HEX,
  REFLECTOR_HORIZON_FILL_HEX,
  GoldReflectorShader,
  configureReflectorMirrorPass,
  createLobbyHorizonShell,
  createReflectiveGoldFloor,
} from '../../src/scripts/lobby-floor.js';
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
  resolveHorizonFadeEdges,
} from '../../src/scripts/lobby-horizon-fade.mjs';

test('createReflectiveGoldFloor mirror camera sees layer 0 only', () => {
  const floor = createReflectiveGoldFloor(300, -3, 1280, 720, false);
  assert.equal(floor.camera.layers.mask, 1, 'only default layer 0');
  assert.equal(floor.camera.layers.test(LOBBY_BACKDROP_LAYER), false, 'sky dome layer excluded');
  floor.geometry.dispose();
  floor.material.dispose();
  floor.getRenderTarget().dispose();
});

test('configureReflectorMirrorPass wraps onBeforeRender without dropping layer mask', () => {
  const floor = createReflectiveGoldFloor(300, -3, 1280, 720, false);
  assert.equal(typeof floor.onBeforeRender, 'function');
  assert.equal(floor.camera.layers.mask, 1);
  configureReflectorMirrorPass(floor);
  assert.equal(floor.camera.layers.mask, 1);
  assert.equal(typeof floor.onBeforeRender, 'function');
  floor.geometry.dispose();
  floor.material.dispose();
  floor.getRenderTarget().dispose();
});

test('GoldReflectorShader fades floor to navy with dual radial + camera metrics', () => {
  assert.equal(GoldReflectorShader.uniforms.skyHorizonColor, undefined);
  assert.ok(GoldReflectorShader.uniforms.navyHorizon);
  assert.equal(GoldReflectorShader.uniforms.navyHorizon.value.getHex(), LOBBY_BG_HEX);
  const extent = computeHexGridExtentRadius(HEX_GRID_COLS, HEX_GRID_ROWS, HEX_FLOOR_RADIUS);
  const edges = resolveHorizonFadeEdges(extent);
  assert.equal(GoldReflectorShader.uniforms.navyFadeRadialStart.value, edges.radialStart);
  assert.equal(GoldReflectorShader.uniforms.navyFadeRadialEnd.value, edges.radialEnd);
  assert.equal(GoldReflectorShader.uniforms.navyFadeCamStart.value, edges.camStart);
  assert.equal(GoldReflectorShader.uniforms.navyFadeCamEnd.value, edges.camEnd);
  assert.ok(edges.radialStart < extent * HORIZON_NAVY_FADE_START_FRAC + 0.01);
  assert.ok(edges.radialEnd < extent * HORIZON_NAVY_FADE_END_FRAC + 0.01);
  assert.equal(edges.camEnd, HORIZON_NAVY_CAM_END);
  assert.equal(
    GoldReflectorShader.uniforms.horizonFill.value.getHex(),
    REFLECTOR_HORIZON_FILL_HEX,
  );
});

test('createLobbyHorizonShell anchors its base to the floor Y', () => {
  const shell = createLobbyHorizonShell(LOBBY_BG_HEX, -3);
  const bottomY = shell.position.y - shell.geometry.parameters.height * 0.5;
  assert.equal(bottomY, -3);
  shell.geometry.dispose();
  shell.material.dispose();
});
