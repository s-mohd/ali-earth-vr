// Challenge hall: a semicircular arcade of pointed arches (geometric tiles, Bahraini crenellations) behind the stage, whose
// three middle bays are closed by a calm teal niche wall (the backdrop of the question board), bunting in the five station
// hues, the title sign over the gate, and near props (stage dais, podium with a cup, majlis benches).
import { THREE, PAL, vcMat } from '../core/kit.js';
import { STATIONS } from '../game/content.js';
import { Batch, toWorld, zoneYaw } from './env_util.js';
import { SIGN_RECT, HALL_CELL, addFlag } from './env_marks.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const ARC = { cx: 0, cz: -3.2, r: 6.6, bays: 11, step: (20 * Math.PI) / 180 };
const Y0 = 2.25, RISE = 1.0, TOP = 3.6, DEPTH = 0.42, PILLAR = 0.36;
const BUNT = STATIONS.map((st) => st.color); // the one place where all five concepts meet
/** Bays closed by a calm niche wall: they stand right behind the question board. */
const CALM = new Set([4, 5, 6]);

/** hall-local (x, y, z) → world position */
const HY = zoneYaw('hall');
const W = (x, y, z) => { const [wx, wz] = toWorld('hall', x, z); return [wx, y, wz]; };

/** Angle of pillar k (0..bays) around the arcade centre, and a point on the arc (hall-local x, z). */
const pillarAng = (k) => -((ARC.bays * ARC.step) / 2) + k * ARC.step;
const onArc = (a, r = ARC.r) => [ARC.cx + Math.sin(a) * r, ARC.cz - Math.cos(a) * r];

function archPts(a, y0, rise, n = 7) { // left springing → apex → right springing
  const pts = [];
  const curve = (t) => { const u = 1 - t; return [-a * (u * u * u) - a * 3 * u * u * t - 0.35 * a * 3 * u * t * t, y0 + rise * (3 * u * t * t * 0.85 + 3 * u * u * t * 0.55 + t * t * t)]; };
  for (let i = 0; i <= n; i++) pts.push(curve(i / n));
  for (let i = n - 1; i >= 0; i--) { const [x, y] = curve(i / n); pts.push([-x, y]); }
  return pts;
}

function bayGeometries(chord, tall) {
  const half = chord / 2, a = half - PILLAR / 2, rise = tall ? RISE + 0.35 : RISE, top = tall ? TOP + 0.4 : TOP;
  const inner = archPts(a, Y0, rise);
  const wall = new THREE.Shape();
  wall.moveTo(-half, Y0); for (const [x, y] of inner) wall.lineTo(x, y); wall.lineTo(half, Y0); wall.lineTo(half, top); wall.lineTo(-half, top); wall.closePath();
  const wallGeo = new THREE.ExtrudeGeometry(wall, { depth: DEPTH, bevelEnabled: false }).translate(0, 0, -DEPTH / 2);
  const outer = archPts(a + 0.13, Y0, rise + 0.13);
  const band = new THREE.Shape();
  band.moveTo(...inner[0]); for (const p of inner) band.lineTo(...p); for (let i = outer.length - 1; i >= 0; i--) band.lineTo(...outer[i]); band.closePath();
  const bandGeo = new THREE.ShapeGeometry(band).translate(0, 0, DEPTH / 2 + 0.012);
  // the opening as a flat panel (a calm niche wall set into the back of the arch)
  const hole = new THREE.Shape();
  hole.moveTo(-a, 0); for (const [x, y] of inner) hole.lineTo(x, y); hole.lineTo(a, 0); hole.closePath();
  const nicheGeo = new THREE.ShapeGeometry(hole, 6).translate(0, 0, -DEPTH / 2 + 0.06);
  return { wallGeo, bandGeo, nicheGeo, top, rise };
}

function starGeo(r, n = 8, inner = 0.62) {
  const s = new THREE.Shape();
  for (let k = 0; k < n * 2; k++) { const a = (k / (n * 2)) * Math.PI * 2, rr = k % 2 ? r * inner : r; k ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return new THREE.ShapeGeometry(s);
}

/** Arcade + hall flag pole → the arcade batch (world coords, self-lit material); bunting + sign → cloth batch. */
export function addHallArcade(stat, cloth) {
  const chord = 2 * ARC.r * Math.sin(ARC.step / 2), mid = Math.floor(ARC.bays / 2);
  const plain = bayGeometries(chord, false), gate = bayGeometries(chord, true), star = starGeo(0.17), smallStar = starGeo(0.1, 8, 0.6);
  for (let i = 0; i < ARC.bays; i++) {
    const a = pillarAng(i) + ARC.step / 2, [bx, bz] = onArc(a, ARC.r * Math.cos(ARC.step / 2)), yaw = -a, g = i === mid ? gate : plain;
    const P = (lx, ly, lz) => W(bx + lx * Math.cos(yaw) + lz * Math.sin(yaw), ly, bz - lx * Math.sin(yaw) + lz * Math.cos(yaw));
    const R = [0, HY + yaw, 0];
    stat.add(g.wallGeo, { pos: P(0, 0, 0), rot: R, grad: ['#fff1d8', '#fffaf0', Y0, g.top] });
    stat.add(g.bandGeo, { pos: P(0, 0, 0), rot: R, color: i % 2 ? PAL.teal : '#3a9fc2' });
    if (CALM.has(i)) stat.add(g.nicheGeo, { pos: P(0, 0, 0), rot: R, grad: ['#5b9f9f', '#8cc3bc', 0, Y0 + g.rise] });
    stat.add(BOX, { pos: P(0, g.top - 0.2, DEPTH / 2 + 0.03), rot: R, scale: [chord, 0.14, 0.05], color: i % 2 ? PAL.coral : PAL.orange });
    for (const sx of [-1, 1]) stat.add(star, { pos: P(sx * chord * 0.33, Y0 + g.rise * 0.55, DEPTH / 2 + 0.02), rot: R, color: i % 2 ? PAL.sun : PAL.coral });
    stat.add(smallStar, { pos: P(0, g.top - 0.42 + (i === mid ? 0.05 : 0), DEPTH / 2 + 0.02), rot: R, color: PAL.lav });
    // merlons on top
    for (let m = 0; m < 4; m++) {
      const lx = -chord / 2 + chord * ((m + 0.5) / 4);
      stat.add(BOX, { pos: P(lx, g.top + 0.14, 0), rot: R, scale: [0.26, 0.28, DEPTH], color: '#fbf1df' });
      stat.add(BOX, { pos: P(lx, g.top + 0.33, 0), rot: R, scale: [0.12, 0.12, DEPTH * 0.6], color: '#fbf1df' });
    }
  }
  // pillars with base and capital
  for (let k = 0; k <= ARC.bays; k++) {
    const a = pillarAng(k), [px, pz] = onArc(a), R = [0, HY - a, 0], h = Y0;
    stat.add(BOX, { pos: W(px, h / 2, pz), rot: R, scale: [PILLAR, h, DEPTH], grad: ['#f2dfbd', '#fffaf0'] });
    stat.add(BOX, { pos: W(px, 0.12, pz), rot: R, scale: [PILLAR + 0.12, 0.24, DEPTH + 0.12], color: '#e2c9a0' });
    stat.add(BOX, { pos: W(px, h - 0.06, pz), rot: R, scale: [PILLAR + 0.1, 0.12, DEPTH + 0.1], color: PAL.teal });
  }
  // the title sign over the gate, on a wooden frame
  const ga = pillarAng(mid) + ARC.step / 2, [gx, gz] = onArc(ga, ARC.r * Math.cos(ARC.step / 2) - 0.12), sy = gate.top + 0.85;
  stat.add(BOX, { pos: W(gx, sy, gz - 0.05), rot: [0, HY, 0], scale: [4.6, 0.84, 0.08], color: '#a8743f' });
  cloth.add(new THREE.PlaneGeometry(4.44, 0.685), { pos: W(gx, sy, gz), rot: [0, HY, 0], uvRect: SIGN_RECT, color: '#ffffff', sway: 0 });
  for (const sx of [-1.8, 1.8]) stat.add(BOX, { pos: W(gx + sx, gate.top + 0.3, gz - 0.05), rot: [0, HY, 0], scale: [0.09, 0.5, 0.09], color: '#a8743f' });
  // the hall's landmark flag rises from the sign (seen from the hub over the palms)
  addFlag(stat, cloth, 'hall', gx, gz - 0.12, sy + 0.38, 2.3, HALL_CELL, { pedestal: false });
  // bunting in the five station hues: garlands along the top of the arcade (none over the gate behind the board)
  let flagN = 0;
  const garland = (a, b, sag, n) => {
    for (let s = 0; s < n; s++) {
      const t0 = s / n, t1 = (s + 1) / n;
      const pt = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
      const p0 = pt(t0), p1 = pt(t1), cord = 0.02;
      cloth.tri(p0, p1, [p1[0], p1[1] - cord, p1[2]], ['#fff7e8']);
      cloth.tri(p0, [p1[0], p1[1] - cord, p1[2]], [p0[0], p0[1] - cord, p0[2]], ['#fff7e8']);
      const m0 = pt(t0 + 0.12 / n), m1 = pt(t1 - 0.12 / n), mc = pt((t0 + t1) / 2), col = BUNT[(flagN++) % BUNT.length];
      cloth.tri(m0, [mc[0], mc[1] - 0.34, mc[2]], m1, [col], [0, 0.6, 0]);
    }
  };
  for (let k = 0; k < ARC.bays; k++) {
    if (k === mid) continue;
    const [ax, az] = onArc(pillarAng(k), ARC.r - 0.3), [bx, bz] = onArc(pillarAng(k + 1), ARC.r - 0.3);
    garland(W(ax, TOP + 0.42, az), W(bx, TOP + 0.42, bz), 0.24, 5);
  }
  // low swags across the outer bays only (festive, yet clear of the board, the easel and Ali's bubble)
  for (const [k0, k1] of [[0, 2], [9, 11]]) {
    const [ax, az] = onArc(pillarAng(k0), ARC.r - 0.32), [bx, bz] = onArc(pillarAng(k1), ARC.r - 0.32);
    garland(W(ax, Y0 - 0.02, az), W(bx, Y0 - 0.02, bz), 0.5, 9);
  }
}

/** World positions of the arcade's pillar feet (for baked contact shadows on the ground). */
export function arcadeFeet() {
  const out = [];
  for (let k = 0; k <= ARC.bays; k++) { const [px, pz] = onArc(pillarAng(k)), [x, , z] = W(px, 0, pz); out.push({ x, z, r: 0.85, k: 0.32 }); }
  return out;
}

/** A gold cup for the podium (an anchor child, hidden with the hall's near props). */
function trophy() {
  const T = new Batch(), gold = '#f2c24a', goldL = '#ffe08a';
  const cup = new THREE.LatheGeometry([[0.0, 0.0], [0.13, 0.0], [0.13, 0.03], [0.05, 0.06], [0.035, 0.16], [0.07, 0.2], [0.16, 0.28], [0.17, 0.44], [0.15, 0.44]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  T.add(cup, { grad: ['#d9a23a', goldL, 0, 0.44] });
  for (const s of [-1, 1]) T.add(new THREE.TorusGeometry(0.08, 0.018, 5, 10, Math.PI), { pos: [s * 0.17, 0.35, 0], rot: [0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2], color: gold });
  T.add(starGeo(0.07, 5, 0.45), { pos: [0, 0.33, 0.165], color: '#fff6d6' });
  const mesh = new THREE.Mesh(T.build(), vcMat({ side: THREE.DoubleSide }));
  mesh.name = 'trophy';
  return mesh;
}

/** Hall near props in hall-local coordinates; returns { mesh, anchors }. */
export function buildHallNear() {
  const B = new Batch(), anchors = {};
  const cyl = (rt, rb, h, seg = 32) => new THREE.CylinderGeometry(rt, rb, h, seg);
  // stage dais (two steps, tiled rim)
  B.add(cyl(1.95, 2.0, 0.08, 48), { pos: [0, 0.04, -4.3], color: '#c9976a' });
  B.add(cyl(1.72, 1.76, 0.1, 48), { pos: [0, 0.11, -4.3], color: '#e6c995' });
  B.add(new THREE.TorusGeometry(1.74, 0.035, 4, 48).rotateX(Math.PI / 2), { pos: [0, 0.16, -4.3], color: PAL.tealDark });
  const star = starGeo(1.0, 8, 0.75).rotateX(-Math.PI / 2), star2 = starGeo(0.66, 8, 0.72).rotateX(-Math.PI / 2);
  B.add(star, { pos: [0, 0.168, -4.3], rot: [0, Math.PI / 8, 0], color: '#3d9a92' });
  B.add(star2, { pos: [0, 0.176, -4.3], color: '#f1dcae' });
  anchors.stage = new THREE.Object3D(); anchors.stage.position.set(0, 0.16, -4.3);
  // easel: the game stands its own certificate easel here (hall.js); the world only marks the spot (foot, facing the viewer)
  anchors.easel = new THREE.Object3D();
  anchors.easel.position.set(-1.55, 0, -2.0);
  anchors.easel.rotation.y = Math.atan2(1.55, 2.0);
  // podium (right of the stage, beyond Ali): anchor = centre of its top
  const [qx, qz] = [2.5, -4.85];
  B.add(cyl(0.3, 0.36, 0.95, 8), { pos: [qx, 0.475, qz], grad: ['#e9d5b3', '#fbf1df'] });
  B.add(cyl(0.37, 0.37, 0.08, 8), { pos: [qx, 0.22, qz], color: PAL.teal });
  B.add(cyl(0.4, 0.38, 0.07, 8), { pos: [qx, 0.99, qz], color: PAL.sun });
  anchors.podium = new THREE.Object3D(); anchors.podium.position.set(qx, 1.03, qz);
  anchors.podium.add(trophy());
  // majlis benches along the arcade sides, facing the courtyard
  const bolster = cyl(0.11, 0.11, 1, 10).rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (const a of [1.2, 1.55]) {
      const ang = side * a, [bx, bz] = onArc(ang, ARC.r - 0.95), yaw = -ang;
      const P = (lx, ly, lz) => [bx + lx * Math.cos(yaw) + lz * Math.sin(yaw), ly, bz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
      B.add(BOX, { pos: P(0, 0.12, 0), rot: [0, yaw, 0], scale: [1.9, 0.24, 0.7], color: '#9a6a44' });
      B.add(BOX, { pos: P(0, 0.31, 0.02), rot: [0, yaw, 0], scale: [1.84, 0.14, 0.62], color: side > 0 ? '#d65a52' : '#3f8fb3' });
      B.add(bolster, { pos: P(0, 0.48, -0.22), rot: [0, yaw, 0], scale: [1.7, 1, 1], color: '#f2c75c' });
      for (const cx of [-0.6, 0, 0.6]) B.add(BOX, { pos: P(cx, 0.4, 0.2), rot: [0, yaw, 0], scale: [0.3, 0.05, 0.3], color: '#fff3d6' });
    }
  }
  const mesh = new THREE.Mesh(B.build(), vcMat());
  mesh.name = 'hallNear';
  mesh.add(anchors.stage, anchors.easel, anchors.podium); // anchors (and the trophy) hide with the near props
  return { mesh, anchors };
}
