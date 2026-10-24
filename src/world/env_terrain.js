// Island terrain: ONE indexed vertex-coloured mesh = height-field grid (flat zones, pits under the plinths, beach)
// + flat decals merged in (sandy paths, viewer pads, plinth gravel rings, the patterned hub plaza and hall courtyard).
// Also the "closed stage" covers shown over the pits of stations the child is not visiting.
import { THREE, PAL, noise2, fbm, smooth, clamp, vcMat } from '../core/kit.js';
import { OUTER, FLAT_RADIUS, STAGE } from '../core/layout.js';
import { STATION, STATIONS } from '../game/content.js';
import { SEA_Y, PIT_R, PIT_Y, PITS, PATHS, PATH_HALF, pathDist, toWorld, Mesher } from './env_util.js';

/** Shore radius by polar angle (world): a base radius plus three waves [k, amplitude, phase]. Shared by JS and GLSL. */
const SHORE = { base: 36, waves: [[3, 1.6, 0.7], [5, 1.0, 2.1], [9, 0.5, 4.0]] };
export const shoreR = (a) => SHORE.waves.reduce((r, [k, amp, ph]) => r + amp * Math.sin(k * a + ph), SHORE.base);
const glf = (x) => x.toFixed(3);
export const SHORE_GLSL = `float shoreR(float a) { return ${glf(SHORE.base)}${SHORE.waves.map(([k, amp, ph]) => ` + ${glf(amp)} * sin(${glf(k)} * a + ${glf(ph)})`).join('')}; }`;

/** Radius of the round hole cut for each pit (its chords on the 1.2 m grid stay > 0.05 m outside PIT_R). */
const PIT_TOP = PIT_R + 0.2;

const FLAT_PTS = [{ x: 0, z: 0 }, ...OUTER.map((k) => { const [x, z] = toWorld(k, 0, 0); return { x, z }; }), ...PITS, (() => { const [x, z] = toWorld('hall', 0, -3.2); return { x, z }; })()];

/** 1 where the ground must be exactly y = 0 (zones, diorama surroundings, paths), fading to 0 outside. */
function flatW(x, z) {
  let w = 1 - smooth(PATH_HALF + 0.5, PATH_HALF + 3.5, pathDist(x, z));
  for (const p of FLAT_PTS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 12) w = Math.max(w, 1 - smooth(FLAT_RADIUS + 1.4, 12, d)); // +1.4: grid triangles must not lift the edge
  }
  return w;
}

/** Sand dunes (world x, z, radius, height): the lone ghaf's dune behind the weathering station, a long low dune past erosion. */
const DUNES = [[...toWorld('weather', -4.6, -16.5), 4.2, 0.85], [...toWorld('erosion', 9, -13), 5.5, 0.6], [...toWorld('erosion', 13.5, -11), 4, 0.45]];

/** Natural ground height (no pits). */
export function heightAt(x, z) {
  const r = Math.hypot(x, z), R = shoreR(Math.atan2(z, x));
  let dune = 0;
  for (const [dx, dz, dr, dh] of DUNES) { const d2 = ((x - dx) ** 2 + (z - dz) ** 2) / (dr * dr); if (d2 < 4) dune += dh * Math.exp(-d2 * 1.6); }
  let land = 0.5 * Math.max(0, fbm(x * 0.07 + 3.1, z * 0.07 - 1.7, 3) + 0.1) + 0.9 * smooth(R - 16, R - 9, r) * (0.55 + 0.45 * noise2(x * 0.11, z * 0.11));
  land *= 1 - smooth(R - 8, R - 4, r);
  land += dune * (1 - smooth(R - 3.5, R - 1, r));
  const beach = SEA_Y * smooth(R - 6, R, r) - (r > R ? Math.min(2.5, (r - R) * 0.24) : 0);
  return (land + beach) * (1 - flatW(x, z));
}

const C = (h) => new THREE.Color(h);
const COL = {
  grass: C(PAL.grass), grassDark: C(PAL.grassDark), grassLight: C(PAL.grassLight), meadow: C(PAL.meadow), lush: C('#7cc070'),
  sand: C('#f2dcaa'), sandWarm: C('#e9cb92'), duneLight: C('#f8e8c4'), wet: C('#d6bb88'), under: C('#a8dccf'), pit: C('#9a7550'),
  shade: C('#6a9f63'), shadeSand: C('#cdb084'), dry: C('#d9d39b'), salt: C('#efe9da'),
};
const _col = new THREE.Color(), _sc = new THREE.Color();

/**
 * Ground colour: an irrigated green interior (meadow, lush spots under the palms), sun-dried patches and sandy clearings,
 * then golden dunes and beach from just behind the station plinths to the shore (so each diorama stands out against
 * sand and sea), wet sand at the waterline. shade = baked soft shadow (0..), lush = closeness to a palm or garden (0..1).
 */
function groundColor(x, z, y, shade, lush = 0) {
  const r = Math.hypot(x, z), R = shoreR(Math.atan2(z, x));
  const n1 = fbm(x * 0.09, z * 0.09, 2), n2 = noise2(x * 0.035 + 9, z * 0.035 - 4), n3 = noise2(x * 0.075 - 7, z * 0.075 + 3);
  _col.copy(COL.grassDark).lerp(COL.grass, clamp(0.66 + n1 * 1.3));
  _col.lerp(COL.grassLight, clamp(n2 * 1.6) * 0.65);
  _col.lerp(COL.meadow, clamp(-n2 * 1.6) * 0.5);
  _col.lerp(COL.dry, clamp((n3 - 0.05) * 2.4) * 0.6 * (1 - lush)); // sun-dried patches
  _col.lerp(COL.lush, lush * 0.45);
  // sand: dunes and beach behind the stations, sandy clearings inland
  const beach = smooth(R - 13.5 + n1 * 3, R - 9.5 + n1 * 3, r), clearing = clamp((n3 - 0.32) * 3.2) * 0.85;
  const sandT = Math.max(beach, clearing) * (1 - lush * 0.8);
  _sc.copy(COL.sand).lerp(COL.sandWarm, clamp(0.45 + n1 * 1.6) * 0.8).lerp(COL.duneLight, clamp(y * 0.9) * 0.7);
  _col.lerp(_sc, sandT);
  // a pale salt flat (sabkha) along the shore between the weathering and erosion stations
  const a = Math.atan2(z, x), sab = smooth(0.5, 0.12, Math.abs(a - 2.1)) * smooth(R - 7, R - 4.5, r) * (1 - smooth(R - 2, R - 0.8, r));
  _col.lerp(COL.salt, sab * 0.75 * clamp(0.6 + n1 * 2));
  if (shade > 0) _col.lerp(sandT > 0.5 ? COL.shadeSand : COL.shade, Math.min(0.55, shade) * (1 - smooth(R - 1, R, r)));
  _col.lerp(COL.wet, smooth(R - 1.6, R - 0.3, r));
  _col.lerp(COL.under, smooth(R + 0.4, R + 3, r));
  return _col;
}

/** 0 (meadow) … 1 (sand) at world (x, z), ignoring the lush spots (for picking plants that suit the ground). */
export function sandAt(x, z) {
  const r = Math.hypot(x, z), R = shoreR(Math.atan2(z, x)), n1 = fbm(x * 0.09, z * 0.09, 2), n3 = noise2(x * 0.075 - 7, z * 0.075 + 3);
  return Math.max(smooth(R - 13.5 + n1 * 3, R - 9.5 + n1 * 3, r), clamp((n3 - 0.32) * 3.2) * 0.85);
}

/**
 * shadows: [{ x, z, r, k }] soft dark spots baked into the vertex colours (palm crowns, houses) instead of shadow maps.
 * Returns ONE mesh: terrain, pits, paths, pads and plazas.
 */
export function buildTerrain({ shadows = [], lush = [] } = {}) {
  const M = new Mesher();
  const H = 1.2, EXT = 44.4, n = Math.round((2 * EXT) / H) + 1;
  const ids = new Int32Array(n * n).fill(-1), ys = new Float32Array(n * n), snapped = new Map(); // mesher index → pit
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -EXT + i * H, z = -EXT + j * H;
      if (Math.hypot(x, z) > EXT + 0.5) continue;
      // pits: grid vertices near the pit circle snap onto it (a clean round hole), vertices inside are left out
      let px = x, pz = z, pit = -1, inside = false;
      PITS.forEach((p, k) => {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < PIT_TOP - 0.75 * H) inside = true;
        else if (d < PIT_TOP + 0.75 * H) { px = p.x + ((x - p.x) * PIT_TOP) / d; pz = p.z + ((z - p.z) * PIT_TOP) / d; pit = k; }
      });
      if (inside) continue;
      const y = pit >= 0 ? 0 : heightAt(x, z);
      let shade = 0, wet = 0;
      for (const s of shadows) { const d = Math.hypot(px - s.x, pz - s.z); if (d < s.r) shade += s.k * (1 - smooth(0, s.r, d)); }
      for (const g of lush) { const d = Math.hypot(px - g.x, pz - g.z); if (d < g.r) wet = Math.max(wet, 1 - smooth(g.r * 0.45, g.r, d + noise2(px * 0.5, pz * 0.5) * 0.8)); }
      ids[j * n + i] = M.v(px, y, pz, groundColor(px, pz, y, shade, wet));
      ys[j * n + i] = y;
      if (pit >= 0) snapped.set(ids[j * n + i], pit);
    }
  }
  const deep = SEA_Y - 0.05, edges = new Map(); // triangles wholly under the (opaque) sea are never seen
  const tri = (a, b, c) => {
    if (ids[a] < 0 || ids[b] < 0 || ids[c] < 0) return;
    if (ys[a] < deep && ys[b] < deep && ys[c] < deep) return;
    const A = ids[a], B = ids[b], C = ids[c], P = M.p, cx = (P[A * 3] + P[B * 3] + P[C * 3]) / 3, cz = (P[A * 3 + 2] + P[B * 3 + 2] + P[C * 3 + 2]) / 3;
    if (PITS.some((p) => Math.hypot(cx - p.x, cz - p.z) < PIT_TOP - 0.01)) return; // slivers spanning the hole
    M.t(A, B, C);
    for (const [u, v] of [[A, B], [B, C], [C, A]]) { const k = Math.min(u, v) + ':' + Math.max(u, v); edges.set(k, edges.has(k) ? null : [u, v]); }
  };
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      if ((i + j) % 2) { tri(a, c, b); tri(b, c, d); } else { tri(a, c, d); tri(a, d, b); }
    }
  }
  // close every hole with a vertical wall along its exact boundary and a floor (y = PIT_Y): nothing inside PIT_R rises above it.
  // Wound so the walls face the pit centre and the floor faces up (the pit must write depth for the stage covers).
  for (const e of edges.values()) {
    if (!e || !snapped.has(e[0]) || snapped.get(e[0]) !== snapped.get(e[1])) continue;
    const p = PITS[snapped.get(e[0])], P = M.p, [ax, , az] = P.slice(e[0] * 3, e[0] * 3 + 3), [bx, , bz] = P.slice(e[1] * 3, e[1] * 3 + 3);
    const inward = (bx - ax) * (p.z - az) - (bz - az) * (p.x - ax) > 0; // pit centre on the left of a→b (seen from above)
    const [ux, uz, vx, vz] = inward ? [ax, az, bx, bz] : [bx, bz, ax, az];
    const t0 = M.v(ux, 0, uz, COL.pit), t1 = M.v(vx, 0, vz, COL.pit), b0 = M.v(ux, PIT_Y, uz, COL.pit), b1 = M.v(vx, PIT_Y, vz, COL.pit), c = M.v(p.x, PIT_Y, p.z, COL.pit);
    M.t(t0, b0, t1); M.t(t1, b0, b1); M.t(c, b1, b0);
  }
  addPaths(M);
  addPlaza(M);
  addZoneDecals(M);
  const mesh = new THREE.Mesh(M.build(), vcMat());
  mesh.name = 'terrain';
  mesh.renderOrder = -2; // before the stage covers (see buildStageCovers)
  return mesh;
}

// ---------------------------------------------------------------- closed-stage covers
const COVER_R = PIT_R + 0.005, COVER_Y = 0.16; // inside the plinth rim (r 2.72·s − 0.02 … 2.72·s + 0.2, top y 0.18)
const STONE = ['#e7d3b1', '#dcc39b'];

/**
 * One mesh with a "closed stage" over every station pit: a stone-ringed drum with a ribbon and a khatam medallion in the
 * station colour. The game hides a station's diorama while the child is elsewhere; the cover then replaces the hole.
 * It never writes depth and draws right after the terrain (renderOrder -1), so it fails against anything nearer and a
 * visible diorama + plinth rim (drawn later, nearer than the pit behind them) simply paint over it: no zone logic needed,
 * thumbnails and station switches stay correct whatever the game shows.
 */
export function buildStageCovers() {
  const M = new Mesher(), seg = 40, k = COVER_R / 2.855; // pattern radii authored for the unscaled stage
  for (const p of PITS) {
    const col = STATION[p.key].color, light = '#' + new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.35).getHexString();
    // outer wall: a stone foot and a ribbon in the station colour, each a quad strip facing outward
    for (const [y0, y1, c] of [[-0.02, 0.05, '#d2b98f'], [0.05, COVER_Y, col]]) {
      const s = M.p.length / 3;
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, x = p.x + Math.cos(a) * COVER_R, z = p.z + Math.sin(a) * COVER_R; M.v(x, y0, z, c); M.v(x, y1, z, c); }
      for (let i = 0; i < seg; i++) { const l = s + i * 2; M.t(l, l + 1, l + 2); M.t(l + 1, l + 3, l + 2); }
    }
    // the top, painted in layers (later layers draw over earlier ones: no depth writes, no z-fighting)
    M.disc(p.x, p.z, COVER_R, COVER_Y, '#f1e2c2', seg, '#f8eedb');
    for (let i = 0; i < seg; i++) { // alternating rim stones
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, s = M.p.length / 3;
      for (const [a, r] of [[a0, 2.6 * k], [a0, COVER_R], [a1, 2.6 * k], [a1, COVER_R]]) M.v(p.x + Math.cos(a) * r, COVER_Y, p.z + Math.sin(a) * r, STONE[i % 2]);
      M.t(s, s + 2, s + 1); M.t(s + 1, s + 2, s + 3);
    }
    M.ring(p.x, p.z, 2.0 * k, 2.28 * k, COVER_Y, col, seg);
    M.star(p.x, p.z, 1.15 * k, 8, COVER_Y, col, Math.PI / 8, 0.76, light);
    M.star(p.x, p.z, 0.8 * k, 8, COVER_Y, '#fff3d6', Math.PI / 8, 0.74);
  }
  const mesh = new THREE.Mesh(M.build(), vcMat({ depthWrite: false }));
  mesh.name = 'stageCovers';
  mesh.renderOrder = -1;
  return mesh;
}

// ---------------------------------------------------------------- decals
const PATH_C = PAL.path, EDGE_C = PAL.pathEdge;

function addPaths(M) {
  for (const p of PATHS) {
    const len = Math.hypot(p.bx - p.ax, p.bz - p.az), dx = (p.bx - p.ax) / len, dz = (p.bz - p.az) / len, nx = -dz, nz = dx;
    const steps = Math.ceil(len / 1.0), across = [-1, -0.8, -0.25, 0.25, 0.8, 1], y = 0.003; // the lowest decal: plazas, aprons and pads cover its ends
    const base = M.p.length / 3;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, cx = p.ax + dx * len * t, cz = p.az + dz * len * t;
      const wob = 1 + 0.06 * noise2(cx * 0.4, cz * 0.4);
      for (const a of across) {
        const w = a * PATH_HALF * wob, edge = Math.abs(a) > 0.9;
        const worn = 0.5 + 0.5 * noise2(cx * 0.7 + a * 3, cz * 0.7);
        M.v(cx + nx * w, y, cz + nz * w, edge ? EDGE_C : _col.set(PATH_C).lerp(COL.sand, Math.abs(a) < 0.5 ? worn * 0.35 : 0.15));
      }
    }
    const k = across.length;
    for (let s = 0; s < steps; s++) {
      for (let q = 0; q < k - 1; q++) {
        const a = base + s * k + q, b = a + 1, c = a + k, d = c + 1;
        M.t(a, b, c); M.t(b, d, c);
      }
    }
  }
}

// Decal heights: paths 3 mm, then 1 mm layers (plaza / courtyard / apron / pads), all below the game's viewer pad (y 0.012).
const Y = (k) => 0.004 + k * 0.001;
const P = (cx, cz, r, a) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
/** Annular tile (r0..r1, a0..a1) as a flat quad. */
function tile(M, cx, cz, r0, r1, a0, a1, y, color) { M.poly([P(cx, cz, r0, a0), P(cx, cz, r1, a0), P(cx, cz, r1, a1), P(cx, cz, r0, a1)], y, color, ...P(cx, cz, (r0 + r1) / 2, (a0 + a1) / 2)); }
/** A sadu-weave chain: n diamonds in a band r0..r1 (alternating colours). */
function diamonds(M, cx, cz, r0, r1, n, y, colors, phase = 0) {
  const rm = (r0 + r1) / 2;
  for (let k = 0; k < n; k++) {
    const am = phase + (k / n) * Math.PI * 2, da = (Math.PI / n) * 0.82;
    M.poly([P(cx, cz, rm, am - da), P(cx, cz, r1, am), P(cx, cz, rm, am + da), P(cx, cz, r0, am)], y, colors[k % colors.length], ...P(cx, cz, rm, am));
  }
}

/** Hub plaza (r ≈ 3.2): warm stone paving with joints, a sadu-weave border, a ring of eight-point stars and a khatam medallion. */
function addPlaza(M) {
  M.disc(0, 0, 3.24, Y(0), '#c99a68', 80); // kerb
  M.disc(0, 0, 3.1, Y(1), '#efdcb8', 80, '#f6e8cc');
  M.ring(0, 0, 2.76, 3.04, Y(2), '#d88d60', 80); // sadu band
  diamonds(M, 0, 0, 2.79, 3.01, 40, Y(3), ['#fbefd8', '#f6c46a'], Math.PI / 40);
  M.ring(0, 0, 2.64, 2.72, Y(2), PAL.teal, 80);
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2 + Math.PI / 24; tile(M, 0, 0, 1.96, 2.62, a - 0.006, a + 0.006, Y(2), '#e2c79a'); } // stone joints
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; tile(M, 0, 0, 1.3, 1.84, a - 0.008, a + 0.008, Y(2), '#e2c79a'); }
  M.ring(0, 0, 1.84, 1.96, Y(2), '#c98a5e', 72);
  const n = 12;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / n, x = Math.cos(a) * 2.29, z = Math.sin(a) * 2.29;
    M.star(x, z, 0.27, 8, Y(3), k % 2 ? PAL.teal : PAL.coral, a, 0.7, k % 2 ? '#7fd3c9' : '#f7b39f');
    M.star(x, z, 0.1, 8, Y(4), '#fff4dc', a, 0.6);
    const b = (k / n) * Math.PI * 2, bx = Math.cos(b) * 2.29, bz = Math.sin(b) * 2.29;
    M.star(bx, bz, 0.11, 4, Y(3), PAL.orange, b, 0.45);
  }
  // central medallion (the viewer stands on it; the game's pad sits on top)
  M.star(0, 0, 1.27, 8, Y(2), PAL.tealDark, Math.PI / 8, 0.76, '#4fb9ac');
  M.star(0, 0, 1.0, 8, Y(3), '#fbf1dc', Math.PI / 8, 0.76);
  M.star(0, 0, 0.8, 8, Y(4), PAL.sun, 0, 0.72, '#ffe39a');
}

/** Viewer pads at the outer zones, gravel rings around each plinth, the hall courtyard. */
function addZoneDecals(M) {
  for (const k of OUTER) {
    if (k === 'hall') continue;
    const [x, z] = toWorld(k, 0, 0.35); // shifted back so the pad stops short of the plinth (rim at z = -0.75)
    M.disc(x, z, 1.08, Y(3), '#d8b07e', 40); // above the plinth apron (Y(1)) where they meet
    M.disc(x, z, 0.95, Y(4), '#f2e1c0', 40, '#f7ead2');
    diamonds(M, x, z, 0.8, 0.93, 16, Y(5), [STATION[k].color, '#fbefd8']);
  }
  // gravel apron around each plinth: it starts under the stone rim (its stones stand on it, the gaps between them show
  // gravel, never the pit) and runs a little beyond it
  const s = STAGE.scale ?? 1;
  for (const p of PITS) {
    M.ring(p.x, p.z, 2.6 * s, PIT_R + 0.56, Y(1), '#d9c294', 56, '#e8d6ae');
    M.ring(p.x, p.z, PIT_R + 0.56, PIT_R + 0.68, Y(1), '#cfae7e', 56);
  }
  // hall courtyard: warm sand paving, a teal tile band, a ring of stars in the five station hues
  const [hx, hz] = toWorld('hall', 0, -3.2), hues = STATIONS.map((st) => st.color);
  M.disc(hx, hz, 5.75, Y(0), '#c99a68', 80);
  M.disc(hx, hz, 5.6, Y(1), '#ecd29f', 80, '#f1dcae');
  for (const r of [1.6, 2.6, 3.6]) M.ring(hx, hz, r, r + 0.05, Y(2), '#dcbb85', 80);
  for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; tile(M, hx, hz, 2.6, 4.75, a - 0.005, a + 0.005, Y(2), '#dcbb85'); }
  M.ring(hx, hz, 4.75, 4.95, Y(2), PAL.tealDark, 80);
  M.ring(hx, hz, 4.95, 5.55, Y(2), '#e7c48d', 80);
  diamonds(M, hx, hz, 4.97, 5.13, 64, Y(3), ['#fbefd8', '#d88d60']);
  const n = 25;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = hx + Math.cos(a) * 5.34, z = hz + Math.sin(a) * 5.34;
    M.star(x, z, 0.17, 8, Y(3), hues[i % hues.length], a, 0.66);
  }
  // hall entrance pad (the viewer stands here)
  const [vx, vz] = toWorld('hall', 0, 0);
  M.star(vx, vz, 0.98, 8, Y(5), PAL.tealDark, Math.PI / 8, 0.76, '#4fb9ac');
  M.star(vx, vz, 0.76, 8, Y(6), '#fbf1dc', Math.PI / 8, 0.76);
}
