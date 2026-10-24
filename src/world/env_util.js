// Environment helpers: zone maths, keep-clear rules, a vertex-colour batcher with an optional sway attribute,
// and the shared "sway" Lambert material (palms, flags, bunting move in the vertex shader: zero CPU cost per frame).
import { THREE } from '../core/kit.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { OUTER, STAGE, zoneTransform } from '../core/layout.js';

export const SEA_Y = -0.4; // sea level (terrain y = 0 inland)
/** Hole under each station plinth: 2.85 m at scale 1, inside the plinth's outer radius ((2.72 + 0.2) · scale). */
export const PIT_R = (STAGE.radius + 0.13) * (STAGE.scale ?? 1);
export const PIT_Y = -0.95;
const STATION_KEYS = OUTER.filter((k) => k !== 'hall');

/** Uniform shared by every animated environment material. */
export const TIME = { value: 0 };

// ---------------------------------------------------------------- zone maths
const ZT = {};
for (const k of ['hub', ...OUTER]) {
  const { pos, yaw } = zoneTransform(k);
  ZT[k] = { x: pos.x, z: pos.z, yaw, c: Math.cos(yaw), s: Math.sin(yaw) };
}
/** zone-local (x, z) → world [x, z] */
export function toWorld(key, lx, lz) {
  const t = ZT[key];
  return [t.x + lx * t.c + lz * t.s, t.z - lx * t.s + lz * t.c];
}
/** world (x, z) → zone-local [x, z] */
export function toLocal(key, x, z) {
  const t = ZT[key], dx = x - t.x, dz = z - t.z;
  return [dx * t.c - dz * t.s, dx * t.s + dz * t.c];
}
export const zoneYaw = (key) => ZT[key].yaw;
/** World centres of the station pits (diorama centres). */
export const PITS = STATION_KEYS.map((k) => { const [x, z] = toWorld(k, 0, STAGE.z); return { key: k, x, z }; });

/** The island is cut into angular sectors so frustum culling can drop what is behind the viewer. */
const SECTORS = 6;
const sectorOf = (x, z) => Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * SECTORS) % SECTORS;
/** One Batch per sector; pick(x, z) returns the batch for that spot. */
export function sectorBatches(withSway = false) {
  const list = Array.from({ length: SECTORS }, () => new Batch(withSway));
  return { list, pick: (x, z) => list[sectorOf(x, z)] };
}

/** Distance from p to segment a-b in the xz plane. */
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

/** Path centre-lines: hub plaza edge → each outer zone origin (straight spokes, readable as a map). */
export const PATHS = OUTER.map((k) => { const t = ZT[k], d = Math.hypot(t.x, t.z); return { key: k, ax: (t.x / d) * 2.6, az: (t.z / d) * 2.6, bx: t.x, bz: t.z }; });
export const PATH_HALF = 0.85;
export function pathDist(x, z) {
  let d = Infinity;
  for (const p of PATHS) d = Math.min(d, segDist(x, z, p.ax, p.az, p.bx, p.bz));
  return d;
}

/**
 * Can something of a given size stand at world (x, z)?  size: 'tall' (palms, houses), 'mid' (bushes, rocks), 'low' (flowers).
 * Encodes the ARCHITECTURE keep-clear rules plus a clean sea view behind every diorama.
 */
/** The hub gateway (world): centre z and half-width of its footprint. */
export const GATE = { x: 0, z: -5.6, half: 1.6 };
export function isClear(x, z, size = 'mid', pad = 0) {
  const r = Math.hypot(x, z);
  if (Math.abs(x - GATE.x) < GATE.half + 0.5 + pad && Math.abs(z - GATE.z) < 0.9 + pad) return false;
  if (r < (size === 'low' ? 3.3 : 3.9) + pad) return false; // hub plaza
  if (pathDist(x, z) < PATH_HALF + (size === 'low' ? 0.25 : 0.7) + pad) return false;
  if (size === 'tall' && r < 6.2 + pad) return false;
  for (const k of OUTER) {
    const [lx, lz] = toLocal(k, x, z), d0 = Math.hypot(lx, lz);
    if (d0 < (size === 'low' ? 1.7 : 3.2) + pad) return false; // viewer pad (nothing bulky right behind the viewer)
    if (k !== 'hall' && Math.hypot(lx, lz - STAGE.z) < PIT_R + (size === 'low' ? 0.5 : 0.9) + pad) return false; // plinth
    if (k === 'hall' && Math.hypot(lx, lz + 3.2) < (size === 'low' ? 5.6 : 7.6) + pad) return false; // hall courtyard + arcade
    if (size === 'low') continue;
    if (Math.abs(lx) < 3.3 + pad && lz < 1.5 && lz > -7.4) return false; // the stage area in front of the viewer
    if (size === 'tall') {
      if (d0 < 4.6 + pad && !(lz < -6.5 || Math.abs(lx) > 3.5)) return false;
      if (Math.abs(lx) < 4.2 + pad && lz < -6 && lz > -60) return false; // keep the sea view behind each diorama clean
      if (Math.abs(lx) < 2.4 + pad && lz > 0 && lz < 9) return false; // do not stand right behind the viewer's path
    }
  }
  return true;
}

/**
 * Is world (x, z) inside the forward view of any place within maxD metres (a wedge of half-angle atan(slope), ±51° by
 * default, widening from just behind the viewer)? Tall things there would stand behind the board, Ali or the diorama: random trees and groves stay out of it.
 */
export function inView(x, z, maxD = 22, hubD = 12, slope = 1.25) {
  for (const k of ['hub', ...OUTER]) {
    const [lx, lz] = toLocal(k, x, z);
    if (lz < 1 && Math.abs(lx) < slope * (1 - lz) && Math.hypot(lx, lz) < (k === 'hub' ? hubD : maxD)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- geometry batching
/**
 * Weld a (non-indexed) geometry by position and recompute normals: soft, rounded shading for blobs.
 * minY drops the triangles lying wholly below it (buried or underwater undersides nobody sees).
 */
export function smoothGeo(geo, minY = -Infinity) {
  const g = new THREE.BufferGeometry().setAttribute('position', geo.attributes.position.clone());
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  if (minY > -Infinity) {
    const P = m.attributes.position, I = m.index.array, keep = [];
    for (let i = 0; i < I.length; i += 3) if (Math.max(P.getY(I[i]), P.getY(I[i + 1]), P.getY(I[i + 2])) >= minY) keep.push(I[i], I[i + 1], I[i + 2]);
    m.setIndex(keep);
  }
  return m;
}

/** Texture coordinate of a pure-white texel in a textured batch's atlas (plain vertex-coloured parts use it). */
const WHITE_UV = [0.995, 0.005];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();

/**
 * Accumulates many parts into one non-indexed geometry with position / normal / color (+ optional aSway).
 * add(geo, { pos, rot, scale, color, grad: [bottom, top], sway: number | (x, y, z) => number, flat, uvRect: [u0, v0, u1, v1] })
 * grad and sway functions see the part's own (untransformed) coordinates. With UVs on, parts without uvRect sample WHITE_UV.
 */
export class Batch {
  constructor(withSway = false, withUV = false) { this.p = []; this.n = []; this.c = []; this.w = withSway ? [] : null; this.uv = withUV ? [] : null; }
  add(geo, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (o.flat || !g.attributes.normal) { g.deleteAttribute('normal'); g.computeVertexNormals(); }
    const src = g.attributes.position.clone();
    let y0 = 0, y1 = 1;
    if (o.grad) { g.computeBoundingBox(); y0 = o.grad[2] ?? g.boundingBox.min.y; y1 = o.grad[3] ?? g.boundingBox.max.y; }
    if (o.pos || o.rot || o.scale != null) {
      const s = o.scale ?? 1;
      _m.compose(_v.set(...(o.pos || [0, 0, 0])), _q.setFromEuler(_e.set(...(o.rot || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.set(s, s, s));
      g.applyMatrix4(_m);
    }
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    if (o.color) _c.set(o.color);
    if (o.grad) { _c.set(o.grad[0]); _c2.set(o.grad[1]); }
    const col = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      this.p.push(P.getX(i), P.getY(i), P.getZ(i));
      this.n.push(N.getX(i), N.getY(i), N.getZ(i));
      if (o.grad) col.copy(_c).lerp(_c2, Math.max(0, Math.min(1, (src.getY(i) - y0) / ((y1 - y0) || 1))));
      else if (o.color) col.copy(_c);
      else if (C) col.setRGB(C.getX(i), C.getY(i), C.getZ(i));
      else col.setRGB(1, 1, 1);
      this.c.push(col.r, col.g, col.b);
      if (this.w) this.w.push(typeof o.sway === 'function' ? o.sway(src.getX(i), src.getY(i), src.getZ(i)) : o.sway || 0);
      if (this.uv) {
        const r = o.uvRect, U = g.attributes.uv;
        if (r && U) this.uv.push(r[0] + (r[2] - r[0]) * U.getX(i), r[1] + (r[3] - r[1]) * U.getY(i)); else this.uv.push(...WHITE_UV);
      }
    }
    g.dispose();
    return this;
  }
  /** One raw vertex (triangles are consecutive triples). */
  vtx(p, n, color, sw = 0, uv = WHITE_UV) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]);
    _c.set(color); this.c.push(_c.r, _c.g, _c.b);
    if (this.w) this.w.push(sw);
    if (this.uv) this.uv.push(uv[0], uv[1]);
  }
  /** Raw flat triangle (world coords) with per-vertex colours [c0, c1, c2] and sways. */
  tri(a, b, c, cols, sw = [0, 0, 0]) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _s.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _v.cross(_s).normalize();
    const n = [_v.x, _v.y, _v.z];
    this.vtx(a, n, cols[0], sw[0]); this.vtx(b, n, cols[1] ?? cols[0], sw[1]); this.vtx(c, n, cols[2] ?? cols[0], sw[2]);
  }
  get count() { return this.p.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.w) g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.w, 1));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** Indexed vertex-colour mesher for flat decals and the terrain grid (shared vertices, smooth normals). */
export class Mesher {
  constructor() { this.p = []; this.c = []; this.i = []; }
  v(x, y, z, color) { this.p.push(x, y, z); _c.set(color); this.c.push(_c.r, _c.g, _c.b); return this.p.length / 3 - 1; }
  t(a, b, c) { this.i.push(a, b, c); }
  /** Filled polygon (fan) lying flat at height y; pts = [[x, z], ...] counter-clockwise seen from above. */
  poly(pts, y, color, cx = 0, cz = 0, centreColor = color) {
    const o = this.v(cx, y, cz, centreColor), first = this.p.length / 3;
    for (const [x, z] of pts) this.v(x, y, z, color);
    for (let k = 0; k < pts.length; k++) this.t(o, first + ((k + 1) % pts.length), first + k);
  }
  disc(cx, cz, r, y, color, seg = 48, centreColor = color) {
    const pts = [];
    for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    this.poly(pts, y, color, cx, cz, centreColor);
  }
  ring(cx, cz, r0, r1, y, color, seg = 64, outerColor = color) {
    const s = this.p.length / 3;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      this.v(cx + c * r0, y, cz + sn * r0, color); this.v(cx + c * r1, y, cz + sn * r1, outerColor);
    }
    for (let k = 0; k < seg; k++) {
      const a = s + k * 2, b = s + ((k + 1) % seg) * 2;
      this.t(a, b, a + 1); this.t(b, b + 1, a + 1);
    }
  }
  /** n-pointed star (two radii) centred at (cx, cz), rotated by rot. */
  star(cx, cz, R, n, y, color, rot = 0, inner = 0.62, centreColor = color) {
    const pts = [];
    for (let k = 0; k < n * 2; k++) { const a = rot + (k / (n * 2)) * Math.PI * 2, r = k % 2 ? R * inner : R; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    this.poly(pts, y, color, cx, cz, centreColor);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- materials
/** Adds k × albedo as self-light to a Lambert shader: shaded faces of festive pieces stay bright (no extra cost). */
const selfLit = (sh, k) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * ${k.toFixed(2)};`);
};

/** Vertex-colour Lambert with a little self-light (the hall arcade, whose inner faces look away from the sun). */
export function brightMaterial(k = 0.25) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => selfLit(sh, k);
  m.customProgramCacheKey = () => 'env-bright-' + k;
  return m;
}

/**
 * Lambert + vertex colours whose vertices move by aSway in the vertex shader.
 * kind 'tree': slow lean of the whole crown + leaf flutter (aSway 0 at the base … 1 crown … >1 leaf tips)
 * kind 'cloth': flags / bunting ripple (aSway = distance from the fixed edge, metres); a little self-light keeps the
 * colours festive on the side away from the sun
 */
export function swayMaterial(kind, { side = THREE.DoubleSide, map = null } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side, map });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uTime;')
      .replace('#include <begin_vertex>', kind === 'tree' ? `#include <begin_vertex>
        float ph = position.x * 0.37 + position.z * 0.23;
        float lean = aSway * aSway;
        transformed.x += lean * (0.07 * sin(uTime * 0.85 + ph) + 0.025 * sin(uTime * 1.9 + ph * 2.0));
        transformed.z += lean * 0.055 * sin(uTime * 0.67 + ph * 1.3);
        float tip = max(aSway - 1.0, 0.0);
        transformed.y += tip * 0.12 * sin(uTime * 2.3 + ph * 3.0 + position.y * 2.0);` : `#include <begin_vertex>
        float ph = position.x * 0.5 + position.z * 0.5;
        float a = aSway;
        transformed += objectNormal * (a * 0.11 * sin(uTime * 3.1 - a * 3.4 + ph));
        transformed.y += a * 0.025 * sin(uTime * 3.9 - a * 4.0 + ph);`);
    if (kind === 'cloth') selfLit(sh, 0.28);
  };
  m.customProgramCacheKey = () => 'env-sway-' + kind;
  return m;
}
