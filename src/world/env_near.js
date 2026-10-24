// Near props, one merged mesh per zone (only the current zone's is shown): flowers, grass tufts, pebbles lining the
// path, and at the hub low planters and lanterns around the plaza.
import { THREE, rng, blobGeo, vcMat } from '../core/kit.js';
import { STAGE } from '../core/layout.js';
import { Batch, isClear, toWorld, toLocal, smoothGeo, PATHS, PATH_HALF } from './env_util.js';
import { heightAt, sandAt } from './env_terrain.js';

const TAU = Math.PI * 2;
const FLOWER = ['#ff9fbf', '#ffe17a', '#ffffff', '#c7b5ff', '#ffb37a', '#ff7f8f'];
const PEBBLE = blobGeo(1, { detail: 0, jitter: 0.2, seed: 9 });
const PLANT = smoothGeo(blobGeo(0.27, { detail: 1, jitter: 0.12, seed: 3 }), -0.15); // the part inside the pot is dropped

/** Flat five-petal blossom (radius 1, facing +y) with a yellow eye; one cached geometry per petal colour. */
const BLOSSOM = new Map();
function blossom(color) {
  if (BLOSSOM.has(color)) return BLOSSOM.get(color);
  const eye = new THREE.Color('#ffcf3a'), petal = new THREE.Color(color), pos = [0, 0.02, 0], col = [eye.r, eye.g, eye.b], idx = [];
  for (let k = 0; k < 15; k++) { // per petal: notch, then two rounded shoulders
    const a = ((k - (k % 3)) / 15) * TAU, notch = k % 3 === 0, off = [0, 0.3, 0.7][k % 3] * (TAU / 5), r = notch ? 0.42 : 1;
    pos.push(Math.cos(a + off) * r, 0, Math.sin(a + off) * r);
    const c = notch ? petal.clone().lerp(eye, 0.3) : petal; col.push(c.r, c.g, c.b);
  }
  for (let k = 0; k < 15; k++) idx.push(0, 1 + ((k + 1) % 15), 1 + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  BLOSSOM.set(color, g);
  return g;
}
/** A blossom at (x, y, z), tipped toward the viewer standing at (vx, vz) so it reads as a flower, not a gem. */
function addBlossom(B, x, y, z, vx, vz, size, color, tilt = 0.75) {
  B.add(blossom(color), { pos: [x, y, z], rot: [tilt, Math.atan2(vx - x, vz - z), 0, 'YXZ'], scale: size });
}

function flower(B, x, z, vx, vz, R) {
  const y = heightAt(x, z), h = 0.18 + R() * 0.2, lean = (R() - 0.5) * 0.06;
  B.tri([x - 0.012, y, z], [x + 0.012, y, z], [x + lean, y + h, z], ['#5f9e57', '#5f9e57', '#7cc46c']);
  B.tri([x, y, z - 0.012], [x, y, z + 0.012], [x + lean, y + h, z], ['#5f9e57', '#5f9e57', '#7cc46c']);
  addBlossom(B, x + lean, y + h, z, vx, vz, 0.075, FLOWER[Math.floor(R() * FLOWER.length)]);
}
/** A grass tuft: green on the meadow, sun-bleached desert grass on the sand. */
function tuft(B, x, z, R) {
  const y = heightAt(x, z), dry = sandAt(x, z) > 0.5, base = dry ? '#a99a52' : '#6fb35f', tip = dry ? '#e8d89a' : '#c3e79a';
  const n = dry ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, h = (dry ? 0.16 : 0.2) + R() * 0.22, c = Math.cos(a), s = Math.sin(a), lean = dry ? 0.55 : 0.35;
    B.tri([x - s * 0.04, y, z + c * 0.04], [x + s * 0.04, y, z - c * 0.04], [x + c * h * lean, y + h, z + s * h * lean], [base, base, tip]);
  }
}
function pebble(B, x, z, s, R) {
  B.add(PEBBLE, { pos: [x, heightAt(x, z) + s * 0.15, z], rot: [0, R() * TAU, 0], scale: [s * 1.3, s * 0.55, s], color: ['#e6dccb', '#d4c7b2', '#efe6d6'][Math.floor(R() * 3)], flat: true });
}

/** Low terracotta planter with a round bush and blossoms facing the plaza centre (where the viewer stands). */
function planter(B, x, z, R) {
  B.add(new THREE.CylinderGeometry(0.3, 0.22, 0.3, 10), { pos: [x, 0.15, z], grad: ['#b9694a', '#d9875e'] });
  B.add(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 10), { pos: [x, 0.31, z], color: '#e8a070' });
  B.add(PLANT, { pos: [x, 0.44, z], scale: [1, 0.72, 1], grad: ['#4f9a55', '#a6dc84'] });
  const toC = Math.atan2(-z, -x);
  for (let i = 0; i < 7; i++) { // on the bush's surface (an ellipsoid 0.27 × 0.19 m around y = 0.44), on the plaza side
    const a = toC + (i - 3) * 0.48 + (R() - 0.5) * 0.2, up = 0.15 + R() * 0.8, h = 0.27 * Math.cos(up) * 1.1;
    addBlossom(B, x + Math.cos(a) * h, 0.44 + 0.2 * Math.sin(up) * 1.1, z + Math.sin(a) * h, 0, 0, 0.07, FLOWER[i % FLOWER.length], 1.3 - up * 0.7);
  }
}
/** Low standing lantern (fanous): wooden post, brass cap and ring, warm pale glass. */
function lantern(B, x, z) {
  B.add(new THREE.CylinderGeometry(0.11, 0.14, 0.08, 6), { pos: [x, 0.04, z], color: '#8a6a3f' });
  B.add(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 6), { pos: [x, 0.25, z], color: '#8a6a3f' });
  B.add(new THREE.CylinderGeometry(0.095, 0.1, 0.03, 6), { pos: [x, 0.42, z], color: '#c9a24a' });
  B.add(new THREE.CylinderGeometry(0.085, 0.065, 0.2, 6), { pos: [x, 0.53, z], color: '#fff6cf' });
  B.add(new THREE.ConeGeometry(0.11, 0.12, 6), { pos: [x, 0.69, z], color: '#c9a24a' });
  B.add(new THREE.OctahedronGeometry(0.025, 0), { pos: [x, 0.77, z], color: '#c9a24a' });
}

/** Hub planter spots (world x, z): the plaza's six planters, between the paths. */
export const HUB_PLANTERS = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * TAU - Math.PI / 2 + Math.PI / 6; return [Math.cos(a) * 3.55, Math.sin(a) * 3.55, a]; });

export function buildNear(key) {
  const R = rng(key.length * 131 + key.charCodeAt(0)), B = new Batch();
  const [ox, oz] = toWorld(key, 0, 0);
  // flowers & tufts scattered around the zone
  let nf = 0, nt = 0;
  for (let tries = 0; tries < 1500 && (nf < 55 || nt < 90); tries++) {
    const a = R() * TAU, r = (key === 'hub' ? 3.4 : 1.9) + Math.sqrt(R()) * 8, x = ox + Math.cos(a) * r, z = oz + Math.sin(a) * r;
    if (!isClear(x, z, 'low')) continue;
    if (key !== 'hub' && key !== 'hall') { const [lx, lz] = toLocal(key, x, z); if (Math.hypot(lx, lz - STAGE.z) < 3.5) continue; }
    if (nf < 55 && R() < 0.45 && sandAt(x, z) < 0.6) { flower(B, x, z, ox, oz, R); nf++; } else if (nt < 90) { tuft(B, x, z, R); nt++; }
  }
  // pebbles lining the last metres of the path into the zone
  const p = PATHS.find((q) => q.key === key) || null;
  const lines = p && key !== 'hub' ? [{ q: p, from: -6, to: -1.2 }] : [];
  for (const { q, from, to } of lines) {
    const len = Math.hypot(q.bx - q.ax, q.bz - q.az), dx = (q.bx - q.ax) / len, dz = (q.bz - q.az) / len;
    for (let d = from; d < to; d += 0.42 + R() * 0.2) {
      const t = d >= 0 ? d : len + d;
      for (const sg of [-1, 1]) pebble(B, q.ax + dx * t - dz * sg * (PATH_HALF + 0.08), q.az + dz * t + dx * sg * (PATH_HALF + 0.08), 0.05 + R() * 0.04, R);
    }
  }
  if (key === 'hub') {
    for (const [px, pz, a] of HUB_PLANTERS) {
      planter(B, px, pz, R);
      for (const s of [-1, 1]) { const b = a + s * 0.24; lantern(B, Math.cos(b) * 3.35, Math.sin(b) * 3.35); }
    }
  }
  const mesh = new THREE.Mesh(B.build(), vcMat({ side: THREE.DoubleSide }));
  mesh.name = 'near:' + key;
  return mesh;
}
