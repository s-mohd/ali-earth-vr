// Station 2 «البركان»: a friendly volcano diorama.
// Story (t 0→1): a calm, layered cone with a thin steam wisp → smoke and a glowing crater with a low rumble → eruption:
// a lava fountain, a shaded ash plume and a few glowing lava bombs that land on the slopes → lava spills over the low front
// rim, flows down three channels (lighting the rock around it) and pools at the foot (still glowing at t = 1).
// Draw calls: terrain (1), props (1), lava ribbons+pools (1), crater lake (1), fountain+bombs (1), smoke (1), glows (1).
// Terrain and props are Lambert (they cast/receive the game's sun shadow and get its rim light); the terrain shader adds the
// lava's warm light spill, which follows the flow fronts. Lava, fountain, smoke and glows are unlit (no shadows, by design).
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { THREE, PAL, rng, clamp, lerp, seg, smooth, ease, fbm, vcMat, basic, gradient, mergeParts, blobGeo, disposeTree } from '../core/kit.js';
import { LAVA_VS, LAVA_FS, BILL_VS, SMOKE_FS, GLOW_FS, terrainMaterial } from './volcano_glsl.js';
import { rockDetailTexture, puffAtlasTexture } from './volcano_tex.js';

// ---------------------------------------------------------------- shape constants (station-local metres)
const CZ = -0.5;          // cone centre z (back-centre of the plinth)
const H0 = 1.96;          // rim height at the front: the lowest point, where the lava breaches
const DH = 0.34;          // the back rim stands higher, so from the pad you look over the front rim onto the glowing back wall
const RIM = 0.6;          // rim crest radius
const BASE = 2.04;        // mean base radius (y = 0)
const FLOOR = H0 - 0.34;  // crater floor
const LAKE_TOP = H0 - 0.05;
const EDGE = 2.72;        // diorama radius (the game's stone rim sits just outside)

// Front lava channels: start angle (0 = toward the viewer), meander, timing (t when the flow leaves / reaches the foot).
const CHANNELS = [
  { a0: 0.04, amp: 0.08, f: 3.1, ph: 0.6, t0: 0.46, t1: 0.88, w: 1.0 },
  { a0: -0.44, amp: 0.1, f: 2.6, ph: 2.2, t0: 0.5, t1: 0.92, w: 0.9 },
  { a0: 0.46, amp: 0.09, f: 2.8, ph: 4.1, t0: 0.54, t1: 0.95, w: 0.85 },
];
// Old, cooled lava tongues (dark basalt, slightly raised): "this mountain has erupted before". s0/s1 = start/end on the slope.
const OLD_FLOWS = [
  { a0: -0.98, amp: 0.1, f: 2.3, ph: 1.0, s0: 0.04, s1: 0.97, w: 1.0 },
  { a0: 1.04, amp: 0.12, f: 2.0, ph: 3.0, s0: 0.3, s1: 0.9, w: 0.9 }, // from a small flank vent
  { a0: 2.55, amp: 0.1, f: 2.4, ph: 0.2, s0: 0.04, s1: 0.95, w: 1.1 },
  { a0: -2.15, amp: 0.1, f: 2.4, ph: 2.2, s0: 0.2, s1: 0.86, w: 0.9 },
];
// Strata: parallel layer boundaries along the slope (fraction s from rim to foot). Thick soft ash/tuff layers alternate with
// thin hard lava layers; the hard layers stick out a little (a rib at their lower edge) and catch the sun.
const S_B = [0.075, 0.118, 0.205, 0.25, 0.345, 0.392, 0.5, 0.546, 0.665, 0.715];
const LEDGE = 0.016, LEDGE_OFF = 0.018;

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const baseR = (a) => BASE * (1 + 0.04 * Math.sin(3 * a + 0.7) + 0.025 * Math.sin(5 * a + 2.1));
const edgeR = (a) => -CZ * Math.cos(a) + Math.sqrt(CZ * CZ * Math.cos(a) ** 2 - CZ * CZ + EDGE * EDGE); // plinth edge, polar around the cone
const backness = (a) => 0.5 - 0.5 * Math.cos(a); // 0 front .. 1 back
const rimH = (a) => H0 + DH * Math.pow(backness(a), 1.4) + smooth(0.03, 0.3, backness(a)) * (0.022 * Math.sin(7 * a + 1.1) + 0.014 * Math.sin(12 * a + 0.3));
const sB = (k, a) => S_B[k] + 0.014 * Math.sin(3 * a + 0.5) + 0.008 * Math.sin(7 * a + 1.9) + 0.005 * Math.sin(5 * a + k * 2.9);
const flowAngle = (c, rc) => c.a0 + c.amp * Math.sin(rc * c.f + c.ph) * smooth(RIM, RIM + 0.5, rc);
const chHalfW = (c, s) => (0.065 + 0.06 * s) * c.w; // lava core half width along the slope
const wobble = (w, k) => 0.08 * Math.sin(w * 3 + k * 2.1) + 0.06 * Math.sin(w * 5 + 1.3); // periodic in w (2π)
/** Radial gullies (sharp V valleys) and rounded ridges that wander a little on their way down. Roughly -0.9..0.6. */
const gully = (a, s) => (Math.abs(Math.sin(6.5 * a + 0.9 * Math.sin(2 * a) + 1.4 * s)) - 0.6) + 0.45 * (Math.abs(Math.sin(14.5 * a + 0.6 * Math.sin(3 * a + 1) - 0.9 * s + 0.4)) - 0.6);

/** 0..1: how close (rc, a) is to an active lava channel (their beds stay smooth). */
function chNear(rc, a, s) {
  let m = 0;
  for (const c of CHANNELS) {
    const d = angDiff(a, flowAngle(c, rc)) * rc, w = 2.2 * chHalfW(c, s);
    m = Math.max(m, Math.exp(-((d / w) ** 2)));
  }
  return m * smooth(RIM - 0.05, RIM + 0.05, rc);
}
/** Old flow body 0..1 (1 = centre line), with lobed edges and a rounded toe. */
function oldBody(o, rc, a, s) {
  if (s < o.s0 - 0.02 || s > o.s1) return 0;
  let w = o.w * (0.06 + 0.11 * s) * (1 + 0.22 * Math.sin(s * 23 + o.ph));
  const toe = o.s1 - 0.07;
  if (s > toe) w *= Math.sqrt(Math.max(0, 1 - ((s - toe) / 0.07) ** 2));
  if (s < o.s0 + 0.04) w *= smooth(o.s0 - 0.02, o.s0 + 0.04, s);
  const d = Math.abs(angDiff(a, flowAngle(o, rc))) * rc;
  return w > 0.005 ? clamp(1 - (d / w) ** 2) : 0;
}
const breach = (rc, a) => {
  let y = 0;
  for (const c of CHANNELS) y += 0.028 * Math.exp(-(((angDiff(a, c.a0) * rc) / 0.15) ** 2)) * Math.exp(-(((rc - RIM) / 0.1) ** 2));
  return y;
};
/** Ground height (flat near the cone foot and the rim, gentle bumps between). */
function groundY(x, z) {
  const r = Math.hypot(x, z), rc = Math.hypot(x, z - CZ);
  return 0.03 * fbm(x * 1.4 + 5, z * 1.4 + 1, 2) * (1 - smooth(2.2, 2.5, r)) * smooth(BASE + 0.1, BASE + 0.6, rc);
}
/** Terrain height at polar (rc, a) around the cone centre: crater bowl, layered cone, then ground. */
function terrainY(rc, a) {
  const x = Math.sin(a) * rc, z = CZ + Math.cos(a) * rc, top = rimH(a);
  const lip = 0.03 * Math.exp(-(((rc - RIM) / 0.045) ** 2));
  if (rc < RIM) return FLOOR + (top - FLOOR) * Math.pow(rc / RIM, 2.6) + lip - breach(rc, a);
  const bR = baseR(a);
  if (rc >= bR) return groundY(x, z);
  const s = (rc - RIM) / (bR - RIM);
  let y = top * Math.pow(1 - s, 1.38) + lip - breach(rc, a);
  const calm = 1 - chNear(rc, a, s), gw = smooth(0, 0.14, s) * (1 - smooth(0.72, 1, s));
  y += calm * gw * (0.05 * gully(a, s) + 0.035 * fbm(x * 1.6 + 3, z * 1.6 + 7, 2) + 0.016 * fbm(x * 5 + 1, z * 5 + 9, 2));
  const lw = calm * (1 - smooth(0.62, 0.85, s));
  for (let k = 1; k < S_B.length; k += 2) y += lw * LEDGE * Math.exp(-(((s - sB(k, a) + LEDGE_OFF) / 0.011) ** 2));
  for (const o of OLD_FLOWS) { const b = oldBody(o, rc, a, s); if (b > 0) y += 0.022 * Math.sqrt(b); }
  for (const c of CHANNELS) { // carved beds with low levees (the lava will run here)
    const d = angDiff(a, flowAngle(c, rc)) * rc, w = chHalfW(c, s);
    const fade = smooth(RIM - 0.04, RIM + 0.06, rc) * (1 - smooth(0.88, 1, s));
    y += fade * (-0.045 * Math.exp(-((d / w) ** 2)) + 0.02 * Math.exp(-(((Math.abs(d) - 1.6 * w) / (0.6 * w)) ** 2)));
  }
  return y;
}

const lin = (hex) => new THREE.Color(hex);

export default function buildStation(ctx = {}) {
  const { sfx } = ctx;
  const low = ctx.quality === 'low';
  const R = rng(2207);
  const group = new THREE.Group();
  group.name = 'station:volcano';

  const C = {
    sand: lin(PAL.sand), sandDark: lin('#e3c58f'), grass: lin(PAL.grass), grassDark: lin(PAL.grassDark), ashSoil: lin('#86706a'), cinder: lin('#584a48'),
    moss: lin('#93ab5a'), summit: lin('#4f403e'), lip: lin('#d3b8a2'), bowl: lin('#5a4440'), bowlFloor: lin('#2e1e1b'),
    cooled: lin('#3d3334'), cooledEdge: lin('#5b4c4b'), groove: lin('#5e4740'),
  };
  const BANDS = ['#5a4744', '#7d4c40', '#b38d6b', '#5f4c4a', '#8f6a58', '#8e5341', '#c29e78', '#675352', '#94735f', '#7c4f40', '#a88a6e'].map(lin);

  // ---------------------------------------------------------------- props layout (the ground bakes a soft contact shade under them)
  const shrubs = [[-2.2, -0.5, 0.24, 1], [-1.8, -1.55, 0.21, 0], [2.12, -0.3, 0.22, 0], [1.75, -1.65, 0.2, 1], [-2.32, 0.52, 0.17, 0], [2.3, 0.62, 0.16, 1], [-1.0, -2.3, 0.19, 1], [1.1, -2.3, 0.19, 0], [-1.55, -2.02, 0.17, 0], [1.6, -1.98, 0.16, 1]];
  const rosettes = [[-1.62, 0.6, 1], [1.72, 0.32, 1.1], [-0.6, 2.32, 0.7], [2.42, -0.95, 0.9], [-2.45, -0.15, 0.85], [-2.12, -1.05, 0.8]];
  const boulders = [[-1.45, 0.66, 0.12], [1.58, 0.36, 0.11], [-2.42, 0.18, 0.09], [2.38, -1.25, 0.11], [-2.02, -1.12, 0.09], [2.0, -1.0, 0.08], [-0.48, 2.08, 0.065], [0.72, 2.02, 0.06], [-1.22, 2.0, 0.05], [1.2, 2.06, 0.05]];
  const contacts = [...shrubs.map(([x, z, r]) => [x, z, r * 1.2]), ...boulders.map(([x, z, r]) => [x, z, r * 1.3]), ...rosettes.map(([x, z]) => [x, z, 0.12])];

  // ---------------------------------------------------------------- terrain grid: one polar mesh from the crater floor to the plinth edge
  const SEGS = low ? 96 : 144, COLS = SEGS + 1;
  const specs = []; // zone 0 bowl (rc), 1 slope (s(a), band, tag: 1 ledge, 2 under-ledge, 3 lip), 2 ground (g)
  for (const u of [0, 0.3, 0.52, 0.68, 0.8, 0.88, 0.94, 0.98]) specs.push({ zone: 0, rc: u * RIM });
  const sRing = (s, band, tag = 0) => specs.push({ zone: 1, s, band, tag });
  sRing(() => 0, 0, 3); sRing(() => 0.01, 0, 3); sRing(() => 0.026, 0, 0);
  let prev = () => 0.026;
  for (let k = 0; k <= S_B.length; k++) {
    const last = k === S_B.length, p = prev;
    const rib = !last && k % 2 === 1;        // ribs under the thin hard layers
    const next = last ? () => 1 : rib ? (a) => sB(k, a) - LEDGE_OFF : (a) => sB(k, a) - 0.004;
    const nIn = last ? (low ? 3 : 4) : k % 2 === 1 ? 0 : low ? 1 : 2;
    for (let i = 1; i <= nIn; i++) sRing((a) => lerp(p(a), next(a), i / (nIn + 1)), k);
    if (last) break;
    if (rib) sRing(next, k, 1);               // ledge rib: the lit lip of the hard layer
    sRing((a) => sB(k, a) - 0.004, k, rib ? 2 : 0); // its shaded underside
    sRing((a) => sB(k, a) + 0.004, k + 1, 0); // the next layer starts: a crisp colour line
    prev = (a) => sB(k, a) + 0.004;
  }
  sRing(() => 1, S_B.length, 0);
  for (const g of low ? [0.08, 0.22, 0.4, 0.6, 0.8, 1] : [0.05, 0.12, 0.2, 0.3, 0.41, 0.53, 0.66, 0.79, 0.9, 1]) specs.push({ zone: 2, g });
  const ringRc = (sp, a) => (sp.zone === 0 ? sp.rc : sp.zone === 1 ? RIM + (baseR(a) - RIM) * sp.s(a) : baseR(a) + (edgeR(a) - baseR(a)) * sp.g);

  const NR = specs.length, RC = new Float32Array(NR * SEGS), YC = new Float32Array(NR * SEGS);
  for (let i = 0; i < NR; i++) for (let j = 0; j < SEGS; j++) {
    const a = (j / SEGS) * Math.PI * 2, rc = ringRc(specs[i], a);
    RC[i * SEGS + j] = rc;
    YC[i * SEGS + j] = specs[i].zone === 2 && specs[i].g === 1 ? 0 : terrainY(rc, a);
  }
  /** Height of the rendered (faceted) terrain at (x, z), so lava and props sit exactly on the visible surface. */
  function meshY(x, z) {
    const dz = z - CZ, rq = Math.hypot(x, dz);
    let fj = (Math.atan2(x, dz) / (Math.PI * 2)) * SEGS;
    if (fj < 0) fj += SEGS;
    const j = Math.floor(fj) % SEGS, j1 = (j + 1) % SEGS, u = fj - Math.floor(fj);
    for (let i = 1; i < NR; i++) {
      const r1 = lerp(RC[i * SEGS + j], RC[i * SEGS + j1], u);
      if (rq > r1) continue;
      const r0 = lerp(RC[(i - 1) * SEGS + j], RC[(i - 1) * SEGS + j1], u), v = (rq - r0) / (r1 - r0 || 1);
      const y00 = YC[(i - 1) * SEGS + j], y10 = YC[(i - 1) * SEGS + j1], y01 = YC[i * SEGS + j], y11 = YC[i * SEGS + j1];
      return u + v <= 1 ? y00 + u * (y10 - y00) + v * (y01 - y00) : y11 + (1 - u) * (y01 - y11) + (1 - v) * (y10 - y11);
    }
    return 0;
  }

  // ---------------------------------------------------------------- lava channels: centrelines on the real surface, foot pools
  const chans = CHANNELS.map((c, k) => {
    const N = 400, r0 = RIM - 0.03, r1 = baseR(flowAngle(c, BASE)) + 0.02, dense = [];
    for (let i = 0; i <= N; i++) {
      const rc = lerp(r0, r1, i / N), a = flowAngle(c, rc), x = Math.sin(a) * rc, z = CZ + Math.cos(a) * rc;
      dense.push([x, meshY(x, z), z]);
    }
    const cum = new Float32Array(N + 1);
    for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]);
    const L = cum[N];
    const alongAt = (rc) => { const f = clamp((rc - r0) / (r1 - r0)) * N, i = Math.min(N - 1, Math.floor(f)); return lerp(cum[i], cum[i + 1], f - i) / L; };
    const a1 = flowAngle(c, r1 - 0.01), ex = Math.sin(a1) * (r1 - 0.01), ez = CZ + Math.cos(a1) * (r1 - 0.01);
    let dx = dense[N][0] - ex, dz = dense[N][2] - ez; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const ps = c.w * (k ? 0.75 : 1); // side pools stay small: clear of the front corners
    return { c, k, r0, r1, dense, cum, L, alongAt, end: [dense[N][0], dense[N][2]], dir: [dx, dz], side: [dz, -dx], ax: 0.62 * ps, ay: 0.54 * ps, px: dense[N][0] + dx * 0.12, pz: dense[N][2] + dz * 0.12 };
  });

  // ---------------------------------------------------------------- terrain colours (strata, gullies, old flows, moss, ground) and heat
  const cA = new THREE.Color(), cB = new THREE.Color();
  function groundColor(x, z, out) {
    const r = Math.hypot(x, z), rc = Math.hypot(x, z - CZ);
    const n = fbm(x * 1.7 + 11, z * 1.7 + 3, 3), n2 = fbm(x * 5 + 2, z * 5 + 8, 2);
    out.copy(C.sand).lerp(C.sandDark, smooth(-0.15, 0.3, n2) * 0.6);
    const grass = smooth(0.0, 0.07, n + 0.24 * (r - 1.95));
    out.lerp(C.grass, grass * 0.92).lerp(C.grassDark, grass * smooth(0.05, 0.35, n2) * 0.55);
    const ash = 1 - smooth(BASE - 0.1, BASE + 0.32 + 0.25 * n, rc); // dark volcanic soil and cinders around the foot
    out.lerp(C.ashSoil, ash * 0.85).lerp(C.cinder, ash * smooth(-0.05, 0.3, n2) * 0.55);
    for (const [px, pz, pr] of contacts) { const d = Math.hypot(x - px, z - pz); if (d < pr * 1.5) out.multiplyScalar(1 - 0.22 * (1 - smooth(pr * 0.4, pr * 1.5, d))); }
    return out;
  }
  function terrainColor(sp, rc, a, x, y, z, out) {
    if (sp.zone === 2) return groundColor(x, z, out);
    if (sp.zone === 0) { // crater: dark layered walls, scorched floor, a pale crest
      const u = rc / RIM;
      out.copy(C.bowlFloor).lerp(C.bowl, smooth(0.3, 0.95, u));
      out.multiplyScalar(1 + 0.14 * Math.sin(y * 55 + 3 * fbm(a * 2, y * 3, 2)));
      return out.lerp(C.lip, smooth(0.94, 1, u) * 0.3);
    }
    const s = clamp((rc - RIM) / (baseR(a) - RIM)), near = chNear(rc, a, s);
    out.copy(BANDS[sp.band]).multiplyScalar(1 + 0.1 * fbm(x * 3.1 + 2, z * 3.1 + y * 2, 2) + 0.07 * fbm(x * 9 + 5, z * 9 + y * 5, 1));
    if (sp.tag === 1) out.multiplyScalar(1.16); else if (sp.tag === 2) out.multiplyScalar(0.74);
    out.multiplyScalar(1 + 0.28 * gully(a, s) * smooth(0, 0.12, s) * (1 - smooth(0.75, 1, s)) * (1 - near)); // lit ridges, ash-dark gullies
    out.multiplyScalar(1 + 0.13 * fbm(a * 9 + 3, s * 1.6 + 1, 2)); // streaks running down the slope
    out.lerp(C.summit, (1 - smooth(0.02, 0.22, s)) * 0.5);
    if (sp.tag === 3) out.lerp(C.lip, 0.6); // the crater rim reads as a clean pale edge
    for (const o of OLD_FLOWS) { const b = oldBody(o, rc, a, s); if (b > 0) out.lerp(cB.copy(C.cooledEdge).lerp(C.cooled, smooth(0.15, 0.6, b)), smooth(0, 0.2, b) * 0.9); }
    for (const c of CHANNELS) { // fresh lava paths are darker grooves even before the eruption
      const d = Math.abs(angDiff(a, flowAngle(c, rc)) * rc), w = chHalfW(c, s);
      out.lerp(C.groove, (1 - smooth(w * 0.6, w * 1.4, d)) * smooth(RIM - 0.02, RIM + 0.1, rc) * 0.45);
    }
    out.lerp(C.moss, smooth(0.5, 0.8, s) * smooth(0.08, 0.16, fbm(x * 3.1, z * 3.1, 2) + 0.08 * Math.sin(a * 5)) * 0.62 * (1 - near)); // scrub patches on the old lower slopes
    if (s > 0.8) out.lerp(groundColor(x, z, cB), smooth(0.8, 1.0, s));
    return out;
  }
  const SPILL = 0.11; // metres of warm light around the lava
  function heatAt(rc, a, x, y, z, h) {
    h[0] = rc < RIM ? clamp(1 - ((y - LAKE_TOP) / Math.max(0.05, rimH(a) - LAKE_TOP)) * 0.85, 0.12, 1) : 0.12 * (1 - smooth(RIM, RIM + 0.08, rc));
    h[1] = -1; h[2] = 0; h[3] = 0;
    for (const ch of chans) {
      if (rc <= ch.r1 && rc >= RIM - 0.05) {
        const along = ch.alongAt(rc), d = Math.abs(angDiff(a, flowAngle(ch.c, rc))) * rc;
        const w = Math.exp(-((Math.max(0, d - 0.86 * chHalfW(ch.c, along)) / SPILL) ** 2));
        if (w > h[3]) { h[1] = ch.k; h[2] = along; h[3] = w; }
      }
      const u = (x - ch.px) * ch.dir[0] + (z - ch.pz) * ch.dir[1], v = (x - ch.px) * ch.side[0] + (z - ch.pz) * ch.side[1];
      const rad = Math.hypot(u / ch.ax, v / ch.ay), w = Math.exp(-((Math.max(0, rad - 0.45) * Math.min(ch.ax, ch.ay) / SPILL) ** 2));
      if (w > h[3]) { h[1] = ch.k; h[2] = 1 + Math.min(rad, 0.45) * 0.25; h[3] = w; }
    }
    if (h[3] < 0.02) { h[1] = -1; h[3] = 0; }
  }

  const terrainGeo = (() => {
    const NV = NR * COLS, pos = new Float32Array((NV + 2 * COLS) * 3), col = new Float32Array((NV + 2 * COLS) * 3);
    const uv = new Float32Array((NV + 2 * COLS) * 2), heat = new Float32Array((NV + 2 * COLS) * 4), hv = [0, 0, 0, 0];
    const NU = 12, TILE = 1.1, vacc = new Float32Array(COLS);
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < COLS; j++) {
        const jj = j % SEGS, a = (jj / SEGS) * Math.PI * 2, rc = RC[i * SEGS + jj], y = YC[i * SEGS + jj];
        const x = Math.sin(a) * rc, z = CZ + Math.cos(a) * rc, o = i * COLS + j;
        if (i > 0) { const p = (o - COLS) * 3; vacc[j] += Math.hypot(x - pos[p], y - pos[p + 1], z - pos[p + 2]); }
        pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
        if (j === SEGS) { // seam column duplicates column 0 (own u)
          col.copyWithin(o * 3, (o - SEGS) * 3, (o - SEGS) * 3 + 3);
          heat.copyWithin(o * 4, (o - SEGS) * 4, (o - SEGS) * 4 + 4);
        } else {
          terrainColor(specs[i], rc, a, x, y, z, cA);
          col[o * 3] = cA.r; col[o * 3 + 1] = cA.g; col[o * 3 + 2] = cA.b;
          heatAt(rc, a, x, y, z, hv);
          heat.set(hv, o * 4);
        }
        uv[o * 2] = (j / SEGS) * NU; uv[o * 2 + 1] = vacc[j] / TILE;
      }
    }
    // skirt (own vertices, so the top edge keeps clean normals): edge ring copy + a ring at y = -1
    const sk = NV, skin = new THREE.Color(PAL.soilDark);
    for (let r = 0; r < 2; r++) for (let j = 0; j < COLS; j++) {
      const src = ((NR - 1) * COLS + j) * 3, o = sk + r * COLS + j;
      pos[o * 3] = pos[src]; pos[o * 3 + 1] = r ? -1 : pos[src + 1]; pos[o * 3 + 2] = pos[src + 2];
      col[o * 3] = skin.r; col[o * 3 + 1] = skin.g; col[o * 3 + 2] = skin.b;
      uv[o * 2] = (j / SEGS) * NU * 2; uv[o * 2 + 1] = r;
      heat[o * 4 + 1] = -1;
    }
    const idx = [];
    for (let i = 1; i < NR; i++) for (let j = 0; j < SEGS; j++) {
      const a0 = (i - 1) * COLS + j, b0 = i * COLS + j;
      idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
    for (let j = 0; j < SEGS; j++) { const a0 = sk + j, b0 = sk + COLS + j; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aHeat', new THREE.BufferAttribute(heat, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.attributes.normal.array; // weld the seam's normals
    for (let i = 0; i < NR; i++) {
      const p = i * COLS * 3, q = (i * COLS + SEGS) * 3;
      for (let k = 0; k < 3; k++) n[p + k] = n[q + k] = n[p + k] + n[q + k];
      const l = Math.hypot(n[p], n[p + 1], n[p + 2]) || 1;
      for (let k = 0; k < 3; k++) n[p + k] = n[q + k] = n[p + k] / l;
    }
    return g;
  })();
  const detailTex = rockDetailTexture(low ? 256 : 512);
  const heatU = { uHeatFront: { value: new THREE.Vector4(-1, -1, -1, 0) }, uTime: { value: 0 }, uHeatCol: { value: lin('#ff6a1f').multiplyScalar(0.42) } };
  const terrainMat = terrainMaterial(detailTex, heatU);
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.name = 'volcano:terrain';
  group.add(terrain);

  // ---------------------------------------------------------------- props: hardy shrubs, spiky rosettes, basalt boulders, cinders, grass, flowers (merged)
  const parts = [];
  const rockGeo = (r, seed, squash, jitter = 0.3, detail = 1) => blobGeo(r, { detail, jitter, seed, squash, flat: true });
  shrubs.forEach(([x, z, r, sage], i) => {
    const y0 = meshY(x, z), [lo, hi] = sage ? ['#5f7a4c', '#b3c78c'] : [PAL.leafDark, PAL.leafLight];
    parts.push({ geo: gradient(smoothBlob(r, 2, 40 + i, 0.72), lo, hi), pos: [x, y0 + r * 0.5, z] });
    parts.push({ geo: gradient(smoothBlob(r * 0.62, 1, 60 + i, 0.78), lo, hi), pos: [x + r * 0.72, y0 + r * 0.32, z + r * 0.3] });
    parts.push({ geo: gradient(smoothBlob(r * 0.5, 1, 70 + i, 0.8), lo, sage ? '#c9d6a2' : PAL.leaf), pos: [x - r * 0.62, y0 + r * 0.26, z - r * 0.28] });
  });
  const leaves = [0.35, 0.62, 0.9].map((tilt) => new THREE.ConeGeometry(0.02, 0.17, 3).translate(0, 0.085, 0).scale(1, 1, 0.42).rotateX(tilt));
  rosettes.forEach(([x, z, sc], i) => {
    const y0 = meshY(x, z);
    for (let k = 0; k < 9; k++) {
      const g = gradient(leaves[k % 3].clone(), '#4f7a45', k % 2 ? '#a9c47e' : '#8fb86c');
      parts.push({ geo: g, pos: [x, y0 - 0.01, z], rot: [0, (k / 9) * Math.PI * 2 + i, 0], scale: sc * (0.8 + 0.3 * ((k * 7) % 5) / 4) });
    }
  });
  boulders.forEach(([x, z, r], i) => {
    const g = gradient(rockGeo(r, 80 + i, 0.62), '#3e3331', i % 2 ? '#7f6a63' : '#8c766b');
    parts.push({ geo: g, pos: [x, meshY(x, z) + r * 0.22, z], rot: [0, R() * 6, 0] });
  });
  // basalt outcrops on the flanks (clear of the lava channels)
  for (let i = 0, n = 0; i < 400 && n < (low ? 10 : 18); i++) {
    const a = R() * Math.PI * 2, s = 0.14 + R() * 0.7, rc = RIM + (baseR(a) - RIM) * s;
    if (CHANNELS.some((c) => Math.abs(angDiff(a, flowAngle(c, rc))) * rc < 0.26)) continue;
    n++;
    const r = 0.06 + R() * 0.07 * (0.6 + s), x = Math.sin(a) * rc, z = CZ + Math.cos(a) * rc;
    parts.push({ geo: gradient(rockGeo(r, 120 + i, 0.5), '#3a302f', n % 3 ? '#7a6560' : '#9a7f70'), pos: [x, meshY(x, z) - r * 0.12, z], rot: [R() * 0.5, R() * 6, 0] });
  }
  // talus: loose blocks that rolled down and gathered around the foot (clear of the channels and pools)
  for (let i = 0, n = 0; i < 400 && n < (low ? 12 : 24); i++) {
    const a = R() * Math.PI * 2, rc = baseR(a) - 0.28 + R() * 0.4, x = Math.sin(a) * rc, z = CZ + Math.cos(a) * rc;
    if (CHANNELS.some((c) => Math.abs(angDiff(a, flowAngle(c, rc))) * rc < 0.28) || (z > 0.8 && Math.abs(x) > 1.25)) continue;
    if (chans.some((ch) => Math.hypot(x - ch.px, z - ch.pz) < 0.75)) continue;
    n++;
    const r = 0.03 + R() * R() * 0.05;
    parts.push({ geo: gradient(rockGeo(r, 300 + i, 0.6, 0.35, 0), '#403533', n % 3 ? '#7d6862' : '#94786b'), pos: [x, meshY(x, z) + r * 0.15, z], rot: [R(), R() * 6, R()] });
  }
  // cinders around the foot and pale limestone pebbles toward the edge
  const pebble = new THREE.IcosahedronGeometry(1, 0);
  const inPool = (x, z, m) => chans.some((ch) => { const u = (x - ch.px) * ch.dir[0] + (z - ch.pz) * ch.dir[1], v = (x - ch.px) * ch.side[0] + (z - ch.pz) * ch.side[1]; return Math.hypot(u / ch.ax, v / ch.ay) < m; });
  for (let i = 0, n = 0; i < 500 && n < (low ? 18 : 34); i++) {
    const a = R() * Math.PI * 2, far = n % 2 === 0, rc = far ? 2.2 + R() * 0.9 : baseR(a) + 0.02 + R() * 0.45;
    const x = Math.sin(a) * rc, z = CZ + Math.cos(a) * rc;
    if (Math.hypot(x, z) > 2.6 || inPool(x, z, 0.75) || CHANNELS.some((c) => Math.abs(angDiff(a, flowAngle(c, rc))) * rc < 0.2)) continue;
    n++;
    const r = (far ? 0.022 : 0.018) + R() * 0.018;
    parts.push({ geo: pebble, color: far ? (n % 4 ? '#e2cfac' : '#cdb48e') : n % 3 ? '#5c4d4a' : '#74625c', pos: [x, meshY(x, z) + r * 0.25, z], rot: [R() * 3, R() * 3, R() * 3], scale: [r, r * 0.7, r * 1.15] });
  }
  // grass tufts (curved blades, green on grass, straw on sand) and a few low flowers (never in the front corners)
  const blade = bladeGeo(), flowers = [flowerGeo(PAL.coral), flowerGeo('#fff3e8'), flowerGeo('#ffd164')], stem = new THREE.CylinderGeometry(0.004, 0.005, 0.07, 4);
  for (let i = 0, n = 0; i < 300 && n < (low ? 14 : 24); i++) {
    const a = R() * Math.PI * 2, r = 1.9 + R() * 0.72, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z - CZ) < BASE + 0.3 || Math.hypot(x, z) > 2.62 || inPool(x, z, 1.3)) continue;
    if (z > 0.75 && Math.abs(x) > 1.2) continue; // Ali's and the board's corners stay flat
    n++;
    const y0 = meshY(x, z), yaw = R() * 6.28, dry = R() < 0.35;
    for (let k = 0; k < 5; k++) {
      parts.push({ geo: blade, color: dry ? (k % 2 ? '#c9bb73' : '#a9a35d') : k % 2 ? PAL.leaf : PAL.grassDark, pos: [x, y0 - 0.005, z], rot: [0, yaw + k * 1.26 + R() * 0.5, 0], scale: [1, 0.7 + 0.45 * R(), 1] });
    }
    if (n % 3 === 0) {
      const fx = x + 0.05, fz = z + 0.03;
      parts.push({ geo: stem, color: PAL.grassDark, pos: [fx, y0 + 0.035, fz] });
      parts.push({ geo: flowers[n % 3], pos: [fx, y0 + 0.072, fz], rot: [-Math.PI / 2 + 0.45, 0, R() * 6] });
    }
  }
  const props = new THREE.Mesh(mergeParts(parts), vcMat());
  props.name = 'volcano:props';
  group.add(props);

  // ---------------------------------------------------------------- lava ribbons + pools (one geometry, one custom shader)
  const lavaMat = new THREE.ShaderMaterial({
    vertexShader: LAVA_VS, fragmentShader: LAVA_FS, transparent: true, depthWrite: false, // overlapping halos must not occlude each other
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uTime: { value: 0 }, uCool: { value: 0 }, uFront: { value: new THREE.Vector4(-1, -1, -1, -1) },
      uHot: { value: lin('#ffe36e') }, uMid: { value: lin('#ff8a2a') }, uDeep: { value: lin('#e2452a') },
      uCrust: { value: lin('#73281a') }, uCrust2: { value: lin('#9a4220') }, uGlow: { value: lin('#ff7a2a') },
    },
  });
  const paths = []; // per channel centreline (xyz per row), used to place the evidence
  const lavaGeo = (() => {
    const pos = [], A = [], B = [], idx = [], pidx = []; // pools are drawn first so ribbon lava covers their back edge
    const ACROSS = [-1, -0.75, -0.5, -0.3, -0.12, 0, 0.12, 0.3, 0.5, 0.75, 1];
    const NA = ACROSS.length, ROWS = 64;
    chans.forEach((ch, k) => {
      const c = ch.c, rows = [];
      for (let i = 0, j = 0; i <= ROWS; i++) { // resample the centreline at equal arc length
        const target = (i / ROWS) * ch.L;
        while (j < ch.dense.length - 2 && ch.cum[j + 1] < target) j++;
        const f = (target - ch.cum[j]) / (ch.cum[j + 1] - ch.cum[j] || 1);
        rows.push([lerp(ch.dense[j][0], ch.dense[j + 1][0], f), lerp(ch.dense[j][2], ch.dense[j + 1][2], f), target]);
      }
      const pts = new Float32Array((ROWS + 1) * 3), base = pos.length / 3;
      rows.forEach(([x, z, m], i) => {
        const p0 = rows[Math.max(0, i - 1)], p1 = rows[Math.min(ROWS, i + 1)];
        let dx = p1[0] - p0[0], dz = p1[1] - p0[1];
        const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const sx = dz, sz = -dx; // horizontal side vector
        const s = i / ROWS, hw = chHalfW(c, s) * 2 * (1 + 0.6 * smooth(0.85, 1, s)); // halo half width (core = half of it)
        for (const ac of ACROSS) {
          const px = x + sx * ac * hw, pz = z + sz * ac * hw, core = Math.max(0, 1 - (ac / 0.5) ** 2);
          pos.push(px, meshY(px, pz) + 0.014 + 0.03 * core, pz);
          A.push(s, Math.abs(ac), ch.L / hw, k);
          B.push(wobble(m * 2.3, k), ac * hw, m);
        }
        pts[i * 3] = x; pts[i * 3 + 1] = meshY(x, z) + 0.05; pts[i * 3 + 2] = z;
      });
      for (let i = 0; i < ROWS; i++) for (let j = 0; j < NA - 1; j++) {
        const a0 = base + i * NA + j, a1 = a0 + NA;
        idx.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1);
      }
      // pool: an ellipse spreading from the channel end onto the flat ground
      const PR = 6, PS = 28, Pl = 0.25, pBase = pos.length / 3;
      const putPool = (rad, th) => {
        const u = Math.cos(th) * ch.ax * rad, v = Math.sin(th) * ch.ay * rad;
        const px = ch.px + ch.dir[0] * u + ch.side[0] * v, pz = ch.pz + ch.dir[1] * u + ch.side[1] * v;
        pos.push(px, meshY(px, pz) + 0.018 + 0.035 * Math.max(0, 1 - (rad / 0.5) ** 2), pz);
        A.push(1 + rad * Pl, rad, 1 / Pl, k);
        B.push(wobble(th, k), v, ch.L + 0.12 + u);
      };
      putPool(0, 0);
      for (let r = 1; r <= PR; r++) for (let j = 0; j < PS; j++) putPool(r / PR, (j / PS) * Math.PI * 2);
      for (let j = 0; j < PS; j++) pidx.push(pBase, pBase + 1 + j, pBase + 1 + ((j + 1) % PS));
      for (let r = 1; r < PR; r++) for (let j = 0; j < PS; j++) {
        const a0 = pBase + 1 + (r - 1) * PS + j, a1 = pBase + 1 + (r - 1) * PS + ((j + 1) % PS);
        pidx.push(a0, a0 + PS, a1, a1, a0 + PS, a1 + PS);
      }
      paths.push({ pts, rows: ROWS });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 4));
    g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 3));
    g.setIndex([...pidx, ...idx]);
    g.computeBoundingSphere();
    return g;
  })();
  const lava = new THREE.Mesh(lavaGeo, lavaMat);
  lava.renderOrder = 1;
  group.add(lava);

  // crater lake (same material, channel id 3): rises inside the bowl and spreads from the centre
  const lakeGeo = (() => {
    const pos = [], A = [], B = [], idx = [], PR = 5, PS = 28, LR = 0.52;
    const put = (rad, th) => {
      const x = Math.cos(th) * LR * rad, z = Math.sin(th) * LR * rad;
      pos.push(x, 0, z); A.push(rad * 0.3, rad * 0.4, 1 / 0.3, 3); B.push(wobble(th, 3), x, z);
    };
    put(0, 0);
    for (let r = 1; r <= PR; r++) for (let j = 0; j < PS; j++) put(r / PR, (j / PS) * Math.PI * 2);
    for (let j = 0; j < PS; j++) idx.push(0, 1 + ((j + 1) % PS), 1 + j);
    for (let r = 1; r < PR; r++) for (let j = 0; j < PS; j++) {
      const a0 = 1 + (r - 1) * PS + j, a1 = 1 + (r - 1) * PS + ((j + 1) % PS);
      idx.push(a0, a1, a0 + PS, a1, a1 + PS, a0 + PS);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 4));
    g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 3));
    g.setIndex(idx);
    return g;
  })();
  const lake = new THREE.Mesh(lakeGeo, lavaMat);
  lake.position.set(0, FLOOR, CZ);
  lake.renderOrder = 1;
  group.add(lake);

  // ---------------------------------------------------------------- fountain chunks + lava bombs (instanced, unlit hot colours)
  const NF = low ? 50 : 90;
  const G = 3.9; // gentle "toy" gravity: slow, readable arcs
  // Lava bombs: a pure function of t. Each is thrown from the crater, lands on a front/side slope and cools to dark rock.
  const BOMBS = [];
  for (let tries = 0; BOMBS.length < (low ? 5 : 8) && tries < 600; tries++) {
    const a = (R() - 0.5) * 2.7, s = 0.28 + R() * 0.5, rc = RIM + (baseR(a) - RIM) * s;
    const x = Math.sin(a) * rc, z = CZ + Math.cos(a) * rc;
    if (CHANNELS.some((c) => Math.abs(angDiff(a, flowAngle(c, rc))) * rc < 0.2) || BOMBS.some((b) => Math.hypot(b.x - x, b.z - z) < 0.3)) continue;
    const n = BOMBS.length, size = 0.026 + R() * 0.018, t0 = 0.27 + n * 0.035 + R() * 0.02;
    BOMBS.push({ x, z, y: meshY(x, z) + size * 0.55, t0, t1: t0 + 0.05 + 0.03 * R(), apex: 0.55 + R() * 0.5, size, sx: (R() - 0.5) * 0.1 });
  }
  const NB = BOMBS.length, NI = NF + NB;
  const fountain = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), basic('#ffffff', { unique: true }), NI);
  fountain.frustumCulled = false;
  const fc = new Float32Array(NI * 3);
  fountain.instanceColor = new THREE.InstancedBufferAttribute(fc, 3);
  const F = [], FP = new Float32Array(NF); // per-chunk flight phase 0..1, advanced in update() (never jumps when the level changes)
  for (let i = 0; i < NF; i++) {
    const th = R() * Math.PI * 2, lat = Math.pow(R(), 0.8), v = 1 - 0.15 * lat - 0.08 * R();
    // apex = level * v^2; flight period for that apex = tk * sqrt(level) (12% extra: the chunk sinks back into the lake)
    F.push({ dx: Math.sin(th), dz: Math.cos(th) * 0.8 + 0.2, lat, v2: v * v, tk: 1.12 * 2 * Math.sqrt(2 / G) * v, size: 0.018 + R() * 0.03, temp: R() * 0.6 + lat * 0.4 });
    FP[i] = R();
  }
  group.add(fountain);

  // ---------------------------------------------------------------- smoke / ash plume (instanced billboards, shaded puff atlas)
  const NS = low ? 20 : 30;
  const puffTex = puffAtlasTexture(low ? 256 : 512);
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  const sP = new Float32Array(NS * 4);
  smokeGeo.setAttribute('aP', new THREE.InstancedBufferAttribute(sP, 4));
  const smokeMat = new THREE.ShaderMaterial({
    vertexShader: BILL_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false,
    uniforms: {
      uTex: { value: puffTex }, uLit: { value: lin('#f5f1f2') }, uShade: { value: lin('#b8b1bd') },
      uAshLit: { value: lin('#a0989f') }, uAshShade: { value: lin('#4e4755') }, uWarm: { value: lin('#ff9550') },
    },
  });
  const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, NS);
  smoke.frustumCulled = false;
  smoke.renderOrder = 2;
  const S = [], sAge = new Float32Array(NS), sOrd = new Int16Array(NS);
  for (let i = 0; i < NS; i++) S.push({ ph: i / NS + R() * 0.02, jx: R() * 2 - 1, jz: R() * 2 - 1, size: 0.8 + R() * 0.4, sp: 0.9 + R() * 0.2, dark: R(), cell: i % 4 });
  group.add(smoke);

  // ---------------------------------------------------------------- soft glows above the crater (the lava itself carries its ground glow)
  const NG = 2;
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const gP = new Float32Array(NG * 4);
  glowGeo.setAttribute('aP', new THREE.InstancedBufferAttribute(gP, 4));
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: BILL_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const glows = new THREE.InstancedMesh(glowGeo, glowMat, NG);
  glows.frustumCulled = false;
  glows.renderOrder = 3;
  group.add(glows);

  // ---------------------------------------------------------------- story state (a pure function of t)
  const st = { t: 0, smoke: 0, ash: 0, glow: 0, fountain: 0, lakeY: FLOOR, fronts: [-1, -1, -1], time: 0 };
  let playing = false, prevT = 0, rumble = null, lavaLoop = null, gainR = -1, gainL = -1;

  function setProgress(t) {
    t = clamp(t);
    st.t = t;
    st.smoke = 0.2 + 0.8 * (0.7 * smooth(0.02, 0.18, t) + 0.3 * smooth(0.24, 0.32, t)) * (1 - 0.35 * smooth(0.62, 0.95, t)); // a thin steam wisp at rest
    st.ash = smooth(0.24, 0.32, t) * (1 - 0.32 * smooth(0.6, 1, t));
    st.glow = (0.7 * smooth(0.06, 0.22, t) + 0.3 * smooth(0.24, 0.3, t)) * (1 - 0.2 * smooth(0.8, 1, t));
    st.fountain = 0.1 * smooth(0.14, 0.24, t) + smooth(0.245, 0.29, t) * (0.9 - 0.6 * smooth(0.55, 0.85, t));
    st.lakeY = lerp(FLOOR + 0.03, LAKE_TOP, ease.inOut(seg(t, 0.06, 0.32)));
    let flowing = false;
    for (let k = 0; k < CHANNELS.length; k++) {
      const c = CHANNELS[k], x = seg(t, c.t0, c.t1);
      st.fronts[k] = x <= 0 ? -0.05 : 1.15 * (1 - Math.pow(1 - x, 1.5)); // fast at the vent, slowing toward the foot
      flowing = flowing || x > 0;
    }
    const u = lavaMat.uniforms;
    u.uFront.value.set(st.fronts[0], st.fronts[1], st.fronts[2], lerp(-0.05, 0.4, seg(t, 0.05, 0.2)));
    u.uCool.value = smooth(0.8, 1, t);
    heatU.uHeatFront.value.set(st.fronts[0], st.fronts[1], st.fronts[2], st.glow);
    lava.visible = flowing;
    lake.visible = t > 0.05;
    lake.position.y = st.lakeY;
    if (playing) sound(t);
    prevT = t;
    animate(st.time);
  }

  function sound(t) {
    if (prevT < 0.25 && t >= 0.25) sfx.play('boom', { gain: 0.9 });                // the eruption
    if (prevT < 0.46 && t >= 0.46) sfx.play('boom', { gain: 0.4, rate: 0.75 });    // lava spills over the rim
    const gr = Math.round((0.25 * smooth(0.01, 0.08, t) + 0.5 * smooth(0.22, 0.3, t) - 0.4 * smooth(0.55, 0.95, t)) * 20) / 20;
    if (rumble && gr !== gainR) { rumble.set({ gain: gr }); gainR = gr; }
    const gl = Math.round((0.6 * smooth(0.44, 0.55, t) - 0.15 * smooth(0.9, 1, t)) * 20) / 20;
    if (lavaLoop && gl !== gainL) { lavaLoop.set({ gain: gl }); gainL = gl; }
  }

  // ---------------------------------------------------------------- particles & glows (ambient clock × story levels)
  const hot = lin(PAL.lavaHot), mid = lin(PAL.lava), deep = lin(PAL.lavaDeep), coal = lin('#4a3936'), GLOW_COL = lin('#ff7426'), cc = new THREE.Color();
  function setInst(arr, i, x, y, z, s) { // uniform scale + translation, written in place (no allocations)
    const o = i * 16;
    arr.fill(0, o, o + 16);
    arr[o] = arr[o + 5] = arr[o + 10] = s;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }
  const fountainLevel = (I) => 0.08 + 1.25 * I; // arc apex factor (m) for eruption level I
  function putGlow(i, y, size, inten, alphaShare) {
    setInst(glows.instanceMatrix.array, i, 0, y, CZ, size);
    gP[i * 4] = GLOW_COL.r * inten; gP[i * 4 + 1] = GLOW_COL.g * inten; gP[i * 4 + 2] = GLOW_COL.b * inten; gP[i * 4 + 3] = inten * alphaShare;
  }
  function animate(time) {
    const lakeY = st.lakeY, I = st.fountain, t = st.t;
    // lava fountain: chunks thrown up from the lake surface, cooling from yellow to red as they fall back
    const bombsOut = NB > 0 && t > BOMBS[0].t0;
    fountain.visible = I > 0.01 || bombsOut;
    if (fountain.visible) {
      const m = fountain.instanceMatrix.array, level = fountainLevel(I), spread = 0.08 + 0.5 * I;
      for (let i = 0; i < NF; i++) {
        const f = F[i], p = FP[i], q = p * 1.12; // q: 0 launch .. 1 back at the lake level .. 1.12 sunk
        const lat = f.lat * spread * Math.min(1, q);
        const s = I > 0.01 ? f.size * (0.45 + 0.55 * I) * Math.min(1, p / 0.06) * (p > 0.84 ? (1 - p) / 0.16 : 1) : 0;
        setInst(m, i, f.dx * lat, lakeY + level * f.v2 * 4 * q * (1 - q), CZ + f.dz * lat, s);
        const k = clamp(p * 0.95 + f.temp * 0.25 - 0.2);
        if (k < 0.5) cc.copy(hot).lerp(mid, k * 2); else cc.copy(mid).lerp(deep, (k - 0.5) * 2);
        fc[i * 3] = cc.r; fc[i * 3 + 1] = cc.g; fc[i * 3 + 2] = cc.b;
      }
      for (let b = 0; b < NB; b++) { // lava bombs (story state: t only)
        const B = BOMBS[b], i = NF + b;
        if (t <= B.t0) { setInst(m, i, 0, 0, 0, 0); continue; }
        if (t < B.t1) {
          const f = (t - B.t0) / (B.t1 - B.t0), y0 = H0 - 0.06;
          setInst(m, i, lerp(B.sx, B.x, f), lerp(y0, B.y, f) + B.apex * 4 * f * (1 - f), lerp(CZ, B.z, f), B.size * Math.min(1, f * 6));
          cc.copy(hot).lerp(mid, f);
        } else {
          setInst(m, i, B.x, B.y, B.z, B.size);
          const k = seg(t, B.t1, B.t1 + 0.22);
          if (k < 0.35) cc.copy(mid).lerp(deep, k / 0.35); else cc.copy(deep).lerp(coal, (k - 0.35) / 0.65);
        }
        fc[i * 3] = cc.r; fc[i * 3 + 1] = cc.g; fc[i * 3 + 2] = cc.b;
      }
      fountain.instanceMatrix.needsUpdate = true;
      fountain.instanceColor.needsUpdate = true;
    }
    // steam, then a darker billowing ash plume; rises, swells and drifts up and back, away from the viewer; lit orange from below
    smoke.visible = st.smoke > 0.01;
    if (smoke.visible) {
      const m = smoke.instanceMatrix.array, lvl = st.smoke, ash = st.ash;
      const rise = lerp(0.85, 2.9, ash) * (0.5 + 0.5 * lvl), y0 = Math.max(lakeY, H0 - 0.12) + 0.04, spread = 0.06 + 0.14 * ash;
      for (let i = 0; i < NS; i++) { // draw the oldest (highest, farthest) puffs first
        sAge[i] = (time * 0.11 * S[i].sp + S[i].ph) % 1;
        let k = i;
        while (k > 0 && sAge[sOrd[k - 1]] < sAge[i]) { sOrd[k] = sOrd[k - 1]; k--; }
        sOrd[k] = i;
      }
      for (let k = 0; k < NS; k++) {
        const i = sOrd[k], q = S[i], p = sAge[i];
        const x = q.jx * spread * (0.3 + p) - 0.4 * p * p, z = CZ - 0.08 + q.jz * spread * (0.3 + p) - 0.6 * p * p;
        const a = lvl * smooth(0, 0.08, p) * (1 - smooth(0.62, 1, p)) * 0.92; // faded puffs get scale 0: no wasted overdraw
        const size = (0.3 + (1.1 + 0.45 * ash) * p) * (0.45 + 0.55 * lvl) * q.size;
        setInst(m, k, x, y0 + rise * (1 - Math.pow(1 - p, 1.5)), z, a < 0.02 ? 0 : Math.min(1.45, size));
        sP[k * 4] = a;
        sP[k * 4 + 1] = st.glow * (1 - smooth(0.05, 0.55, p)) * 0.85;
        sP[k * 4 + 2] = ash * (0.5 + 0.5 * q.dark);
        sP[k * 4 + 3] = q.cell;
      }
      smoke.instanceMatrix.needsUpdate = true;
      smokeGeo.attributes.aP.needsUpdate = true;
    }
    // soft glows: the crater, and the fountain's hot core
    glows.visible = st.glow > 0.01;
    if (glows.visible) {
      const fl = 1 + 0.06 * Math.sin(time * 2.3) + 0.04 * Math.sin(time * 3.7 + 1); // gentle flicker (< 1 Hz)
      putGlow(0, H0 + 0.16, 1.05 * (0.7 + 0.3 * st.glow), st.glow * fl, 1.0); // high enough to peek over the rim from eye height
      putGlow(1, lakeY + 0.35 * I, 0.95 * I, I * 0.6 * fl, 0.9);
      glows.instanceMatrix.needsUpdate = true;
      glowGeo.attributes.aP.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- evidence (group-local, at t = 1)
  const mid0 = paths[0], mi = Math.round(mid0.rows * 0.68); // wide lower channel, well apart from the crater
  const evidence = {
    crater: { pos: new THREE.Vector3(0, H0 + 0.12, CZ - 0.04), radius: 0.5 },
    lava: { pos: new THREE.Vector3(mid0.pts[mi * 3], mid0.pts[mi * 3 + 1] + 0.02, mid0.pts[mi * 3 + 2]), radius: 0.32 },
  };

  function stop() {
    playing = false;
    rumble?.stop(); lavaLoop?.stop();
    rumble = lavaLoop = null;
  }
  setProgress(0);

  return {
    key: 'volcano',
    group,
    duration: 13,
    setProgress,
    update(dt, time) {
      st.time = time;
      lavaMat.uniforms.uTime.value = time;
      heatU.uTime.value = time;
      const step = Math.min(dt, 0.1) / Math.sqrt(fountainLevel(st.fountain));
      for (let i = 0; i < NF; i++) FP[i] = (FP[i] + step / F[i].tk) % 1;
      animate(time);
    },
    play() {
      stop();
      if (!sfx) return;
      playing = true;
      prevT = st.t;
      gainR = gainL = -1;
      rumble = sfx.loop('rumble', { gain: 0 });
      lavaLoop = sfx.loop('lava', { gain: 0 });
      sound(st.t);
    },
    stop,
    evidence,
    thumb: { cam: [1.3, 2.75, 5.3], target: [0, 1.1, -0.5], t: 0.82 }, // lava low on the slopes under a dark ash plume
    dispose() {
      stop();
      disposeTree(group);
      for (const m of [lavaMat, smokeMat, glowMat, fountain.material, terrainMat]) m.dispose();
      detailTex.dispose(); puffTex.dispose();
    },
  };
}

/** Rounded, smooth-shaded blob (kit blobs come out faceted; foliage reads softer with shared normals). */
function smoothBlob(r, detail, seed, squash) {
  const g = blobGeo(r, { detail, jitter: 0.2, seed, squash });
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return m;
}
/** Flat grass blade (a squashed 3-sided cone) that curves outward toward its tip; base at y = 0. */
function bladeGeo() {
  const g = new THREE.ConeGeometry(0.03, 0.11, 3, 2).translate(0, 0.055, 0).scale(1, 1, 0.25);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = p.getY(i) / 0.11; p.setZ(i, p.getZ(i) + 0.07 * v * v); p.setY(i, p.getY(i) - 0.012 * v * v * v); }
  g.computeVertexNormals();
  return g;
}
/** Five-petal flower head in the XY plane (faces +Z) with a sunny centre, vertex-coloured. */
function flowerGeo(petal) {
  const parts = [{ geo: new THREE.CircleGeometry(0.012, 7), color: PAL.sun, pos: [0, 0, 0.003] }];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push({ geo: new THREE.CircleGeometry(0.014, 7), color: petal, pos: [Math.cos(a) * 0.017, Math.sin(a) * 0.017, 0], rot: [0, 0, a], scale: [1.25, 0.9, 1] });
  }
  return mergeParts(parts);
}
