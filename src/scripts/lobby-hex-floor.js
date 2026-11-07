/**
 * lobby-hex-floor.js — Hex grout overlay (layer 1).
 *
 * Boot: LineSegments2 fat lines (crisp cyan→gold grout).
 * After settle: optional async upgrade to procedural plane with fwidth AA.
 * Fallback: keep lines when the custom shader fails to compile.
 */

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  HORIZON_LANDING_CAM_X,
  HORIZON_LANDING_CAM_Z,
  HORIZON_NAVY_MIX_GLSL,
  computeHorizonNavyMix,
  createHorizonFadeUniforms,
} from './lobby-horizon-fade.mjs';

/** Circumradius (center → vertex); matches legacy buildHexLinesColored grid. */
export const HEX_FLOOR_RADIUS = 0.8;

/** Grout line half-width in world units (~2 CSS px at the hero camera). */
export const HEX_GROUT_HALF_WIDTH = 0.045;

/** Cyan→gold center mix (legacy buildHexLinesColored). */
export const HEX_CENTER_GOLD_MIX = 0.38;

/** Radial fade denominator scale (legacy invFade = 1 / (maxDist * 0.6)). */
export const HEX_FADE_RADIUS_SCALE = 0.6;

/** Legacy fat-line width in CSS pixels (fallback path). */
export const HEX_LINE_WIDTH_PX = 1.5;

export const HEX_GRID_COLS = 60;
export const HEX_GRID_ROWS = 50;

const SQRT3 = Math.sqrt(3);

const DEFAULT_CYAN = 0x00d4ff;
const DEFAULT_GOLD = 0xc9a227;

/**
 * @param {number} lx
 * @param {number} lz
 */
export function hexEdgeSignedDistance(lx, lz) {
  const ax = Math.abs(lx);
  const az = Math.abs(lz);
  const d = Math.max(ax * 0.5 + az * 0.8660254037844386, ax);
  return d - 0.5;
}

/**
 * @param {number} cols
 * @param {number} rows
 * @param {number} hexRadius
 */
export function computeHexFadeRadius(cols, rows, hexRadius = HEX_FLOOR_RADIUS) {
  const hexHeight = hexRadius * SQRT3;
  const totalW = cols * hexRadius * 1.5;
  const totalH = rows * hexHeight;
  const maxDist = Math.sqrt((totalW / 2) ** 2 + (totalH / 2) ** 2);
  return maxDist * HEX_FADE_RADIUS_SCALE;
}

/** Outer radius of the authored hex grid (world XZ) — bare floor begins beyond this. */
export function computeHexGridExtentRadius(cols, rows, hexRadius = HEX_FLOOR_RADIUS) {
  const hexHeight = hexRadius * SQRT3;
  const totalW = cols * hexRadius * 1.5;
  const totalH = rows * hexHeight;
  return Math.sqrt((totalW / 2) ** 2 + (totalH / 2) ** 2);
}

/**
 * @param {number} distFromOrigin
 * @param {number} fadeRadius
 * @param {number} [centerGoldMix]
 * @returns {{ r: number, g: number, b: number }}
 */
export function computeHexGroutColor(distFromOrigin, fadeRadius, centerGoldMix = HEX_CENTER_GOLD_MIX) {
  const cyan = { r: 0, g: 212 / 255, b: 1 };
  const gold = { r: 201 / 255, g: 162 / 255, b: 39 / 255 };
  const t = Math.min(Math.max(distFromOrigin / fadeRadius, 0), 1);
  const center = {
    r: cyan.r + (gold.r - cyan.r) * centerGoldMix,
    g: cyan.g + (gold.g - cyan.g) * centerGoldMix,
    b: cyan.b + (gold.b - cyan.b) * centerGoldMix,
  };
  return {
    r: center.r + (gold.r - center.r) * t,
    g: center.g + (gold.g - center.g) * t,
    b: center.b + (gold.b - center.b) * t,
  };
}

/**
 * @param {number} px
 * @param {number} pz
 * @returns {{ x: number, y: number }}
 */
export function hextile(px, pz) {
  const mod1 = (v) => ((v % 1) + 1) % 1;
  const ax = mod1(px) - 0.5;
  const az = mod1(pz) - 0.5;
  const bx = mod1(px - 0.5) - 0.5;
  const bz = mod1(pz - 0.5) - 0.5;
  if (ax * ax + az * az < bx * bx + bz * bz) return { x: ax, y: az };
  return { x: bx, y: bz };
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} [hexRadius]
 * @returns {number}
 */
export function hexGroutDistanceXZ(x, z, hexRadius = HEX_FLOOR_RADIUS) {
  const cell = hexRadius * SQRT3;
  const px = (x / cell) * SQRT3;
  const pz = (z / cell) * SQRT3;
  const gv = hextile(px, pz);
  return Math.abs(hexEdgeSignedDistance(gv.x, gv.y)) * cell;
}

/* Fog intentionally omitted — scene fog is subtle at floor height and fog
   chunks are the #1 source of ShaderMaterial compile failures in Three.js. */
const HEX_FLOOR_VERT = /* glsl */ `
varying vec3 vWorldPos;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HEX_FLOOR_FRAG = /* glsl */ `
uniform vec3 uColorCenter;
uniform vec3 uColorGold;
uniform float uOpacity;
uniform float uHexRadius;
uniform float uGroutHalfWidth;
uniform float uFadeRadius;
uniform float uNavyFadeRadialStart;
uniform float uNavyFadeRadialEnd;
uniform float uNavyFadeCamStart;
uniform float uNavyFadeCamEnd;

varying vec3 vWorldPos;

#include <common>

${HORIZON_NAVY_MIX_GLSL}

vec2 hextile(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508075688772);
  vec2 h = s * 0.5;
  vec2 a = mod(p, s) - h;
  vec2 b = mod(p - h, s) - h;
  return dot(a, a) < dot(b, b) ? a : b;
}

float hexEdgeSDF(vec2 gv) {
  gv = abs(gv);
  float d = max(gv.x * 0.5 + gv.y * 0.8660254037844386, gv.x);
  return d - 0.5;
}

float hexGroutDist(vec2 xz) {
  float sqrt3 = 1.7320508075688772;
  float cell = uHexRadius * sqrt3;
  vec2 p = xz / cell;
  vec2 gv = hextile(p * sqrt3);
  return abs(hexEdgeSDF(gv)) * cell;
}

void main() {
  vec2 xz = vWorldPos.xz;
  float d = hexGroutDist(xz);
  float aa = fwidth(d) * 1.35;
  float line = 1.0 - smoothstep(uGroutHalfWidth - aa, uGroutHalfWidth + aa, d);

  float radial = length(xz);
  float t = clamp(radial / uFadeRadius, 0.0, 1.0);
  vec3 groutColor = mix(uColorCenter, uColorGold, t);

  float navyMix = horizonNavyMix(
    xz,
    cameraPosition.xz,
    uNavyFadeRadialStart,
    uNavyFadeRadialEnd,
    uNavyFadeCamStart,
    uNavyFadeCamEnd
  );

  float alpha = line * uOpacity * (1.0 - navyMix);
  if (alpha < 0.001) discard;

  gl_FragColor = vec4(groutColor, alpha);
}
`;

/**
 * @param {number} hexRadius
 * @param {number} cols
 * @param {number} rows
 * @param {number} [cyanHex]
 * @param {number} [goldHex]
 * @param {number} [camX]
 * @param {number} [camZ]
 */
export function buildHexLinesColored(
  hexRadius,
  cols,
  rows,
  cyanHex = DEFAULT_CYAN,
  goldHex = DEFAULT_GOLD,
  camX = HORIZON_LANDING_CAM_X,
  camZ = HORIZON_LANDING_CAM_Z,
) {
  const verts = [];
  const vertColors = [];
  const hexHeight = hexRadius * SQRT3;
  const totalW = cols * hexRadius * 1.5;
  const totalH = rows * hexHeight;
  const hexExtent = computeHexGridExtentRadius(cols, rows, hexRadius);

  const cyanC = new THREE.Color(cyanHex);
  const goldC = new THREE.Color(goldHex);
  const tempC = new THREE.Color();
  const maxDist = Math.sqrt((totalW / 2) ** 2 + (totalH / 2) ** 2);
  const invFade = 1 / (maxDist * HEX_FADE_RADIUS_SCALE);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * hexRadius * 1.5 - totalW / 2;
      const z = row * hexHeight - totalH / 2 + (col % 2 === 1 ? hexHeight / 2 : 0);
      const t = Math.min(Math.sqrt(x * x + z * z) * invFade, 1.0);
      tempC.copy(cyanC).lerp(goldC, t);
      const lineKeep = 1 - computeHorizonNavyMix(x, z, camX, camZ, hexExtent);
      tempC.multiplyScalar(lineKeep);

      for (let i = 0; i < 6; i++) {
        const a1 = (Math.PI / 3) * i;
        const a2 = (Math.PI / 3) * ((i + 1) % 6);
        verts.push(
          x + hexRadius * Math.cos(a1), 0, z + hexRadius * Math.sin(a1),
          x + hexRadius * Math.cos(a2), 0, z + hexRadius * Math.sin(a2),
        );
        vertColors.push(tempC.r, tempC.g, tempC.b, tempC.r, tempC.g, tempC.b);
      }
    }
  }
  return { verts, vertColors };
}

/**
 * @param {object} opts
 * @param {number} opts.planeSize
 * @param {number} opts.y
 * @param {number} opts.opacity
 * @param {number} [opts.hexRadius]
 * @param {number} [opts.fadeRadius]
 * @param {number} [opts.groutHalfWidth]
 * @param {number} [opts.cols]
 * @param {number} [opts.rows]
 * @returns {THREE.Mesh}
 */
export function createProceduralHexFloor({
  planeSize,
  y,
  opacity,
  hexRadius = HEX_FLOOR_RADIUS,
  fadeRadius,
  groutHalfWidth = HEX_GROUT_HALF_WIDTH,
  cols = HEX_GRID_COLS,
  rows = HEX_GRID_ROWS,
}) {
  const fadeR = fadeRadius ?? computeHexFadeRadius(cols, rows, hexRadius);
  const hexExtent = computeHexGridExtentRadius(cols, rows, hexRadius);
  const horizonFade = createHorizonFadeUniforms(hexExtent);
  const centerColor = computeHexGroutColor(0, fadeR);
  const edgeColor = computeHexGroutColor(fadeR, fadeR);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColorCenter: { value: new THREE.Color(centerColor.r, centerColor.g, centerColor.b) },
      uColorGold: { value: new THREE.Color(edgeColor.r, edgeColor.g, edgeColor.b) },
      uOpacity: { value: opacity },
      uHexRadius: { value: hexRadius },
      uGroutHalfWidth: { value: groutHalfWidth },
      uFadeRadius: { value: fadeR },
      uNavyFadeRadialStart: horizonFade.navyFadeRadialStart,
      uNavyFadeRadialEnd: horizonFade.navyFadeRadialEnd,
      uNavyFadeCamStart: horizonFade.navyFadeCamStart,
      uNavyFadeCamEnd: horizonFade.navyFadeCamEnd,
    },
    vertexShader: HEX_FLOOR_VERT,
    fragmentShader: HEX_FLOOR_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    extensions: { derivatives: true },
  });

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(planeSize, planeSize, 1, 1),
    material,
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.frustumCulled = false;
  mesh.layers.set(1);
  mesh.name = 'hex-grout-procedural';

  return mesh;
}

/**
 * @param {object} opts
 * @param {number} opts.y
 * @param {number} opts.opacity
 * @param {number} opts.cssWidth
 * @param {number} opts.cssHeight
 * @param {number} [opts.hexRadius]
 * @param {number} [opts.cols]
 * @param {number} [opts.rows]
 * @param {number} [opts.cyanHex]
 * @param {number} [opts.goldHex]
 * @returns {{ mesh: LineSegments2, lineMaterial: LineMaterial }}
 */
export function createLineSegmentsHexFloor({
  y,
  opacity,
  cssWidth,
  cssHeight,
  hexRadius = HEX_FLOOR_RADIUS,
  cols = HEX_GRID_COLS,
  rows = HEX_GRID_ROWS,
  cyanHex = DEFAULT_CYAN,
  goldHex = DEFAULT_GOLD,
}) {
  const { verts, vertColors } = buildHexLinesColored(hexRadius, cols, rows, cyanHex, goldHex);
  const hexGeo = new LineSegmentsGeometry();
  hexGeo.setPositions(verts);
  hexGeo.setColors(vertColors);

  const lineMaterial = new LineMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    linewidth: HEX_LINE_WIDTH_PX,
    worldUnits: false,
    depthWrite: false,
    depthTest: true,
  });
  lineMaterial.resolution.set(cssWidth, cssHeight);

  const mesh = new LineSegments2(hexGeo, lineMaterial);
  mesh.position.y = y;
  mesh.computeLineDistances();
  mesh.frustumCulled = false;
  mesh.layers.set(1);
  mesh.name = 'hex-grout-lines';

  return { mesh, lineMaterial };
}

/**
 * Compile-test a procedural hex mesh. Returns false if the driver rejects the program.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Camera} camera
 * @param {THREE.Mesh} mesh
 * @returns {boolean}
 */
export function validateProceduralHexFloor(renderer, camera, mesh) {
  if (!renderer || !camera || !mesh?.material) return false;
  const prevCheck = renderer.debug.checkShaderErrors;
  renderer.debug.checkShaderErrors = true;
  try {
    renderer.compile(mesh, camera);
    const program = mesh.material.program;
    if (!program) return false;
    const gl = renderer.getContext();
    if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) return false;
    return true;
  } catch {
    return false;
  } finally {
    renderer.debug.checkShaderErrors = prevCheck;
  }
}

/**
 * Create hex grout — procedural first, LineSegments2 if shader compile fails.
 *
 * @param {object} opts
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {THREE.Camera} opts.camera
 * @param {number} opts.planeSize
 * @param {number} opts.y
 * @param {number} opts.opacity
 * @param {number} opts.cssWidth
 * @param {number} opts.cssHeight
 * @param {number} [opts.hexRadius]
 * @param {number} [opts.cols]
 * @param {number} [opts.rows]
 * @param {number} [opts.cyanHex]
 * @param {number} [opts.goldHex]
 * @returns {{ mesh: THREE.Object3D, mode: 'procedural' | 'lines', lineMaterial: LineMaterial | null }}
 */
export function createHexGroutFloor({
  renderer,
  camera,
  planeSize,
  y,
  opacity,
  cssWidth,
  cssHeight,
  hexRadius = HEX_FLOOR_RADIUS,
  cols = HEX_GRID_COLS,
  rows = HEX_GRID_ROWS,
  cyanHex = DEFAULT_CYAN,
  goldHex = DEFAULT_GOLD,
}) {
  const fadeRadius = computeHexFadeRadius(cols, rows, hexRadius);
  const procedural = createProceduralHexFloor({
    planeSize,
    y,
    opacity,
    hexRadius,
    fadeRadius,
    cols,
    rows,
  });

  if (validateProceduralHexFloor(renderer, camera, procedural)) {
    return { mesh: procedural, mode: 'procedural', lineMaterial: null };
  }

  procedural.geometry.dispose();
  procedural.material.dispose();

  const { mesh, lineMaterial } = createLineSegmentsHexFloor({
    y,
    opacity,
    cssWidth,
    cssHeight,
    hexRadius,
    cols,
    rows,
    cyanHex,
    goldHex,
  });
  return { mesh, mode: 'lines', lineMaterial };
}

/**
 * @param {THREE.Mesh | null | undefined} mesh
 */
export function disposeProceduralHexFloor(mesh) {
  if (!mesh) return;
  mesh.geometry?.dispose();
  if (mesh.material) mesh.material.dispose();
}

/**
 * @param {LineSegments2 | null | undefined} mesh
 * @param {LineMaterial | null | undefined} lineMaterial
 */
export function disposeLineSegmentsHexFloor(mesh, lineMaterial) {
  if (mesh?.geometry) mesh.geometry.dispose();
  if (lineMaterial) lineMaterial.dispose();
}

/**
 * Boot with LineSegments2, then compile-test procedural hex off the hot path.
 * Swaps meshes in-place when the driver accepts the shader; otherwise keeps lines.
 *
 * @param {object} opts
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {THREE.Camera} opts.camera
 * @param {THREE.Scene} opts.scene
 * @param {THREE.Group} opts.parentGroup
 * @param {LineSegments2} opts.linesMesh
 * @param {LineMaterial | null} opts.lineMaterial
 * @param {number} opts.planeSize
 * @param {number} opts.y
 * @param {number} [opts.hexRadius]
 * @param {number} [opts.cols]
 * @param {number} [opts.rows]
 * @param {number} [opts.cyanHex]
 * @param {number} [opts.goldHex]
 * @param {() => number} [opts.getOpacity]
 * @param {(mesh: THREE.Mesh, mode: 'procedural') => void} [opts.onSwapped]
 * @returns {Promise<'procedural' | 'lines'>}
 */
export async function upgradeHexGroutToProceduralAsync({
  renderer,
  camera,
  scene,
  parentGroup,
  linesMesh,
  lineMaterial,
  planeSize,
  y,
  hexRadius = HEX_FLOOR_RADIUS,
  cols = HEX_GRID_COLS,
  rows = HEX_GRID_ROWS,
  getOpacity,
  onSwapped,
}) {
  if (!renderer || !camera || !parentGroup || !linesMesh) return 'lines';

  const opacity = typeof getOpacity === 'function'
    ? getOpacity()
    : (lineMaterial?.opacity ?? 0.54);
  const fadeRadius = computeHexFadeRadius(cols, rows, hexRadius);
  const centerColor = computeHexGroutColor(0, fadeRadius);
  const edgeColor = computeHexGroutColor(fadeRadius, fadeRadius);

  const procedural = createProceduralHexFloor({
    planeSize,
    y,
    opacity,
    hexRadius,
    fadeRadius,
    cols,
    rows,
  });

  /* Re-apply brand colors — createProceduralHexFloor uses defaults internally. */
  procedural.material.uniforms.uColorCenter.value.setRGB(centerColor.r, centerColor.g, centerColor.b);
  procedural.material.uniforms.uColorGold.value.setRGB(edgeColor.r, edgeColor.g, edgeColor.b);

  try {
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(procedural, camera, scene);
    }
    if (!validateProceduralHexFloor(renderer, camera, procedural)) {
      disposeProceduralHexFloor(procedural);
      return 'lines';
    }

    parentGroup.remove(linesMesh);
    parentGroup.add(procedural);
    disposeLineSegmentsHexFloor(linesMesh, lineMaterial);
    if (onSwapped) onSwapped(procedural, 'procedural');
    return 'procedural';
  } catch {
    disposeProceduralHexFloor(procedural);
    return 'lines';
  }
}
