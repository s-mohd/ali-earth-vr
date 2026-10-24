// Far scenery: Bahraini houses with a wind tower (barjeel), distant low islands (one with a fort), and a dhow.
import { THREE, PAL, rng, blobGeo, vcMat } from '../core/kit.js';
import { Batch, SEA_Y, smoothGeo } from './env_util.js';
import { heightAt } from './env_terrain.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const TAU = Math.PI * 2;

/** Local-frame helper: (lx, ly, lz) in a footprint rotated by yaw around (x, z) → world. */
function frame(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { p: (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c], yaw };
}
function box(B, F, lx, ly, lz, sx, sy, sz, color, grad) {
  B.add(BOX, { pos: F.p(lx, ly, lz), rot: [0, F.yaw, 0], scale: [sx, sy, sz], ...(grad ? { grad } : { color }) });
}
/** Crenellations along a rectangle's edges (Bahraini stepped parapet). */
function merlons(B, F, cx, y, cz, w, d, color, step = 0.55) {
  for (const [ax, az, len, alongX] of [[cx, cz - d / 2, w, true], [cx, cz + d / 2, w, true], [cx - w / 2, cz, d, false], [cx + w / 2, cz, d, false]]) {
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i * len) / n, lx = alongX ? ax + t : ax, lz = alongX ? az : az + t;
      box(B, F, lx, y + 0.15, lz, 0.22, 0.3, 0.22, color);
    }
  }
}

/** A flat-roofed Bahraini house (door, windows, parapet), optionally a second storey and a barjeel wind tower. */
export function addHouse(B, x, z, yaw, { w = 4.6, d = 4, h = 3, wall = PAL.wallA, upper = false, tower = false } = {}) {
  const F = frame(x, z, yaw), y0 = Math.min(heightAt(x - w / 2, z), heightAt(x + w / 2, z), heightAt(x, z - d / 2), heightAt(x, z + d / 2)) - 0.4;
  const top = y0 + 0.4 + h, base = new THREE.Color(wall).multiplyScalar(0.86).getStyle();
  const H = top - y0, foot = new THREE.Color(wall).multiplyScalar(0.74).getStyle();
  box(B, F, 0, (y0 + top) / 2, 0, w, H, d, null, [foot, wall, -0.5 + 0.35 / H, -0.5 + 1.5 / H]); // darker where the wall meets the sand
  box(B, F, 0, top + 0.05, 0, w + 0.12, 0.12, d + 0.12, PAL.parapet);
  merlons(B, F, 0, top + 0.1, 0, w, d, wall);
  // door with a lintel, windows with wooden frames
  box(B, F, 0, y0 + 0.4 + 0.85, d / 2 + 0.02, 0.95, 1.7, 0.08, PAL.door);
  box(B, F, 0, y0 + 0.4 + 1.78, d / 2 + 0.04, 1.2, 0.16, 0.1, '#e7c99e');
  for (const sx of [-1, 1]) {
    box(B, F, sx * w * 0.3, y0 + 0.4 + h * 0.55, d / 2 + 0.03, 0.66, 0.78, 0.06, '#c69a6c');
    box(B, F, sx * w * 0.3, y0 + 0.4 + h * 0.55, d / 2 + 0.05, 0.5, 0.62, 0.06, '#4f8fa8');
    box(B, F, w / 2 + 0.03, y0 + 0.4 + h * 0.55, sx * d * 0.22, 0.06, 0.6, 0.48, '#4f8fa8');
  }
  if (upper) {
    const uw = w * 0.5, ud = d * 0.55, ux = -w * 0.22, uz = -d * 0.18;
    box(B, F, ux, top + h * 0.38, uz, uw, h * 0.76, ud, null, [base, wall]);
    box(B, F, ux, top + h * 0.76 + 0.05, uz, uw + 0.1, 0.1, ud + 0.1, PAL.parapet);
    merlons(B, F, ux, top + h * 0.76 + 0.1, uz, uw, ud, wall, 0.5);
    box(B, F, ux, top + h * 0.42, uz + ud / 2 + 0.03, 0.5, 0.62, 0.06, '#4f8fa8');
  }
  if (tower) {
    const tw = 1.35, th = 3.4, tx = w * 0.27, tz = -d * 0.2;
    box(B, F, tx, top + th / 2, tz, tw, th, tw, null, [base, '#fbf0dc']);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2, nx = Math.sin(a), nz = Math.cos(a);
      for (let j = -1; j <= 1; j++) {
        const along = j * 0.38;
        box(B, F, tx + nx * (tw / 2 + 0.01) + nz * along, top + th - 0.85, tz + nz * (tw / 2 + 0.01) - nx * along, nz ? 0.2 : 0.04, 1.2, nz ? 0.04 : 0.2, '#6b4a33');
      }
    }
    box(B, F, tx, top + th + 0.06, tz, tw + 0.14, 0.12, tw + 0.14, PAL.parapet);
    merlons(B, F, tx, top + th + 0.1, tz, tw, tw, '#fbf0dc', 0.45);
  }
}

/** A tiny palm for distant islands (a dozen triangles). */
function tinyPalm(B, x, y, z, h, R) {
  B.add(new THREE.CylinderGeometry(0.12, 0.2, h, 5, 1, true), { pos: [x, y + h / 2, z], rot: [0, 0, (R() - 0.5) * 0.3], color: PAL.trunk });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + R(), c = Math.cos(a), s = Math.sin(a), L = h * 0.5;
    B.tri([x, y + h, z], [x + c * L - s * 0.35, y + h - L * 0.35, z + s * L + c * 0.35], [x + c * L + s * 0.35, y + h - L * 0.35, z + s * L - c * 0.35], [PAL.palmLeaf, PAL.leafLight, PAL.leafLight]);
  }
}

/** Low sandy islands on the horizon; one carries a small fort (a nod to Qal'at al-Bahrain), another a wind-tower house. */
export function addIslands(B) {
  const list = [
    [-62, 128, 30, 'fort'], [-118, 96, 18, 'palms'], [-172, 150, 34, 'low'], [118, 112, 22, 'palms'],
    [168, 105, 16, 'house'], [62, 132, 28, 'palms'], [4, 104, 20, 'low'],
  ];
  list.forEach(([deg, dist, size, kind], i) => {
    const R = rng(300 + i), a = (deg * Math.PI) / 180, cx = Math.cos(a) * dist, cz = Math.sin(a) * dist, yaw = R() * TAU;
    // sand body and grass cap; their parts under the (opaque) sea are dropped
    B.add(smoothGeo(blobGeo(1, { detail: 1, jitter: 0.2, seed: 70 + i }), 0.2), { pos: [cx, SEA_Y - size * 0.02, cz], rot: [0, yaw, 0], scale: [size, size * 0.08, size * 0.62], grad: ['#d9c08e', PAL.sand, -0.3, 0.6] });
    if (kind === 'low') return;
    B.add(smoothGeo(blobGeo(1, { detail: 1, jitter: 0.18, seed: 90 + i }), -0.42), { pos: [cx, SEA_Y + size * 0.035, cz], rot: [0, yaw, 0], scale: [size * 0.68, size * 0.09, size * 0.4], grad: [PAL.grassDark, PAL.grass, -0.2, 0.8] });
    const top = SEA_Y + size * 0.1;
    const n = kind === 'palms' ? 7 : 4;
    for (let k = 0; k < n; k++) {
      const u = (R() - 0.5) * size * 0.9, v = (R() - 0.5) * size * 0.4, c = Math.cos(yaw), s = Math.sin(yaw);
      tinyPalm(B, cx + u * c + v * s, top - 0.4, cz - u * s + v * c, 4 + R() * 3, R);
    }
    if (kind === 'fort') addFort(B, cx, top - 0.6, cz, yaw);
    if (kind === 'house') { const F = frame(cx, cz, -a - Math.PI / 2); box(B, F, 0, top + 1.3, 0, 5, 3.4, 4, null, ['#e9d6b0', PAL.wallA]); merlons(B, F, 0, top + 2.95, 0, 5, 4, PAL.wallA, 0.7); box(B, F, 1.2, top + 4, -0.6, 1.3, 2.6, 1.3, PAL.wallA); merlons(B, F, 1.2, top + 5.25, -0.6, 1.3, 1.3, PAL.wallA, 0.6); }
  });
}

function addFort(B, x, y, z, yaw) {
  const F = frame(x, z, yaw), S = 11, wallH = 3.2, col = '#ecd9b2', dark = '#d4bd92';
  for (const [lx, lz, sx, sz] of [[0, -S / 2, S, 0.8], [0, S / 2, S, 0.8], [-S / 2, 0, 0.8, S], [S / 2, 0, 0.8, S]]) box(B, F, lx, y + wallH / 2, lz, sx, wallH, sz, null, [dark, col]);
  merlons(B, F, 0, y + wallH, 0, S, S, col, 1.1);
  const tower = new THREE.CylinderGeometry(1.5, 1.7, 1, 10);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    B.add(tower, { pos: F.p((lx * S) / 2, y + 2.2, (lz * S) / 2), scale: [1, 4.4, 1], grad: [dark, col] });
    B.add(tower, { pos: F.p((lx * S) / 2, y + 4.5, (lz * S) / 2), scale: [1.1, 0.25, 1.1], color: PAL.parapet });
  }
  box(B, F, 0.8, y + 2.6, -0.6, 4.2, 5.2, 4.2, null, [dark, col]);
  merlons(B, F, 0.8, y + 5.2, -0.6, 4.2, 4.2, col, 0.9);
}

/** A traditional dhow: wooden hull with a raised stern, raked mast, lateen sail and a tiny Bahrain flag. */
/** Wooden hull lofted from U-shaped sections (stern raised), bow toward +z; P maps hull-local [x, y, z] to the batch. */
function addHull(B, P, L, beam, secs = 12) {
  const side = [-1, -0.72, -0.36, 0, 0.36, 0.72, 1], k = L / 8;
  const halfW = (t) => beam * Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * t)), 0.65) * (t < 0.08 ? 0.85 + t * 2 : 1);
  const deckY = (t) => (0.75 + 0.75 * Math.pow(1 - t, 4) + 0.55 * Math.pow(t, 3)) * k;
  const keel = -0.45 * k, rows = [];
  for (let i = 0; i <= secs; i++) {
    const t = i / secs, zz = (t - 0.5) * L, w = halfW(t), dy = deckY(t);
    rows.push(side.map((s) => [w * s * (1 - 0.15 * (1 - Math.abs(s))), keel + (dy - keel) * Math.pow(Math.abs(s), 1.5), zz]));
  }
  const col = (p, rim) => (rim ? '#f3ead8' : p[1] < 0.05 * k ? '#6e4529' : p[1] > 0.8 * k ? '#c58b4f' : '#a8713f');
  for (let i = 0; i < secs; i++) {
    for (let j = 0; j < side.length - 1; j++) {
      const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j], d = rows[i + 1][j + 1], edge = j === 0 || j === side.length - 2;
      const C = (p) => col(p, edge && Math.abs(p[0]) > 0.4 * beam);
      B.tri(P(a), P(c), P(b), [C(a), C(c), C(b)]);
      B.tri(P(b), P(c), P(d), [C(b), C(c), C(d)]);
    }
    const l0 = rows[i][0], r0 = rows[i][side.length - 1], l1 = rows[i + 1][0], r1 = rows[i + 1][side.length - 1], dk = -0.1 * k;
    const D = (p) => P([p[0], p[1] + dk, p[2]]);
    B.tri(D(l0), D(r0), D(l1), ['#d6a56c']);
    B.tri(D(r0), D(r1), D(l1), ['#d6a56c']);
  }
}

/**
 * Fishing-village beach details: a small boat pulled up on the sand, gargoor (dome fish traps) and an arish
 * (palm-frond) fence. (x, z, yaw) is a footprint frame whose +z points to the sea; everything sits on the terrain.
 */
export function addBeachLife(B, x, z, yaw) {
  const F = frame(x, z, yaw), R = rng(41);
  const [bx, , bz] = F.p(1.5, 0, 2.2), by = heightAt(bx, bz) + 0.28, roll = 0.14, c = Math.cos(yaw + 0.5), s = Math.sin(yaw + 0.5);
  addHull(B, ([px, py, pz]) => { // resting a little on its side
    const rx = px * Math.cos(roll) - py * Math.sin(roll), ry = px * Math.sin(roll) + py * Math.cos(roll);
    return [bx + rx * c + pz * s, by + ry, bz - rx * s + pz * c];
  }, 3.4, 0.62, 8);
  const dome = new THREE.SphereGeometry(0.62, 9, 4, 0, TAU, 0, Math.PI / 2);
  for (const [lx, lz, sc] of [[-1.4, 1.2, 1], [-0.3, 2.3, 0.8], [-2.2, 2.6, 0.9]]) {
    const [gx, , gz] = F.p(lx, 0, lz), gy = heightAt(gx, gz);
    B.add(dome, { pos: [gx, gy - 0.05, gz], scale: [sc, sc * 0.75, sc], color: '#8f9590', flat: true });
    B.add(new THREE.TorusGeometry(0.62 * sc, 0.03, 3, 12).rotateX(Math.PI / 2), { pos: [gx, gy + 0.02, gz], color: '#6f7570' });
  }
  for (let i = 0; i < 16; i++) {
    const lx = -3.2 + i * 0.19, [fx, , fz] = F.p(lx, 0, -1.6), h = 1.15 + R() * 0.18;
    B.add(BOX, { pos: [fx, heightAt(fx, fz) + h / 2 - 0.05, fz], rot: [0, yaw + (R() - 0.5) * 0.15, (R() - 0.5) * 0.08], scale: [0.09, h, 0.05], grad: ['#9a7c4a', '#d8bf86'] });
  }
  for (const yy of [0.35, 0.85]) { const [rx, , rz] = F.p(-1.75, 0, -1.6); B.add(BOX, { pos: [rx, heightAt(rx, rz) + yy, rz], rot: [0, yaw, 0], scale: [3.1, 0.05, 0.07], color: '#7f5838' }); }
}

/** opts: sail colours [lit, shade] and a stripe colour for the sail's lower edge (null = none). */
export function buildDhow({ sail = ['#fbf4e4', '#eadfc8'], stripe = null } = {}) {
  const B = new Batch(), L = 8;
  addHull(B, (p) => p, L, 1.25);
  // stern cabin, mast, yard, sail
  B.add(BOX, { pos: [0, 1.75, -L * 0.36], scale: [1.6, 0.6, 1.4], color: '#b57b45' });
  B.add(new THREE.CylinderGeometry(0.07, 0.1, 6.4, 6), { pos: [0, 4.0, L * 0.12], rot: [0.14, 0, 0], color: '#8a5a33' });
  const yA = [0, 1.9, L * 0.48], yB = [0, 7.6, -L * 0.3];
  const yard = new THREE.CylinderGeometry(0.05, 0.05, 1, 5);
  const dir = new THREE.Vector3(yB[0] - yA[0], yB[1] - yA[1], yB[2] - yA[2]), len = dir.length();
  B.add(yard, { pos: [(yA[0] + yB[0]) / 2, (yA[1] + yB[1]) / 2, (yA[2] + yB[2]) / 2], rot: [Math.atan2(dir.z, dir.y), 0, 0], scale: [1, len, 1], color: '#8a5a33' });
  const clew = [0, 1.45, -L * 0.18], belly = 0.55, [cream, shadeC] = sail;
  const P = (u, v) => { // u along the yard, v toward the clew
    const ax = yA[0] + (yB[0] - yA[0]) * u, ay = yA[1] + (yB[1] - yA[1]) * u, az = yA[2] + (yB[2] - yA[2]) * u;
    const bulge = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.2)) * belly;
    return [ax + (clew[0] - ax) * v + bulge, ay + (clew[1] - ay) * v - 0.05, az + (clew[2] - az) * v];
  };
  const N = 4;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N - i; j++) {
      const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
      const band = stripe && j === N - i - 1; // the outer band of the sail
      B.tri(P(u0, v0), P(u1, v0), P(u0, v1), band ? [stripe] : [cream, cream, shadeC]);
      if (j < N - i - 1) B.tri(P(u1, v0), P(u1, v1), P(u0, v1), [cream, shadeC, shadeC]);
    }
  }
  // tiny Bahrain flag at the yard top
  const fx = yB[0], fy = yB[1] + 0.1, fz = yB[2];
  B.add(BOX, { pos: [fx, fy - 0.15, fz - 0.17], scale: [0.03, 0.4, 0.14], color: '#ffffff' });
  B.add(BOX, { pos: [fx, fy - 0.15, fz - 0.5], scale: [0.03, 0.4, 0.52], color: '#ce1126' });
  const mesh = new THREE.Mesh(B.build(), vcMat({ side: THREE.DoubleSide }));
  mesh.name = 'dhow';
  return mesh;
}

// ---------------------------------------------------------------- hub gateway
/** Pointed (Gulf) arch curve: left springing → apex → right springing, half-span a. */
function archCurve(a, y0, rise, n = 8) {
  const pts = [];
  const f = (t) => { const u = 1 - t; return [-a * (u * u * u) - a * 3 * u * u * t - 0.35 * a * 3 * u * t * t, y0 + rise * (3 * u * t * t * 0.85 + 3 * u * u * t * 0.55 + t * t * t)]; };
  for (let i = 0; i <= n; i++) pts.push(f(i / n));
  for (let i = n - 1; i >= 0; i--) { const [x, y] = f(i / n); pts.push([-x, y]); }
  return pts;
}
const STAR8 = (() => {
  const s = new THREE.Shape();
  for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, r = k % 2 ? 0.62 : 1; k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return new THREE.ShapeGeometry(s);
})();

/**
 * A Bahraini gateway (a toy Bab al-Bahrain): cream piers on stone plinths, a pointed arch edged with teal tiles, stepped
 * crenellations, a khatam tile over the apex, a brass lantern hanging in the arch and a bougainvillea climbing one pier.
 * Front faces local +z (toward the viewer). Static batch B (world coordinates).
 */
export function addGate(B, x, z, yaw, { open = 1.95, pier = 0.56, y0 = 2.05, rise = 0.9, top = 3.4, depth = 0.62 } = {}) {
  const F = frame(x, z, yaw), a = open / 2, half = a + pier, R = rng(77);
  const cream = '#f4e2c2', creamTop = '#fff5e2', stone = '#cfa877';
  for (const sx of [-1, 1]) {
    const px = sx * (a + pier / 2);
    box(B, F, px, y0 / 2, 0, pier, y0, depth, null, ['#dcc39a', cream]);
    box(B, F, px, 0.17, 0, pier + 0.14, 0.34, depth + 0.14, null, ['#b98f62', stone]);
    box(B, F, px, y0 - 0.07, 0, pier + 0.1, 0.14, depth + 0.1, PAL.teal);
  }
  const inner = archCurve(a, y0, rise);
  const wall = new THREE.Shape();
  wall.moveTo(-half, y0); for (const [px, py] of inner) wall.lineTo(px, py); wall.lineTo(half, y0); wall.lineTo(half, top); wall.lineTo(-half, top); wall.closePath();
  B.add(new THREE.ExtrudeGeometry(wall, { depth, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -depth / 2), { pos: F.p(0, 0, 0), rot: [0, yaw, 0], grad: [cream, creamTop, y0, top] });
  const outer = archCurve(a + 0.15, y0, rise + 0.15), band = new THREE.Shape();
  band.moveTo(...inner[0]); for (const p of inner) band.lineTo(...p); for (let i = outer.length - 1; i >= 0; i--) band.lineTo(...outer[i]); band.closePath();
  const bandGeo = new THREE.ShapeGeometry(band);
  for (const fz of [1, -1]) {
    B.add(bandGeo, { pos: F.p(0, 0, fz * (depth / 2 + 0.012)), rot: [0, yaw + (fz < 0 ? Math.PI : 0), 0], color: fz > 0 ? PAL.teal : '#3a9fc2' });
    B.add(STAR8, { pos: F.p(0, (y0 + rise + 0.15 + top) / 2 + 0.02, fz * (depth / 2 + 0.014)), rot: [0, yaw + (fz < 0 ? Math.PI : 0), Math.PI / 8], scale: 0.17, color: PAL.coral });
    for (const sx of [-1, 1]) B.add(STAR8, { pos: F.p(sx * (a + pier / 2), y0 - 0.55, fz * (depth / 2 + 0.014)), rot: [0, yaw + (fz < 0 ? Math.PI : 0), 0], scale: 0.12, color: PAL.sun });
  }
  // cornice and stepped crenellations
  box(B, F, 0, top + 0.06, 0, half * 2 + 0.12, 0.12, depth + 0.12, PAL.parapet);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const lx = -half + (half * 2 * (i + 0.5)) / n;
    box(B, F, lx, top + 0.27, 0, 0.26, 0.3, depth * 0.8, creamTop);
    box(B, F, lx, top + 0.48, 0, 0.13, 0.14, depth * 0.5, creamTop);
  }
  // brass lantern hanging in the arch
  const apex = y0 + rise;
  box(B, F, 0, apex - 0.16, 0, 0.025, 0.32, 0.025, '#8a6a3f');
  B.add(new THREE.ConeGeometry(0.12, 0.1, 6), { pos: F.p(0, apex - 0.36, 0), rot: [0, yaw, 0], color: '#c9a24a' });
  B.add(new THREE.CylinderGeometry(0.09, 0.07, 0.22, 6), { pos: F.p(0, apex - 0.52, 0), rot: [0, yaw, 0], color: '#fff3c4' });
  B.add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6), { pos: F.p(0, apex - 0.645, 0), rot: [0, yaw, 0], color: '#c9a24a' });
  // bougainvillea draped over the left corner and down the pier's face (magenta: the earthquake station's hue, on purpose)
  const leaf = smoothGeo(blobGeo(1, { detail: 1, jitter: 0.3, seed: 5 })), petal = new THREE.OctahedronGeometry(0.07, 0);
  const fz = depth / 2 + 0.05, px0 = -half + 0.04;
  const drape = [[px0 + 0.62, top + 0.12, 0.3, 0.3], [px0 + 0.28, top + 0.05, 0.36, 0.32], [px0 + 0.05, top - 0.35, 0.3, 0.3], [px0 - 0.02, top - 0.85, 0.25, 0.26],
    [px0 + 0.02, top - 1.3, 0.22, 0.22], [px0 + 0.22, top - 0.55, 0.2, 0.2], [px0 - 0.05, top - 1.72, 0.17, 0.17], [px0 + 1.0, top + 0.06, 0.2, 0.22]];
  for (const [lx, ly, rx, ry] of drape) {
    B.add(leaf, { pos: F.p(lx, ly, fz - 0.04), rot: [0, yaw, 0], scale: [rx, ry, 0.13], grad: ['#3f7a46', '#6aa956'] });
    const nP = Math.round(rx * 80);
    for (let k = 0; k < nP; k++) {
      const u = R() * TAU, rr = Math.sqrt(R()) * 0.92;
      const sc = 0.8 + R() * 0.5; // papery bracts: small flat diamonds lying on the clump, facing out
      B.add(petal, { pos: F.p(lx + Math.cos(u) * rr * rx, ly + Math.sin(u) * rr * ry, fz + 0.05 - rr * 0.05), rot: [0, yaw, R() * 3], scale: [sc, sc * 0.8, sc * 0.35], color: k % 4 === 0 ? '#f59ac2' : k % 3 ? '#e0508a' : '#ee6fa6' });
    }
  }
}
