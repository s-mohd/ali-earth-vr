// Date palms (merged per sector, swaying in the vertex shader), bushes and rocks (merged into the sector batches),
// and the deterministic plan of where they all go.
import { THREE, rng, lerp, blobGeo } from '../core/kit.js';
import { SUN_DIR } from '../core/lighting.js';
import { OUTER } from '../core/layout.js';
import { isClear, inView, toWorld, zoneYaw, swayMaterial, sectorBatches, smoothGeo } from './env_util.js';
import { heightAt, shoreR } from './env_terrain.js';
import { SEA_Y } from './env_util.js';
import { markSpot } from './env_marks.js';

const TAU = Math.PI * 2;
/** The lone old ghaf on its dune (weathering-station local x, z): left of the diorama, well right of the board. */
export const LONE = [-4.6, -16.5];

// ---------------------------------------------------------------- placement plan (deterministic)
export function planFlora(quality = 'high') {
  const lo = quality === 'low';
  const R = rng(2024);
  const palms = [], bushes = [], blooms = [], rocks = [], trees = [];
  const farFrom = (list, x, z, d) => list.every((p) => Math.hypot(p.x - x, p.z - z) >= d);
  const flags = OUTER.filter((k) => k !== 'hall').map((k) => { const [x, z] = toWorld(k, ...markSpot(k)); return { x, z }; });
  const pads = ['hub', ...OUTER].map((k) => { const [x, z] = toWorld(k, 0, 0); return { x, z }; }); // where the child stands
  const palm = (x, z, h = 4.6 + R() * 2.2) => {
    if (!farFrom(palms, x, z, 2.6) || !farFrom(flags, x, z, 3.8)) return false;
    palms.push({ x, z, h, lean: 0.25 + R() * 0.7, dir: R() * TAU, seed: palms.length + 7 });
    return true;
  };
  // framing pairs at every station (beside / behind the diorama, never in the sea view)
  for (const k of OUTER) {
    if (k === 'hall') continue;
    for (const [lx, lz] of [[-5.6, -6.6], [6.5, -5.4], [-7.4, -0.8], [7.9, 1.2]]) palm(...toWorld(k, lx, lz));
  }
  // a ring around the hub plaza, between the paths; the one in front of the fishing village (bearing 180°) steps aside
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6 + (R() - 0.5) * 0.25 - Math.PI / 2 + (i === 4 ? 0.3 : 0), r = 6.8 + R() * 1.2;
    palm(Math.cos(a) * r, Math.sin(a) * r, 5.2 + R() * 1.3);
  }
  // groves over the rest of the island
  for (let tries = 0, n = 0; tries < 4000 && n < (lo ? 6 : 14); tries++) {
    const a = R() * TAU, r = 9 + Math.sqrt(R()) * 25, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (r > shoreR(a) - 3.5 || !isClear(x, z, 'tall', 0.4) || inView(x, z, 14, 9, 1.4)) continue;
    if (palm(x, z)) n++;
  }
  // ghaf and sidr trees: low, flat-topped desert trees; one lone old ghaf on the dune behind the weathering station
  // (a nod to Bahrain's Tree of Life)
  const lone = toWorld('weather', LONE[0], LONE[1]);
  trees.push({ x: lone[0], z: lone[1], h: 3.6, s: 1.35, seed: 1, kind: 'ghaf' });
  for (let tries = 0, n = 0; tries < 4000 && n < (lo ? 5 : 9); tries++) {
    const a = R() * TAU, r = 8 + Math.sqrt(R()) * 24, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (r > shoreR(a) - 5 || !isClear(x, z, 'tall', 0.3) || inView(x, z, 26, 14, 1.75) || !farFrom(pads, x, z, 12) || !farFrom(palms, x, z, 3.2) || !farFrom(trees, x, z, 5) || !farFrom(flags, x, z, 3.5)) continue;
    trees.push({ x, z, h: 2.6 + R() * 1.0, s: 0.85 + R() * 0.35, seed: 10 + n, kind: R() < 0.55 ? 'ghaf' : 'sidr' });
    n++;
  }
  // bushes: soft green clumps along the island, some flowering (bougainvillea pink)
  for (let tries = 0, n = 0; tries < 5000 && n < (lo ? 22 : 34); tries++) {
    const a = R() * TAU, r = 4.5 + Math.sqrt(R()) * 30, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (r > shoreR(a) - 4.5 || !isClear(x, z, 'mid', 0.2) || !farFrom(pads, x, z, 6) || !farFrom(bushes, x, z, 2.2) || !farFrom(palms, x, z, 1.2) || !farFrom(trees, x, z, 2.2) || !farFrom(flags, x, z, 2)) continue;
    (R() < 0.4 ? blooms : bushes).push({ x, z, s: 0.7 + R() * 0.6, rot: R() * TAU });
    n++;
  }
  // a few bushes hugging each palm trunk
  for (const p of palms) if (R() < (lo ? 0.2 : 0.35)) { const a = R() * TAU, x = p.x + Math.cos(a) * 1.1, z = p.z + Math.sin(a) * 1.1; if (isClear(x, z, 'mid') && farFrom(pads, x, z, 6) && farFrom(flags, x, z, 2)) bushes.push({ x, z, s: 0.55 + R() * 0.3, rot: R() * TAU }); }
  // rocks: beach boulders and a few scattered stones
  for (let tries = 0, n = 0; tries < 4000 && n < 26; tries++) {
    const a = R() * TAU, beach = n < 16, R0 = shoreR(a), r = beach ? R0 - 4 + R() * 4.5 : 8 + R() * 22;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isClear(x, z, 'mid', 0.3) || !farFrom(rocks, x, z, 2.5) || !farFrom(palms, x, z, 1.5) || !farFrom(trees, x, z, 2) || !farFrom(flags, x, z, 2)) continue;
    rocks.push({ x, z, s: beach ? 0.45 + R() * 0.8 : 0.3 + R() * 0.4, rot: R() * TAU, seed: n });
    n++;
  }
  return { palms, bushes, blooms, rocks, trees };
}

/**
 * The game re-aims the sun for every place (it always comes from the viewer's front-right), so a baked shadow can only be
 * right for one place: each object's shadow is cast for the place it is seen best from (the nearest), and kept short so it
 * still reads as plausible from the others.
 */
const SUNS = ['hub', ...OUTER].map((k) => { const [x, z] = toWorld(k, 0, k === 'hub' ? 0 : -3.6), y = zoneYaw(k), c = Math.cos(y), s = Math.sin(y); return { x, z, dx: SUN_DIR.x * c + SUN_DIR.z * s, dz: -SUN_DIR.x * s + SUN_DIR.z * c }; });
/** Ground offset per metre of height for a shadow cast at world (x, z) (shortened to 60 %). */
export function shadowStep(x, z) {
  let best = SUNS[0], bd = Infinity;
  for (const s of SUNS) { const d = Math.hypot(x - s.x, z - s.z); if (d < bd) { bd = d; best = s; } }
  return [(-best.dx / SUN_DIR.y) * 0.6, (-best.dz / SUN_DIR.y) * 0.6];
}

/** Soft baked shadow spots (trunk contact + crown shadow cast away from the sun) and lush ground under the palms. */
export function floraShadows(plan) {
  const out = [];
  for (const p of plan.palms) {
    const cx = p.x + Math.cos(p.dir) * p.lean, cz = p.z + Math.sin(p.dir) * p.lean, [sx, sz] = shadowStep(p.x, p.z);
    out.push({ x: p.x, z: p.z, r: 1.1, k: 0.5 }, { x: cx + sx * p.h * 0.95, z: cz + sz * p.h * 0.95, r: 2.5, k: 0.4 });
  }
  for (const t of plan.trees || []) {
    const [sx, sz] = shadowStep(t.x, t.z);
    out.push({ x: t.x, z: t.z, r: 1.0, k: 0.45 }, { x: t.x + sx * t.h * 0.8, z: t.z + sz * t.h * 0.8, r: 2.3 * t.s, k: 0.5 });
  }
  for (const b of [...plan.bushes, ...plan.blooms]) { const [sx, sz] = shadowStep(b.x, b.z); out.push({ x: b.x + sx * 0.4, z: b.z + sz * 0.4, r: 1.4 * b.s, k: 0.5 }); }
  for (const r of plan.rocks) out.push({ x: r.x, z: r.z, r: 1.3 * r.s + 0.3, k: 0.35 });
  return out;
}
/** Irrigated green spots: under every palm and tree (the terrain turns lush there, even on the dunes). */
export function floraLush(plan) {
  return [...plan.palms.map((p) => ({ x: p.x, z: p.z, r: 3.4 })), ...(plan.trees || []).map((t) => ({ x: t.x, z: t.z, r: 2.6 }))];
}

// ---------------------------------------------------------------- date palm
const LEAF = ['#4f9a55', '#5aa65a', '#4a9150'], LEAF_TIP = ['#9ad67a', '#a8dc80', '#8fcf72'], SPINE = ['#3f8247', '#468c4b', '#3c7d45'];
const DATES = ['#d9862e', '#e9b13d', '#c0582c'];

/**
 * Adds one date palm to a sway batch: a trunk of leaf-base scales, a crown of arching V-folded fronds with serrated
 * (pinnate-looking) edges, a skirt of dry fronds and hanging date clusters. ~360 triangles.
 */
function addPalm(B, x, z, { h = 5.5, lean = 0.5, dir = 0, seed = 1 } = {}) {
  const R = rng(seed * 97 + 3), y = heightAt(x, z) - 0.05;
  const lx = Math.cos(dir) * lean, lz = Math.sin(dir) * lean;
  const at = (t) => [x + lx * t * t, y + h * t, z + lz * t * t];
  const segs = 7, rad = 6;
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs, t1 = (s + 1) / segs, p0 = at(t0), p1 = at(t1);
    const r0 = lerp(0.27, 0.18, t0) * (s === 0 ? 1.4 : 0.9), r1 = lerp(0.27, 0.18, t1) * 1.05;
    const cA = s === 0 ? '#5f4128' : s % 2 ? '#94693f' : '#87603c', cB = s % 2 ? '#c99d6b' : '#bb8f5f'; // darker at the foot (contact AO)
    for (let k = 0; k < rad; k++) {
      const a0 = ((k + s * 0.5) / rad) * TAU, a1 = ((k + 1 + s * 0.5) / rad) * TAU;
      const n0 = [Math.cos(a0), 0.25, Math.sin(a0)], n1 = [Math.cos(a1), 0.25, Math.sin(a1)];
      const q00 = [p0[0] + n0[0] * r0, p0[1], p0[2] + n0[2] * r0], q01 = [p0[0] + n1[0] * r0, p0[1], p0[2] + n1[2] * r0];
      const q10 = [p1[0] + n0[0] * r1, p1[1], p1[2] + n0[2] * r1], q11 = [p1[0] + n1[0] * r1, p1[1], p1[2] + n1[2] * r1];
      B.vtx(q00, n0, cA, t0); B.vtx(q11, n1, cB, t1); B.vtx(q01, n1, cA, t0);
      B.vtx(q00, n0, cA, t0); B.vtx(q10, n0, cB, t1); B.vtx(q11, n1, cB, t1);
    }
  }
  const top = at(1);
  B.add(new THREE.IcosahedronGeometry(0.33, 0), { pos: [top[0], top[1] + 0.04, top[2]], scale: [1, 0.85, 1], color: '#7b8a40', sway: 1 });
  // fronds in three tiers (rising, spreading, drooping) + a skirt of dry fronds below
  const nF = 11, nDry = 2;
  for (let f = 0; f < nF + nDry; f++) {
    const dry = f >= nF, tier = dry ? 3 : f % 3;
    const az = dry ? R() * TAU : (f / nF) * TAU + R() * 0.3;
    const e0 = [1.05, 0.55, 0.18, -1.0][tier] + (R() - 0.5) * 0.2;
    const L = (dry ? 1.4 : 2.3 + R() * 0.5) * (0.78 + h * 0.045), droop = [0.42, 0.66, 0.85, 0.15][tier];
    const dx = Math.cos(az), dz = Math.sin(az), S = dry ? 3 : 4, pts = [];
    for (let i = 0; i <= S; i++) {
      const s = i / S, hd = L * s * Math.cos(e0);
      pts.push([top[0] + dx * hd, top[1] + 0.08 + L * s * Math.sin(e0) - droop * L * s * s, top[2] + dz * hd]);
    }
    const ci = f % 3, base = dry ? '#a88a55' : LEAF[ci], tipC = dry ? '#d8bf86' : LEAF_TIP[ci], spine = dry ? '#9a7c4a' : SPINE[ci];
    const W = (dry ? 0.26 : 0.46) * (0.82 + h * 0.035), sideX = -dz, sideZ = dx;
    // edge vertex i: width tapers to the tip, alternating widths give a serrated, leaflet-like outline
    const edge = (i, sg) => {
      const s = i / S, w = W * Math.sin(Math.PI * Math.min(1, 0.12 + s * 0.92)) * (i % 2 ? 0.72 : 1) * (i === S ? 0 : 1), p = pts[i];
      return [p[0] + sideX * sg * w, p[1] + w * 0.38 - (dry ? 0.06 : 0), p[2] + sideZ * sg * w];
    };
    const sw = (i) => 1 + (i / S) * 0.55;
    for (let i = 0; i < S; i++) {
      const a = pts[i], b = pts[i + 1];
      for (const sg of [-1, 1]) {
        const ea = edge(i, sg), eb = edge(i + 1, sg), ca = i ? lerpHex(base, tipC, i / S) : spine, cb = lerpHex(base, tipC, (i + 1) / S);
        B.tri(a, b, eb, [spine, spine, cb], [sw(i), sw(i + 1), sw(i + 1)]);
        B.tri(a, eb, ea, [spine, cb, ca], [sw(i), sw(i + 1), sw(i)]);
      }
    }
  }
  // date clusters hanging under the crown
  const nD = 2 + Math.floor(R() * 3);
  for (let d = 0; d < nD; d++) {
    const az = (d / nD) * TAU + R(), ox = Math.cos(az), oz = Math.sin(az);
    const c = [top[0] + ox * 0.42, top[1] - 0.4, top[2] + oz * 0.42];
    B.tri([top[0] + ox * 0.15, top[1] + 0.02, top[2] + oz * 0.15], [top[0] + ox * 0.2 - oz * 0.05, top[1] - 0.05, top[2] + oz * 0.2 + ox * 0.05], [c[0], c[1] + 0.12, c[2]], ['#e0b04a'], [1, 1, 1]);
    B.add(blobGeo(0.17, { detail: 0, jitter: 0.12, seed: seed * 5 + d }), { pos: c, scale: [1, 1.45, 1], color: DATES[(seed + d) % 3], sway: 1, flat: true });
  }
}
const _ha = new THREE.Color(), _hb = new THREE.Color();
const lerpHex = (a, b, t) => _ha.set(a).lerp(_hb.set(b), t).getHex();

// ---------------------------------------------------------------- bushes & rocks (merged into the sector batches)
const BUSH = [[0, 0.42, 0, 0.56], [0.44, 0.3, 0.14, 0.42], [-0.42, 0.3, -0.1, 0.44]];
const BUSH_GEO = BUSH.map(([, ly, , r], i) => smoothGeo(blobGeo(r, { detail: 1, jitter: 0.12, seed: 40 + i }), 0.03 - ly)); // minus the buried caps
const PETAL = new THREE.OctahedronGeometry(0.12, 0), ROCK = blobGeo(1, { detail: 1, jitter: 0.25, seed: 3, squash: 0.62 });

function addBush(B, b, bloom) {
  const y = heightAt(b.x, b.z) - 0.05, c = Math.cos(b.rot), s = Math.sin(b.rot), k = 0.92 + (b.rot % 1) * 0.16;
  const dark = '#' + new THREE.Color('#4f9a55').multiplyScalar(k).getHexString(), light = '#' + new THREE.Color('#a6dc84').multiplyScalar(k).getHexString();
  BUSH.forEach(([lx, ly, lz, r], i) => B.add(BUSH_GEO[i], { pos: [b.x + (lx * c + lz * s) * b.s, y + ly * b.s * 0.9, b.z + (-lx * s + lz * c) * b.s], scale: [b.s, b.s * 0.9, b.s], grad: [dark, light, -r, r * 0.9] }));
  if (!bloom) return;
  const R = rng(Math.round(b.rot * 1000));
  for (let i = 0; i < 16; i++) {
    const a = R() * TAU, up = 0.2 + R() * 0.6, rr = 0.55 * (1 - up * 0.45) * b.s;
    B.add(PETAL, { pos: [b.x + Math.cos(a) * rr, y + (0.32 + up * 0.48) * b.s, b.z + Math.sin(a) * rr], rot: [R(), R(), 0], scale: b.s * (0.55 + R() * 0.3), color: i % 3 ? '#e0508a' : '#f59ac2' });
  }
}

const ROCK_TINT = ['#d4c7b5', '#c3b6a6', '#e0d2bd', '#b9ab99'];
function addRock(B, r) {
  B.add(ROCK, { pos: [r.x, heightAt(r.x, r.z) - r.s * 0.18, r.z], rot: [0, r.rot, (r.seed % 3) * 0.12], scale: [r.s * 1.2, r.s, r.s], color: ROCK_TINT[r.seed % 4] });
}

// ---------------------------------------------------------------- ghaf / sidr tree
const CANOPY = [0, 1, 2, 3].map((i) => smoothGeo(blobGeo(1, { detail: 1, jitter: 0.22, seed: 60 + i })));
const LIMB = new THREE.CylinderGeometry(0.6, 1, 1, 6, 1, true).translate(0, 0.5, 0);
const TREE_COL = { ghaf: [['#4f7a45', '#93b86a'], ['#5c8a4c', '#a9c97a']], sidr: [['#3f7442', '#7fb35c'], ['#477d47', '#93c266']] };
const _Y = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _q = new THREE.Quaternion(), _eu = new THREE.Euler();
/** A low desert tree: a short gnarled bole forking into three limbs under a wide, flat-topped canopy. ~470 triangles. */
function addTree(B, x, z, { h = 3, s = 1, seed = 1, kind = 'ghaf' } = {}) {
  const R = rng(seed * 31 + 5), y = heightAt(x, z) - 0.06, bole = h * 0.36, rb = 0.17 * s;
  B.add(LIMB, { pos: [x, y, z], scale: [rb, bole + 0.1, rb], grad: ['#4a3423', '#7a5b3e'], sway: 0 });
  const top = [x, y + bole, z], cy = y + h * 0.78, crown = [];
  for (let k = 0; k < 3; k++) {
    const az = (k / 3) * TAU + R() * 0.8, tilt = 0.55 + R() * 0.25, L = h * 0.42;
    _dir.set(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
    _eu.setFromQuaternion(_q.setFromUnitVectors(_Y, _dir));
    B.add(LIMB, { pos: top, rot: [_eu.x, _eu.y, _eu.z], scale: [rb * 0.55, L, rb * 0.55], grad: ['#5c4330', '#80664a'], sway: (px, py) => py * 0.6 });
    crown.push([top[0] + _dir.x * L * 1.15, top[2] + _dir.z * L * 1.15]);
  }
  const [dark, light] = TREE_COL[kind][seed % 2], W = 1.25 * s;
  B.add(CANOPY[seed % 4], { pos: [x, cy + 0.12 * s, z], scale: [W * 1.25, W * 0.42, W * 1.15], grad: [dark, light, -0.6, 0.8], sway: 1 });
  crown.forEach(([cx, cz], k) => B.add(CANOPY[(seed + k + 1) % 4], { pos: [cx, cy - 0.1 * s + R() * 0.2, cz], scale: [W * 0.82, W * 0.34, W * 0.78], grad: [dark, light, -0.7, 0.8], sway: 1 }));
}

// ---------------------------------------------------------------- mangroves (a nod to Tubli Bay)
const ROOT = new THREE.TorusGeometry(0.32, 0.028, 3, 6, Math.PI);
/** A stand of mangroves on the waterline between angles a0..a1 (world): glossy dark crowns on arching prop roots. */
export function addMangroves(stat, a0 = -1.22, a1 = -0.86) {
  const R = rng(808);
  for (let i = 0, n = 9; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + R() * 0.6)) / n, r = shoreR(a) - 0.6 + R() * 1.4, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.75 + R() * 0.45;
    const B = stat.pick(x, z), y = SEA_Y - 0.08;
    for (let k = 0; k < 5; k++) {
      const yaw = R() * TAU, c = Math.cos(yaw), sn = Math.sin(yaw);
      B.add(ROOT, { pos: [x + c * 0.25 * s, y, z - sn * 0.25 * s], rot: [0, yaw, 0], scale: [s, s * 1.5, s], color: '#6b5440' });
    }
    B.add(CANOPY[i % 4], { pos: [x, y + 0.95 * s, z], scale: [0.95 * s, 0.55 * s, 0.85 * s], grad: ['#2f6b45', '#5c9a55', -0.7, 0.9] });
    B.add(CANOPY[(i + 2) % 4], { pos: [x + 0.5 * s, y + 0.75 * s, z + 0.3 * s], scale: [0.6 * s, 0.4 * s, 0.55 * s], grad: ['#2f6b45', '#66a35a', -0.7, 0.9] });
  }
}

/** Palms and trees → one sway mesh per sector; bushes and rocks → the given static sector batches. */
export function buildFlora(plan, stat) {
  const palms = sectorBatches(true), material = swayMaterial('tree');
  for (const p of plan.palms) addPalm(palms.pick(p.x, p.z), p.x, p.z, p);
  for (const t of plan.trees) addTree(palms.pick(t.x, t.z), t.x, t.z, t);
  for (const b of plan.bushes) addBush(stat.pick(b.x, b.z), b, false);
  for (const b of plan.blooms) addBush(stat.pick(b.x, b.z), b, true);
  for (const r of plan.rocks) addRock(stat.pick(r.x, r.z), r);
  return palms.list.filter((b) => b.count).map((b, i) => { const m = new THREE.Mesh(b.build(), material); m.name = 'palms:' + i; return m; });
}
