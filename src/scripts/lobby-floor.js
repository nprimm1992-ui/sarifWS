/**

 * lobby-floor.js — Reflective gold mirror floor + PMREM fallbacks for the lobby.

 *

 * Visual target: honeycomb gold mirror tiles (warm amber reflection, dark grout

 * gaps between hex cells). Hex grout lines live on layer 1; Reflector renders

 * layer 0 only so tile interiors mirror the scene without doubling hex geometry.

 */



import * as THREE from 'three';

import { UniformsLib, UniformsUtils } from 'three';

import { Reflector } from 'three/addons/objects/Reflector.js';

import { resolveReflectFloorProfile } from './lobby-display-tier.mjs';
import {
  HEX_FLOOR_RADIUS,
  HEX_GRID_COLS,
  HEX_GRID_ROWS,
  computeHexGridExtentRadius,
} from './lobby-hex-floor.js';
import {
  HORIZON_NAVY_MIX_GLSL,
  createHorizonFadeUniforms,
} from './lobby-horizon-fade.mjs';



/** Rich amber-gold overlay on mirror reflections (reference: gold hex mirror tiles). */

export const REFLECTOR_GOLD_TINT = 0xe8c45a;

export const LOBBY_BG_HEX = 0x1a2e3c;

/** Main-camera-only layer: sky dome + horizon shell (Reflector = layer 0). */
export const LOBBY_BACKDROP_LAYER = 2;

/** Dark neutral fill for invalid mirror projection samples only. */
export const REFLECTOR_HORIZON_FILL_HEX = 0x161c22;

/** Default lobby floor Y — horizon shell bottom aligns here. */
export const LOBBY_FLOOR_Y = -3;



/** Warm highlight boost on bright gold areas — scaled by gold mix in shader. */
const REFLECTOR_GOLD_HIGHLIGHT_BOOST = 0.3;

/** Overlay strength for desaturated / floor regions (cyan glyphs preserve hue). */
const REFLECTOR_GOLD_TINT_STRENGTH = 0.78;

/** How strongly saturated cool reflections resist the amber overlay. */
const REFLECTOR_CHROMA_PRESERVE = 0.82;

/** Constant gold wash so empty mirror tiles read amber, not gray. */
const REFLECTOR_GOLD_FLOOR_WASH = 0.24;

/** Brighten mirror base in the reflected field (not horizon fill). */
const REFLECTOR_FLOOR_EXPOSURE = 1.14;

const REFLECTOR_FLOOR_AMBIENT_LIFT = 0.06;

/** Extra lift toward floor center (world XZ) for a lighter center field. */
const REFLECTOR_FLOOR_CENTER_LIFT = 0.08;

/** Interior sky sphere radius — fills view past the floor vanishing line. */
export const LOBBY_SKY_DOME_RADIUS = 200;

/** Open cylinder — navy interior wall from floor level to sky dome. */
export const LOBBY_HORIZON_SHELL_RADIUS = 168;

export const LOBBY_HORIZON_SHELL_HEIGHT = 96;



/**

 * Custom Reflector shader: overlay tint + specular gold punch on bright pixels.

 * Matches three.js ReflectorShader layout so Reflector wiring stays unchanged.

 */

export const GoldReflectorShader = {

  name: 'GoldReflectorShader',

  uniforms: UniformsUtils.merge([

    UniformsLib.fog,

    {

      color: { value: null },

      tDiffuse: { value: null },

      textureMatrix: { value: null },

      goldHighlightBoost: { value: REFLECTOR_GOLD_HIGHLIGHT_BOOST },

      goldTintStrength: { value: REFLECTOR_GOLD_TINT_STRENGTH },

      chromaPreserve: { value: REFLECTOR_CHROMA_PRESERVE },

      floorExposure: { value: REFLECTOR_FLOOR_EXPOSURE },

      floorAmbientLift: { value: REFLECTOR_FLOOR_AMBIENT_LIFT },

      floorCenterLift: { value: REFLECTOR_FLOOR_CENTER_LIFT },

      horizonFill: { value: new THREE.Color(REFLECTOR_HORIZON_FILL_HEX) },

      navyHorizon: { value: new THREE.Color(LOBBY_BG_HEX) },

      ...createHorizonFadeUniforms(
        computeHexGridExtentRadius(HEX_GRID_COLS, HEX_GRID_ROWS, HEX_FLOOR_RADIUS),
      ),

      goldFloorWash: { value: REFLECTOR_GOLD_FLOOR_WASH },

    },

  ]),

  vertexShader: /* glsl */`

    uniform mat4 textureMatrix;

    varying vec4 vUv;

    varying vec3 vWorldPos;



    #include <common>

    #include <fog_pars_vertex>

    #include <logdepthbuf_pars_vertex>



    void main() {

      vUv = textureMatrix * vec4( position, 1.0 );

      vWorldPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;

      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

      gl_Position = projectionMatrix * mvPosition;

      #include <logdepthbuf_vertex>

      #include <fog_vertex>

    }

  `,

  fragmentShader: /* glsl */`

    uniform vec3 color;

    uniform sampler2D tDiffuse;

    uniform float goldHighlightBoost;

    uniform float goldTintStrength;

    uniform float chromaPreserve;

    uniform float floorExposure;

    uniform float floorAmbientLift;

    uniform float floorCenterLift;

    uniform vec3 horizonFill;

    uniform vec3 navyHorizon;

    uniform float navyFadeRadialStart;

    uniform float navyFadeRadialEnd;

    uniform float navyFadeCamStart;

    uniform float navyFadeCamEnd;

    uniform float goldFloorWash;

    varying vec4 vUv;

    varying vec3 vWorldPos;



    #include <common>



    #include <fog_pars_fragment>

    #include <logdepthbuf_pars_fragment>



    float blendOverlay( float base, float blend ) {

      return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );

    }



    vec3 blendOverlay( vec3 base, vec3 blend ) {

      return vec3(

        blendOverlay( base.r, blend.r ),

        blendOverlay( base.g, blend.g ),

        blendOverlay( base.b, blend.b )

      );

    }



    ${HORIZON_NAVY_MIX_GLSL}



    void main() {

      #include <logdepthbuf_fragment>



      float projValid = smoothstep( 0.0, 0.1, vUv.w );

      vec3 refl = texture2DProj( tDiffuse, vUv ).rgb;

      vec3 src = mix( horizonFill, refl, projValid );

      float goldField = smoothstep( 0.18, 0.78, projValid );



      float maxC = max( src.r, max( src.g, src.b ) );

      float minC = min( src.r, min( src.g, src.b ) );

      float sat = maxC - minC;

      float coolBias = clamp( ( src.b - src.r ) * 1.6 + ( src.g - src.r ) * 0.45, 0.0, 1.0 );

      float preserve = clamp( sat * 2.2 * coolBias, 0.0, 1.0 ) * chromaPreserve;



      vec3 goldTinted = blendOverlay( src, color );

      float goldMix = goldTintStrength * ( 1.0 - preserve * 0.88 ) * goldField;

      vec3 tinted = mix( src, goldTinted, goldMix );



      float luma = max( max( tinted.r, tinted.g ), tinted.b );

      tinted += color * ( luma * luma ) * goldHighlightBoost * goldMix;

      tinted += color * goldFloorWash * goldField;



      tinted *= mix( 1.0, floorExposure, goldField );

      tinted += vec3( floorAmbientLift * goldField );



      float radial = length( vWorldPos.xz );

      tinted += vec3( smoothstep( 22.0, 5.0, radial ) * floorCenterLift * goldField );

      float navyMix = horizonNavyMix(
        vWorldPos.xz,
        cameraPosition.xz,
        navyFadeRadialStart,
        navyFadeRadialEnd,
        navyFadeCamStart,
        navyFadeCamEnd
      );

      tinted = mix( tinted, navyHorizon, navyMix );



      gl_FragColor = vec4( tinted, 1.0 );



      #include <tonemapping_fragment>

      #include <colorspace_fragment>

    }

  `,

};



/**

 * @param {number} cssWidth

 * @param {number} cssHeight

 * @param {boolean} mobile

 * @param {boolean} [motionActive]
 * @returns {number}
 */
export function resolveReflectFloorResolution(cssWidth, cssHeight, mobile, gpuTier = 0, motionActive = true, bootPhase = false) {
  return resolveReflectFloorProfile(cssWidth, cssHeight, mobile, gpuTier, motionActive, bootPhase).resolution;
}

/** Assign object + descendants to a camera layer (e.g. backdrop not mirrored). */
export function assignLobbyLayer(root, layer) {
  root.layers.set(layer);
  root.traverse((child) => child.layers.set(layer));
}

const _mirrorPassClear = new THREE.Color(LOBBY_BG_HEX);

/**
 * Reflector virtual camera: layer 0 only (emblem, planters, floaters).
 * Sky dome + horizon shell stay on LOBBY_BACKDROP_LAYER and are excluded.
 * Mirror sub-pass uses Sarif navy clear + no fog so upward samples match the sky.
 *
 * @param {import('three/addons/objects/Reflector.js').Reflector} reflector
 */
export function configureReflectorMirrorPass(reflector) {
  reflector.camera.layers.disableAll();
  reflector.camera.layers.enable(0);

  const reflectorOnBeforeRender = reflector.onBeforeRender.bind(reflector);
  reflector.onBeforeRender = function onReflectorMirrorPass(renderer, scene, mainCamera) {
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.background = _mirrorPassClear;
    scene.fog = null;
    reflectorOnBeforeRender(renderer, scene, mainCamera);
    scene.background = prevBg;
    scene.fog = prevFog;
  };
}

/**
 * Infinite lobby ceiling — solid Sarif navy inside a large sphere.
 * @param {number} [radius]
 * @param {number} [skyHex]
 */
export function createLobbySkyDome(radius = LOBBY_SKY_DOME_RADIUS, skyHex = LOBBY_BG_HEX) {

  const geo = new THREE.SphereGeometry(radius, 36, 18);

  geo.scale(-1, 1, 1);

  const mat = new THREE.MeshBasicMaterial({

    color: skyHex,

    side: THREE.BackSide,

    fog: false,

    depthWrite: false,

  });

  const dome = new THREE.Mesh(geo, mat);

  dome.name = 'lobby-sky-dome';

  dome.renderOrder = -2000;

  dome.frustumCulled = false;

  dome.userData.sarifSkyDome = true;

  assignLobbyLayer(dome, LOBBY_BACKDROP_LAYER);

  return dome;

}



/**
 * Open-ended interior cylinder — navy wall from floor level up to the sky dome.
 * @param {number} [skyHex]
 * @param {number} [floorY]
 */
export function createLobbyHorizonShell(skyHex = LOBBY_BG_HEX, floorY = LOBBY_FLOOR_Y) {

  const geo = new THREE.CylinderGeometry(

    LOBBY_HORIZON_SHELL_RADIUS,

    LOBBY_HORIZON_SHELL_RADIUS,

    LOBBY_HORIZON_SHELL_HEIGHT,

    64,

    1,

    true,

  );

  const mat = new THREE.MeshBasicMaterial({

    color: skyHex,

    side: THREE.BackSide,

    fog: false,

    depthWrite: false,

  });

  const shell = new THREE.Mesh(geo, mat);

  shell.name = 'lobby-horizon-shell';

  shell.position.set(0, floorY + LOBBY_HORIZON_SHELL_HEIGHT * 0.5, 0);

  shell.renderOrder = -1990;

  shell.frustumCulled = false;

  shell.userData.sarifHorizonShell = true;

  assignLobbyLayer(shell, LOBBY_BACKDROP_LAYER);

  return shell;

}



/**

 * @param {boolean} prefersReducedMotion

 */

export function shouldUseReflectiveFloor(prefersReducedMotion) {

  if (prefersReducedMotion) return false;

  const dm = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;

  if (typeof dm === 'number' && dm > 0 && dm <= 4) return false;

  return true;

}



/**

 * @param {number} floorSize

 * @param {number} floorY

 * @param {number} cssWidth

 * @param {number} cssHeight

 * @param {boolean} mobile

 * @param {number} [gpuTier]
 * @param {boolean} [motionActive]

 */

function buildReflectiveGoldFloor(floorSize, floorY, cssWidth, cssHeight, mobile, gpuTier = 0, motionActive = true, bootPhase = false) {

  const profile = resolveReflectFloorProfile(cssWidth, cssHeight, mobile, gpuTier, motionActive, bootPhase);

  const reflector = new Reflector(new THREE.PlaneGeometry(floorSize, floorSize), {

    clipBias: 0.001,

    textureWidth: profile.resolution,

    textureHeight: profile.resolution,

    color: REFLECTOR_GOLD_TINT,

    shader: GoldReflectorShader,

    multisample: profile.multisample,

  });

  reflector.rotation.x = -Math.PI / 2;

  reflector.position.y = floorY;

  reflector.material.fog = false;

  if (reflector.material.uniforms.horizonFill) {
    reflector.material.uniforms.horizonFill.value.set(REFLECTOR_HORIZON_FILL_HEX);
  }
  if (reflector.material.uniforms.navyHorizon) {
    reflector.material.uniforms.navyHorizon.value.set(LOBBY_BG_HEX);
  }
  const hexExtent = computeHexGridExtentRadius(
    HEX_GRID_COLS,
    HEX_GRID_ROWS,
    HEX_FLOOR_RADIUS,
  );
  const horizonFade = createHorizonFadeUniforms(hexExtent);
  for (const [key, uniform] of Object.entries(horizonFade)) {
    if (reflector.material.uniforms[key]) {
      reflector.material.uniforms[key].value = uniform.value;
    }
  }

  configureReflectorMirrorPass(reflector);

  reflector.userData.sarifFloorKind = 'reflector';

  reflector.userData.sarifFloorRes = profile.resolution;

  reflector.userData.sarifFloorMsaa = profile.multisample;

  return reflector;

}



/**

 * Live mirror floor — saturated gold mirror tiles (scene reflected through amber tint).

 *

 * @param {number} floorSize

 * @param {number} floorY

 * @param {number} cssWidth

 * @param {number} cssHeight

 * @param {boolean} mobile

 * @param {number} [gpuTier]
 * @param {boolean} [motionActive]

 */

export function createReflectiveGoldFloor(floorSize, floorY, cssWidth, cssHeight, mobile, gpuTier = 0, motionActive = true, bootPhase = false) {

  return buildReflectiveGoldFloor(floorSize, floorY, cssWidth, cssHeight, mobile, gpuTier, motionActive, bootPhase);

}



/**

 * Swap reflector RT resolution without rebuilding hex grout (parent holds floor + hex).

 *

 * @param {THREE.Object3D} floorMesh

 * @param {number} floorSize

 * @param {number} floorY

 * @param {number} cssWidth

 * @param {number} cssHeight

 * @param {boolean} mobile

 * @param {number} [gpuTier]
 * @param {boolean} [motionActive]

 * @returns {THREE.Object3D}

 */

export function resizeReflectiveGoldFloor(

  floorMesh,

  floorSize,

  floorY,

  cssWidth,

  cssHeight,

  mobile,

  gpuTier = 0,

  motionActive = true,

  bootPhase = false,

) {

  if (!floorMesh || floorMesh.userData.sarifFloorKind !== 'reflector') return floorMesh;

  const profile = resolveReflectFloorProfile(cssWidth, cssHeight, mobile, gpuTier, motionActive, bootPhase);

  if (
    floorMesh.userData.sarifFloorRes === profile.resolution
    && floorMesh.userData.sarifFloorMsaa === profile.multisample
  ) return floorMesh;



  const parent = floorMesh.parent;

  disposeFloorResources(floorMesh);

  if (floorMesh.geometry) floorMesh.geometry.dispose();

  if (floorMesh.material) floorMesh.material.dispose();



  const newFloor = buildReflectiveGoldFloor(floorSize, floorY, cssWidth, cssHeight, mobile, gpuTier, motionActive, bootPhase);

  if (parent) {

    parent.remove(floorMesh);

    parent.add(newFloor);

  }

  return newFloor;

}



/**

 * Static PMREM-backed floor when live mirror is inappropriate.

 *

 * @param {number} floorSize

 * @param {number} floorY

 * @param {number} [goldHex]

 */

export function createPmremGoldFloorFallback(floorSize, floorY, goldHex = 0xc9a227) {

  const floorMat = new THREE.MeshStandardMaterial({

    color: 0x0f1a22,

    roughness: 0.04,

    metalness: 0.94,

    envMapIntensity: 1.45,

    emissive: new THREE.Color(goldHex),

    emissiveIntensity: 0.18,

    fog: true,

  });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), floorMat);

  floor.rotation.x = -Math.PI / 2;

  floor.position.y = floorY;

  floor.userData.sarifFloorKind = 'pmrem';

  return floor;

}



/**

 * Dispose reflector GPU resources not covered by generic material.dispose().

 *

 * @param {THREE.Object3D | null | undefined} floorMesh

 */

export function disposeFloorResources(floorMesh) {

  if (!floorMesh || floorMesh.userData.sarifFloorKind !== 'reflector') return;

  const mat = floorMesh.material;

  if (!mat || !mat.uniforms || !mat.uniforms.tDiffuse) return;

  const tex = mat.uniforms.tDiffuse.value;

  if (tex && typeof tex.dispose === 'function') tex.dispose();

}


