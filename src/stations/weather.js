// Station «التجوية» (weathering) — an accelerated simulation.
// A big layered sandstone boulder sits on rippled desert sand. A small sidr seedling has taken root in a hairline crack on
// its top. A stone "time window" behind it turns day and night faster and faster (years pass). The agents of weathering
// visit one by one, slowly: rain soaks the rock and fills its cracks, the hot sun bakes it (heat shimmer), and the
// seedling's root grows down into the crack and wedges it open. Cracks spread and widen, then the rock breaks along those
// very cracks into two halves and a handful of chunks that settle right beside it, with grains around. Finally a dashed
// ring marks the rock's spot: everything stayed where the rock was (weathering = breaking up in place; nothing travels).
//
// The boulder is fractured procedurally at build time (power-diagram cells clipped from one smooth mesh), so the pieces fit
// together seamlessly at t = 0. All pieces, the crack ribbons, the seedling and its root are ONE mesh: a per-vertex piece id
// selects a matrix from a small uniform array, growth un-collapses per-vertex offsets, and a small Lambert patch paints the
// sandstone strata per fragment (crisp at any distance) and the rain's wet front. A matching depth material lets the
// moving pieces cast true shadows.
import { THREE, PAL, rng, clamp, lerp, seg, smooth, ease, fbm, noise2, mat, basic, mergeParts, place, blobGeo, stageGround } from '../core/kit.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { sandTexture, desertShrub, sidrTree, pebbleField, timeWindow, hotSun, shimmerGeo, softDisc, seedlingParts } from './weather_props.js';

const V3 = THREE.Vector3;
const ROCK = new V3(0, 0.53, -0.1); // boulder centre; the ground cuts it at y = 0
const AXES = new V3(0.75, 0.66, 0.64); // semi-axes → about 1.5 m wide and 1.2 m tall above the sand
const DURATION = 12; // seconds for t 0 → 1
const SPLIT = 0.6; // t when the rock breaks (the fully cracked, still whole rock holds from ≈ 0.5)
const CRACK_SFX = [0.28, 0.34, 0.4, 0.46];
const DAYS = 18; // too many to count: the window blurs at full speed (≈ 2 turns/s), then slows to a stop at noon
const DIAL = new V3(1.27, 0, -1.7); // the time window's foot: back right, outside the ring, clear of Ali
const RING = { rx: 1.7, rz: 1.48, from: 0.87, to: 0.95, dashes: 34 };
const RING_FILL = 0.88; // pieces stay inside this fraction of the ring (the dashes start at ≈ 0.98)
const SETTLED = 0.86; // every piece and grain has landed and the ring has not started: the quiz picture
const LAYER = 0.165; // sandstone layer thickness (m)
const PLANT_A = 0.5, ROOT_A = 1.42; // the seedling sits on the split line 29° from the top toward the viewer; its root reaches 81°

// ---------------------------------------------------------------- boulder surface (star-shaped around ROCK)
// sandstone layers: the same coordinate drives the geometry (undercut layer bottoms, small ledges) and the fragment colour
// (layer thickness varies: a monotone remap of the height; the ledges come and go around the rock)
const layerCoord = (x, y, z) => { const u = (y + 0.05 * x - 0.03 * z) / LAYER + 0.3 * Math.sin(x * 3.1 + z * 2.3); return u + 0.32 * Math.sin(u * 0.85 + 1.1); };
const strataRecess = (f, x, z, L) => (0.022 * (1 - smooth(0, 0.3, f)) + 0.006 * smooth(0.8, 1, f)) * smooth(-0.35, 0.45, noise2(Math.atan2(z - ROCK.z, x - ROCK.x) * 1.6 + Math.floor(L) * 3.7, Math.floor(L) * 1.3));
// broad, slightly uneven joint faces (soft-min with planes, in ellipsoid space): a weathered block, not a ball
const FACETS = [[0, 1, 0.08, 0.84], [-0.55, 0.25, 0.8, 0.88], [0.62, 0.12, 0.78, 0.9], [-1, 0.12, -0.05, 0.88], [1, -0.05, -0.25, 0.9], [0.1, 0.25, -1, 0.89], [0.05, 0.72, 0.7, 0.9], [-0.6, 0.7, -0.3, 0.9],
  [0.7, 0.62, -0.2, 0.9], [-0.75, 0.45, 0.45, 0.9], [0.35, -0.2, 0.95, 0.92], [-0.3, -0.25, 0.95, 0.93], [0.8, 0.3, 0.55, 0.92], [-0.85, -0.2, -0.5, 0.92]]
  .map(([x, y, z, h]) => { const n = new V3(x, y, z).normalize(); return { n, h }; });
function radial0(d) {
  const e = 2.4; // superellipsoid: rounded but with broad faces, like a real boulder; fuller below, so it sits IN the sand
  const dy = d.y < 0 ? d.y * 0.72 : d.y;
  const se = Math.pow(Math.pow(Math.abs(d.x), e) + Math.pow(Math.abs(dy), e) + Math.pow(Math.abs(d.z), e), -1 / e);
  let r = se * (1 + 0.1 * fbm(d.x * 1.5 + 4.1, (d.y + d.z * 0.6) * 1.5 + 2.3, 3) + 0.04 * noise2(d.z * 2.4 - d.x + 9, d.y * 2.4 + 1.7));
  const k = 0.02;
  for (const f of FACETS) {
    const c = f.n.x * d.x + f.n.y * d.y + f.n.z * d.z;
    if (c <= 0.05) continue;
    const rp = (f.h / c) * (1 + 0.025 * noise2(d.x * 3 + f.h * 9, d.y * 3 + d.z * 2));
    r = -k * Math.log(Math.exp(-r / k) + Math.exp(-rp / k)); // soft min
  }
  // tafoni: shallow honeycomb hollows on the flanks (typical of desert sandstone)
  const pit = smooth(0.3, 0.6, noise2(d.x * 4.2 + d.z * 2.1 + 17, d.y * 4.6 - d.z * 3.3 + 5));
  return r * (1 - 0.06 * pit * (1 - Math.abs(d.y)));
}
function radial(d) {
  const r = radial0(d), x = ROCK.x + AXES.x * d.x * r, z = ROCK.z + AXES.z * d.z * r, L = layerCoord(x, ROCK.y + AXES.y * d.y * r, z);
  return r * (1 - strataRecess(L - Math.floor(L), x, z, L));
}
const _q = new V3();
function insideRock(p) {
  _q.subVectors(p, ROCK).divide(AXES);
  const l = _q.length();
  return l < 1e-6 || l <= radial(_q.multiplyScalar(1 / l));
}
/** The surface point on the ray from ROCK through p. */
function surfacePoint(p, out = new V3()) {
  const d = _q.subVectors(p, ROCK).divide(AXES).normalize();
  return out.copy(d).multiplyScalar(radial(d)).multiply(AXES).add(ROCK);
}
/** Distance from ROCK to the boulder surface along the unit direction u (world space). */
const _u = new V3();
function surfaceDist(u) {
  _u.copy(u).divide(AXES);
  const l = _u.length();
  return radial(_u.multiplyScalar(1 / l)) / l;
}
function surfaceNormal(p) {
  const f = (x, y, z) => { _q.set(x, y, z).sub(ROCK).divide(AXES); const l = _q.length(); return l - radial(_q.multiplyScalar(1 / l)); };
  const h = 1e-3;
  return new V3(f(p.x + h, p.y, p.z) - f(p.x - h, p.y, p.z), f(p.x, p.y + h, p.z) - f(p.x, p.y - h, p.z), f(p.x, p.y, p.z + h) - f(p.x, p.y, p.z - h)).normalize();
}

// ---------------------------------------------------------------- mesh clipping helpers (build time only)
// Triangles are {v: [{p, n} x3], skin}. Plane cuts are computed in a canonical order (from the side with the lower signed
// distance), so a shared edge yields bit-identical points in every triangle and every cell: no seams between pieces.
const _a = new V3(), _b = new V3();
// colours ride along (interpolated, not re-sampled) so a split triangle shades exactly like the original one: no seams
const lerpVert = (lo, hi, t) => ({ p: lo.p.clone().lerp(hi.p, t), n: lo.n.clone().lerp(hi.n, t).normalize(), c: lo.c && lo.c.clone().lerp(hi.c, t), cut: true });
const cutVert = (a, b, ra, rb) => (ra < rb ? lerpVert(a, b, ra / (ra - rb)) : lerpVert(b, a, rb / (rb - ra)));
/** Keep the part of each triangle where sign·(n·p − d) ≤ 0; the rest goes to `outside` when given (sharing the very same
 *  cut vertices). Cut points are pushed to `cuts` when given. */
function clipTris(tris, pl, sign, cuts, outside) {
  const kept = [], { n, d } = pl;
  for (const tri of tris) {
    const v = tri.v, r0 = v[0].p.dot(n) - d, r1 = v[1].p.dot(n) - d, r2 = v[2].p.dot(n) - d;
    const i0 = sign * r0 <= 0, i1 = sign * r1 <= 0, i2 = sign * r2 <= 0;
    if (i0 && i1 && i2) { kept.push(tri); continue; }
    if (!i0 && !i1 && !i2) { outside?.push(tri); continue; }
    const rs = [r0, r1, r2], ins = [i0, i1, i2], poly = [], rest = [];
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3;
      (ins[a] ? poly : rest).push(v[a]);
      if (ins[a] !== ins[b]) { const x = cutVert(v[a], v[b], rs[a], rs[b]); poly.push(x); rest.push(x); cuts?.push(x.p); }
    }
    for (let k = 1; k + 1 < poly.length; k++) kept.push({ v: [poly[0], poly[k], poly[k + 1]], skin: tri.skin });
    if (outside) for (let k = 1; k + 1 < rest.length; k++) outside.push({ v: [rest[0], rest[k], rest[k + 1]], skin: tri.skin });
  }
  return kept;
}
/** Clip a planar polygon (array of V3) by a plane, keeping sign·(n·p − d) ≤ 0. */
function clipPoly(poly, pl, sign) {
  const out = [], n = poly.length;
  for (let a = 0; a < n; a++) {
    const P = poly[a], Q = poly[(a + 1) % n], rp = P.dot(pl.n) - pl.d, rq = Q.dot(pl.n) - pl.d;
    if (sign * rp <= 0) out.push(P);
    if ((sign * rp <= 0) !== (sign * rq <= 0)) out.push(rp < rq ? P.clone().lerp(Q, rp / (rp - rq)) : Q.clone().lerp(P, rq / (rq - rp)));
  }
  return out;
}
/** Order points lying on a plane around their centroid (de-duplicated): the outline of a near-convex section. */
function loopAround(points, n) {
  const seen = new Map();
  for (const p of points) seen.set(Math.round(p.x * 1e6) + ',' + Math.round(p.y * 1e6) + ',' + Math.round(p.z * 1e6), p);
  const pts = [...seen.values()], c = pts.reduce((s, p) => s.add(p), new V3()).divideScalar(pts.length || 1);
  const u = new V3().crossVectors(n, Math.abs(n.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize(), w = new V3().crossVectors(n, u);
  const ang = (p) => Math.atan2(_a.subVectors(p, c).dot(w), _a.dot(u));
  return pts.map((p) => [ang(p), p]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
}
/** Fan-triangulate a near-convex planar polygon from its centroid, facing nOut. */
function fanPoly(poly, nOut, out) {
  if (poly.length < 3) return;
  const c = poly.reduce((s, p) => s.add(p), new V3()).divideScalar(poly.length), cv = { p: c, n: nOut, centre: true };
  for (let k = 0; k < poly.length; k++) {
    let A = { p: poly[k], n: nOut }, B = { p: poly[(k + 1) % poly.length], n: nOut };
    if (_a.subVectors(A.p, c).cross(_b.subVectors(B.p, c)).dot(nOut) < 0) [A, B] = [B, A];
    out.push({ v: [cv, A, B], skin: false });
  }
}

// ---------------------------------------------------------------- colours
const hex = (h) => new THREE.Color(h);
// sandstone layers (picked per layer by a hash in the fragment shader) and the fresh, unweathered inside of the rock
const STRATA = ['#e4d3b3', '#d4bb93', '#ecdfc6', '#cfb091', '#ddc8a3', '#c8b79b', '#e7d7ba', '#d9c09a'].map(hex);
const FRESH = hex('#f6e1c2');
const COL = {
  crack: hex('#1b0f09'), crackMid: hex('#3d2516'), crackRim: hex('#f7dfb8'),
  root: hex('#a5703f'), rootTip: hex('#dcb27a'), // lighter than the crack it lies in, so it reads
  // skin multipliers (the layer colour comes from the shader)
  varnish: new THREE.Color(0.62, 0.5, 0.43), crust: new THREE.Color(1.06, 1.06, 0.96), bleach: new THREE.Color(1.07, 1.06, 1.03),
  lichenO: hex('#df9a3a'), lichenS: hex('#c3c995'),
};
const glsl = (c) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
const _c = new THREE.Color();
/** Per-vertex multiplier for the weathered skin: cavities, foot dust, sun-bleached top, varnish streaks, lichen. */
function skinTint(p, n, cav) {
  _c.setRGB(1, 1, 1);
  const ang = Math.atan2(p.z - ROCK.z, p.x - ROCK.x), side = 1 - Math.abs(n.y);
  _c.lerp(COL.varnish, smooth(0.15, 0.55, noise2(ang * 7.5 + 3, p.y * 1.4 + 4)) * smooth(0.1, 0.75, p.y) * side * 0.72);
  _c.lerp(COL.bleach, smooth(0.45, 0.9, n.y));
  _c.lerp(COL.crust, smooth(0.3, 0.5, noise2(p.x * 7 + p.z * 2, p.y * 7 - 3)) * 0.35); // (crisp lichen spots are painted per fragment)
  const ao = clamp(1 - cav * 13, 0.5, 1.06) * lerp(0.42, 1, smooth(-0.02, 0.36, p.y));
  return _c.multiplyScalar(ao);
}

// ---------------------------------------------------------------- the fracture plan
// The boulder splits along one plane into two halves (like a split-apple rock), and a few chunks break off its surface.
// Chunks are cells of a power diagram: a heavy core site plus a shell of sites just under the skin. The shell cells nearest
// to CHUNKS come loose; the other shell cells only shape them (they stay with the halves), so chunks come out small and chunky.
const CORE_W = 0.12, SHELL = 58, SHELL_DEPTH = 0.8;
const SPLIT_N = new V3(1, -0.08, 0.16).normalize(); // the main break plane through the boulder centre (left half: −x side)
const CHUNKS = [
  // [direction (ellipsoid space), order of falling] — none sits on the front of the split line (the seedling's root runs there)
  [[-0.45, 0.85, -0.25], 0], [[0.5, 0.8, 0.2], 1], [[0.45, 0.45, -0.78], 2], [[-0.97, 0.05, -0.15], 3],
  [[0.95, 0.05, 0.35], 4], [[0.62, -0.18, 0.78], 5], [[-0.42, 0.48, 0.77], 6], [[-0.55, -0.25, 0.8], 7],
];
const TILT = 0.12, YAW = 0.17, SLIDE = 0.05; // how the two halves lean apart (radians, radians, metres)
const PLANT_PIECE = 1; // the seedling and its root ride on the right half

export default function buildStation(ctx = {}) {
  const sfx = ctx.sfx, low = ctx.quality === 'low';
  const R = rng(73);
  const group = new THREE.Group();
  group.name = 'station:weather';
  const geos = [], mats = [];
  const keep = (m) => { geos.push(m.geometry); return m; };

  // ================================================================ ground: rippled sand, low dunes at the back
  const dr = (x, z) => Math.hypot(x - ROCK.x, z - ROCK.z);
  const de = (x, z) => Math.hypot((x - ROCK.x) / AXES.x, (z - ROCK.z) / AXES.z); // elliptic distance (1 ≈ the rock's widest)
  const groundH = (x, z) => smooth(1.8, 2.3, dr(x, z)) * (1 - smooth(2.2, 2.55, Math.hypot(x, z))) * (0.07 + 0.06 * fbm(x * 0.8 + 3, z * 0.8 + 1, 2)) * (z < 0 ? 1.4 : 0.6);
  const gSand = hex('#f3dcaa'), gDark = hex('#dcb57c'), gPack = hex('#d9b98a'), gCrest = hex('#fbecc8'), gWarm = hex('#efc994');
  const groundGeo = stageGround({
    rings: low ? 28 : 36, segments: low ? 80 : 96,
    heightFn: groundH,
    colorFn: (x, z, y) => {
      const big = fbm(x * 0.55 + 7, z * 0.55 - 2, 3);
      const c = new THREE.Color().copy(gSand).lerp(gWarm, smooth(-0.2, 0.4, big) * 0.55).lerp(gDark, smooth(0.1, 0.5, -big) * 0.35);
      c.lerp(gPack, 0.5 * (1 - smooth(0.9, 1.5, de(x, z)))); // packed, darker sand round the boulder
      c.multiplyScalar(lerp(0.72, 1, smooth(0.62, 1.08, de(x, z)))); // contact occlusion at its foot
      return c.lerp(gCrest, clamp(y / 0.13) * 0.6);
    },
    skirtColor: PAL.sandDark,
  });
  {
    // planar UVs for the ripple texture (tile ≈ 0.95 m, turned so ripples run across the view at a slant)
    const p = groundGeo.attributes.position, uv = new Float32Array(p.count * 2), ca = Math.cos(0.42), sa = Math.sin(0.42);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); uv[i * 2] = (x * ca - z * sa) / 0.95; uv[i * 2 + 1] = (x * sa + z * ca) / 0.95; }
    groundGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const sandTex = sandTexture(low ? 256 : 512);
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: sandTex });
  mats.push(groundMat);
  const ground = keep(new THREE.Mesh(groundGeo, groundMat));
  group.add(ground);

  // ================================================================ desert décor (one merged mesh): shrubs, sidr tree, grass, stones
  const decor = [];
  const tuft = (x, z, s, seed) => {
    const r = rng(seed), y = groundH(x, z);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r(), h = (0.12 + r() * 0.1) * s;
      decor.push({ geo: new THREE.ConeGeometry(0.012 * s, h, 4), color: ['#d8c27c', '#c7ad63', '#bfc472'][i % 3], pos: [x + Math.cos(a) * 0.03 * s, y + h / 2 - 0.01, z + Math.sin(a) * 0.03 * s], rot: [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45] });
    }
  };
  const stone = (x, z, s, seed, color) => {
    const g = blobGeo(1, { detail: 1, jitter: 0.22, seed });
    const part = { geo: g, color, pos: [x, groundH(x, z) + 0.02 * s, z], rot: [0, seed, 0], scale: [0.2 * s, 0.09 * s, 0.15 * s] };
    decor.push(part);
    return part;
  };
  desertShrub(decor, -2.05, groundH(-2.05, -1.0), -1.0, 1.25, 11);
  desertShrub(decor, 2.3, groundH(2.3, -0.25), -0.25, 1.05, 12);
  desertShrub(decor, -0.55, groundH(-0.55, -2.4), -2.4, 0.95, 13, { dry: true });
  desertShrub(decor, 0.55, groundH(0.55, -2.4), -2.4, 0.85, 14);
  desertShrub(decor, -2.35, groundH(-2.35, 0.3), 0.3, 0.8, 15, { dry: true });
  sidrTree(decor, -1.62, groundH(-1.62, -1.9), -1.9, 1.15, 16); // the seedling's parent, on the dune behind
  // nothing taller than 0.1 m in the two front corners (Ali stands front-right, the info board front-left)
  tuft(-2.2, 0.8, 1, 21); tuft(2.4, 0.4, 0.9, 22); tuft(-0.95, 1.95, 0.8, 23); tuft(0.85, 2.05, 0.9, 24); tuft(2.35, -0.75, 1.1, 25); tuft(-2.45, -0.45, 1, 26); tuft(0.15, -2.5, 1, 27); tuft(2.2, 0.95, 0.8, 28); tuft(-1.2, -2.2, 0.9, 29);
  // grey bedrock slabs (a different stone from the boulder), far from the ring, so nothing looks like a piece that travelled
  const slab = stone(2.05, -0.98, 1.8, 31, '#cdc5b8'); stone(0.95, -2.25, 1.0, 33, '#c9c0b2'); stone(-2.15, -0.35, 0.8, 36, '#c4bcb0');
  const ringE0 = (x, z) => Math.hypot((x - ROCK.x) / RING.rx, (z - ROCK.z) / RING.rz);
  pebbleField(decor, { count: low ? 40 : 70, seed: 52, heightAt: groundH, ok: (x, z) => ringE0(x, z) > 1.12 && Math.hypot(x - DIAL.x, z - DIAL.z) > 0.45 && Math.hypot(x - slab.pos[0], z - slab.pos[2]) > 0.45 });
  group.add(keep(new THREE.Mesh(mergeParts(decor), mat('#ffffff', { vertexColors: true }))));

  // ================================================================ the boulder, fractured
  let base;
  {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, low ? 11 : 15).deleteAttribute('normal').deleteAttribute('uv'));
    const pos = g.attributes.position, d = new V3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      const s = radial(d);
      pos.setXYZ(i, ROCK.x + AXES.x * d.x * s, ROCK.y + AXES.y * d.y * s, ROCK.z + AXES.z * d.z * s);
    }
    g.computeVertexNormals();
    // cavity: how far a vertex sits below the average of its neighbours (along its normal) → darker crevices and pits
    const idx = g.index.array, sum = new Float32Array(pos.count * 3), cnt = new Uint16Array(pos.count);
    for (let k = 0; k < idx.length; k += 3) for (let e = 0; e < 3; e++) {
      const a = idx[k + e], b = idx[k + ((e + 1) % 3)];
      sum[a * 3] += pos.getX(b); sum[a * 3 + 1] += pos.getY(b); sum[a * 3 + 2] += pos.getZ(b); cnt[a]++;
      sum[b * 3] += pos.getX(a); sum[b * 3 + 1] += pos.getY(a); sum[b * 3 + 2] += pos.getZ(a); cnt[b]++;
    }
    const verts = [], nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const p = new V3().fromBufferAttribute(pos, i), n = new V3().fromBufferAttribute(nrm, i);
      const cav = new V3(sum[i * 3], sum[i * 3 + 1], sum[i * 3 + 2]).divideScalar(cnt[i] || 1).sub(p).dot(n);
      verts.push({ p, n, c: skinTint(p, n, cav).clone() });
    }
    const tris = [];
    for (let k = 0; k < idx.length; k += 3) tris.push({ v: [verts[idx[k]], verts[idx[k + 1]], verts[idx[k + 2]]], skin: true });
    g.dispose();
    const bottom = { n: new V3(0, -1, 0), d: 0.03 }, cuts = []; // flat bottom just under the sand
    base = clipTris(tris, bottom, 1, cuts);
    fanPoly(loopAround(cuts, bottom.n), bottom.n, base);
  }
  const sites = [{ p: ROCK.clone(), w: CORE_W, chunk: -1 }];
  {
    const r = rng(11), golden = Math.PI * (3 - Math.sqrt(5)), shell = [];
    for (let i = 0; i < SHELL; i++) {
      const y = 1 - (2 * (i + 0.5)) / SHELL, rr = Math.sqrt(1 - y * y), a = i * golden + (r() - 0.5) * 0.3;
      const d = new V3(Math.cos(a) * rr, y, Math.sin(a) * rr);
      shell.push({ d, p: d.clone().multiplyScalar(radial(d) * SHELL_DEPTH).multiply(AXES).add(ROCK), w: 0, chunk: -1 });
    }
    CHUNKS.forEach(([dir], c) => {
      const want = new V3(...dir).normalize();
      let best = null;
      for (const s of shell) if (s.chunk < 0 && (!best || s.d.dot(want) > best.d.dot(want))) best = s;
      best.chunk = c;
    });
    sites.push(...shell);
  }
  const NS = sites.length, NP = 2 + CHUNKS.length; // cells; pieces (0 left half, 1 right half, 2.. chunks)
  const SPLIT_PL = { n: SPLIT_N, d: SPLIT_N.dot(ROCK) };
  const sideOf = (p) => (p.dot(SPLIT_PL.n) - SPLIT_PL.d <= 0 ? 0 : 1);
  const planes = sites.map((a, i) => sites.map((b, j) => {
    if (j <= i) return null;
    const n = b.p.clone().sub(a.p), L = n.length();
    return { n: n.divideScalar(L), d: (b.p.lengthSq() - a.p.lengthSq() - b.w + a.w) / (2 * L) };
  }));
  const planeOf = (i, j) => (i < j ? { pl: planes[i][j], sign: 1 } : { pl: planes[j][i], sign: -1 });
  const pieceAt = (p) => {
    let best = 0, bv = Infinity;
    sites.forEach((s, i) => { const v = p.distanceToSquared(s.p) - s.w; if (v < bv) { bv = v; best = i; } });
    return sites[best].chunk >= 0 ? 2 + sites[best].chunk : sideOf(p);
  };
  // real neighbours of a cell = faces of its convex polytope (a box clipped by every bisector plane)
  const neighbours = (i) => {
    const B = 1.6, c = ROCK, corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(([x, y, z]) => new V3(c.x + x * B, c.y + y * B, c.z + z * B));
    let faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]].map((f) => ({ tag: -1, pts: f.map((k) => corners[k]) }));
    const near = [...sites.keys()].filter((j) => j !== i).sort((a, b) => sites[a].p.distanceToSquared(sites[i].p) - sites[b].p.distanceToSquared(sites[i].p));
    for (const j of near) {
      const { pl, sign } = planeOf(i, j), cut = [], next = [];
      for (const f of faces) {
        const poly = clipPoly(f.pts, pl, sign);
        for (const p of poly) if (Math.abs(p.dot(pl.n) - pl.d) < 1e-9) cut.push(p);
        if (poly.length >= 3) next.push({ tag: f.tag, pts: poly });
      }
      if (cut.length >= 3) next.push({ tag: j, pts: loopAround(cut, pl.n) });
      faces = next;
    }
    return faces.filter((f) => f.tag >= 0).map((f) => f.tag);
  };
  const sections = new Map(); // boulder cross-section outline per plane
  const section = (o) => {
    if (!sections.has(o.key)) { const cuts = []; clipTris(base, o.pl, 1, cuts); sections.set(o.key, loopAround(cuts, o.pl.n)); }
    return sections.get(o.key);
  };
  const onPlane = (p, pl) => Math.abs(p.dot(pl.n) - pl.d) < 1e-6;
  const inside = (p, pls, skip) => pls.every((q) => q === skip || q.sign * (p.dot(q.pl.n) - q.pl.d) <= 1e-6);
  /** Clip `o`'s cross-section of the boulder to a convex region (all planes but `o`), fan it, and record its area. */
  const breakFace = (o, pls, nOut, out, piece) => {
    let poly = section(o);
    for (const q of pls) if (q !== o && poly.length) poly = clipPoly(poly, q.pl, q.sign);
    if (poly.length < 3) return poly;
    let area = 0;
    for (let m = 1; m + 1 < poly.length; m++) area += _a.subVectors(poly[m], poly[0]).cross(_b.subVectors(poly[m + 1], poly[0])).length() / 2;
    if (piece != null) breakFaces[piece].push({ n: nOut, area });
    fanPoly(poly, nOut, out);
    return poly;
  };
  const split = (h) => ({ pl: SPLIT_PL, sign: h ? -1 : 1, key: 'split' });
  // The boulder surface is partitioned in ONE pass: every triangle goes through the same cuts in the same order (each
  // chunk's planes in turn, then the split plane), so neighbouring triangles always agree on cut points: watertight seams.
  // Chunks get break faces all round; each break face toward a half also closes that half's socket (same face, reversed).
  const parts = [], breakFaces = Array.from({ length: NP }, () => []), chunkPls = [], halfCaps = [[], []];
  let rest = base;
  for (let i = 0; i < NS; i++) {
    const c = sites[i].chunk;
    if (c < 0) continue;
    // planes that cut the smallest cap off the boulder go first, so later cuts stay inside the chunk's small region
    const pls = neighbours(i).map((j) => ({ ...planeOf(i, j), key: Math.min(i, j) + '-' + Math.max(i, j), chunk: sites[j].chunk }))
      .sort((p, q) => q.sign * (ROCK.dot(q.pl.n) - q.pl.d) - p.sign * (ROCK.dot(p.pl.n) - p.pl.d));
    let tris = rest;
    rest = [];
    for (const { pl, sign } of pls) tris = clipTris(tris, pl, sign, null, rest);
    for (const o of pls) {
      const n = o.pl.n.clone().multiplyScalar(o.sign), poly = breakFace(o, pls, n, tris, 2 + c);
      if (o.chunk < 0 && poly.length >= 3) for (const h of [0, 1]) fanPoly(clipPoly(poly, SPLIT_PL, split(h).sign), n.clone().negate(), halfCaps[h]);
    }
    chunkPls[c] = pls;
    // what lies across a surface edge on a break line: [piece, outward normal of the break plane]
    const across = (a, b, mid) => {
      for (const o of pls) if (onPlane(a.p, o.pl) && onPlane(b.p, o.pl)) return [o.chunk >= 0 ? 2 + o.chunk : sideOf(mid), o.pl.n.clone().multiplyScalar(o.sign)];
      return null;
    };
    parts.push({ piece: 2 + c, tris, across });
  }
  // the split face, minus the chunks: built per remaining cell
  for (let i = 0; i < NS; i++) {
    if (sites[i].chunk >= 0) continue;
    const pls = [...neighbours(i).map((j) => planeOf(i, j)), split(0)];
    const poly = breakFace(pls[pls.length - 1], pls, SPLIT_N, halfCaps[0], 0);
    if (poly.length >= 3) fanPoly(poly, SPLIT_N.clone().negate(), halfCaps[1]);
  }
  const halfSkin = [];
  halfSkin[0] = clipTris(rest, SPLIT_PL, 1, null, (halfSkin[1] = []));
  for (const h of [0, 1]) {
    const across = (a, b, mid) => {
      if (onPlane(a.p, SPLIT_PL) && onPlane(b.p, SPLIT_PL)) return [1 - h, SPLIT_N.clone().multiplyScalar(h ? -1 : 1)];
      for (let c = 0; c < chunkPls.length; c++) for (const o of chunkPls[c]) if (onPlane(a.p, o.pl) && onPlane(b.p, o.pl) && inside(mid, chunkPls[c], o)) return [2 + c, o.pl.n.clone().multiplyScalar(-o.sign)];
      return null;
    };
    parts.push({ piece: h, tris: halfSkin[h].concat(halfCaps[h]), across });
  }

  // per-piece vertex clouds and centroids (for landing and shadows)
  const pieceVerts = Array.from({ length: NP }, () => new Set());
  for (const part of parts) for (const t of part.tris) for (const v of t.v) pieceVerts[part.piece].add(v.p);
  for (let k = 0; k < NP; k++) pieceVerts[k] = [...pieceVerts[k]];
  const centroid = pieceVerts.map((vs) => vs.reduce((c, p) => c.add(p), new V3()).divideScalar(vs.length));

  // ---------------------------------------------------------------- piece motion
  const qI = new THREE.Quaternion();
  const halfC1 = [], halfQ1 = [];
  for (let k = 0; k < 2; k++) {
    const s = k === 0 ? 1 : -1, pg = new V3(ROCK.x, 0, ROCK.z), pb = new V3(ROCK.x, 0, ROCK.z - 0.6);
    const about = (axis, ang, piv) => new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, ang)).multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z));
    const M = new THREE.Matrix4().makeTranslation(-s * SLIDE, 0, 0).multiply(about(new V3(0, 1, 0), -s * YAW, pb)).multiply(about(new V3(0, 0, 1), s * TILT, pg));
    halfC1.push(centroid[k].clone().applyMatrix4(M));
    halfQ1.push(new THREE.Quaternion().setFromRotationMatrix(M));
  }
  const halfF = (t) => ease.inOut(seg(t, SPLIT, SPLIT + 0.16)); // a slow lean, no spring: weathering is gentle
  const halfPose = (k, t, pos, q) => { const f = halfF(t); pos.lerpVectors(centroid[k], halfC1[k], f); q.slerpQuaternions(qI, halfQ1[k], f); };

  // halves' final footprint (max radius per direction from the rock centre) so chunks land beside them, not inside
  const BINS = 48, foot = new Float32Array(BINS);
  {
    const v = new V3(), q = new THREE.Quaternion();
    for (let k = 0; k < 2; k++) {
      halfPose(k, 1, v, q);
      for (const p of pieceVerts[k]) {
        const w = p.clone().sub(centroid[k]).applyQuaternion(q).add(v);
        if (w.y > 0.45) continue;
        const a = Math.atan2(w.x - ROCK.x, w.z - ROCK.z), b = ((Math.round((a / (Math.PI * 2)) * BINS) % BINS) + BINS) % BINS;
        foot[b] = Math.max(foot[b], Math.hypot(w.x - ROCK.x, w.z - ROCK.z));
      }
    }
    // a chunk is wider than one bin: take the max over neighbours (the open front of the V gap is no place to land)
    const raw = foot.slice();
    for (let b = 0; b < BINS; b++) for (let o = -3; o <= 3; o++) foot[b] = Math.max(foot[b], raw[(b + o + BINS) % BINS]);
  }
  const footAt = (a) => { const b = (((a / (Math.PI * 2)) * BINS) % BINS + BINS) % BINS, i = Math.floor(b), f = b - i; return lerp(foot[i], foot[(i + 1) % BINS], f); };

  const chunks = [];
  const NC = NP - 2, CH_DUR = 0.09;
  for (let k = 2; k < NP; k++) {
    const order = CHUNKS[k - 2][1], start = SPLIT + 0.015 + order * 0.02;
    const host = centroid[k].clone().sub(ROCK).dot(SPLIT_N) < 0 ? 0 : 1; // the half it was attached to
    const c0 = new V3(), q0 = new THREE.Quaternion();
    halfPose(host, start, c0, q0);
    c0.add(centroid[k].clone().sub(centroid[host]).applyQuaternion(q0));
    // tumble to rest on its largest break face (stable), turned to a random heading
    const restF = breakFaces[k].reduce((a, b) => (b.area > a.area ? b : a));
    const q1 = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), R() * 6.28).multiply(new THREE.Quaternion().setFromUnitVectors(restF.n, new V3(0, -1, 0)));
    let minY = Infinity, rad = 0;
    const rel = pieceVerts[k].map((p) => p.clone().sub(centroid[k]).applyQuaternion(q1));
    for (const w of rel) { minY = Math.min(minY, w.y); rad = Math.max(rad, Math.hypot(w.x, w.z)); }
    // outline at rest (support points in 24 directions), for an exact "inside the ring" test
    const hull = [];
    for (let i = 0; i < 24; i++) {
      const cx = Math.cos((i / 24) * Math.PI * 2), cz = Math.sin((i / 24) * Math.PI * 2);
      const w = rel.reduce((a, b) => (b.x * cx + b.z * cz > a.x * cx + a.z * cz ? b : a));
      if (!hull.includes(w)) hull.push(w);
    }
    chunks.push({ k, host, start, c0, q0, q1, hull, c1: new V3(0, -0.012 - minY, 0), rad: rad * 0.85, ang: Math.atan2(centroid[k].x - ROCK.x, centroid[k].z - ROCK.z) });
  }
  // landing spots: just outside the halves, pushed apart from each other, and kept well inside the ring (deterministic
  // relaxation). The ring's whole message is "the pieces stayed where the rock was", so no piece may touch it.
  const ringE = (x, z) => Math.hypot((x - ROCK.x) / RING.rx, (z - ROCK.z) / RING.rz);
  const reachAt = (ch, dx, dz) => ch.hull.reduce((m, w) => Math.max(m, ringE(ROCK.x + dx + w.x, ROCK.z + dz + w.z)), 0);
  for (const ch of chunks) { const r = footAt(ch.ang) + ch.rad + 0.05; ch.c1.x = ROCK.x + Math.sin(ch.ang) * r; ch.c1.z = ROCK.z + Math.cos(ch.ang) * r; }
  for (let it = 0; it < 60; it++) {
    for (let a = 0; a < NC; a++) for (let b = a + 1; b < NC; b++) {
      const A = chunks[a].c1, B = chunks[b].c1, dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 1e-3, min = chunks[a].rad + chunks[b].rad + 0.05;
      if (d < min) { const m = (min - d) / 2 / d; A.x -= dx * m; A.z -= dz * m; B.x += dx * m; B.z += dz * m; }
    }
    for (const ch of chunks) {
      let dx = ch.c1.x - ROCK.x, dz = ch.c1.z - ROCK.z;
      const d = Math.hypot(dx, dz), a = Math.atan2(dx, dz), min = footAt(a) + ch.rad + 0.05;
      if (d < min) { dx = Math.sin(a) * min; dz = Math.cos(a) * min; }
      if (reachAt(ch, dx, dz) > RING_FILL) { // pull it straight in, just enough (bisection)
        let lo = 0, hi = 1;
        for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (reachAt(ch, dx * m, dz * m) > RING_FILL) hi = m; else lo = m; }
        dx *= lo; dz *= lo;
      }
      ch.c1.x = ROCK.x + dx; ch.c1.z = ROCK.z + dz;
    }
  }
  // build-time assertion on every real vertex at rest
  {
    const w = new V3();
    for (const ch of chunks) {
      let m = 0;
      for (const p of pieceVerts[ch.k]) { w.copy(p).sub(centroid[ch.k]).applyQuaternion(ch.q1).add(ch.c1); m = Math.max(m, ringE(w.x, w.z)); }
      if (m > 0.95) console.warn('weather: chunk', ch.k, 'reaches the ring', m.toFixed(3));
    }
  }
  // each chunk slumps down its half's flank: it lifts out of its socket, then rides the boulder's surface while its
  // direction from the rock centre swings toward the landing spot, and finally slides out onto the sand
  for (const ch of chunks) {
    const d0 = ch.c0.clone().sub(ROCK), d1 = ch.c1.clone().sub(ROCK);
    ch.rho1 = d1.length(); ch.u0 = d0.clone().normalize();
    ch.inset = surfaceDist(ch.u0) - d0.length(); // how deep its centre sits under the skin
    ch.lift = ch.rad * 0.9;
    ch.arc = new THREE.Quaternion().setFromUnitVectors(ch.u0, d1.normalize());
  }

  // ---------------------------------------------------------------- the rock mesh's vertex streams
  // aGrow = (start, rate): rate > 0 → the offset aOff closes linearly from t = start; rate < 0 → a crack: a thin line at
  // once, then it widens slowly (rate −r). aGrow.x = −2 marks break faces (collapsed until the split). aKind: 0 weathered
  // skin, 1 fresh break face, 2 crack, 3 seedling/root (vertex colour as is).
  const P = [], N = [], C = [], PC = [], OFF = [], GR = [], KD = [];
  const vert = (p, n, col, piece, off, g0, g1, kind) => { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); C.push(col.r, col.g, col.b); PC.push(piece); OFF.push(off ? off.x : 0, off ? off.y : 0, off ? off.z : 0); GR.push(g0, g1); KD.push(kind); };
  const ONE = new THREE.Color(1, 1, 1), FRESH_EDGE = new THREE.Color(0.88, 0.86, 0.85), FRESH_MID = new THREE.Color(1.04, 1.03, 1.02);
  for (const part of parts) for (const t of part.tris) for (const v of t.v) {
    if (t.skin) vert(v.p, v.n, v.c || ONE, part.piece, null, -1, 1000, 0);
    else vert(v.p, v.n, v.centre ? FRESH_MID : FRESH_EDGE, part.piece, null, -2, 1000, 1);
  }

  // ---------------------------------------------------------------- the seedling and its root (on the split line)
  const upS = new V3(0, 1, 0).addScaledVector(SPLIT_N, -SPLIT_N.y).normalize();
  const frontS = new V3().crossVectors(SPLIT_N, upS).normalize();
  if (frontS.z < 0) frontS.negate();
  const onSplit = (a, out = new V3()) => surfacePoint(out.copy(ROCK).addScaledVector(upS, Math.cos(a)).addScaledVector(frontS, Math.sin(a)), out);
  const plantBase = onSplit(PLANT_A);
  const plantN = surfaceNormal(plantBase);
  {
    const yAx = new V3(0, 1, 0).addScaledVector(plantN, 0.3).addScaledVector(frontS, 0.12).normalize();
    const xAx = new V3().crossVectors(yAx, frontS).normalize(), zAx = new V3().crossVectors(xAx, yAx);
    const M = new THREE.Matrix4().makeBasis(xAx, yAx, zAx).setPosition(plantBase.clone().addScaledVector(plantN, -0.01));
    const nm = new THREE.Matrix3().getNormalMatrix(M), p = new V3(), n = new V3(), off = new V3(), col = new THREE.Color();
    for (const part of seedlingParts(7)) {
      const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
      col.set(part.color);
      const pa = g.attributes.position, na = g.attributes.normal;
      for (let i = 0; i < pa.count; i++) {
        p.fromBufferAttribute(pa, i).applyMatrix4(M); n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
        // the whole plant grows from its base: small at t = 0, full grown by t ≈ 0.33
        vert(p, n, col, PLANT_PIECE, off.subVectors(p, plantBase), -0.15, 2.1, 3);
      }
      g.dispose(); part.geo.dispose();
    }
  }
  // root: a tapering tube that creeps down the crack toward the viewer, with three rootlets gripping the edges
  const rootPts = [];
  {
    const tube = (pts, r0, r1, g0, g1, sides) => {
      const rings = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tng = new V3().subVectors(b, a).normalize();
        const nn = surfaceNormal(pts[i]), s1 = new V3().crossVectors(tng, nn).normalize(), s2 = new V3().crossVectors(s1, tng).normalize();
        const u = i / (pts.length - 1), rr = lerp(r0, r1, u), c = pts[i].clone().addScaledVector(nn, rr * 0.35);
        const ring = [];
        for (let k = 0; k < sides; k++) { const th = (k / sides) * Math.PI * 2, dir = s1.clone().multiplyScalar(Math.cos(th)).addScaledVector(s2, Math.sin(th)); ring.push({ p: c.clone().addScaledVector(dir, rr), n: dir, c, col: COL.root.clone().lerp(COL.rootTip, u * u).multiplyScalar(0.85 + 0.25 * Math.max(0, dir.dot(nn))), g: lerp(g0, g1, u) }); }
        rings.push(ring);
      }
      const off = new V3();
      for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < sides; k++) {
        const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % sides];
        for (const v of [a, c, b, b, c, d]) vert(v.p, v.n, v.col, PLANT_PIECE, off.subVectors(v.p, v.c), v.g, 30, 3);
      }
    };
    const n = 28, side = SPLIT_N;
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = onSplit(lerp(PLANT_A, ROOT_A, u));
      p.addScaledVector(side, 0.007 * Math.sin(i * 1.3) + 0.004 * Math.sin(i * 3.1));
      rootPts.push(p);
    }
    tube(rootPts, 0.014, 0.0045, 0.18, 0.55, 6);
    for (const [u0, sx, len] of [[0.3, 1, 0.09], [0.52, -1, 0.1], [0.74, 1, 0.08]]) {
      const i0 = Math.round(u0 * n), p0 = rootPts[i0], pts = [p0];
      const dir = new V3().subVectors(rootPts[Math.min(n, i0 + 2)], p0).normalize().addScaledVector(side, sx * 0.9).normalize();
      for (let k = 1; k <= 5; k++) pts.push(surfacePoint(p0.clone().addScaledVector(dir, (len * k) / 5)));
      const g0 = lerp(0.18, 0.55, u0) + 0.03;
      tube(pts, 0.006, 0.0025, g0, g0 + 0.06, 4);
    }
  }

  // ---------------------------------------------------------------- crack ribbons (half-ribbons along every break line)
  // Each side of a crack is a three-row strip: the dark core on the break line, a dark band, then a pale chipped rim.
  const crackStart = (k) => 0.3 + CHUNKS[k - 2][1] * 0.018; // chunk outlines: complete by ≈ 0.5
  const edges = new Map(); // piece pair "a-b" → [{piece, other, a, b, nOut}]
  const mid = new V3();
  for (const { piece, tris, across } of parts) {
    for (const t of tris) {
      if (!t.skin) continue;
      for (let e = 0; e < 3; e++) {
        const a = t.v[e], b = t.v[(e + 1) % 3];
        if (!a.cut || !b.cut || a.p.distanceToSquared(b.p) < 1e-12) continue; // break lines only run through cut vertices
        const hit = across(a, b, mid.addVectors(a.p, b.p).multiplyScalar(0.5));
        if (!hit || hit[0] === piece) continue;
        const key = Math.min(piece, hit[0]) + '-' + Math.max(piece, hit[0]);
        if (!edges.has(key)) edges.set(key, []);
        edges.get(key).push({ piece, other: hit[0], a, b, nOut: hit[1] });
      }
    }
  }
  const LIFT = 0.004, MIDW = 0.58, side = new V3(), offA = new V3(), offB = new V3();
  const rowsA = [new V3(), new V3(), new V3()], rowsB = [new V3(), new V3(), new V3()], offsA = [null, new V3(), new V3()], offsB = [null, new V3(), new V3()];
  const crackCols = [COL.crack, COL.crackMid, COL.crackRim];
  for (const list of edges.values()) {
    let top = -Infinity, bot = Infinity;
    for (const e of list) { top = Math.max(top, e.a.p.y, e.b.p.y); bot = Math.min(bot, e.a.p.y, e.b.p.y); }
    const { piece: i, other: j } = list[0], main = i < 2 && j < 2;
    const w = main ? 0.027 : 0.017;
    // the main crack spreads from the seedling (a short hairline is there from the start) and widens with the root;
    // chunk outlines run top-down later
    const grow = main ? (p) => -0.035 + 0.36 * clamp(p.distanceTo(plantBase) / 1.5) : (p) => Math.max(crackStart(i < 2 ? j : i), crackStart(j < 2 ? i : j)) + 0.06 * clamp((top - p.y) / Math.max(0.05, top - bot));
    const rate = main ? -2.3 : -5;
    for (const e of list) {
      // each side of a crack gets its own ragged width, so the line looks jagged while staying on the break edge
      const inward = (v, out) => out.copy(e.nOut).addScaledVector(v.n, -e.nOut.dot(v.n)).normalize()
        .multiplyScalar(-w * (0.4 + 0.6 * (1 + noise2(v.p.x * 34 + v.p.z * 19 + e.piece * 7.3, v.p.y * 34 - v.p.z * 11))));
      inward(e.a, offA); inward(e.b, offB);
      rowsA[0].copy(e.a.p).addScaledVector(e.a.n, LIFT); rowsB[0].copy(e.b.p).addScaledVector(e.b.n, LIFT);
      offsA[1].copy(offA).multiplyScalar(MIDW); offsB[1].copy(offB).multiplyScalar(MIDW); offsA[2].copy(offA); offsB[2].copy(offB);
      for (const r of [1, 2]) { rowsA[r].copy(rowsA[0]).add(offsA[r]); rowsB[r].copy(rowsB[0]).add(offsB[r]); }
      const ga = grow(e.a.p), gb = grow(e.b.p);
      const flip = side.subVectors(rowsB[0], rowsA[0]).cross(_a.subVectors(rowsB[2], rowsA[0])).dot(e.a.n) < 0;
      for (let r = 0; r < 2; r++) {
        const quad = [[rowsA[r], offsA[r], ga, crackCols[r], e.a.n], [rowsB[r], offsB[r], gb, crackCols[r], e.b.n], [rowsB[r + 1], offsB[r + 1], gb, crackCols[r + 1], e.b.n], [rowsA[r + 1], offsA[r + 1], ga, crackCols[r + 1], e.a.n]];
        for (const [x, y, z] of flip ? [[0, 2, 1], [0, 3, 2]] : [[0, 1, 2], [0, 2, 3]]) for (const q of [quad[x], quad[y], quad[z]]) vert(q[0], q[4], q[3], e.piece, q[1], q[2], rate, 2);
      }
    }
  }
  // extra hairline cracks on the two halves' front faces (they stay visible after the split)
  const crackPts = [];
  const hairline = (piece, dir, heading, steps, start, w0, r) => {
    const pts = [];
    let p = surfacePoint(new V3(...dir).multiply(AXES).add(ROCK));
    if (pieceAt(p) !== piece) { console.warn('weather: hairline starts off its piece', dir); return pts; }
    const h = new V3(...heading);
    for (let s = 0; s < steps; s++) {
      const n = surfaceNormal(p);
      h.addScaledVector(n, -h.dot(n)).normalize();
      pts.push({ p: p.clone(), n, h: h.clone() });
      h.applyAxisAngle(n, (r() - 0.5) * 0.9);
      const next = surfacePoint(p.clone().addScaledVector(h, 0.045));
      if (pieceAt(next) !== piece || next.y < 0.1) break;
      p = next;
    }
    for (let s = 0; s + 1 < pts.length; s++) {
      const rows = [];
      for (const k of [s, s + 1]) {
        const { p: q, n, h: hh } = pts[k], u = k / (pts.length - 1), w = w0 * (1 - 0.55 * u), g = start + 0.07 * u;
        const sd = new V3().crossVectors(n, hh).normalize().multiplyScalar(w), c = q.clone().addScaledVector(n, LIFT);
        rows.push([[c.clone().add(sd), sd, COL.crackRim], [c.clone().addScaledVector(sd, MIDW), sd.clone().multiplyScalar(MIDW), COL.crackMid], [c, null, COL.crack], [c.clone().addScaledVector(sd, -MIDW), sd.clone().multiplyScalar(-MIDW), COL.crackMid], [c.clone().sub(sd), sd.clone().negate(), COL.crackRim]].map((x) => [...x, n, g]));
      }
      const tri = (a, b, c) => {
        if (_a.subVectors(b[0], a[0]).cross(_b.subVectors(c[0], a[0])).dot(a[3]) < 0) [b, c] = [c, b];
        for (const q of [a, b, c]) vert(q[0], q[3], q[2], piece, q[1], q[4], -6, 2);
      };
      const [r0, r1] = rows;
      for (let k = 0; k < 4; k++) { tri(r0[k], r1[k], r1[k + 1]); tri(r0[k], r1[k + 1], r0[k + 1]); }
      if (piece === 0) crackPts.push(pts[s].p);
    }
    return pts;
  };
  {
    const r = rng(5);
    // (seeded on free skin: none may start inside a chunk, or it would be dropped)
    const a = hairline(0, [-0.68, 0.57, 0.46], [-0.1, -1, 0.1], 13, 0.35, 0.015, r);
    if (a.length > 5) hairline(0, a[4].p.clone().sub(ROCK).divide(AXES).toArray(), [-1, -0.35, 0.2], 8, 0.39, 0.012, r);
    hairline(0, [-0.3, 0.26, 0.92], [-0.2, -1, 0.1], 8, 0.41, 0.013, r);
    hairline(0, [-0.18, 0.86, 0.45], [-1, -0.4, 0.2], 7, 0.37, 0.012, r);
    hairline(1, [0.24, 0.71, 0.66], [0.3, -1, 0.1], 9, 0.4, 0.013, r);
    hairline(1, [0.21, 0.02, 0.98], [0.25, -1, 0], 6, 0.43, 0.011, r);
  }

  // ---------------------------------------------------------------- the rock mesh (one draw call for every piece, crack and the seedling)
  const rockGeo = new THREE.BufferGeometry();
  rockGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  rockGeo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  rockGeo.setAttribute('aPiece', new THREE.Float32BufferAttribute(PC, 1));
  rockGeo.setAttribute('aOff', new THREE.Float32BufferAttribute(OFF, 3));
  rockGeo.setAttribute('aGrow', new THREE.Float32BufferAttribute(GR, 2));
  rockGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(KD, 1));
  rockGeo.boundingSphere = new THREE.Sphere(new V3(ROCK.x, 0.45, ROCK.z), 2.1); // pieces move inside this
  rockGeo.boundingBox = new THREE.Box3(new V3(-2, -0.3, -2.2), new V3(2, 1.7, 1.8));
  const pieceM = Array.from({ length: NP }, () => new THREE.Matrix4());
  // uWet: x = wet front (y; wet above it), y = dry front (y; dry above it), z = amount, w = water standing in the cracks
  const rockU = { uPM: { value: pieceM }, uGrow: { value: 0 }, uCaps: { value: 0 }, uWet: { value: new THREE.Vector4(9, 9, 0, 0) } };
  const VPARS = `uniform mat4 uPM[${NP}];\nuniform float uGrow;\nuniform float uCaps;\nuniform vec4 uWet;\nattribute float aPiece;\nattribute vec2 aGrow;\nattribute vec3 aOff;\nattribute float aKind;`;
  const VMOVE = `
    float gx = uGrow - aGrow.x;
    float gk = aGrow.y > 0.0 ? clamp(gx * aGrow.y, 0.0, 1.0) : 0.38 * clamp(gx * 28.0, 0.0, 1.0) + 0.62 * clamp(gx * -aGrow.y, 0.0, 1.0);
    transformed -= aOff * (1.0 - gk);
    if (aGrow.x < -1.5) transformed *= uCaps;
    transformed = (uPM[int(aPiece + 0.5)] * vec4(transformed, 1.0)).xyz;`;
  const strataFn = `vec3 strataCol(float id) {
    float h = fract(sin(id * 12.9898 + 4.1) * 43758.5453);
    ${STRATA.map((c, i) => (i < STRATA.length - 1 ? `if (h < ${((i + 1) / STRATA.length).toFixed(4)}) return ${glsl(c)};` : `return ${glsl(c)};`)).join('\n    ')}
  }`;
  const grainFn = `float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }`;
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  rockMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rockU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VPARS}\nvarying vec3 vRest;\nvarying float vKind;\nvarying float vWet;\nvarying float vUp;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = mat3(uPM[int(aPiece + 0.5)]) * objectNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = position; vKind = aKind; vUp = normal.y;
        vWet = uWet.z * smoothstep(uWet.x - 0.12, uWet.x + 0.02, position.y) * (1.0 - smoothstep(uWet.y - 0.12, uWet.y + 0.02, position.y));
        ${VMOVE}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uWet;\nvarying vec3 vRest;\nvarying float vKind;\nvarying float vWet;\nvarying float vUp;\n${strataFn}\n${grainFn}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vKind < 1.5) {
          float L = (vRest.y + 0.05 * vRest.x - 0.03 * vRest.z) / ${LAYER.toFixed(4)} + 0.3 * sin(vRest.x * 3.1 + vRest.z * 2.3); L += 0.32 * sin(L * 0.85 + 1.1);
          float id = floor(L), f = L - id;
          float aa = max(0.04, fwidth(L) * 1.5);
          // a thin bedding line under some layers only, coming and going around the rock
          float lineK = step(0.45, fract(sin(id * 7.31 + 1.7) * 9631.17)) * smoothstep(0.35, 0.6, vnoise(vRest * 2.6 + id));
          vec3 band = strataCol(id) * mix(0.87, 1.0, smoothstep(0.0, 0.3, f)) * mix(1.0 - 0.24 * lineK, 1.0, smoothstep(0.0, aa, f));
          band = mix(band, ${glsl(FRESH)}, step(0.5, vKind) * 0.5);
          float g = vnoise(vRest * 34.0) * 0.6 + vnoise(vRest * 83.0 + 7.0) * 0.4;
          diffuseColor.rgb *= band * (0.86 + 0.26 * g);
          if (vKind < 0.5) {
            // lichen: crisp-edged orange spots and a pale sage crust on the upward faces
            float n1 = vnoise(vRest * 11.0 + 3.0) * 0.7 + vnoise(vRest * 33.0) * 0.3, w1 = fwidth(n1) + 0.004;
            float n2 = vnoise(vRest * 9.0 - 11.0) * 0.7 + vnoise(vRest * 29.0 + 4.0) * 0.3, w2 = fwidth(n2) + 0.004;
            float lo = smoothstep(0.715 - w1, 0.715 + w1, n1) * smoothstep(0.05, 0.6, vUp);
            float ls = smoothstep(0.73 - w2, 0.73 + w2, n2) * smoothstep(-0.3, 0.3, vUp);
            vec3 ao = vColor.rgb;
            diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(COL.lichenO)} * ao * (0.85 + 0.3 * g), lo * 0.9);
            diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(COL.lichenS)} * ao * (0.9 + 0.2 * g), ls * 0.55);
          }
        }
        if (vKind > 1.5 && vKind < 2.5) {
          float core = 1.0 - smoothstep(0.02, 0.25, dot(vColor.rgb, vec3(0.333)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.5, 0.82), uWet.w * core * 0.85);
        }
        diffuseColor.rgb *= 1.0 - 0.34 * vWet * step(vKind, 2.5);`);
  };
  rockMat.customProgramCacheKey = () => 'weather-rock2-' + NP;
  mats.push(rockMat);
  const rock = keep(new THREE.Mesh(rockGeo, rockMat));
  // the shadow pass must move the pieces too (otherwise the whole boulder's shadow would stay put)
  const rockDepth = new THREE.MeshDepthMaterial();
  rockDepth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rockU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${VPARS}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${VMOVE}`);
  };
  rockDepth.customProgramCacheKey = () => 'weather-rock2-depth-' + NP;
  rock.customDepthMaterial = rockDepth;
  mats.push(rockDepth);
  group.add(rock);
  const tNeg = centroid.map((c) => new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));

  // ---------------------------------------------------------------- wet sand under the rock (rain) and small contact shadows for the chunks
  const wetMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const wetSand = keep(new THREE.Mesh(softDisc('#8d6a43'), wetMat));
  wetSand.position.set(ROCK.x, 0.006, ROCK.z);
  wetSand.scale.set(1.15, 1, 1.0);
  wetSand.renderOrder = 1;
  group.add(wetSand);
  mats.push(wetMat);
  const contactMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const contactGeo = keep({ geometry: softDisc('#5a4128', 16, 2) }).geometry;
  const chunkShadows = new THREE.InstancedMesh(contactGeo, contactMat, NC);
  chunkShadows.renderOrder = 1;
  chunkShadows.frustumCulled = false;
  group.add(chunkShadows);
  mats.push(contactMat);

  // ---------------------------------------------------------------- pebbles & grains that crumble off
  const NPEB = low ? 40 : 72;
  const pebGeo = new THREE.IcosahedronGeometry(1, 0);
  const pebbles = keep(new THREE.InstancedMesh(pebGeo, mat('#ffffff', { flat: true }), NPEB));
  pebbles.frustumCulled = false;
  const peb = [];
  {
    const r = rng(19), tones = [...STRATA, FRESH, FRESH];
    const clear = (x, z, s) => chunks.every((ch) => Math.hypot(x - ch.c1.x, z - ch.c1.z) > ch.rad + s + 0.02);
    for (let i = 0, tries = 0; i < NPEB && tries < 4000; tries++) {
      const kind = i % 4; // 0,1: rock foot · 2: in the gap between the halves · 3: anywhere inside the ring
      let x, z;
      const s = 0.018 + r() * (kind === 3 ? 0.025 : 0.045);
      // two of three grains land on the viewer's side, where they can be seen (a = 0 is straight toward the viewer)
      const a = r() < 0.67 ? (r() - 0.5) * Math.PI * 1.3 : r() * Math.PI * 2, from = new V3();
      if (kind === 2) { const zz = r(); z = ROCK.z - 0.45 + zz * 1.05; x = ROCK.x + (r() - 0.5) * (0.05 + zz * 0.28); from.set(x, 0.45 + r() * 0.4, z); }
      else {
        const d = footAt(a) - 0.04 + s + (kind === 3 ? 0.12 + r() * 0.35 : r() * 0.16);
        x = ROCK.x + Math.sin(a) * d; z = ROCK.z + Math.cos(a) * d;
        if (((x - ROCK.x) / (RING.rx - 0.16)) ** 2 + ((z - ROCK.z) / (RING.rz - 0.16)) ** 2 > 1 || !clear(x, z, s)) continue; // stays inside the ring
        const f = footAt(a) * 0.8; // crumbles off the boulder's flank above
        from.set(ROCK.x + Math.sin(a) * f, 0.25 + r() * 0.45, ROCK.z + Math.cos(a) * f);
      }
      peb.push({ to: new V3(x, s * 0.4, z), from, s, sy: 0.55 + r() * 0.35, rot: new THREE.Euler(r() * 3, r() * 3, r() * 3), start: 0.62 + r() * 0.18 });
      pebbles.setColorAt(i, _c.copy(tones[Math.floor(r() * tones.length)]).multiplyScalar(0.86 + r() * 0.14));
      i++;
    }
    pebbles.count = peb.length;
  }
  group.add(pebbles);

  // ---------------------------------------------------------------- the dashed ring: "the pieces stayed right here"
  const dashParts = [];
  const dashShape = new THREE.Shape();
  {
    const L = 0.085, W = 0.032;
    dashShape.absarc(L, 0, W, -Math.PI / 2, Math.PI / 2, false);
    dashShape.absarc(-L, 0, W, Math.PI / 2, Math.PI * 1.5, false);
  }
  const dashGeo = new THREE.ShapeGeometry(dashShape, 4).rotateX(-Math.PI / 2);
  for (let i = 0; i < RING.dashes; i++) {
    const a = (i / RING.dashes) * Math.PI * 2;
    const x = ROCK.x + Math.sin(a) * RING.rx, z = ROCK.z + Math.cos(a) * RING.rz;
    const tx = Math.cos(a) * RING.rx, tz = -Math.sin(a) * RING.rz;
    dashParts.push({ geo: dashGeo, pos: [x, groundH(x, z) + 0.012, z], rot: [0, Math.atan2(-tz, tx), 0], color: '#ffffff' });
  }
  const ringGeo = mergeParts(dashParts);
  const vertsPerDash = ringGeo.attributes.position.count / RING.dashes;
  const ringMat = new THREE.MeshBasicMaterial({ color: '#7559d9', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const ring = keep(new THREE.Mesh(ringGeo, ringMat));
  ring.renderOrder = 2;
  group.add(ring);
  mats.push(ringMat);

  // ---------------------------------------------------------------- the time window (days pass quickly)
  const tw = timeWindow({ R: 0.46, sill: 0.72, foot: 0 });
  tw.group.position.set(DIAL.x, groundH(DIAL.x, DIAL.z) - 0.02, DIAL.z);
  tw.group.rotation.y = Math.atan2(-DIAL.x, 3.6 - DIAL.z); // faces the viewer
  tw.group.scale.setScalar(1.12);
  group.add(tw.group);
  geos.push(...tw.geos); mats.push(...tw.mats);
  const { skyMat, wheel, trail, trailMat } = tw;
  // day speed: a slow first day or two, then too fast to count (≈ 2 turns/s), and it slows to a stop at noon
  const LUT = new Float32Array(257), SPIN = new Float32Array(257); // day progress 0..1 and the dial speed (turns per second)
  {
    let acc = 0;
    const speed = (t) => smooth(0, 0.03, t) * lerp(0.18, 1, smooth(0.05, 0.2, t)) * (1 - smooth(0.78, 0.92, t));
    for (let i = 1; i <= 256; i++) { acc += speed((i - 0.5) / 256); LUT[i] = acc; }
    for (let i = 0; i <= 256; i++) { LUT[i] /= acc; SPIN[i] = (DAYS * 256 * speed(i / 256)) / acc / DURATION; }
  }
  const lut = (A, t) => { const x = clamp(t) * 256, i = Math.min(255, Math.floor(x)); return lerp(A[i], A[i + 1], x - i); };
  const SKY = { day: hex('#8fd3f5'), dusk: hex('#ffa36b'), night: hex('#2a3a7a'), blur: hex('#7f93c9') };

  // ---------------------------------------------------------------- rain cloud
  const CLOUD = new V3(-0.3, 1.66, 0.1); // over the boulder's left shoulder, clear of the time window
  const puff = new THREE.SphereGeometry(1, 12, 9);
  const cloudGeo = mergeParts([
    [0, 0, 0, 0.19], [-0.2, -0.04, 0.03, 0.14], [0.2, -0.03, 0, 0.15], [-0.07, 0.1, -0.02, 0.14], [0.1, 0.08, 0.04, 0.13], [0.33, -0.06, -0.02, 0.1], [-0.33, -0.07, 0, 0.09],
  ].map(([x, y, z, r]) => ({ geo: puff, pos: [x, y, z], scale: [r, r * 0.85, r * 0.9] })));
  puff.dispose();
  {
    // grey-blue rain belly, bright top
    const p = cloudGeo.attributes.position, col = cloudGeo.attributes.color, a = hex('#9fb0c8'), b = hex('#ffffff');
    for (let i = 0; i < p.count; i++) { _c.copy(a).lerp(b, smooth(-0.12, 0.16, p.getY(i))); col.setXYZ(i, _c.r, _c.g, _c.b); }
  }
  const cloud = keep(new THREE.Mesh(cloudGeo, mat('#ffffff', { vertexColors: true })));
  const cloudHold = new THREE.Group();
  cloudHold.position.copy(CLOUD);
  cloudHold.add(cloud);
  group.add(cloudHold);
  const NRAIN = low ? 50 : 90;
  const dropGeo = new THREE.OctahedronGeometry(1, 0).scale(0.0065, 0.075, 0.0065);
  const rain = keep(new THREE.InstancedMesh(dropGeo, basic('#5cbcf0'), NRAIN));
  rain.frustumCulled = false;
  group.add(rain);
  const drops = [];
  {
    const r = rng(23), q = new V3();
    for (let i = 0; i < NRAIN; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      const x = CLOUD.x + Math.cos(a) * d * 0.36, z = CLOUD.z + Math.sin(a) * d * 0.2;
      let bottom = 0;
      for (let y = 1.3; y > 0; y -= 0.015) if (insideRock(q.set(x, y, z))) { bottom = y; break; }
      drops.push({ x, z, top: CLOUD.y - 0.1, bottom, phase: r(), speed: 2.4 + r() * 0.6 });
    }
  }

  // ---------------------------------------------------------------- the hot sun and its heat shimmer
  const HSUN = new V3(0.3, 1.76, 0.0);
  const sun = keep(hotSun());
  sun.position.copy(HSUN);
  sun.rotation.y = Math.atan2(-HSUN.x, 3.6 - HSUN.z);
  sun.renderOrder = 3;
  group.add(sun);
  mats.push(sun.material);
  const NSHIM = 6;
  const shimMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const shimmer = keep(new THREE.InstancedMesh(shimmerGeo(), shimMat, NSHIM));
  shimmer.frustumCulled = false;
  shimmer.renderOrder = 3;
  group.add(shimmer);
  mats.push(shimMat);
  const shimBase = [];
  {
    const r = rng(29);
    for (let i = 0; i < NSHIM; i++) {
      const x = ROCK.x + lerp(-0.42, 0.42, (i + 0.5) / NSHIM) + (r() - 0.5) * 0.06, z = ROCK.z + 0.18 + (r() - 0.5) * 0.2;
      let y = 0.6;
      for (let yy = 1.35; yy > 0.3; yy -= 0.01) if (insideRock(_a.set(x, yy, z))) { y = yy; break; }
      shimBase.push({ x, y: y + 0.03, z, phase: r(), s: 0.8 + r() * 0.4 });
    }
  }
  const shimYaw = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.atan2(-ROCK.x, 3.6 - ROCK.z));

  // ---------------------------------------------------------------- wind streaks
  const windGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push([u * 0.55, 0.018 * Math.sin(u * Math.PI * 2)]); }
    for (let i = 1; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI * 1.5; pts.push([0.55 + Math.cos(a) * 0.055, 0.055 + Math.sin(a) * 0.055]); }
    const pos = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i], [x2, y2] = pts[Math.min(n - 1, i + 1)], [x0, y0] = pts[Math.max(0, i - 1)];
      let tx = x2 - x0, ty = y2 - y0; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const w = 0.013 * Math.sin(Math.PI * Math.min(1, (i + 0.5) / (n - 0.5))) + 0.003;
      pos.push(x - ty * w, y + tx * w, 0, x + ty * w, y - tx * w, 0);
    }
    const idx = [];
    for (let i = 0; i + 1 < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g.translate(-0.3, 0, 0);
  })();
  // wind lanes: [height, depth, phase] — in front of, over and behind the boulder
  const LANES = [[0.32, 0.95, 0], [0.68, 0.82, 0.37], [1.02, 0.66, 0.71], [1.38, 0.0, 0.18], [0.55, -1.05, 0.52], [0.92, -0.95, 0.86]];
  const wind = keep(new THREE.InstancedMesh(windGeo, basic('#ffffff', { opacity: 0.85, side: THREE.DoubleSide }), LANES.length));
  wind.frustumCulled = false;
  wind.renderOrder = 3;
  group.add(wind);

  // ---------------------------------------------------------------- a little dhub lizard basking on a stone (ambient life)
  // It lies on the slab's real top (raycast at build time), side-on to the viewer and looking toward the boulder. Its origin
  // is at the hind legs, so a push-up lifts the chest while the tail stays down.
  const LIZ_S = 1.3, LIZ_HIP = 0.05; // scale; hind legs behind the body centre (model units)
  const LIZARD = new V3(slab.pos[0] - 0.02, 0, slab.pos[2] + 0.03);
  let lizYaw = 0, lizPitch = 0;
  {
    const v = new V3(-LIZARD.x, 0, 3.6 - LIZARD.z).normalize(), head = new V3(-v.z, 0, v.x).multiplyScalar(0.87).addScaledVector(v, 0.5);
    lizYaw = Math.atan2(-head.z, head.x);
    const probe = new THREE.Mesh(place(slab.geo, slab.pos, slab.rot, slab.scale)), ray = new THREE.Raycaster(), hits = [];
    const top = (along) => {
      ray.set(new V3(LIZARD.x + head.x * along, 2, LIZARD.z + head.z * along), new V3(0, -1, 0));
      hits.length = 0;
      probe.raycast(ray, hits);
      return hits.length ? Math.max(...hits.map((h) => h.point.y)) : slab.pos[1];
    };
    const yH = top(0.14), yT = top(-0.14);
    LIZARD.y = Math.max(top(0), (yH + yT) / 2) - 0.008;
    lizPitch = Math.atan2(yH - yT, 0.28);
    LIZARD.addScaledVector(head, -LIZ_HIP * LIZ_S);
    probe.geometry.dispose(); probe.material.dispose();
  }
  const lizard = (() => {
    const body = '#c9a467', dark = '#a7814b', belly = '#e0c48e';
    const parts = [
      { geo: new THREE.SphereGeometry(1, 12, 8), color: body, pos: [0, 0.045, 0], scale: [0.085, 0.036, 0.05] },
      { geo: new THREE.SphereGeometry(1, 10, 6), color: belly, pos: [0.01, 0.036, 0], scale: [0.07, 0.024, 0.044] },
      { geo: new THREE.SphereGeometry(1, 10, 8), color: body, pos: [0.105, 0.06, 0], scale: [0.045, 0.03, 0.036] },
      { geo: new THREE.ConeGeometry(0.03, 0.18, 8), color: dark, pos: [-0.165, 0.038, 0], rot: [0, 0, Math.PI / 2] },
      { geo: new THREE.SphereGeometry(0.008, 6, 4), color: '#2b2118', pos: [0.13, 0.072, 0.026] },
      { geo: new THREE.SphereGeometry(0.008, 6, 4), color: '#2b2118', pos: [0.13, 0.072, -0.026] },
    ];
    for (const [x, z] of [[0.05, 1], [0.05, -1], [-0.05, 1], [-0.05, -1]]) parts.push({ geo: new THREE.CylinderGeometry(0.008, 0.01, 0.06, 5), color: dark, pos: [x, 0.025, z * 0.055], rot: [z * 0.9, 0, 0] });
    for (const [x, z] of [[0.02, 0.02], [-0.03, -0.015], [-0.06, 0.018], [0.06, -0.01]]) parts.push({ geo: new THREE.SphereGeometry(0.012, 6, 4), color: i2c(x), pos: [x, 0.075, z], scale: [1, 0.4, 1] });
    const m = keep(new THREE.Mesh(mergeParts(parts).translate(LIZ_HIP, 0, 0), mat('#ffffff', { vertexColors: true })));
    m.position.copy(LIZARD);
    m.rotation.set(0, lizYaw, lizPitch);
    m.scale.setScalar(LIZ_S);
    return m;
  })();
  function i2c(x) { return x > 0.05 ? '#d9823b' : '#a7814b'; } // one orange spot near the head
  group.add(lizard);

  // ---------------------------------------------------------------- evidence (group-local, at t = 1)
  const finalPos = new V3(), finalQ = new THREE.Quaternion();
  const crackC = crackPts.reduce((c, p) => c.add(p), new V3()).divideScalar(Math.max(1, crackPts.length));
  halfPose(0, 1, finalPos, finalQ);
  const crackEv = crackC.clone().sub(centroid[0]).applyQuaternion(finalQ).add(finalPos).addScaledVector(surfaceNormal(crackC).applyQuaternion(finalQ), 0.04);
  const front = chunks.filter((ch) => Math.abs(Math.atan2(ch.c1.x - ROCK.x, ch.c1.z - ROCK.z)) < 0.7); // the group right in front
  // on the chunk nearest the viewer, pulled a little toward the group (so the ring also takes in the grains)
  const piecesEv = front.reduce((c, ch) => c.add(ch.c1), new V3()).divideScalar(Math.max(1, front.length));
  const nearest = (front.length ? front : chunks).reduce((a, b) => (b.c1.z > a.c1.z ? b : a));
  piecesEv.lerp(nearest.c1, 0.75);
  piecesEv.y = 0.12;
  const evidence = { cracks: { pos: crackEv, radius: 0.3 }, pieces: { pos: piecesEv, radius: 0.38 } };
  const thuds = chunks.filter((ch) => [0, 3, 6].includes(CHUNKS[ch.k - 2][1])).map((ch) => ch.start + CH_DUR);

  // ================================================================ animation state
  const m4 = new THREE.Matrix4(), pos = new V3(), dir = new V3(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new V3(1, 1, 1), sc = new V3();
  const warmE = hex('#ff8a3a');
  let playing = false, lastT = 0, rainLoop = null, windLoop = null, lastRainG = -1, lastWindG = -1;
  const pulse = (t, a, b, c, d) => smooth(a, b, t) * (1 - smooth(c, d, t));
  const crossed = (a, t) => lastT < a && t >= a; // one-shot thresholds, upward only
  // the two showers: [cloud in, rain on, rain off, cloud out]; the wet front runs down while it rains, then the rock dries from the top
  const SHOWERS = [[0.05, 0.075, 0.18, 0.21], [0.32, 0.345, 0.43, 0.46]];
  const HEATS = [[0.2, 0.235, 0.3, 0.335], [0.46, 0.49, 0.54, 0.575]];

  function setProgress(t) {
    t = clamp(t);
    const sec = t * DURATION;
    // --- days pass; at full speed the window's sky settles on one steady tone (no day/night flicker) and the sun and moon
    //     trail motion blur
    const th = Math.PI / 2 - Math.PI * 2 * DAYS * lut(LUT, t), h = Math.sin(th), spinK = smooth(0.8, 1.4, lut(SPIN, t));
    wheel.rotation.z = th - Math.PI / 2;
    if (h > 0.25) skyMat.color.copy(SKY.day);
    else if (h > -0.05) skyMat.color.lerpColors(SKY.dusk, SKY.day, (h + 0.05) / 0.3);
    else if (h > -0.35) skyMat.color.lerpColors(SKY.night, SKY.dusk, (h + 0.35) / 0.3);
    else skyMat.color.copy(SKY.night);
    skyMat.color.lerp(SKY.blur, spinK);
    trailMat.opacity = 0.75 * spinK;
    trail.visible = spinK > 0.01;

    // --- rain cloud & drops; the rock soaks from the top down, water stands in the cracks, the sand darkens
    let rainK = 0, cloudK = 0, wf = 9, df = 9, wetAmt = 0, water = 0, sandWet = 0;
    for (const [a, b, c, d] of SHOWERS) {
      rainK = Math.max(rainK, pulse(t, a + 0.01, b, c, c + 0.025));
      cloudK = Math.max(cloudK, pulse(t, a - 0.02, a + 0.02, c + 0.01, d));
      if (t > b - 0.01 && t < d + 0.1) {
        wf = lerp(1.32, -0.1, smooth(b - 0.01, c - 0.02, t)); // wet front runs down
        df = lerp(1.32, -0.12, smooth(c + 0.01, d + 0.09, t)); // then dries from the top
        wetAmt = 1;
      }
      water = Math.max(water, pulse(t, b, b + 0.03, c, c + 0.05));
      sandWet = Math.max(sandWet, pulse(t, b + 0.01, c - 0.03, c, d + 0.12));
    }
    rockU.uWet.value.set(wf, df, wetAmt, water);
    wetMat.opacity = 0.45 * sandWet;
    wetSand.visible = sandWet > 0.005;
    cloudHold.visible = cloudK > 0.001;
    cloudHold.scale.setScalar(Math.max(0.001, ease.outBack(cloudK)));
    const nDrops = Math.round(NRAIN * rainK);
    rain.count = nDrops;
    rain.visible = nDrops > 0;
    for (let i = 0; i < nDrops; i++) {
      const d = drops[i], H = d.top - d.bottom, y = d.top - (((sec * d.speed) / H + d.phase) % 1) * H;
      m4.makeTranslation(d.x, y, d.z);
      rain.setMatrixAt(i, m4);
    }
    rain.instanceMatrix.needsUpdate = true;

    // --- the hot sun: it bakes the rock (warm glow) and the air above it shimmers
    let heatK = 0;
    for (const [a, b, c, d] of HEATS) heatK = Math.max(heatK, pulse(t, a, b, c, d));
    sun.visible = heatK > 0.001;
    sun.scale.setScalar(Math.max(0.001, ease.outBack(heatK)));
    sun.rotation.z = sec * 0.25;
    shimmer.visible = heatK > 0.01;
    for (let i = 0; i < NSHIM; i++) {
      const b = shimBase[i], u = (sec * 0.42 + b.phase) % 1, k = heatK * Math.sin(Math.PI * u) * b.s;
      pos.set(b.x, b.y + u * 0.28, b.z);
      sc.set(k * (i % 2 ? -1 : 1), 0.6 + 0.6 * k, 1);
      shimmer.setMatrixAt(i, m4.compose(pos, shimYaw, sc));
    }
    shimmer.instanceMatrix.needsUpdate = true;

    // --- wind gusts
    // (the second gust, while the chunk outlines crack, keeps clear of the rock face: only the high and back lanes blow)
    const gust1 = pulse(t, 0.12, 0.15, 0.26, 0.3), gust2 = pulse(t, 0.38, 0.41, 0.47, 0.5), windK = Math.max(gust1, gust2);
    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i], u = (sec * 0.5 + lane[2]) % 1, k = (lane[1] > 0.3 && lane[0] < 1.2 ? gust1 : windK) * Math.sin(Math.PI * u);
      sc.set(k * 1.6, k * 1.6, 1);
      pos.set(lerp(-2.25, 2.25, u), lane[0], lane[1]);
      wind.setMatrixAt(i, m4.compose(pos, qI, sc));
    }
    wind.visible = windK > 0.001;
    wind.instanceMatrix.needsUpdate = true;

    // --- the rock warms by day, cools at night (only while the days are slow enough to follow), glows in the heat
    const tint = (1 - smooth(0.5, 0.6, t)) * (1 - spinK), warm = Math.max(0, h) * tint + heatK * 0.6, cool = Math.max(0, -h) * tint;
    rockMat.color.setRGB(1 + 0.04 * warm - 0.12 * cool, 1 - 0.02 * warm - 0.09 * cool, 1 - 0.08 * warm - 0.01 * cool);
    rockMat.emissive.copy(warmE).multiplyScalar(0.075 * heatK);

    // --- cracks and the root grow (aGrow is in t units)
    rockU.uGrow.value = t;
    rockU.uCaps.value = t >= SPLIT ? 1 : 0;

    // --- halves lean apart; chunks slump down the flanks to rest right beside them (no hop, no bounce)
    for (let k = 0; k < 2; k++) { halfPose(k, t, pos, q); pieceM[k].compose(pos, q, one).multiply(tNeg[k]); }
    for (let i = 0; i < NC; i++) {
      const ch = chunks[i], M = pieceM[ch.k];
      if (t < ch.start) M.copy(pieceM[ch.host]); // still part of its half
      else {
        const s = seg(t, ch.start, ch.start + CH_DUR);
        q.slerpQuaternions(qI, ch.arc, ease.inOut(s));
        dir.copy(ch.u0).applyQuaternion(q);
        const onSkin = surfaceDist(dir) - ch.inset + ch.lift * ease.out(Math.min(1, s * 2.5));
        pos.copy(dir).multiplyScalar(lerp(onSkin, ch.rho1, smooth(0.55, 1, s))).add(ROCK);
        q.slerpQuaternions(ch.q0, ch.q1, ease.inOut(s));
        M.compose(pos, q, one).multiply(tNeg[ch.k]);
      }
      // a soft contact shadow grows under the chunk as it reaches the sand
      const near = t < ch.start ? 0 : smooth(0.35, 0, pos.y - ch.c1.y);
      sc.set(ch.rad * 1.35 * near + 1e-4, 1, ch.rad * 1.25 * near + 1e-4);
      pos.y = 0.006;
      chunkShadows.setMatrixAt(i, m4.compose(pos, qI, sc));
    }
    chunkShadows.instanceMatrix.needsUpdate = true;
    chunkShadows.visible = t >= SPLIT;

    // --- pebbles and grains crumble off
    for (let i = 0; i < peb.length; i++) {
      const p = peb[i], s = seg(t, p.start, p.start + 0.045);
      if (s <= 0) { m4.makeScale(0, 0, 0); pebbles.setMatrixAt(i, m4); continue; }
      pos.lerpVectors(p.from, p.to, s);
      pos.y = lerp(p.from.y, p.to.y, s * s);
      e.set(p.rot.x * s, p.rot.y, p.rot.z * s);
      sc.set(p.s, p.s * p.sy, p.s);
      pebbles.setMatrixAt(i, m4.compose(pos, q.setFromEuler(e), sc));
    }
    pebbles.instanceMatrix.needsUpdate = true;
    pebbles.visible = t > 0.62;

    // --- the ring draws itself around the pieces
    const rk = seg(t, RING.from, RING.to);
    ring.visible = rk > 0;
    ring.geometry.setDrawRange(0, Math.ceil(rk * RING.dashes) * vertsPerDash);

    // --- sounds (only while playing, on upward threshold crossings)
    if (playing && sfx && t > lastT && t - lastT < 0.1) {
      for (let i = 0; i < CRACK_SFX.length; i++) if (crossed(CRACK_SFX[i], t)) sfx.play('crack', { gain: 0.6 + i * 0.08, rate: 1.1 - i * 0.06 });
      if (crossed(SPLIT, t)) sfx.play('rockBreak', { gain: 0.5, rate: 0.9 });
      for (let i = 0; i < thuds.length; i++) if (crossed(thuds[i], t)) sfx.play('thud', { gain: 0.35, rate: 1.2 });
      const rg = 0.55 * rainK, wg = 0.1 + 0.5 * windK;
      if (rainLoop && Math.abs(rg - lastRainG) > 0.02) { rainLoop.set({ gain: rg }); lastRainG = rg; }
      if (windLoop && Math.abs(wg - lastWindG) > 0.02) { windLoop.set({ gain: wg }); lastWindG = wg; }
    }
    lastT = t;
  }

  function update(dt, time) {
    cloud.position.y = Math.sin(time * 1.3) * 0.015;
    // the lizard does its little push-ups now and then
    const ph = time % 5.5, up = ph < 0.9 ? Math.abs(Math.sin(ph * Math.PI * 2.2)) : 0;
    lizard.position.y = LIZARD.y + 0.005 * up;
    lizard.rotation.z = lizPitch + 0.2 * up;
    lizard.rotation.y = lizYaw + Math.sin(time * 0.4) * 0.12;
  }

  function play() {
    stop();
    playing = true;
    if (sfx) { rainLoop = sfx.loop('rain', { gain: 0 }); windLoop = sfx.loop('wind', { gain: 0.1 }); lastRainG = 0; lastWindG = 0.1; }
  }
  function stop() {
    playing = false;
    rainLoop?.stop(); windLoop?.stop();
    rainLoop = windLoop = null;
  }

  setProgress(0);
  return {
    key: 'weather',
    group,
    duration: DURATION,
    setProgress,
    update,
    play,
    stop,
    evidence,
    // the settled moment (all pieces down, the ring not drawn yet: no station colour in the quiz picture)
    thumb: { cam: [-0.45, 2.55, 2.5], target: [0.02, 0.12, -0.3], t: SETTLED },
    dispose() {
      stop();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const im of [chunkShadows, pebbles, rain, wind, shimmer]) im.dispose();
      dashGeo.dispose(); sandTex.dispose();
    },
  };
}
