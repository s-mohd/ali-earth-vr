// Station 4 «التعرية» (erosion). Rain falls on a hill, a stream runs down its channel to a pond, and the water CARRIES
// soil and rock fragments from the top (a gully is cut where a soil patch used to be: "from") to the bottom (a fan of
// the same soil and pebbles grows into the pond: "to"). Movement from one place to another is the whole point of the scene.
//
// Cost model: the ground is ONE stageGround mesh whose "after" shapes (gully cut, deposit fan) are morph targets
// (position + normal + colour deltas), so the land changes with zero CPU work; a tiny shader patch paints crisp rock
// layers wherever the vertex colour's alpha says "bare earth" (gully walls, channel banks). The water is one small unlit
// shader (stream ribbon revealed with drawRange + pond) that knows its own depth, so it gets deep/shallow colour and a clean
// foam line at every shore. Rock fragments and soil clumps are two InstancedMeshes, the rain a third.
import { THREE, PAL, rng, clamp, lerp, seg, smooth, ease, fbm, mat, vcMat, mergeParts, stageGround } from '../core/kit.js';
import { SUN_DIR } from '../core/lighting.js';
import { waterTexture, streamMaterial, pondMaterial } from './erosion_water.js';
import { softBlob, palmParts, bushParts, tuftGeo, reedParts, boulderGeo } from './erosion_plants.js';

const RADIUS = 2.72;
const SUMMIT = { x: -1.2, z: -0.6 }, HILL_H = 1.22;
// the pond keeps clear of Ali's corner (he stands on dry sand at (1.65, 1.5))
const POND = { x: 0.85, z: 1.05, rx: 0.85, rz: 0.55 };
const POND_LEVEL = -0.04, POND_RISE = 0.018, LEVEL_END = POND_LEVEL + POND_RISE;
const SUN = SUN_DIR; // the game always lights a station from this direction (in the station's own frame)
// downhill direction (summit -> pond)
const DIR = (() => { const x = POND.x - SUMMIT.x, z = POND.z - SUMMIT.z, l = Math.hypot(x, z); return { x: x / l, z: z / l }; })();
// stream centre line, from the gully head near the summit to inside the pond
const CTRL = [[-1.04, -0.45], [-0.78, -0.22], [-0.5, -0.1], [-0.2, 0.1], [0.06, 0.38], [0.36, 0.62], [0.7, 0.86]];
const NS = 160; // path samples
const HW = 0.085, BANK = 1.2; // dry channel half width and bank slope
const WATER_HW = 0.15, WATER_DEPTH = 0.034;
const ACROSS = [-1, -0.5, 0, 0.5, 1]; // stream ribbon columns
const U_GULLY = 0.07; // where the soil patch sits / the gully is deepest
const CLOUD = { x: -0.95, y: 1.95, z: -0.42 }; // rain cloud over the hill top
const FAN_R = 0.58, FAN_H = 0.052; // deposit fan: radius, height of its apex above the final water level

// one soil for the patch on top, the clumps in the water and the fan at the bottom (same stuff, moved)
const SOIL_COLS = ['#7a4a2b', '#8e5a35', '#6b4127', '#9c6840'];
// rock fragments: the warm sandstone of station 3's rock (story bridge «الفتات من المحطة السابقة»)
const ROCK_COLS = ['#e2c39a', '#cfa57a', '#d9b48a', '#bb8c63', '#ecd3ad'];
const COLORS = {
  grass: '#93cf6b', grassDark: '#5fa653', grassLight: '#b6df7c', meadow: '#a2d474', dry: '#cdd283',
  bed: '#cdb289', bank: '#e2c99a', soil: '#8e5a35', soilDark: '#5f3920', soilLight: '#b07a4c', crumb: '#d8ae7e',
  scour: '#dcc6a2', gullyBed: '#5b3a24', wetSand: '#cfae80', fanWet: '#6a4126',
};
// rock layers shown on bare earth (top to bottom, repeating): red-brown, ochre, cream sand, rust, dark loam
const STRATA = ['#8f5634', '#cf9459', '#efd6a6', '#ad6a3e', '#70432a'];
const STRATA_GLSL = /* glsl */ `
varying vec3 vSP;
uniform vec3 uStrata[5];
uniform float uWet;
uniform vec4 uWetAt;
vec3 strata(vec3 p) {
  float w = p.y * 17.0 + 0.3 * sin(p.x * 6.0 + p.z * 4.0) + 0.16 * sin(p.z * 15.0 - p.x * 7.0);
  float i = mod(floor(w), 5.0), f = fract(w);
  vec3 c = uStrata[0];
  if (i > 0.5) c = uStrata[1];
  if (i > 1.5) c = uStrata[2];
  if (i > 2.5) c = uStrata[3];
  if (i > 3.5) c = uStrata[4];
  return c * (0.8 + 0.2 * smoothstep(0.0, 0.16, f)); // a darker seam under every layer
}`;

export default function buildStation(ctx = {}) {
  const { sfx, quality = 'high' } = ctx;
  const low = quality === 'low';
  const R = rng(4404);
  const group = new THREE.Group();
  group.name = 'station:erosion';
  const disposables = [];
  const own = (x) => (disposables.push(x), x);

  // ------------------------------------------------------------------ stream path (arc-length samples)
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const pts = curve.getSpacedPoints(NS);
  const PX = new Float32Array(NS + 1), PZ = new Float32Array(NS + 1), TX = new Float32Array(NS + 1), TZ = new Float32Array(NS + 1);
  for (let i = 0; i <= NS; i++) { PX[i] = pts[i].x; PZ[i] = pts[i].z; }
  for (let i = 0; i <= NS; i++) {
    const a = Math.max(0, i - 1), b = Math.min(NS, i + 1), dx = PX[b] - PX[a], dz = PZ[b] - PZ[a], l = Math.hypot(dx, dz) || 1;
    TX[i] = dx / l; TZ[i] = dz / l;
  }
  const PATH_LEN = curve.getLength();

  // nearest point on the path polyline (build-time only): coarse search, then exact segments around the best sample
  const P = { u: 0, d: 0, x: NaN, z: NaN };
  function project(x, z) {
    if (x === P.x && z === P.z) return P;
    let best = 1e9, bi = 0, bt = 0;
    for (let i = 0; i <= NS; i += 8) { const d2 = (PX[i] - x) ** 2 + (PZ[i] - z) ** 2; if (d2 < best) { best = d2; bi = i; } }
    const lo = Math.max(0, bi - 9), hi = Math.min(NS - 1, bi + 8);
    best = 1e9;
    for (let i = lo; i <= hi; i++) {
      const ax = PX[i], az = PZ[i], ex = PX[i + 1] - ax, ez = PZ[i + 1] - az;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez));
      const qx = ax + ex * t - x, qz = az + ez * t - z, d2 = qx * qx + qz * qz;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    P.u = (bi + bt) / NS; P.d = Math.sqrt(best); P.x = x; P.z = z;
    return P;
  }
  const sample = (arr, u) => { const f = clamp(u) * NS, i = Math.min(NS - 1, Math.floor(f)), k = f - i; return arr[i] + (arr[i + 1] - arr[i]) * k; };

  // ------------------------------------------------------------------ land shape
  const hillD = (x, z) => {
    const dx = x - SUMMIT.x, dz = z - SUMMIT.z;
    const a = dx * DIR.x + dz * DIR.z, c = -dx * DIR.z + dz * DIR.x;
    return Math.hypot(a / (a > 0 ? 2.0 : 1.35), c / 1.6);
  };
  const hillH = (x, z) => {
    const d = hillD(x, z);
    if (d >= 1) return 0;
    return HILL_H * (1 - smooth(0.14, 1, d)) * (1 + 0.06 * fbm(x * 2.1 + 7, z * 2.1 + 3, 2)) * (1 - smooth(2.2, 2.58, Math.hypot(x, z)));
  };
  const pondE = (x, z) => Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
  const basinH = (x, z) => -0.15 * (1 - smooth(0.45, 1, pondE(x, z)));
  // soil patch (loose soil + rock fragments) at the head of the stream
  const HEAP = { x: 0, z: 0, r: 0.4, h: 0.13 };
  {
    const hi = Math.round(U_GULLY * NS);
    HEAP.x = PX[hi]; HEAP.z = PZ[hi];
  }
  const heapH = (x, z) => {
    const d = Math.hypot(x - HEAP.x, z - HEAP.z) / HEAP.r;
    return d >= 1 ? 0 : HEAP.h * Math.pow(1 - d * d, 0.9) * (0.8 + 0.4 * fbm(x * 9, z * 9, 2));
  };
  // stream bed: follows the land down, always descending (BED rides over the soil patch, BED_NAT is the bare hill)
  const BED = new Float32Array(NS + 1), BED_NAT = new Float32Array(NS + 1);
  // gully cut (after): extra depth and half width along the path; the headwall is sloped so the ground mesh resolves it
  const gullyDepth = (u) => 0.27 * smooth(-0.02, 0.08, u) * (1 - smooth(0.16, 0.5, u));
  const gullyHW = (u) => HW + 0.15 * smooth(-0.02, 0.08, u) * (1 - smooth(0.2, 0.52, u));
  // deposit fan (after): apex at the pond shore, spreading into the pond along the flow
  const FAN = { x: 0, z: 0, dx: 0, dz: 0, u: 1 };
  {
    let prevB = 1e9, prevN = 1e9;
    for (let i = 0; i <= NS; i++) {
      const h = hillH(PX[i], PZ[i]) + basinH(PX[i], PZ[i]) - 0.05;
      prevN = Math.min(prevN - 0.0006, h); BED_NAT[i] = prevN;
      prevB = Math.min(prevB - 0.0006, h + heapH(PX[i], PZ[i])); BED[i] = prevB;
    }
    // apex = first path sample near the pond water line
    let ai = NS;
    for (let i = 0; i <= NS; i++) if (hillH(PX[i], PZ[i]) + basinH(PX[i], PZ[i]) < POND_LEVEL + 0.03) { ai = i; break; }
    FAN.x = PX[ai]; FAN.z = PZ[ai]; FAN.dx = TX[ai]; FAN.dz = TZ[ai]; FAN.u = ai / NS;
  }
  const U_END = FAN.u; // carried pieces leave the stream at the fan apex, where the water slows down
  // fan = a rounded, lobed dome of soil centred on the apex, facing down the flow; it blends into whatever lies below
  // (floor), so its shoreline stays smooth. The stream keeps a groove across it.
  const FK = { k: 0, a: 0, c: 0, th: 0, groove: 0 };
  const fanK = (x, z) => {
    const dx = x - FAN.x, dz = z - FAN.z, a = dx * FAN.dx + dz * FAN.dz, c = -dx * FAN.dz + dz * FAN.dx;
    const th = Math.atan2(c, a), at = Math.abs(th);
    // lobed outline (the waterline at the end), short on the upstream side where it meets the shore
    const r = FAN_R * (1 + 0.11 * Math.cos(3 * th + 0.5) + 0.06 * Math.cos(5 * th + 1.7) + 0.05 * fbm(th * 3 + 9, 2.5, 2)) * (1 - 0.55 * smooth(1.0, 1.9, at));
    FK.k = Math.hypot(a, c) / r; FK.a = a; FK.c = c; FK.th = th;
    // the stream keeps a groove across its fan and splits into two smaller ones (a little delta)
    FK.groove = Math.exp(-((c / 0.06) ** 2)) * (1 - smooth(0.75, 1.0, FK.k)) + 0.6 * smooth(0.25, 0.45, FK.k) * (1 - smooth(0.8, 1.0, FK.k)) * (Math.exp(-(((th - 0.62) / 0.11) ** 2)) + Math.exp(-(((th + 0.58) / 0.11) ** 2)));
    return FK;
  };
  // fan = a low, rounded dome of soil: above the water inside the lobed outline (k < 1), sloping gently under it beyond.
  // It blends into whatever lies below (floor), so its shoreline stays smooth.
  const fanTop = (x, z, floor) => {
    const { k, th, groove } = fanK(x, z);
    if (k >= 1.35) return floor;
    const w = (1 - smooth(1.15, 1.35, k)) * (1 - smooth(1.6, 2.2, Math.abs(th)));
    const top = LEVEL_END + (k < 1 ? FAN_H * (1 - k * k) : -0.26 * (k - 1)) + 0.007 * fbm(x * 14, z * 14, 2) - 0.022 * groove;
    return lerp(floor, Math.max(floor, top), w);
  };

  /** ground height. e = gully cut (0/1), d = deposit fan (0/1) */
  function surface(x, z, e, d) {
    project(x, z);
    const u = P.u, pd = P.d;
    let h = hillH(x, z) + basinH(x, z) + heapH(x, z) * (1 - e);
    h = Math.min(h, sample(e ? BED_NAT : BED, u) + Math.max(0, pd - HW) * BANK);
    if (e) {
      const gd = gullyDepth(u), ghw = gullyHW(u);
      const scour = 0.02 * smooth(HEAP.r, HEAP.r * 0.5, Math.hypot(x - HEAP.x, z - HEAP.z));
      // U-shaped gully: the stream runs in the middle of its floor, steep walls of bare layered earth
      h = Math.min(h - scour, sample(BED_NAT, u) - gd + 0.07 * Math.min(1, gd / 0.06) * smooth(0, ghw, pd) + Math.max(0, pd - ghw) * 1.9);
    }
    if (d) h = Math.max(h, fanTop(x, z, h));
    return h;
  }

  // ------------------------------------------------------------------ props first (the ground bakes their contact shadows)
  const BUSHES = [[-1.75, 0.7, 0.15, 0], [-2.08, 0.5, 0.1, 1], [2.05, -0.1, 0.2, 2], [0.1, -1.6, 0.2, 0], [-0.7, 1.55, 0.12, 1], [1.0, -0.4, 0.16, 1], [-0.95, -1.9, 0.18, 2], [-1.62, -0.95, 0.12, 1], [-1.25, 0.25, 0.11, 0], [0.42, 0.22, 0.09, 2], [1.75, 0.3, 0.1, 0], [-2.0, -0.2, 0.13, 2]];
  const BOULDERS = [[-1.3, -0.74, 0.12], [-1.13, -0.86, 0.075], [-1.48, -0.55, 0.08], [2.05, 0.7, 0.09], [2.2, 0.5, 0.06], [-1.85, -0.5, 0.1], [-1.5, -1.5, 0.08], [-0.45, -1.3, 0.07], [0.75, -0.05, 0.06], [-1.1, 1.3, 0.05], [0.2, 1.62, 0.06], [-0.86, 0.3, 0.075], [-0.76, 0.42, 0.045]];
  const PALM = [1.35, -1.25];
  const CONTACTS = [...BUSHES.map(([x, z, s]) => [x, z, s * 1.35]), ...BOULDERS.map(([x, z, s]) => [x, z, s * 1.3]), [PALM[0], PALM[1], 0.16]];

  const col = new THREE.Color(), tmp = new THREE.Color();
  const C = Object.fromEntries(Object.entries({ ...COLORS, sand: PAL.sand }).map(([k, v]) => [k, new THREE.Color(v)]));
  const SOIL_C = SOIL_COLS.map((c) => new THREE.Color(c));
  let MASK = 0; // "bare earth" amount of the last groundColor() call (shown as rock layers by the ground shader)
  /** earthy soil with dark and light crumbs (the same on the patch on top and on the fan at the bottom) */
  function soilColor(x, z, out) {
    const n = fbm(x * 20 + 5, z * 20, 2), m = fbm(x * 37 - 3, z * 37 + 8, 2);
    out.copy(C.soil).lerp(C.soilDark, clamp((0.05 - n) * 3.2, 0, 0.75)).lerp(C.soilLight, clamp((n - 0.12) * 3, 0, 0.6));
    return out.lerp(C.crumb, clamp((m - 0.24) * 4, 0, 0.7));
  }
  function groundColor(x, z, e, d) {
    const h0 = surface(x, z, 0, 0), h = e || d ? surface(x, z, e, d) : h0; // also leaves P projected for (x, z)
    const u = P.u, pd = P.d;
    MASK = 0;
    const n = fbm(x * 1.6 + 11, z * 1.6 - 4, 3), hill = hillH(x, z), hd = hillD(x, z);
    // meadow: patchy greens, lighter and drier on the hill top
    col.copy(C.grass).lerp(C.grassDark, clamp(0.45 - n * 1.4, 0, 0.8));
    col.lerp(C.grassLight, smooth(0.25, 1.0, hill) * 0.45).lerp(C.meadow, clamp(fbm(x * 4, z * 4, 2) * 1.5, 0, 0.35));
    col.lerp(C.dry, smooth(0.1, 0.4, fbm(x * 3 + 2, z * 3 - 5, 2)) * smooth(0.45, 0.9, hill) * 0.55);
    // pond shore: sand, wet sand at the water
    const pe = pondE(x, z);
    col.lerp(C.sand, 1 - smooth(0.92, 1.14, pe)).lerp(C.wetSand, 1 - smooth(0.74, 0.9, pe));
    // the dry channel (wadi): pale gravel bed, sandy banks with a glimpse of the layers where they are cut deep
    const cut0 = hill + basinH(x, z) + heapH(x, z) - h0;
    col.lerp(C.bank, (1 - smooth(HW + 0.02, HW + 0.09, pd)) * (1 - smooth(0.92, 1, u) * 0.6));
    col.lerp(C.bed, 1 - smooth(HW * 0.55, HW, pd));
    let mask = 0.55 * smooth(0.02, 0.06, cut0) * smooth(HW * 0.9, HW + 0.012, pd) * (1 - smooth(0.6, 0.75, u));
    // soil patch: rich brown soil with crumbs
    const hp = heapH(x, z) / HEAP.h;
    if (!e && hp > 0) { col.lerp(soilColor(x, z, tmp), smooth(0, 0.18, hp)); mask *= 1 - smooth(0, 0.2, hp); }
    if (e) {
      // the soil patch is gone: scoured pale ground; the gully shows bare layered earth and a dark wet floor
      const wasHeap = 1 - smooth(HEAP.r * 0.6, HEAP.r * 1.05, Math.hypot(x - HEAP.x, z - HEAP.z));
      col.lerp(C.scour, wasHeap * 0.85);
      mask = Math.max(mask, wasHeap * 0.3);
      const cut = h0 - h, ghw = gullyHW(u);
      if (cut > 0.008) {
        const wall = smooth(0.01, 0.04, cut);
        const floor = (1 - smooth(ghw * 0.3, ghw * 0.7, pd)) * smooth(0.04, 0.09, cut);
        col.lerp(C.gullyBed, floor);
        mask = Math.max(mask, wall * (1 - floor));
      }
    }
    if (d) {
      const add = h - h0;
      if (add > 0.002) {
        // the fan: the same soil, dark and wet at the water, drier and lighter on its crest
        const gr = fanK(x, z).groove;
        soilColor(x, z, tmp).lerp(C.soilLight, smooth(0.01, 0.04, h - LEVEL_END) * 0.4).lerp(C.fanWet, Math.max(1 - smooth(0.0, 0.007, h - LEVEL_END), gr * 0.5));
        col.lerp(tmp, smooth(0.002, 0.02, add));
        mask *= 1 - smooth(0.002, 0.02, add);
      }
    }
    // ambient occlusion: the foot of the hill, the channel floor, contact shadows under bushes and boulders
    let ao = 1 - 0.1 * smooth(0.55, 0.85, hd) * (1 - smooth(0.9, 1.02, hd));
    ao *= 1 - 0.12 * smooth(0.01, 0.06, Math.max(cut0, h0 - h)) * (1 - smooth(HW * 0.5, HW * 1.4, pd));
    for (const [cx, cz, cr] of CONTACTS) {
      const dd = Math.hypot(x - cx, z - cz);
      if (dd < cr * 1.6) ao *= 1 - 0.32 * (1 - smooth(cr * 0.35, cr * 1.6, dd));
    }
    const e2 = 0.03, gx = (hillH(x + e2, z) - hillH(x - e2, z)) / (2 * e2), gz = (hillH(x, z + e2) - hillH(x, z - e2)) / (2 * e2);
    const nl = Math.hypot(gx, 1, gz), lit = (-gx * SUN.x + SUN.y - gz * SUN.z) / nl;
    ao *= lerp(0.8, 1.04, clamp(lit));
    col.multiplyScalar(ao);
    MASK = mask;
    return col;
  }

  // ------------------------------------------------------------------ ground: base + 2 morph targets (gully, fan)
  const rings = low ? 40 : 52, segments = low ? 120 : 150;
  const mkGround = (e, d) => {
    const masks = [];
    const g = stageGround({
      radius: RADIUS, rings, segments, heightFn: (x, z) => surface(x, z, e, d),
      colorFn: (x, z) => { const c = groundColor(x, z, e, d); masks.push(MASK); return c; }, skirtColor: PAL.soilDark,
    });
    // RGBA colours: alpha = 1 - bare earth (three r186 only compiles morphed vertex colours with alpha anyway)
    const c3 = g.attributes.color.array, n = c3.length / 3, c4 = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { c4[i * 4] = c3[i * 3]; c4[i * 4 + 1] = c3[i * 3 + 1]; c4[i * 4 + 2] = c3[i * 3 + 2]; c4[i * 4 + 3] = 1 - (masks[i] ?? 0); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c4, 4));
    return g;
  };
  const g0 = own(mkGround(0, 0)), gE = mkGround(1, 0), gD = mkGround(0, 1);
  const delta = (a, b, name) => {
    const A = a.attributes[name].array, B = b.attributes[name].array, out = new Float32Array(A.length);
    for (let i = 0; i < A.length; i++) out[i] = B[i] - A[i];
    return new THREE.Float32BufferAttribute(out, a.attributes[name].itemSize);
  };
  g0.morphTargetsRelative = true;
  g0.morphAttributes.position = [delta(g0, gE, 'position'), delta(g0, gD, 'position')];
  g0.morphAttributes.normal = [delta(g0, gE, 'normal'), delta(g0, gD, 'normal')];
  g0.morphAttributes.color = [delta(g0, gE, 'color'), delta(g0, gD, 'color')];
  gE.dispose(); gD.dispose();
  const groundMat = own(mat('#ffffff', { vertexColors: true, unique: true }));
  const strataU = { value: STRATA.map((c) => new THREE.Color(c)) };
  const WET = { value: 0 }, WET_AT = { value: new THREE.Vector4(CLOUD.x, CLOUD.z, 1 / 0.75, 1 / 0.55) };
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.uStrata = strataU; sh.uniforms.uWet = WET; sh.uniforms.uWetAt = WET_AT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSP;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvSP = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + STRATA_GLSL)
      .replace('#include <color_fragment>', `diffuseColor.rgb *= vColor.rgb;
        float bare = clamp(1.0 - vColor.a, 0.0, 1.0);
        if (bare > 0.004) diffuseColor.rgb = mix(diffuseColor.rgb, strata(vSP), bare);
        // rain soaks the ground under the cloud: it darkens a little while it rains
        diffuseColor.rgb *= 1.0 - uWet * 0.2 * (1.0 - smoothstep(0.55, 1.0, length((vSP.xz - uWetAt.xy) * uWetAt.zw)));`);
  };
  groundMat.customProgramCacheKey = () => 'erosion-ground-strata';
  const ground = new THREE.Mesh(g0, groundMat);
  ground.name = 'erosion-ground';
  group.add(ground);

  // ------------------------------------------------------------------ water: flowing stream ribbon + pond
  const waterTex = own(waterTexture());
  // water surface along the path: before, + gully cut (E), + riding over the fan (D)
  const WATER0 = new Float32Array(NS + 1), WATER_E = new Float32Array(NS + 1), WATER_D = new Float32Array(NS + 1);
  const overFan = (i, x, z, y) => (i / NS > 0.7 ? Math.max(0, fanTop(x, z, y - 0.012) + 0.012 - y) : 0);
  for (let i = 0; i <= NS; i++) {
    WATER0[i] = BED[i] + WATER_DEPTH; WATER_E[i] = BED_NAT[i] - gullyDepth(i / NS) - BED[i];
    WATER_D[i] = overFan(i, PX[i], PZ[i], WATER0[i]);
  }
  const stream = (() => {
    const NA = ACROSS.length, pos = [], aE = [], aD = [], info = [], dep = [], idx = [];
    for (let i = 0; i <= NS; i++) {
      const u = i / NS, hw = WATER_HW * (0.4 + 0.6 * smooth(0, 0.05, u)); // a trickle at the head
      const narrow = (hw - 0.045) * smooth(U_END - 0.05, U_END + 0.03, u); // over the fan the water keeps to its groove
      // steepness of the bed here (white water where the hill is steep)
      const a = Math.max(0, i - 2), b = Math.min(NS, i + 2);
      const slope = (BED_NAT[a] - BED_NAT[b]) / ((b - a) / NS * PATH_LEN);
      const steep = smooth(0.35, 0.75, slope);
      for (const s of ACROSS) {
        const x = PX[i] - TZ[i] * s * hw, z = PZ[i] + TX[i] * s * hw, y = WATER0[i];
        const nx = TZ[i] * s * narrow, nz = -TX[i] * s * narrow;
        const lift = overFan(i, x + nx, z + nz, y);
        pos.push(x, y, z);
        aE.push(0, WATER_E[i], 0);
        aD.push(nx, lift, nz);
        const d0 = y - surface(x, z, 0, 0);
        const dE = y + WATER_E[i] - surface(x, z, 1, 0);
        const dD = y + lift - surface(x + nx, z + nz, 0, 1);
        info.push(s, u * PATH_LEN, d0, steep);
        dep.push(dE - d0, dD - d0);
      }
    }
    // 6 indices per quad, the quads in path order: setDrawRange reveals the water from the top down
    for (let i = 0; i < NS; i++) for (let k = 0; k < NA - 1; k++) { const p = i * NA + k, q = p + NA; idx.push(p, p + 1, q, p + 1, q + 1, q); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aE', new THREE.Float32BufferAttribute(aE, 3));
    g.setAttribute('aD', new THREE.Float32BufferAttribute(aD, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
    g.setAttribute('aDep', new THREE.Float32BufferAttribute(dep, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.3;
    const m = new THREE.Mesh(own(g), own(streamMaterial(waterTex)));
    m.name = 'erosion-stream';
    m.userData.perSeg = (NA - 1) * 6;
    m.renderOrder = 1;
    return m;
  })();
  group.add(stream);
  const SU = stream.material.uniforms;

  const MOUTH = { x: PX[Math.round(0.86 * NS)], z: PZ[Math.round(0.86 * NS)] };
  const pond = (() => {
    // elliptical polar grid a little larger than the basin: the ground hides the outer ring, the shader draws the shore
    const NR = low ? 10 : 14, NSEG = low ? 56 : 72, EXT = 1.12, pos = [], gh = [], idx = [];
    // ground height and slope under each point (before / with the fan): the foam line keeps about the same width on
    // steep and on flat shores
    const e2 = 0.02, slope = (x, z, d) => Math.hypot(surface(x + e2, z, 0, d) - surface(x - e2, z, 0, d), surface(x, z + e2, 0, d) - surface(x, z - e2, 0, d)) / (2 * e2);
    const addG = (x, z) => gh.push(surface(x, z, 0, 0), surface(x, z, 0, 1), slope(x, z, 0), slope(x, z, 1));
    pos.push(POND.x, 0, POND.z); addG(POND.x, POND.z);
    for (let k = 1; k <= NR; k++) {
      const rr = (k / NR) * EXT;
      for (let j = 0; j < NSEG; j++) {
        const a = (j / NSEG) * Math.PI * 2, x = POND.x + Math.cos(a) * rr * POND.rx, z = POND.z + Math.sin(a) * rr * POND.rz;
        pos.push(x, 0, z); addG(x, z);
      }
    }
    for (let j = 0; j < NSEG; j++) idx.push(0, 1 + ((j + 1) % NSEG), 1 + j);
    for (let k = 1; k < NR; k++) {
      const a0 = 1 + (k - 1) * NSEG, a1 = 1 + k * NSEG;
      for (let j = 0; j < NSEG; j++) { const j1 = (j + 1) % NSEG; idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aG', new THREE.Float32BufferAttribute(gh, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const pads = [[1.32, 0.86, 0.068], [1.46, 1.06, 0.052], [1.2, 1.12, 0.045]];
    const m = new THREE.Mesh(own(g), own(pondMaterial(waterTex, { mouth: MOUTH, fanO: FAN, fanDir: { x: FAN.dx, z: FAN.dz }, pads })));
    m.name = 'erosion-pond';
    return m;
  })();
  group.add(pond);
  const PU = pond.material.uniforms;

  // ------------------------------------------------------------------ carried pieces
  // Rock fragments ROLL along the stream bed (mostly under water); small soil clumps are HELD in the water and slowly
  // break up into it. Two InstancedMeshes: faceted rocks (+ 2 foam heads at the water front) and soft soil clumps.
  const N_ROCK = low ? 28 : 38, N_SOIL = low ? 72 : 96, N_FOAM = 2, NP = N_ROCK + N_SOIL;
  const instanced = (geo, n, name, material) => {
    const m = new THREE.InstancedMesh(own(geo), material, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.name = name;
    group.add(m);
    return m;
  };
  const rocks = instanced(boulderGeo(1, 9, { light: '#ffffff', dark: '#b9aa9a', squash: 1, jitter: 0.26 }), N_ROCK + N_FOAM, 'erosion-rocks', vcMat());
  const soil = instanced(softBlob(1, { detail: 0, jitter: 0.2, seed: 12 }), N_SOIL, 'erosion-soil', mat('#ffffff'));
  const F32 = () => new Float32Array(NP);
  const PC = {
    sx: F32(), sz: F32(), sy0: F32(), sy1: F32(), su: F32(), js: new Uint16Array(NP), // start on the patch, entry into the stream
    ox: F32(), oz: F32(), dx: F32(), dz: F32(), dy0: F32(), dy1: F32(), // drop start at the apex, destination on the fan
    t0: F32(), dur: F32(), lane: F32(), size: F32(), sqY: F32(), kx: F32(), sink: F32(),
    rx: F32(), ry: F32(), phase: F32(), // soil tumble
    yaw0: F32(), lift: F32(), roll: F32(), // rocks: yaw on the patch, metres to the stream, roll radians per metre
  };
  const J_END = Math.round(U_END * NS), YAW_END = Math.atan2(TX[J_END], TZ[J_END]);
  const PLOP_T = [];
  {
    const rockCols = ROCK_COLS.map((c) => new THREE.Color(c));
    const landings = [];
    for (let i = 0; i < NP; i++) {
      const rock = i < N_ROCK;
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * HEAP.r * (rock ? 0.8 : 0.88);
      const x = HEAP.x + Math.cos(a) * rr, z = HEAP.z + Math.sin(a) * rr;
      const s = rock ? 0.044 + R() * 0.036 : 0.024 + R() * 0.017;
      PC.sx[i] = x; PC.sz[i] = z; PC.size[i] = s;
      PC.sqY[i] = rock ? 0.62 + R() * 0.2 : 0.5 + R() * 0.1;
      PC.kx[i] = rock ? 0.8 + R() * 0.35 : 1;
      PC.sy0[i] = surface(x, z, 0, 0); PC.sy1[i] = surface(x, z, 1, 0);
      project(x, z);
      const su = Math.min(P.u, 0.2), lane = (R() - 0.5) * WATER_HW * (rock ? 0.75 : 1.1);
      PC.su[i] = su; PC.lane[i] = lane;
      PC.sink[i] = rock ? 0.35 : 0.12;
      // nearer the channel = leaves earlier; rocks travel slower than the soil held in the water
      PC.t0[i] = 0.36 + 0.36 * (0.5 * clamp(P.d / (HEAP.r * 0.9)) + 0.5 * R());
      PC.dur[i] = rock ? 0.15 + R() * 0.05 : 0.11 + R() * 0.04;
      PC.rx[i] = 4 + R() * 10; PC.ry[i] = R() * 6; PC.phase[i] = R() * 6.28;
      // destination on the fan: rocks drop first, near the apex; the fine soil is carried further out
      const fr = rock ? 0.08 + R() * 0.24 : 0.16 + R() * 0.26, fth = (R() * 2 - 1) * (rock ? 1.0 : 1.15);
      const fa = Math.cos(fth) * fr, sp = Math.sin(fth) * fr;
      const fx = FAN.x + FAN.dx * fa - FAN.dz * sp, fz = FAN.z + FAN.dz * fa + FAN.dx * sp;
      PC.dx[i] = fx; PC.dz[i] = fz; PC.dy0[i] = surface(fx, fz, 0, 0); PC.dy1[i] = surface(fx, fz, 0, 1); // follows the ground as the fan rises
      const js = Math.round(su * NS);
      PC.js[i] = js;
      PC.ox[i] = PX[J_END] - TZ[J_END] * lane; PC.oz[i] = PZ[J_END] + TX[J_END] * lane;
      if (rock) {
        // roll exactly a whole number of half turns over the trip, so each rock comes to rest lying flat
        const yawS = Math.atan2(TX[js], TZ[js]);
        PC.yaw0[i] = yawS + (R() - 0.5) * 2;
        PC.lift[i] = Math.hypot(PX[js] - TZ[js] * lane - x, PZ[js] + TX[js] * lane - z);
        const dist = PC.lift[i] + (U_END - su) * PATH_LEN + Math.hypot(fx - PC.ox[i], fz - PC.oz[i]);
        PC.roll[i] = (Math.max(1, Math.round(dist / s / Math.PI)) * Math.PI) / dist;
        landings.push(PC.t0[i] + PC.dur[i]);
      }
      (rock ? rocks : soil).setColorAt(rock ? i : i - N_ROCK, rock ? rockCols[Math.floor(R() * rockCols.length)] : SOIL_C[Math.floor(R() * 4)]);
    }
    for (let f = 0; f < N_FOAM; f++) rocks.setColorAt(N_ROCK + f, new THREE.Color('#ffffff'));
    rocks.instanceColor.needsUpdate = soil.instanceColor.needsUpdate = true;
    landings.sort((a, b) => a - b);
    PLOP_T.push(landings[0], landings[Math.floor(landings.length / 2)]); // splashes when the first rocks, then half of them, reach the fan
  }

  // ------------------------------------------------------------------ rain cloud + rain
  const cloud = (() => {
    const parts = [];
    // a soft cumulus: round tops, a flat shaded base
    const puffs = [[-0.5, -0.04, 0.02, 0.24], [-0.17, -0.06, 0.08, 0.28], [0.18, -0.06, -0.03, 0.29], [0.52, -0.05, 0.03, 0.22],
      [-0.26, 0.1, -0.02, 0.29], [0.12, 0.17, 0.0, 0.33], [0.42, 0.08, 0.05, 0.22], [-0.6, 0.03, -0.05, 0.17], [0.0, 0.02, 0.2, 0.24], [0.02, 0.04, -0.21, 0.25]];
    puffs.forEach(([x, y, z, r], i) => {
      const g = softBlob(r, { detail: r > 0.2 ? 3 : 2, jitter: 0.05, seed: 30 + i, squash: 0.86 }), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const yy = p.getY(k) + y; if (yy < -0.12) p.setY(k, -0.12 + (yy + 0.12) * 0.22 - y); } // flatten the belly
      g.computeVertexNormals();
      parts.push({ geo: g, pos: [x, y, z] });
    });
    const g = mergeParts(parts);
    const p = g.attributes.position, cl = g.attributes.color;
    const top = new THREE.Color('#ffffff'), mid = new THREE.Color('#e6edf6'), bot = new THREE.Color('#a9b8cc');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      tmp.copy(bot).lerp(mid, smooth(-0.13, 0.02, y)).lerp(top, smooth(0.02, 0.3, y));
      cl.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    const m = new THREE.Mesh(own(g), own(mat('#ffffff', { vertexColors: true, unique: true, emissive: '#46526a', emissiveIntensity: 1 })));
    m.position.set(CLOUD.x, CLOUD.y, CLOUD.z);
    m.scale.set(1.12, 1, 0.95);
    m.name = 'erosion-cloud';
    return m;
  })();
  group.add(cloud);

  const N_RAIN = low ? 90 : 150;
  const rainGeo = own(mergeParts([{ geo: new THREE.PlaneGeometry(0.016, 0.17) }, { geo: new THREE.PlaneGeometry(0.016, 0.17), rot: [0, Math.PI / 2, 0] }]));
  const rain = new THREE.InstancedMesh(rainGeo, own(new THREE.MeshBasicMaterial({ color: '#d9f1ff', transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })), N_RAIN);
  rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rain.frustumCulled = false;
  rain.renderOrder = 3;
  const RN = { x: new Float32Array(N_RAIN), z: new Float32Array(N_RAIN), y0: new Float32Array(N_RAIN), len: new Float32Array(N_RAIN), ph: new Float32Array(N_RAIN) };
  for (let i = 0; i < N_RAIN; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R());
    const x = CLOUD.x + Math.cos(a) * r * 0.62, z = CLOUD.z + Math.sin(a) * r * 0.42;
    RN.x[i] = x; RN.z[i] = z; RN.y0[i] = Math.max(surface(x, z, 1, 0), POND_LEVEL); // down to the gully floor (the ground hides the rest before)
    RN.len[i] = CLOUD.y - 0.16 - RN.y0[i]; RN.ph[i] = R();
  }
  group.add(rain);

  // ------------------------------------------------------------------ flow arrows on the stream (appear at the end)
  const N_ARROW = 4;
  const arrowShape = new THREE.Shape([new THREE.Vector2(0, 0.075), new THREE.Vector2(0.07, -0.035), new THREE.Vector2(0, -0.005), new THREE.Vector2(-0.07, -0.035)]);
  const arrows = new THREE.InstancedMesh(own(new THREE.ShapeGeometry(arrowShape).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })), N_ARROW);
  arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrows.frustumCulled = false;
  arrows.renderOrder = 2;
  group.add(arrows);
  const AR_N = 64, AR = { x: new Float32Array(AR_N + 1), y: new Float32Array(AR_N + 1), z: new Float32Array(AR_N + 1) };
  for (let i = 0; i <= AR_N; i++) {
    const j = Math.round(lerp(0.25, 0.8, i / AR_N) * NS);
    AR.x[i] = PX[j]; AR.z[i] = PZ[j]; AR.y[i] = WATER0[j] + WATER_E[j] + WATER_D[j] + 0.012; // on the final water surface
  }

  // ------------------------------------------------------------------ static props: palm, bushes, boulders, reeds, grass, flowers
  {
    const parts = [];
    const onGround = (x, z) => surface(x, z, 0, 0);
    parts.push(...palmParts(PALM[0], onGround(PALM[0], PALM[1]), PALM[1], 1.35, 0.4, 5));
    for (const [x, z, s, hue] of BUSHES) parts.push(...bushParts(x, onGround(x, z) - s * 0.08, z, s, Math.round(x * 31 + z * 7) + 100, hue));
    for (const [x, z, s] of BOULDERS) {
      const y = Math.min(onGround(x - s * 0.5, z), onGround(x + s * 0.5, z), onGround(x, z - s * 0.5), onGround(x, z + s * 0.5));
      parts.push({ geo: boulderGeo(s, Math.round(x * 13 - z * 5) + 50), pos: [x, y + s * 0.22, z], rot: [0, x * 3 + z, 0] });
    }
    // reeds with cattails on the quiet far shore of the pond (Ali's corner stays clear)
    for (const [a, s] of [[-0.62, 1], [-0.95, 0.85], [-1.28, 1.1], [-1.6, 0.8]]) {
      const x = POND.x + Math.cos(a) * POND.rx * 1.04, z = POND.z + Math.sin(a) * POND.rz * 1.04;
      parts.push(...reedParts(x, onGround(x, z), z, 200 + Math.round(a * 10), s));
    }
    // a few pebbles on the lower banks and the shore (the stream never reaches them)
    for (let i = 0; i < 26; i++) {
      const u = 0.5 + R() * 0.2, j = Math.round(u * NS), side = R() < 0.5 ? -1 : 1, off = 0.17 + R() * 0.12;
      let x = PX[j] - TZ[j] * side * off, z = PZ[j] + TX[j] * side * off;
      if (i >= 16) { const a = 1.2 + R() * 2.2; x = POND.x + Math.cos(a) * POND.rx * 1.08; z = POND.z + Math.sin(a) * POND.rz * 1.1; }
      if (x > 1.3 && z > 0.9) continue;
      const s = 0.016 + R() * 0.016;
      parts.push({ geo: new THREE.IcosahedronGeometry(s, 0), pos: [x, onGround(x, z) + s * 0.25, z], rot: [R(), R() * 3, R()], scale: [1, 0.6, 1], color: ROCK_COLS[i % ROCK_COLS.length] });
    }
    // grass tufts: thick on the hill and the meadow, never in the stream, the gully, the patch, the pond or the corners
    const tuftG = [0, 1, 2, 3].map((k) => tuftGeo(300 + k, { blades: 6 + k, h: 0.085 + k * 0.01, base: ['#4c9a45', '#58a34a', '#3f8e43', '#5aa650'][k], tip: ['#b9e27f', '#cfe88d', '#a6dc79', '#c5e486'][k] }));
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < (low ? 60 : 95); tries++) {
      const x = (R() * 2 - 1) * 2.45, z = (R() * 2 - 1) * 2.45;
      if (Math.hypot(x, z) > 2.45) continue;
      if ((x > 1.2 && z > 0.8) || (x < -1.2 && z > 0.8)) continue;
      project(x, z);
      if (P.d < Math.max(0.2, gullyHW(P.u) + 0.12) || Math.hypot(x - HEAP.x, z - HEAP.z) < HEAP.r + 0.08) continue;
      if (pondE(x, z) < 1.18 || fanK(x, z).k < 1.4) continue;
      if (CONTACTS.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr * 0.9)) continue;
      // more grass on the hill than on the flat meadow
      if (R() > 0.4 + hillH(x, z) * 0.9) continue;
      const k = placed % 4;
      parts.push({ geo: tuftG[k], pos: [x, onGround(x, z) - 0.006, z], rot: [0, R() * 6.28, 0], scale: 0.8 + R() * 0.5 });
      placed++;
    }
    // flowers on the meadow, in little clusters
    const petals = [PAL.coral, PAL.sun, '#ffffff', PAL.lav];
    for (const [cx, cz] of [[-0.95, 1.05], [0.05, 1.75], [1.75, 0.0], [-1.85, -0.2], [0.35, -0.85], [-1.45, -0.25], [-0.2, -0.75]]) {
      for (let k = 0; k < 4; k++) {
        const x = cx + (R() - 0.5) * 0.22, z = cz + (R() - 0.5) * 0.16, y = onGround(x, z);
        parts.push({ geo: new THREE.IcosahedronGeometry(0.022, 0), pos: [x, y + 0.05, z], scale: [1, 0.7, 1], color: petals[(k + Math.round(cx * 3)) & 3] });
        parts.push({ geo: new THREE.ConeGeometry(0.006, 0.05, 3), pos: [x, y + 0.022, z], color: PAL.leafDark });
      }
    }
    const props = new THREE.Mesh(own(mergeParts(parts)), vcMat());
    props.name = 'erosion-props';
    group.add(props);
  }

  // ------------------------------------------------------------------ state
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _ea = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const cloudDark = new THREE.Color('#9eabbf'), cloudLight = new THREE.Color('#ffffff');
  const S = { eK: 0, dK: 0, rain: 0, flow: 0, arrows: 0, flowSpeed: 0.2, arrowPhase: 0, waterOff: 0, pondOff: 0 };
  let playing = false, lastT = 0, rainLoop = null, waterLoop = null, rainGain = -1, waterGain = -1;
  const DRIP = { gain: 0.5 }, SPLASH = { gain: 0.6 }, PLOP = { gain: 0.35, rate: 1.3 };
  const crossed = (th, t) => lastT < th && t >= th;

  /** writes instance idx of mesh at _p with euler e and scale (sx, sy, sz) */
  function put(mesh, idx, e, sx, sy, sz) {
    _q.setFromEuler(e); _s.set(sx, sy, sz);
    mesh.setMatrixAt(idx, _m.compose(_p, _q, _s));
  }
  const waterY = (u) => sample(WATER0, u) + sample(WATER_E, u) * S.eK + sample(WATER_D, u) * S.dK;

  // A rock fragment rolls (never floats): it tips off the patch into the stream, rolls along the bed with only its top
  // above the water, and rolls on out onto the fan, where it comes to rest lying flat.
  function placeRock(i, t, pondY) {
    const s = PC.size[i], sy = s * PC.sqY[i], lane = PC.lane[i], k = seg(t, PC.t0[i], PC.t0[i] + PC.dur[i]);
    const ride = (U_END - PC.su[i]) * PATH_LEN;
    let yaw, dist, f, u = 0, phase;
    if (k < 0.1) { f = ease.inOut(k / 0.1); const j = PC.js[i]; yaw = lerp(PC.yaw0[i], Math.atan2(TX[j], TZ[j]), f); dist = f * PC.lift[i]; phase = 0; }
    else if (k < 0.86) { f = Math.pow((k - 0.1) / 0.76, 1.1); u = lerp(PC.su[i], U_END, f); const j = Math.round(u * NS); yaw = Math.atan2(TX[j], TZ[j]); dist = PC.lift[i] + (u - PC.su[i]) * PATH_LEN; phase = 1; }
    else { f = ease.out((k - 0.86) / 0.14); yaw = YAW_END; dist = PC.lift[i] + ride + f * Math.hypot(PC.dx[i] - PC.ox[i], PC.dz[i] - PC.oz[i]); phase = 2; }
    const pitch = dist * PC.roll[i], cp = Math.cos(pitch), sp = Math.sin(pitch);
    const hv = Math.sqrt(sy * sy * cp * cp + s * s * sp * sp); // vertical half extent of the tumbling rock
    if (phase === 0) {
      const j = PC.js[i];
      _p.set(lerp(PC.sx[i], PX[j] - TZ[j] * lane, f), lerp(lerp(PC.sy0[i], PC.sy1[i], S.eK) + hv * 0.45, waterY(PC.su[i]) - 0.15 * hv, f) + Math.sin(f * Math.PI) * 0.012, lerp(PC.sz[i], PZ[j] + TX[j] * lane, f));
    } else if (phase === 1) {
      const j = Math.round(u * NS);
      _p.set(sample(PX, u) - TZ[j] * lane, waterY(u) - 0.15 * hv, sample(PZ, u) + TX[j] * lane);
    } else {
      const y0 = Math.max(waterY(U_END), pondY + 0.005) - 0.15 * hv, y1 = lerp(PC.dy0[i], PC.dy1[i], S.dK) + hv * PC.sink[i];
      _p.set(lerp(PC.ox[i], PC.dx[i], f), lerp(y0, y1, f), lerp(PC.oz[i], PC.dz[i], f));
    }
    _ea.set(pitch, yaw, 0);
    put(rocks, i, _ea, s * PC.kx[i], sy, s);
  }

  // A soil clump is lifted into the water, held in it (bobbing a little, breaking up), and settles out on the fan.
  function placeSoil(i, t, pondY) {
    const s = PC.size[i], sy = s * PC.sqY[i], lane = PC.lane[i], k = seg(t, PC.t0[i], PC.t0[i] + PC.dur[i]);
    let sc = 1;
    if (k < 0.1) {
      const f = ease.inOut(k / 0.1), j = PC.js[i];
      _p.set(lerp(PC.sx[i], PX[j] - TZ[j] * lane, f), lerp(lerp(PC.sy0[i], PC.sy1[i], S.eK) + sy * 0.45, waterY(PC.su[i]) + 0.1 * sy, f) + Math.sin(f * Math.PI) * 0.03, lerp(PC.sz[i], PZ[j] + TX[j] * lane, f));
    } else if (k < 0.86) {
      const f = Math.pow((k - 0.1) / 0.76, 1.1), u = lerp(PC.su[i], U_END, f), j = Math.round(u * NS);
      sc = 1 - 0.4 * f;
      _p.set(sample(PX, u) - TZ[j] * lane, waterY(u) + 0.1 * sy * sc + Math.sin(f * 26 + PC.phase[i]) * 0.004, sample(PZ, u) + TX[j] * lane);
    } else {
      const f = ease.out((k - 0.86) / 0.14), g = lerp(PC.dy0[i], PC.dy1[i], S.dK);
      sc = 0.6;
      // it sinks as it spreads and settles on the bottom: until the fan there rises clear of the water, the clump stays
      // hidden in the wet edge of the fan (it never floats on the pond)
      const y0 = Math.max(waterY(U_END), pondY + 0.005) + 0.1 * sy * sc, y1 = g + sy * sc * (PC.sink[i] - 1.4 * smooth(-0.012, 0, pondY - g));
      _p.set(lerp(PC.ox[i], PC.dx[i], f), lerp(y0, y1, Math.min(1, f * 1.8)), lerp(PC.oz[i], PC.dz[i], f));
    }
    _e.set(PC.ry[i] + PC.rx[i] * k, PC.ry[i] * 0.5 + 3 * k, 0);
    put(soil, i - N_ROCK, _e, s * sc, sy * sc, s * sc);
  }

  function setProgress(t) {
    t = clamp(t);
    // rain: starts at once, stops near the end (the after state is calm)
    S.rain = smooth(0, 0.12, t) * (1 - smooth(0.82, 0.96, t));
    rain.visible = S.rain > 0.01;
    rain.count = Math.round(N_RAIN * S.rain);
    WET.value = smooth(0.04, 0.25, t) * (1 - 0.55 * smooth(0.85, 1, t));
    cloud.material.color.copy(cloudLight).lerp(cloudDark, smooth(0, 0.1, t) * (1 - 0.8 * smooth(0.84, 1, t)));
    // water front runs down the channel
    const front = ease.inOut(seg(t, 0.17, 0.43));
    stream.visible = front > 0;
    stream.geometry.setDrawRange(0, Math.round(front * NS) * stream.userData.perSeg);
    SU.uFront.value = front < 0.995 ? front * PATH_LEN : 1e3;
    S.flow = smooth(0.17, 0.3, t) * (1 - 0.45 * smooth(0.88, 1, t));
    S.flowSpeed = 0.15 + 0.9 * S.flow;
    // clear rain water turns muddy brown while it carries the soil, then settles
    // (as swirls of silt in the turquoise water, so it still reads as water and never turns grey)
    SU.uMud.value = smooth(0.34, 0.48, t) * (1 - 0.75 * smooth(0.84, 1, t));
    // land changes: gully cut at the top, fan at the bottom
    S.eK = ease.inOut(seg(t, 0.38, 0.8));
    S.dK = 1 - (1 - seg(t, 0.47, 0.92)) ** 2; // the fan builds up as soon as the first loads arrive
    ground.morphTargetInfluences[0] = S.eK; ground.morphTargetInfluences[1] = S.dK;
    SU.uE.value = S.eK; SU.uD.value = S.dK;
    // pond fills a little; the muddy plume spreads from the mouth and leaves a light muddy tint
    pond.position.y = POND_LEVEL + POND_RISE * smooth(0.4, 0.9, t);
    PU.uLevel.value = pond.position.y; PU.uD.value = S.dK;
    PU.uFlow.value = smooth(0.4, 0.46, t) * (1 - 0.6 * smooth(0.88, 1, t));
    PU.uPlume.value = smooth(0.42, 0.85, t) * (1 - 0.35 * smooth(0.88, 1, t));
    PU.uMudTint.value = 0.14 * smooth(0.5, 0.95, t);

    // carried pieces
    for (let i = 0; i < N_ROCK; i++) placeRock(i, t, pond.position.y);
    for (let i = N_ROCK; i < NP; i++) placeSoil(i, t, pond.position.y);
    // foam at the water front
    for (let f = 0; f < N_FOAM; f++) {
      const u = Math.max(0, front - f * 0.025), sc = front > 0.02 && front < 0.995 ? (f ? 0.032 : 0.046) : 0;
      _p.set(sample(PX, u), waterY(u) + 0.008, sample(PZ, u)); _e.set(0, f, 0);
      put(rocks, N_ROCK + f, _e, sc * 1.4, sc * 0.45, sc * 1.4);
    }
    rocks.instanceMatrix.needsUpdate = soil.instanceMatrix.needsUpdate = true;

    // arrows: appear once the soil has arrived
    S.arrows = ease.outBack(seg(t, 0.86, 0.97));
    arrows.visible = S.arrows > 0.01;
    if (arrows.visible) placeArrows();

    // sounds (only while playing, when crossing a threshold upward)
    if (playing) {
      if (crossed(0.03, t) || crossed(0.09, t)) sfx?.play('drip', DRIP);
      if (crossed(0.43, t)) sfx?.play('splash', SPLASH); // the water reaches the pond
      if (crossed(PLOP_T[0], t) || crossed(PLOP_T[1], t)) sfx?.play('splash', PLOP); // rocks land on the fan
      const rg = Math.round(S.rain * 0.55 * 20) / 20, wg = Math.round(S.flow * 0.6 * 20) / 20;
      if (rainLoop && rg !== rainGain) { rainGain = rg; rainLoop.set({ gain: rg }); }
      if (waterLoop && wg !== waterGain) { waterGain = wg; waterLoop.set({ gain: wg }); }
    }
    lastT = t;
  }

  // rain streaks fall from the cloud base to the ground (ambient motion; how many show is story state)
  function placeRain(time, n) {
    for (let i = 0; i < n; i++) {
      const f = (time * 2.2 / RN.len[i] + RN.ph[i]) % 1;
      rain.setMatrixAt(i, _m.makeTranslation(RN.x[i], RN.y0[i] + RN.len[i] * (1 - f) + 0.08, RN.z[i]));
    }
    rain.instanceMatrix.needsUpdate = true;
  }
  // chevrons march down the stream on the water, swelling in the middle of their run
  function placeArrows() {
    for (let i = 0; i < N_ARROW; i++) {
      const f = (i + S.arrowPhase) / N_ARROW, fi = f * AR_N, j = Math.min(AR_N - 1, Math.floor(fi)), k = fi - j;
      const dx = AR.x[j + 1] - AR.x[j], dy = AR.y[j + 1] - AR.y[j], dz = AR.z[j + 1] - AR.z[j];
      _ea.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0);
      const sc = S.arrows * Math.sin(Math.PI * f) * 1.3;
      _p.set(lerp(AR.x[j], AR.x[j + 1], k), lerp(AR.y[j], AR.y[j + 1], k), lerp(AR.z[j], AR.z[j + 1], k)); _q.setFromEuler(_ea); _s.set(sc, sc, sc);
      arrows.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    arrows.instanceMatrix.needsUpdate = true;
  }

  function update(dt, time) {
    S.waterOff = (S.waterOff + dt * S.flowSpeed * 1.5) % 64;
    S.pondOff = (S.pondOff + dt * (0.05 + 0.22 * S.flow)) % 64;
    SU.uOff.value = S.waterOff; PU.uOff.value = S.pondOff; PU.uTime.value = time % 1000;
    cloud.position.y = CLOUD.y + Math.sin(time * 0.7) * 0.015;
    if (rain.visible) placeRain(time, rain.count);
    S.arrowPhase = (time * 0.35) % 1;
    if (arrows.visible) placeArrows();
  }

  function stopLoops() { rainLoop?.stop(); waterLoop?.stop(); rainLoop = waterLoop = null; rainGain = waterGain = -1; }

  placeRain(0, N_RAIN);
  setProgress(0);

  const fromPos = (() => { const j = Math.round(0.1 * NS); return new THREE.Vector3(PX[j], surface(PX[j], PZ[j], 1, 0) + 0.12, PZ[j]); })();
  const toPos = (() => { const x = FAN.x + FAN.dx * 0.2, z = FAN.z + FAN.dz * 0.2; return new THREE.Vector3(x, surface(x, z, 0, 1) + 0.08, z); })();

  return {
    key: 'erosion',
    group,
    duration: 13,
    setProgress,
    update,
    play() { stopLoops(); playing = true; if (sfx) { rainLoop = sfx.loop('rain', { gain: 0 }); waterLoop = sfx.loop('water', { gain: 0 }); } },
    stop() { playing = false; stopLoops(); },
    evidence: {
      from: { pos: fromPos, radius: 0.36 },
      to: { pos: toPos, radius: 0.36 },
    },
    thumb: { cam: [1.6, 2.6, 3.7], target: [-0.3, 0.48, 0.08], t: 0.68 }, // mid-transport: rain, gully, loads in the stream, fan starting
    dispose() { stopLoops(); for (const d of disposables) d.dispose?.(); },
  };
}
