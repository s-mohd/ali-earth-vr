// Shared builder kit: palette, cached materials, geometry helpers, math/easing, blob shadows.
// Every world/station/character module builds with these so the whole game shares one look and stays cheap on Quest 2.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export { THREE };

// ---------------------------------------------------------------- palette (soft, warm, readable for children)
export const PAL = {
  // sky & sea
  skyTop: '#6fbfe8', sky: '#a9dcf3', horizon: '#f7e9d7', sea: '#7fd0e6', seaDeep: '#4fa9cf', foam: '#f4fbff',
  // ground
  grass: '#a8d98a', grassDark: '#86c47a', grassLight: '#c6e9a2', meadow: '#b6df95',
  sand: '#f1dcae', sandDark: '#dfbf86', soil: '#b88a5e', soilDark: '#8f6544', clay: '#c9a07a',
  path: '#f2e3c4', pathEdge: '#e3cb9b',
  // plants
  leaf: '#7cc47a', leafDark: '#5ea862', leafLight: '#9ed98c', palmLeaf: '#64ad5a', palmDry: '#b99a62',
  trunk: '#a87a52', trunkDark: '#7f5838', dates: '#c9742c',
  // rock & earth processes
  rock: '#c3b6a6', rockDark: '#9d8f7f', rockWarm: '#cfb99f', crack: '#4a3427', crackRim: '#c79f78',
  lava: '#ff7a33', lavaHot: '#ffd35c', lavaDeep: '#d9472f', ash: '#d8d0cb', volcano: '#b49384', volcanoDark: '#8f7064',
  water: '#5fc0e3', waterLight: '#a8e4f5',
  // built
  wallA: '#fff1dc', wallB: '#f9d9cf', wallC: '#d9efe2', parapet: '#ecd5b4', door: '#b98463', window: '#9fd7ef',
  road: '#9ba5b2', roadDark: '#7f8996', roadLine: '#fff6d8', machine: '#f6c445', machineDark: '#d9a420', metal: '#5f6670',
  // ui
  ink: '#25385c', inkSoft: '#4b6187', paper: '#fffaf1', cream: '#fff6e6', teal: '#3fb3a6', tealDark: '#2a8b80',
  coral: '#f2836b', coralDark: '#d4644d', orange: '#ffab52', orangeDark: '#e88a30', sun: '#ffd164', lav: '#9f8fe0',
  sky2: '#5fb4e6', green: '#3db878', greenDark: '#26935b', wrongBg: '#ffe2d3', wrong: '#f0a05a', grey: '#c3c9d1',
};

// ---------------------------------------------------------------- random & math
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
/** normalized position of t inside [a,b], clamped to 0..1 */
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
export const ease = {
  linear: (x) => x,
  inOut: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  out: (x) => 1 - Math.pow(1 - x, 3),
  in: (x) => x * x * x,
  outBack: (x) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  outElastic: (x) => (x === 0 || x === 1 ? x : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};
// cheap value noise (deterministic)
function hash2(x, y) { let n = x * 374761393 + y * 668265263; n = (n ^ (n >>> 13)) * 1274126177; n ^= n >>> 16; return (n >>> 0) / 4294967296; }
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
export function fbm(x, y, oct = 3) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2; a *= 0.5; } return s; }

// ---------------------------------------------------------------- materials (cached; Lambert = cheap per-fragment diffuse on Quest)
const _mats = new Map();
/**
 * Cached MeshLambertMaterial. opts: { flat, emissive, emissiveIntensity, transparent, opacity, side, vertexColors, unique }
 * Pass unique:true when you will animate/modify the material (then it is not shared).
 */
export function mat(color = '#ffffff', opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  if (!opts.unique && _mats.has(key)) return _mats.get(key);
  const m = new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
    flatShading: !!opts.flat,
    vertexColors: !!opts.vertexColors,
    transparent: !!opts.transparent || (opts.opacity != null && opts.opacity < 1),
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    emissive: new THREE.Color(opts.emissive || '#000000'),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    depthWrite: opts.depthWrite ?? !(opts.transparent || (opts.opacity != null && opts.opacity < 1)),
    fog: opts.fog ?? true,
  });
  if (!opts.unique) _mats.set(key, m);
  return m;
}
/** Material for merged geometry that carries per-vertex colors (one draw call for many colored parts). */
export function vcMat(opts = {}) { return mat('#ffffff', { ...opts, vertexColors: true }); }
/** Unlit material (emissive look, no lighting cost): lava glow, UI, skies. */
const _basic = new Map();
export function basic(color = '#ffffff', opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  if (!opts.unique && _basic.has(key)) return _basic.get(key);
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: !!opts.transparent || (opts.opacity != null && opts.opacity < 1), opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide, depthWrite: opts.depthWrite ?? !(opts.transparent || (opts.opacity != null && opts.opacity < 1)), fog: opts.fog ?? true, vertexColors: !!opts.vertexColors, toneMapped: false });
  if (!opts.unique) _basic.set(key, m);
  return m;
}

// ---------------------------------------------------------------- geometry helpers
/** Paint a whole geometry one color (adds a 'color' attribute). Returns the geometry. */
export function paint(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
/** Vertical color gradient (bottom->top in geometry local Y). */
export function gradient(geo, bottom, top, y0 = null, y1 = null) {
  geo.computeBoundingBox();
  const a = new THREE.Color(bottom), b = new THREE.Color(top), p = geo.attributes.position, arr = new Float32Array(p.count * 3), c = new THREE.Color();
  const lo = y0 ?? geo.boundingBox.min.y, hi = y1 ?? geo.boundingBox.max.y;
  for (let i = 0; i < p.count; i++) { c.copy(a).lerp(b, clamp((p.getY(i) - lo) / ((hi - lo) || 1))); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
/** Bake a transform into a geometry (clone). pos [x,y,z], rot [x,y,z] radians (XYZ), scale number|[x,y,z]. */
export function place(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const g = geo.clone();
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s));
  g.applyMatrix4(m);
  return g;
}
/**
 * Merge many colored parts into ONE geometry (one draw call). parts: [{ geo, color?, pos?, rot?, scale? }]
 * Parts are de-indexed/normalised so any mix of primitives merges safely.
 */
export function mergeParts(parts) {
  const geos = [];
  for (const p of parts) {
    let g = p.pos || p.rot || p.scale ? place(p.geo, p.pos, p.rot, p.scale ?? 1) : p.geo.clone();
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (p.color || !g.attributes.color) paint(g, p.color || '#ffffff');
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    geos.push(g);
  }
  return mergeGeometries(geos, false);
}
/** Mesh from merged parts with a shared vertex-color material. */
export function mergedMesh(parts, opts = {}) { const m = new THREE.Mesh(mergeParts(parts), vcMat(opts)); return m; }

const _rbox = new Map();
export function roundedBox(w, h, d, r = 0.05, seg = 3) {
  const key = [w, h, d, r, seg].join(',');
  if (!_rbox.has(key)) _rbox.set(key, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)));
  return _rbox.get(key);
}
/** Organic lumpy rock / foliage blob (icosphere + noise). Faceted by default; smooth: true welds vertices for soft, rounded shading. */
export function blobGeo(radius = 1, { detail = 2, jitter = 0.15, seed = 1, squash = 1, flat = false, smooth = false } = {}) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position, v = new THREE.Vector3(), r = rng(seed), ox = r() * 50, oz = r() * 50;
  // displace by noise so neighbouring (shared-position) vertices move identically -> no cracks
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x / radius * 1.6 + ox, (v.y + v.z * 0.7) / radius * 1.6 + oz, 2);
    v.multiplyScalar(1 + n * jitter); v.y *= squash; p.setXYZ(i, v.x, v.y, v.z);
  }
  if (smooth) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); }
  else if (flat && g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- canvas helpers
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); return c; }
export function canvasTexture(cnv, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(cnv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// ---------------------------------------------------------------- blob shadow (soft contact shadow, replaces shadow maps)
let _shadowTex = null;
function shadowTex() {
  if (_shadowTex) return _shadowTex;
  const c = canvas(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(40,40,60,0.85)'); g.addColorStop(0.5, 'rgba(40,40,60,0.35)'); g.addColorStop(1, 'rgba(40,40,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _shadowTex = canvasTexture(c);
  return _shadowTex;
}
const _shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** Soft ground shadow decal. rx/rz = radii in meters. Returns the mesh (add it yourself or pass parent). */
export function blobShadow(rx = 0.5, rz = rx, opacity = 0.35, parent = null, pos = [0, 0.012, 0]) {
  const m = new THREE.Mesh(_shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.scale.set(rx * 2, 1, rz * 2); m.position.set(...pos); m.renderOrder = 1;
  if (parent) parent.add(m);
  return m;
}

// ---------------------------------------------------------------- misc
/** Set renderOrder/visibility helpers */
export function setVisible(obj, v) { obj.visible = !!v; return obj; }
export function disposeTree(obj) { obj.traverse((o) => { o.geometry?.dispose?.(); }); }
/** Soft radial sprite texture (smoke, dust, sparkles). */
let _puff = null;
export function puffTexture() {
  if (_puff) return _puff;
  const c = canvas(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _puff = canvasTexture(c);
  return _puff;
}

// ---------------------------------------------------------------- diorama ground
/**
 * Round diorama ground for a station: a displaced disc (radius r) plus a skirt down to y = -depth, merged with vertex colors.
 * heightFn(x, z) -> y (keep it ~0 near the rim, r > radius - 0.15); colorFn(x, z, y) -> THREE.Color | css string.
 * The game raises the station on a plinth with a rim, and the environment leaves a pit under it, so the skirt is never seen
 * and anything you dig below y = 0 (cracks, river beds) stays enclosed by your own geometry.
 */
export function stageGround({ radius = 2.72, rings = 40, segments = 96, depth = 1.0, heightFn = () => 0, colorFn = () => PAL.grass, skirtColor = PAL.soilDark } = {}) {
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  const put = (x, y, z, color) => { pos.push(x, y, z); c.set(color); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const center = put(0, heightFn(0, 0), 0, colorFn(0, 0, heightFn(0, 0)));
  const ringStart = [];
  for (let i = 1; i <= rings; i++) {
    const r = (radius * i) / rings;
    ringStart.push(pos.length / 3);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightFn(x, z);
      put(x, y, z, colorFn(x, z, y));
    }
  }
  for (let j = 0; j < segments; j++) idx.push(center, ringStart[0] + ((j + 1) % segments), ringStart[0] + j);
  for (let i = 1; i < rings; i++) {
    const a0 = ringStart[i - 1], a1 = ringStart[i];
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
    }
  }
  // skirt
  const last = ringStart[rings - 1], skirt = pos.length / 3;
  for (let j = 0; j < segments; j++) {
    const a = (j / segments) * Math.PI * 2;
    put(Math.cos(a) * radius, -depth, Math.sin(a) * radius, skirtColor);
  }
  for (let j = 0; j < segments; j++) {
    const j1 = (j + 1) % segments;
    idx.push(last + j, last + j1, skirt + j, last + j1, skirt + j1, skirt + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
