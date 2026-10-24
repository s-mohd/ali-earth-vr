// Station 5 «تغييرات الإنسان لسطح الأرض» (human changes).
// People change the land. Three layered, grassy, rocky hills stand where the road will go. A foreman directs a yellow
// excavator that scoops the hills into a dump truck, sweeps the land flat and backs away (beep beep). A road roller then
// lays a new road where the hills stood (gravel bed, asphalt, black-and-white kerbs, pavements, lane marks, a zebra
// crossing), a two-storey Bahraini house rises behind it, a road sign, street lamps and a young palm pop up, the first car
// drives in and stops at the crossing, and the workers wave.
// t = 0: natural land (hills, rocks, shrubs), no road. t = 1: flat land, the finished street, the new house, the machines
// parked beside it (the truck heaped with the hills' soil and rocks).
//
// Rendering: everything that appears, grows or is dug away (plus the static props) is ONE merged mesh whose vertex shader
// shows each piece at its own moment (human_fx.js), so the whole build is a pure function of t at zero CPU cost.
import {
  THREE, PAL, clamp, lerp, seg, smooth, ease, fbm, vcMat, mergeParts, blobGeo, blobShadow, stageGround, puffTexture,
} from '../core/kit.js';
import { piece, mergePieces, storyUniforms, storyMaterials, groundMaterial, POP, RISE, GROW, HILL, ON_HILL, STATIC } from './human_fx.js';
import {
  cyl, box, ball, EX, buildExcavator, poseArm, buildTruck, TRUCK_BED, buildRoller, carGeo, workerGeo, armGeo, houseStages,
  lampParts, signParts, youngPalmParts, bushParts, tuftParts, rockGeo, groundAO,
} from './human_models.js';

const D2R = Math.PI / 180;
const DURATION = 13;

// ---------------------------------------------------------------- layout (station-local metres; viewer at z ≈ +3.6)
const ROAD = { z: 0.72, w: 0.84, kerb: 0.05, walk: 0.23, end: 2.69, seg: 0.15 };
const RZ0 = ROAD.z - ROAD.w / 2, RZ1 = ROAD.z + ROAD.w / 2; // asphalt edges (far, near)
const H_ASPH = [0.006, 0.032], H_KERB = 0.05, H_WALK = 0.034, H_GRAVEL = 0.018, H_PAINT = 0.0035;
// dug in this order (left → right: the first scoop uncovers the truck); they stand exactly where the road will run
const HILLS = [
  { x: -1.2, z: 0.72, rx: 0.8, rz: 0.6, h: 0.6, seed: 11, digDx: 0.05, lump: [0.26, -0.16] },
  { x: 0.0, z: 0.78, rx: 0.7, rz: 0.56, h: 0.54, seed: 7, digDx: -0.24, lump: [-0.2, -0.12] }, // bitten on its left shoulder: the arm stays readable
  { x: 1.2, z: 0.72, rx: 0.8, rz: 0.6, h: 0.68, seed: 3, digDx: -0.05, lump: [-0.24, 0.1] },
];
const WORK = { x: 0.1, z: -0.42 }; // where the excavator digs from
const PARK = { x: 1.2, z: -0.55 }; // where it parks at the end
const TRUCK = { x: -1.65, z: -0.62 }; // truck origin (cab faces -X)
const ROLLER = { z: 0.53, start: 2.4, stop: -2.3 }; // far lane: leads the fresh asphalt from the right rim, parks at the left
const HOUSE = { x: -0.9, z: -1.76, yaw: -0.12, s: 1.34 };
const LAMPS = [[-1.15, 0.13], [1.85, 0.13]];
const SIGN = [0.02, 0.1];
const ZEBRA = { x: 0.12, len: 0.3 };
const CAR = { z: ROAD.z + 0.21, from: -2.45, to: -0.66 };
const PALM2 = [1.28, ROAD.z + ROAD.w / 2 + ROAD.kerb + ROAD.walk / 2]; // a young palm planted on the new pavement
// two road workers on the near pavement, clear of Ali's and the board's corners; `arm` = the side that points/waves
const WORKERS = [{ x: 0.84, z: 1.32, arm: -1 }, { x: -1.0, z: 1.33, arm: 1 }];
const WORKER_S = 1.2;
const SHOULDER = { x: 0.066 * WORKER_S, y: 0.25 * WORKER_S };

// ---------------------------------------------------------------- timeline (fractions of the run)
const T = {
  cycle0: 0.08, cycle: 0.13, // three dig cycles
  sweepA: 0.49, sweepB: 0.545, // levelling sweep across the hills
  parkA: 0.555, parkB: 0.625, // reverse to the parking spot
  engineOff: 0.635,
  roller: [0.622, 0.645], rollerEngine: [0.645, 0.775],
  gravel: [0.6, 0.67], asphalt: [0.655, 0.775], walk: [0.69, 0.81],
  lines: [0.765, 0.83], dashes: [0.775, 0.85], zebra: [0.8, 0.84], arrows: [0.835, 0.86],
  slab: [0.845, 0.858], house: [0.855, 0.895], floor2: [0.885, 0.915], top: [0.905, 0.93], trim: [0.915, 0.95],
  path: [0.86, 0.9], sign: 0.89, lamps: [0.9, 0.92], palm: 0.935, car: [0.9, 0.985], wave: [0.945, 0.98],
};
const BEEPS = [0.565, 0.59, 0.615];
const RELEASE = 0.002, LAND = 0.028; // after the bucket starts to tip: its soil falls out, then lands on the heap

// ---------------------------------------------------------------- terrain functions
const dist = (x, z, p) => Math.hypot(x - p.x, z - p.z);
function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  const keep = (1 - smooth(2.25, 2.5, r)) * smooth(1.3, 1.8, r) * smooth(0.8, 1.05, Math.abs(z - ROAD.z))
    * smooth(0.75, 1.05, dist(x, z, { x: TRUCK.x + 0.1, z: TRUCK.z })) * smooth(0.85, 1.15, dist(x, z, PARK)) * smooth(0.7, 1.0, dist(x, z, HOUSE));
  return keep * 0.05 * fbm(x * 0.9 + 4.1, z * 0.9 - 1.3, 2);
}
const N_STRATA = 4;
const hillWob = (H, a) => 1 + 0.08 * Math.sin(a * 3 + H.seed) + 0.05 * Math.sin(a * 5 + H.seed * 2);
/** hill k: { f: 0..~1.2 height fraction before terracing, y: surface height } (y = 0 outside its footprint) */
function hillAt(k, x, z) {
  const H = HILLS[k], dx = (x - H.x) / H.rx, dz = (z - H.z) / H.rz;
  const s = Math.hypot(dx, dz) / hillWob(H, Math.atan2(dz, dx));
  if (s >= 1) return { f: 0, y: 0 };
  let f = 1 - s * s * (3 - 2 * s);
  const lx = (x - H.x - H.lump[0]) / (H.rx * 0.42), lz = (z - H.z - H.lump[1]) / (H.rz * 0.42), ls = Math.hypot(lx, lz);
  if (ls < 1) f += 0.3 * (1 - ls * ls * (3 - 2 * ls)) * (1 - s);
  f *= 1 + 0.1 * fbm(x * 2.6 + H.seed, z * 2.6 - H.seed, 2);
  // strata ledges: each layer ends in a little step (natural layered rock, like Jebel Dukhan's slopes)
  const q = clamp(f, 0, 1.3) * N_STRATA, qi = Math.floor(q), qf = q - qi;
  const y = H.h * lerp(f, (qi + smooth(0.25, 0.8, qf)) / N_STRATA, 0.42);
  return { f, y };
}
/** 0..1 footprint of hill k, a little wider than the hill: the patch of graded soil left after digging */
function hillFoot(k, x, z) {
  const H = HILLS[k], dx = (x - H.x) / (H.rx + 0.14), dz = (z - H.z) / (H.rz + 0.12);
  return 1 - smooth(0.86, 1.02, Math.sqrt(dx * dx + dz * dz) + 0.1 * fbm(x * 3 + 2, z * 3, 2));
}
/** soft contact darkening under static props, baked into the ground colours */
function contactAO(x, z, list) {
  let s = 0;
  for (const e of list) {
    const dx = (x - e.x) / e.rx, dz = (z - e.z) / e.rz, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1) s = Math.max(s, e.k * (1 - smooth(0.2, 1, d)));
  }
  return s;
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function groundColor(x, z, out, ao) {
  const n = fbm(x * 1.4 + 7, z * 1.4 + 2, 3);
  out.set(PAL.sand).lerp(_c1.set(PAL.sandDark), clamp(0.3 + n * 0.9));
  const r = Math.hypot(x, z);
  const bias = 0.22 * smooth(1.5, 2.2, z) + 0.2 * smooth(-0.9, -1.9, z) + 0.12 * smooth(2.0, 2.5, r)
    - 0.4 * (1 - smooth(0.6, 1.0, Math.abs(z - ROAD.z))) - 0.25 * (1 - smooth(0.6, 1.1, dist(x, z, WORK)));
  const g = smooth(0.0, 0.22, fbm(x * 0.85 - 3, z * 0.85 + 5, 3) + bias);
  out.lerp(_c1.set(PAL.grass).lerp(_c2.set(PAL.grassDark), clamp(0.5 + fbm(x * 3, z * 3, 2) * 1.5)), g * 0.9);
  return out.multiplyScalar(1 - contactAO(x, z, ao));
}
/** freshly graded land where a hill stood: one even earth tone with faint scrape arcs left by the bucket */
function gradedColor(x, z, out) {
  const n = clamp(fbm(x * 2.6 - 6, z * 2.6 + 3, 3) * 1.6, -1, 1);
  out.set(PAL.clay).lerp(_c1.set(PAL.soil), 0.35).multiplyScalar(1 + 0.05 * n);
  return out.multiplyScalar(0.94 + 0.06 * Math.sin(Math.hypot(x - WORK.x, z - WORK.z) * 45));
}
// layered earth, bottom → top: red-brown clay, ochre sand, pale limestone, brown soil (then a grassy cap)
const STRATA = ['#b16a42', '#d9a364', '#f0dbb0', '#bf8350'].map((c) => new THREE.Color(c));
const STRATA_TREAD = ['#c2885c', '#e2bb85', '#e9d3a8', '#b98451'].map((c) => new THREE.Color(c));
function hillColor(x, z, f, ny, out, ao) {
  const n = fbm(x * 3.1 + 1, z * 3.1 - 4, 2);
  const L = clamp(Math.floor(clamp(f, 0, 0.999) * N_STRATA + 0.25 * n), 0, N_STRATA - 1);
  const tread = smooth(0.82, 0.95, ny);
  out.copy(STRATA[L]).lerp(STRATA_TREAD[L], tread).multiplyScalar((1 + 0.06 * n) * (0.9 + 0.1 * smooth(0.35, 0.7, ny)));
  // grass: a cap on the top and a little on the flat ledges
  const grass = Math.max(smooth(0.5, 0.64, f + n * 0.25) * smooth(0.5, 0.72, ny), 0.7 * tread * smooth(0.2, 0.42, f) * smooth(-0.18, 0.15, n));
  out.lerp(_c1.set(PAL.grass).lerp(_c2.set(PAL.grassLight), clamp(0.5 + n * 1.5)), grass);
  out.multiplyScalar(0.9 + 0.1 * smooth(0.0, 0.25, f)); // a touch darker at the foot
  return out.lerp(groundColor(x, z, _c2, ao), 1 - smooth(0.0, 0.07, f));
}

// ---------------------------------------------------------------- station
export default function buildStation(ctx = {}) {
  const sfx = ctx.sfx;
  const low = ctx.quality === 'low';
  const group = new THREE.Group();
  group.name = 'station:human';
  const tmpC = new THREE.Color();
  const U = { ...storyUniforms(), uBuilt: { value: 0 } };
  const pieces = [];
  const aoStatic = []; // contact shade under static props (baked into the ground)
  const aoBuilt = []; // contact shade under things built at the end (ground shader × uBuilt)

  // ---- static props: barrier, cones, shrubs, rocks, grass, the old date palm's trunk
  const deco = [];
  const gy = baseHeight;
  const cone = (x, z) => {
    const y = gy(x, z);
    deco.push({ geo: box(0.15, 0.025, 0.15), color: '#e0612f', pos: [x, y + 0.012, z] });
    deco.push({ geo: cyl(0.012, 0.2, 12, 0.068), color: '#ff7a33', pos: [x, y + 0.12, z] });
    deco.push({ geo: cyl(0.04, 0.045, 12, 0.052), color: '#ffffff', pos: [x, y + 0.13, z] });
    aoStatic.push({ x, z, rx: 0.12, rz: 0.12, k: 0.22 });
  };
  const barrier = (x, z, ry) => {
    const y = gy(x, z), c = Math.cos(ry), s = Math.sin(ry);
    for (const o of [-0.34, 0.34]) {
      const px = x + c * o, pz = z - s * o;
      deco.push({ geo: box(0.035, 0.26, 0.035), color: '#f4f4f0', pos: [px, y + 0.13, pz], rot: [0, ry, 0] });
      deco.push({ geo: box(0.05, 0.03, 0.18), color: '#7d8590', pos: [px, y + 0.015, pz], rot: [0, ry, 0] });
    }
    for (let i = 0; i < 6; i++) {
      const o = -0.36 + (i + 0.5) * 0.12;
      for (const hy of [0.24, 0.14]) deco.push({ geo: box(0.12, 0.06, 0.03), color: (i + (hy > 0.2 ? 0 : 1)) % 2 ? '#ffffff' : '#e8483b', pos: [x + c * o, y + hy, z - s * o], rot: [0, ry, 0] });
    }
    aoStatic.push({ x, z, rx: 0.42, rz: 0.12, k: 0.14 });
  };
  const shrub = (x, z, sc, seed) => { deco.push(...bushParts(x, gy(x, z), z, sc, seed)); aoStatic.push({ x, z, rx: 0.28 * sc, rz: 0.26 * sc, k: 0.3 }); };
  const rock = (x, z, r, seed) => { deco.push({ geo: rockGeo(r, seed), pos: [x, gy(x, z) + r * 0.2, z] }); aoStatic.push({ x, z, rx: r * 1.4, rz: r * 1.3, k: 0.22 }); };
  const tuft = (x, z, i) => deco.push(...tuftParts(x, gy(x, z), z, i));

  // safety first: a striped barrier on the viewer's side (low enough never to hide the road) and cones.
  // The front corners stay clear: Ali stands at (1.65, 1.5) and the info board at (-1.7, 1.45).
  barrier(-0.92, 2.12, 0.18);
  cone(0.32, 1.56); cone(1.25, 1.62); cone(-2.3, -0.22); cone(1.98, -0.05); cone(-1.22, -0.2);
  shrub(-2.05, -1.35, 1.0, 4); shrub(-0.6, -2.25, 1.1, 9); shrub(0.55, -2.3, 0.9, 14); shrub(1.5, -1.95, 0.8, 19);
  shrub(0.9, 2.3, 0.65, 24); shrub(-1.3, 2.3, 0.6, 29); shrub(-2.38, -0.62, 0.55, 34); shrub(2.42, -0.4, 0.6, 39);
  rock(-1.5, -1.95, 0.09, 1); rock(2.2, -1.2, 0.11, 2); rock(0.45, 2.05, 0.07, 3); rock(-0.15, 1.95, 0.06, 4); rock(0.9, -1.55, 0.08, 5);
  [[-0.75, 1.75], [0.7, 1.95], [0.05, 2.35], [1.3, 2.0], [-1.6, -1.95], [1.2, -2.25], [-2.45, -0.4], [2.0, -1.65],
    [0.32, -1.3], [-2.3, -0.95], [-1.15, 1.65], [0.55, 1.75], [-1.75, -1.2], [1.0, -1.85]].forEach(([x, z], i) => tuft(x, z, i + 1));
  // the old date palm (trunk static, crown sways)
  const PALM = { x: 2.0, z: -1.4 };
  for (let i = 0; i < 7; i++) deco.push({ geo: cyl(0.075 - i * 0.004, 0.19, 10, 0.085 - i * 0.004), color: i % 2 ? PAL.trunk : PAL.trunkDark, pos: [PALM.x - i * 0.012, i * 0.18 + 0.095, PALM.z + i * 0.006], rot: [0.03, 0, 0.07] });
  aoStatic.push({ x: PALM.x, z: PALM.z, rx: 0.22, rz: 0.2, k: 0.3 });
  aoStatic.push({ x: TRUCK.x, z: TRUCK.z, rx: 0.62, rz: 0.34, k: 0.14 });
  aoStatic.push({ x: PARK.x, z: PARK.z, rx: 0.5, rz: 0.4, k: 0.06 });
  const decoGeo = mergeParts(deco);
  groundAO(decoGeo, 0.0, 0.14, 0.2);
  pieces.push(piece(decoGeo));

  // ---- the hills: layered earth with ledges, a grassy cap, shrubs, grass and rocks; dug by lowering their level
  const NR = low ? 16 : 20, NS = low ? 36 : 44;
  HILLS.forEach((H, k) => {
    const pos = [], col = [], idx = [];
    const ringOf = (i) => 1 + (i - 1) * NS;
    pos.push(H.x, hillAt(k, H.x, H.z).y, H.z);
    for (let i = 1; i <= NR; i++) {
      const s = (1.03 * i) / NR;
      for (let j = 0; j < NS; j++) {
        const a = (j / NS) * Math.PI * 2, r = s * hillWob(H, a); // rings follow the hill's wobbly outline
        const x = H.x + Math.cos(a) * r * H.rx, z = H.z + Math.sin(a) * r * H.rz;
        pos.push(x, s >= 0.995 ? -0.012 : hillAt(k, x, z).y - 0.004, z);
      }
    }
    for (let j = 0; j < NS; j++) idx.push(0, ringOf(1) + ((j + 1) % NS), ringOf(1) + j);
    for (let i = 1; i < NR; i++) {
      const a0 = ringOf(i), a1 = ringOf(i + 1);
      for (let j = 0; j < NS; j++) { const j1 = (j + 1) % NS; idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, C = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      hillColor(x, z, hillAt(k, x, z).f, N.getY(i), tmpC, aoStatic).toArray(C, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    pieces.push(piece(g, { anchor: [0, -0.02, 0], mode: HILL, k }));
  });
  // shrubs, grass and rocks on the hills [hill, dx, dz, kind, size, seed]
  const HP = [
    [0, -0.18, 0.06, 'bush', 0.6, 51], [0, 0.3, -0.18, 'bush', 0.45, 55], [0, -0.42, 0.22, 'rock', 0.13, 12], [0, 0.16, 0.28, 'rock', 0.1, 13],
    [0, 0.05, -0.05, 'tuft', 1.2, 3], [0, -0.35, -0.15, 'tuft', 1, 4], [0, 0.45, 0.12, 'tuft', 1, 5],
    [0, -0.55, -0.1, 'bush', 0.4, 57], [0, 0.42, 0.3, 'tuft', 1.1, 11], [0, -0.1, 0.38, 'tuft', 0.9, 12],
    [1, 0.12, 0.02, 'bush', 0.55, 61], [1, -0.3, -0.12, 'bush', 0.38, 65], [1, 0.34, 0.26, 'rock', 0.12, 14], [1, -0.32, 0.2, 'rock', 0.08, 15], [1, -0.05, -0.22, 'tuft', 1.1, 6], [1, 0.25, -0.2, 'tuft', 1, 7], [1, 0.05, 0.34, 'tuft', 0.9, 13],
    [2, -0.26, 0.12, 'bush', 0.62, 71], [2, 0.3, -0.06, 'bush', 0.48, 75], [2, 0.02, 0.26, 'rock', 0.15, 16], [2, 0.48, 0.2, 'rock', 0.09, 17],
    [2, -0.05, -0.18, 'tuft', 1.2, 8], [2, 0.38, 0.3, 'tuft', 1, 9], [2, -0.5, -0.05, 'tuft', 1, 10], [2, 0.55, -0.2, 'bush', 0.36, 79], [2, -0.3, 0.36, 'tuft', 0.9, 14],
  ];
  for (const [k, dx, dz, kind, sz, seed] of HP) {
    const x = HILLS[k].x + dx, z = HILLS[k].z + dz, y = hillAt(k, x, z).y;
    if (kind === 'bush') pieces.push(piece(bushParts(x, y - 0.03, z, sz, seed), { anchor: [x, y, z], t: [0.55, 0.95], mode: ON_HILL, k }));
    else if (kind === 'tuft') pieces.push(piece(tuftParts(x, y - 0.01, z, seed, sz), { anchor: [x, y, z], t: [0.6, 0.92], mode: ON_HILL, k }));
    else pieces.push(piece([{ geo: rockGeo(sz, seed, 0.7), pos: [x, y - sz * 0.15, z] }], { anchor: [x, y, z], t: y > HILLS[k].h * 0.6 ? [0.45, 0.9] : [0.0, 0.3], mode: ON_HILL, k }));
  }

  // ---- the road: gravel bed, asphalt (both laid under the roller), kerbs, pavements, paint, all in segments
  const rollerXe = Math.sqrt(ROAD.end * ROAD.end - ROLLER.z * ROLLER.z); // the asphalt's left end at the roller's lane
  const frontAt = (a) => ROAD.end - a * (ROAD.end + rollerXe); // asphalt front (x) for eased progress a
  /** first t in [t0, t1] at which ease.inOut(seg(t)) reaches u */
  const invEase = (u, t0, t1) => { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (ease.inOut(m) < u) lo = m; else hi = m; } return lerp(t0, t1, lo); };
  const asphaltT = (x) => invEase(clamp((ROAD.end - x) / (ROAD.end + rollerXe)), ...T.asphalt);
  const gravelT = (x) => invEase(clamp((ROAD.end - x) / (2 * ROAD.end)), ...T.gravel);
  const walkT = (x) => lerp(T.walk[0], T.walk[1], clamp((ROAD.end - x) / (2 * ROAD.end)));
  /** a slab (top + 4 sides, no bottom) whose ends follow the rim circle; paint = top quad only. null if outside the rim */
  const clipBox = (x0, x1, z0, z1, y0, y1, color, paintOnly = false) => {
    const g = paintOnly ? new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y1, (z0 + z1) / 2)
      : new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (!paintOnly) g.setIndex([...g.index.array.slice(0, 18), ...g.index.array.slice(24)]); // drop the -Y face (never seen)
    const out = mergeParts([{ geo: g, color }]);
    const p = out.attributes.position;
    let inside = false;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), xe = Math.sqrt(Math.max(0, ROAD.end * ROAD.end - z * z)), x = p.getX(i);
      if (Math.abs(x) < xe - 0.01) inside = true;
      p.setX(i, clamp(x, -xe, xe));
    }
    return inside ? out : null;
  };
  const NSEG = Math.ceil((2 * ROAD.end) / ROAD.seg);
  const asphaltCol = new THREE.Color('#4f5762'), gravelCol = new THREE.Color('#cfc3ab');
  for (let i = 0; i < NSEG; i++) {
    const x0 = -ROAD.end + i * ROAD.seg, x1 = x0 + ROAD.seg, xc = (x0 + x1) / 2, n = fbm(xc * 3.3, 1.7, 2);
    const gG = clipBox(x0, x1, RZ0 - ROAD.kerb, RZ1 + ROAD.kerb, 0, H_GRAVEL, tmpC.copy(gravelCol).multiplyScalar(1 + 0.05 * n).getHex());
    if (gG) { const t0 = gravelT(x1); pieces.push(piece(gG, { anchor: [xc, 0, ROAD.z], t: [t0, t0 + 0.012], mode: GROW })); }
    const aG = clipBox(x0, x1, RZ0, RZ1, H_ASPH[0], H_ASPH[1], tmpC.copy(asphaltCol).multiplyScalar(1 + 0.04 * n).getHex());
    if (aG) pieces.push(piece(aG, { anchor: [xc, H_ASPH[0], ROAD.z], t: [asphaltT(x1), asphaltT(x0) + 0.003], mode: GROW }));
    // black-and-white kerbs (Gulf style) pop in right behind the roller
    for (const [z0, z1] of [[RZ0 - ROAD.kerb, RZ0], [RZ1, RZ1 + ROAD.kerb]]) {
      const kG = clipBox(x0 + 0.004, x1 - 0.004, z0, z1, 0, H_KERB, i % 2 ? '#f3f3ee' : '#2e3238');
      if (kG) { const t0 = asphaltT(xc) + 0.008; pieces.push(piece(kG, { anchor: [xc, 0, (z0 + z1) / 2], t: [t0, t0 + 0.012], mode: POP })); }
    }
    // pavements: warm pavers in two rows, laid tile by tile
    for (const [z0, side] of [[RZ0 - ROAD.kerb - ROAD.walk, 0], [RZ1 + ROAD.kerb, 1]]) {
      for (let r = 0; r < 2; r++) {
        const za = z0 + (r * ROAD.walk) / 2, zb = za + ROAD.walk / 2;
        const wG = clipBox(x0 + 0.003, x1 - 0.003, za + 0.003, zb - 0.003, 0, H_WALK, (i + r + side) % 2 ? '#ecd8b4' : '#dcc39a');
        if (wG) { const t0 = walkT(xc) + r * 0.004 + side * 0.01; pieces.push(piece(wG, { anchor: [xc, 0, (za + zb) / 2], t: [t0, t0 + 0.014], mode: POP })); }
      }
    }
    // edge lines, painted left → right
    for (const zc of [RZ0 + 0.065, RZ1 - 0.065]) {
      const lG = clipBox(x0, x1, zc - 0.018, zc + 0.018, H_ASPH[1] - 0.002, H_ASPH[1] + H_PAINT, '#fbfbf6', true);
      if (lG) { const t0 = lerp(T.lines[0], T.lines[1], (xc + ROAD.end) / (2 * ROAD.end)); pieces.push(piece(lG, { anchor: [xc, H_ASPH[1] - 0.002, zc], t: [t0, t0 + 0.01], mode: GROW, glow: 0.18 })); }
    }
  }
  const paint = (parts, anchor, t) => pieces.push(piece(parts, { anchor, t, mode: POP, glow: 0.18 }));
  const PY = H_ASPH[1] + 0.0025; // paint: flat quads just above the asphalt
  const quad = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  // centre dashes pop one by one (left → right), skipping the crossing
  const dashXs = [];
  for (let x = -2.2; x <= 2.3; x += 0.5) if (Math.abs(x - ZEBRA.x) > 0.32) dashXs.push(x);
  dashXs.forEach((x, i) => { const t0 = lerp(T.dashes[0], T.dashes[1] - 0.02, i / (dashXs.length - 1)); paint([{ geo: quad(0.26, 0.05), color: '#fbfbf6', pos: [x, PY, ROAD.z] }], [x, PY, ROAD.z], [t0, t0 + 0.02]); });
  // zebra crossing (bars along the traffic, across the road), a stop line and two lane arrows
  for (let i = 0; i < 6; i++) {
    const z = RZ0 + 0.1 + (i * (ROAD.w - 0.2)) / 5, t0 = lerp(T.zebra[0], T.zebra[1] - 0.015, i / 5);
    paint([{ geo: quad(ZEBRA.len, 0.075), color: '#ffffff', pos: [ZEBRA.x, PY, z] }], [ZEBRA.x, PY, z], [t0, t0 + 0.016]);
  }
  paint([{ geo: quad(0.045, ROAD.w / 2 - 0.06), color: '#ffffff', pos: [ZEBRA.x - ZEBRA.len / 2 - 0.12, PY, ROAD.z + ROAD.w / 4] }], [ZEBRA.x - ZEBRA.len / 2 - 0.12, PY, ROAD.z + ROAD.w / 4], [T.zebra[1] - 0.01, T.zebra[1] + 0.01]);
  const arrow = (x, z, dir) => [
    { geo: quad(0.17, 0.035), color: '#ffffff', pos: [x - dir * 0.04, PY, z] },
    { geo: new THREE.CircleGeometry(0.065, 3).rotateX(-Math.PI / 2).rotateY(dir > 0 ? 0 : Math.PI), color: '#ffffff', pos: [x + dir * 0.07, PY, z], scale: [1, 1, 0.9] },
  ];
  paint(arrow(0.72, CAR.z, 1), [0.72, PY, CAR.z], [T.arrows[0], T.arrows[0] + 0.02]);
  paint(arrow(-1.45, ROLLER.z - 0.02, -1), [-1.45, PY, ROLLER.z - 0.02], [T.arrows[1] - 0.02, T.arrows[1]]);

  // ---- the new house rises behind the road (slab, ground floor, upper floor, parapets and wind tower, then the trim)
  const HM = new THREE.Matrix4().compose(new THREE.Vector3(HOUSE.x, baseHeight(HOUSE.x, HOUSE.z), HOUSE.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), HOUSE.yaw), new THREE.Vector3().setScalar(HOUSE.s));
  const HT = { slab: [T.slab, GROW], floor1: [T.house, RISE], floor2: [T.floor2, RISE], top: [T.top, POP] };
  for (const st of houseStages()) {
    const g = mergeParts(st.parts).applyMatrix4(HM);
    if (st.when === 'floor1') groundAO(g, 0, 0.12, 0.18);
    const anchor = new THREE.Vector3(...st.anchor).applyMatrix4(HM).toArray();
    const [t, mode] = st.when === 'trim' ? [[T.trim[0] + st.i * 0.005, T.trim[0] + st.i * 0.005 + 0.012], POP] : HT[st.when];
    pieces.push(piece(g, { anchor, t, mode }));
  }
  aoBuilt.push({ x: HOUSE.x, z: HOUSE.z, rx: 0.56, rz: 0.46, k: 0.32 });
  // stepping-stone path from the pavement to the door
  const door = new THREE.Vector3(0.13, 0, 0.31).applyMatrix4(HM);
  for (let i = 0; i < 6; i++) {
    const u = i / 5, x = lerp(door.x, door.x + 0.08, u), z = lerp(door.z + 0.12, RZ0 - ROAD.kerb - ROAD.walk - 0.1, u), y = baseHeight(x, z);
    const t0 = lerp(T.path[1] - 0.014, T.path[0], u);
    pieces.push(piece([{ geo: box(0.16, 0.016, 0.13), color: i % 2 ? '#e3cda6' : '#d8bf95', pos: [x, y + 0.008, z], rot: [0, 0.05 * Math.sin(i * 2.3), 0] }], { anchor: [x, y, z], t: [t0, t0 + 0.012], mode: POP }));
  }

  // ---- street lamps, a road sign, a young palm
  const placeParts = (parts, x, z, ry) => { const M = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)); return mergeParts(parts).applyMatrix4(M); };
  LAMPS.forEach(([x, z], i) => {
    const L = lampParts(), t = [T.lamps[i], T.lamps[i] + 0.045], y = H_WALK;
    const b = placeParts(L.body, x, z, 0); b.translate(0, y, 0);
    const l = placeParts(L.light, x, z, 0); l.translate(0, y, 0);
    pieces.push(piece(b, { anchor: [x, y, z], t, mode: POP }), piece(l, { anchor: [x, y, z], t, mode: POP, glow: 0.85 }));
    aoBuilt.push({ x, z, rx: 0.12, rz: 0.12, k: 0.2 });
  });
  {
    const S = signParts(), t = [T.sign, T.sign + 0.045];
    const b = placeParts(S.body, SIGN[0], SIGN[1], 0.12); b.translate(0, H_WALK, 0);
    const f = placeParts(S.face, SIGN[0], SIGN[1], 0.12); f.translate(0, H_WALK, 0);
    pieces.push(piece(b, { anchor: [SIGN[0], H_WALK, SIGN[1]], t, mode: POP }), piece(f, { anchor: [SIGN[0], H_WALK, SIGN[1]], t, mode: POP, glow: 0.22 }));
  }
  {
    const y = H_WALK;
    const g = placeParts(youngPalmParts(2), PALM2[0], PALM2[1], 0); g.translate(0, y, 0);
    pieces.push(piece(g, { anchor: [PALM2[0], y, PALM2[1]], t: [T.palm, T.palm + 0.04], mode: POP }));
  }

  // ---- ONE story mesh (static props + hills + road + house + furniture) with its shadow caster
  const story = storyMaterials(U);
  const storyMesh = new THREE.Mesh(mergePieces(pieces), story.material);
  storyMesh.customDepthMaterial = story.depth;
  storyMesh.frustumCulled = false;
  group.add(storyMesh);

  // ---- ground: one disc; graded earth appears where the hills are dug (all in its shader)
  const ground = stageGround({ rings: low ? 28 : 34, segments: low ? 72 : 88, heightFn: baseHeight, colorFn: (x, z) => groundColor(x, z, tmpC, aoStatic), skirtColor: PAL.soilDark });
  {
    const P = ground.attributes.position, n = P.count, dig = new Float32Array(n * 3), grade = new Float32Array(n * 3), ao = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), z = P.getZ(i), skirt = P.getY(i) < -0.5;
      for (let k = 0; k < HILLS.length; k++) dig[i * 3 + k] = skirt ? 0 : hillFoot(k, x, z);
      gradedColor(x, z, tmpC).multiplyScalar(1 - contactAO(x, z, aoStatic)).toArray(grade, i * 3);
      ao[i] = skirt ? 0 : contactAO(x, z, aoBuilt);
    }
    ground.setAttribute('aDig', new THREE.BufferAttribute(dig, 3));
    ground.setAttribute('aGrade', new THREE.BufferAttribute(grade, 3));
    ground.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  }
  const groundMat = groundMaterial(U);
  group.add(new THREE.Mesh(ground, groundMat));

  const palmCrown = new THREE.Group();
  palmCrown.position.set(PALM.x - 0.08, 1.25, PALM.z + 0.04);
  const fr = [{ geo: ball(0.09, 10, 8), color: PAL.trunkDark, pos: [0, 0, 0] }];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, droop = 0.3 + (i % 3) * 0.18;
    fr.push({ geo: ball(1, 8, 5), color: i % 2 ? PAL.palmLeaf : PAL.leafDark, pos: [Math.cos(a) * 0.28, -0.04 - droop * 0.12, -Math.sin(a) * 0.28], rot: [0, a, -droop], scale: [0.36, 0.028, 0.085] });
  }
  for (let i = 0; i < 6; i++) fr.push({ geo: ball(0.032, 8, 6), color: PAL.dates, pos: [Math.cos(i * 1.1) * 0.08, -0.09 - (i % 2) * 0.035, Math.sin(i * 1.1) * 0.08] });
  palmCrown.add(new THREE.Mesh(mergeParts(fr), vcMat()));
  group.add(palmCrown);

  // ---- machines (a soft contact shade under each; the sun's shadow map does the rest)
  const ex = buildExcavator();
  group.add(ex.base);
  const exShade = blobShadow(0.62, 0.44, 0.2, ex.base, [0, 0.01, 0]);
  const truck = buildTruck();
  truck.group.position.set(TRUCK.x, 0, TRUCK.z);
  group.add(truck.group);
  const truckShade = blobShadow(0.58, 0.3, 0.2, truck.group, [0, 0.01, 0]);
  const roller = buildRoller();
  group.add(roller.mesh);
  const rollerShade = blobShadow(0.3, 0.18, 0.22, roller.mesh, [0, 0.008, 0]);
  const car = new THREE.Mesh(carGeo(), vcMat());
  car.position.set(CAR.from, H_ASPH[1], CAR.z);
  group.add(car);
  const carShade = blobShadow(0.22, 0.13, 0.25, car, [0, 0.004, 0]);

  // ---- the road workers: bodies and arms are two instanced meshes (each arm aims from its shoulder)
  const workers = new THREE.InstancedMesh(workerGeo(WORKER_S), vcMat(), WORKERS.length);
  const armMesh = new THREE.InstancedMesh(armGeo(WORKER_S), vcMat(), WORKERS.length * 2);
  workers.frustumCulled = armMesh.frustumCulled = false;
  group.add(workers, armMesh);
  const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), A = new THREE.Vector3(), WV = new THREE.Vector3();
  const wk = WORKERS.map((w) => ({ ...w, y0: baseHeight(w.x, w.z), y: 0, step: walkT(w.x) + 0.01, face: Math.atan2(-w.x, 3.6 - w.z), yaw: 0 }));
  const armState = wk.flatMap((w, i) => [-1, 1].map((sx) => ({ w: i, sx, rest: new THREE.Vector3(sx * 0.22, -1, 0.08).normalize(), aim: new THREE.Vector3(0, -1, 0), wa: 0, wave: 0 })));

  // ---- arm keyframes { t, yaw, rho, y, phi }: turret yaw, wrist reach from the turret axis, wrist height, bucket angle
  const keys = [];
  const key = (t, yaw, rho, y, phi) => keys.push({ t, yaw, rho, y, phi });
  const aim = (from, x, z) => ({ yaw: Math.atan2(-(z - from.z), x - from.x), rho: Math.hypot(x - from.x, z - from.z) });
  const bedX = TRUCK.x + TRUCK_BED.x, bedTop = TRUCK_BED.top;
  const tAim = aim(WORK, bedX + 0.1, TRUCK.z);
  if (tAim.yaw > -Math.PI) tAim.yaw -= Math.PI * 2; // unwrapped: every swing passes in front of the cab (toward the viewer)
  const REST = { yaw: -172 * D2R, rho: 1.03, y: 0.31, phi: -100 * D2R };
  key(0, REST.yaw, REST.rho, REST.y, REST.phi);
  key(T.cycle0 - 0.01, REST.yaw, REST.rho, REST.y + 0.05, REST.phi - 0.2);
  const dumpT = [], digT = [], digAt = [], hillYaw = HILLS.map((H) => aim(WORK, H.x, H.z).yaw);
  HILLS.forEach((H, k) => {
    const s = T.cycle0 + k * T.cycle, dig = { x: H.x + H.digDx, z: H.z + 0.02 }, a = aim(WORK, dig.x, dig.z), top = H.h;
    key(s + 0.036, a.yaw, a.rho + 0.06, top + 0.46, -55 * D2R); // above the hill, bucket open
    key(s + 0.052, a.yaw, a.rho + 0.04, top * 0.55 + 0.22, -78 * D2R); // bite
    key(s + 0.075, a.yaw, a.rho - 0.2, top * 0.3 + 0.24, -178 * D2R); // curl: scoop
    key(s + 0.09, lerp(a.yaw, tAim.yaw, 0.15), a.rho - 0.24, 1.02, -192 * D2R); // lift
    key(s + 0.112, tAim.yaw, tAim.rho, 0.98, -192 * D2R); // over the truck
    key(s + 0.124, tAim.yaw, tAim.rho + 0.05, 1.02, -40 * D2R); // dump
    digT.push([s + 0.05, s + 0.078]);
    digAt.push(dig);
    dumpT.push(s + 0.117);
  });
  // levelling sweep from the far left to the far right, bucket flat on the ground
  const sweepFrom = -154 * D2R, sweepTo = -30 * D2R, SWEEP_R = 1.42;
  key(T.sweepA, sweepFrom, SWEEP_R, 0.3, -96 * D2R);
  key(T.sweepB, sweepTo, SWEEP_R, 0.3, -96 * D2R);
  // fold the arm and reverse to the parking spot
  key(T.parkA, sweepTo - 0.1, 1.05, 0.66, -125 * D2R);
  key(T.parkA + 0.03, -80 * D2R, 0.85, 0.85, -165 * D2R);
  key(T.parkB + 0.01, REST.yaw, REST.rho, REST.y, REST.phi);
  key(1, REST.yaw, REST.rho, REST.y, REST.phi);

  const pose = { yaw: 0, rho: 0, y: 0, phi: 0 };
  let kIdx = 0;
  function sampleKeys(t) {
    if (t < keys[kIdx].t) kIdx = 0;
    while (kIdx < keys.length - 2 && t >= keys[kIdx + 1].t) kIdx++;
    const a = keys[kIdx], b = keys[kIdx + 1], u = ease.inOut(seg(t, a.t, b.t));
    pose.yaw = lerp(a.yaw, b.yaw, u); pose.rho = lerp(a.rho, b.rho, u); pose.y = lerp(a.y, b.y, u); pose.phi = lerp(a.phi, b.phi, u);
  }
  // the bucket's mouth (just outside its opening) as it tips over the truck: the soil falls from exactly there
  const mouth = dumpT.map((d) => {
    ex.base.position.set(WORK.x, 0, WORK.z);
    sampleKeys(d + RELEASE + 0.004);
    poseArm(ex, pose.yaw, pose.rho, pose.y, pose.phi);
    group.updateMatrixWorld(true);
    return group.worldToLocal(ex.bucket.localToWorld(new THREE.Vector3(EX.BUCKET_R, -EX.BUCKET_R * 0.75, 0)));
  });

  // ---- story events: dust puffs, steam and soil clumps (pure functions of t)
  const events = [];
  const DUST = '#ecd6ad', STEAM = '#e9e4dc';
  HILLS.forEach((H, k) => {
    const s = T.cycle0 + k * T.cycle, d = dumpT[k], m = mouth[k], dig = digAt[k];
    for (let i = 0; i < 3; i++) events.push({ t0: s + 0.052 + i * 0.006, life: 0.9, x: dig.x + (i - 1) * 0.12, y: H.h * 0.6, z: dig.z + 0.05 * i, vx: (i - 1) * 0.12, vy: 0.16, vz: 0.08, color: DUST });
    // soil (and one rock) tumbles from the tipping bucket and lands on the heap at d + LAND
    for (let i = 0; i < 5; i++) events.push({ t0: d + RELEASE + i * 0.004, life: (LAND - RELEASE) * DURATION, x: m.x + (i - 2) * 0.04, y: m.y, z: m.z + (((i * 3) % 5) - 2) * 0.035, size: i === 2 ? 0.065 : 0.05, clump: true, color: i === 2 ? PAL.rock : i % 2 ? PAL.soilDark : PAL.soil });
    for (let i = 0; i < 3; i++) events.push({ t0: d + LAND + i * 0.004, life: 0.8, x: bedX + (i - 1) * 0.2, y: bedTop + 0.1, z: TRUCK.z + 0.2, vx: (i - 1) * 0.15, vy: 0.14, vz: 0.1, color: DUST });
  });
  for (let i = 0; i < 6; i++) {
    const u = (i + 0.5) / 6, yaw = lerp(sweepFrom, sweepTo, u);
    events.push({ t0: lerp(T.sweepA, T.sweepB, u), life: 0.8, x: WORK.x + Math.cos(yaw) * (SWEEP_R + 0.12), y: 0.05, z: WORK.z - Math.sin(yaw) * (SWEEP_R + 0.12), vx: 0.08, vy: 0.14, vz: 0.1, color: DUST });
  }
  for (let i = 0; i < 4; i++) events.push({ t0: T.parkA + 0.01 + i * 0.016, life: 0.7, x: lerp(WORK.x, PARK.x, i / 4) - 0.4, y: 0.04, z: lerp(WORK.z, PARK.z, i / 4) + (i % 2 ? 0.32 : -0.32), vx: -0.1, vy: 0.12, vz: 0, color: DUST });
  // faint warm steam lifting off the fresh asphalt behind the roller
  for (let i = 0; i < 7; i++) {
    const u = (i + 0.5) / 7, x = ROAD.end - u * 2 * ROAD.end;
    events.push({ t0: asphaltT(x), life: 1.4, x: x + 0.25, y: 0.06, z: ROAD.z + (i % 2 ? 0.2 : -0.05), vx: 0.02, vy: 0.28, vz: 0.02, grow: [0.1, 0.26], alpha: 0.35, color: STEAM });
  }
  // the house settles in a little cloud of dust
  for (let i = 0; i < 3; i++) events.push({ t0: T.house[0] + 0.004 * i, life: 0.8, x: HOUSE.x + (i - 1) * 0.3, y: 0.05, z: HOUSE.z + 0.32, vx: (i - 1) * 0.12, vy: 0.12, vz: 0.1, color: DUST });

  // ---- particles: soft puffs (exhaust smoke in the first slots, then dust; one Points call) + solid clumps
  const SMOKE_N = low ? 0 : 4;
  const dust = events.filter((ev) => !ev.clump), clumps = events.filter((ev) => ev.clump);
  const PUFF_N = SMOKE_N + dust.length;
  const puffPos = new Float32Array(PUFF_N * 3).fill(-5), puffCol = new Float32Array(PUFF_N * 4), puffSize = new Float32Array(PUFF_N);
  for (let i = 0; i < PUFF_N; i++) tmpC.set(i < SMOKE_N ? '#f6f7f9' : dust[i - SMOKE_N].color).toArray(puffCol, i * 4);
  const puffGeo = new THREE.BufferGeometry();
  puffGeo.setAttribute('position', new THREE.BufferAttribute(puffPos, 3).setUsage(THREE.DynamicDrawUsage));
  puffGeo.setAttribute('color', new THREE.BufferAttribute(puffCol, 4).setUsage(THREE.DynamicDrawUsage));
  puffGeo.setAttribute('psize', new THREE.BufferAttribute(puffSize, 1).setUsage(THREE.DynamicDrawUsage));
  const puffMat = new THREE.PointsMaterial({ size: 1, map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  // psize = the puff's true world diameter on every display: three's size attenuation ignores the field of view, so
  // scale by projection[1][1] (= 1/tan(fovY/2)); otherwise puffs tuned on a screen would be ~1.8× wider in a Quest
  puffMat.onBeforeCompile = (sh) => { sh.vertexShader = 'attribute float psize;\n' + sh.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * psize * projectionMatrix[1][1];'); };
  puffMat.customProgramCacheKey = () => 'human-puff-psize-fov';
  const puffs = new THREE.Points(puffGeo, puffMat);
  puffs.frustumCulled = false;
  puffs.renderOrder = 2;
  group.add(puffs);
  const chunks = new THREE.InstancedMesh(mergeParts([{ geo: blobGeo(1, { detail: 0, seed: 2, jitter: 0.25 }), color: '#ffffff' }]), vcMat(), clumps.length);
  chunks.frustumCulled = false;
  clumps.forEach((ev, i) => chunks.setColorAt(i, tmpC.set(ev.color)));
  group.add(chunks);

  // ---------------------------------------------------------------- per-t state (no allocations below)
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
  let clumpsLive = true, dustLive = true, ambT = 0;
  const DUST_GROW = [0.14, 0.32];
  const rollerRunning = (t) => t >= T.rollerEngine[0] && t < T.rollerEngine[1];
  const smokeOn = () => SMOKE_N > 0 && (curT < T.engineOff || rollerRunning(curT));
  const puffAttrs = [puffGeo.attributes.position, puffGeo.attributes.color, puffGeo.attributes.psize];
  const markPuffs = () => { for (let i = 0; i < 3; i++) puffAttrs[i].needsUpdate = true; };
  /** one soft puff: position, alpha, size (a hidden puff parks under the ground, where depth testing drops it) */
  function setPuff(i, x, y, z, a, size) {
    puffPos[i * 3] = x; puffPos[i * 3 + 1] = a > 0.004 ? y : -5; puffPos[i * 3 + 2] = z;
    puffCol[i * 4 + 3] = a;
    puffSize[i] = size;
  }

  function setParticles(t) {
    let live = false;
    for (let n = 0; n < clumps.length; n++) {
      const ev = clumps[n], u = ((t - ev.t0) * DURATION) / ev.life;
      if (u <= 0 || u >= 1) { if (clumpsLive) chunks.setMatrixAt(n, M.makeScale(0, 0, 0)); continue; }
      live = true;
      V.set(ev.x, lerp(ev.y, bedTop + 0.08, u * u), ev.z);
      chunks.setMatrixAt(n, M.compose(V, Q.identity(), S.setScalar(ev.size * (1 - smooth(0.85, 1, u)))));
    }
    if (live || clumpsLive) chunks.instanceMatrix.needsUpdate = true;
    clumpsLive = live;
    chunks.visible = clumpsLive;
    live = false;
    for (let n = 0; n < dust.length; n++) {
      const ev = dust[n], age = (t - ev.t0) * DURATION, u = age / ev.life;
      if (u <= 0 || u >= 1) { setPuff(SMOKE_N + n, 0, 0, 0, 0, 0); continue; }
      live = true;
      const g = ev.grow || DUST_GROW;
      setPuff(SMOKE_N + n, ev.x + ev.vx * age, ev.y + ev.vy * age, ev.z + ev.vz * age, (ev.alpha ?? 0.9) * smooth(0, 0.12, u) * (1 - smooth(0.45, 1, u)), lerp(g[0], g[1], ease.out(u)));
    }
    if (live || dustLive) markPuffs();
    dustLive = live;
    puffs.visible = dustLive || smokeOn();
  }

  function setRoad(t) {
    // the roller rides on the asphalt's leading edge (waiting at the right rim until it arrives, parking at the left)
    const a = ease.inOut(seg(t, T.asphalt[0], T.asphalt[1]));
    const pop = ease.outBack(seg(t, T.roller[0], T.roller[1]));
    roller.mesh.visible = pop > 0.001;
    const x = clamp(frontAt(a) + 0.2, ROLLER.stop, ROLLER.start);
    const moving = x > ROLLER.stop && x < ROLLER.start;
    roller.mesh.position.set(x, H_ASPH[1] - 0.004 + (moving ? Math.abs(Math.sin(x * 40)) * 0.004 : 0), ROLLER.z);
    roller.mesh.scale.setScalar(Math.max(pop, 1e-3));
    // the first car drives in on the near lane and stops at the crossing
    const c = ease.out(seg(t, T.car[0], T.car[1]));
    car.visible = c > 0;
    car.position.x = lerp(CAR.from, CAR.to, c);
    car.position.y = H_ASPH[1] + (c > 0 && c < 1 ? Math.abs(Math.sin(c * 30)) * 0.004 : 0);
    U.uBuilt.value = smooth(T.slab[0], T.trim[0], t);
  }

  // ---- workers: W0 directs each scoop, W1 directs the roller, both wave at the end
  /** turn worker i partly toward a target and point at it with the arm on the target's side (weight 0 = relaxed) */
  function aimWorker(i, weight, tx, ty, tz) {
    const w = wk[i];
    let d = Math.atan2(tx - w.x, tz - w.z) - w.face;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    w.yaw = w.face + d * 0.45 * weight;
    const c = Math.cos(w.yaw), s = Math.sin(w.yaw);
    for (let j = 0; j < 2; j++) {
      const a = armState[i * 2 + j], ox = a.sx * SHOULDER.x;
      const dx = tx - (w.x + ox * c), dy = ty - (w.y + SHOULDER.y), dz = tz - (w.z - ox * s);
      a.aim.set(dx * c - dz * s, dy, dx * s + dz * c).normalize();
      a.wa = weight * smooth(-0.2, 0.2, a.aim.x * a.sx); // hands over smoothly as the target passes in front
    }
  }
  function poseWorkers(time) {
    for (let i = 0; i < wk.length; i++) {
      const w = wk[i];
      workers.setMatrixAt(i, M.compose(V.set(w.x, w.y, w.z), Q.setFromAxisAngle(UP, w.yaw), S.setScalar(1)));
    }
    for (let j = 0; j < armState.length; j++) {
      const a = armState[j], w = wk[a.w], c = Math.cos(w.yaw), s = Math.sin(w.yaw), ox = a.sx * SHOULDER.x;
      A.copy(a.rest).lerp(a.aim, a.wa);
      if (a.wave > 0) A.lerp(WV.set(a.sx * (0.5 + 0.35 * Math.sin(time * 7 + a.w * 2)), 1, 0.25).normalize(), a.wave);
      Q2.setFromUnitVectors(DOWN, A.normalize());
      Q.setFromAxisAngle(UP, w.yaw).multiply(Q2);
      armMesh.setMatrixAt(j, M.compose(V.set(w.x + ox * c, w.y + SHOULDER.y, w.z - ox * s), Q, S.setScalar(1)));
    }
    workers.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
  }
  function setWorkers(t) {
    for (let i = 0; i < wk.length; i++) wk[i].y = wk[i].y0 + H_WALK * smooth(wk[i].step, wk[i].step + 0.012, t); // they step up onto the new pavement
    let k = Math.floor((t - T.cycle0) / T.cycle), w0 = 0;
    if (k >= 0 && k < HILLS.length) {
      const s = T.cycle0 + k * T.cycle;
      w0 = smooth(s + 0.005, s + 0.03, t) * (1 - smooth(s + 0.085, s + 0.105, t));
    } else k = clamp(k, 0, HILLS.length - 1);
    aimWorker(0, w0, digAt[k].x, 0.3, digAt[k].z);
    const w1 = smooth(T.roller[0], T.roller[1] + 0.01, t) * (1 - smooth(T.asphalt[1] - 0.01, T.asphalt[1] + 0.03, t));
    aimWorker(1, w1, roller.mesh.position.x, 0.25, ROLLER.z);
    const wave = smooth(T.wave[0], T.wave[1], t);
    for (let j = 0; j < armState.length; j++) armState[j].wave = armState[j].sx === wk[armState[j].w].arm ? wave : 0;
    poseWorkers(ambT);
  }

  // ---------------------------------------------------------------- sound
  const ENGINE = { idle: { gain: 0.3, rate: 0.9 }, dig: { gain: 0.55, rate: 1.1 }, roller: { gain: 0.4, rate: 1.35 } };
  const engineAt = (t) => (t < T.cycle0 ? ENGINE.idle : t < T.engineOff ? ENGINE.dig : rollerRunning(t) ? ENGINE.roller : null);
  let playing = false, engine = null, engineCfg = null, prevT = 0, curT = 0;
  function sound(t) {
    if (!playing || !sfx) return;
    const crossed = (th) => prevT < th && t >= th;
    // engine: excavator idling, then digging until it is parked; later the roller's smaller engine while it paves
    const cfg = engineAt(t);
    if (!cfg) { engine?.stop(); engine = null; } else if (!engine) engine = sfx.loop('engine', cfg); else if (cfg !== engineCfg) engine.set(cfg);
    engineCfg = cfg;
    for (let i = 0; i < dumpT.length; i++) if (crossed(dumpT[i] + LAND)) sfx.play('thud', { gain: 0.8 });
    for (let i = 0; i < BEEPS.length; i++) if (crossed(BEEPS[i])) sfx.play('beep', { gain: 0.45 });
    if (crossed(T.asphalt[0])) sfx.play('whoosh', { gain: 0.5 });
    if (crossed(T.house[0] + 0.005)) sfx.play('pop', { gain: 0.6, rate: 0.8 });
    if (crossed(T.sign + 0.01)) sfx.play('pop', { gain: 0.6 });
    for (let i = 0; i < T.lamps.length; i++) if (crossed(T.lamps[i] + 0.01)) sfx.play('pop', { gain: 0.5, rate: 1.15 });
  }

  // ---------------------------------------------------------------- the story at t
  const levels = U.uLevels.value;
  function setProgress(tIn) {
    const t = clamp(tIn);
    curT = t;
    U.uStoryT.value = t;
    // excavator: reverses to its parking spot after levelling (a little track rumble while moving)
    const pk = ease.inOut(seg(t, T.parkA, T.parkB));
    ex.base.position.set(lerp(WORK.x, PARK.x, pk), pk > 0 && pk < 1 ? Math.abs(Math.sin(pk * Math.PI * 7)) * 0.008 : 0, lerp(WORK.z, PARK.z, pk));
    sampleKeys(t);
    poseArm(ex, pose.yaw, pose.rho, pose.y, pose.phi);
    let full = false;
    for (let k = 0; k < HILLS.length; k++) if (t > digT[k][0] + 0.02 && t < dumpT[k] + RELEASE) full = true;
    ex.soil.visible = full;

    // hills: each loses most of its soil in one scoop; the sweep takes the rest
    const sweepYaw = lerp(sweepFrom, sweepTo, ease.inOut(seg(t, T.sweepA, T.sweepB)));
    for (let k = 0; k < HILLS.length; k++) {
      const scoop = ease.inOut(seg(t, digT[k][0], digT[k][1]));
      levels.setComponent(k, (1 - 0.68 * scoop) * (1 - smooth(-0.22, 0.22, sweepYaw - hillYaw[k])));
    }

    // truck: the load grows as each scoop of soil lands, with a small bounce
    let load = 0, bounce = 0;
    for (let i = 0; i < dumpT.length; i++) {
      const d = dumpT[i];
      load += ease.out(seg(t, d + LAND - 0.002, d + LAND + 0.018)) / HILLS.length;
      const u = seg(t, d + LAND, d + LAND + 0.028);
      if (u > 0 && u < 1) bounce = Math.sin(u * Math.PI) * 0.018;
    }
    truck.load.visible = load > 0.001;
    truck.load.scale.set(0.8 + 0.2 * load, Math.max(1.4 * load, 1e-3), 0.85 + 0.15 * load);
    truck.group.position.y = -bounce;

    setParticles(t);
    setRoad(t);
    setWorkers(t);
    sound(t);
    prevT = t;
  }

  // ---------------------------------------------------------------- ambient life: beacon, exhaust smoke, palm sway, waving
  const pipeW = new THREE.Vector3();
  let smokeShown = true;
  function update(dt, time) {
    ambT = time;
    const digging = curT > 0.02 && curT < T.engineOff, rolling = rollerRunning(curT);
    ex.beaconMat.color.set(digging && Math.sin(time * 7) > 0 ? '#ffb347' : digging ? '#d8762a' : '#c9824a');
    palmCrown.rotation.z = Math.sin(time * 0.9) * 0.035;
    palmCrown.rotation.x = Math.sin(time * 0.65 + 1) * 0.025;
    if (curT >= T.wave[0]) poseWorkers(time);
    puffs.visible = dustLive || smokeOn();
    if (!smokeOn()) {
      if (smokeShown) { for (let i = 0; i < SMOKE_N; i++) setPuff(i, 0, 0, 0, 0, 0); markPuffs(); smokeShown = false; }
      return;
    }
    smokeShown = true;
    (rolling ? roller.pipe : ex.pipe).getWorldPosition(pipeW);
    group.worldToLocal(pipeW);
    const busy = digging || rolling;
    for (let i = 0; i < SMOKE_N; i++) {
      const u = (time * (busy ? 0.5 : 0.3) + i / SMOKE_N) % 1;
      const a = (busy ? 0.75 : 0.5) * smooth(0, 0.15, u) * (1 - smooth(0.4, 1, u));
      setPuff(i, pipeW.x - u * 0.3, pipeW.y + 0.05 + u * 0.5, pipeW.z - u * 0.12, a, 0.062 + u * 0.136);
    }
    markPuffs();
  }

  // evidence: the middle of the new road (on the crossing) and the excavator (cab and arm) at its parked pose
  const evidence = { road: { pos: new THREE.Vector3(ZEBRA.x, 0.04, ROAD.z), radius: 0.4 }, digger: { pos: new THREE.Vector3(), radius: 0.5 } };
  setProgress(1);
  group.updateMatrixWorld(true);
  ex.cab.getWorldPosition(V);
  ex.stick.getWorldPosition(evidence.digger.pos);
  group.worldToLocal(evidence.digger.pos.add(V).multiplyScalar(0.5));
  setProgress(0);
  update(0, 0);

  return {
    key: 'human',
    group,
    duration: DURATION,
    setProgress,
    update,
    play() {
      playing = true;
      prevT = curT;
    },
    stop() {
      playing = false;
      engine?.stop();
      engine = null;
      engineCfg = null;
    },
    evidence,
    thumb: { cam: [-0.42, 2.2, 3.3], target: [0.0, 0.26, -0.36], t: 1 },
    dispose() {
      engine?.stop();
      engine = null;
      const blobs = [exShade, truckShade, rollerShade, carShade];
      group.traverse((o) => { if (!blobs.includes(o)) o.geometry?.dispose?.(); }); // blob shades share the kit's quad
      for (const m of blobs) m.material.dispose();
      story.material.dispose();
      story.depth.dispose();
      groundMat.dispose();
      puffMat.dispose();
      ex.beaconMat.dispose();
    },
  };
}
