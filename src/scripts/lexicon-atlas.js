/**
 * Lexicon Atlas runtime — the perspective camera, the interaction
 * grammar and the inspector choreography for /lexicon/.
 *
 * The scene itself is rendered at build time (LexiconAtlas.astro) with
 * the home camera already applied, so the graph is complete and
 * navigable without this module: every node is a plain <a href="#id">
 * pointing at the full register below. This island upgrades that
 * static projection into a live one:
 *
 *   • perspective camera (yaw / pitch / zoom / look-at) re-projecting
 *     nodes, edges, the octagonal armature and cluster captions every
 *     frame,
 *   • ambient drift + pointer parallax so the field breathes with the
 *     WebGL diorama behind the page,
 *   • drag to orbit, wheel/pinch to close in, buttons to fit,
 *   • selection flies the camera to a term, recedes everything that
 *     isn't adjacent, flows the touched edges and opens the inspector,
 *   • focus mode re-lays the selection's neighbours into a radial ego
 *     graph (animated, not recomputed physics),
 *   • filter events from lexicon-page.ts subtract nodes from the field
 *     and re-fit the camera to what is left.
 *
 * Island discipline: idempotent bind, teardown on astro:before-swap,
 * rebind on astro:page-load, one AbortController for every listener.
 */

/* Mirrored from LexiconAtlas.astro — build-time projection constants. */
const CX = 500;
const VB_BASE_H = 625;
/* The viewBox height tracks the stage aspect at runtime so the field
   fills the frame instead of letterboxing (critical on phones, where a
   1.6 viewBox inside a 3:4 stage wastes half the surface). Build-time
   markup ships the desktop default so the no-JS render is correct. */
let vbH = VB_BASE_H;
let cyv = VB_BASE_H / 2;
/* Glyph scale is decoupled from camera zoom: node marks and labels keep
   a consistent physical size across devices (map-pin behaviour) while
   the camera zoom only moves positions. */
let uiScale = 1;
const FOCAL = 1500;
const CAM_DIST = 1500;
const HOME_YAW = -0.18;
const HOME_PITCH = -0.13;

const YAW_LIMIT = 0.95;
const PITCH_LIMIT = 0.42;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.8;
const EASE = 0.09;
const TRAIL_MAX = 5;

let _bound = false;
let _abort = null;
let _raf = 0;
let _visible = true;
let _io = null;

let root = null;
let stage = null;
let tip = null;
let inspector = null;
let trailEl = null;
let readoutSel = null;
let readoutZoom = null;
let voidEl = null;
let focusBtn = null;
let scrim = null;

/** @type {Array<any>} */
let nodes = [];
/** @type {Map<string, any>} */
let byId = new Map();
/** @type {Array<any>} */
let edges = [];
/** @type {Array<any>} */
let clusters = [];
/** Armature: octagon rings, spokes and the {8/3} octagram. */
let glyphPolys = [];
let glyphLines = [];
let liveChannels = new Set();
/** @type {Map<string, Set<string>>} */
let adjacency = new Map();

let selected = null;
let focusMode = false;
let trail = [];
let hidden = new Set();

const cam = {
  x: 0, y: 0, z: 0, yaw: HOME_YAW, pitch: HOME_PITCH, zoom: 1,
  tx: 0, ty: 0, tz: 0, tyaw: HOME_YAW, tpitch: HOME_PITCH, tzoom: 1,
  /* Screen-space bias in viewBox units: slides the whole field out from
     under the inspector so the selected term is never behind the panel
     (sideways on desktop, upward when the panel is a bottom sheet). */
  bx: 0, by: 0, tbx: 0, tby: 0,
};
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
let drag = null;
const pointers = new Map();
let pinchStart = 0;
let pinchZoom = 1;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ── Scene collection ─────────────────────────────────────────── */

function collect() {
  nodes = Array.from(root.querySelectorAll('[data-node]')).map((el) => {
    const hx = Number(el.dataset.wx);
    const hy = Number(el.dataset.wy);
    const hz = Number(el.dataset.wz);
    return {
      id: el.dataset.node,
      el,
      g: el.querySelector('.atlas__node-tx'),
      degree: Number(el.dataset.degree) || 0,
      hx, hy, hz,
      /* current (animated) and target world position */
      cx: hx, cy: hy, cz: hz,
      tx: hx, ty: hy, tz: hz,
      px: 0, py: 0, ps: 1,
      blurred: false,
    };
  });
  byId = new Map(nodes.map((n) => [n.id, n]));

  /* Each edge is a pair (dark underlay + cyan stroke) so a 1px line
     stays legible against both halves of the diorama. */
  edges = Array.from(root.querySelectorAll('[data-edge-a]')).map((el) => ({
    el,
    lines: Array.from(el.querySelectorAll('line')),
    a: el.dataset.edgeA,
    b: el.dataset.edgeB,
  }));

  adjacency = new Map();
  for (const e of edges) {
    if (!adjacency.has(e.a)) adjacency.set(e.a, new Set());
    if (!adjacency.has(e.b)) adjacency.set(e.b, new Set());
    adjacency.get(e.a).add(e.b);
    adjacency.get(e.b).add(e.a);
  }

  glyphPolys = Array.from(root.querySelectorAll('[data-poly]')).map((el) => ({
    lines: Array.from(el.querySelectorAll('polyline')),
    pts: (el.dataset.poly ?? '')
      .split(';')
      .filter(Boolean)
      .map((pair) => pair.split(',').map(Number)),
  }));

  glyphLines = Array.from(root.querySelectorAll('[data-ax]')).map((el) => ({
    lines: Array.from(el.querySelectorAll('line')),
    ax: Number(el.dataset.ax), ay: Number(el.dataset.ay), az: Number(el.dataset.az),
    bx: Number(el.dataset.bx), by: Number(el.dataset.by), bz: Number(el.dataset.bz),
  }));

  clusters = Array.from(root.querySelectorAll('[data-cluster]')).map((el) => ({
    el,
    id: el.dataset.cluster,
    wx: Number(el.dataset.wx), wy: Number(el.dataset.wy), wz: Number(el.dataset.wz),
  }));
}

/* ── Projection ───────────────────────────────────────────────── */

function makeProjector() {
  const yaw = cam.yaw + parallax.x;
  const pitch = cam.pitch + parallax.y;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return (wx, wy, wz) => {
    const dx = wx - cam.x;
    const dy = wy - cam.y;
    const dz = wz - cam.z;
    const x1 = cy * dx + sy * dz;
    const z1 = -sy * dx + cy * dz;
    const y1 = cp * dy - sp * z1;
    const z2 = sp * dy + cp * z1;
    const depth = Math.max(CAM_DIST + z2, 260);
    const s = (FOCAL / depth) * cam.zoom;
    return { x: CX + cam.bx + x1 * s, y: cyv + cam.by + y1 * s, s };
  };
}

function fog(s) {
  /* Depth haze: distant terms sink toward the diorama, near terms sit
     fully lit. `s` is the perspective scale at that depth. */
  const norm = (s / cam.zoom - 0.86) / 0.3;
  return Math.max(0.3, Math.min(1, 0.42 + norm * 0.6));
}

function commit() {
  const project = makeProjector();
  const lerp = reducedMotion() ? 1 : 0.12;

  for (const n of nodes) {
    n.cx += (n.tx - n.cx) * lerp;
    n.cy += (n.ty - n.cy) * lerp;
    n.cz += (n.tz - n.cz) * lerp;
    const p = project(n.cx, n.cy, n.cz);
    n.px = p.x;
    n.py = p.y;
    n.ps = p.s;
    const glyph = (p.s / cam.zoom) * uiScale;
    n.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${glyph.toFixed(3)})`);
    n.g.style.opacity = fog(p.s).toFixed(3);
    const wantBlur = p.s / cam.zoom < 0.93;
    if (wantBlur !== n.blurred) {
      n.blurred = wantBlur;
      if (wantBlur) n.g.setAttribute('filter', 'url(#atlas-dof)');
      else n.g.removeAttribute('filter');
    }
  }

  for (const e of edges) {
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (!a || !b) continue;
    /* Hot edges flow outward from the selected term, so the animated
       dash always reads as signal leaving the node you picked. */
    const flip = selected && e.b === selected;
    const from = flip ? b : a;
    const to = flip ? a : b;
    const x1 = from.px.toFixed(1);
    const y1 = from.py.toFixed(1);
    const x2 = to.px.toFixed(1);
    const y2 = to.py.toFixed(1);
    for (const line of e.lines) {
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
    }
    const dim = hidden.has(e.a) || hidden.has(e.b);
    e.el.classList.toggle('is-dim', dim);
    if (!dim) e.el.style.opacity = (fog((a.ps + b.ps) / 2) * 0.95).toFixed(3);
  }

  /* Armature is re-projected with the figure so the geometry turns with
     it rather than sitting flat on the glass. */
  for (const g of glyphPolys) {
    let points = '';
    for (const pt of g.pts) {
      const p = project(pt[0], pt[1], pt[2]);
      points += `${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    }
    for (const line of g.lines) line.setAttribute('points', points.trim());
  }

  for (const g of glyphLines) {
    const pa = project(g.ax, g.ay, g.az);
    const pb = project(g.bx, g.by, g.bz);
    const x1 = pa.x.toFixed(1);
    const y1 = pa.y.toFixed(1);
    const x2 = pb.x.toFixed(1);
    const y2 = pb.y.toFixed(1);
    for (const line of g.lines) {
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
    }
  }

  for (const c of clusters) {
    const p = project(c.wx, c.wy, c.wz);
    c.el.setAttribute('x', p.x.toFixed(1));
    c.el.setAttribute('y', p.y.toFixed(1));
    c.el.setAttribute('font-size', (13 * (p.s / cam.zoom) * uiScale).toFixed(1));
  }

  /* The scrim is the only thing standing in for the old panel: a soft
     bloom centred on the projected field, sized to it, with nothing to
     read as an edge. */
  if (scrim) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, live = 0;
    for (const n of nodes) {
      if (hidden.has(n.id)) continue;
      live += 1;
      minX = Math.min(minX, n.px);
      maxX = Math.max(maxX, n.px);
      minY = Math.min(minY, n.py);
      maxY = Math.max(maxY, n.py);
    }
    if (live > 0) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      /* Clamp inside the frame: a soft gradient clipped by the stage
         edge would draw the very panel edge we just removed. */
      const rx = Math.min((maxX - minX) / 2 + 230, cx, 1000 - cx);
      const ry = Math.min((maxY - minY) / 2 + 190, cy, vbH - cy);
      scrim.setAttribute('cx', cx.toFixed(1));
      scrim.setAttribute('cy', cy.toFixed(1));
      scrim.setAttribute('rx', Math.max(rx, 40).toFixed(1));
      scrim.setAttribute('ry', Math.max(ry, 40).toFixed(1));
    }
  }

  if (readoutZoom) readoutZoom.textContent = `${cam.zoom.toFixed(2)}×`;
}

/* ── Frame loop ───────────────────────────────────────────────── */

function frame(t) {
  _raf = 0;
  const rm = reducedMotion();
  const ease = rm ? 1 : EASE;

  if (!rm) {
    /* Ambient drift keeps the field alive at rest — the same slow
       breathing register as the lobby camera. */
    const driftYaw = Math.sin(t * 0.00011) * 0.035;
    const driftPitch = Math.sin(t * 0.00017 + 1.2) * 0.018;
    parallax.x += (parallax.tx + driftYaw - parallax.x) * 0.06;
    parallax.y += (parallax.ty + driftPitch - parallax.y) * 0.06;
  } else {
    parallax.x = 0;
    parallax.y = 0;
  }

  cam.x += (cam.tx - cam.x) * ease;
  cam.y += (cam.ty - cam.y) * ease;
  cam.z += (cam.tz - cam.z) * ease;
  cam.yaw += (cam.tyaw - cam.yaw) * ease;
  cam.pitch += (cam.tpitch - cam.pitch) * ease;
  cam.zoom += (cam.tzoom - cam.zoom) * ease;
  cam.bx += (cam.tbx - cam.bx) * ease;
  cam.by += (cam.tby - cam.by) * ease;

  commit();
  if (_visible) _raf = requestAnimationFrame(frame);
}

function kick() {
  if (!_raf && _visible) _raf = requestAnimationFrame(frame);
}

/* ── Camera moves ─────────────────────────────────────────────── */

function isSheet() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function setInspectorBias(open) {
  const sheet = isSheet();
  cam.tbx = open && !sheet ? -190 : 0;
  cam.tby = open && sheet ? -vbH * 0.29 : 0;
}

function syncViewBox() {
  const svg = root?.querySelector('[data-atlas-svg]');
  if (!svg || !stage) return;
  const rect = stage.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  uiScale = Math.max(0.9, Math.min(2.0, 1176 / rect.width));
  const next = Math.round(Math.max(400, Math.min(1400, 1000 * (rect.height / rect.width))));
  if (next === vbH) return;
  vbH = next;
  cyv = next / 2;
  svg.setAttribute('viewBox', `0 0 1000 ${next}`);
  const bg = svg.querySelector('rect');
  if (bg) bg.setAttribute('height', String(next));
  setInspectorBias(Boolean(selected));
}

function flyTo(x, y, z, zoom) {
  cam.tx = x;
  cam.ty = y;
  cam.tz = z;
  cam.tzoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  kick();
}

function fitNodes(list, extentX = 0, extentY = 0) {
  if (list.length === 0) {
    flyTo(0, 0, 0, 1);
    return;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, sumZ = 0;
  for (const n of list) {
    minX = Math.min(minX, n.tx);
    maxX = Math.max(maxX, n.tx);
    minY = Math.min(minY, n.ty);
    maxY = Math.max(maxY, n.ty);
    sumZ += n.tz;
  }
  /* A lit channel caption is part of the composition — keep it framed. */
  for (const c of clusters) {
    if (c.el.classList.contains('is-live')) minY = Math.min(minY, c.wy);
  }
  /* Every node carries a label under it and a halo around it: pad the
     box so nothing clips against the frame. */
  minY -= 22;
  maxY += 58;
  minX -= 30;
  maxX += 30;
  if (extentX > 0) {
    minX = Math.min(minX, -extentX);
    maxX = Math.max(maxX, extentX);
  }
  if (extentY > 0) {
    minY = Math.min(minY, -extentY);
    maxY = Math.max(maxY, extentY);
  }
  const w = Math.max(maxX - minX, 120);
  const h = Math.max(maxY - minY, 120);
  const sheet = isSheet();
  /* Usable frame shrinks when the inspector is docked — fit into what
     the reader can actually see. */
  const availW = (selected && !sheet ? 540 : 820) / uiScale;
  const availH = ((selected && sheet ? 0.40 : 0.66) * vbH) / uiScale;
  const zoom = Math.min(availW / w, availH / h, 2.4);
  flyTo((minX + maxX) / 2, (minY + maxY) / 2, sumZ / list.length, zoom);
}

function fitVisible() {
  /* Unfiltered, the camera frames the whole figure — armature included —
     so the octagon reads as a complete construction rather than a crop. */
  const live = nodes.filter((n) => !hidden.has(n.id));
  const whole = live.length === nodes.length;
  fitNodes(
    live,
    whole ? Number(root?.dataset.atlasExtentX ?? 0) : 0,
    whole ? Number(root?.dataset.atlasExtentY ?? 0) : 0,
  );
}

/** Origin + its neighbours — the frame focus mode and selection use. */
function egoNodes() {
  if (!selected) return [];
  const near = neighborsOf(selected);
  return nodes.filter((n) => !hidden.has(n.id) && (n.id === selected || near.has(n.id)));
}

function resetView() {
  cam.tyaw = HOME_YAW;
  cam.tpitch = HOME_PITCH;
  clearSelection();
  setFocusMode(false);
  fitVisible();
}

function zoomBy(factor) {
  cam.tzoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.tzoom * factor));
  kick();
}

/* ── Selection ────────────────────────────────────────────────── */

function neighborsOf(id) {
  return adjacency.get(id) ?? new Set();
}

function syncChannels() {
  const selectedCat = selected ? byId.get(selected)?.el.dataset.cat : null;
  for (const c of clusters) {
    c.el.classList.toggle('is-live', liveChannels.has(c.id) || c.id === selectedCat);
  }
}

function applyStates() {
  const near = selected ? neighborsOf(selected) : null;
  for (const n of nodes) {
    const isOrigin = n.id === selected;
    const isHot = Boolean(isOrigin || (near && near.has(n.id)));
    n.el.classList.toggle('is-origin', isOrigin);
    n.el.classList.toggle('is-hot', isHot);
    n.el.classList.toggle('is-out', hidden.has(n.id) || (focusMode && !isHot));
    n.el.setAttribute('aria-current', isOrigin ? 'true' : 'false');
    /* Depth reaction: the chosen term steps toward the viewer, its
       neighbours lift slightly, everything else recedes into haze. */
    const zOff = selected ? (isOrigin ? -90 : isHot ? -30 : 250) : 0;
    n.tz = n.hz + zOff;
    n.tx = n.hx;
    n.ty = n.hy;
  }
  for (const e of edges) {
    const hot = Boolean(selected && (e.a === selected || e.b === selected));
    e.el.classList.toggle('is-hot', hot);
  }
  if (focusMode && selected) radialLayout();
  syncChannels();
  kick();
}

function radialLayout() {
  const origin = byId.get(selected);
  if (!origin) return;
  /* Neighbours keep their relative bearing around the origin, so the
     ego graph reads as the same constellation rearranged rather than a
     new one. */
  const near = Array.from(neighborsOf(selected))
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort(
      (a, b) =>
        Math.atan2(a.hy - origin.hy, a.hx - origin.hx) -
        Math.atan2(b.hy - origin.hy, b.hx - origin.hx),
    );
  origin.tx = origin.hx;
  origin.ty = origin.hy;
  origin.tz = origin.hz - 90;
  /* Snap to the same eight bearings the matrix is built on, so focus
     mode reads as a sub-figure of the octagon rather than a new shape. */
  const step = Math.PI / 4;
  const slots = near.length <= 8 ? step : (Math.PI * 2) / near.length;
  near.forEach((n, i) => {
    const a = -Math.PI / 2 + i * slots;
    n.tx = origin.hx + Math.cos(a) * 218;
    n.ty = origin.hy + Math.sin(a) * 152;
    n.tz = origin.hz + Math.sin(a * 2) * 70;
  });
}

function setFocusMode(on) {
  focusMode = Boolean(on && selected);
  if (focusMode) root.dataset.focus = '1';
  else delete root.dataset.focus;
  if (focusBtn) focusBtn.setAttribute('aria-pressed', focusMode ? 'true' : 'false');
  applyStates();
  if (selected) fitNodes(egoNodes());
  else fitVisible();
}

function pushTrail(id) {
  trail = [id, ...trail.filter((t) => t !== id)].slice(0, TRAIL_MAX);
  if (!trailEl) return;
  const labels = trail.map((t) => byId.get(t)?.el.dataset.term ?? t);
  trailEl.textContent = labels.length > 1 ? labels.slice().reverse().join('  ›  ') : labels[0] ?? '';
}

function showCard(id) {
  if (!inspector) return;
  for (const card of inspector.querySelectorAll('[data-atlas-card]')) {
    card.hidden = card.dataset.atlasCard !== id;
  }
  inspector.hidden = false;
  inspector.scrollTop = 0;
}

function select(id, opts = {}) {
  const node = byId.get(id);
  if (!node || hidden.has(id)) return;
  selected = id;
  root.dataset.selected = id;
  hideTip();
  applyStates();
  showCard(id);
  setInspectorBias(true);
  pushTrail(id);
  if (focusMode) radialLayout();
  /* Frame the term with its neighbourhood — a selection is a
     relationship, not a point. */
  fitNodes(egoNodes());
  if (readoutSel) {
    readoutSel.textContent = `L-${node.el.dataset.num} ${node.el.dataset.term}`;
  }
  if (opts.url !== false) writeTermToUrl(id);
  announce(`${node.el.dataset.term} selected. ${node.degree} connections.`);
}

function clearSelection() {
  if (!selected) return;
  selected = null;
  delete root.dataset.selected;
  focusMode = false;
  delete root.dataset.focus;
  if (focusBtn) focusBtn.setAttribute('aria-pressed', 'false');
  if (inspector) inspector.hidden = true;
  setInspectorBias(false);
  if (readoutSel) readoutSel.textContent = '—';
  applyStates();
  fitVisible();
  writeTermToUrl(null);
}

function announce(text) {
  const el = document.querySelector('[data-lex-announce]');
  if (el) el.textContent = text;
}

/* ── URL state ────────────────────────────────────────────────── */

function writeTermToUrl(id) {
  const params = new URLSearchParams(window.location.search);
  if (id) params.set('term', id);
  else params.delete('term');
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
  window.history.replaceState(null, '', next);
}

function readTermFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('term');
  if (fromQuery && byId.has(fromQuery)) return fromQuery;
  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (hash && byId.has(hash)) return hash;
  return null;
}

/* ── Hover tip ────────────────────────────────────────────────── */

function showTip(nodeEl) {
  if (!tip || !stage) return;
  tip.querySelector('[data-atlas-tip-term]').textContent = nodeEl.dataset.term ?? '';
  tip.querySelector('[data-atlas-tip-def]').textContent = nodeEl.dataset.def ?? '';
  tip.querySelector('[data-atlas-tip-num]').textContent = nodeEl.dataset.num ? `L-${nodeEl.dataset.num}` : '';
  tip.querySelector('[data-atlas-tip-cat]').textContent = nodeEl.dataset.catLabel ?? '';

  const nodeRect = nodeEl.getBoundingClientRect();
  const vp = stage.getBoundingClientRect();
  tip.hidden = false;
  const cx = nodeRect.left + nodeRect.width / 2 - vp.left;
  const top = nodeRect.top - vp.top;
  const half = tip.offsetWidth / 2;
  tip.style.left = `${Math.max(half + 8, Math.min(vp.width - half - 8, cx))}px`;
  if (top - tip.offsetHeight - 18 < 0) {
    tip.style.top = `${top + nodeRect.height + 8}px`;
    tip.style.transform = 'translate(-50%, 0)';
  } else {
    tip.style.top = `${top}px`;
    tip.style.transform = 'translate(-50%, calc(-100% - 14px))';
  }
}

function hideTip() {
  if (tip) tip.hidden = true;
}

/* ── Pointer: orbit + pinch + wheel ───────────────────────────── */

function onPointerDown(evt) {
  if (evt.target.closest('.atlas__inspector, .atlas__tip')) return;
  pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
  if (pointers.size === 2) {
    const [p1, p2] = Array.from(pointers.values());
    pinchStart = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
    pinchZoom = cam.tzoom;
    drag = null;
    return;
  }
  drag = {
    x: evt.clientX,
    y: evt.clientY,
    yaw: cam.tyaw,
    pitch: cam.tpitch,
    moved: 0,
    node: evt.target.closest('[data-node]'),
  };
  stage.setPointerCapture?.(evt.pointerId);
}

function onPointerMove(evt) {
  if (pointers.has(evt.pointerId)) pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });

  if (pointers.size === 2) {
    const [p1, p2] = Array.from(pointers.values());
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
    cam.tzoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchZoom * (d / pinchStart)));
    kick();
    return;
  }

  if (drag) {
    const dx = evt.clientX - drag.x;
    const dy = evt.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    cam.tyaw = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, drag.yaw - dx * 0.0045));
    cam.tpitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, drag.pitch - dy * 0.0035));
    if (drag.moved > 6) {
      stage.dataset.dragging = 'true';
      hideTip();
    }
    kick();
    return;
  }

  /* Idle pointer drives parallax so the field leans with the cursor. */
  const vp = stage.getBoundingClientRect();
  parallax.tx = ((evt.clientX - vp.left) / vp.width - 0.5) * 0.16;
  parallax.ty = ((evt.clientY - vp.top) / vp.height - 0.5) * 0.1;
  kick();
}

function onPointerUp(evt) {
  pointers.delete(evt.pointerId);
  const wasDrag = drag && drag.moved > 6;
  const node = drag?.node;
  drag = null;
  delete stage.dataset.dragging;
  if (!wasDrag && node) {
    const id = node.dataset.node;
    if (id) select(id);
  }
}

function onPointerLeave() {
  parallax.tx = 0;
  parallax.ty = 0;
  hideTip();
  kick();
}

function onWheel(evt) {
  if (evt.target.closest('.atlas__inspector')) return;
  if (Math.abs(evt.deltaY) < 1) return;
  evt.preventDefault();
  zoomBy(evt.deltaY > 0 ? 0.92 : 1.08);
}

function onOver(evt) {
  const node = evt.target instanceof Element ? evt.target.closest('[data-node]') : null;
  if (!node || node.classList.contains('is-out')) return;
  /* The selected term already has the inspector open — a tooltip on top
     of it is redundant chrome. */
  if (node.dataset.node === selected) return;
  showTip(node);
}

function onOut(evt) {
  const node = evt.target instanceof Element ? evt.target.closest('[data-node]') : null;
  if (!node) return;
  const to = evt.relatedTarget instanceof Element ? evt.relatedTarget.closest('[data-node]') : null;
  if (!to) hideTip();
}

/* ── Click delegation ─────────────────────────────────────────── */

function onClick(evt) {
  const target = evt.target instanceof Element ? evt.target : null;
  if (!target) return;

  const node = target.closest('[data-node]');
  if (node) {
    /* Keep the anchor for no-JS / middle-click, but in-page selection
       must not jump the viewport down to the register. */
    evt.preventDefault();
    const id = node.dataset.node;
    if (id) select(id);
    return;
  }

  const goto = target.closest('[data-atlas-goto]');
  if (goto) {
    const id = goto.dataset.atlasGoto;
    if (id && byId.has(id)) select(id);
    return;
  }

  if (target.closest('[data-atlas-close]')) {
    clearSelection();
    return;
  }

  const zoomBtn = target.closest('[data-atlas-zoom]');
  if (zoomBtn) {
    zoomBy(Number(zoomBtn.dataset.atlasZoom) > 0 ? 1.18 : 0.85);
    return;
  }

  if (target.closest('[data-atlas-reset]')) {
    resetView();
    return;
  }

  if (target.closest('[data-atlas-focus]')) {
    if (!selected) {
      /* No selection yet: focus the densest term — the natural entry
         point into a knowledge graph. */
      const hub = nodes.filter((n) => !hidden.has(n.id)).sort((a, b) => b.degree - a.degree)[0];
      if (hub) select(hub.id);
    }
    setFocusMode(!focusMode);
  }
}

/* ── Keyboard ─────────────────────────────────────────────────── */

function walk(direction) {
  if (!selected) {
    const first = nodes.find((n) => !hidden.has(n.id));
    if (first) select(first.id);
    return;
  }
  const near = Array.from(neighborsOf(selected)).filter((id) => !hidden.has(id));
  if (near.length === 0) return;
  const last = trail[1];
  const start = near.indexOf(last);
  const idx = (((start === -1 ? 0 : start) + direction) + near.length) % near.length;
  select(near[idx]);
}

function onKeydown(evt) {
  if (evt.defaultPrevented || evt.metaKey || evt.ctrlKey || evt.altKey) return;
  const typing = evt.target instanceof HTMLElement &&
    (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA' || evt.target.isContentEditable);
  const inAtlas = evt.target instanceof Element && root.contains(evt.target);

  if (evt.key === 'Escape') {
    if (selected) {
      evt.preventDefault();
      clearSelection();
    }
    return;
  }
  if (typing) return;

  if (evt.key === 'f' || evt.key === 'F') {
    if (!selected) return;
    evt.preventDefault();
    setFocusMode(!focusMode);
    return;
  }
  if (evt.key === '0') {
    evt.preventDefault();
    resetView();
    return;
  }
  if (!inAtlas && !selected) return;
  if (evt.key === 'ArrowRight' || evt.key === 'ArrowDown') {
    evt.preventDefault();
    walk(1);
  } else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowUp') {
    evt.preventDefault();
    walk(-1);
  } else if (evt.key === '+' || evt.key === '=') {
    zoomBy(1.15);
  } else if (evt.key === '-' || evt.key === '_') {
    zoomBy(0.87);
  }
}

/* ── Filter integration (lexicon-page.ts dispatches this) ─────── */

function onFilter(evt) {
  const ids = evt.detail?.visibleIds;
  if (!Array.isArray(ids)) return;
  liveChannels = new Set(Array.isArray(evt.detail?.categories) ? evt.detail.categories : []);
  const live = new Set(ids);
  hidden = new Set(nodes.filter((n) => !live.has(n.id)).map((n) => n.id));
  if (selected && hidden.has(selected)) clearSelection();
  applyStates();
  if (voidEl) voidEl.hidden = hidden.size !== nodes.length;
  if (!selected) fitVisible();
}

/* ── Lifecycle ────────────────────────────────────────────────── */

function bind() {
  if (_bound) return;
  const el = document.querySelector('[data-atlas]');
  if (!(el instanceof HTMLElement)) return;
  root = el;
  stage = root.querySelector('[data-atlas-stage]');
  tip = root.querySelector('[data-atlas-tip]');
  inspector = root.querySelector('[data-atlas-inspector]');
  trailEl = root.querySelector('[data-atlas-trail]');
  readoutSel = root.querySelector('[data-atlas-readout-sel]');
  readoutZoom = root.querySelector('[data-atlas-readout-zoom]');
  voidEl = root.querySelector('[data-atlas-void]');
  focusBtn = root.querySelector('[data-atlas-focus]');
  scrim = root.querySelector('[data-atlas-scrim]');
  if (!stage) return;

  collect();
  if (nodes.length === 0) return;

  _abort = new AbortController();
  const { signal } = _abort;

  stage.addEventListener('pointerdown', onPointerDown, { signal });
  stage.addEventListener('pointermove', onPointerMove, { signal });
  window.addEventListener('pointerup', onPointerUp, { signal });
  window.addEventListener('pointercancel', onPointerUp, { signal });
  stage.addEventListener('pointerleave', onPointerLeave, { signal });
  stage.addEventListener('wheel', onWheel, { signal, passive: false });
  root.addEventListener('pointerover', onOver, { signal });
  root.addEventListener('pointerout', onOut, { signal });
  root.addEventListener('focusin', onOver, { signal });
  root.addEventListener('focusout', onOut, { signal });
  root.addEventListener('click', onClick, { signal });
  root.addEventListener('pointerover', (evt) => {
    const chip = evt.target instanceof Element ? evt.target.closest('[data-lex-category]') : null;
    if (!chip) return;
    const cat = chip.dataset.lexCategory;
    for (const c of clusters) {
      c.el.classList.toggle('is-live', c.id === cat || liveChannels.has(c.id));
    }
  }, { signal });
  root.addEventListener('pointerout', (evt) => {
    const chip = evt.target instanceof Element ? evt.target.closest('[data-lex-category]') : null;
    if (chip) syncChannels();
  }, { signal });
  document.addEventListener('keydown', onKeydown, { signal });
  document.addEventListener('lexicon:filter', onFilter, { signal });
  window.addEventListener('hashchange', () => {
    const id = readTermFromUrl();
    if (id) select(id, { url: false });
  }, { signal });
  document.addEventListener('visibilitychange', () => {
    _visible = !document.hidden;
    kick();
  }, { signal });

  if ('IntersectionObserver' in window) {
    _io = new IntersectionObserver((entries) => {
      _visible = entries.some((e) => e.isIntersecting) && !document.hidden;
      kick();
    }, { threshold: 0 });
    _io.observe(stage);
  }

  window.addEventListener('resize', () => {
    syncViewBox();
    if (!selected) fitVisible();
    kick();
  }, { signal });

  syncViewBox();
  root.dataset.atlasReady = 'true';
  fitVisible();
  const initial = readTermFromUrl();
  if (initial) select(initial, { url: false });
  kick();
  _bound = true;
}

function teardown() {
  if (!_bound) return;
  _abort?.abort();
  _abort = null;
  if (_raf) cancelAnimationFrame(_raf);
  _raf = 0;
  _io?.disconnect();
  _io = null;
  selected = null;
  focusMode = false;
  trail = [];
  hidden = new Set();
  nodes = [];
  edges = [];
  clusters = [];
  glyphPolys = [];
  glyphLines = [];
  byId = new Map();
  adjacency = new Map();
  root = null;
  stage = null;
  scrim = null;
  _bound = false;
}

export function initLexiconAtlas() {
  if (typeof window === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
  document.addEventListener('astro:before-swap', teardown);
  document.addEventListener('astro:page-load', bind);
}
