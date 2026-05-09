import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/* ═══════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════ */

const LABELS = [
  'Market Position',
  'Competitive Landscape',
  'Organizational Context',
  'Risk Architecture',
  'Revenue Structure',
  'Stakeholder Mapping',
  'Strategic Alignment',
  'Operational Reality',
];

const POS = [
  [3.3, 0.7, 0.4],
  [2.3, 0.2, 2.5],
  [0.0, -0.5, 3.3],
  [-2.3, 0.8, 2.3],
  [-3.3, -0.3, -0.2],
  [-2.1, 0.5, -2.5],
  [1.2, -0.3, -3.0],
  [2.6, 0.3, -2.0],
];

const SHAPES = [
  'pyramid', 'octahedron', 'icosahedron', 'pyramid',
  'octahedron', 'icosahedron', 'pyramid', 'octahedron',
];

const CROSS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [4, 5], [5, 6], [6, 7], [7, 0],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

const C = { BG: 0x0a0f1a, GOLD: 0xd4af37, CYAN: 0x00d4ff };

/* ═══════════════════════════════════════════════
   Shader Sources
   ═══════════════════════════════════════════════ */

const HEX_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const HEX_FRAG = `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;

float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.732))), p.x);
}

vec4 hexCoords(vec2 uv) {
  vec2 r = vec2(1.0, 1.732);
  vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  float y = 0.5 - hexDist(gv);
  vec2 id = uv - gv;
  return vec4(gv, y, length(id));
}

void main() {
  vec2 uv = (vUv - 0.5) * 28.0;
  vec4 hc = hexCoords(uv);
  float edge = smoothstep(0.0, 0.04, hc.z) - smoothstep(0.04, 0.09, hc.z);

  float dist = length(vUv - 0.5) * 2.0;
  float ripple = sin(dist * 14.0 - uTime * 1.8) * 0.5 + 0.5;
  ripple *= exp(-dist * 1.8);

  float fade = smoothstep(1.0, 0.25, dist);
  float alpha = edge * uOpacity * fade * (0.06 + ripple * 0.22);

  gl_FragColor = vec4(0.0, 0.83, 1.0, alpha);
}`;

const PART_VERT = `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uOpacity;
varying float vAlpha;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float twinkle = sin(uTime * 1.3 + aPhase) * 0.5 + 0.5;
  vAlpha = uOpacity * (0.1 + twinkle * 0.5);
  gl_PointSize = aSize * (120.0 / -mv.z) * (0.5 + twinkle * 0.5);
  gl_Position = projectionMatrix * mv;
}`;

const PART_FRAG = `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  float glow = exp(-d * d * 10.0);
  vec3 col = vec3(0.83, 0.686, 0.216);
  gl_FragColor = vec4(col, glow * vAlpha);
}`;

/* ═══════════════════════════════════════════════
   UCIMVisualization Class
   ═══════════════════════════════════════════════ */

export class UCIMVisualization {
  constructor(container) {
    this.container = container;
    this.isRunning = false;
    this.animFrameId = null;
    this.timeline = null;
    this.labels = [];
    this.connections = [];
    this.crossConns = [];
    this.runners = [];
    this.sparks = [];
    this.orbitalNodes = [];
    this.orbitalGroup = new THREE.Group();
    /** Wall-time epoch for camera sway — replaces deprecated THREE.Clock; elapsed continues
     *  during pause (no rAF) matching the prior Clock.getElapsedTime() contract. */
    this._wallEpochMs = null;

    this.state = {
      centralScale: 0,
      particleOpacity: 0,
      gridOpacity: 0,
      haloOpacity: 0,
    };
    /* Flat keys for reliable GSAP tweening (arrays unreliable with computed indices) */
    for (let i = 0; i < 8; i++) {
      this.state['ns' + i] = 0; // node scale
      this.state['cp' + i] = 0; // connection progress
      this.state['lo' + i] = 0; // label opacity
    }
    for (let i = 0; i < CROSS.length; i++) {
      this.state['xp' + i] = 0; // cross progress
    }

    this._onResize = this._onResize.bind(this);
    this._renderLoop = this._renderLoop.bind(this);
    this._init();
  }

  /* ── Setup ─────────────────────────────────── */

  _init() {
    this._setupScene();
    this._setupCamera();
    this._setupRenderer();
    this._setupPostProcessing();
    this._setupLights();
    this._createStarField();
    this._createHexGrid();
    this._createParticles();
    this._createCentralNode();
    this._createEnergyHalo();
    this._createOrbitalNodes();
    this._createConnections();
    this._createCrossConnections();
    this._createLabels();
    this._buildTimeline();
    window.addEventListener('resize', this._onResize);

    this._wasRunningBeforeHide = false;
    this._onVisibilityChange = () => {
      if (document.hidden) {
        this._wasRunningBeforeHide = this.isRunning;
        if (this.isRunning) this.pause();
      } else if (this._wasRunningBeforeHide) {
        this.resume();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.BG);
    this.scene.fog = new THREE.FogExp2(C.BG, 0.01);
  }

  _setupCamera() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 100);
    this.camera.position.set(0, 1.8, 9);
    this.camera.lookAt(0, -0.2, 0);
    this._camBase = { x: 0, y: 1.8, z: 9 };
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);
  }

  _setupPostProcessing() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.55,  // strength
      0.4,   // radius
      0.35   // threshold
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(5, 8, 7);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x6688aa, 0.3);
    fill.position.set(-4, -2, -5);
    this.scene.add(fill);

    this.centerLight = new THREE.PointLight(C.GOLD, 0, 14);
    this.centerLight.position.set(0, 0, 0);
    this.scene.add(this.centerLight);

    const rimCyan = new THREE.PointLight(C.CYAN, 0.5, 20);
    rimCyan.position.set(-7, 4, -7);
    this.scene.add(rimCyan);

    const rimGold = new THREE.PointLight(C.GOLD, 0.3, 20);
    rimGold.position.set(7, -2, 5);
    this.scene.add(rimGold);
  }

  /* ── Scene Elements ────────────────────────── */

  _createStarField() {
    const count = 180;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 25;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30 - 8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.012,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
      depthWrite: false,
    }));
    this.scene.add(this.stars);
  }

  _createHexGrid() {
    const geo = new THREE.PlaneGeometry(28, 28, 1, 1);
    this._hexMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: HEX_VERT,
      fragmentShader: HEX_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.hexGrid = new THREE.Mesh(geo, this._hexMat);
    this.hexGrid.rotation.x = -Math.PI / 2;
    this.hexGrid.position.y = -2.5;
    this.scene.add(this.hexGrid);
  }

  _createParticles() {
    const count = 350;
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    this._pBase = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = 2.5 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) - 0.3;
      const z = r * Math.cos(phi);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      this._pBase[i * 3] = x; this._pBase[i * 3 + 1] = y; this._pBase[i * 3 + 2] = z;
      sizes[i] = 0.15 + Math.random() * 0.7;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this._partMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geo, this._partMat);
    this.scene.add(this.particles);
  }

  _createCentralNode() {
    const geo = new THREE.IcosahedronGeometry(0.7, 1);
    this._centralMat = new THREE.MeshStandardMaterial({
      color: C.GOLD,
      metalness: 0.85,
      roughness: 0.15,
      emissive: C.GOLD,
      emissiveIntensity: 0.28,
      flatShading: true,
    });
    this.centralNode = new THREE.Mesh(geo, this._centralMat);
    this.centralNode.scale.setScalar(0);
    this.orbitalGroup.add(this.centralNode);
    this.scene.add(this.orbitalGroup);
  }

  _createEnergyHalo() {
    const geo = new THREE.RingGeometry(0.85, 1.15, 6, 1);
    this._haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.45, 0.72, 0.65),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new THREE.Mesh(geo, this._haloMat);
    this.orbitalGroup.add(this.halo);
  }

  _nodeGeo(shape) {
    switch (shape) {
      case 'pyramid': return new THREE.ConeGeometry(0.28, 0.48, 4);
      case 'octahedron': return new THREE.OctahedronGeometry(0.3);
      case 'icosahedron': return new THREE.IcosahedronGeometry(0.3, 0);
      default: return new THREE.OctahedronGeometry(0.3);
    }
  }

  _createOrbitalNodes() {
    for (let i = 0; i < 8; i++) {
      const geo = this._nodeGeo(SHAPES[i]);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xc9a030,
        metalness: 0.7,
        roughness: 0.25,
        emissive: C.GOLD,
        emissiveIntensity: 0.35,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const [x, y, z] = POS[i];
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(0);
      this.orbitalGroup.add(mesh);
      this.orbitalNodes.push(mesh);
    }
  }

  _makeLine(from, to, opacity) {
    const segs = 50;
    const arr = new Float32Array((segs + 1) * 3);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      arr[i * 3] = from.x + (to.x - from.x) * t;
      arr[i * 3 + 1] = from.y + (to.y - from.y) * t;
      arr[i * 3 + 2] = from.z + (to.z - from.z) * t;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0x00eeff,
      transparent: true,
      opacity,
    }));
    return { line, geo, max: segs + 1 };
  }

  _createConnections() {
    const origin = new THREE.Vector3(0, 0, 0);
    const sparkGeo = new THREE.SphereGeometry(0.07, 6, 6);
    const runnerGeo = new THREE.SphereGeometry(0.045, 8, 8);

    for (let i = 0; i < 8; i++) {
      const [x, y, z] = POS[i];
      const target = new THREE.Vector3(x, y, z);
      const c = this._makeLine(origin, target, 0.85);
      this.orbitalGroup.add(c.line);
      this.connections.push(c);

      /* Spark at endpoint */
      const spark = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
        color: C.GOLD, transparent: true, opacity: 0,
      }));
      spark.position.set(x, y, z);
      this.orbitalGroup.add(spark);
      this.sparks.push(spark);

      /* Energy runner — bright sphere that travels along the line */
      const runner = new THREE.Mesh(runnerGeo, new THREE.MeshBasicMaterial({
        color: C.CYAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      }));
      runner.position.set(0, 0, 0);
      this.orbitalGroup.add(runner);
      this.runners.push({ mesh: runner, target: new THREE.Vector3(x, y, z) });
    }
  }

  _createCrossConnections() {
    for (const [a, b] of CROSS) {
      const [ax, ay, az] = POS[a];
      const [bx, by, bz] = POS[b];
      const c = this._makeLine(
        new THREE.Vector3(ax, ay, az),
        new THREE.Vector3(bx, by, bz),
        0.35,
      );
      this.orbitalGroup.add(c.line);
      this.crossConns.push(c);
    }
  }

  _createLabels() {
    for (let i = 0; i < 8; i++) {
      const el = document.createElement('div');
      el.className = 'ucim-label';
      el.textContent = LABELS[i];
      el.style.opacity = '0';
      el.setAttribute('data-testid', 'ucim-node-label');
      this.container.appendChild(el);
      this.labels.push(el);
    }
  }

  /* ── GSAP Timeline ─────────────────────────── */

  _buildTimeline() {
    this.timeline = gsap.timeline({ repeat: -1, paused: true });
    const tl = this.timeline;
    const s = this.state;

    /* ── Assemble 0–8s ── */
    tl.to(s, { gridOpacity: 1, duration: 1.5, ease: 'power2.out' }, 0);
    tl.to(s, { particleOpacity: 1, duration: 2.2, ease: 'power2.out' }, 0.2);
    tl.to(s, { centralScale: 1, duration: 1.8, ease: 'back.out(1.4)' }, 0.5);
    tl.to(s, { haloOpacity: 1, duration: 1.0, ease: 'power2.out' }, 1.8);

    for (let i = 0; i < 8; i++) {
      const t0 = 2 + i * 0.55;
      tl.to(s, { ['ns' + i]: 1, duration: 0.6, ease: 'back.out(2)' }, t0);
      tl.to(s, { ['cp' + i]: 1, duration: 0.8, ease: 'power2.inOut' }, t0 + 0.1);
      tl.to(s, { ['lo' + i]: 1, duration: 0.5, ease: 'power2.out' }, t0 + 0.4);

      /* Runner: travel along the line */
      const r = this.runners[i];
      tl.set(r.mesh.material, { opacity: 0.9 }, t0 + 0.1);
      tl.to(r.mesh.position, {
        x: r.target.x, y: r.target.y, z: r.target.z,
        duration: 0.8, ease: 'power2.inOut',
      }, t0 + 0.1);
      tl.to(r.mesh.material, { opacity: 0, duration: 0.25 }, t0 + 0.75);
      tl.set(r.mesh.position, { x: 0, y: 0, z: 0 }, t0 + 1.0);

      /* Spark burst */
      const sp = this.sparks[i];
      const spT = t0 + 0.8;
      tl.to(sp.material, { opacity: 1, duration: 0.12, ease: 'power2.out' }, spT);
      tl.to(sp.material, { opacity: 0, duration: 0.45, ease: 'power2.in' }, spT + 0.12);
      tl.to(sp.scale, { x: 3, y: 3, z: 3, duration: 0.12, ease: 'power2.out' }, spT);
      tl.to(sp.scale, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'power2.in' }, spT + 0.12);
    }

    for (let i = 0; i < CROSS.length; i++) {
      tl.to(s, { ['xp' + i]: 1, duration: 0.35, ease: 'power2.inOut' }, 6.2 + i * 0.12);
    }

    /* ── Hold 8–12s ── */
    tl.to(s, { centralScale: 1.08, duration: 1.0, ease: 'sine.inOut' }, 8);
    tl.to(s, { centralScale: 1.0, duration: 1.0, ease: 'sine.inOut' }, 9);
    tl.to(s, { centralScale: 1.08, duration: 1.0, ease: 'sine.inOut' }, 10);
    tl.to(s, { centralScale: 1.0, duration: 1.0, ease: 'sine.inOut' }, 11);

    /* ── Dissolve 12–16s ── */
    for (let i = CROSS.length - 1; i >= 0; i--) {
      tl.to(s, { ['xp' + i]: 0, duration: 0.28, ease: 'power2.in' }, 12 + (CROSS.length - 1 - i) * 0.06);
    }

    for (let i = 7; i >= 0; i--) {
      const off = (7 - i) * 0.13;
      tl.to(s, { ['lo' + i]: 0, duration: 0.3, ease: 'power2.in' }, 12.2 + off);
      tl.to(s, { ['cp' + i]: 0, duration: 0.45, ease: 'power2.in' }, 12.4 + off);
      tl.to(s, { ['ns' + i]: 0, duration: 0.4, ease: 'power2.in' }, 13.0 + off);
    }

    tl.to(s, { haloOpacity: 0, duration: 1.0, ease: 'power2.in' }, 13.5);
    tl.to(s, { centralScale: 0, duration: 1.2, ease: 'power3.in' }, 14);
    tl.to(s, { gridOpacity: 0, duration: 1.4, ease: 'power2.in' }, 14.2);
    tl.to(s, { particleOpacity: 0, duration: 1.4, ease: 'power2.in' }, 14.5);
  }

  /* ── Render Loop ───────────────────────────── */

  _renderLoop() {
    if (!this.isRunning) return;
    this.animFrameId = requestAnimationFrame(this._renderLoop);
    const t =
      this._wallEpochMs != null ? (performance.now() - this._wallEpochMs) * 0.001 : 0;
    this._tick(t, true);
  }

  /**
   * Render a single static frame reflecting current timeline state.
   * Used for reduced-motion users and initial warm frame.
   */
  _renderStaticFrame() {
    this._tick(0, false);
  }

  /**
   * Apply current state to scene objects and render once.
   * @param {number} t Elapsed time seconds (0 for static frame)
   * @param {boolean} animated Apply continuous rotations/drift when true
   */
  _tick(t, animated) {
    const s = this.state;

    /* Camera sway (only when animated) */
    if (animated) {
      this.camera.position.x = this._camBase.x + Math.sin(t * 0.13) * 0.1;
      this.camera.position.y = this._camBase.y + Math.cos(t * 0.1) * 0.06;
    } else {
      this.camera.position.x = this._camBase.x;
      this.camera.position.y = this._camBase.y;
    }
    this.camera.lookAt(0, -0.2, 0);

    /* Central node */
    this.centralNode.scale.setScalar(s.centralScale);
    if (animated) {
      this.centralNode.rotation.y += 0.003;
      this.centralNode.rotation.x += 0.001;
    }
    this._centralMat.emissiveIntensity = 0.2 + s.centralScale * 0.12;
    this.centerLight.intensity = s.centralScale * 2.5;

    /* Energy halo */
    this._haloMat.opacity = s.haloOpacity * s.centralScale * 0.3;
    this.halo.lookAt(this.camera.position);
    if (animated) this.halo.rotation.z += 0.005;

    /* Orbital nodes */
    for (let i = 0; i < 8; i++) {
      const n = this.orbitalNodes[i];
      n.scale.setScalar(s['ns' + i]);
      if (animated) {
        n.rotation.y += 0.008 + i * 0.0005;
        n.rotation.x += 0.004 + i * 0.0003;
      }
    }

    /* Primary connections */
    for (let i = 0; i < this.connections.length; i++) {
      const c = this.connections[i];
      c.geo.setDrawRange(0, Math.floor(s['cp' + i] * c.max));
    }

    /* Cross connections */
    for (let i = 0; i < this.crossConns.length; i++) {
      const c = this.crossConns[i];
      c.geo.setDrawRange(0, Math.floor(s['xp' + i] * c.max));
    }

    /* Particles drift (only when animated; static frame uses base positions) */
    const pArr = this.particles.geometry.attributes.position.array;
    const pBase = this._pBase;
    if (animated) {
      for (let i = 0; i < pArr.length; i += 3) {
        pArr[i] = pBase[i] + Math.sin(t * 0.25 + i) * 0.15;
        pArr[i + 1] = pBase[i + 1] + Math.cos(t * 0.17 + i * 0.6) * 0.15;
        pArr[i + 2] = pBase[i + 2] + Math.sin(t * 0.2 + i * 0.35) * 0.15;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    } else {
      for (let i = 0; i < pArr.length; i++) pArr[i] = pBase[i];
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
    this._partMat.uniforms.uTime.value = t;
    this._partMat.uniforms.uOpacity.value = s.particleOpacity;

    /* Hex grid shader */
    this._hexMat.uniforms.uTime.value = t;
    this._hexMat.uniforms.uOpacity.value = s.gridOpacity;

    /* Slow orbit */
    if (animated) this.orbitalGroup.rotation.y += 0.0008;

    /* Labels */
    this._updateLabels();

    /* Render with bloom */
    this.composer.render();

    /* First-render notification for parent frame (ready handshake) */
    if (!this._readyAnnounced) {
      this._readyAnnounced = true;
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'ucim:ready' }, '*');
        }
      } catch (_) { /* cross-origin: ignore */ }
    }
  }

  _updateLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const s = this.state;
    const cw = w * 0.5;
    const ch = h * 0.5;

    for (let i = 0; i < 8; i++) {
      const wp = new THREE.Vector3();
      this.orbitalNodes[i].getWorldPosition(wp);
      const p = wp.project(this.camera);

      if (p.z > 1) { this.labels[i].style.opacity = '0'; continue; }

      const sx = (p.x * 0.5 + 0.5) * w;
      const sy = (-p.y * 0.5 + 0.5) * h;

      const dx = sx - cw;
      const dy = sy - ch;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const push = 22;

      this.labels[i].style.left = (sx + (dx / dist) * push) + 'px';
      this.labels[i].style.top = (sy + (dy / dist) * push - 18) + 'px';
      this.labels[i].style.opacity = String(s['lo' + i]);
    }
  }

  _onResize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    /* Reduced-motion path has no rAF loop; without an explicit re-render the static frame would
       remain at the pre-resize resolution and label layout would drift. Paused non-reduced-motion
       states intentionally do NOT re-render here — they are off-screen (route-away / tab-hidden). */
    if (!this.isRunning && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._renderStaticFrame();
    }
  }

  /* ── Public API ────────────────────────────── */

  start() {
    if (this.isRunning) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.timeline.seek(10);
      this.timeline.pause();
      this.isRunning = false;
      this._renderStaticFrame();
      return;
    }

    this.isRunning = true;
    /* Only reset wall epoch on first start; resume() preserves continuous elapsed time
       so camera sway keeps smooth phase across route changes / tab-hide cycles. */
    if (!this._clockEverStarted) {
      this._wallEpochMs = performance.now();
      this._clockEverStarted = true;
    }
    this.timeline.restart();
    this._renderLoop();
  }

  pause() {
    this.isRunning = false;
    if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
    if (this.timeline) this.timeline.pause();
    /* Wall epoch is not cleared: time keeps advancing while paused so resume() does not
       snap camera sway phase (same invariant as the old Clock, which was left running). */
  }

  resume() {
    if (this.isRunning) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._renderStaticFrame();
      return;
    }
    this.isRunning = true;
    if (this.timeline) this.timeline.resume();
    this._renderLoop();
  }

  destroy() {
    this.pause();
    window.removeEventListener('resize', this._onResize);
    if (this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      this._onVisibilityChange = null;
    }
    if (this.timeline) { this.timeline.kill(); this.timeline = null; }
    this.labels.forEach((l) => l.remove());
    this.labels = [];
    this.composer.dispose();
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
