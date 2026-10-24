// Station «الزلزال» (earthquake). A small Bahraini street fills the diorama: three flat-roofed houses with stepped parapets,
// a wind tower (barjeel), a mashrabiya and water tanks; date palms; an asphalt road with painted kerbs, a zebra crossing and
// raised sidewalks; a street lamp, a bench and a lawn in front. When it plays, the street shakes in three bursts (every point
// moves ≤ ~4 cm), the ground rolls in waves, dust rises, and a real 3D crack (two lip plates sliding apart over layered earth
// walls, the near side sagging so the far wall shows as a step) opens across the street; the lamp post ends up leaning ~17°,
// a flower pot tips over and hairline cracks run up a house wall and the garden wall. Only diorama objects move, never the viewer.
import { THREE, PAL, rng, clamp, lerp, seg, smooth, ease, fbm, noise2, mat, vcMat, basic, mergeParts, blobGeo, puffTexture, stageGround } from '../core/kit.js';
import { TAU, C, shade, box, cyl, bake, houseGeo, palmParts, lampParts, carGeo, bulbulGeo, alleyWallGeo, potGeo, hairlineGeo } from './quake_props.js';

const DURATION = 12;

// ---- layout (station-local metres; the viewer stands at about (0, 1.05, +3.6) looking toward -Z)
const R_GROUND = 2.72;
const HOUSE_Z = -0.32; // house fronts
const WALK_Y = 0.02, ROAD_Y = 0.006;
const WALKB1 = -0.05; // back sidewalk: HOUSE_Z .. WALKB1, then the kerb strip
const ROAD_Z0 = 0.0, ROAD_Z1 = 0.9, ROAD_ZC = 0.45;
const WALKF0 = 0.95, GARDEN_Z = 1.26; // front sidewalk, then the lawn
const DASH_Z0 = ROAD_ZC - 0.027, DASH_Z1 = ROAD_ZC + 0.027, DASH_LEN = 0.3, DASH_STEP = 0.56;
const KERB_W = 0.05, KERB_H = 0.04, KERB_L = 0.11;
const ZEBRA = [-1.36, -0.98]; // zebra crossing (x range)
// the crack runs from the garden wall in the alley (back-left), across the street, to a tip in the lawn (front-right)
const CZ0 = -0.72, CZ1 = 1.86;
const CK = [[-0.72, -0.54], [-0.32, -0.5], [-0.03, -0.37], [0.45, 0.0], [0.9, 0.36], [1.26, 0.55], [1.86, 0.78]];
const CKM = CK.map((_, j) => { const a = CK[Math.max(0, j - 1)], b = CK[Math.min(CK.length - 1, j + 1)]; return (b[1] - a[1]) / (b[0] - a[0]); }); // Catmull-Rom tangents
/** Cubic Hermite through the knots (allocation-free: it also runs per frame for things resting on the lawn). */
function splineX(z) {
  let i = 0;
  while (i < CK.length - 2 && z > CK[i + 1][0]) i++;
  const z0 = CK[i][0], x0 = CK[i][1], z1 = CK[i + 1][0], x1 = CK[i + 1][1], h = z1 - z0, u = clamp((z - z0) / h), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * x0 + (u3 - 2 * u2 + u) * h * CKM[i] + (-2 * u3 + 3 * u2) * x1 + (u3 - u2) * h * CKM[i + 1];
}
/** Crack axis x at z: a gentle S through the street with a little wander. */
const crackX = (z) => {
  const u = (z - CZ0) / (CZ1 - CZ0);
  return splineX(z) + 0.035 * noise2(z * 1.6, 5.1) * smooth(0, 0.25, Math.min(u, 1 - u));
};
const CX_ROAD = crackX(ROAD_ZC);
const HMAX = 0.14; // max half-opening (gap ≈ 0.25 m at the road centre)
const LIP_D = 0.46; // the moving lip plates reach this far from the crack axis
const GAP_D = 0.41; // static road / sidewalk stop here (lips overlap them)
const SLOT_D = 0.17; // the ground is sunk deep under the crack within this distance
const SAG_D = 0.16, SAG_BAND = 0.33; // lips sag/buckle within SAG_D of their edge; the ground is lowered under SAG_BAND
const Y_BOTTOM = -0.32; // a dark-soil floor, not a bottomless pit
const DROP = [-0.05, 0.022]; // the near (left) side sinks, the far (right) side buckles up: its wall shows as a step
const WALL_F = [0, 0.014, 0.04, 0.08, 0.15, 0.32, 1]; // wall levels (fraction of depth): crust layers, darkening fast with depth
const LAMP = { x: 1.03, z: 1.12, tiltZ: 0.3, tiltX: -0.07 }; // ≈ 17° lean toward the crack (to the viewer's left)
const PALM = { x: 2.15, z: -0.09 }; // the hero palm: front-right corner of the street, its crown shades the green house
const PALM_L = { x: -1.98, z: -0.16 }; // just right of the info board, on the back sidewalk
const POT = { x: -0.42, z: 1.1 };
// [start, end, strength]: a first jolt that starts with the caption, a short calm, then the big quake and an aftershock
const BURSTS = [[0.03, 0.21, 0.6], [0.27, 0.49, 1.0], [0.5, 0.75, 0.88]];
const RIP = { k: 7.5, cx: CX_ROAD, cz: ROAD_ZC, tilt: 3 }; // ground waves: wave number, epicentre, shading exaggeration

const COL = {
  sand: C('#f0d8a8'), sandDark: C('#d9b67f'), grass: C('#9fd47e'), grassLight: C('#c3e89b'), grassDark: C('#77b866'),
  walk: C('#efe3cb'), walkDark: C('#ddcaa7'), walkBand: C('#c9bba6'),
  road: C('#8f99a6'), roadDark: C('#7a8491'), line: C('#fff6d8'), zebra: C('#f6f3ea'),
  crack: C('#2a1e1a'),
};
const WALLS = {
  road: ['#f4e2c4', '#3e444d', '#9c7f5c', '#7a5638', '#4d321f', '#2b1c13', '#1a110c'].map(C),
  walk: ['#f6e6ca', '#b9a689', '#a5845e', '#7a5638', '#4d321f', '#2b1c13', '#1a110c'].map(C),
  ground: [null, null, '#8a613f', '#6e4a2e', '#4d321f', '#2b1c13', '#1a110c'].map((h) => h && C(h)),
};
const RIM = C('#f6dcb2');
const sagProf = (d) => (d < SAG_D ? (1 - d / SAG_D) ** 2 : 0);

function envelope(t) {
  let e = 0;
  for (let i = 0; i < BURSTS.length; i++) {
    const a = BURSTS[i][0], b = BURSTS[i][1], p = BURSTS[i][2];
    if (t > a && t < b) { const x = (t - a) / (b - a); e = Math.max(e, p * smooth(0, 0.1, x) * (1 - smooth(0.45, 1, x))); }
  }
  return e;
}

// ---------------------------------------------------------------- houses (fronts on HOUSE_Z)
const HOUSES = [
  { x: -1.24, w: 1.1, d: 0.8, h: 1.3, wall: '#f1d8b2', trim: '#e3c79c', door: '#9a6440', shutter: '#3f8fb5', doorX: 0.2, seed: 1, upper: 0.66,
    windows: [['f', -0.24, 0.42, 0.17, 0.2, { ac: 1 }], ['f', -0.24, 0.98, 0.16, 0.2], ['f', 0.22, 0.98, 0.16, 0.2], ['r', 0.08, 0.45, 0.15, 0.2], ['r', 0.08, 0.98, 0.15, 0.2]],
    barjeel: [0.26, -0.1] },
  { x: 0.18, w: 1.12, d: 0.76, h: 1.0, wall: '#f3c3b2', trim: '#e9c3a4', door: '#3f86b8', shutter: '#e0805f', doorX: -0.02, seed: 2, awning: true, vents: true,
    windows: [['f', -0.33, 0.44, 0.16, 0.21]], dish: [-0.3, -0.15], tank: [0.3, -0.1, 0.09] },
  { x: 1.48, w: 1.24, d: 0.82, h: 1.52, wall: '#c8e5d2', trim: '#e3cfa8', door: '#2f8f7a', shutter: '#d9a13a', doorX: -0.28, seed: 3, upper: 0.76,
    windows: [['f', 0.24, 0.42, 0.17, 0.21, { ac: -1 }], ['f', 0.3, 1.1, 0.17, 0.21], ['l', 0.0, 0.44, 0.15, 0.2], ['l', 0.0, 1.1, 0.15, 0.2, { ac: 1 }]],
    mashrabiya: [-0.22, 1.1], tank: [-0.32, 0.02, 0.11], stair: [0.3, -0.12], condenser: [0.0, 0.2] },
];
for (const h of HOUSES) h.z = HOUSE_Z - h.d / 2;
const H2 = HOUSES[1];
/** Shrub clumps on the lawn: [x, z, radius] (props + baked ground shade). */
const CLUMPS = [[-1.0, 1.66, 0.17], [-0.62, 2.0, 0.13], [1.12, 2.02, 0.15], [-0.95, 2.3, 0.12]];

// ---------------------------------------------------------------- ground (colours double as baked contact shadows)
function ao(x, z) {
  let a = 0;
  for (const h of HOUSES) {
    const dx = Math.max(Math.abs(x - h.x) - h.w / 2, 0), dz = Math.max(Math.abs(z - h.z) - h.d / 2, 0);
    a = Math.max(a, 0.34 * (1 - smooth(0, 0.2, Math.hypot(dx, dz))));
  }
  a = Math.max(a, 0.3 * (1 - smooth(0.04, 0.22, Math.hypot(x - PALM.x, z - PALM.z))), 0.3 * (1 - smooth(0.04, 0.22, Math.hypot(x - PALM_L.x, z - PALM_L.z))));
  a = Math.max(a, 0.24 * (1 - smooth(0.05, 0.18, Math.hypot(x - LAMP.x, z - LAMP.z))));
  a = Math.max(a, 0.3 * (1 - smooth(0, 0.12, Math.max(Math.abs(x + 0.54) - 0.17, 0) + Math.max(Math.abs(z + 0.84) - 0.05, 0)))); // garden wall
  a = Math.max(a, 0.22 * (1 - smooth(0.0, 0.1, Math.hypot(x - POT.x, z - POT.z) - 0.07)));
  if (z > GARDEN_Z) for (const [cx, cz, cr] of CLUMPS) a = Math.max(a, 0.3 * (1 - smooth(cr * 0.6, cr * 1.5, Math.hypot(x - cx, (z - cz) * 1.2))));
  return a;
}
function groundH(x, z) {
  const dc = Math.abs(x - crackX(z));
  if (z > CZ0 + 0.12 && z < CZ1 - 0.12 && dc < SAG_BAND) return dc < SLOT_D ? -0.34 : -0.045; // hidden under the lip plates
  if (z > GARDEN_Z + 0.15) { // a gently rolling lawn, flat at the plinth rim and at the board / Ali corners
    const keep = (1 - smooth(2.15, 2.5, Math.hypot(x, z))) * smooth(LIP_D + 0.05, LIP_D + 0.3, dc) * smooth(0.35, 0.7, Math.min(Math.hypot(x - 1.65, z - 1.5), Math.hypot(x + 1.7, z - 1.45)));
    return 0.03 * Math.max(0, fbm(x * 1.3 + 2, z * 1.3 + 9, 2) + 0.15) * keep * smooth(GARDEN_Z + 0.15, GARDEN_Z + 0.45, z);
  }
  return 0;
}
const _t2 = new THREE.Color();
function groundColor(x, z, y, out, surface = false) {
  if (!surface && (y < -0.1 || (Math.abs(x - crackX(z)) < 0.05 && z > CZ0 + 0.12 && z < CZ1 - 0.12))) return out.copy(COL.crack);
  const n = fbm(x * 1.6 + 3.1, z * 1.6 + 7.3, 3), n2 = noise2(x * 7 + 1.3, z * 7 + 2.1);
  if (z < GARDEN_Z - 0.04) {
    out.copy(COL.sand).lerp(COL.sandDark, clamp(0.3 + n * 0.9 + n2 * 0.12));
  } else {
    out.copy(COL.grass).lerp(n > 0 ? COL.grassLight : COL.grassDark, clamp(Math.abs(n) * 1.7 + n2 * 0.16));
    out.lerp(COL.grassDark, 0.25 * smooth(0.1, 0.5, fbm(x * 0.9 + 7, z * 0.9 + 1, 2)));
    out.multiplyScalar(1 - 0.22 * (1 - smooth(GARDEN_Z, GARDEN_Z + 0.16, z)) - 0.12 * smooth(2.42, 2.7, Math.hypot(x, z)));
  }
  return out.multiplyScalar(1 - ao(x, z));
}
function roadColor(x, z, out) {
  out.copy(COL.road).lerp(COL.roadDark, clamp(0.18 + 0.22 * fbm(x * 1.2 + 1, z * 1.2 + 5, 2) + 0.06 * noise2(x * 9, z * 9)));
  // tyre-polished lanes, darker oily lane centres, shade along the kerbs, a repair patch, the parked car's shadow
  const lane = Math.min(Math.abs(z - 0.2), Math.abs(z - 0.72));
  let k = 1 - 0.05 * (1 - smooth(0.04, 0.09, Math.abs(lane - 0.1))) - 0.05 * (1 - smooth(0.0, 0.05, lane));
  k *= 1 - 0.16 * (1 - smooth(0, 0.07, Math.min(z - ROAD_Z0, ROAD_Z1 - z) + 0.02));
  if (x > 1.25 && x < 1.75 && z > 0.06 && z < 0.34) k *= 0.9;
  k *= 1 - 0.32 * (1 - smooth(0.05, 0.3, Math.hypot((x + 1.75) * 0.75, z - 0.7)));
  return out.multiplyScalar(k);
}
function walkColor(x, z, out) {
  out.copy(COL.walk).lerp(COL.walkDark, clamp(0.3 + 0.8 * fbm(x * 2.3 + 11, z * 2.3 + 4, 2) + 0.08 * noise2(x * 11, z * 11)));
  const edge = z < 0 ? WALKB1 - z : z - WALKF0; // distance from the kerb
  if (edge < 0.045) out.lerp(COL.walkBand, 0.75);
  let k = 1 - ao(x, z) * 0.75;
  if (z < 0) k *= 1 - 0.12 * (1 - smooth(0, 0.08, z - HOUSE_Z));
  return out.multiplyScalar(k);
}
const xEdge = (z) => Math.sqrt(R_GROUND * R_GROUND - z * z) - 0.006;

/** Flat grid between two x-boundaries per row (road and sidewalk pieces). */
function gridGeo(zs, n, x0Fn, x1Fn, y, colorFn) {
  const pos = [], col = [], nor = [], idx = [], c = new THREE.Color();
  for (const z of zs) {
    const a = x0Fn(z), b = x1Fn(z);
    for (let i = 0; i <= n; i++) { const x = lerp(a, b, i / n); pos.push(x, y, z); nor.push(0, 1, 0); colorFn(x, z, c); col.push(c.r, c.g, c.b); }
  }
  for (let r = 0; r < zs.length - 1; r++) for (let i = 0; i < n; i++) {
    const p = r * (n + 1) + i, q = p + n + 1;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
const steps = (a, b, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(lerp(a, b, i / n)); return o; };

// ---------------------------------------------------------------- crack rows (static data; the mesh is re-posed per t)
const KIND_Y = { ground: 0.004, road: ROAD_Y + 0.0015, dash: ROAD_Y + 0.0015, walk: WALK_Y + 0.0015 };
function buildRows() {
  // an irregular zigzag: the side flips most of the time (not always) and the nodes are unevenly spaced,
  // so the crack has a few big kinks and small teeth instead of a regular sawtooth
  const r = rng(41), nodes = [], N = 46, step = (CZ1 - CZ0) / N;
  let sign = 1;
  for (let i = 0; i <= N; i++) {
    const u = i / N, tip = Math.min(u, 1 - u);
    sign = r() < 0.6 ? -sign : sign;
    nodes.push({ z: lerp(CZ0, CZ1, u) + (i > 0 && i < N ? (r() - 0.5) * 0.8 * step : 0), j: sign * (0.012 + r() * 0.03) * smooth(0, 0.14, tip) });
  }
  const jag = (z) => {
    for (let i = 0; i < N; i++) if (z <= nodes[i + 1].z) return lerp(nodes[i].j, nodes[i + 1].j, (z - nodes[i].z) / (nodes[i + 1].z - nodes[i].z));
    return 0;
  };
  const kindAt = (z) => (z < HOUSE_Z ? 'ground' : z < WALKB1 ? 'walk' : z < WALKF0 ? (z > DASH_Z0 && z < DASH_Z1 ? 'dash' : 'road') : z < GARDEN_Z ? 'walk' : 'ground');
  const specials = [[HOUSE_Z, 'ground', 'walk'], [WALKB1, 'walk', 'road'], [DASH_Z0, 'road', 'dash'], [DASH_Z1, 'dash', 'road'], [WALKF0, 'road', 'walk'], [GARDEN_Z, 'walk', 'ground']];
  const list = nodes.filter((n) => specials.every((s) => Math.abs(s[0] - n.z) > 0.016)).map((n) => ({ z: n.z, kind: kindAt(n.z), o: 0 }));
  for (const [z, a, b] of specials) list.push({ z, kind: a, o: 0 }, { z, kind: b, o: 1 });
  list.sort((p, q) => p.z - q.z || p.o - q.o);
  const uP = (ROAD_ZC - CZ0) / (CZ1 - CZ0);
  return list.map(({ z, kind }) => {
    const u = (z - CZ0) / (CZ1 - CZ0);
    const prof = Math.pow(Math.sin((Math.PI / 2) * (u < uP ? u / uP : (1 - u) / (1 - uP))), 0.6);
    const cx = crackX(z) + jag(z);
    return {
      z, kind, cx, y: KIND_Y[kind],
      w: prof * (0.88 + 0.24 * (noise2(z * 13, 3.3) * 0.5 + 0.5)),
      edge: [0.14 * noise2(z * 17, 1.7), 0.14 * noise2(z * 17, 8.1)],
      reveal: Math.abs(u - uP) / Math.max(uP, 1 - uP),
      hs: [0, 0], // current opening per side (set in setProgress)
      dy: [0, 0],
      rim: 0, // current strength of the pale rim on the lip edges
    };
  });
}

// ---------------------------------------------------------------- small props (merged; they ride the ground waves in the shader)
function propsGeo() {
  const P = [], terra = C('#cf7d5c'), r = rng(77);
  const planter = (x, z, s = 1, y0 = WALK_Y) => {
    P.push({ geo: cyl(0.075 * s, 0.055 * s, 0.11 * s, 10), color: shade('#cf7d5c', 0.82), pos: [x, y0 + 0.05 * s, z] });
    P.push({ geo: cyl(0.083 * s, 0.083 * s, 0.022 * s, 10), color: shade('#cf7d5c', 1.1), pos: [x, y0 + 0.105 * s, z] });
    P.push({ geo: blobGeo(0.09 * s, { detail: 1, seed: Math.round(x * 10 + 50), jitter: 0.2 }), color: C(PAL.leaf), pos: [x, y0 + 0.17 * s, z] });
    for (let i = 0; i < 4; i++) { const a = r() * TAU; P.push({ geo: new THREE.IcosahedronGeometry(0.018 * s, 0), color: C(['#ff8fa8', '#fff2a8', '#ff7f6a'][i % 3]), pos: [x + Math.cos(a) * 0.06 * s, y0 + 0.2 * s + r() * 0.04, z + Math.sin(a) * 0.06 * s + 0.02] }); }
  };
  // planters by the doors and a tall potted shrub at the green house
  planter(-0.92, -0.22); planter(0.42, -0.23, 0.85); planter(1.04, -0.22, 0.95);
  // street water cooler (برّادة ماء) in front of the pink house
  { const x = -0.23, z = -0.24;
    P.push({ geo: box(0.13, 0.17, 0.1), color: C('#f4f6f7'), pos: [x, WALK_Y + 0.085, z] });
    P.push({ geo: box(0.14, 0.03, 0.11), color: C('#3f8fd0'), pos: [x, WALK_Y + 0.185, z] });
    P.push({ geo: box(0.03, 0.02, 0.03), color: C('#9aa3ad'), pos: [x, WALK_Y + 0.12, z + 0.06] });
    P.push({ geo: box(0.11, 0.012, 0.03), color: C('#9aa3ad'), pos: [x, WALK_Y + 0.07, z + 0.055] }); }
  // bougainvillea climbing the corner of the green house and arching over its door
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, up = Math.min(1, u * 1.8), over = Math.max(0, u * 1.8 - 0.8) / 1;
    const x = 0.92 + 0.42 * over + (r() - 0.5) * 0.03, y = 0.12 + 0.7 * up - 0.12 * over * over + (r() - 0.5) * 0.03, z = HOUSE_Z + 0.035 + r() * 0.02;
    P.push({ geo: blobGeo(0.05 + r() * 0.02, { detail: 1, seed: 30 + i, jitter: 0.2, smooth: true }), color: C(i % 3 ? PAL.leafDark : '#4f9a5a'), pos: [x, y, z] });
    if (i % 2 === 0 || u > 0.5) P.push({ geo: blobGeo(0.032 + r() * 0.012, { detail: 1, seed: 60 + i, jitter: 0.25 }), color: C(['#d6457a', '#e8609a', '#c23a6c'][i % 3]), pos: [x + (r() - 0.5) * 0.05, y + 0.02, z + 0.035] });
  }
  // a wooden bench on the front sidewalk, facing the street
  const wood = C('#b07a4e'), bx = -0.86, bz = 1.1, by = WALK_Y;
  // a red fire hydrant by the zebra crossing
  P.push({ geo: cyl(0.032, 0.036, 0.1, 10), color: C('#e2483d'), pos: [-1.18, WALK_Y + 0.05, 1.04] });
  P.push({ geo: new THREE.SphereGeometry(0.034, 10, 5, 0, TAU, 0, Math.PI / 2), color: C('#e2483d'), pos: [-1.18, WALK_Y + 0.1, 1.04] });
  P.push({ geo: cyl(0.014, 0.014, 0.1, 6), color: C('#c43a30'), pos: [-1.18, WALK_Y + 0.065, 1.04], rot: [0, 0, Math.PI / 2] });
  P.push({ geo: cyl(0.044, 0.044, 0.016, 10), color: C('#c43a30'), pos: [-1.18, WALK_Y + 0.008, 1.04] });
  P.push({ geo: box(0.34, 0.02, 0.1), color: wood, pos: [bx, by + 0.1, bz] });
  P.push({ geo: box(0.34, 0.065, 0.016), color: shade('#b07a4e', 0.9), pos: [bx, by + 0.16, bz + 0.05], rot: [0.18, 0, 0] });
  for (const sx of [-0.14, 0.14]) P.push({ geo: box(0.022, 0.1, 0.09), color: C('#4f5864'), pos: [bx + sx, by + 0.05, bz] });
  // lawn: rounded clumps of low shrubs with flowers, flower patches and grass tufts (all low: the view to the street stays open)
  const clump = (cx, cz, n, seed) => {
    const cr = rng(seed);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + cr() * 0.6, rr = i === 0 ? 0 : 0.07 + cr() * 0.06, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr * 0.8;
      const sz = (i === 0 ? 0.085 : 0.05 + cr() * 0.03), y = Math.max(0, groundH(x, z));
      P.push({ geo: blobGeo(sz, { detail: 1, seed: seed * 10 + i, jitter: 0.16, squash: 0.8, smooth: true }), color: C([PAL.leafDark, PAL.leaf, '#4f9a5a', PAL.leafLight][i % 4]), pos: [x, y + sz * 0.62, z] });
      for (let k = 0; k < (i % 2 ? 1 : 2); k++) { const b = cr() * TAU; P.push({ geo: new THREE.IcosahedronGeometry(0.017, 0), color: C(['#ff8fb1', '#ffd45c', '#ffffff', '#ff7f6a', '#d6457a'][(i + k) % 5]), pos: [x + Math.cos(b) * sz * 0.75, y + sz * (1.05 + 0.2 * cr()), z + Math.sin(b) * sz * 0.75] }); }
    }
  };
  CLUMPS.forEach(([x, z], i) => clump(x, z, [6, 4, 5, 3][i], i + 1));
  const flowers = (x, z) => {
    const y = Math.max(0, groundH(x, z));
    P.push({ geo: blobGeo(0.07, { detail: 1, seed: Math.round(x * 13 + 200), squash: 0.6 }), color: C(PAL.leafDark), pos: [x, 0.025 + y, z] });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; P.push({ geo: new THREE.IcosahedronGeometry(0.017, 0), color: C(['#ff8fb1', '#ffd45c', '#ffffff'][i % 3]), pos: [x + Math.cos(a) * 0.05, 0.06 + y, z + Math.sin(a) * 0.04] }); }
  };
  flowers(0.45, 2.3); flowers(-1.2, 2.0); flowers(0.95, 2.4); flowers(-0.38, 1.62);
  // stepping stones from the front of the plinth toward the street
  [[-0.05, 2.52], [-0.14, 2.24], [-0.1, 1.96], [-0.16, 1.68], [-0.1, 1.4]].forEach(([x, z], i) => {
    const y = Math.max(0, groundH(x, z));
    P.push({ geo: cyl(0.09 - i * 0.004, 0.095 - i * 0.004, 0.024, 10), color: C(i % 2 ? '#e7dccb' : '#dacbb4'), pos: [x, 0.006 + y, z], scale: [1, 1, 0.8] });
  });
  for (let i = 0; i < 40; i++) {
    const x = (r() - 0.5) * 4.4, z = GARDEN_Z + 0.12 + r() * 1.3;
    if (Math.hypot(x, z) > 2.5 || Math.abs(x - crackX(z)) < 0.55 || (Math.abs(x) > 1.3 && z > 0.9) || Math.abs(x + 0.12) < 0.16) continue;
    const y = Math.max(0, groundH(x, z));
    for (let k = 0; k < 3; k++) P.push({ geo: new THREE.ConeGeometry(0.012, 0.06 + r() * 0.04, 4), color: C(k ? PAL.grassDark : PAL.leafDark), pos: [x + (k - 1) * 0.015, 0.025 + y, z], rot: [0, 0, (k - 1) * 0.35] });
  }
  const g = mergeParts(P);
  const baseY = (x, z) => (z > HOUSE_Z && z < GARDEN_Z ? WALK_Y : Math.max(0, groundH(x, z)));
  return bake(g, (x, y, z) => lerp(0.78, 1, smooth(0, 0.08, y - baseY(x, z))));
}

// ---------------------------------------------------------------- materials with the shared ground-wave displacement
function rippleMaterial(uniforms, tilt = RIP.tilt) {
  const m = vcMat({ unique: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uQAmp; uniform float uQPhase; uniform vec2 uQC;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec2 qd = position.xz - uQC; float qr = max(length(qd), 1e-3);
        float qa = uQAmp * (1.0 - smoothstep(1.9, 2.5, length(position.xz)));
        float qarg = qr * ${RIP.k.toFixed(3)} - uQPhase;
        objectNormal.xz -= (qd / qr) * qa * ${(RIP.k * tilt).toFixed(3)} * cos(qarg);`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += qa * sin(qarg);');
  };
  m.customProgramCacheKey = () => 'quake-ripple-' + tilt;
  return m;
}
function puffMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: puffTexture() }, color: { value: new THREE.Color(color) } },
    vertexShader: `attribute float aAlpha; varying vec2 vUv; varying float vAlpha;
      void main() {
        vUv = uv; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
        mv.xy += position.xy * length(instanceMatrix[0].xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; varying vec2 vUv; varying float vAlpha;
      void main() {
        float a = texture2D(map, vUv).a * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(color, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
}
/** Flat, single-sided surfaces can never cast a sun shadow (the shadow pass draws back faces): skip them in that pass. */
function noCast(o) { Object.defineProperty(o, 'castShadow', { get: () => false, set() {}, configurable: true }); return o; }

// ================================================================= station
export default function buildStation(ctx = {}) {
  const sfx = ctx.sfx;
  const group = new THREE.Group();
  group.name = 'station:quake';
  const world = new THREE.Group(); // everything that shakes with the ground
  group.add(world);
  const tmp = new THREE.Color();
  const uniforms = { uQAmp: { value: 0 }, uQPhase: { value: 0 }, uQC: { value: new THREE.Vector2(RIP.cx, RIP.cz) } };
  // the ground-wave height (same formula as the shader) for things that rest on the ground
  const rippleY = (x, z) => {
    const amp = uniforms.uQAmp.value;
    if (amp === 0) return 0;
    return amp * (1 - smooth(1.9, 2.5, Math.hypot(x, z))) * Math.sin(Math.hypot(x - RIP.cx, z - RIP.cz) * RIP.k - uniforms.uQPhase.value);
  };
  const groundMat = rippleMaterial(uniforms);
  const propsMat = rippleMaterial(uniforms, 1); // small props ride the same waves (true slope, no shading exaggeration)
  const owned = [groundMat, propsMat];

  // ground
  const groundGeo = stageGround({ radius: R_GROUND, rings: 36, segments: 100, heightFn: groundH, colorFn: (x, z, y) => groundColor(x, z, y, tmp) });
  { // the sunk band under the lips must not bend the shading of the flat ground around it
    const gp = groundGeo.attributes.position, gn = groundGeo.attributes.normal;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      if (gp.getY(i) > -0.9 && z > CZ0 - 0.3 && z < CZ1 + 0.3 && Math.abs(x - crackX(z)) < LIP_D + 0.25) gn.setXYZ(i, 0, 1, 0);
    }
  }
  const ground = noCast(new THREE.Mesh(groundGeo, groundMat));
  world.add(ground);

  // pavement: road + sidewalks left/right of the crack corridor, dashes, zebra crossing, manhole, kerbs and edging stones
  const left = (z) => -xEdge(z), right = xEdge, cl = (z) => crackX(z) - GAP_D, cr = (z) => crackX(z) + GAP_D;
  const roadZs = steps(WALKB1, WALKF0, 18), backZs = steps(HOUSE_Z, WALKB1, 6), frontZs = steps(WALKF0, GARDEN_Z, 6);
  const pave = [
    { geo: gridGeo(roadZs, 22, left, cl, ROAD_Y, roadColor) }, { geo: gridGeo(roadZs, 22, cr, right, ROAD_Y, roadColor) },
    { geo: gridGeo(backZs, 26, left, cl, WALK_Y, walkColor) }, { geo: gridGeo(backZs, 30, cr, right, WALK_Y, walkColor) },
    { geo: gridGeo(frontZs, 28, left, cl, WALK_Y, walkColor) }, { geo: gridGeo(frontZs, 26, cr, right, WALK_Y, walkColor) },
  ];
  const lineC = COL.line;
  for (let k = -6; k <= 6; k++) {
    if (k === 0) continue; // the centre dash lives on the crack lips
    const x = CX_ROAD + k * DASH_STEP;
    if (Math.abs(x) + DASH_LEN / 2 > xEdge(ROAD_ZC) - 0.05 || (x + DASH_LEN / 2 > ZEBRA[0] - 0.06 && x - DASH_LEN / 2 < ZEBRA[1] + 0.06)) continue;
    pave.push({ geo: gridGeo([DASH_Z0, DASH_Z1], 3, () => x - DASH_LEN / 2, () => x + DASH_LEN / 2, ROAD_Y + 0.0025, (_, __, c) => c.copy(lineC)) });
  }
  for (let z = ROAD_Z0 + 0.05; z < ROAD_Z1 - 0.06; z += 0.1) pave.push({ geo: gridGeo([z, z + 0.055], 2, () => ZEBRA[0], () => ZEBRA[1], ROAD_Y + 0.0025, (x, zz, c) => c.copy(COL.zebra).multiplyScalar(0.94 + 0.06 * noise2(x * 8, zz * 8))) });
  pave.push({ geo: cyl(0.085, 0.085, 0.012, 16), color: C('#5b6470'), pos: [1.55, ROAD_Y, 0.66] });
  pave.push({ geo: cyl(0.06, 0.06, 0.014, 16), color: C('#6c7480'), pos: [1.55, ROAD_Y, 0.66] });
  const riders = []; // [x, z, colour, sx, sy, sz, y] of the stones that sit on the moving lips
  const kerbCols = [C('#f2c230'), C('#3a414b')], edgeCols = [C('#e1d6c3'), C('#d2c5af')];
  const stoneRow = (zc, sx, sy, sz, y, cols, s0) => {
    const xe = xEdge(zc) - 0.03;
    let i = 0;
    for (let x = -xe + sx / 2; x < xe - sx / 2; x += sx + 0.008, i++) {
      const c = cols[(i + s0) % cols.length];
      if (Math.abs(x - crackX(zc)) < LIP_D - 0.02) { riders.push({ x, z: zc, color: c, sx, sy, sz, y }); continue; }
      pave.push({ geo: box(sx, sy, sz), color: c, pos: [x, y, zc] });
    }
  };
  stoneRow(WALKB1 + KERB_W / 2, KERB_L, KERB_H, KERB_W, KERB_H / 2 - 0.004, kerbCols, 0);
  stoneRow(ROAD_Z1 + KERB_W / 2, KERB_L, KERB_H, KERB_W, KERB_H / 2 - 0.004, kerbCols, 1);
  stoneRow(GARDEN_Z + 0.012, 0.14, 0.032, 0.026, 0.012, edgeCols, 0);
  pave.push({ geo: box(0.16, 0.032, 0.026), color: edgeCols[0], pos: [0.8, 0.012, HOUSE_Z - 0.01] }); // sidewalk edge in the gap between houses 2 and 3
  const pavement = new THREE.Mesh(mergeParts(pave), groundMat);
  world.add(pavement);

  // ---- the crack: lip plates + layered walls + branch hairlines, one dynamic vertex-coloured mesh
  const rows = buildRows();
  const NR = rows.length, LC = 7, WC = WALL_F.length;
  const cd = (row, s) => clamp(Math.abs(CX_ROAD + s * DASH_LEN / 2 - row.cx), 0.08, 0.22);
  const lipDist = new Float32Array(NR * 2 * LC), lipProf = new Float32Array(NR * 2 * LC);
  const BR = [ // branches: [row z, side, angle from outward (rad), length, start t]
    [0.14, 1, -0.5, 0.28, 0.47], [0.66, -1, 0.55, 0.26, 0.5], [-0.19, 1, 0.35, 0.2, 0.55], [1.1, -1, -0.3, 0.24, 0.56], [1.56, 1, 0.5, 0.24, 0.6], [0.3, -1, -0.45, 0.2, 0.62],
  ];
  const LAMP_HAIR = [[2.3, 0.2], [3.6, 0.17], [5.2, 0.15]]; // hairlines around the lamp base: [angle, length]
  const BRN = 6; // points per branch
  const nLip = NR * 2 * LC, nWall = NR * 2 * WC, nBr = (BR.length + LAMP_HAIR.length) * BRN * 2;
  const crackPos = new Float32Array((nLip + nWall + nBr) * 3), crackCol = new Float32Array(crackPos.length), crackNor = new Float32Array(crackPos.length);
  const crackIdx = [], rimBase = new Float32Array(NR * 12), rimTo = new Float32Array(NR * 12);
  const LI = (i, s, k) => (i * 2 + s) * LC + k, WI = (i, s, d) => nLip + (i * 2 + s) * WC + d;
  const surf = (kind, x, z, out) => (kind === 'ground' ? groundColor(x, z, 0, out, true) : kind === 'walk' ? walkColor(x, z, out) : roadColor(x, z, out));
  rows.forEach((row, i) => {
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1, dOut = Math.abs(crackX(row.z) + sg * LIP_D - row.cx), dd = cd(row, sg), mid = (dd + dOut) / 2;
      const dists = [0, 0.024, 0.06, dd, dd, mid, dOut];
      for (let k = 0; k < LC; k++) {
        const v = LI(i, s, k), x = row.cx + sg * dists[k];
        lipDist[v] = dists[k]; lipProf[v] = sagProf(dists[k]);
        if (row.kind === 'dash' && k <= 3) tmp.copy(lineC);
        else surf(row.kind === 'dash' ? 'road' : row.kind, x, row.z, tmp);
        crackCol.set([tmp.r, tmp.g, tmp.b], v * 3); crackNor.set([0, 1, 0], v * 3);
        if (k <= 1) { // a pale fresh-break rim frames the dark gap once it opens (faded in per row in poseCrack)
          rimBase.set([tmp.r, tmp.g, tmp.b], ((i * 2 + s) * 2 + k) * 3);
          tmp.lerp(RIM, k ? 0.4 : 0.85);
          rimTo.set([tmp.r, tmp.g, tmp.b], ((i * 2 + s) * 2 + k) * 3);
        }
        crackPos.set([x, row.y, row.z], v * 3);
      }
      // wall normals face into the gap, tilted up a little; colours are the layers of the crust
      const prev = rows[Math.max(0, i - 1)], next = rows[Math.min(NR - 1, i + 1)];
      let tx = next.cx - prev.cx, tz = next.z - prev.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -sg * tz, nz = sg * tx, nl = Math.hypot(nx, 0.18, nz);
      const layers = WALLS[row.kind === 'dash' ? 'road' : row.kind];
      for (let d = 0; d < WC; d++) {
        const v = WI(i, s, d);
        let c = layers[d];
        if (!c) { surf('ground', row.cx, row.z, tmp); c = d === 0 ? tmp.lerp(RIM, 0.45) : tmp.multiplyScalar(0.62).lerp(WALLS.ground[2], 0.4); }
        crackCol.set([c.r, c.g, c.b], v * 3); crackNor.set([nx / nl, 0.18 / nl, nz / nl], v * 3);
      }
    }
  });
  for (let i = 0; i < NR - 1; i++) {
    for (let s = 0; s < 2; s++) {
      for (let k = 0; k < LC - 1; k++) {
        const a = LI(i, s, k), b = LI(i, s, k + 1), c = LI(i + 1, s, k), d = LI(i + 1, s, k + 1);
        if (s) crackIdx.push(a, c, b, b, c, d); else crackIdx.push(a, b, c, b, d, c);
      }
      for (let k = 0; k < WC - 1; k++) {
        const a = WI(i, s, k), b = WI(i, s, k + 1), c = WI(i + 1, s, k), d = WI(i + 1, s, k + 1);
        if (s) crackIdx.push(a, b, c, b, d, c); else crackIdx.push(a, c, b, b, c, d);
      }
    }
  }
  // branch strips (dark hairlines that grow out of the crack / around the lamp base)
  const rowAt = (z) => { let i = 0; while (i < NR - 2 && rows[i + 1].z < z) i++; return i; };
  const branches = [];
  const brR = rng(9);
  const addBranch = (bx, bz, ang, len, side, rowI, t0, onLamp) => {
    const base = nLip + nWall + branches.length * BRN * 2, pts = [];
    for (let p = 0; p < BRN; p++) {
      const k = p / (BRN - 1), wob = p > 0 && p < BRN - 1 ? (brR() - 0.5) * 0.05 : 0;
      pts.push([Math.cos(ang) * len * k - Math.sin(ang) * wob, Math.sin(ang) * len * k + Math.cos(ang) * wob, 0.013 * (1 - k) + 0.002]);
    }
    for (let v = 0; v < BRN * 2; v++) { crackCol.set([COL.crack.r, COL.crack.g, COL.crack.b], (base + v) * 3); crackNor.set([0, 1, 0], (base + v) * 3); }
    for (let p = 0; p < BRN - 1; p++) { const a = base + p * 2; crackIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    branches.push({ base, bx, bz, ang, len, pts, side, rowI, t0, onLamp });
  };
  for (const [z, side, a, len, t0] of BR) {
    const i = rowAt(z), row = rows[i], out = side > 0 ? 0 : Math.PI;
    addBranch(row.cx, row.z, out + a * side, len, side > 0 ? 1 : 0, i, t0, false);
  }
  for (const [a, len] of LAMP_HAIR) addBranch(LAMP.x + Math.cos(a) * 0.09, LAMP.z + Math.sin(a) * 0.09, a, len, 1, -1, 0, true);

  const crackGeo = new THREE.BufferGeometry();
  const crackPosAttr = new THREE.BufferAttribute(crackPos, 3).setUsage(THREE.DynamicDrawUsage);
  crackGeo.setAttribute('position', crackPosAttr);
  crackGeo.setAttribute('normal', new THREE.BufferAttribute(crackNor, 3));
  const crackColAttr = new THREE.BufferAttribute(crackCol, 3).setUsage(THREE.DynamicDrawUsage);
  crackGeo.setAttribute('color', crackColAttr);
  crackGeo.setIndex(crackIdx);
  const crack = new THREE.Mesh(crackGeo, groundMat);
  crack.frustumCulled = false;
  world.add(crack);

  // ---- houses, palms, garden wall, lamp, props
  const shakers = [];
  const addShaker = (obj, amp, rot, f, ph, ripple = true) => {
    shakers.push({ obj, amp, rot, f, ph, ripple, bx: obj.position.x, by: obj.position.y, bz: obj.position.z, rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z });
    world.add(obj);
    return obj;
  };
  const houseMeshes = HOUSES.map((h, i) => {
    const m = new THREE.Mesh(houseGeo(h), vcMat());
    m.position.set(h.x, 0, h.z);
    return addShaker(m, 0.014, 0.009, 3.3 + i * 0.35, i * 2.1);
  });
  // hairline cracks that run up the pink house wall and the garden wall (revealed by growing from their foot)
  const hairMat = vcMat();
  const wallHair = new THREE.Mesh(hairlineGeo([[0, 0], [0.03, 0.08], [-0.01, 0.15], [0.035, 0.24], [0.0, 0.33], [0.04, 0.42], [0.01, 0.5], [0.05, 0.6]], 0.008), hairMat);
  wallHair.position.set(0.4, 0.07, H2.d / 2 + 0.003);
  houseMeshes[1].add(wallHair);
  const gardenWall = new THREE.Mesh(alleyWallGeo(0.36, 0.42, 11), vcMat());
  gardenWall.position.set(-0.54, 0, -0.86);
  addShaker(gardenWall, 0.012, 0.02, 4.1, 1.3);
  const gwHair = new THREE.Mesh(hairlineGeo([[0, 0], [-0.03, 0.07], [0.015, 0.14], [-0.02, 0.22], [0.02, 0.3], [-0.01, 0.38]], 0.009), hairMat);
  gwHair.position.set(crackX(CZ0) + 0.54, 0.03, 0.044);
  gardenWall.add(gwHair);

  const palm = palmParts(47, 1.64, -0.2, 12, 3);
  const palmTrunk = new THREE.Mesh(mergeParts(palm.trunk), vcMat());
  palmTrunk.position.set(PALM.x, WALK_Y, PALM.z);
  const crownMat = vcMat({ side: THREE.DoubleSide });
  const palmCrown = new THREE.Mesh(mergeParts(palm.crown), crownMat);
  palmCrown.position.set(...palm.top);
  palmTrunk.add(palmCrown);
  addShaker(palmTrunk, 0.008, 0.015, 2.3, 0.7);
  const backParts = [];
  for (const [seed, H, lean, x, z, nf, nd] of [[31, 1.8, -0.08, -0.5, -1.55, 11, 2], [12, 1.55, 0.12, PALM_L.x, PALM_L.z, 11, 2]]) {
    const y0 = z > HOUSE_Z ? WALK_Y : 0;
    const p = palmParts(seed, H, lean, nf, nd);
    for (const q of p.trunk) backParts.push({ ...q, pos: [q.pos[0] + x, q.pos[1] + y0, q.pos[2] + z] });
    for (const q of p.crown) backParts.push({ ...q, pos: [(q.pos?.[0] ?? 0) + p.top[0] + x, (q.pos?.[1] ?? 0) + p.top[1] + y0, (q.pos?.[2] ?? 0) + z] });
  }
  const backPalms = new THREE.Mesh(mergeParts(backParts), crownMat);
  addShaker(backPalms, 0.006, 0.006, 2.6, 2.4);
  const props = new THREE.Mesh(propsGeo(), propsMat); // the shader adds the ground wave per vertex
  addShaker(props, 0.01, 0, 4.4, 0.4, false);
  const car = new THREE.Mesh(carGeo(), vcMat());
  car.position.set(-1.78, ROAD_Y, 0.7);
  car.scale.setScalar(1.35);
  addShaker(car, 0.012, 0.035, 3.9, 0.9); // bounces on its springs
  // a flower pot on the front sidewalk tips over in the big shake
  const pot = new THREE.Mesh(potGeo(1), vcMat());
  pot.position.set(POT.x + 0.0525, WALK_Y, POT.z);
  world.add(pot);

  // two bulbuls on the pink house: the first jolt startles them; they come back when it is calm
  const bird = bulbulGeo();
  const birdBodies = new THREE.InstancedMesh(bird.body, vcMat(), 2);
  const birdWings = new THREE.InstancedMesh(bird.wing, mat('#7a6f66', { side: THREE.DoubleSide }), 4);
  const roofY = H2.h + 0.04 + 0.065 + 0.014, roofZ = HOUSE_Z + 0.012;
  const birds = [
    { perch: new THREE.Vector3(H2.x - 0.12, roofY, roofZ), yaw: 0.35, away: new THREE.Vector3(-3.2, 2.6, -3.4), back: new THREE.Vector3(2.8, 2.4, -3.6), go: 0.05, ret: 0.84 },
    { perch: new THREE.Vector3(H2.x + 0.25, roofY, roofZ), yaw: -0.4, away: new THREE.Vector3(-2.4, 3.0, -3.8), back: new THREE.Vector3(3.2, 2.2, -3.0), go: 0.065, ret: 0.87 },
  ];
  for (const m of [birdBodies, birdWings]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); world.add(m); }

  const lampGroup = new THREE.Group();
  lampGroup.position.set(LAMP.x, WALK_Y, LAMP.z);
  const lp = lampParts();
  lampGroup.add(new THREE.Mesh(mergeParts(lp.parts), vcMat()));
  const bulbMat = basic('#fff1a8', { unique: true });
  const BULB_ON = C('#fff1a8'), BULB_DIM = C('#e8d9a0');
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 6, 0, TAU, Math.PI / 2, Math.PI / 2), bulbMat);
  bulb.position.set(...lp.bulbPos); bulb.scale.set(1, 0.5, 1);
  lampGroup.add(bulb);
  world.add(lampGroup);
  owned.push(bulbMat);

  // hot-rose shake marks «(( ))» beside the houses and the lamp while the ground shakes
  const markGeo = mergeParts([0.1, 0.15].map((r) => ({ geo: new THREE.RingGeometry(r, r + 0.022, 10, 1, -0.6, 1.2) })));
  const marks = new THREE.InstancedMesh(markGeo, basic('#d6457a', { side: THREE.DoubleSide }), 8);
  const MARKS = [[-1.86, 1.18, -0.3, -1], [-0.6, 1.18, -0.3, 1], [0.8, 1.36, -0.3, -1], [2.16, 1.36, -0.3, 1], [-0.42, 0.86, -0.28, -1], [0.78, 0.86, -0.28, 1], [LAMP.x - 0.42, 1.4, LAMP.z, -1], [LAMP.x + 0.14, 1.4, LAMP.z, 1]];
  marks.frustumCulled = false; marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(marks);

  // ---- instanced bits: boxes (kerb stones on the lips, asphalt chunks, crumbs, lifted pavers) and rocks (stones, clods, dates)
  const boxMat = mat('#ffffff'), rockMat = mat('#ffffff', { flat: true });
  const boxes = [], rocks = [];
  for (const s of riders) {
    const i = rowAt(s.z), sideP = s.x > rows[i].cx ? 1 : 0, dist = Math.abs(s.x - rows[i].cx);
    boxes.push({ kind: dist < s.sx * 0.6 ? 'kerbFall' : 'kerb', ...s, rowI: i, side: sideP, dist });
  }
  const asphalt = C('#6f7884');
  for (const [z, side, out, sz, t0, tilt] of [[0.1, 1, 0.05, 0.1, 0.47, 0.42], [0.52, 1, 0.045, 0.08, 0.54, 0.5], [0.68, 0, 0.05, 0.09, 0.56, 0.38], [0.24, 0, 0.04, 0.075, 0.6, 0.3]]) {
    boxes.push({ kind: 'chunk', z, rowI: rowAt(z), side, out, t0, tilt, ry: 0.25 + z, color: asphalt, sx: sz, sy: 0.024, sz: sz * 0.8 });
  }
  for (const [z, side, out, sz, t0, tilt] of [[-0.18, 1, 0.05, 0.09, 0.55, 0.45], [1.1, 0, 0.05, 0.085, 0.58, 0.4]]) {
    boxes.push({ kind: 'chunk', z, rowI: rowAt(z), side, out, t0, tilt, ry: 0.4 + z, color: C('#d9ccb2'), sx: sz, sy: 0.022, sz: sz * 0.75, y0: WALK_Y });
  }
  boxes.push({ kind: 'fall', z: 0.4, rowI: rowAt(0.4), side: 1, t0: 0.585, color: asphalt, sx: 0.075, sy: 0.024, sz: 0.06 });
  const crR = rng(23);
  for (let n = 0; n < 8; n++) {
    const z = lerp(ROAD_Z0 + 0.06, ROAD_Z1 - 0.06, crR()), i = rowAt(z), side = n % 2;
    boxes.push({ kind: 'crumb', z, rowI: i, side, out: 0.05 + crR() * 0.12, t0: 0.48 + crR() * 0.12, ry: crR() * 3, color: n % 3 ? asphalt : C('#a7afba'), sx: 0.025 + crR() * 0.02, sy: 0.012, sz: 0.02 + crR() * 0.015 });
  }
  // pavers lifted around the leaning lamp's footing
  for (const [dx, dz, ry, k] of [[0.13, 0.02, 0.2, 1], [0.1, -0.1, -0.5, 0.8], [0.06, 0.12, 0.7, 0.7]]) boxes.push({ kind: 'heave', x: LAMP.x + dx, z: LAMP.z + dz, ry, k, color: C('#d8c8aa'), sx: 0.1, sy: 0.016, sz: 0.08 });
  const rockC = [C(PAL.rock), C(PAL.rockDark), C(PAL.rockWarm)];
  // stones roll during the shaking; the first one tumbles into the crack
  rocks.push({ kind: 'stoneFall', x: crackX(-0.19) + 0.38, z: -0.19, rowI: rowAt(-0.19), r: 0.035, t0: 0.6, t1: 0.66, color: rockC[2], y0: WALK_Y });
  for (const [x, z, r, dx, dz] of [[-0.42, 1.55, 0.05, 0.06, 0.03], [1.62, 2.0, 0.035, -0.05, 0.05], [-1.42, -0.2, 0.04, 0.07, -0.02], [-0.3, 2.05, 0.05, 0.04, -0.05]]) {
    rocks.push({ kind: 'stone', x, z, r, dx, dz, color: rockC[rocks.length % 3], y0: z < GARDEN_Z ? WALK_Y : 0 });
  }
  for (const [z, side, out, t0] of [[1.42, 1, 0.06, 0.55], [1.6, 0, 0.05, 0.58], [-0.58, 0, 0.05, 0.58], [-0.62, 1, 0.04, 0.62]]) {
    rocks.push({ kind: 'clod', z, rowI: rowAt(z), side, out, t0, color: C('#8a6446') });
  }
  for (const [dx, dz] of [[0.2, 0.03], [0.26, -0.04]]) rocks.push({ kind: 'spill', x: POT.x + dx, z: POT.z + dz, color: C('#6b4a32') });
  const dateLand = [[1.86, -0.2], [2.04, -0.27], [1.74, -0.12]];
  palm.datePts.forEach((p, k) => rocks.push({ kind: 'date', from: [PALM.x + palm.top[0] + p[0], WALK_Y + palm.top[1] + p[1], PALM.z + p[2]], to: dateLand[k], t0: [0.12, 0.33, 0.55][k], color: C(PAL.dates) }));
  rocks.push({ kind: 'heave', x: LAMP.x + 0.08, z: LAMP.z + 0.03, color: C(PAL.soil) });

  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), boxMat, boxes.length);
  const rockMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), rockMat, rocks.length);
  boxes.forEach((b, i) => boxMesh.setColorAt(i, b.color));
  rocks.forEach((b, i) => rockMesh.setColorAt(i, b.color));
  for (const m of [boxMesh, rockMesh]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); world.add(m); }

  // ---- dust puffs (camera-facing instanced quads, one draw call)
  const puffs = [];
  const pr = rng(57);
  for (let n = 0; n < 32; n++) { // along the crack as it runs, and again at each widening jerk
    const i = 2 + Math.floor(pr() * (NR - 4)), row = rows[i];
    const t0 = 0.42 + row.reveal * 0.12 + pr() * 0.04 + [0, 0, 0.11, 0.2][n % 4];
    puffs.push({ x: row.cx + (pr() - 0.5) * 0.1, y: 0.02, z: row.z, t0, life: 0.12 + pr() * 0.08, rise: 0.25 + pr() * 0.35, s0: 0.1, s1: 0.32 + pr() * 0.22, a: 0.85 });
  }
  for (const h of HOUSES) for (const [bx, bt] of [[-0.45, 0.06], [0.4, 0.3], [0.05, 0.53], [-0.2, 0.6]]) { // dust shaken off the houses
    puffs.push({ x: h.x + bx * h.w, y: 0.03, z: HOUSE_Z + 0.06, t0: bt + pr() * 0.04, life: 0.12, rise: 0.14, s0: 0.08, s1: 0.28, a: 0.6 });
  }
  for (let n = 0; n < 9; n++) { // dust kicked up from the shaking ground
    const a = pr() * TAU, r = 0.6 + pr() * 1.5;
    puffs.push({ x: Math.cos(a) * r, y: 0.02, z: Math.sin(a) * r * 0.7 + 0.4, t0: [0.06, 0.29, 0.52][n % 3] + pr() * 0.08, life: 0.1, rise: 0.1, s0: 0.08, s1: 0.24, a: 0.45 });
  }
  for (const [x, z, t0] of [[LAMP.x, LAMP.z + 0.05, 0.14], [LAMP.x + 0.05, LAMP.z, 0.6], [PALM.x - 0.1, PALM.z + 0.05, 0.3], [CX_ROAD + 0.05, 0.4, 0.62], [crackX(-0.19), -0.19, 0.665], [POT.x + 0.15, POT.z, 0.36]]) {
    puffs.push({ x, y: 0.04, z, t0, life: 0.1, rise: 0.16, s0: 0.08, s1: 0.26, a: 0.7 });
  }
  const puffGeo = new THREE.PlaneGeometry(1, 1);
  const puffMat = puffMaterial('#f2e6d0');
  owned.push(puffMat);
  const puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, puffs.length);
  const puffAlpha = new THREE.InstancedBufferAttribute(new Float32Array(puffs.length), 1).setUsage(THREE.DynamicDrawUsage);
  puffGeo.setAttribute('aAlpha', puffAlpha);
  puffMesh.frustumCulled = false; puffMesh.renderOrder = 2;
  puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(puffMesh);

  // ---------------------------------------------------------------- per-t posing (allocation-free)
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
  const setInst = (mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) => {
    _p.set(x, y, z); _q.setFromEuler(_e.set(rx, ry, rz)); _s.set(sx, sy, sz);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
  };
  const lampTilt = (t) => 0.22 * ease.inOut(seg(t, 0.08, 0.19)) + 0.33 * ease.inOut(seg(t, 0.31, 0.45)) + 0.45 * ease.out(seg(t, 0.56, 0.71));
  const opening = (t) => 0.36 * ease.out(seg(t, 0.42, 0.47)) + 0.34 * ease.out(seg(t, 0.53, 0.585)) + 0.3 * ease.out(seg(t, 0.62, 0.69));
  const lip = { hx: 0, dy: 0, cx: 0 }; // interpolated lip shift (x), sag (y) and crack axis at a z, for one side
  const lipAt = (rowI, side, z) => {
    const a = rows[rowI], b = rows[Math.min(NR - 1, rowI + 1)], k = b.z > a.z ? clamp((z - a.z) / (b.z - a.z)) : 0;
    lip.hx = lerp(a.hs[side], b.hs[side], k); lip.dy = lerp(a.dy[side], b.dy[side], k); lip.cx = lerp(a.cx, b.cx, k);
    return lip;
  };
  const putV = (v, x, y, z) => { crackPos[v * 3] = x; crackPos[v * 3 + 1] = y; crackPos[v * 3 + 2] = z; };

  function poseCrack(t) {
    const W = opening(t), L = ease.out(seg(t, 0.42, 0.58)) * 1.12;
    let rimDirty = false;
    for (let i = 0; i < NR; i++) {
      const row = rows[i], h = HMAX * row.w * W * smooth(0, 0.12, L - row.reveal), k = h / HMAX;
      const rim = Math.round(smooth(0, 0.012, h) * 16) / 16;
      if (rim !== row.rim) { // colours change only while a row opens or closes
        row.rim = rim; rimDirty = true;
        for (let s = 0; s < 2; s++) for (let c = 0, o = (i * 2 + s) * 6, v = LI(i, s, 0) * 3; c < 6; c++) crackCol[v + c] = lerp(rimBase[o + c], rimTo[o + c], rim);
      }
      for (let s = 0; s < 2; s++) {
        const sg = s ? 1 : -1, hs = h * (1 + row.edge[s]), dy = DROP[s] * k;
        row.hs[s] = sg * hs; row.dy[s] = dy;
        for (let c = 0; c < LC; c++) { const v = LI(i, s, c); putV(v, row.cx + sg * (lipDist[v] + hs), row.y + dy * lipProf[v], row.z); }
        // walls sit just under the lip edge; while the row is (nearly) closed they hide deep down so no sliver can show
        const yTop = row.y + dy - 0.002 - 0.3 * (1 - smooth(0, 0.004, h));
        for (let d = 0; d < WC; d++) { const f = WALL_F[d]; putV(WI(i, s, d), row.cx + sg * hs * (1 - 0.9 * Math.pow(f, 0.7)), lerp(yTop, Y_BOTTOM, f), row.z); }
      }
    }
    const lampG = ease.out(seg(lampTilt(t), 0.35, 1));
    for (let n = 0; n < branches.length; n++) {
      const b = branches[n];
      let g = lampG, sx = 0, sy = 0, by = WALK_Y + 0.0015;
      if (!b.onLamp) { g = ease.out(seg(t, b.t0, b.t0 + 0.07)); const r = rows[b.rowI]; sx = r.hs[b.side]; sy = r.dy[b.side]; by = r.y; }
      const nx = -Math.sin(b.ang), nz = Math.cos(b.ang);
      for (let p = 0; p < BRN; p++) {
        const pt = b.pts[p], w = pt[2] * g, k = p / (BRN - 1);
        const x = b.bx + sx + pt[0] * g, z = b.bz + pt[1] * g, y = by + 0.0025 + sy * sagProf(k * b.len * g);
        putV(b.base + p * 2, x + nx * w, y, z + nz * w);
        putV(b.base + p * 2 + 1, x - nx * w, y, z - nz * w);
      }
    }
    crackPosAttr.needsUpdate = true;
    if (rimDirty) crackColAttr.needsUpdate = true;
  }

  function poseBits(t, E, ts) {
    const W = opening(t), tilt = lampTilt(t);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.kind === 'heave') { // pavers pushed up on the far side of the leaning lamp footing
        const k = tilt * b.k;
        setInst(boxMesh, i, b.x, WALK_Y + 0.004 + 0.02 * k + rippleY(b.x, b.z), b.z, 0.05 * k, b.ry, -0.32 * k, b.sx, b.sy, b.sz);
        continue;
      }
      const l = lipAt(b.rowI, b.side, b.z), sg = b.side ? 1 : -1;
      if (b.kind === 'kerb' || b.kind === 'kerbFall') {
        // stones nearer the crack ride further with the lip; the squeeze between neighbours lifts and tips them a little
        const fall = 1 - b.dist / LIP_D, squeeze = Math.abs(l.hx) * 0.28;
        let x = b.x + l.hx * fall, y = b.y + l.dy * sagProf(b.dist) + rippleY(b.x, b.z) + squeeze * 0.25, rz = sg * squeeze * 1.5, rx = 0;
        if (b.kind === 'kerbFall') { const f = ease.inOut(seg(t, 0.44, 0.6)); x = lerp(b.x, l.cx + l.hx * 0.2, f); y -= 0.05 * f; rz = -sg * 0.5 * f; rx = 0.2 * f; }
        setInst(boxMesh, i, x, y, b.z, rx, 0, rz, b.sx, b.sy, b.sz);
      } else if (b.kind === 'chunk' || b.kind === 'crumb') {
        const g = ease.outBack(seg(t, b.t0, b.t0 + 0.04)), chunk = b.kind === 'chunk', x = l.cx + l.hx + sg * b.out;
        const y = (b.y0 ?? ROAD_Y) + b.sy * 0.4 + l.dy * 0.8 + (chunk ? 0.012 * g : 0) + rippleY(x, b.z);
        setInst(boxMesh, i, x, y, b.z, 0, b.ry, chunk ? -sg * b.tilt * clamp(W * 1.2) : 0, b.sx * g, b.sy * g, b.sz * g);
      } else { // a piece of road breaks off and drops a little way in, where it stays wedged and visible
        const on = t >= b.t0 - 0.04 ? 1 : 0, f = seg(t, b.t0, b.t0 + 0.035), x = l.cx + l.hx * (1 - 0.8 * f) + 0.02;
        const y = ROAD_Y + 0.015 - 0.07 * f * f - 0.02 * ease.out(seg(t, 0.62, 0.69)) + rippleY(x, b.z) * (1 - f);
        setInst(boxMesh, i, x, y, b.z, 0.4 * f, 0.2, 0.9 * f, b.sx * on, b.sy * on, b.sz * on);
      }
    }
    const potK = ease.in(seg(t, 0.315, 0.36));
    for (let i = 0; i < rocks.length; i++) {
      const b = rocks[i];
      if (b.kind === 'stone') {
        const d = ease.inOut(seg(t, 0.05, 0.72)) + 0.15 * E * Math.sin(ts * 9 + i);
        const len = Math.hypot(b.dx, b.dz), x = b.x + b.dx * d, z = b.z + b.dz * d, roll = (len * d) / b.r; // rolls about the axis across its path
        setInst(rockMesh, i, x, b.y0 + b.r * 0.7 + Math.max(0, groundH(x, z)) + rippleY(x, z) + 0.01 * E * Math.abs(Math.sin(ts * 11 + i)), z, (b.dz / len) * roll, 0, (-b.dx / len) * roll, b.r, b.r * 0.8, b.r);
      } else if (b.kind === 'stoneFall') {
        const rollK = ease.inOut(seg(t, 0.3, b.t0)), fall = seg(t, b.t0, b.t1), l = lipAt(b.rowI, 1, b.z);
        const x = lerp(b.x, l.cx + l.hx + b.r, rollK) - fall * (l.hx + b.r * 0.8), y = b.y0 + b.r * 0.7 - 0.09 * fall * fall + rippleY(x, b.z) * (1 - fall);
        setInst(rockMesh, i, x, y, b.z, 0, 0, (b.x - x) / b.r, b.r, b.r * 0.85, b.r);
      } else if (b.kind === 'clod') {
        const l = lipAt(b.rowI, b.side, b.z), g = ease.outBack(seg(t, b.t0, b.t0 + 0.05)), x = l.cx + l.hx + (b.side ? 1 : -1) * b.out;
        setInst(rockMesh, i, x, rows[b.rowI].y + 0.004 + l.dy * 0.7 + rippleY(x, b.z), b.z, 0.3, i, 0.2, 0.034 * g, 0.016 * g, 0.026 * g);
      } else if (b.kind === 'spill') {
        const g = ease.out(seg(t, 0.35, 0.4));
        setInst(rockMesh, i, b.x, WALK_Y + 0.004 + rippleY(b.x, b.z), b.z, 0.2, i, 0.1, 0.04 * g + 0.0001, 0.012 * g + 0.0001, 0.03 * g + 0.0001);
      } else if (b.kind === 'date') {
        const f = seg(t, b.t0, b.t0 + 0.055), bounce = seg(t, b.t0 + 0.055, b.t0 + 0.085), on = t >= b.t0 ? 1 : 0;
        const y = lerp(b.from[1], WALK_Y + 0.02 + rippleY(b.to[0], b.to[1]), f * f) + 0.04 * Math.sin(Math.PI * bounce);
        setInst(rockMesh, i, lerp(b.from[0], b.to[0], f), y, lerp(b.from[2], b.to[1], f), f * 5, 0, f * 3 + bounce, 0.02 * on, 0.027 * on, 0.02 * on);
      } else { // heave: soil pushed up at the lamp base as it leans
        setInst(rockMesh, i, b.x, WALK_Y + rippleY(b.x, b.z), b.z, 0, 0.4, 0, 0.1 * tilt + 0.001, 0.03 * tilt + 0.001, 0.09 * tilt + 0.001);
      }
    }
    boxMesh.instanceMatrix.needsUpdate = true;
    rockMesh.instanceMatrix.needsUpdate = true;
    // the pot: wobbles in the first jolt, tips over toward the street in the big one and rolls a little
    pot.position.set(POT.x + 0.0525 + 0.03 * potK, WALK_Y + rippleY(POT.x, POT.z), POT.z - 0.02 * potK);
    pot.rotation.set(0, 0.3 * potK, -1.38 * potK - 0.06 * E * Math.max(0, Math.sin(ts * 14)) * (1 - potK));
  }

  function posePuffs(t) {
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i], k = (t - p.t0) / p.life;
      if (k <= 0 || k >= 1) { puffAlpha.array[i] = 0; setInst(puffMesh, i, p.x, -1, p.z, 0, 0, 0, 0, 0, 0); continue; }
      const e = ease.out(k), s = lerp(p.s0, p.s1, e);
      puffAlpha.array[i] = p.a * Math.pow(Math.sin(Math.PI * k), 0.8) * (1 - 0.3 * k);
      setInst(puffMesh, i, p.x + 0.05 * e, p.y + p.rise * e + s * 0.3, p.z, 0, 0, 0, s, s, s);
    }
    puffAlpha.needsUpdate = true;
    puffMesh.instanceMatrix.needsUpdate = true;
  }
  function poseMarks(E, ts) {
    const on = smooth(0.25, 0.5, E);
    for (let i = 0; i < MARKS.length; i++) {
      const M = MARKS[i], k = on * (0.85 + 0.15 * Math.sin(ts * TAU * 2.4 + i * 1.7));
      setInst(marks, i, M[0], M[1], M[2], 0, 0, 0, M[3] * k, k, k);
    }
    marks.visible = on > 0;
    marks.instanceMatrix.needsUpdate = true;
  }
  const _o = new THREE.Object3D(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const bez = (out, p0, p1, p2, k) => out.copy(p0).multiplyScalar((1 - k) * (1 - k)).addScaledVector(p1, 2 * k * (1 - k)).addScaledVector(p2, k * k);
  for (const b of birds) { // curve control points: climb out above the street, glide back in from the other side
    b.goMid = b.perch.clone().add(new THREE.Vector3(0, 0.7, 0.4));
    b.retMid = b.perch.clone().add(new THREE.Vector3(0.3, 0.6, 0.5));
  }
  function poseBirds(t, time) {
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i], kGo = seg(t, b.go, b.go + 0.14), kRet = seg(t, b.ret, b.ret + 0.12);
      let flying = kGo > 0 && kRet < 1, yaw = b.yaw, pitch = 0, scale = 1.3;
      if (!flying) _a.copy(b.perch);
      else if (kGo < 1) { const k = ease.in(kGo) * 0.85 + kGo * 0.15; bez(_a, b.perch, b.goMid, b.away, k); bez(_b, b.perch, b.goMid, b.away, Math.min(1, k + 0.02)); }
      else if (kRet > 0) { const k = ease.out(kRet); bez(_a, b.back, b.retMid, b.perch, k); bez(_b, b.back, b.retMid, b.perch, Math.min(1, k + 0.02)); }
      else { scale = 0; flying = false; _a.copy(b.away); } // away from the diorama while it shakes
      if (flying) { _b.sub(_a); yaw = Math.atan2(_b.x, _b.z); pitch = -0.5 * Math.atan2(_b.y, Math.hypot(_b.x, _b.z)); }
      const peck = flying ? 0 : 0.45 * Math.pow(Math.max(0, Math.sin(time * 1.7 + i * 2.4)), 12);
      _o.position.copy(_a); _o.rotation.set(pitch + peck, yaw, 0); _o.scale.setScalar(scale); _o.updateMatrix();
      birdBodies.setMatrixAt(i, _o.matrix);
      const flap = flying ? 0.2 + 0.85 * Math.sin(time * 30 + i) : -0.25;
      for (let w = 0; w < 2; w++) {
        _o.position.copy(_a); _o.rotation.set(pitch, yaw + (w ? Math.PI : 0), 0);
        _o.translateY(0.016); _o.rotateZ(flap); _o.scale.setScalar(scale * (flying ? 1 : 0.62)); _o.updateMatrix();
        birdWings.setMatrixAt(i * 2 + w, _o.matrix);
      }
    }
    birdBodies.instanceMatrix.needsUpdate = true;
    birdWings.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- sound
  const CUES = [ // one-shots fired when a playing t crosses them upward
    { t: 0.175, name: 'thud', opts: { gain: 0.3, rate: 1.6, pan: 0.55 } }, // a date drops from the palm
    { t: 0.385, name: 'thud', opts: { gain: 0.25, rate: 1.7, pan: 0.6 } },
    { t: 0.42, name: 'crack', opts: { gain: 1, rate: 1, pan: 0 } }, // the road splits
    { t: 0.535, name: 'crack', opts: { gain: 0.75, rate: 0.85, pan: 0.05 } },
    { t: 0.62, name: 'crack', opts: { gain: 0.6, rate: 1.15, pan: 0.1 } },
    { t: 0.62, name: 'thud', opts: { gain: 0.55, rate: 1.1, pan: 0.05 } }, // asphalt chunk falls in
    { t: 0.665, name: 'thud', opts: { gain: 0.5, rate: 1.3, pan: -0.1 } }, // a stone tumbles in
  ];
  const rumbleOpts = { gain: 0, rate: 1 };
  let playing = false, lastT = 0, rumble = null, rumbleGain = -1, curT = -1, curTime = 0, shakeSway = 0, ambientSway = 0;

  const evidencePost = new THREE.Vector3();
  const evidence = {
    crack: { pos: new THREE.Vector3(rows[rowAt(ROAD_ZC)].cx, 0.03, ROAD_ZC), radius: 0.4 },
    post: { pos: evidencePost, radius: 0.34 },
  };

  function setProgress(tIn) {
    const t = clamp(tIn);
    const ts = t * DURATION;
    const E = envelope(t) * (0.82 + 0.18 * Math.sin(ts * TAU * 1.6));
    // ground waves (shader + the same formula on the CPU for things resting on the ground)
    uniforms.uQAmp.value = 0.018 * E; uniforms.uQPhase.value = ts * 8;
    // the whole street moves with the ground, each object rocks on top of it
    world.position.set(0.008 * E * Math.sin(ts * TAU * 2.7), 0, 0.005 * E * Math.sin(ts * TAU * 3.3 + 1));
    for (let i = 0; i < shakers.length; i++) {
      const s = shakers[i], w = ts * TAU * s.f + s.ph;
      const y = s.ripple ? rippleY(s.bx, s.bz) : 0;
      s.obj.position.set(s.bx + s.amp * E * (0.65 * Math.sin(w) + 0.35 * Math.sin(1.73 * w + 1)), s.by + y + 0.004 * E * Math.abs(Math.sin(w * 1.3)), s.bz + s.amp * 0.6 * E * Math.sin(1.31 * w + 2));
      s.obj.rotation.set(s.rx + s.rot * 0.6 * E * Math.sin(1.21 * w), s.ry, s.rz + s.rot * E * Math.sin(w + 1.1));
    }
    shakeSway = 0.03 * E * Math.sin(ts * TAU * 2.9);
    palmCrown.rotation.z = shakeSway + ambientSway;
    // lamp: wobbles and leans a little more with every burst
    const T = lampTilt(t), wl = ts * TAU * 3.6;
    lampGroup.position.set(LAMP.x + 0.008 * E * Math.sin(wl), WALK_Y + rippleY(LAMP.x, LAMP.z), LAMP.z);
    lampGroup.rotation.set(LAMP.tiltX * T + 0.012 * E * Math.sin(wl * 1.2), 0, LAMP.tiltZ * T + 0.018 * E * Math.sin(wl + 0.5));
    bulbMat.color.copy(E > 0.2 && Math.sin(ts * 23) > 0.55 ? BULB_DIM : BULB_ON); // the lamp flickers while it shakes
    // hairlines creep up the walls in the big shake
    const gH = ease.out(seg(t, 0.47, 0.6)), gW = ease.out(seg(t, 0.55, 0.66));
    wallHair.visible = gH > 0; wallHair.scale.setScalar(Math.max(gH, 1e-3));
    gwHair.visible = gW > 0; gwHair.scale.setScalar(Math.max(gW, 1e-3));
    poseCrack(t);
    poseBits(t, E, ts);
    posePuffs(t);
    poseMarks(E, ts);
    poseBirds(t, curTime);
    // sound: rumble follows the shaking; one-shots only while playing and moving forward
    if (playing) {
      if (t < lastT) lastT = t;
      for (let i = 0; i < CUES.length; i++) { const c = CUES[i]; if (lastT < c.t && t >= c.t) sfx?.play(c.name, c.opts); }
      const g = Math.round(E * 0.95 * 50) / 50;
      if (rumble && g !== rumbleGain) { rumbleOpts.gain = g; rumbleOpts.rate = 0.85 + 0.3 * E; rumble.set(rumbleOpts); rumbleGain = g; }
    }
    lastT = t; curT = t;
  }

  // evidence: mid-height of the leaning pole at t = 1
  lampGroup.position.set(LAMP.x, WALK_Y, LAMP.z);
  lampGroup.rotation.set(LAMP.tiltX, 0, LAMP.tiltZ);
  lampGroup.updateMatrix();
  evidencePost.set(0, 0.72, 0).applyMatrix4(lampGroup.matrix);

  function update(dt, time) {
    curTime = time;
    poseBirds(curT < 0 ? 0 : curT, time);
    ambientSway = 0.025 * Math.sin(time * 0.9) + 0.012 * Math.sin(time * 2.3 + 1);
    palmCrown.rotation.z = shakeSway + ambientSway;
    palmCrown.rotation.x = 0.015 * Math.sin(time * 0.7 + 2);
  }

  function play() {
    playing = true; lastT = curT < 0 ? 0 : curT;
    rumble?.stop();
    rumble = sfx?.loop('rumble', { gain: 0, rate: 0.9 }) || null; rumbleGain = -1;
  }
  function stop() { playing = false; rumble?.stop(); rumble = null; }

  setProgress(0);

  return {
    key: 'quake',
    group,
    duration: DURATION,
    setProgress,
    update,
    play,
    stop,
    evidence,
    thumb: { cam: [-0.7, 3.15, 3.47], target: [0.0, 0.3, 0.15], t: 1 },
    dispose() {
      stop();
      group.traverse((o) => o.geometry?.dispose?.());
      for (const m of owned) m.dispose();
    },
  };
}
