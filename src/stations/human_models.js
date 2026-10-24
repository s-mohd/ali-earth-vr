// Station 5 models: the excavator (articulated), dump truck, road roller, car, workers, a new Bahraini house,
// road furniture and plants. Toy-like but believable: rounded bodies, readable joints, real tracks.
import { THREE, PAL, mergeParts, roundedBox, blobGeo, basic, vcMat, clamp } from '../core/kit.js';

export const cyl = (r, h, s = 14, r2 = r) => new THREE.CylinderGeometry(r, r2, h, s);
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const ball = (r, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
export const AX_Z = [Math.PI / 2, 0, 0]; // cylinder axis along Z (wheels, pins)
export const AX_X = [0, 0, Math.PI / 2]; // cylinder axis along X

export const SKIN = '#c98d62', VEST = '#ff8c3a', STRIPE = '#fff3a0', SHIRT = '#4f7fc4', TROUSERS = '#3d5a8a';
const DARK = '#3b4048', STEEL = '#aab2bc', CHROME = '#e8ecf0', TRACK = '#3a3f47', SHOE = '#2c3037';

/** darken a geometry's vertex colours toward the ground (cheap baked AO): factor k at y0, none above y1 */
export function groundAO(geo, y0, y1, k = 0.25) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const u = clamp((p.getY(i) - y0) / (y1 - y0));
    const f = 1 - k * (1 - u * u * (3 - 2 * u));
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return geo;
}

/** white hard hat (dome + brim) whose rim sits at y */
export const hatParts = (x, y, z, r) => [
  { geo: new THREE.SphereGeometry(r, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), color: '#ffffff', pos: [x, y, z] },
  { geo: cyl(r * 1.22, r * 0.16, 12), color: '#ffffff', pos: [x, y + 0.002, z] },
];
/** small round bush (three leafy lobes) with a few flowers */
export function bushParts(x, y, z, sc, seed, flowers = true) {
  const p = [
    { geo: blobGeo(0.22 * sc, { detail: 1, seed, squash: 0.8, jitter: 0.16 }), color: PAL.leafDark, pos: [x, y + 0.13 * sc, z] },
    { geo: blobGeo(0.16 * sc, { detail: 1, seed: seed + 1, squash: 0.85 }), color: PAL.leaf, pos: [x + 0.12 * sc, y + 0.2 * sc, z + 0.06 * sc] },
    { geo: blobGeo(0.13 * sc, { detail: 1, seed: seed + 2, squash: 0.85 }), color: PAL.leafLight, pos: [x - 0.1 * sc, y + 0.22 * sc, z + 0.08 * sc] },
  ];
  if (flowers) for (let i = 0; i < 3; i++) p.push({ geo: ball(0.024 * sc, 5, 3), color: i % 2 ? '#ffd164' : '#f7a1b5', pos: [x + Math.sin(seed + i * 2.1) * 0.17 * sc, y + 0.26 * sc + i * 0.02, z + 0.12 * sc + Math.cos(seed + i * 2.1) * 0.06] });
  return p;
}
/** a little clump of grass blades */
export function tuftParts(x, y, z, seed, sc = 1) {
  const p = [];
  for (let i = 0; i < 4; i++) {
    const a = seed * 1.7 + i * 1.6;
    p.push({ geo: new THREE.CylinderGeometry(0.0, 0.013 * sc, (0.09 + (i % 2) * 0.035) * sc, 4, 1, true), color: [PAL.grassDark, PAL.leaf, '#9bcf6f', PAL.leafDark][i], pos: [x + Math.cos(a) * 0.022 * sc, y + 0.045 * sc, z + Math.sin(a) * 0.022 * sc], rot: [Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32] });
  }
  return p;
}
/** a desert rock: faceted, with a lighter top */
export function rockGeo(r, seed, squash = 0.62) {
  const g = mergeParts([{ geo: blobGeo(r, { detail: 1, seed, squash, jitter: 0.3 }), color: '#ffffff' }]);
  const p = g.attributes.position, c = g.attributes.color, n = g.attributes.normal;
  const lo = new THREE.Color(seed % 2 ? '#b3a391' : '#bea88c'), hi = new THREE.Color(seed % 2 ? '#d8cbb9' : '#e2cfb2'), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) { t.copy(lo).lerp(hi, clamp(0.5 + n.getY(i) * 0.6)); c.setXYZ(i, t.r, t.g, t.b); }
  return g;
}

// ================================================================ excavator (+X = forward of base and turret)
export const EX = { S: 1.16, TURRET_Y: 0.26, PIVOT: { x: 0.27, y: 0.2, z: 0.06 }, L1: 0.86, L2: 0.66, BUCKET_R: 0.12, BUCKET_W: 0.27 };
const BOOM_C = [0.4, 0.36]; // bezier control of the bent boom (pivot → knee → tip)
const boomAt = (u) => [2 * u * (1 - u) * BOOM_C[0] + u * u * EX.L1, 2 * u * (1 - u) * BOOM_C[1]];
// ram anchors: boom ram (turret → boom underside), stick ram (boom top → stick lever)
export const RAM = { boomBase: [EX.PIVOT.x + 0.13, 0.07], boomEnd: [0.37, 0.09], stickBase: [0.27, 0.25], stickEnd: [-0.13, 0.11] };

function stadium(len, r) {
  const s = new THREE.Shape(), a = len / 2 - r;
  s.moveTo(-a, -r); s.lineTo(a, -r); s.absarc(a, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-a, r); s.absarc(-a, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}
function stadiumPoint(u, len, r) {
  const a = len / 2 - r, P = 4 * a + 2 * Math.PI * r;
  let d = (((u % 1) + 1) % 1) * P;
  if (d < 2 * a) return [-a + d, -r, 0, -1];
  d -= 2 * a;
  if (d < Math.PI * r) { const th = -Math.PI / 2 + d / r; return [a + Math.cos(th) * r, Math.sin(th) * r, Math.cos(th), Math.sin(th)]; }
  d -= Math.PI * r;
  if (d < 2 * a) return [a - d, r, 0, 1];
  d -= 2 * a;
  const th = Math.PI / 2 + d / r;
  return [-a + Math.cos(th) * r, Math.sin(th) * r, Math.cos(th), Math.sin(th)];
}
/** extruded profile in the X-Y plane, centred on z = 0, with rounded (bevelled) edges */
function extrude(shape, depth, bevel = 0.012, curve = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** a closed outline from a spine (array of [x,y]) and a half-thickness per point */
function ribbonShape(pts, half) {
  const up = [], dn = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    up.push(new THREE.Vector2(pts[i][0] - ty * half[i], pts[i][1] + tx * half[i]));
    dn.push(new THREE.Vector2(pts[i][0] + ty * half[i], pts[i][1] - tx * half[i]));
  }
  return new THREE.Shape([...up, ...dn.reverse()]);
}

export function buildExcavator() {
  const Y = PAL.machine, YD = PAL.machineDark;
  const base = new THREE.Group();
  base.scale.setScalar(EX.S);
  // ---- undercarriage: two track loops with shoes, idler, sprocket and rollers; car body and slewing ring
  const TR = 0.085, TL = 1.02, TY = 0.118, TW = 0.15;
  const loop = extrude(stadium(TL, TR), TW, 0.012, 7);
  const bp = [];
  for (const s of [-1, 1]) {
    const z = s * 0.27, zo = s * (0.27 + TW / 2 + 0.012);
    bp.push({ geo: loop, color: TRACK, pos: [0, TY, z] });
    for (let i = 0; i < 26; i++) {
      const [x, y, nx, ny] = stadiumPoint(i / 26, TL + 0.044, TR + 0.022);
      bp.push({ geo: box(0.05, 0.022, TW + 0.03), color: SHOE, pos: [x, TY + y, z], rot: [0, 0, Math.atan2(ny, nx) - Math.PI / 2] });
    }
    // side frame between the runs, rollers below, idler (front) and toothed sprocket (back)
    bp.push({ geo: roundedBox(0.62, 0.075, 0.02, 0.01, 1), color: YD, pos: [0, TY + 0.012, zo] });
    for (const x of [-0.2, 0, 0.2]) bp.push({ geo: cyl(0.034, 0.022, 8), color: STEEL, pos: [x, TY - 0.045, zo], rot: AX_Z });
    bp.push({ geo: cyl(0.07, 0.024, 16), color: Y, pos: [TL / 2 - TR, TY, zo], rot: AX_Z });
    bp.push({ geo: cyl(0.03, 0.03, 10), color: STEEL, pos: [TL / 2 - TR, TY, zo + s * 0.004], rot: AX_Z });
    bp.push({ geo: cyl(0.068, 0.024, 8), color: YD, pos: [-(TL / 2 - TR), TY, zo], rot: AX_Z });
    bp.push({ geo: cyl(0.03, 0.03, 10), color: DARK, pos: [-(TL / 2 - TR), TY, zo + s * 0.004], rot: AX_Z });
  }
  bp.push({ geo: box(0.6, 0.1, 0.36), color: DARK, pos: [0, 0.14, 0] });
  bp.push({ geo: cyl(0.26, 0.05, 24), color: PAL.metal, pos: [0, 0.232, 0] });
  base.add(new THREE.Mesh(mergeParts(bp), vcMat()));

  // ---- upper structure
  const turret = new THREE.Group();
  turret.position.y = EX.TURRET_Y;
  base.add(turret);
  const tp = [];
  tp.push({ geo: roundedBox(0.96, 0.09, 0.72, 0.03, 1), color: YD, pos: [-0.06, 0.045, 0] });
  tp.push({ geo: roundedBox(0.4, 0.25, 0.68, 0.07, 2), color: Y, pos: [-0.27, 0.21, 0.01] });
  for (let i = 0; i < 4; i++) tp.push({ geo: box(0.25, 0.012, 0.03), color: DARK, pos: [-0.27, 0.338, 0.06 + i * 0.065] });
  for (let i = 0; i < 3; i++) tp.push({ geo: box(0.2, 0.016, 0.012), color: DARK, pos: [-0.27, 0.15 + i * 0.04, 0.35] });
  // counterweight with black/yellow warning chevrons on its back
  tp.push({ geo: roundedBox(0.17, 0.27, 0.73, 0.075, 2), color: YD, pos: [-0.5, 0.19, 0] });
  for (let i = 0; i < 6; i++) tp.push({ geo: box(0.014, 0.022, 0.11), color: '#26292e', pos: [-0.585, 0.19, -0.27 + i * 0.108], rot: [0.75, 0, 0] });
  tp.push({ geo: cyl(0.023, 0.2, 10), color: PAL.metal, pos: [-0.34, 0.44, 0.22] });
  tp.push({ geo: cyl(0.03, 0.03, 10), color: DARK, pos: [-0.34, 0.545, 0.22] });
  // cab: yellow tub, slim pillars, tinted panes on the back and boom side, half door, sun roof, work lights
  const cx = 0.13, cz = -0.17;
  tp.push({ geo: roundedBox(0.42, 0.18, 0.35, 0.05, 2), color: Y, pos: [cx, 0.18, cz] });
  for (const [px, pz] of [[0.19, 0.155], [0.19, -0.155], [-0.19, 0.155], [-0.19, -0.155]]) tp.push({ geo: box(0.035, 0.31, 0.035), color: YD, pos: [cx + px, 0.42, cz + pz] });
  tp.push({ geo: box(0.014, 0.27, 0.28), color: PAL.window, pos: [cx - 0.19, 0.42, cz] });
  tp.push({ geo: box(0.34, 0.25, 0.014), color: PAL.window, pos: [cx, 0.42, cz + 0.155] });
  tp.push({ geo: box(0.014, 0.1, 0.28), color: PAL.window, pos: [cx + 0.19, 0.515, cz] });
  tp.push({ geo: roundedBox(0.3, 0.09, 0.02, 0.01, 1), color: Y, pos: [cx - 0.02, 0.31, cz - 0.158] });
  tp.push({ geo: roundedBox(0.47, 0.045, 0.41, 0.02, 1), color: '#fff7e8', pos: [cx, 0.595, cz] });
  for (const s of [-1, 1]) tp.push({ geo: roundedBox(0.025, 0.035, 0.05, 0.01, 1), color: '#fff3c4', pos: [cx + 0.235, 0.565, cz + s * 0.11] });
  tp.push({ geo: box(0.012, 0.055, 0.04), color: DARK, pos: [cx + 0.23, 0.4, cz - 0.2] });
  tp.push({ geo: box(0.05, 0.008, 0.008), color: DARK, pos: [cx + 0.21, 0.4, cz - 0.18] });
  // the driver: orange vest, white hard hat, hands on the levers
  tp.push({ geo: roundedBox(0.12, 0.15, 0.14, 0.045, 1), color: VEST, pos: [cx - 0.05, 0.37, cz] });
  tp.push({ geo: ball(0.058), color: SKIN, pos: [cx - 0.03, 0.5, cz] });
  tp.push(...hatParts(cx - 0.03, 0.52, cz, 0.064));
  for (const s of [-1, 1]) {
    tp.push({ geo: roundedBox(0.12, 0.035, 0.035, 0.015, 1), color: SHIRT, pos: [cx + 0.02, 0.37, cz + s * 0.075], rot: [0, 0, -0.5] });
    tp.push({ geo: cyl(0.008, 0.1, 6), color: DARK, pos: [cx + 0.09, 0.33, cz + s * 0.075], rot: [0, 0, -0.3] });
  }
  tp.push({ geo: roundedBox(0.09, 0.14, 0.16, 0.03, 1), color: DARK, pos: [cx - 0.14, 0.36, cz] });
  // boom foot bracket and its pin; boom ram bracket
  tp.push({ geo: roundedBox(0.2, 0.17, 0.2, 0.04, 1), color: YD, pos: [EX.PIVOT.x - 0.06, 0.12, EX.PIVOT.z] });
  tp.push({ geo: cyl(0.04, 0.2, 12), color: STEEL, pos: [EX.PIVOT.x, EX.PIVOT.y, EX.PIVOT.z], rot: AX_Z });
  tp.push({ geo: roundedBox(0.09, 0.07, 0.12, 0.02, 1), color: YD, pos: [RAM.boomBase[0], RAM.boomBase[1] - 0.01, EX.PIVOT.z] });
  const turretGeo = mergeParts(tp);
  turret.add(new THREE.Mesh(turretGeo, vcMat()));

  const beaconMat = basic('#ff9a2e', { unique: true });
  const beacon = new THREE.Mesh(ball(0.032, 10, 8), beaconMat);
  beacon.position.set(cx - 0.14, 0.64, cz - 0.12);
  turret.add(beacon);
  const cab = new THREE.Object3D();
  cab.position.set(cx, 0.4, cz);
  turret.add(cab);
  const pipe = new THREE.Object3D();
  pipe.position.set(-0.34, 0.57, 0.22);
  turret.add(pipe);

  // ---- boom: a smooth bent "banana" (pivot at the origin, tip at (L1, 0))
  const boom = new THREE.Group();
  boom.position.set(EX.PIVOT.x, EX.PIVOT.y, EX.PIVOT.z);
  turret.add(boom);
  const spine = [], half = [];
  for (let i = 0; i <= 12; i++) { const u = i / 12; spine.push(boomAt(u)); half.push(0.058 + 0.012 * Math.sin(u * Math.PI) - 0.018 * u * u); }
  boom.add(new THREE.Mesh(mergeParts([
    { geo: extrude(ribbonShape(spine, half), 0.1, 0.014, 4), color: Y },
    { geo: cyl(0.032, 0.16, 12), color: STEEL, pos: [EX.L1, 0, 0], rot: AX_Z },
    { geo: roundedBox(0.07, 0.05, 0.08, 0.015, 1), color: YD, pos: [RAM.stickBase[0], RAM.stickBase[1] - 0.02, 0] },
    { geo: cyl(0.018, 0.1, 8), color: STEEL, pos: [RAM.stickBase[0], RAM.stickBase[1], 0], rot: AX_Z },
    { geo: cyl(0.02, 0.135, 8), color: STEEL, pos: [RAM.boomEnd[0], RAM.boomEnd[1], 0], rot: AX_Z },
  ]), vcMat()));

  // ---- stick: tapered arm with a lever at the back (for its ram)
  const stick = new THREE.Group();
  stick.position.set(EX.L1, 0, 0);
  boom.add(stick);
  const stickShape = new THREE.Shape([[-0.16, 0.125], [-0.1, 0.13], [0.0, 0.06], [0.25, 0.04], [EX.L2 + 0.02, 0.028], [EX.L2 + 0.02, -0.03], [0.25, -0.042], [0.0, -0.055], [-0.08, -0.02], [-0.18, 0.09]].map(([x, y]) => new THREE.Vector2(x, y)));
  stick.add(new THREE.Mesh(mergeParts([
    { geo: extrude(stickShape, 0.075, 0.012, 2), color: Y },
    { geo: cyl(0.028, 0.13, 10), color: STEEL, pos: [EX.L2, 0, 0], rot: AX_Z },
    { geo: cyl(0.02, 0.11, 8), color: STEEL, pos: [RAM.stickEnd[0], RAM.stickEnd[1], 0], rot: AX_Z },
  ]), vcMat()));

  // ---- bucket: a "D"-shaped shell hanging from the stick tip; mouth faces local -Y, teeth at the lip
  const bucket = new THREE.Group();
  bucket.position.set(EX.L2, 0, 0);
  stick.add(bucket);
  const R = EX.BUCKET_R, BW = EX.BUCKET_W;
  const th0 = Math.PI / 2 - 0.42, thL = Math.PI + 0.42;
  const shell = new THREE.CylinderGeometry(R, R, BW, 16, 1, true, th0, thL).rotateX(Math.PI / 2);
  const inner = new THREE.CylinderGeometry(R - 0.012, R - 0.012, BW - 0.02, 16, 1, true, th0, thL).rotateX(Math.PI / 2);
  const side = new THREE.CircleGeometry(R, 16, th0 - Math.PI / 2, thL);
  const lip = [R + R * Math.sin(th0), -R * Math.cos(th0)];
  const bk = [
    { geo: shell, color: YD, pos: [R, 0, 0] },
    { geo: inner, color: '#4d535c', pos: [R, 0, 0] },
    { geo: side, color: Y, pos: [R, 0, BW / 2] },
    { geo: side, color: Y, pos: [R, 0, -BW / 2] },
    { geo: roundedBox(0.07, 0.06, 0.15, 0.015, 1), color: YD, pos: [0.0, 0.02, 0] },
    { geo: box(0.06, 0.012, BW + 0.01), color: '#c7ccd2', pos: [lip[0] - 0.01, lip[1] + 0.004, 0], rot: [0, 0, -0.42] },
  ];
  const toothDir = Math.atan2(-Math.sin(th0), -Math.cos(th0));
  for (let i = 0; i < 5; i++) bk.push({ geo: cyl(0.0, 0.05, 6, 0.017), color: '#dfe3e8', pos: [lip[0] + Math.cos(toothDir) * 0.02, lip[1] + Math.sin(toothDir) * 0.02, -0.11 + i * 0.055], rot: [0, 0, toothDir - Math.PI / 2] });
  bucket.add(new THREE.Mesh(mergeParts(bk), vcMat({ side: THREE.DoubleSide })));
  const soil = new THREE.Mesh(mergeParts([
    { geo: blobGeo(0.1, { detail: 1, seed: 5, squash: 0.75, jitter: 0.25 }), color: PAL.soil, scale: [1.05, 0.9, 1.15] },
    { geo: blobGeo(0.045, { detail: 1, seed: 6, squash: 0.7, jitter: 0.3 }), color: '#bfb09e', pos: [0.02, -0.05, 0.05] },
  ]), vcMat());
  soil.position.set(R * 0.95, -0.05, 0);
  bucket.add(soil);

  // hydraulic rams: unit length along +X (barrel + chrome rod + eyes), re-aimed every pose
  const ramGeo = mergeParts([
    { geo: cyl(0.032, 0.56, 12), color: '#30353c', pos: [0.28, 0, 0], rot: AX_X },
    { geo: cyl(0.036, 0.06, 12), color: '#4a5059', pos: [0.53, 0, 0], rot: AX_X },
    { geo: cyl(0.016, 0.46, 8), color: CHROME, pos: [0.76, 0, 0], rot: AX_X },
  ]);
  const boomRam = new THREE.Mesh(ramGeo, vcMat());
  boomRam.position.set(RAM.boomBase[0], RAM.boomBase[1], EX.PIVOT.z);
  turret.add(boomRam);
  const stickRam = new THREE.Mesh(ramGeo, vcMat());
  stickRam.position.set(RAM.stickBase[0], RAM.stickBase[1], 0);
  boom.add(stickRam);

  return { base, turret, boom, stick, bucket, soil, beaconMat, boomRam, stickRam, cab, pipe };
}

/** two-link IK in the turret's arm plane: wrist at horizontal reach rho and height y (station metres) */
export function poseArm(ex, yaw, rho, y, phi) {
  const { S, PIVOT, L1, L2 } = EX;
  ex.turret.rotation.y = yaw;
  const d = rho / S - PIVOT.x, h = y / S - EX.TURRET_Y - PIVOT.y;
  const D = clamp(Math.hypot(d, h), L1 - L2 + 0.05, L1 + L2 - 0.004);
  const b = Math.acos(clamp((D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
  const q1 = Math.atan2(h, d) + Math.atan2(L2 * Math.sin(b), L1 + L2 * Math.cos(b)), q2 = -b;
  ex.boom.rotation.z = q1;
  ex.stick.rotation.z = q2;
  ex.bucket.rotation.z = phi - q1 - q2;
  const c1 = Math.cos(q1), s1 = Math.sin(q1), [bx, by] = RAM.boomEnd;
  aimRam(ex.boomRam, PIVOT.x + c1 * bx - s1 * by, PIVOT.y + s1 * bx + c1 * by);
  const c2 = Math.cos(q2), s2 = Math.sin(q2), [sx, sy] = RAM.stickEnd;
  aimRam(ex.stickRam, L1 + c2 * sx - s2 * sy, s2 * sx + c2 * sy);
}
function aimRam(ram, x, y) {
  const dx = x - ram.position.x, dy = y - ram.position.y;
  ram.rotation.z = Math.atan2(dy, dx);
  ram.scale.x = Math.hypot(dx, dy);
}

// ================================================================ dump truck (+X = back; cab faces -X)
export const TRUCK_BED = { x: 0.17, top: 0.44 };
export function buildTruck(loadColor) {
  const g = new THREE.Group();
  const C = '#e8623e', CD = '#c44a2c', BED = '#9aa6b4', BEDD = '#7f8b99';
  const p = [
    { geo: box(0.98, 0.06, 0.26), color: DARK, pos: [0.02, 0.15, 0] },
    // cab
    { geo: roundedBox(0.32, 0.31, 0.46, 0.06, 2), color: C, pos: [-0.33, 0.335, 0] },
    { geo: box(0.325, 0.03, 0.465), color: '#ffffff', pos: [-0.33, 0.275, 0] },
    { geo: roundedBox(0.03, 0.135, 0.38, 0.012, 1), color: PAL.window, pos: [-0.483, 0.405, 0] },
    { geo: box(0.15, 0.12, 0.468), color: PAL.window, pos: [-0.36, 0.41, 0] },
    { geo: roundedBox(0.1, 0.028, 0.44, 0.012, 1), color: CD, pos: [-0.47, 0.49, 0] },
    { geo: roundedBox(0.03, 0.1, 0.27, 0.01, 1), color: '#2f3339', pos: [-0.49, 0.24, 0] },
    { geo: roundedBox(0.07, 0.05, 0.47, 0.02, 1), color: '#e9edf1', pos: [-0.5, 0.17, 0] },
    { geo: box(0.08, 0.016, 0.25), color: '#3b4048', pos: [-0.41, 0.14, 0] },
  ];
  for (let i = 0; i < 3; i++) p.push({ geo: box(0.01, 0.012, 0.25), color: '#c9ced4', pos: [-0.506, 0.21 + i * 0.03, 0] });
  for (const s of [-1, 1]) {
    p.push({ geo: roundedBox(0.03, 0.04, 0.06, 0.01, 1), color: '#fff3c4', pos: [-0.5, 0.24, s * 0.18] });
    p.push({ geo: box(0.012, 0.012, 0.08), color: DARK, pos: [-0.44, 0.44, s * 0.265] });
    p.push({ geo: roundedBox(0.02, 0.07, 0.035, 0.008, 1), color: DARK, pos: [-0.44, 0.42, s * 0.31] });
    p.push({ geo: box(0.07, 0.015, 0.05), color: '#c9ced4', pos: [-0.36, 0.17, s * 0.235] });
    p.push({ geo: cyl(0.045, 0.14, 10), color: '#c9ced4', pos: [-0.08, 0.13, s * 0.14], rot: AX_X });
  }
  p.push({ geo: cyl(0.018, 0.26, 8), color: PAL.metal, pos: [-0.155, 0.42, -0.19] });
  // tipper bed with ribs, a cab protector and a tailgate
  p.push(
    { geo: box(0.64, 0.04, 0.48), color: BEDD, pos: [0.17, 0.22, 0] },
    { geo: box(0.04, 0.3, 0.48), color: CD, pos: [-0.14, 0.37, 0] },
    { geo: roundedBox(0.12, 0.025, 0.48, 0.01, 1), color: CD, pos: [-0.2, 0.51, 0] },
    { geo: box(0.04, 0.22, 0.5), color: BED, pos: [0.47, 0.33, 0] },
    { geo: box(0.64, 0.2, 0.035), color: BED, pos: [0.17, 0.32, 0.225] },
    { geo: box(0.64, 0.2, 0.035), color: BED, pos: [0.17, 0.32, -0.225] },
    { geo: box(0.66, 0.025, 0.05), color: BEDD, pos: [0.17, 0.425, 0.225] },
    { geo: box(0.66, 0.025, 0.05), color: BEDD, pos: [0.17, 0.425, -0.225] },
  );
  for (const x of [-0.04, 0.17, 0.38]) for (const s of [-1, 1]) p.push({ geo: box(0.025, 0.2, 0.05), color: BEDD, pos: [x, 0.32, s * 0.232] });
  for (const x of [-0.31, 0.13, 0.35]) for (const s of [-1, 1]) {
    p.push({ geo: cyl(0.1, 0.085, 14), color: '#2f3339', pos: [x, 0.1, s * 0.2], rot: AX_Z });
    p.push({ geo: cyl(0.052, 0.09, 10), color: '#d9dde3', pos: [x, 0.1, s * 0.2], rot: AX_Z });
    p.push({ geo: cyl(0.022, 0.095, 6), color: '#8a929d', pos: [x, 0.1, s * 0.2], rot: AX_Z });
  }
  for (const s of [-1, 1]) p.push({ geo: box(0.5, 0.015, 0.11), color: '#2f3339', pos: [0.24, 0.205, s * 0.2] });
  const body = mergeParts(p);
  groundAO(body, 0.0, 0.2, 0.2);
  g.add(new THREE.Mesh(body, vcMat()));
  // the load: a heap of the hills' soil and rocks (grows with every dump and crests above the rim)
  const load = new THREE.Mesh(mergeParts([
    { geo: blobGeo(0.3, { detail: 2, seed: 21, squash: 0.62, jitter: 0.2 }), color: PAL.soil, scale: [1.0, 1, 0.7] },
    { geo: blobGeo(0.13, { detail: 1, seed: 23, squash: 0.7 }), color: loadColor || '#c99a68', pos: [-0.08, 0.13, 0.03] },
    { geo: blobGeo(0.1, { detail: 1, seed: 25, squash: 0.7 }), color: PAL.soilDark, pos: [0.12, 0.09, -0.05] },
    { geo: rockGeo(0.075, 27, 0.7), pos: [0.07, 0.15, 0.06] },
    { geo: rockGeo(0.055, 28, 0.7), pos: [-0.16, 0.08, -0.08] },
  ]), vcMat());
  load.position.set(TRUCK_BED.x, 0.3, 0);
  g.add(load);
  return { group: g, load };
}

// ================================================================ road roller (+X = back; it drives toward -X)
export function buildRoller() {
  const Y = PAL.machine, YD = PAL.machineDark;
  const p = [
    { geo: cyl(0.1, 0.28, 20), color: '#a3abb5', pos: [-0.2, 0.1, 0], rot: AX_Z },
    { geo: cyl(0.06, 0.29, 12), color: '#7d8590', pos: [-0.2, 0.1, 0], rot: AX_Z },
    { geo: roundedBox(0.24, 0.035, 0.33, 0.012, 1), color: YD, pos: [-0.2, 0.215, 0] },
    { geo: box(0.06, 0.13, 0.3), color: YD, pos: [-0.1, 0.17, 0] },
    { geo: roundedBox(0.3, 0.15, 0.26, 0.045, 1), color: Y, pos: [0.07, 0.175, 0] },
    { geo: box(0.31, 0.02, 0.27), color: YD, pos: [0.07, 0.11, 0] },
    { geo: cyl(0.015, 0.1, 8), color: PAL.metal, pos: [-0.04, 0.3, 0.09] },
    { geo: roundedBox(0.09, 0.1, 0.11, 0.03, 1), color: VEST, pos: [0.12, 0.3, 0] },
    { geo: ball(0.045, 10, 7), color: SKIN, pos: [0.11, 0.39, 0] },
    ...hatParts(0.11, 0.4, 0, 0.05),
    { geo: roundedBox(0.28, 0.025, 0.28, 0.01, 1), color: '#fff7e8', pos: [0.1, 0.48, 0] },
    { geo: ball(0.022, 8, 6), color: '#ff9a2e', pos: [0.1, 0.505, 0] },
  ];
  for (const [px, pz] of [[0, 0.11], [0, -0.11], [0.2, 0.11], [0.2, -0.11]]) p.push({ geo: box(0.018, 0.22, 0.018), color: YD, pos: [px, 0.36, pz] });
  for (const s of [-1, 1]) {
    p.push({ geo: cyl(0.08, 0.06, 14), color: DARK, pos: [0.15, 0.08, s * 0.13], rot: AX_Z });
    p.push({ geo: cyl(0.035, 0.065, 8), color: '#d9dde3', pos: [0.15, 0.08, s * 0.13], rot: AX_Z });
  }
  const mesh = new THREE.Mesh(mergeParts(p), vcMat());
  const pipe = new THREE.Object3D();
  pipe.position.set(-0.04, 0.36, 0.09);
  mesh.add(pipe);
  return { mesh, pipe };
}

// ================================================================ the first car on the new road (+X = front)
export function carGeo() {
  const C = '#2fb3a3', CD = '#23897d';
  return mergeParts([
    { geo: roundedBox(0.38, 0.1, 0.2, 0.04, 2), color: C, pos: [0, 0.085, 0] },
    { geo: roundedBox(0.22, 0.09, 0.185, 0.035, 1), color: PAL.window, pos: [-0.03, 0.165, 0] },
    { geo: roundedBox(0.225, 0.025, 0.19, 0.01, 1), color: CD, pos: [-0.03, 0.213, 0] },
    { geo: box(0.02, 0.025, 0.205), color: '#ffffff', pos: [0.05, 0.12, 0] },
    { geo: ball(0.018, 8, 6), color: '#fff3c4', pos: [0.19, 0.1, 0.06] },
    { geo: ball(0.018, 8, 6), color: '#fff3c4', pos: [0.19, 0.1, -0.06] },
    { geo: box(0.012, 0.02, 0.05), color: '#ff6b5a', pos: [-0.19, 0.1, 0.07] },
    { geo: box(0.012, 0.02, 0.05), color: '#ff6b5a', pos: [-0.19, 0.1, -0.07] },
    ...[[0.115, 0.1], [0.115, -0.1], [-0.115, 0.1], [-0.115, -0.1]].flatMap(([x, z]) => [
      { geo: cyl(0.045, 0.035, 12), color: '#2f3339', pos: [x, 0.045, z], rot: AX_Z },
      { geo: cyl(0.02, 0.038, 8), color: '#e9edf1', pos: [x, 0.045, z], rot: AX_Z },
    ]),
  ]);
}

// ================================================================ a road worker (feet at the origin, faces +Z; arms are separate)
export function workerGeo(S) {
  const g = mergeParts([
    ...[-1, 1].flatMap((s) => [
      { geo: roundedBox(0.045, 0.03, 0.075, 0.01, 1), color: '#6b4f3a', pos: [s * 0.03, 0.015, 0.012] },
      { geo: cyl(0.022, 0.12, 6), color: TROUSERS, pos: [s * 0.03, 0.09, 0] },
    ]),
    { geo: cyl(0.05, 0.13, 10, 0.057), color: VEST, pos: [0, 0.2, 0] },
    { geo: new THREE.CylinderGeometry(0.0565, 0.0565, 0.016, 10, 1, true), color: STRIPE, pos: [0, 0.185, 0] },
    { geo: new THREE.CylinderGeometry(0.052, 0.052, 0.014, 10, 1, true), color: STRIPE, pos: [0, 0.225, 0] },
    { geo: ball(0.05, 10, 7), color: SKIN, pos: [0, 0.315, 0] },
    { geo: ball(0.008, 4, 3), color: '#2b2f3a', pos: [-0.018, 0.322, 0.046] },
    { geo: ball(0.008, 4, 3), color: '#2b2f3a', pos: [0.018, 0.322, 0.046] },
    { geo: box(0.022, 0.005, 0.005), color: '#8a4b3a', pos: [0, 0.3, 0.049] },
    ...hatParts(0, 0.33, 0, 0.056),
  ]);
  return g.scale(S, S, S);
}
/** one arm hanging from the shoulder pivot along -Y */
export function armGeo(S) {
  return mergeParts([
    { geo: new THREE.CylinderGeometry(0.018, 0.016, 0.11, 6, 1, true), color: SHIRT, pos: [0, -0.05, 0] },
    { geo: ball(0.02, 6, 4), color: SKIN, pos: [0, -0.112, 0] },
  ]).scale(S, S, S);
}

// ================================================================ a new two-storey Bahraini house (faces +Z, ground at y = 0)
// returns stages: [{ parts, anchor:[x,y,z] (house-local), when: 'slab'|'floor1'|'floor2'|'top'|'trim', i }]
export function houseStages() {
  const W = '#f6e7cc', WS = '#ead6b2', P = '#e3c99c', TEAL = '#2e8c8c', WOOD = '#8a5a3b', GL = '#8fd0ea';
  const w = 0.66, d = 0.5, h1 = 0.3, h2 = 0.24, w2 = 0.36, d2 = 0.34, x2 = -0.13, z2 = -0.06;
  const merlon = box(0.045, 0.045, 0.03);
  const crenel = (cxp, czp, ww, dd, y, out) => {
    const nx = Math.max(2, Math.round(ww / 0.1)), nz = Math.max(2, Math.round(dd / 0.1));
    for (let i = 0; i <= nx; i++) { const x = cxp - ww / 2 + (i * ww) / nx; out.push({ geo: merlon, color: P, pos: [x, y, czp + dd / 2 - 0.006] }, { geo: merlon, color: P, pos: [x, y, czp - dd / 2 + 0.006] }); }
    for (let i = 1; i < nz; i++) { const z = czp - dd / 2 + (i * dd) / nz; for (const s of [-1, 1]) out.push({ geo: merlon, color: P, pos: [cxp + s * (ww / 2 - 0.006), y, z], rot: [0, Math.PI / 2, 0] }); }
  };
  const slab = [{ geo: roundedBox(w + 0.12, 0.024, d + 0.12, 0.008, 1), color: '#d8c3a0', pos: [0, 0.012, 0] }];
  const f1 = [
    { geo: box(w, h1, d), color: W, pos: [0, 0.024 + h1 / 2, 0] },
    { geo: box(w + 0.006, 0.05, d + 0.006), color: WS, pos: [0, 0.05, 0] },
  ];
  const y1 = 0.024 + h1;
  const f2 = [
    { geo: box(w + 0.03, 0.03, d + 0.03), color: P, pos: [0, y1 + 0.015, 0] },
    { geo: box(w2, h2, d2), color: W, pos: [x2, y1 + 0.03 + h2 / 2, z2] },
  ];
  const y2 = y1 + 0.03 + h2;
  const top = [{ geo: box(w2 + 0.025, 0.025, d2 + 0.025), color: P, pos: [x2, y2 + 0.012, z2] }];
  crenel(0, 0, w + 0.02, d + 0.02, y1 + 0.05, top);
  crenel(x2, z2, w2 + 0.015, d2 + 0.015, y2 + 0.045, top);
  // barjeel (wind tower) on the upper floor's back-left corner: slotted shaft, crenellated cap
  const tx = x2 - w2 / 2 + 0.075, tz = z2 - d2 / 2 + 0.075, th = 0.24;
  top.push({ geo: box(0.14, th, 0.14), color: W, pos: [tx, y2 + th / 2, tz] });
  for (const o of [-0.033, 0.033]) {
    top.push({ geo: box(0.024, 0.13, 0.012), color: WOOD, pos: [tx + o, y2 + th - 0.08, tz + 0.071] });
    top.push({ geo: box(0.012, 0.13, 0.024), color: WOOD, pos: [tx + 0.071, y2 + th - 0.08, tz + o] });
  }
  top.push({ geo: box(0.165, 0.02, 0.165), color: P, pos: [tx, y2 + th + 0.01, tz] });
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) top.push({ geo: box(0.032, 0.04, 0.032), color: P, pos: [tx + a * 0.065, y2 + th + 0.04, tz + b * 0.065] });
  // trim (each piece pops about its own centre): arched teal door, arched windows with wooden shutters, the flag of Bahrain
  const stages = [
    { parts: slab, anchor: [0, 0, 0], when: 'slab' },
    { parts: f1, anchor: [0, 0.02, 0], when: 'floor1' },
    { parts: f2, anchor: [x2, y1, z2], when: 'floor2' },
    { parts: top, anchor: [x2, y2, z2], when: 'top' },
  ];
  const fz = d / 2 + 0.006, dx = 0.13;
  stages.push({ when: 'trim', i: 0, anchor: [dx, 0.024, fz], parts: [
    { geo: box(0.15, 0.2, 0.012), color: WOOD, pos: [dx, 0.024 + 0.1, fz] },
    { geo: cyl(0.075, 0.012, 14), color: WOOD, pos: [dx, 0.224, fz], rot: AX_Z },
    { geo: box(0.11, 0.18, 0.016), color: TEAL, pos: [dx, 0.024 + 0.09, fz + 0.002] },
    { geo: cyl(0.055, 0.016, 14), color: TEAL, pos: [dx, 0.204, fz + 0.002], rot: AX_Z },
    { geo: ball(0.008, 6, 4), color: '#ffd164', pos: [dx + 0.035, 0.11, fz + 0.012] },
    { geo: box(0.2, 0.02, 0.06), color: WS, pos: [dx, 0.034, fz + 0.03] },
  ] });
  const win = (x, y, z, ry, i) => {
    const q = [
      { geo: box(0.1, 0.11, 0.012), color: '#ffffff', pos: [0, 0, 0] },
      { geo: cyl(0.05, 0.012, 12).rotateX(Math.PI / 2), color: '#ffffff', pos: [0, 0.055, 0] },
      { geo: box(0.08, 0.1, 0.016), color: GL, pos: [0, -0.005, 0.002] },
      { geo: cyl(0.04, 0.016, 12).rotateX(Math.PI / 2), color: GL, pos: [0, 0.045, 0.002] },
      { geo: box(0.012, 0.13, 0.02), color: WOOD, pos: [0, 0.005, 0.004] },
      { geo: box(0.12, 0.016, 0.03), color: WS, pos: [0, -0.062, 0.01] },
    ];
    const c = Math.cos(ry), sn = Math.sin(ry);
    for (const it of q) { const [px, py, pz] = it.pos; it.pos = [x + px * c + pz * sn, y + py, z - px * sn + pz * c]; it.rot = [0, ry, 0]; }
    stages.push({ when: 'trim', i, anchor: [x, y, z], parts: q });
  };
  win(-0.16, 0.17, fz, 0, 1);
  win(w / 2 + 0.006, 0.17, 0.08, Math.PI / 2, 2);
  win(x2 + 0.05, y1 + 0.03 + 0.11, z2 + d2 / 2 + 0.006, 0, 3);
  win(x2 + w2 / 2 + 0.006, y1 + 0.03 + 0.11, z2, Math.PI / 2, 4);
  // flag of Bahrain: white band with five serrations into red
  const fx = 0.22, fzz = -0.15, fy = y1 + 0.05;
  const red = new THREE.Shape(), F = { w: 0.15, h: 0.09, band: 0.035 };
  red.moveTo(F.band, 0);
  for (let i = 0; i < 5; i++) { red.lineTo(F.band + 0.018, (i + 0.5) * F.h / 5); red.lineTo(F.band, (i + 1) * F.h / 5); }
  red.lineTo(F.w, F.h); red.lineTo(F.w, 0); red.lineTo(F.band, 0);
  const redG = new THREE.ShapeGeometry(red);
  stages.push({ when: 'trim', i: 5, anchor: [fx, fy, fzz], parts: [
    { geo: cyl(0.006, 0.26, 6), color: '#d9dde3', pos: [fx, fy + 0.13, fzz] },
    { geo: box(F.band + 0.01, F.h, 0.004), color: '#ffffff', pos: [fx + F.band / 2, fy + 0.2, fzz] },
    { geo: redG, color: '#ce1126', pos: [fx, fy + 0.2 - F.h / 2, fzz + 0.0025] },
    { geo: redG, color: '#ce1126', pos: [fx + F.w, fy + 0.2 - F.h / 2, fzz - 0.0025], rot: [0, Math.PI, 0] },
  ] });
  return stages;
}

// ================================================================ furniture
/** street lamp (base at origin, arm reaching toward +Z); the light is a separate glowing part */
export function lampParts() {
  const G = '#5d6671';
  return {
    body: [
      { geo: cyl(0.06, 0.05, 12, 0.07), color: '#8a929d', pos: [0, 0.025, 0] },
      { geo: cyl(0.018, 0.92, 10, 0.026), color: G, pos: [0, 0.48, 0] },
      { geo: new THREE.TorusGeometry(0.11, 0.016, 6, 12, Math.PI / 2), color: G, pos: [0, 0.94, 0.11], rot: [0, Math.PI / 2, 0] },
      { geo: roundedBox(0.13, 0.055, 0.22, 0.022, 1), color: '#4b535d', pos: [0, 1.055, 0.22] },
    ],
    light: [{ geo: roundedBox(0.1, 0.02, 0.17, 0.008, 1), color: '#fff2b8', pos: [0, 1.024, 0.22] }],
  };
}
/** blue road sign with a white car (board faces +Z), pole at the origin */
export function signParts() {
  const B = '#2f7fd6';
  return {
    body: [
      { geo: cyl(0.02, 0.62, 10), color: '#7d8590', pos: [0, 0.31, 0] },
      { geo: cyl(0.05, 0.04, 10, 0.06), color: '#8a929d', pos: [0, 0.02, 0] },
      { geo: roundedBox(0.34, 0.34, 0.025, 0.04, 1), color: '#f4f6f8', pos: [0, 0.7, -0.004] },
    ],
    face: [
      { geo: roundedBox(0.295, 0.295, 0.012, 0.03, 1), color: B, pos: [0, 0.7, 0.006] },
      { geo: roundedBox(0.2, 0.06, 0.012, 0.02, 1), color: '#ffffff', pos: [0, 0.69, 0.012] },
      { geo: roundedBox(0.11, 0.05, 0.012, 0.016, 1), color: '#ffffff', pos: [0, 0.735, 0.012] },
      { geo: box(0.035, 0.03, 0.012), color: B, pos: [-0.025, 0.74, 0.016] },
      { geo: box(0.035, 0.03, 0.012), color: B, pos: [0.025, 0.74, 0.016] },
      { geo: cyl(0.026, 0.012, 12), color: '#ffffff', pos: [-0.055, 0.66, 0.016], rot: AX_Z },
      { geo: cyl(0.026, 0.012, 12), color: '#ffffff', pos: [0.055, 0.66, 0.016], rot: AX_Z },
      { geo: cyl(0.013, 0.014, 10), color: B, pos: [-0.055, 0.66, 0.02], rot: AX_Z },
      { geo: cyl(0.013, 0.014, 10), color: B, pos: [0.055, 0.66, 0.02], rot: AX_Z },
      { geo: box(0.22, 0.012, 0.012), color: '#ffffff', pos: [0, 0.615, 0.012] },
    ],
  };
}
/** a young date palm (just planted), base at the origin */
export function youngPalmParts(seed = 1) {
  const p = [{ geo: cyl(0.1, 0.03, 12, 0.11), color: '#9b7b5a', pos: [0, 0.015, 0] }];
  for (let i = 0; i < 3; i++) p.push({ geo: cyl(0.04 - i * 0.004, 0.13, 8, 0.046 - i * 0.004), color: i % 2 ? PAL.trunk : PAL.trunkDark, pos: [0, 0.07 + i * 0.12, 0] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + seed, droop = 0.25 + (i % 3) * 0.2;
    p.push({ geo: ball(1, 6, 4), color: i % 2 ? PAL.palmLeaf : PAL.leafDark, pos: [Math.cos(a) * 0.16, 0.42 - droop * 0.08, -Math.sin(a) * 0.16], rot: [0, a, -droop], scale: [0.2, 0.018, 0.055] });
  }
  return p;
}
