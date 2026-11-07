import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEX_FLOOR_RADIUS,
  HEX_GRID_COLS,
  HEX_GRID_ROWS,
  buildHexLinesColored,
  computeHexFadeRadius,
  computeHexGridExtentRadius,
  computeHexGroutColor,
  createProceduralHexFloor,
  hexEdgeSignedDistance,
  hexGroutDistanceXZ,
  hextile,
  upgradeHexGroutToProceduralAsync,
} from '../../src/scripts/lobby-hex-floor.js';

test('computeHexGridExtentRadius matches 60×50 authored footprint', () => {
  const r = computeHexGridExtentRadius(HEX_GRID_COLS, HEX_GRID_ROWS, HEX_FLOOR_RADIUS);
  assert.ok(r > 48 && r < 52, `expected ~50, got ${r}`);
});

test('computeHexFadeRadius matches legacy 60×50 footprint', () => {
  const r = computeHexFadeRadius(60, 50, HEX_FLOOR_RADIUS);
  assert.ok(r > 25 && r < 35, `expected ~30, got ${r}`);
});

test('computeHexFadeRadius matches production 60×50 footprint', () => {
  const r = computeHexFadeRadius(HEX_GRID_COLS, HEX_GRID_ROWS, HEX_FLOOR_RADIUS);
  assert.ok(r > 25 && r < 35, `expected ~30, got ${r}`);
  assert.equal(HEX_GRID_COLS, 60);
  assert.equal(HEX_GRID_ROWS, 50);
});

test('createProceduralHexFloor exposes horizon fade uniforms', () => {
  const mesh = createProceduralHexFloor({ planeSize: 200, y: -3, opacity: 0.5 });
  assert.ok(mesh.material.uniforms.uNavyFadeRadialStart);
  assert.ok(mesh.material.uniforms.uNavyFadeCamEnd);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test('computeHexGroutColor is cyan-leaning at origin and gold at fade edge', () => {
  const fade = computeHexFadeRadius(60, 50, HEX_FLOOR_RADIUS);
  const center = computeHexGroutColor(0, fade);
  const edge = computeHexGroutColor(fade, fade);
  assert.ok(center.b > center.r, 'center should lean cyan');
  assert.ok(edge.r > edge.b, 'edge should lean gold');
});

test('hexGroutDistanceXZ hits near-zero on grout lines', () => {
  let min = Infinity;
  for (let i = -40; i <= 40; i++) {
    for (let j = -40; j <= 40; j++) {
      min = Math.min(min, hexGroutDistanceXZ(i * 0.2, j * 0.17));
    }
  }
  assert.ok(min < 0.02, `min grout distance ${min} should be near zero`);
});

test('hexEdgeSignedDistance peaks at cell centers', () => {
  const cell = HEX_FLOOR_RADIUS * Math.sqrt(3);
  const edgeDist = Math.abs(hexEdgeSignedDistance(0.5, 0)) * cell;
  const centerDist = Math.abs(hexEdgeSignedDistance(0, 0)) * cell;
  assert.ok(centerDist > edgeDist, 'cell center should be farther from grout than edge');
});

test('hexEdgeSignedDistance is negative inside and positive outside unit cell', () => {
  assert.ok(hexEdgeSignedDistance(0, 0) < 0);
  assert.ok(hexEdgeSignedDistance(0.6, 0) > 0);
});

test('hextile returns bounded coordinates', () => {
  const local = hextile(12.3, -4.7);
  assert.ok(Math.abs(local.x) <= 0.5);
  assert.ok(Math.abs(local.y) <= 0.5);
});

test('buildHexLinesColored produces paired segment vertices', () => {
  const { verts, vertColors } = buildHexLinesColored(HEX_FLOOR_RADIUS, 4, 4);
  assert.equal(verts.length, 4 * 4 * 6 * 6);
  assert.equal(vertColors.length, verts.length);
});

test('upgradeHexGroutToProceduralAsync keeps lines when renderer is absent', async () => {
  const mode = await upgradeHexGroutToProceduralAsync({
    renderer: null,
    camera: null,
    scene: null,
    parentGroup: null,
    linesMesh: null,
    lineMaterial: null,
    planeSize: 300,
    y: -2.99,
  });
  assert.equal(mode, 'lines');
});
