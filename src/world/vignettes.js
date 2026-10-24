// Quiz vignettes: five small still scenes, NEW examples of each process (so the retry quiz tests transfer, not memory).
// Each is rendered once into a 4:3 picture (640×480) by src/game/thumbs.js renderScenes (own scene, shared addLights,
// no fog) and then disposed. Everything is merged vertex-colour geometry (Lambert / unlit), no textures, deterministic.
import { THREE, PAL, rng, clamp, lerp, smooth, fbm, noise2, vcMat, basic, mergeParts, roundedBox, blobGeo, blobShadow, puffTexture } from '../core/kit.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const C = (h) => new THREE.Color(h);
const shade = (hex, k) => C(hex).multiplyScalar(k);
const mix = (a, b, t) => C(a).lerp(C(b), t);
const pick = (arr, k) => arr[((Math.round(k) % arr.length) + arr.length) % arr.length];
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const ball = (r, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
const AX_Z = [Math.PI / 2, 0, 0]; // cylinder axis along Z
const AX_X = [0, 0, Math.PI / 2]; // cylinder axis along X

// ---------------------------------------------------------------- generic geometry helpers
/** Mesh from merged coloured parts (one draw call). */
function mesh(parts, opts) { return new THREE.Mesh(mergeParts(parts), vcMat(opts)); }

/**
 * Indexed grid: at(i, j) → [x, y, z] for i ∈ 0..nu, j ∈ 0..nv; col(x, y, z, i, j, out) fills a THREE.Color.
 * Triangles face +Y when x grows with i and z grows with j (flip = true reverses the winding).
 */
function gridGeo(nu, nv, at, col, flip = false) {
  const n = (nu + 1) * (nv + 1), pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), c = new THREE.Color(), idx = [];
  for (let j = 0, k = 0; j <= nv; j++) for (let i = 0; i <= nu; i++, k++) {
    const p = at(i, j);
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    col(p[0], p[1], p[2], i, j, c);
    cl[k * 3] = c.r; cl[k * 3 + 1] = c.g; cl[k * 3 + 2] = c.b;
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, d = a + nu + 1, e = d + 1;
    if (flip) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Rectangular heightfield with vertex colours. */
function fieldGeo(x0, x1, z0, z1, nx, nz, hFn, cFn) {
  return gridGeo(nx, nz, (i, j) => { const x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz); return [x, hFn(x, z), z]; }, (x, y, z, i, j, out) => cFn(x, z, y, out));
}
/** Multiply a geometry's vertex colours by f(position, normal) (baked lighting for unlit scenes). */
function bake(geo, f) {
  const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color, v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i);
    const k = f(v, nn, i);
    if (Array.isArray(k)) c.setXYZ(i, c.getX(i) * k[0], c.getY(i) * k[1], c.getZ(i) * k[2]);
    else c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return geo;
}
/** Smooth-shaded lumpy puff (clouds, steam, dust, sand): blobGeo welded so its normals are smooth. */
function puff(r, seed, { detail = 2, jitter = 0.12, squash = 0.9 } = {}) {
  let g = blobGeo(r, { detail, seed, jitter, squash });
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}
/** Irregular rock / rubble chunk. */
function chunk(r, seed, squash = 0.7, detail = 0) { return blobGeo(r, { detail, seed, squash, jitter: 0.32 }); } // icosphere: already faceted

/** Date palm (trunk + crown) as parts, base at (x, y, z). */
function palmParts(x, y, z, h, seed, { lean = 0.14, yaw = 0, fronds = 11, scale = 1 } = {}) {
  const r = rng(seed), parts = [];
  const trunk = new THREE.CylinderGeometry(0.05 * scale, 0.085 * scale, h, 8, 14).translate(0, h / 2, 0);
  const p = trunk.attributes.position, cl = [], c = new THREE.Color(), bend = lean * h;
  const cA = C(PAL.trunk), cB = C(PAL.trunkDark);
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i), k = yy / h, ring = 1 + 0.13 * Math.max(0, Math.sin((yy / scale) * 40));
    p.setX(i, p.getX(i) * ring + bend * k * k); p.setZ(i, p.getZ(i) * ring);
    c.copy(cA).lerp(cB, Math.max(0, Math.sin((yy / scale) * 40)) * 0.75); cl.push(c.r, c.g, c.b);
  }
  trunk.computeVertexNormals();
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  parts.push({ geo: trunk, pos: [x, y, z], rot: [0, yaw, 0] });
  const top = [x + Math.cos(yaw) * bend, y + h, z - Math.sin(yaw) * bend];
  const L = (0.5 + h * 0.2) * Math.sqrt(scale);
  const leaf = new THREE.BoxGeometry(0.15 * scale, 0.012, L, 1, 1, 9).translate(0, 0, L / 2);
  const lp = leaf.attributes.position;
  for (let i = 0; i < lp.count; i++) { const k = lp.getZ(i) / L; lp.setX(i, lp.getX(i) * (1 - k * 0.8) * (0.6 + Math.sin(k * Math.PI) * 0.6)); lp.setY(i, lp.getY(i) + 0.25 * L * k - 0.8 * L * k * k); }
  leaf.computeVertexNormals();
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * TAU + r() * 0.3, tilt = -0.3 + r() * 0.4;
    parts.push({ geo: leaf, pos: top, rot: [tilt, a, 0], scale: 0.85 + r() * 0.3, color: [PAL.palmLeaf, PAL.leafDark, PAL.leaf][i % 3] });
  }
  for (let i = 0; i < 7; i++) parts.push({ geo: new THREE.IcosahedronGeometry(0.034 * scale, 0), pos: [top[0] + Math.cos(i * 1.1) * 0.075 * scale, top[1] - 0.07 * scale - (i % 2) * 0.03, top[2] + Math.sin(i * 1.1) * 0.075 * scale], color: PAL.dates });
  parts.push({ geo: new THREE.SphereGeometry(0.08 * scale, 8, 6), pos: top, color: PAL.trunkDark, scale: [1, 0.7, 1] });
  return parts;
}
/** Round bush with a few flowers. */
function bushParts(x, y, z, sc, seed, flowers = ['#ffd164', '#f7a1b5']) {
  const p = [
    { geo: blobGeo(0.22 * sc, { detail: 1, seed, squash: 0.8, jitter: 0.16 }), color: PAL.leafDark, pos: [x, y + 0.13 * sc, z] },
    { geo: blobGeo(0.16 * sc, { detail: 1, seed: seed + 1, squash: 0.85 }), color: PAL.leaf, pos: [x + 0.12 * sc, y + 0.2 * sc, z + 0.06 * sc] },
    { geo: blobGeo(0.13 * sc, { detail: 1, seed: seed + 2, squash: 0.85 }), color: PAL.leafLight, pos: [x - 0.1 * sc, y + 0.22 * sc, z + 0.08 * sc] },
  ];
  if (flowers) for (let i = 0; i < 4; i++) p.push({ geo: ball(0.026 * sc, 6, 5), color: flowers[i % flowers.length], pos: [x + Math.sin(seed + i * 2.1) * 0.17 * sc, y + 0.24 * sc + (i % 2) * 0.05 * sc, z + 0.1 * sc + Math.cos(seed + i * 2.1) * 0.07 * sc] });
  return p;
}

// =====================================================================================================================
// 1. quake2 — a school yard right after an earthquake: a deep zig-zag crack across the paving (the far side heaved up and
//    slid sideways, so the painted hopscotch no longer lines up), a leaning lamp post, a bench sunk into the crack and
//    stones fallen from the planter wall. Daylight.
// =====================================================================================================================
function quake2() {
  const group = new THREE.Group();
  group.name = 'vignette:quake2';
  const R = rng(9101);

  // ---- the crack: z = c(x) zig-zag between the tips XA..XB, half-width w(x); beyond the tips it is a closed seam
  const XA = -2.3, XB = 3.2, X0 = -9, X1 = 9, Z_FAR = -4.0, Z_NEAR = 6.5;
  const baseZ = (x) => -0.32 + 0.4 * x;
  const zig = [[XA, 0]];
  for (let x = XA, s = 1; ;) {
    x += 0.36 + R() * 0.34;
    if (x > XB - 0.25) break;
    zig.push([x, s * (0.12 + R() * 0.13)]); s = -s;
  }
  zig.push([XB, 0]);
  const zigAt = (x) => {
    if (x <= XA || x >= XB) return 0;
    for (let i = 0; i < zig.length - 1; i++) if (x <= zig[i + 1][0]) return lerp(zig[i][1], zig[i + 1][1], (x - zig[i][0]) / (zig[i + 1][0] - zig[i][0]));
    return 0;
  };
  const cz = (x) => baseZ(x) + zigAt(x);
  const env = (x) => (x <= XA || x >= XB ? 0 : Math.pow(Math.sin(Math.PI * (x - XA) / (XB - XA)), 0.55));
  const halfW = (x) => 0.19 * env(x);
  const eB = (x) => cz(x) - halfW(x) * (1 + 0.25 * noise2(x * 9, 1.7)); // back edge (far side)
  const eF = (x) => cz(x) + halfW(x) * (1 + 0.25 * noise2(x * 9, 6.1)); // front edge (near side)
  const SX = (x) => 0.15 * env(x) ** 0.5; // the far side slid to the right (+x)
  const yB = (x, z) => 0.085 * env(x) * Math.exp(-Math.max(0, eB(x) - z) / 0.85); // far side heaved up
  const yF = (x, z) => -0.022 * env(x) * Math.exp(-Math.max(0, z - eF(x)) / 0.6); // near side dropped a little
  const DEPTH = 0.7;

  // columns: dense along the crack (and its zig vertices), coarse elsewhere
  const xs = [];
  for (let x = X0; x < XA - 0.2; x += 0.3) xs.push(x);
  for (let x = XA - 0.2; x < XB + 0.2; x += 0.045) xs.push(x);
  for (let x = XB + 0.2; x <= X1 + 1e-6; x += 0.3) xs.push(x);
  for (const [zx] of zig) xs.push(zx);
  xs.push(XA, XB);
  xs.sort((a, b) => a - b);
  const XS = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 0.004);
  const nu = XS.length - 1;

  // ground colours: warm paving, a dusty rim along the crack, baked contact shadows near objects
  const PAVE = C('#ecdfc6'), PAVE2 = C('#e2d1b2'), RIM = C('#c9a982'), DUST = C('#d8c09a');
  const shadows = []; // [x, z, rx, rz, strength]
  const aoAt = (x, z) => {
    let a = 0;
    for (const [sx, sz, rx, rz, k] of shadows) { const d = Math.hypot((x - sx) / rx, (z - sz) / rz); a = Math.max(a, k * (1 - smooth(0.4, 1, d))); }
    return a;
  };
  const paveColor = (x, z, distEdge, out) => {
    const n = fbm(x * 0.9 + 3, z * 0.9 + 1, 3);
    out.copy(PAVE).lerp(PAVE2, clamp(0.35 + n));
    if (distEdge != null) out.lerp(DUST, 0.55 * (1 - smooth(0.04, 0.32, distEdge))).lerp(RIM, 0.85 * (1 - smooth(0.0, 0.05, distEdge)));
    return out.multiplyScalar(1 - aoAt(x, z));
  };

  // planter (raised bed of stone blocks) back-left, the school building behind the yard
  const PL = { x0: -4.6, x1: -2.25, z0: -3.0, z1: -1.55, h: 0.44 };
  const SCHOOL_Z = -4.0;
  shadows.push([(PL.x0 + PL.x1) / 2, (PL.z0 + PL.z1) / 2, (PL.x1 - PL.x0) / 2 + 0.25, (PL.z1 - PL.z0) / 2 + 0.25, 0.22]);

  const LAMP = { x: 1.95, z: -0.75 };
  const BENCH = { x: -1.05, len: 1.0 };
  BENCH.z = cz(BENCH.x + 0.42);
  const BALL = { x: -0.75, z: 1.05 };
  shadows.push([BALL.x + 0.03, BALL.z + 0.02, 0.17, 0.15, 0.4]);
  shadows.push([LAMP.x - 0.08, LAMP.z + 0.05, 0.28, 0.24, 0.3]);
  shadows.push([BENCH.x - 0.05, BENCH.z + 0.08, 0.62, 0.32, 0.28]);

  const rows = 20;
  const back = gridGeo(nu, rows, (i, j) => {
    const x = XS[i], t = j / rows, z = lerp(Z_FAR, eB(x), 1 - (1 - t) * (1 - t));
    return [x, yB(x, z), z];
  }, (x, y, z, i, j, out) => paveColor(x, z, halfW(x) > 0.002 ? eB(x) - z : null, out));
  const front = gridGeo(nu, rows, (i, j) => {
    const x = XS[i], t = j / rows, z = lerp(eF(x), Z_NEAR, t * t);
    return [x, yF(x, z), z];
  }, (x, y, z, i, j, out) => paveColor(x, z, halfW(x) > 0.002 ? z - eF(x) : null, out));

  // crack walls (the far wall faces the camera: paving slab, sand bed, soil, then darkness) and the floor
  const WALL = [[0, '#e3d3b4'], [0.022, '#cdb995'], [0.032, '#b98d5f'], [0.055, '#7a5032'], [0.09, '#3d2616'], [0.14, '#1c1009'], [0.3, '#0e0805'], [DEPTH, '#080403']];
  const ia = XS.findIndex((x) => x >= XA), ib = XS.findIndex((x) => x >= XB);
  const crackXs = XS.slice(ia, ib + 1), nc = crackXs.length - 1;
  const wallGeo = (edge, yfn, sign) => gridGeo(nc, WALL.length - 1, (i, j) => {
    const x = crackXs[i], d = WALL[j][0], z0 = edge(x);
    const jit = j > 0 && j < WALL.length - 1 ? 0.012 * noise2(x * 14, j * 3.1) : 0;
    const top = yfn(x, z0);
    return [x, j === WALL.length - 1 ? -DEPTH : top - d, z0 + sign * (d * 0.12 + jit)];
  }, (x, y, z, i, j, out) => out.set(WALL[j][1]), sign < 0);
  const wallB = wallGeo(eB, yB, 1), wallF = wallGeo(eF, yF, -1);
  const floor = gridGeo(nc, 1, (i, j) => { const x = crackXs[i]; return [x, -DEPTH, j ? eF(x) : eB(x)]; }, (x, y, z, i, j, out) => out.set('#0b0604'));

  // ---- painted markings and paving joints (decals that follow the slabs and stop at the crack edges)
  const decals = [];
  function decal(x0, x1, z0, z1, color, lift = 0.003, cell = 0.035) {
    for (const side of [0, 1]) { // 0 = far slab (shifted +SX, z ≤ eB), 1 = near slab (z ≥ eF)
      const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), nz = Math.max(1, Math.ceil((z1 - z0) / 0.12));
      let any = false;
      const g = gridGeo(nx, nz, (i, j) => {
        const xp = lerp(x0, x1, i / nx), zp = lerp(z0, z1, j / nz);
        if (side === 0) {
          const xw = xp + SX(xp), e = eB(xw) - 0.004, z = Math.min(zp, e);
          if (zp < e) any = true;
          return [xw, yB(xw, z) + lift, z];
        }
        const e = eF(xp) + 0.004, z = Math.max(zp, e);
        if (zp > e) any = true;
        return [xp, yF(xp, z) + lift, z];
      }, (x, y, z, i, j, out) => out.copy(color).multiplyScalar(1 - aoAt(x, z) * 0.8));
      if (any) decals.push({ geo: g });
    }
  }
  // paving joints every 0.8 m
  const JOINT = C('#cdbb9a');
  for (let k = -11; k <= 11; k++) decal(k * 0.8 - 0.011, k * 0.8 + 0.011, Z_FAR + 0.1, Z_NEAR - 0.5, JOINT, 0.0015, 0.08);
  for (let k = -4; k <= 7; k++) {
    const z = k * 0.8 + 0.4;
    // a joint parallel to x: sample as a thin rect in z (the shift along x does not move it)
    decal(X0 + 0.5, X1 - 0.5, z - 0.011, z + 0.011, JOINT, 0.0015, 0.12);
  }
  // hopscotch: white frames with coloured squares, rows from the near end (1, 1, 2, 1, 2, 1 + a half-moon)
  const HX = 0.25, HZ = 1.65, S = 0.4, B = 0.035;
  const hop = [[0], [0], [-0.5, 0.5], [0], [-0.5, 0.5], [0], [0]];
  const hopCols = ['#f2836b', '#ffd164', '#3fb3a6', '#9f8fe0', '#7cc47a', '#ffab52', '#f7a1b5', '#f2836b', '#ffd164', '#3fb3a6'];
  let hc = 0;
  hop.forEach((row, ri) => {
    for (const off of row) {
      const x = HX + off * S, z = HZ - ri * S;
      decal(x - S / 2, x + S / 2, z - S / 2, z + S / 2, C('#fffaf1'), 0.004);
      decal(x - S / 2 + B, x + S / 2 - B, z - S / 2 + B, z + S / 2 - B, C(hopCols[hc++ % hopCols.length]), 0.006);
    }
  });
  // a painted yellow game line across the yard on the right
  decal(1.15, 1.2, -2.6, 2.6, C('#ffc94a'), 0.004);
  decal(1.2, 4.6, 2.55, 2.6, C('#ffc94a'), 0.004);

  const groundMesh = mesh([{ geo: back }, { geo: front }, { geo: wallB }, { geo: wallF }, { geo: floor }, ...decals]);
  group.add(groundMesh);

  // ---- crumbs and broken paving bits along the edges (they read as "freshly broken")
  const bits = [];
  for (let i = 0; i < 70; i++) {
    const x = lerp(XA + 0.15, XB - 0.15, R()), side = R() < 0.5 ? 0 : 1;
    if (halfW(x) < 0.04) continue;
    const off = 0.03 + R() * R() * 0.35, r = 0.018 + R() * 0.03;
    const z = side ? eF(x) + off : eB(x) - off, y = side ? yF(x, z) : yB(x, z);
    bits.push({ geo: chunk(r, 300 + i, 0.6), color: R() < 0.6 ? mix('#e7d8bc', '#c9b291', R()) : mix('#b88a5e', '#8f6544', R()), pos: [x, y + r * 0.35, z], rot: [R() * 3, R() * 3, R() * 3] });
  }
  // tilted broken paving plates leaning into the gap
  for (const [x, k] of [[-0.35, 0], [0.95, 1], [1.95, 0], [-1.55, 1]]) {
    const z = k ? eF(x) + 0.08 : eB(x) - 0.08, y = k ? yF(x, z) : yB(x, z);
    const plate = new THREE.CylinderGeometry(0.16, 0.15, 0.045, 5).toNonIndexed();
    bits.push({ geo: plate, color: '#e6d6b8', pos: [x, y + 0.03, z], rot: [k ? -0.32 : 0.36, R() * 3, (R() - 0.5) * 0.3], scale: [1.1, 1, 0.75] });
  }

  // ---- planter of stone blocks with a palm; its front-right corner shook loose: blocks lie on the paving
  const P = [];
  const stone = (i) => mix('#e2c79a', '#cdae80', (i * 0.37) % 1);
  const course = 0.145, blockL = 0.34;
  let bi = 0;
  const broken = (x, z, c) => (c >= 1 && x > PL.x1 - 0.75 && z > PL.z1 - 0.75) || (c === 2 && x > PL.x1 - 1.1 && z > PL.z1 - 0.35);
  for (let c = 0; c < 3; c++) {
    const y = course / 2 + c * course, off = (c % 2) * blockL / 2;
    // front side (z = z1) and right side (x = x1), plus back/left for completeness
    for (let x = PL.x0 + off; x < PL.x1 - 0.05; x += blockL) {
      const L = Math.min(blockL - 0.012, PL.x1 - x - 0.012);
      if (L < 0.06) continue;
      if (!broken(x + L / 2, PL.z1, c)) P.push({ geo: roundedBox(L, course - 0.012, 0.2, 0.025, 1), color: stone(bi++), pos: [x + L / 2, y, PL.z1 - 0.1] });
      P.push({ geo: roundedBox(L, course - 0.012, 0.2, 0.025, 1), color: stone(bi++), pos: [x + L / 2, y, PL.z0 + 0.1] });
    }
    for (let z = PL.z0 + off; z < PL.z1 - 0.05; z += blockL) {
      const L = Math.min(blockL - 0.012, PL.z1 - z - 0.012);
      if (L < 0.06) continue;
      if (!broken(PL.x1, z + L / 2, c)) P.push({ geo: roundedBox(0.2, course - 0.012, L, 0.025, 1), color: stone(bi++), pos: [PL.x1 - 0.1, y, z + L / 2] });
      P.push({ geo: roundedBox(0.2, course - 0.012, L, 0.025, 1), color: stone(bi++), pos: [PL.x0 + 0.1, y, z + L / 2] });
    }
  }
  // soil and plants inside
  P.push({ geo: box(PL.x1 - PL.x0 - 0.4, 0.04, PL.z1 - PL.z0 - 0.4), color: '#8f6544', pos: [(PL.x0 + PL.x1) / 2, PL.h - 0.07, (PL.z0 + PL.z1) / 2] });
  P.push(...palmParts(-3.75, PL.h - 0.06, -2.35, 2.3, 77, { lean: 0.12, yaw: -0.4, fronds: 12 }));
  P.push(...bushParts(-2.85, PL.h - 0.07, -2.05, 1.35, 12));
  P.push(...bushParts(-4.25, PL.h - 0.07, -1.95, 1.1, 18, ['#f7a1b5', '#fff1dc']));
  // fallen blocks on the paving (stay whole or broken in two), with rubble
  const fallen = [[-2.05, -1.05, 0.5, 0.18], [-1.7, -1.35, -0.4, 0.5], [-2.35, -0.95, 1.2, -0.3], [-1.9, -0.72, 0.2, 1.4], [-2.62, -1.2, -0.9, 0.2]];
  fallen.forEach(([x, z, ry, rz], i) => {
    const half = i === 3;
    P.push({ geo: roundedBox(half ? 0.18 : blockL - 0.02, course - 0.012, 0.2, 0.025, 1), color: stone(i * 3 + 1), pos: [x, course / 2 - 0.01 + Math.abs(rz) * 0.05, z], rot: [0.12 * i, ry, rz * 0.35] });
    shadows.push([x, z, 0.24, 0.2, 0.3]);
  });
  for (let i = 0; i < 16; i++) {
    const a = R() * TAU, r = 0.1 + R() * 0.55, x = -2.15 + Math.cos(a) * r, z = -1.15 + Math.sin(a) * r * 0.6, s = 0.02 + R() * 0.04;
    P.push({ geo: chunk(s, 500 + i), color: stone(i), pos: [x, s * 0.4, z], rot: [R() * 3, R() * 3, 0] });
  }

  // ---- the school: a long cream building with a crenellated parapet, big windows, an arched entrance and a flag
  const SW = 18, SH = 1.4;
  P.push({ geo: box(SW, SH, 1.2), color: '#fff1dc', pos: [0, SH / 2, SCHOOL_Z - 0.6] });
  P.push({ geo: box(SW, 0.09, 1.25), color: '#ecd5b4', pos: [0, SH + 0.04, SCHOOL_Z - 0.6] });
  P.push({ geo: box(SW, 0.12, 0.04), color: '#e8cfa8', pos: [0, 0.06, SCHOOL_Z + 0.02] });
  for (let x = -SW / 2 + 0.15; x < SW / 2; x += 0.26) P.push({ geo: box(0.13, 0.12, 0.08), color: '#ecd5b4', pos: [x, SH + 0.15, SCHOOL_Z - 0.04] });
  const winCols = ['#3f8fb5', '#e0805f', '#3f9a7c', '#d9a13a'];
  for (let k = -8; k <= 8; k++) {
    const x = k * 1.05;
    if (k === 0) continue;
    P.push({ geo: box(0.62, 0.66, 0.03), color: '#fffaf1', pos: [x, 0.76, SCHOOL_Z + 0.01] });
    P.push({ geo: box(0.52, 0.56, 0.035), color: PAL.window, pos: [x, 0.76, SCHOOL_Z + 0.012] });
    P.push({ geo: box(0.02, 0.56, 0.045), color: '#5f6670', pos: [x, 0.76, SCHOOL_Z + 0.015] });
    P.push({ geo: box(0.52, 0.02, 0.045), color: '#5f6670', pos: [x, 0.76, SCHOOL_Z + 0.015] });
    P.push({ geo: box(0.7, 0.04, 0.08), color: winCols[(k + 8) % 4], pos: [x, 0.41, SCHOOL_Z + 0.03] });
    P.push({ geo: box(0.7, 0.07, 0.06), color: winCols[(k + 8) % 4], pos: [x, 1.12, SCHOOL_Z + 0.03] });
  }
  // entrance: arch frame, blue double door, a green sign board above
  P.push({ geo: box(0.9, 1.0, 0.05), color: '#ecd5b4', pos: [0, 0.5, SCHOOL_Z + 0.02] });
  P.push({ geo: new THREE.CylinderGeometry(0.45, 0.45, 0.05, 18, 1, false, -Math.PI / 2, Math.PI), color: '#ecd5b4', pos: [0, 1.0, SCHOOL_Z + 0.02], rot: [-Math.PI / 2, 0, 0] });
  P.push({ geo: box(0.7, 0.92, 0.06), color: '#4f8fc0', pos: [0, 0.46, SCHOOL_Z + 0.03] });
  P.push({ geo: new THREE.CylinderGeometry(0.35, 0.35, 0.06, 16, 1, false, -Math.PI / 2, Math.PI), color: '#4f8fc0', pos: [0, 0.92, SCHOOL_Z + 0.03], rot: [-Math.PI / 2, 0, 0] });
  P.push({ geo: box(0.015, 1.1, 0.07), color: '#2f5f88', pos: [0, 0.55, SCHOOL_Z + 0.03] });
  P.push({ geo: box(1.3, 0.26, 0.05), color: '#2a8b80', pos: [0, 1.24, SCHOOL_Z + 0.04] });
  P.push({ geo: box(1.18, 0.16, 0.055), color: '#3fb3a6', pos: [0, 1.24, SCHOOL_Z + 0.042] });
  // flag of Bahrain on a pole by the entrance: white hoist band with five points, red fly
  const FP = { x: 1.35, z: SCHOOL_Z + 0.5 }, FH = 1.95;
  P.push({ geo: cyl(0.018, 0.024, FH, 8), color: '#d9dde3', pos: [FP.x, FH / 2, FP.z] });
  P.push({ geo: ball(0.035, 8, 6), color: '#ffd164', pos: [FP.x, FH + 0.02, FP.z] });
  P.push({ geo: cyl(0.12, 0.14, 0.08, 12), color: '#cfc3ae', pos: [FP.x, 0.04, FP.z] });
  {
    const fw = 0.5, fh = 0.3, top = FH - 0.05, x0 = FP.x + 0.02, pos = [], col = [], cw = C('#ffffff'), cr = C('#ce1126');
    const quad = (ax, ay, bx, by, cx2, cy2, dx, dy, c) => { pos.push(ax, ay, FP.z, bx, by, FP.z, cx2, cy2, FP.z, ax, ay, FP.z, cx2, cy2, FP.z, dx, dy, FP.z); for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b); };
    const wave = (u) => 0.03 * Math.sin(u * 7);
    // red fly as strips (with a gentle wave), white band with the serrated edge
    const N = 8, xb = 0.16;
    for (let i = 0; i < N; i++) {
      const u0 = xb + ((fw - xb) * i) / N, u1 = xb + ((fw - xb) * (i + 1)) / N;
      quad(x0 + u0, top - fh + wave(u0), x0 + u1, top - fh + wave(u1), x0 + u1, top + wave(u1), x0 + u0, top + wave(u0), cr);
    }
    quad(x0, top - fh, x0 + 0.1, top - fh, x0 + 0.1, top, x0, top, cw);
    for (let k = 0; k < 5; k++) {
      const y0 = top - fh + (fh * k) / 5, y1 = top - fh + (fh * (k + 1)) / 5;
      pos.push(x0 + 0.1, y0, FP.z, x0 + xb + 0.005, (y0 + y1) / 2 + wave(xb), FP.z, x0 + 0.1, y1, FP.z);
      for (let i = 0; i < 3; i++) col.push(cw.r, cw.g, cw.b);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    fg.computeVertexNormals();
    group.add(new THREE.Mesh(fg, basic('#ffffff', { vertexColors: true, side: THREE.DoubleSide })));
  }
  // a couple of shrubs along the school front
  P.push(...bushParts(-1.4, 0, SCHOOL_Z + 0.35, 1.2, 40));
  P.push(...bushParts(3.0, 0, SCHOOL_Z + 0.35, 1.25, 44));
  P.push(...bushParts(5.2, 0, SCHOOL_Z + 0.35, 1.1, 48, ['#f7a1b5']));
  P.push(...palmParts(4.4, 0, SCHOOL_Z + 0.55, 2.2, 91, { lean: -0.1, yaw: 0.3 }));

  // ---- lamp post leaning ~16° with its footing torn up
  const lamp = [];
  const POLE = '#2f6f78', POLE_D = '#24575e';
  lamp.push({ geo: cyl(0.12, 0.15, 0.12, 14), color: '#cfc3ae', pos: [0, 0.03, 0] });
  lamp.push({ geo: cyl(0.06, 0.075, 0.22, 12), color: POLE_D, pos: [0, 0.18, 0] });
  lamp.push({ geo: cyl(0.03, 0.042, 1.7, 10), color: POLE, pos: [0, 1.05, 0] });
  lamp.push({ geo: cyl(0.045, 0.045, 0.06, 10), color: POLE_D, pos: [0, 0.75, 0] });
  // curved arm to the left with a lantern
  const arm = new THREE.TorusGeometry(0.2, 0.02, 6, 14, Math.PI / 2);
  lamp.push({ geo: arm, color: POLE, pos: [-0.2, 1.9, 0], rot: [0, 0, 0] });
  lamp.push({ geo: cyl(0.02, 0.02, 0.18, 8), color: POLE, pos: [-0.29, 2.1, 0], rot: AX_X });
  lamp.push({ geo: cyl(0.03, 0.14, 0.12, 12), color: POLE_D, pos: [-0.38, 2.05, 0] });
  lamp.push({ geo: cyl(0.1, 0.07, 0.13, 12), color: '#fff3c4', pos: [-0.38, 1.93, 0] });
  lamp.push({ geo: ball(0.035, 8, 6), color: POLE_D, pos: [-0.38, 2.14, 0] });
  const lampMesh = mesh(lamp);
  lampMesh.position.set(LAMP.x, yB(LAMP.x, LAMP.z) - 0.02, LAMP.z);
  lampMesh.rotation.set(0.12, 0, 0.28);
  group.add(lampMesh);
  // torn footing: a dark half-moon gap and lifted shards
  for (let i = 0; i < 6; i++) {
    const a = -0.6 + i * 0.5, r = 0.2 + R() * 0.06, s = 0.04 + R() * 0.03;
    bits.push({ geo: chunk(s, 700 + i, 0.5), color: mix('#e6d6b8', '#c9b291', R()), pos: [LAMP.x + Math.cos(a) * r, yB(LAMP.x, LAMP.z) + s * 0.4, LAMP.z + Math.sin(a) * r * 0.8], rot: [R(), R() * 3, R()] });
  }
  bits.push({ geo: new THREE.CircleGeometry(0.17, 14, -0.4, 2.4).rotateX(-Math.PI / 2), color: '#3a281c', pos: [LAMP.x + 0.02, yB(LAMP.x, LAMP.z) + 0.006, LAMP.z] });

  // ---- bench: its right legs dropped into the crack, so it tips over to the right
  const bench = [];
  const WOOD = ['#c98d5a', '#b97b49', '#d39a66'], LEG = '#3b4048';
  for (let k = 0; k < 3; k++) bench.push({ geo: roundedBox(BENCH.len, 0.03, 0.085, 0.012, 1), color: WOOD[k], pos: [0, 0.4, -0.1 + k * 0.1] });
  for (let k = 0; k < 2; k++) bench.push({ geo: roundedBox(BENCH.len, 0.075, 0.03, 0.012, 1), color: WOOD[(k + 1) % 3], pos: [0, 0.55 + k * 0.11, -0.2], rot: [-0.18, 0, 0] });
  for (const s of [-1, 1]) {
    const x = s * (BENCH.len / 2 - 0.1);
    bench.push({ geo: box(0.04, 0.4, 0.04), color: LEG, pos: [x, 0.2, 0.09] });
    bench.push({ geo: box(0.04, 0.68, 0.04), color: LEG, pos: [x, 0.34, -0.17], rot: [-0.12, 0, 0] });
    bench.push({ geo: box(0.04, 0.035, 0.32), color: LEG, pos: [x, 0.38, -0.04] });
    bench.push({ geo: box(0.05, 0.03, 0.34), color: LEG, pos: [x, 0.015, -0.04] });
  }
  const benchMesh = mesh(bench);
  benchMesh.position.set(BENCH.x, -0.075, BENCH.z + 0.02);
  benchMesh.rotation.set(-0.05, -0.15, -0.2);
  group.add(benchMesh);

  // a football left on the yard: white ball with dark pentagon patches facing out
  {
    const fr = 0.11, phi = (1 + Math.sqrt(5)) / 2, zAxis = new THREE.Vector3(0, 0, 1);
    P.push({ geo: new THREE.IcosahedronGeometry(fr, 2), color: '#fffaf1', pos: [BALL.x, fr, BALL.z] });
    for (const [a, b, c] of [[0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi], [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0], [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1]]) {
      const d = new THREE.Vector3(a, b, c).normalize();
      if (d.y < -0.5) continue;
      const g = new THREE.CircleGeometry(fr * 0.36, 5).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(zAxis, d));
      P.push({ geo: g, color: '#25385c', pos: [BALL.x + d.x * fr * 1.005, fr + d.y * fr * 1.005, BALL.z + d.z * fr * 1.005] });
    }
  }
  group.add(mesh([...P, ...bits]));
  // soft contact shadows under the leaning lamp's head and the bench
  blobShadow(0.5, 0.3, 0.22, group, [BENCH.x, 0.01, BENCH.z + 0.15]);

  return { id: 'quake2', group, cam: [0.15, 2.75, 4.15], target: [-0.05, 0.3, -0.45], fov: 50, sky: '#bfe6f6' };
}

// =====================================================================================================================
// 2. volcano2 — a volcanic island at dusk: a dark cone with a glowing crater, two lava rivers running down into the sea
//    (steam where they meet the water), a heavy grey ash cloud, a low sun on a pink sky. Lighting is baked into unlit
//    vertex colours so the scene looks like dusk under the shared daylight rig.
// =====================================================================================================================
function volcano2() {
  const group = new THREE.Group();
  group.name = 'vignette:volcano2';
  const R = rng(5202);
  const H = 3.05, RC = 0.5, RB = 2.95, CRATER = 0.32; // cone height, crater rim radius, base radius, crater depth
  const SUN = new THREE.Vector3(-0.8, 0.42, 0.3).normalize();
  const gullies = (a) => Math.sin(a * 11 + 1.3 * Math.sin(a * 3)) * 0.6 + Math.sin(a * 23 + 0.5) * 0.3;
  const baseR = (a) => RB * (1 + 0.05 * Math.sin(3 * a + 0.6) + 0.03 * Math.sin(5 * a + 2.2));
  const coneY = (r, a) => {
    if (r < RC) { const k = r / RC; return H - CRATER * (1 - k * k) - 0.02; } // crater bowl
    const u = clamp((r - RC) / (baseR(a) - RC));
    const prof = H * Math.pow(1 - u, 1.55) + 0.08 * Math.sin(Math.PI * u);
    return prof + gullies(a) * 0.05 * Math.sin(Math.PI * u) * (0.4 + u);
  };
  // lava rivers: centre line by radius, angle measured from +x toward +z (the camera is at +z)
  const FLOWS = [
    { a0: 1.85, amp: 0.2, f: 2.6, ph: 0.4, w: 1.0, end: 1.02 },  // front-left, reaches the sea
    { a0: 1.12, amp: 0.16, f: 3.1, ph: 2.1, w: 0.8, end: 1.0 },  // front-right, reaches the sea
    { a0: 2.55, amp: 0.12, f: 3.4, ph: 1.0, w: 0.55, end: 0.62 }, // a short one on the left flank
  ];
  const flowA = (fl, r) => fl.a0 + fl.amp * Math.sin(r * fl.f + fl.ph) * smooth(RC, RC + 0.6, r);
  const lavaPts = [];
  for (const fl of FLOWS) for (let r = RC; r < RB * fl.end; r += 0.08) { const a = flowA(fl, r); lavaPts.push([Math.cos(a) * r, coneY(r, a), Math.sin(a) * r]); }
  const glowAt = (p) => {
    let g = 0;
    for (const q of lavaPts) { const d2 = (p.x - q[0]) ** 2 + (p.y - q[1]) ** 2 * 0.5 + (p.z - q[2]) ** 2; if (d2 < 1.2) g = Math.max(g, Math.exp(-Math.sqrt(d2) / 0.22)); }
    const dc = Math.hypot(p.x, p.y - H, p.z); // crater glow
    return Math.max(g, 1.1 * Math.exp(-dc / 0.45));
  };
  const AMB = [0.52, 0.42, 0.58], SUNC = [1.0, 0.72, 0.55], GLOW = [1.0, 0.42, 0.12];
  const light = (v, n, glowK = 1) => {
    const d = Math.max(0, n.dot(SUN)), up = 0.5 + 0.5 * n.y, g = glowAt(v) * glowK;
    return [AMB[0] * (0.7 + 0.3 * up) + SUNC[0] * d * 0.75 + GLOW[0] * g * 1.3, AMB[1] * (0.7 + 0.3 * up) + SUNC[1] * d * 0.75 + GLOW[1] * g * 1.3, AMB[2] * (0.7 + 0.3 * up) + SUNC[2] * d * 0.75 + GLOW[2] * g * 1.3];
  };

  // ---- the cone + beach (polar grid)
  const NR = 46, NA = 120, R_BEACH = 0.42;
  const rAt = (i, a) => { const t = i / NR; return t < 0.12 ? (t / 0.12) * RC : RC + ((t - 0.12) / 0.88) * (baseR(a) + R_BEACH - RC); };
  const ROCK = C('#6a5058'), ROCK_HI = C('#7c5f62'), ASH_C = C('#4f4049'), BEACH = C('#9a7c6a'), GREEN = C('#56664a');
  const cone = gridGeo(NA, NR, (j, i) => {
    const a = (j / NA) * TAU, r = rAt(i, a), br = baseR(a);
    let y = r <= br ? coneY(r, a) : -0.05 * ((r - br) / R_BEACH) + 0.05 * (1 - (r - br) / R_BEACH);
    if (r > br - 0.15 && r <= br) y = Math.max(y, 0.04);
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  }, (x, y, z, j, i, out) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x), br = baseR(a), u = clamp((r - RC) / (br - RC));
    if (r < RC) return out.set('#3d2a2c');
    const n = fbm(x * 1.7 + 4, z * 1.7 + 2, 3);
    out.copy(ROCK).lerp(ROCK_HI, clamp(0.5 + n + gullies(a) * 0.3)).lerp(ASH_C, (1 - smooth(0.0, 0.45, u)) * 0.7);
    if (u > 0.72) out.lerp(GREEN, smooth(0.72, 0.95, u) * clamp(0.5 + fbm(x * 2 + 9, z * 2, 2) * 1.5) * (Math.sin(a) > 0.1 && Math.cos(a) > -0.2 ? 0.9 : 0.2));
    if (r > br) out.copy(BEACH).lerp(C('#b39079'), clamp(0.5 + n));
    return out;
  }, true);
  bake(cone, (v, n) => light(v, n));

  // ---- props on the island (palms on the right shore, dark boulders), baked like the rock
  const props = [];
  props.push(...palmParts(2.55, 0.02, 0.9, 1.25, 61, { lean: 0.18, yaw: 0.4, fronds: 10, scale: 0.85 }));
  props.push(...palmParts(2.9, 0.0, -0.1, 1.05, 62, { lean: 0.22, yaw: -0.2, fronds: 9, scale: 0.8 }));
  props.push(...palmParts(2.15, 0.06, 1.55, 0.9, 63, { lean: 0.1, yaw: 1.0, fronds: 9, scale: 0.75 }));
  for (let i = 0; i < 18; i++) {
    const a = R() * TAU, r = RC + 0.4 + R() * (RB - RC - 0.5), s = 0.05 + R() * 0.09;
    props.push({ geo: chunk(s, 820 + i, 0.75, 1), color: R() < 0.5 ? '#3e2f35' : '#57434a', pos: [Math.cos(a) * r, coneY(r, a) + s * 0.3, Math.sin(a) * r] });
  }
  // a fan of fresh black rock where the lava pours into the sea, and a tiny distant island
  for (const fl of FLOWS.filter((f) => f.end > 0.9)) {
    const a = flowA(fl, RB);
    for (let i = 0; i < 9; i++) {
      const aa = a + (R() - 0.5) * 0.3, r = baseR(aa) + 0.05 + R() * 0.35, s = 0.07 + R() * 0.07;
      props.push({ geo: chunk(s, 900 + i, 0.55, 1), color: '#2e2427', pos: [Math.cos(aa) * r, 0.0, Math.sin(aa) * r] });
    }
  }
  const propGeo = mergeParts(props);
  bake(propGeo, (v, n) => light(v, n));

  // ---- the sea: dusk violet-blue, pink sky reflections far away, orange lava reflections near the lava mouths
  const lavaMouths = FLOWS.filter((f) => f.end > 0.9).map((f) => { const a = flowA(f, RB); return [Math.cos(a) * baseR(a), Math.sin(a) * baseR(a)]; });
  const SEA_N = C('#5a5f9f'), SEA_F = C('#9a7fae'), SHALLOW = C('#727bb2'), FOAM = C('#f3d6d6'), REFL = C('#ff9b4a');
  const sea = gridGeo(96, 60, (j, i) => {
    const a = (j / 96) * TAU, t = i / 60, r = 2.6 + 140 * t * t * t;
    return [Math.cos(a) * r, 0, Math.sin(a) * r];
  }, (x, y, z, j, i, out) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x), br = baseR(a);
    out.copy(SEA_N).lerp(SEA_F, smooth(6, 45, Math.hypot(x, z - 3)));
    out.lerp(SHALLOW, 1 - smooth(br + 0.3, br + 1.1, r));
    let refl = 0;
    for (const [mx, mz] of lavaMouths) refl = Math.max(refl, Math.exp(-Math.abs(x - mx * 1.1) / 0.35) * smooth(br - 0.2, br + 0.3, r) * (1 - smooth(0.5, 5.0, z - mz)) * (z > mz - 0.6 ? 1 : 0));
    out.lerp(REFL, clamp(refl * 0.75));
    out.lerp(FOAM, 0.32 * (1 - smooth(br + 0.42, br + 0.5, r)));
    return out;
  }, true);
  // a few long light streaks on the water
  const streaks = [];
  for (let i = 0; i < 14; i++) {
    const x = -9 + R() * 18, z = -6 + R() * 12, L = 0.6 + R() * 1.8;
    if (Math.hypot(x, z) < RB + 1.3) continue;
    streaks.push({ geo: new THREE.PlaneGeometry(L, 0.03).rotateX(-Math.PI / 2), color: '#c7a6c6', pos: [x, 0.005, z] });
  }
  // setting sun (half under the horizon) with a soft halo
  const sunParts = [
    { geo: new THREE.CircleGeometry(9.5, 40), color: '#ffc59a', pos: [-60, 2, -125] },
    { geo: new THREE.CircleGeometry(6.0, 40), color: '#ffe3a6', pos: [-60, 2, -124.5] },
  ];
  group.add(new THREE.Mesh(mergeParts([{ geo: sea }, ...streaks, ...sunParts]), basic('#ffffff', { vertexColors: true })));

  // ---- lava: glowing ribbons (unlit), crater lake, bombs
  const lava = [];
  const HOT = C('#fff2a8'), MID = C('#ffb43c'), EDGE = C('#ff5a24'), CRUST = C('#c2321e');
  for (const fl of FLOWS) {
    const rs = [];
    for (let r = RC - 0.06; r < RB * fl.end; r += 0.045) rs.push(r);
    const NW = 6;
    lava.push({ geo: gridGeo(NW, rs.length - 1, (k, i) => {
      const r = rs[i], a = flowA(fl, r), u = clamp((r - RC) / (RB - RC));
      const w = (0.075 + 0.17 * u) * fl.w * (1 + 0.22 * Math.sin(r * 9 + fl.ph)), t = (k / NW) * 2 - 1;
      const aa = a + (t * w) / Math.max(r, 0.2), rr = r;
      const y = (rr < RB * 0.98 ? coneY(rr, aa) : 0.02) + 0.03 + 0.015 * (1 - t * t);
      return [Math.cos(aa) * rr, Math.max(y, 0.025), Math.sin(aa) * rr];
    }, (x, y, z, k, i, out) => {
      const t = Math.abs((k / NW) * 2 - 1), u = i / (rs.length - 1);
      out.copy(HOT).lerp(MID, smooth(0.0, 0.55, t) * 0.9 + u * 0.25).lerp(EDGE, smooth(0.5, 1, t)).lerp(CRUST, smooth(0.8, 1, t) * 0.6);
      return out;
    }, true) });
  }
  lava.push({ geo: new THREE.CircleGeometry(RC * 0.82, 24).rotateX(-Math.PI / 2), color: '#ffcf4a', pos: [0, H - CRATER * 0.55, 0] });
  lava.push({ geo: new THREE.CircleGeometry(RC * 0.45, 20).rotateX(-Math.PI / 2), color: '#fff2a8', pos: [0, H - CRATER * 0.55 + 0.005, 0] });
  for (let i = 0; i < 14; i++) {
    const a = R() * TAU, r = 0.1 + R() * 0.55, y = H + 0.08 + R() * 0.55, s = 0.03 + R() * 0.04;
    lava.push({ geo: new THREE.IcosahedronGeometry(s, 0), color: i % 3 ? '#ff8a2a' : '#ffd35c', pos: [Math.cos(a) * r, y, Math.sin(a) * r * 0.6] });
  }
  group.add(new THREE.Mesh(mergeParts(lava), basic('#ffffff', { vertexColors: true })));

  // ---- ash cloud: a dark column from the crater that billows out and drifts right; underlit orange near the vent
  const cloud = [];
  const column = [[0, 3.62, -0.05, 0.3], [0.04, 3.95, -0.05, 0.4], [0.1, 4.32, -0.05, 0.5], [0.22, 4.7, -0.1, 0.58]];
  column.forEach(([x, y, z, r], i) => cloud.push({ geo: puff(r, 140 + i, { detail: 3 }), color: '#8d8691', pos: [x, y, z] }));
  const HEAD = { x: 0.75, y: 5.35, z: -0.35, rx: 1.75, ry: 0.62, rz: 0.75 };
  for (let i = 0; i < 26; i++) {
    const a = R() * TAU, b = R() * 2 - 1, k = Math.sqrt(R());
    const x = HEAD.x + Math.cos(a) * Math.sqrt(1 - b * b) * HEAD.rx * k, y = HEAD.y + b * HEAD.ry * k + 0.15 * Math.sin(i), z = HEAD.z + Math.sin(a) * Math.sqrt(1 - b * b) * HEAD.rz * k;
    const r = 0.42 + R() * 0.34 - 0.08 * Math.abs(x - HEAD.x);
    cloud.push({ geo: puff(r, 150 + i, { detail: i < 14 ? 3 : 2 }), color: '#8d8691', pos: [x, y, z] });
  }
  const cloudGeo = mergeParts(cloud);
  const CLOUD_SUN = new THREE.Vector3(-0.6, 0.6, 0.45).normalize();
  bake(cloudGeo, (v, n) => {
    const d = Math.max(0, n.dot(CLOUD_SUN)), down = Math.max(0, -n.y), g = Math.exp(-Math.max(0, v.y - H) / 0.9) * (0.4 + 0.6 * down);
    const k = 0.62 + 0.42 * d - 0.12 * down;
    return [k + 0.55 * g + d * 0.12, k + 0.22 * g + d * 0.02, k + 0.04 * g + 0.02];
  });
  // steam where the lava meets the sea
  const steam = [];
  for (const [mx, mz] of lavaMouths) for (let i = 0; i < 4; i++) {
    const r = 0.07 + i * 0.03;
    steam.push({ geo: puff(r * 0.85, 170 + i, { detail: 2 }), color: '#cdb9c6', pos: [mx * 1.04 + i * 0.09, 0.04 + i * 0.1, mz * 1.04 + 0.06], scale: [1.3, 0.8, 1] });
  }
  const steamGeo = mergeParts(steam);
  bake(steamGeo, (v, n) => { const d = Math.max(0, n.dot(SUN)); return [0.8 + 0.2 * d, 0.74 + 0.16 * d, 0.78 + 0.12 * d]; });
  group.add(new THREE.Mesh(mergeParts([{ geo: cone }, { geo: propGeo }, { geo: cloudGeo }, { geo: steamGeo }]), basic('#ffffff', { vertexColors: true })));

  const glowMat = new THREE.MeshBasicMaterial({ map: puffTexture(), color: '#ff7a2a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat);
  glow.position.set(0, H + 0.12, 0.3);
  glow.scale.set(1.5, 0.9, 1);
  glow.renderOrder = 2;
  group.add(glow);
  return { id: 'volcano2', group, cam: [0.9, 2.3, 9.2], target: [0.2, 2.55, 0], fov: 50, sky: '#f4a78f' };
}

// =====================================================================================================================
// 3. weather2 — an old Bahraini fort wall slowly crumbling: cracks run through the sand-coloured stone blocks, the top
//    corner has broken away and its pieces lie in a heap right at the foot of the wall (nothing carried them off), a small
//    shrub grows out of a crack. Dry sandy ground, clear sky, no water.
// =====================================================================================================================
function weather2() {
  const group = new THREE.Group();
  group.name = 'vignette:weather2';
  const R = rng(3303);
  const WX0 = -2.7, WX1 = 3.6, WZ = -0.75, TH = 0.42, CH = 0.19, NC = 8, WH = CH * NC; // wall front face at z = WZ
  const GAP = { x: 1.05, half: 1.0, depth: 0.95 }; // the broken-away top: a ragged V
  const gapDepth = (x) => GAP.depth * Math.pow(clamp(1 - Math.abs(x - GAP.x) / GAP.half), 0.8) * (1 + 0.12 * noise2(x * 5, 2.2));
  const missing = (x, yTop) => yTop > WH - gapDepth(x) + 0.02;
  const HEAP = { x: GAP.x - 0.05, z: WZ + 0.42, rx: 1.05, rz: 0.48 };

  // ---- ground: dry sand, darker in the wall's shade and under the heap
  const SAND = C('#ecd3a2'), SAND2 = C('#dcb983'), FAR = C('#e9d8b5');
  const groundH = (x, z) => {
    const far = smooth(-2, -12, z);
    const heap = 0.2 * Math.max(0, 1 - Math.hypot((x - HEAP.x) / (HEAP.rx * 1.1), (z - HEAP.z) / (HEAP.rz * 1.15))) ** 1.2 * (1 - 0.35 * smooth(WZ, WZ + 0.6, z));
    return 0.04 * fbm(x * 0.5 + 2, z * 0.5, 2) * (1 - smooth(WZ - 0.2, WZ + 0.6, z) * 0) + far * 0.5 * (fbm(x * 0.12, z * 0.12 + 5, 2) + 0.3) + heap;
  };
  const ground = fieldGeo(-16, 16, -26, 7, 80, 70, groundH, (x, z, y, out) => {
    const n = fbm(x * 0.8 + 1, z * 0.8 + 7, 3);
    out.copy(SAND).lerp(SAND2, clamp(0.35 + n * 1.2));
    out.lerp(FAR, smooth(-6, -18, z) * 0.6);
    const wallAO = z > WZ && x > WX0 - 0.3 && x < WX1 + 0.3 ? 0.22 * (1 - smooth(0, 0.55, z - WZ)) : 0;
    const hd = Math.hypot((x - HEAP.x) / (HEAP.rx * 1.1), (z - HEAP.z) / (HEAP.rz * 1.15));
    out.lerp(C('#d1ad78'), 0.7 * (1 - smooth(0.7, 1.0, hd)));
    return out.multiplyScalar(1 - wallAO);
  });
  const P = [{ geo: ground }];

  // ---- the wall: stone blocks over a darker mortar core, running bond
  const STONES = ['#e8cd9c', '#dfc08b', '#d6b47f', '#ebd5ab', '#d9b98a', '#cfa977'];
  const MORTAR = '#b5976e';
  const coreTop = (x) => (WH - Math.max(0, gapDepth(x) - 0.08));
  // mortar core as columns so it follows the broken top
  for (let x = WX0; x < WX1 - 1e-6; x += 0.1) {
    const h = Math.min(coreTop(x), coreTop(x + 0.1)) - 0.06;
    P.push({ geo: box(0.1, h, TH - 0.04), color: MORTAR, pos: [x + 0.05, h / 2, WZ - TH / 2] });
  }
  const blocks = []; // remember where blocks are (for cracks)
  for (let c = 0; c < NC; c++) {
    const y0 = c * CH, off = (c % 2 ? 0.2 : 0) + (R() - 0.5) * 0.04;
    let x = WX0 - off;
    while (x < WX1) {
      const L = 0.34 + R() * 0.14, xa = Math.max(x, WX0), xb = Math.min(x + L, WX1);
      x += L;
      if (xb - xa < 0.08) continue;
      const cx = (xa + xb) / 2;
      if (missing(cx, y0 + CH)) {
        // a block on the edge of the break is half crumbled: smaller and lumpy
        if (!missing(cx, y0 + CH * 0.35)) P.push({ geo: chunk(CH * 0.62, 1000 + c * 40 + Math.round(x * 10), 0.8, 1), color: pick(STONES, c * 7 + x * 13), pos: [cx, y0 + CH * 0.42, WZ - 0.12], scale: [(xb - xa) / (CH * 1.25), 1, 1.1] });
        continue;
      }
      const col = mix(pick(STONES, c * 7 + x * 13), '#c9a271', R() * 0.25);
      const w = xb - xa - 0.022, h = CH - 0.022;
      P.push({ geo: roundedBox(w, h, TH, 0.028, 1), color: col, pos: [cx, y0 + CH / 2, WZ - TH / 2], rot: [0, 0, (R() - 0.5) * 0.02] });
      blocks.push({ x0: xa, x1: xb, y0, y1: y0 + CH });
    }
  }
  // merlons (rounded, pointed tops) along the parapet where the wall still stands
  for (let x = WX0 + 0.22; x < WX1 - 0.1; x += 0.46) {
    if (gapDepth(x) > 0.02 || gapDepth(x - 0.12) > 0.02 || gapDepth(x + 0.12) > 0.02) continue;
    const col = pick(STONES, x * 7 + 20);
    P.push({ geo: roundedBox(0.26, 0.2, TH - 0.06, 0.04, 2), color: col, pos: [x, WH + 0.1, WZ - TH / 2] });
    P.push({ geo: new THREE.ConeGeometry(0.15, 0.17, 4, 1), color: col, pos: [x, WH + 0.28, WZ - TH / 2], rot: [0, Math.PI / 4, 0], scale: [1.18, 1, 0.95] });
  }
  // a round tower at the left end
  const TW = { x: WX0 - 0.35, z: WZ - 0.25, r: 0.78, h: WH + 0.55 };
  for (let c = 0; c * CH < TW.h; c++) {
    const n = 14, a0 = (c % 2) * (Math.PI / n);
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU;
      if (Math.sin(a) < -0.4) continue; // the back half is never seen
      const col = mix(STONES[(c * 5 + k * 3) % STONES.length], '#c9a271', R() * 0.2);
      P.push({ geo: roundedBox(0.34, CH - 0.022, 0.3, 0.026, 1), color: col, pos: [TW.x + Math.cos(a) * TW.r, c * CH + CH / 2, TW.z + Math.sin(a) * TW.r], rot: [0, -a + Math.PI / 2, 0] });
    }
  }
  P.push({ geo: cyl(TW.r - 0.05, TW.r - 0.05, TW.h - 0.02, 20), color: MORTAR, pos: [TW.x, TW.h / 2, TW.z] });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    if (Math.sin(a) < -0.3) continue;
    const col = STONES[(k * 5) % STONES.length];
    P.push({ geo: roundedBox(0.26, 0.22, 0.24, 0.04, 2), color: col, pos: [TW.x + Math.cos(a) * (TW.r - 0.04), TW.h + 0.1, TW.z + Math.sin(a) * (TW.r - 0.04)], rot: [0, -a + Math.PI / 2, 0] });
    P.push({ geo: new THREE.ConeGeometry(0.14, 0.17, 4, 1), color: col, pos: [TW.x + Math.cos(a) * (TW.r - 0.04), TW.h + 0.29, TW.z + Math.sin(a) * (TW.r - 0.04)], rot: [0, -a + Math.PI / 4, 0] });
  }
  // a wooden fort door in the wall (left part)
  P.push({ geo: box(0.6, 0.86, 0.06), color: '#8f5f3c', pos: [-1.75, 0.43, WZ + 0.005] });
  for (let k = 0; k < 4; k++) P.push({ geo: box(0.012, 0.84, 0.07), color: '#6e4528', pos: [-1.98 + k * 0.155, 0.43, WZ + 0.01] });
  for (const y of [0.18, 0.62]) P.push({ geo: box(0.6, 0.04, 0.075), color: '#5f6670', pos: [-1.75, y, WZ + 0.012] });
  for (let k = 0; k < 8; k++) P.push({ geo: ball(0.016, 6, 5), color: '#ffd164', pos: [-2.0 + (k % 4) * 0.165, 0.18 + Math.floor(k / 4) * 0.44, WZ + 0.05] });
  P.push({ geo: box(0.74, 0.08, 0.1), color: '#d9b98a', pos: [-1.75, 0.9, WZ + 0.02] });

  // ---- cracks: dark jagged lines across the block faces (the highest-contrast thing in view)
  const CRACK = '#4a3427';
  const crackLine = (pts, wdt) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0);
      const w = wdt * (1 - 0.5 * (i / (pts.length - 1)));
      P.push({ geo: box(L + w * 0.6, w, 0.012), color: CRACK, pos: [(x0 + x1) / 2, (y0 + y1) / 2, WZ + 0.004], rot: [0, 0, Math.atan2(y1 - y0, x1 - x0)] });
    }
  };
  const jag = (x0, y0, x1, y1, n, amp, seed) => { const r = rng(seed), pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([lerp(x0, x1, t) + (i % 2 ? amp : -amp) * (0.4 + r() * 0.6) * (i > 0 && i < n ? 1 : 0), lerp(y0, y1, t)]); } return pts; };
  crackLine(jag(GAP.x - 0.55, WH - 0.62, GAP.x - 1.05, 0.25, 9, 0.07, 1), 0.042); // a long crack down from the break
  crackLine(jag(GAP.x + 0.55, WH - 0.55, GAP.x + 0.9, 0.55, 6, 0.06, 2), 0.038);
  crackLine(jag(GAP.x - 0.82, 0.78, GAP.x - 1.45, 0.62, 4, 0.04, 3), 0.022); // branch
  crackLine(jag(2.55, 1.38, 2.75, 0.55, 5, 0.05, 4), 0.03);
  crackLine(jag(-0.55, 1.4, -0.8, 0.95, 4, 0.04, 5), 0.022);
  crackLine(jag(-2.75, 1.25, -2.55, 0.7, 4, 0.04, 6), 0.02);
  // pitted, flaking surfaces: small dark hollows on some blocks
  for (let i = 0; i < 26; i++) {
    const b = blocks[Math.floor(R() * blocks.length)];
    const x = lerp(b.x0 + 0.06, b.x1 - 0.06, R()), y = lerp(b.y0 + 0.05, b.y1 - 0.05, R());
    P.push({ geo: new THREE.CircleGeometry(0.018 + R() * 0.02, 7), color: '#a7845c', pos: [x, y, WZ + 0.003], scale: [1.3, 0.8, 1] });
  }

  // ---- the heap of broken pieces right at the foot of the wall (fallen from the gap above)
  // broken blocks (whole, halves, corners) tumbled at odd angles, half sunk in a mound of grit
  const heapY = (x, z) => groundH(x, z);
  const pieces = [[-0.55, 0.12, 1, 0.5, 0.2], [-0.15, 0.3, 0.55, 1.1, -0.3], [0.25, 0.08, 1, -0.2, 0.5], [0.6, 0.28, 0.6, 0.8, 0.9],
    [-0.85, 0.36, 0.5, 0.3, -0.6], [0.05, 0.52, 0.45, 1.6, 0.1], [0.85, 0.06, 0.8, -0.5, -0.25], [-0.4, 0.55, 0.4, 0.2, 1.3], [0.45, 0.5, 0.35, 0.6, -1.0], [-1.1, 0.12, 0.45, -0.7, 0.4]];
  pieces.forEach(([dx, dz, k, ry, rz], i) => {
    const x = HEAP.x + dx, z = WZ + 0.1 + dz, L = 0.36 * k + 0.06, s = 0.17;
    P.push({ geo: roundedBox(L, s - 0.02, 0.2, 0.03, 1), color: mix(pick(STONES, i * 5), '#c9a271', 0.15), pos: [x, heapY(x, z) + s * 0.32, z], rot: [rz * 0.4, ry, rz] });
  });
  for (let i = 0; i < 14; i++) { // lumpy broken corners
    const a = R() * Math.PI, rr = 0.3 + R() * 0.75;
    const x = HEAP.x + Math.cos(a) * rr * HEAP.rx, z = WZ + 0.08 + Math.sin(a) * rr * HEAP.rz * 1.4, s = 0.05 + R() * 0.05;
    P.push({ geo: chunk(s, 1200 + i, 0.75), color: pick(STONES, i * 3 + 1), pos: [x, heapY(x, z) + s * 0.4, z], rot: [R(), R() * 3, R()], scale: [1.4, 1, 1.1] });
  }
  for (let i = 0; i < 60; i++) { // grit and small bits
    const a = R() * Math.PI, rr = Math.sqrt(R());
    const x = HEAP.x + Math.cos(a) * rr * HEAP.rx * 1.15, z = WZ + 0.05 + Math.sin(a) * rr * HEAP.rz * 1.6;
    const s = 0.015 + R() * 0.03;
    P.push({ geo: chunk(s, 1300 + i, 0.7), color: mix(pick(STONES, i), '#b89a6e', R() * 0.4), pos: [x, heapY(x, z) + s * 0.3, z], rot: [R() * 3, R() * 3, R() * 3] });
  }
  // a few flakes along the rest of the wall base (it crumbles everywhere, slowly)
  for (let i = 0; i < 22; i++) {
    const x = lerp(WX0 + 0.2, WX1 - 0.2, R()), z = WZ + 0.05 + R() * 0.2;
    if (Math.abs(x - HEAP.x) < HEAP.rx) continue;
    const s = 0.02 + R() * 0.035;
    P.push({ geo: chunk(s, 1400 + i, 0.5), color: STONES[i % STONES.length], pos: [x, groundH(x, z) + s * 0.25, z], rot: [R(), R() * 3, R()] });
  }

  // ---- a small shrub growing out of a crack (roots open the crack wider)
  const SH = { x: GAP.x - 0.82, y: 0.86 };
  P.push(...bushParts(SH.x, SH.y - 0.12, WZ + 0.06, 0.55, 77, ['#f7a1b5', '#fff1dc']));
  for (let k = 0; k < 3; k++) P.push({ geo: cyl(0.008, 0.012, 0.18, 5), color: '#7f5838', pos: [SH.x - 0.05 + k * 0.05, SH.y - 0.16, WZ + 0.01], rot: [0, 0, (k - 1) * 0.5] });

  // ---- surroundings: dry tufts, pebbles, palms behind the fort
  for (let i = 0; i < 26; i++) {
    const x = -5 + R() * 10, z = WZ + 0.5 + R() * 4.5;
    if (Math.hypot((x - HEAP.x) / 1.4, (z - HEAP.z) / 0.8) < 1) continue;
    const y = groundH(x, z), k = 0.6 + R() * 0.7;
    for (let b = 0; b < 5; b++) P.push({ geo: new THREE.ConeGeometry(0.012 * k, 0.16 * k, 3), color: b % 2 ? '#c9b26a' : '#a9a35a', pos: [x + (b - 2) * 0.015, y + 0.07 * k, z], rot: [(R() - 0.5) * 0.6, 0, (b - 2) * 0.28] });
  }
  for (let i = 0; i < 18; i++) {
    const x = -5 + R() * 10, z = WZ + 0.6 + R() * 4, s = 0.03 + R() * 0.05;
    P.push({ geo: chunk(s, 1500 + i, 0.6), color: R() < 0.5 ? '#c3b6a6' : '#d8c3a0', pos: [x, groundH(x, z) + s * 0.25, z] });
  }
  P.push(...palmParts(-1.0, 0, WZ - 1.6, 2.6, 31, { lean: 0.1, yaw: 0.8, fronds: 12 }));
  P.push(...palmParts(2.5, 0, WZ - 2.2, 2.9, 32, { lean: -0.12, yaw: -0.5, fronds: 12 }));
  P.push(...palmParts(-0.1, 0, WZ - 3.2, 2.3, 33, { lean: 0.08, yaw: 2.0, fronds: 11 }));

  group.add(mesh(P));
  blobShadow(1.1, 0.45, 0.25, group, [HEAP.x, 0.02, HEAP.z - 0.05]);
  return { id: 'weather2', group, cam: [1.45, 1.02, 2.2], target: [0.62, 0.7, -0.6], fov: 50, sky: '#b8e1f3' };
}

// =====================================================================================================================
// 4. erosion2 — erosion by WIND: a strong wind (white streaks, a palm blown sideways) blows from right to left, lifts sand
//    off the sharp crest of a dune and carries it across a road; on the downwind side tongues of sand already bury part
//    of the road and the foot of the road sign. Sand MOVES from the dune to the road. No water.
// =====================================================================================================================
function erosion2() {
  const group = new THREE.Group();
  group.name = 'vignette:erosion2';
  const R = rng(4404);
  const CAM = new THREE.Vector3(-0.75, 2.05, 4.3), TARGET = new THREE.Vector3(-0.45, 0.8, -2.3);
  const ROAD = { x0: -2.35, x1: -1.05 }; // the road runs along z, left of the dune; wind blows toward -x
  // dune: crest line along z at x = crestX(z); gentle sunlit windward slope on the right, steep shaded slip face on the left
  const DUNE = { cz: -2.6, len: 3.4, h: 2.2 };
  const crestX = (z) => 0.55 - 0.3 * Math.sin((z - DUNE.cz) * 0.8) + 0.55 * ((z - DUNE.cz) / DUNE.len) ** 2;
  const duneH = (x, z) => {
    const u = (z - DUNE.cz) / DUNE.len; // -1..1 along the crest
    if (Math.abs(u) >= 1) return 0;
    const along = Math.pow(1 - Math.abs(u) ** 2.6, 0.75), hc = DUNE.h * along, d = x - crestX(z);
    const w = d > 0 ? 3.0 * (0.5 + 0.5 * along) : 1.05 * (0.55 + 0.45 * along); // windward / slip-face widths
    const k = clamp(1 - Math.abs(d) / w);
    if (d > 0) return hc * Math.pow(k, 1.35) * (0.75 + 0.25 * Math.sin(k * Math.PI / 2));
    return hc * Math.pow(k, 1.2);
  };
  // sand drift over the road: tongues spilling from the dune's foot, thinning toward the far (left) lane
  const drift = (x, z) => {
    const envZ = smooth(DUNE.cz - DUNE.len - 0.4, DUNE.cz - DUNE.len + 1.4, z) * (1 - smooth(DUNE.cz + DUNE.len - 1.6, DUNE.cz + DUNE.len + 0.2, z));
    if (envZ < 0.005) return 0;
    const lobes = 0.5 + 0.5 * Math.sin(z * 2.3 + 0.8) * Math.cos(z * 1.1 + 2.0);
    const reach = (0.35 + 0.95 * lobes) * envZ; // how far the tongue runs across the road from its right edge
    const thick = 0.13 * envZ + 0.01 * noise2(x * 6, z * 6);
    if (x > ROAD.x1 + 0.1) return thick * (1 - smooth(ROAD.x1 + 0.1, ROAD.x1 + 0.36, x));
    return thick * clamp(1 - (ROAD.x1 + 0.1 - x) / Math.max(0.05, reach)) ** 1.3;
  };
  const SAND = C('#efd29a'), SAND2 = C('#e2bc7c'), SAND_SH = C('#c8965a'), RIPPLE = C('#d8ab6a'), FAR = C('#ecd9b5');
  const ASPH = C('#7f8996'), ASPH2 = C('#6f7884'), LINE = C('#fff6d8');

  // ---- base ground (flat sand to the horizon, low far dunes)
  const base = fieldGeo(-30, 30, -40, 10, 60, 50, (x, z) => (z < -7 ? 1.1 * Math.max(0, fbm(x * 0.09 + 3, z * 0.09, 2) + 0.15) * smooth(-7, -20, z) : 0), (x, z, y, out) => {
    const n = fbm(x * 0.4 + 2, z * 0.4 + 7, 2);
    return out.copy(SAND).lerp(SAND2, clamp(0.3 + n)).lerp(FAR, smooth(-8, -30, z) * 0.7);
  });
  // ---- the dune (fine grid over its footprint): ripples on the windward side, shaded slip face, bright crest
  // the grid is aligned with the crest (columns = distance from the crest line) so the knife-edge stays crisp
  const ds = [];
  for (let i = 0; i <= 22; i++) ds.push(-1.45 * Math.pow(1 - i / 22, 1.3));
  for (let i = 1; i <= 64; i++) ds.push(3.45 * Math.pow(i / 64, 1.15));
  const nzD = 84;
  const dune = gridGeo(ds.length - 1, nzD, (i, j) => {
    const z = lerp(DUNE.cz - DUNE.len, DUNE.cz + DUNE.len, j / nzD), x = crestX(z) + ds[i];
    return [x, duneH(x, z) + 0.004, z];
  }, (x, y, z, i, j, out) => {
    const d = ds[i], n = fbm(x * 0.9, z * 0.9 + 3, 2);
    out.copy(SAND).lerp(SAND2, clamp(0.35 + n * 0.8));
    if (d > 0.1 && y > 0.05) { const rp = Math.sin(d * 24 + 0.6 * Math.sin(z * 1.9)); out.lerp(RIPPLE, 0.32 * smooth(0.55, 1, rp) * smooth(0.05, 0.3, y)); }
    if (d < 0) out.lerp(SAND_SH, 0.55 * smooth(0.0, 0.08, -d) * smooth(0.02, 0.35, y));
    if (d >= 0 && d < 0.09 && y > 0.3) out.lerp(C('#fff0c8'), 0.75);
    return out;
  });
  // ---- the road with its drift (fine strip); edge lines and dashes show only where the sand is thin
  const RZ0 = -14, RZM = -6.8, RZ1 = 2.6;
  const roadY = (x, z) => {
    const sd = drift(x, z), onRoad = x > ROAD.x0 && x < ROAD.x1;
    return (onRoad ? 0.012 : 0.006) + Math.max(0, sd - 0.012) + (x > ROAD.x1 ? Math.max(0, duneH(x, z)) : 0);
  };
  const roadColor = (x, z, y, out) => {
    const sd = drift(x, z), onRoad = x > ROAD.x0 && x < ROAD.x1;
    if (!onRoad) return out.copy(SAND).lerp(SAND2, clamp(0.4 + fbm(x, z, 2)));
    const mid = (ROAD.x0 + ROAD.x1) / 2;
    out.copy(ASPH).lerp(ASPH2, clamp(0.5 + fbm(x * 2, z * 2, 2)));
    if (Math.abs(x - ROAD.x0 - 0.06) < 0.025 || Math.abs(x - ROAD.x1 + 0.06) < 0.025) out.copy(LINE);
    if (Math.abs(x - mid) < 0.025 && ((z % 0.9) + 0.9) % 0.9 < 0.5) out.copy(LINE);
    const cover = smooth(0.012, 0.03, sd);
    out.lerp(SAND, cover).lerp(SAND2, cover * clamp(sd * 4));
    // thin sand "snakes" blowing across the far lane
    const snake = Math.sin(z * 9 + Math.sin(x * 3) * 2) * Math.sin(z * 3.7 + 1);
    if (cover < 0.5) out.lerp(SAND, 0.75 * smooth(0.82, 0.95, snake) * smooth(ROAD.x0, ROAD.x0 + 0.3, x));
    return out;
  };
  const road = fieldGeo(ROAD.x0 - 0.4, ROAD.x1 + 0.36, RZM, RZ1, 58, 190, roadY, roadColor);
  const roadFar = fieldGeo(ROAD.x0 - 0.4, ROAD.x1 + 0.36, RZ0, RZM, 22, 30, roadY, roadColor);
  const P = [{ geo: base }, { geo: dune }, { geo: road }, { geo: roadFar }];

  // ---- road sign (sand drift warning) left of the road; sand piled against its pole on the windward side
  const SG = { x: ROAD.x0 - 0.3, z: -0.4 }, SYAW = 0.3;
  P.push({ geo: cyl(0.028, 0.03, 1.3, 8), color: '#9aa4b0', pos: [SG.x, 0.65, SG.z] });
  P.push({ geo: blobGeo(0.2, { detail: 1, seed: 5, squash: 0.35, jitter: 0.1 }), color: '#e8c68b', pos: [SG.x + 0.12, 0.02, SG.z], scale: [1.4, 1, 1] });
  const signC = new THREE.Vector3(SG.x, 1.38, SG.z + 0.035);
  const tri = (r) => new THREE.CircleGeometry(r, 3, Math.PI / 2);
  const sign = [
    { geo: tri(0.36), color: '#d63b2f', pos: [0, 0, 0] },
    { geo: tri(0.27), color: '#fffaf1', pos: [0, 0, 0.012] },
    { geo: tri(0.36), color: '#9aa4b0', pos: [0, 0, -0.01], rot: [0, Math.PI, 0] },
    // pictogram: a little dune with wind lines
    { geo: new THREE.CircleGeometry(0.1, 12, 0, Math.PI), color: '#c9883e', pos: [-0.02, -0.11, 0.016], scale: [1.2, 0.8, 1] },
  ];
  for (let k = 0; k < 3; k++) sign.push({ geo: box(0.13 - k * 0.025, 0.018, 0.004), color: '#25385c', pos: [0.04 - k * 0.015, 0.0 + k * 0.045, 0.018] });
  const signMesh = mesh(sign);
  signMesh.position.copy(signC); signMesh.rotation.y = SYAW;
  group.add(signMesh);

  // ---- a palm left of the road, every frond swept downwind (-x)
  {
    const px = ROAD.x0 - 0.75, pz = -6.0, h = 2.3;
    const trunk = new THREE.CylinderGeometry(0.055, 0.09, h, 8, 12).translate(0, h / 2, 0);
    const tp = trunk.attributes.position, cl = [], c = new THREE.Color();
    for (let i = 0; i < tp.count; i++) { const yy = tp.getY(i), k = yy / h, ring = 1 + 0.12 * Math.max(0, Math.sin(yy * 40)); tp.setX(i, tp.getX(i) * ring - 0.32 * k * k); tp.setZ(i, tp.getZ(i) * ring); c.set(PAL.trunk).lerp(C(PAL.trunkDark), Math.max(0, Math.sin(yy * 40)) * 0.75); cl.push(c.r, c.g, c.b); }
    trunk.computeVertexNormals(); trunk.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    P.push({ geo: trunk, pos: [px, 0, pz] });
    const top = [px - 0.32, h, pz], L = 0.95;
    const leaf = new THREE.BoxGeometry(0.15, 0.012, L, 1, 1, 9).translate(0, 0, L / 2);
    const lp = leaf.attributes.position;
    for (let i = 0; i < lp.count; i++) { const k = lp.getZ(i) / L; lp.setX(i, lp.getX(i) * (1 - k * 0.8) * (0.6 + Math.sin(k * Math.PI) * 0.6)); lp.setY(i, lp.getY(i) + 0.1 * L * k - 0.35 * L * k * k); }
    leaf.computeVertexNormals();
    for (let i = 0; i < 11; i++) {
      const spread = (i / 10 - 0.5) * 1.5, yaw = -Math.PI / 2 + spread + (R() - 0.5) * 0.15, tilt = -0.15 + Math.abs(spread) * 0.35 + (R() - 0.5) * 0.2;
      P.push({ geo: leaf, pos: top, rot: [tilt, yaw, 0], scale: 0.85 + R() * 0.3, color: [PAL.palmLeaf, PAL.leafDark, PAL.leaf][i % 3] });
    }
    P.push({ geo: new THREE.SphereGeometry(0.08, 8, 6), pos: top, color: PAL.trunkDark, scale: [1, 0.7, 1] });
    P.push(...bushParts(px - 0.5, 0, pz + 0.7, 0.8, 60, null));
    group.add(blobShadow(0.5, 0.3, 0.25, null, [px - 0.4, 0.02, pz + 0.05]));
  }
  // small desert shrubs and stones
  for (const [x, z, sc] of [[3.4, 0.9, 0.7], [4.2, -2.6, 0.6], [-3.9, 1.6, 0.75], [1.6, 2.3, 0.6]]) P.push(...bushParts(x, -0.04, z, sc, Math.round(x * 10 + z * 3 + 50), null));
  for (let i = 0; i < 10; i++) { const x = -4 + R() * 8, z = 1 + R() * 3, sz = 0.03 + R() * 0.05; if (x > ROAD.x0 - 0.4 && x < ROAD.x1 + 0.4) continue; P.push({ geo: chunk(sz, 1600 + i, 0.6), color: '#c3b6a6', pos: [x, sz * 0.25 + Math.max(0, duneH(x, z)), z] }); }
  group.add(mesh(P));

  // ---- blowing sand: soft camera-facing puffs streaming off the crest down across the road (one transparent mesh)
  const puffPos = [], puffCol = [], puffUv = [], puffIdx = [];
  const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(), upv = new THREE.Vector3();
  const addPuff = (x, y, z, sx, sy, alpha, col) => {
    v.set(x, y, z);
    m4.lookAt(CAM, v, up); q.setFromRotationMatrix(m4);
    right.set(1, 0, 0).applyQuaternion(q); upv.set(0, 1, 0).applyQuaternion(q);
    const b = puffPos.length / 3;
    for (const [a, c2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      puffPos.push(x + right.x * a * sx + upv.x * c2 * sy, y + right.y * a * sx + upv.y * c2 * sy, z + right.z * a * sx + upv.z * c2 * sy);
      puffUv.push((a + 1) / 2, (c2 + 1) / 2);
      puffCol.push(col.r, col.g, col.b, alpha);
    }
    puffIdx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const PUFF = C('#f0cf91'), PUFF2 = C('#e2b674');
  for (let sIdx = 0; sIdx < 11; sIdx++) {
    const z0 = DUNE.cz - 2.5 + sIdx * 0.5 + (R() - 0.5) * 0.2, cx = crestX(z0), h0 = duneH(cx - 0.001, z0);
    if (h0 < 0.45) continue;
    for (let k = 0; k < 14; k++) {
      const t = k / 13, x = cx - t * (cx - (ROAD.x0 - 0.5)), y = h0 + 0.05 + 0.4 * Math.sin(t * Math.PI * 0.75) - t * t * (h0 - 0.05), z = z0 + t * 0.5 + (R() - 0.5) * 0.15;
      const size = 0.07 + t * 0.2 + R() * 0.04, alpha = (0.85 - t * 0.6) * (0.8 + R() * 0.2);
      addPuff(x, Math.max(y, 0.12), z, size * 1.8, size * 0.8, alpha, PUFF.clone().lerp(PUFF2, R()));
    }
  }
  // low drifting sand along the ground across the road
  for (let i = 0; i < 12; i++) {
    const z = DUNE.cz - 2 + R() * 3.5, x = ROAD.x0 + R() * 1.6, sz = 0.08 + R() * 0.08;
    addPuff(x, 0.05 + R() * 0.04, z, sz * 2.6, sz * 0.45, 0.3 + R() * 0.2, PUFF);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(puffPos, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(puffUv, 2));
  pg.setAttribute('color', new THREE.Float32BufferAttribute(puffCol, 4));
  pg.setIndex(puffIdx);
  const puffs = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
  puffs.renderOrder = 3;
  group.add(puffs);

  // ---- wind streaks: white tapered ribbons sweeping right → left with a curl at the end (camera-facing)
  const wPos = [], wIdx = [];
  const streak = (x0, x1, y0, z0, amp, ph, curl) => {
    const pts = [], N = 40;
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new THREE.Vector3(lerp(x0, x1, t), y0 + amp * Math.sin(t * Math.PI * 1.6 + ph), z0 + t * 0.4)); }
    const end = pts[N], dir = Math.sign(x1 - x0);
    for (let i = 1; i <= 16 * curl; i++) { const a = (i / 16) * TAU * 0.85, r = 0.15 * (1 - i / 22); pts.push(new THREE.Vector3(end.x + dir * (Math.sin(a) * r + 0.03), end.y + (1 - Math.cos(a)) * r, end.z)); }
    const b = wPos.length / 3, n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], t = i / (n - 1), w = 0.026 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.004;
      const tan = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
      const view = CAM.clone().sub(p).normalize(), off = tan.clone().cross(view).normalize().multiplyScalar(w);
      wPos.push(p.x + off.x, p.y + off.y, p.z + off.z, p.x - off.x, p.y - off.y, p.z - off.z);
      if (i < n - 1) wIdx.push(b + i * 2, b + i * 2 + 1, b + i * 2 + 2, b + i * 2 + 1, b + i * 2 + 3, b + i * 2 + 2);
    }
  };
  streak(4.2, 0.6, 2.75, -1.6, 0.12, 0.3, 1);
  streak(3.0, -1.2, 2.35, -0.2, 0.1, 1.6, 1);
  streak(0.4, -3.4, 0.75, -1.2, 0.07, 2.4, 1);
  streak(4.6, 1.8, 1.25, 1.4, 0.08, 0.9, 0);
  streak(-0.6, -4.2, 2.6, -2.6, 0.1, 0.0, 1);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
  wg.setIndex(wIdx);
  const wind = new THREE.Mesh(wg, basic('#ffffff', { side: THREE.DoubleSide, opacity: 0.9 }));
  wind.renderOrder = 4;
  group.add(wind);

  return { id: 'erosion2', group, cam: CAM.toArray(), target: TARGET.toArray(), fov: 50, sky: '#a9d8ef' };
}

// =====================================================================================================================
// 5. human2 — people change the land: Bahraini land reclamation. A dump truck tips sand into the sea at the end of a new,
//    straight-edged strip of land (rock-armoured sides, sandy water around the tip); on the new land a tower crane lifts
//    blocks onto a house being built, an excavator digs a foundation hole beside its dirt pile, and a fresh road leads
//    out to the work. The old shore with palms and houses is on the right. Machines and buildings, no people.
// =====================================================================================================================
function human2() {
  const group = new THREE.Group();
  group.name = 'vignette:human2';
  const R = rng(5505);
  const TOP = 0.22, FLOOR = -0.45; // land top / sea floor (sea level y = 0)
  const NEW = { x0: -2.64, x1: 1.2, z0: -1.68, z1: 1.04 }; // reclaimed strip (its tip at x0 is still being filled)
  const coast = (z) => 1.3 + 0.28 * Math.sin(z * 0.8 + 0.4) + 0.12 * Math.sin(z * 2.1);
  const PIT = { x0: -0.48, x1: 0.4, z0: 0.0, z1: 0.56, d: 0.3 };
  const ROADZ = [0.62, 0.98];
  const tipEdge = (z) => NEW.x0 + 0.1 * Math.sin(z * 5.1) + 0.06 * Math.sin(z * 11.3); // ragged, still-filling tip
  const landH = (x, z) => {
    let h = FLOOR;
    // old shore: a beach rising to the old land
    const c = coast(z);
    h = Math.max(h, lerp(FLOOR, TOP, smooth(c - 0.9, c + 0.35, x)));
    // new land: flat, with steep armoured sides; a gentle sandy slope at the tip where trucks dump
    if (x > NEW.x0 - 0.6 && x < c + 0.5) {
      const side = Math.min(z - NEW.z0, NEW.z1 - z);
      const tip = x - tipEdge(z);
      const k = Math.min(smooth(-0.12, 0.02, side), smooth(-0.2, 0.04, tip));
      h = Math.max(h, lerp(FLOOR, TOP, k));
    }
    if (x > PIT.x0 && x < PIT.x1 && z > PIT.z0 && z < PIT.z1) h = TOP - PIT.d; // foundation hole
    return h;
  };
  const SAND = C('#f4dfb2'), SAND_OLD = C('#e6cb93'), WET = C('#cdb385'), SOIL = C('#b88a5e'), SOIL_D = C('#8f6544');
  const GRASS = C(PAL.grass), GRASS_D = C(PAL.grassDark), ROADC = C('#6f7884'), LINE = C('#fff6d8');
  const groundColor = (x, z, y, out) => {
    const n = fbm(x * 0.9 + 1, z * 0.9 + 5, 3), c = coast(z);
    const onNew = x < c + 0.2 && z > NEW.z0 - 0.05 && z < NEW.z1 + 0.05;
    if (y < 0.02) out.copy(WET).lerp(C('#bfa77a'), clamp(-y * 3));
    else if (onNew) out.copy(SAND).lerp(C('#ead2a0'), clamp(0.4 + n)); // fresh bright fill
    else { out.copy(SAND_OLD).lerp(C(PAL.sandDark), clamp(0.4 + n)); const g = smooth(c + 0.5, c + 1.0, x) * clamp(0.6 + fbm(x * 0.7, z * 0.7 + 9, 2) * 2); out.lerp(GRASS, g * 0.85).lerp(GRASS_D, g * clamp(n + 0.3) * 0.5); }
    if (x > PIT.x0 - 0.02 && x < PIT.x1 + 0.02 && z > PIT.z0 - 0.02 && z < PIT.z1 + 0.02) out.copy(y < TOP - 0.05 ? SOIL_D : SOIL);
    if (onNew && z > ROADZ[0] && z < ROADZ[1] && x > NEW.x0 + 0.5 && y > TOP - 0.01) {
      out.copy(ROADC).lerp(C('#7f8996'), clamp(0.5 + n));
      if (Math.abs(z - (ROADZ[0] + ROADZ[1]) / 2) < 0.018 && ((x % 0.5) + 0.5) % 0.5 < 0.28) out.copy(LINE);
    }
    // tyre tracks in the fresh sand toward the tip
    if (onNew && x < NEW.x0 + 0.7 && Math.abs(Math.abs(z - 0.62) - 0.2) < 0.03) out.multiplyScalar(0.9);
    return out;
  };
  // fine grid over the work area (edges aligned to the strip), coarse ground/sea floor around
  const near = fieldGeo(-3.6, 4.4, -3.0, 2.2, 128, 83, landH, groundColor);
  const far = fieldGeo(-30, 30, -40, 12, 30, 26, (x, z) => (x > 4.4 && z > -3 ? landH(x, z) : x > 3.0 ? landH(x, z) - 0.02 : FLOOR - 0.05), (x, z, y, out) => groundColor(x, z, y, out));
  const P = [{ geo: near }, { geo: far }];

  // ---- the sea: turquoise, paler in the shallows, sandy-brown murk spreading from the tip where the sand goes in
  const SEA = C('#7fd0e6'), DEEP = C('#4fa9cf'), SHALLOW = C('#a8e4f5'), MURK = C('#bccf9c');
  const DUMP = { x: NEW.x0 - 0.15, z: 0.35 };
  const sea = fieldGeo(-40, 6, -46, 14, 92, 60, () => 0, (x, z, y, out) => {
    const depthSh = landH(x, z);
    out.copy(SEA).lerp(DEEP, smooth(2, 18, Math.hypot(x + 1, z + 1)));
    out.lerp(SHALLOW, smooth(-0.35, 0.0, depthSh) * 0.8);
    const md = Math.hypot((x - DUMP.x) * 0.8, (z - DUMP.z) * 1.1) + 0.25 * fbm(x * 2, z * 2, 2);
    out.lerp(MURK, 0.72 * (1 - smooth(0.2, 1.7, md)));
    const ring = Math.abs(Math.hypot((x - DUMP.x + 0.3) * 1.0, (z - DUMP.z) * 0.9) - 0.62 - 0.05 * noise2(x * 8, z * 8));
    out.lerp(C('#f4fbff'), 0.75 * (1 - smooth(0.0, 0.04, ring)) * (x < DUMP.x ? 1 : 0));
    return out;
  });
  P.push({ geo: sea, pos: [0, 0.0, 0] });

  // ---- rock armour along the straight sides of the new land
  for (const zEdge of [NEW.z0, NEW.z1]) {
    for (let x = NEW.x0 + 0.35; x < coast(zEdge) - 0.3; x += 0.13 + R() * 0.05) {
      const sz = 0.07 + R() * 0.05, out = zEdge === NEW.z0 ? -1 : 1;
      P.push({ geo: chunk(sz, 2000 + Math.round(x * 100) + (out > 0 ? 7 : 0), 0.75), color: mix('#a9a39b', '#8f8a84', R()), pos: [x, TOP - 0.13 + R() * 0.06, zEdge + out * (0.06 + R() * 0.06)], rot: [R(), R() * 3, R()] });
    }
  }

  // ---- dump truck at the tip, bed tipped up, sand pouring into the sea
  {
    const T = new THREE.Group();
    const O = PAL.orange, OD = PAL.orangeDark, DARK = '#3b4048', BED = '#9aa4b0';
    const tp = [
      { geo: box(0.95, 0.07, 0.34), color: DARK, pos: [0, 0.14, 0] },
      { geo: roundedBox(0.3, 0.3, 0.44, 0.07, 3), color: O, pos: [0.33, 0.33, 0] },
      { geo: roundedBox(0.14, 0.13, 0.445, 0.03, 2), color: PAL.window, pos: [0.36, 0.4, 0] },
      { geo: box(0.02, 0.12, 0.33), color: PAL.window, pos: [0.483, 0.4, 0] },
      { geo: roundedBox(0.08, 0.05, 0.42, 0.02, 2), color: '#e9edf1', pos: [0.5, 0.18, 0] },
      { geo: ball(0.025, 8, 6), color: '#fff3c4', pos: [0.48, 0.27, 0.16] },
      { geo: ball(0.025, 8, 6), color: '#fff3c4', pos: [0.48, 0.27, -0.16] },
      { geo: cyl(0.02, 0.02, 0.36, 8), color: '#c3c9d1', pos: [-0.05, 0.36, 0.12], rot: [0, 0, -0.75] }, // hydraulic ram
    ];
    for (const x of [0.31, -0.12, -0.33]) for (const sd of [-1, 1]) {
      tp.push({ geo: cyl(0.1, 0.1, 0.08, 16), color: DARK, pos: [x, 0.1, sd * 0.2], rot: AX_Z });
      tp.push({ geo: cyl(0.045, 0.045, 0.085, 10), color: '#d9dde3', pos: [x, 0.1, sd * 0.2], rot: AX_Z });
    }
    T.add(mesh(tp));
    // tipper bed hinged at the back axle, tipped ~42° toward the sea (-x)
    const bed = new THREE.Group();
    bed.position.set(-0.47, 0.2, 0);
    bed.rotation.z = 0.73;
    const bp = [
      { geo: box(0.64, 0.04, 0.48), color: '#86909c', pos: [0.32, 0.02, 0] },
      { geo: box(0.04, 0.28, 0.48), color: OD, pos: [0.63, 0.16, 0] },
      { geo: box(0.64, 0.2, 0.035), color: BED, pos: [0.32, 0.12, 0.225] },
      { geo: box(0.64, 0.2, 0.035), color: BED, pos: [0.32, 0.12, -0.225] },
      { geo: box(0.64, 0.025, 0.045), color: '#86909c', pos: [0.32, 0.22, 0.225] },
      { geo: box(0.64, 0.025, 0.045), color: '#86909c', pos: [0.32, 0.22, -0.225] },
      { geo: box(0.03, 0.22, 0.44), color: BED, pos: [-0.073, 0.158, 0], rot: [0, 0, -0.73] }, // tailgate hanging open
      { geo: puff(0.2, 2101, { detail: 2, squash: 0.55 }), color: '#e9cf9c', pos: [0.4, 0.12, 0], scale: [1.2, 1, 0.9] },
      { geo: puff(0.13, 2102, { detail: 2, squash: 0.6 }), color: '#efd6a4', pos: [0.1, 0.08, 0] },
    ];
    bed.add(mesh(bp));
    T.add(bed);
    T.position.set(NEW.x0 + 0.6, TOP, DUMP.z);
    T.scale.setScalar(1.25);
    group.add(T);
    group.add(blobShadow(0.78, 0.42, 0.3, null, [NEW.x0 + 0.62, TOP + 0.01, DUMP.z]));
    T.updateMatrixWorld(true);
    const lipW = bed.localToWorld(new THREE.Vector3(0.0, 0.07, 0));
    // the falling sand: a thick lumpy stream from the bed's open back, over the bank into the water, piling up a mound
    const endX = NEW.x0 - 0.42, pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(lerp(lipW.x + 0.03, endX, 1 - (1 - t) ** 1.7), lerp(lipW.y + 0.02, -0.02, t * t), DUMP.z)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.075, 9, false);
    { // lumpy, thicker toward the bottom where the sand spreads
      const tp2 = tube.attributes.position, nrm = tube.attributes.normal, v3 = new THREE.Vector3();
      for (let i = 0; i < tp2.count; i++) {
        const seg = Math.floor(i / 10) / 28;
        v3.fromBufferAttribute(nrm, i).multiplyScalar((0.75 + 0.6 * seg) * 0.075 * (0.25 * noise2(i * 0.37, seg * 9)) + 0.075 * 0.5 * seg);
        tp2.setXYZ(i, tp2.getX(i) + v3.x, tp2.getY(i) + v3.y, tp2.getZ(i) + v3.z);
      }
      tube.deleteAttribute('uv');
      tube.computeVertexNormals();
    }
    P.push({ geo: tube, color: '#ecd29c' });
    for (let i = 0; i < 7; i++) { const t = (i + 0.5) / 7, p = pts[Math.round(t * 8)]; P.push({ geo: puff(0.05 + t * 0.03, 2110 + i, { detail: 1, jitter: 0.2 }), color: '#f2dcab', pos: [p.x + (R() - 0.5) * 0.08, p.y, p.z + (R() - 0.5) * 0.12] }); }
    // a frothy splash where the sand hits the water
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = 0.13 + R() * 0.1; P.push({ geo: ball(0.022 + R() * 0.02, 6, 5), color: '#f4fbff', pos: [endX + Math.cos(a) * r, 0.015 + R() * 0.03, DUMP.z + Math.sin(a) * r * 1.2] }); }
    P.push({ geo: new THREE.RingGeometry(0.12, 0.2, 18).rotateX(-Math.PI / 2), color: '#f4fbff', pos: [endX, 0.006, DUMP.z] });
  }

  // ---- excavator at the foundation hole, bucket down in the pit, and its dirt pile
  {
    const Y = PAL.machine, YD = PAL.machineDark, TRK = '#4a4f58', STEEL = '#a3abb5', DARK = '#3b4048';
    const ex = [];
    for (const sd of [-1, 1]) {
      ex.push({ geo: roundedBox(0.62, 0.13, 0.11, 0.06, 2), color: TRK, pos: [0, 0.065, sd * 0.17] });
      for (const x of [-0.2, 0, 0.2]) ex.push({ geo: cyl(0.032, 0.032, 0.02, 10), color: STEEL, pos: [x, 0.055, sd * 0.23], rot: AX_Z });
    }
    ex.push({ geo: box(0.4, 0.07, 0.24), color: DARK, pos: [0, 0.1, 0] });
    ex.push({ geo: roundedBox(0.58, 0.08, 0.44, 0.03, 2), color: YD, pos: [-0.04, 0.17, 0] });
    ex.push({ geo: roundedBox(0.27, 0.18, 0.42, 0.05, 2), color: Y, pos: [-0.17, 0.3, 0] });
    ex.push({ geo: roundedBox(0.25, 0.13, 0.22, 0.03, 2), color: Y, pos: [0.08, 0.27, -0.1] });
    ex.push({ geo: box(0.24, 0.17, 0.2), color: PAL.window, pos: [0.08, 0.42, -0.1] });
    ex.push({ geo: roundedBox(0.29, 0.03, 0.25, 0.012, 1), color: '#fff7e8', pos: [0.08, 0.52, -0.1] });
    ex.push({ geo: cyl(0.015, 0.015, 0.14, 6), color: DARK, pos: [-0.25, 0.46, 0.12] });
    ex.push({ geo: ball(0.025, 8, 6), color: '#ff9a2e', pos: [-0.02, 0.55, -0.18] });
    // boom (up and out over the pit), stick (down into it), bucket
    const seg = (x0, y0, x1, y1, t, w, col) => { const L = Math.hypot(x1 - x0, y1 - y0); ex.push({ geo: roundedBox(L, t, w, 0.025, 1), color: col, pos: [(x0 + x1) / 2, (y0 + y1) / 2, 0.08], rot: [0, 0, Math.atan2(y1 - y0, x1 - x0)] }); };
    seg(0.12, 0.28, 0.42, 0.62, 0.075, 0.08, Y);
    seg(0.42, 0.62, 0.72, 0.5, 0.07, 0.075, Y);
    seg(0.72, 0.5, 0.78, 0.02, 0.06, 0.065, YD);
    ex.push({ geo: new THREE.CylinderGeometry(0.075, 0.075, 0.17, 12, 1, false, 0, Math.PI * 1.2), color: '#6d7480', pos: [0.82, -0.02, 0.08], rot: [Math.PI / 2, 0, 0.6] });
    ex.push({ geo: puff(0.07, 2201, { detail: 1, squash: 0.7 }), color: SOIL.getStyle(), pos: [0.84, 0.03, 0.08] });
    const E = mesh(ex);
    E.position.set(PIT.x1 + 0.42, TOP, (PIT.z0 + PIT.z1) / 2 - 0.08);
    E.rotation.y = Math.PI;
    group.add(E);
    group.add(blobShadow(0.42, 0.3, 0.3, null, [PIT.x1 + 0.42, TOP + 0.01, (PIT.z0 + PIT.z1) / 2 - 0.08]));
    // dirt pile dug out of the hole
    P.push({ geo: puff(0.3, 2210, { detail: 2, squash: 0.5, jitter: 0.18 }), color: '#b88a5e', pos: [0.15, TOP, -0.38], scale: [1.3, 1, 1] });
    P.push({ geo: puff(0.18, 2211, { detail: 2, squash: 0.6, jitter: 0.2 }), color: '#a87a4f', pos: [-0.12, TOP + 0.05, -0.33] });
    for (let i = 0; i < 8; i++) P.push({ geo: chunk(0.03 + R() * 0.03, 2220 + i, 0.6), color: '#8f6544', pos: [-0.3 + R() * 0.8, TOP + 0.01, -0.15 - R() * 0.4] });
    // formwork boards and rebar around the hole
    for (const [x, z, w, d] of [[(PIT.x0 + PIT.x1) / 2, PIT.z0 - 0.02, PIT.x1 - PIT.x0 + 0.06, 0.025], [(PIT.x0 + PIT.x1) / 2, PIT.z1 + 0.02, PIT.x1 - PIT.x0 + 0.06, 0.025], [PIT.x0 - 0.02, (PIT.z0 + PIT.z1) / 2, 0.025, PIT.z1 - PIT.z0 + 0.06]]) P.push({ geo: box(w, 0.05, d), color: '#d39a66', pos: [x, TOP + 0.02, z] });
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) P.push({ geo: cyl(0.006, 0.006, 0.36, 4), color: '#8a5a3c', pos: [PIT.x0 + 0.12 + i * 0.2, TOP - PIT.d + 0.18, PIT.z0 + 0.15 + k * 0.26] });
  }

  // ---- house being built (concrete frame, block walls going up, scaffold) + a pallet of blocks
  const HB = { x: -1.2, z: -0.95, w: 1.15, d: 0.85, h: 0.5 };
  {
    const CON = '#c9ccd1', CON_D = '#aeb3ba', BLOCK = '#d7d9dc';
    const hp = [];
    hp.push({ geo: box(HB.w + 0.1, 0.06, HB.d + 0.1), color: CON_D, pos: [0, 0.03, 0] });
    const cols = [];
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) cols.push([sx * HB.w / 2, sz * HB.d / 2]);
    for (const [x, z] of cols) hp.push({ geo: box(0.07, HB.h, 0.07), color: CON, pos: [x, 0.06 + HB.h / 2, z] });
    hp.push({ geo: box(HB.w + 0.12, 0.06, HB.d + 0.12), color: CON, pos: [0, 0.09 + HB.h, 0] });
    // upper floor: columns only, with rebar sticking up
    for (const [x, z] of cols) {
      hp.push({ geo: box(0.07, 0.22, 0.07), color: CON, pos: [x, 0.12 + HB.h + 0.11, z] });
      for (const o of [-0.02, 0.02]) hp.push({ geo: cyl(0.005, 0.005, 0.14, 4), color: '#8a5a3c', pos: [x + o, 0.12 + HB.h + 0.29, z + o] });
    }
    // block walls: the back and left walls done, the front wall half way, a door gap
    const course = 0.07, bl = 0.15;
    const wall = (x0, z0, x1, z1, courses, gap = null) => {
      const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
      for (let c = 0; c < courses; c++) for (let u = (c % 2) * bl / 2; u < L - 0.02; u += bl) {
        const len = Math.min(bl - 0.012, L - u - 0.012);
        if (len < 0.03) continue;
        const um = u + len / 2;
        if (gap && um > gap[0] && um < gap[1]) continue;
        hp.push({ geo: box(len, course - 0.01, 0.07), color: c % 3 === 2 ? '#cfd2d6' : BLOCK, pos: [x0 + Math.cos(ang) * um, 0.06 + course / 2 + c * course, z0 + Math.sin(ang) * um], rot: [0, -ang, 0] });
      }
    };
    wall(-HB.w / 2, -HB.d / 2, HB.w / 2, -HB.d / 2, 7);
    wall(-HB.w / 2, -HB.d / 2, -HB.w / 2, HB.d / 2, 6);
    wall(-HB.w / 2, HB.d / 2, HB.w / 2, HB.d / 2, 3, [0.45, 0.7]);
    // scaffold on the right side
    for (const z of [-HB.d / 2, 0, HB.d / 2]) for (const dx of [0.12, 0.3]) hp.push({ geo: cyl(0.01, 0.01, 0.82, 5), color: '#5f6670', pos: [HB.w / 2 + dx, 0.06 + 0.41, z] });
    for (const y of [0.3, 0.62]) {
      hp.push({ geo: box(0.24, 0.02, HB.d + 0.06), color: '#d39a66', pos: [HB.w / 2 + 0.21, y, 0] });
      for (const dx of [0.12, 0.3]) hp.push({ geo: cyl(0.008, 0.008, HB.d, 5), color: '#5f6670', pos: [HB.w / 2 + dx, y + 0.12, 0], rot: AX_Z });
    }
    // a pallet of blocks waiting
    hp.push({ geo: box(0.3, 0.04, 0.26), color: '#c98d5a', pos: [-0.2, 0.02, HB.d / 2 + 0.4] });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) hp.push({ geo: box(0.13, 0.065, 0.11), color: BLOCK, pos: [-0.27 + i * 0.07 + (k ? 0.035 : 0), 0.08 + j * 0.068, HB.d / 2 + 0.34 + k * 0.12] });
    const H = mesh(hp);
    H.position.set(HB.x, TOP, HB.z);
    group.add(H);
    group.add(blobShadow(0.75, 0.6, 0.25, null, [HB.x, TOP + 0.01, HB.z]));
  }

  // ---- tower crane: yellow lattice mast, long jib reaching over the new house, counterweights, hook with a load
  {
    const CR = { x: 0.35, z: -1.35, h: 2.55 }, Y = '#ffc22e', YD = '#e0a21c';
    const cp = [];
    const m = 0.15; // mast half-size
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cp.push({ geo: box(0.03, CR.h, 0.03), color: Y, pos: [sx * m, CR.h / 2, sz * m] });
    for (let y = 0.0; y < CR.h - 0.1; y += 0.3) {
      for (const [ax, az, rot] of [[0, -m, [0, 0, 0.78]], [0, m, [0, 0, 0.78]], [-m, 0, [0.78, Math.PI / 2, 0]], [m, 0, [0.78, Math.PI / 2, 0]]]) cp.push({ geo: box(0.4, 0.016, 0.016), color: YD, pos: [ax, y + 0.15, az], rot });
      cp.push({ geo: box(0.32, 0.02, 0.02), color: Y, pos: [0, y, -m] }, { geo: box(0.32, 0.02, 0.02), color: Y, pos: [0, y, m] });
    }
    cp.push({ geo: box(0.5, 0.08, 0.5), color: '#9aa4b0', pos: [0, 0.04, 0] });
    // slewing unit + cab
    cp.push({ geo: box(0.36, 0.1, 0.36), color: YD, pos: [0, CR.h + 0.05, 0] });
    cp.push({ geo: roundedBox(0.2, 0.18, 0.2, 0.03, 2), color: '#fff7e8', pos: [-0.06, CR.h - 0.05, 0.22] });
    cp.push({ geo: box(0.16, 0.1, 0.012), color: PAL.window, pos: [-0.06, CR.h - 0.03, 0.326] });
    // jib toward -x (over the house), counter-jib toward +x with concrete counterweights
    const JL = 2.25, CJ = 0.8, jy = CR.h + 0.16;
    for (const sz of [-1, 1]) cp.push({ geo: box(JL, 0.03, 0.03), color: Y, pos: [-JL / 2, jy, sz * 0.09] });
    cp.push({ geo: box(JL, 0.03, 0.03), color: Y, pos: [-JL / 2, jy + 0.16, 0] });
    for (let x = 0; x < JL - 0.05; x += 0.18) for (const sz of [-1, 1]) cp.push({ geo: box(0.02, 0.2, 0.02), color: YD, pos: [-x - 0.09, jy + 0.08, sz * 0.045], rot: [sz * 0.5, 0, 0.6] });
    for (const sz of [-1, 1]) cp.push({ geo: box(CJ, 0.04, 0.03), color: Y, pos: [CJ / 2, jy, sz * 0.09] });
    cp.push({ geo: box(0.2, 0.2, 0.22), color: '#c9ccd1', pos: [CJ - 0.12, jy - 0.08, 0] });
    cp.push({ geo: box(0.2, 0.2, 0.22), color: '#b9bdc4', pos: [CJ - 0.33, jy - 0.08, 0] });
    // apex and tie bars
    cp.push({ geo: box(0.05, 0.5, 0.05), color: Y, pos: [0, jy + 0.25, 0] });
    const tie = (x0, y0, x1, y1) => { const L = Math.hypot(x1 - x0, y1 - y0); cp.push({ geo: cyl(0.008, 0.008, L, 4), color: '#5f6670', pos: [(x0 + x1) / 2, (y0 + y1) / 2, 0], rot: [0, 0, Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2] }); };
    tie(0, jy + 0.5, -JL * 0.7, jy + 0.17);
    tie(0, jy + 0.5, CJ - 0.1, jy + 0.03);
    // trolley, cable and hook carrying a pallet of blocks over the house
    const hx = -(CR.x - HB.x) - 0.05, hy = TOP + HB.h + 0.75;
    cp.push({ geo: box(0.1, 0.05, 0.16), color: '#5f6670', pos: [hx, jy - 0.035, 0] });
    cp.push({ geo: cyl(0.005, 0.005, jy - hy - 0.06, 4), color: '#3b4048', pos: [hx, (jy + hy) / 2, 0] });
    cp.push({ geo: box(0.06, 0.05, 0.06), color: '#d63b2f', pos: [hx, hy + 0.02, 0] });
    cp.push({ geo: box(0.28, 0.035, 0.24), color: '#c98d5a', pos: [hx, hy - 0.1, 0] });
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) cp.push({ geo: box(0.12, 0.065, 0.1), color: '#d7d9dc', pos: [hx - 0.065 + i * 0.13, hy - 0.05, -0.055 + k * 0.11] });
    const crane = mesh(cp);
    crane.position.set(CR.x, TOP, CR.z);
    group.add(crane);
  }

  // ---- old shore on the right: palms, a Bahraini house, bushes; a finished new house on the new land
  const house = (x, z, w, d, h, wall, door, shutter, yaw = 0) => {
    const hp = [];
    hp.push({ geo: roundedBox(w, h, d, 0.02, 1), color: wall, pos: [0, h / 2, 0] });
    hp.push({ geo: box(w + 0.04, 0.03, d + 0.04), color: '#ecd5b4', pos: [0, h + 0.015, 0] });
    for (let u = -w / 2 + 0.04; u <= w / 2; u += 0.09) for (const sz of [-1, 1]) hp.push({ geo: box(0.045, 0.06, 0.03), color: wall, pos: [u, h + 0.06, sz * (d / 2 + 0.005)] });
    for (let u = -d / 2 + 0.04; u <= d / 2; u += 0.09) for (const sx of [-1, 1]) hp.push({ geo: box(0.03, 0.06, 0.045), color: wall, pos: [sx * (w / 2 + 0.005), h + 0.06, u] });
    hp.push({ geo: box(0.15, 0.25, 0.02), color: door, pos: [0, 0.125, d / 2 + 0.005] });
    for (const sx of [-1, 1]) { hp.push({ geo: box(0.12, 0.13, 0.02), color: PAL.window, pos: [sx * w * 0.3, h * 0.55, d / 2 + 0.005] }); hp.push({ geo: box(0.04, 0.15, 0.025), color: shutter, pos: [sx * w * 0.3 - 0.085, h * 0.55, d / 2 + 0.006] }); hp.push({ geo: box(0.04, 0.15, 0.025), color: shutter, pos: [sx * w * 0.3 + 0.085, h * 0.55, d / 2 + 0.006] }); }
    const g = mesh(hp);
    g.position.set(x, TOP, z); g.rotation.y = yaw;
    group.add(g);
    group.add(blobShadow(w * 0.75, d * 0.75, 0.22, null, [x, TOP + 0.01, z]));
  };
  house(2.75, -1.75, 0.9, 0.7, 0.62, PAL.wallA, '#a8714f', '#3f8fb5', -0.2);
  house(3.75, -0.55, 0.8, 0.7, 0.55, PAL.wallB, '#4f8fc0', '#e0805f', -0.35);
  house(-2.0, -1.1, 0.75, 0.6, 0.52, PAL.wallC, '#3f9a7c', '#d9a13a', 0.0); // new house already finished on the new land
  P.push(...palmParts(2.2, TOP, -2.45, 1.6, 81, { lean: 0.12, yaw: 0.5, fronds: 11, scale: 0.85 }));
  P.push(...palmParts(3.3, TOP, -2.6, 1.85, 82, { lean: -0.1, yaw: 2.4, fronds: 11, scale: 0.9 }));
  P.push(...palmParts(4.3, TOP, 0.6, 1.5, 83, { lean: 0.1, yaw: 1.4, fronds: 10, scale: 0.8 }));
  P.push(...bushParts(2.6, TOP, 0.4, 0.7, 88));
  P.push(...bushParts(1.9, TOP, -1.95, 0.6, 89, ['#f7a1b5']));
  // traffic cones and a barrier at the end of the new road
  for (const [x, z] of [[NEW.x0 + 1.25, 0.66], [NEW.x0 + 1.25, 0.94], [-0.95, 1.0], [-0.55, 1.0]]) {
    P.push({ geo: cyl(0.0, 0.05, 0.16, 10), color: '#ff7a33', pos: [x, TOP + 0.09, z] });
    P.push({ geo: cyl(0.032, 0.04, 0.03, 10), color: '#ffffff', pos: [x, TOP + 0.1, z] });
    P.push({ geo: box(0.12, 0.015, 0.12), color: '#ff7a33', pos: [x, TOP + 0.008, z] });
  }
  group.add(mesh(P));

  return { id: 'human2', group, cam: [2.35, 3.55, 5.0], target: [-0.7, 0.75, -0.55], fov: 50, sky: '#bfe6f6' };
}

// ---------------------------------------------------------------- API
const BUILDERS = { quake2, volcano2, weather2, erosion2, human2 };
/** Ids of the five quiz vignettes, in quiz order. */
export const VIGNETTE_IDS = Object.keys(BUILDERS);
/** Build one vignette by id (lets the caller spread the work over several frames). */
export function buildVignette(id) {
  const b = BUILDERS[id];
  if (!b) throw new Error('unknown vignette ' + id);
  return b();
}
/** The five quiz vignettes (fresh objects on every call; the caller renders and disposes them). */
export function buildVignettes() {
  return VIGNETTE_IDS.map(buildVignette);
}
