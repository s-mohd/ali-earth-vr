// Ali, the guide: a cheerful 9-year-old Bahraini explorer (~1.2 m) in a white thobe, ghutra and double agal, wearing a
// khaki explorer vest, a leather satchel and binoculars. Every part is merged into ONE vertex-coloured mesh that is rigidly
// skinned to a procedural skeleton, plus a pre-inflated back-face outline shell on the same skeleton, plus a soft blob
// shadow: 3 draw calls.
// All motion is procedural: idle life, seven poses blended over 0.3 s, two-bone IK for pointing/presenting/thinking/
// clapping, clamped head + eye look-at (the face always stays turned toward the child), blinking, a talking mouth and a
// squash-and-stretch hop. update() creates no objects (scratch vectors/quaternions only).
import { THREE, PAL, clamp, lerp, smooth, rng, vcMat, basic, blobShadow } from '../core/kit.js';

const { Vector3, Quaternion, Euler, Matrix4, Color } = THREE;

const COL = {
  skin: '#e6ad7c', nose: '#dc9367', blush: '#f4a08c',
  thobe: '#fbfaf6', collar: '#efede6', button: '#cbc3b2',
  ghutra: '#ffffff', ghutraIn: '#e3e0d8', agal: '#1f1e26',
  vest: '#d2ab68', vestTrim: '#9a7442', pocket: '#c49b58',
  strap: '#8c5833', bag: '#b4733f', bagDark: '#8d5431', brass: '#ecbd4c', wood: '#a8703f', glass: '#c4ecfa',
  binoc: '#2f6b5a', binocDark: '#1d3d34',
  sole: '#8b5a3a', sandalStrap: '#6b3f25', sirwal: '#f1efe8',
  eyeWhite: '#ffffff', iris: '#7a4a29', irisDark: '#4a2915', pupil: '#1a110c',
  brow: '#3b2416', lash: '#2b1a12', mouth: '#7e2a2c', tongue: '#f08c84', teeth: '#ffffff',
  flagRed: '#ce1126', flagWhite: '#ffffff',
  outline: PAL.ink,
};
// white cloth is lifted slightly above 1.0 so the shaded side still reads as white, yet the soft folds stay visible
const WHITE = new Color(COL.thobe).multiplyScalar(1.08), GHUTRA = new Color(COL.ghutra).multiplyScalar(1.08);

// ---------------------------------------------------------------- proportions (meters, bind pose, Ali faces +Z, +X = his left)
const HC = new Vector3(0, 1.04, 0); // head centre
const HR = 0.148; // head radius (a big, friendly head: ~4 heads tall)
const EYE_AZ = 0.33, EYE_EL = -0.05, SCLERA_R = 0.046, EYE_BULGE = 0.009;
const UPPER = 0.16, FORE = 0.145; // arm segment lengths
// sleeve profile (radius, height above the shoulder joint): closed inside the cuff, slim at the elbow, round shoulder cap
const SLEEVE = [[0.02, -0.29], [0.04, -0.284], [0.043, -0.255], [0.042, -0.21], [0.0405, -0.176], [0.041, -0.16], [0.042, -0.144],
  [0.0445, -0.1], [0.046, -0.05], [0.0455, -0.012], [0.04, 0.018], [0.026, 0.038], [0, 0.046]];
const HAND_Y = 0.8 - UPPER - FORE; // wrist height in the bind pose
const ZS = 0.8; // torso depth / width
// thobe silhouette (radius, height): ankle-length, soft A-line, rounded shoulders
const THOBE = [[0, 0.085], [0.176, 0.085], [0.184, 0.1], [0.177, 0.2], [0.163, 0.34], [0.152, 0.46], [0.148, 0.56], [0.153, 0.64],
  [0.159, 0.72], [0.161, 0.775], [0.153, 0.815], [0.127, 0.846], [0.082, 0.863], [0.05, 0.869], [0, 0.871]];
const torsoR = (y) => {
  for (let i = 1; i < THOBE.length; i++) {
    const [r1, y1] = THOBE[i], [r0, y0] = THOBE[i - 1];
    if (y <= y1 && y1 > y0) return lerp(r0, r1, (y - y0) / (y1 - y0));
  }
  return 0.05;
};

// bones: [name, parent, bind position]; L/R limbs are mirrored (R = -X)
function boneDefs() {
  const eye = (s) => {
    const n = sphDir(s * EYE_AZ, EYE_EL), lid = n.clone().multiplyScalar(HR).add(HC);
    return { lid, ball: lid.clone().addScaledVector(n, -(SCLERA_R - EYE_BULGE)) };
  };
  const L = eye(1), R = eye(-1);
  const defs = [
    ['root', null, [0, 0, 0]], ['hips', 'root', [0, 0.53, 0]], ['spine', 'hips', [0, 0.64, 0]], ['chest', 'spine', [0, 0.75, 0]],
    ['neck', 'chest', [0, 0.86, 0]], ['head', 'neck', [0, 0.905, 0]], ['jaw', 'head', HC.toArray()],
    ['lidL', 'head', L.lid.toArray()], ['eyeL', 'lidL', L.ball.toArray()], ['lidR', 'head', R.lid.toArray()], ['eyeR', 'lidR', R.ball.toArray()],
    ['browL', 'head', onHead(0.3, 0.29, HR).toArray()], ['browR', 'head', onHead(-0.3, 0.29, HR).toArray()],
  ];
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    defs.push(
      ['clav' + S, 'chest', [s * 0.05, 0.81, 0]], ['arm' + S, 'clav' + S, [s * 0.17, 0.8, 0]], ['fore' + S, 'arm' + S, [s * 0.17, 0.8 - UPPER, 0]],
      ['hand' + S, 'fore' + S, [s * 0.17, HAND_Y, 0]],
      ['fing' + S, 'hand' + S, [s * 0.17, HAND_Y - 0.058, 0.0]], ['index' + S, 'hand' + S, [s * 0.17, HAND_Y - 0.056, 0.014]], ['thumb' + S, 'hand' + S, [s * 0.163, HAND_Y - 0.022, 0.026]],
      ['thigh' + S, 'hips', [s * 0.075, 0.5, 0]], ['shin' + S, 'thigh' + S, [s * 0.078, 0.29, 0]], ['foot' + S, 'shin' + S, [s * 0.08, 0.085, 0.01]],
    );
  }
  return defs;
}

function sphDir(az, el, out = new Vector3()) { return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)); }
function onHead(az, el, r = HR, out = new Vector3()) { return sphDir(az, el, out).multiplyScalar(r).add(HC); }
/** Unit tangent pointing "up" along the head sphere at (az, el). */
function tangentUp(az, el) { return new Vector3(-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az)); }

// ---------------------------------------------------------------- geometry helpers (build time only)
const _a = new Vector3(), _b = new Vector3(), _cc = new Color();

/** Grid surface. us/vs: sample counts or arrays of parameters in [0,1]; f(u, v, out). u runs across, v runs "down". */
function grid(us, vs, f, { wrap = false, color = null, flip = false } = {}) {
  const U = Array.isArray(us) ? us : Array.from({ length: us + (wrap ? 0 : 1) }, (_, i) => i / us);
  const Vs = Array.isArray(vs) ? vs : Array.from({ length: vs + 1 }, (_, i) => i / vs);
  const cols = U.length, P = [], Cc = [], I = [];
  for (const v of Vs) for (const u of U) {
    f(u, v, _a); P.push(_a.x, _a.y, _a.z);
    if (color) { _cc.set(color(u, v)); Cc.push(_cc.r, _cc.g, _cc.b); }
  }
  const nu = wrap ? cols : cols - 1;
  for (let j = 0; j < Vs.length - 1; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = a + cols, d = b + cols;
    if (flip) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

/** Flattened tube along a path on a surface: pts/nrm arrays, w(t) width, h(t) height above the surface. */
function band(pts, nrm, w, h, { closed = false, sides = 6, lift = 0.35, turn = 0 } = {}) {
  const n = pts.length, T = new Vector3(), N = new Vector3(), S = new Vector3();
  const rows = closed ? n + 1 : n;
  return grid(sides, rows - 1, (u, v, out) => {
    const i = Math.round(v * (rows - 1)) % n, t = i / (n - 1);
    const p = pts[i], prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.subVectors(next, prev).normalize();
    N.copy(nrm[i]).addScaledVector(T, -nrm[i].dot(T)).normalize();
    S.crossVectors(T, N).normalize();
    const a = u * Math.PI * 2 + turn, hh = h(t);
    out.copy(p).addScaledVector(S, Math.cos(a) * w(t) * 0.5).addScaledVector(N, (Math.sin(a) * 0.5 + lift) * hh);
  }, { wrap: true });
}

/** Elliptic disc lying on the head sphere (rosy cheeks). */
function headDecal(az, el, rx, ry, segs, lift) {
  const ex = new Vector3(Math.cos(az), 0, -Math.sin(az)), n = sphDir(az, el), ey = new Vector3().crossVectors(n, ex);
  return grid(segs, 1, (u, v, out) => {
    const a = u * Math.PI * 2, r = 1 - v;
    out.copy(n).multiplyScalar(HR).addScaledVector(ex, Math.cos(a) * rx * r).addScaledVector(ey, Math.sin(a) * ry * r)
      .normalize().multiplyScalar(HR + lift).add(HC);
  }, { wrap: true, flip: true });
}

/** Spherical cap of radius r around direction n, centred at c (used for the eyes). */
function cap(c, n, r, theta, segs, rows) {
  const g = new THREE.SphereGeometry(r, segs, rows, 0, Math.PI * 2, 0, theta);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n));
  g.translate(c.x, c.y, c.z);
  return g;
}

// ---------------------------------------------------------------- part collector → skinned geometry
class Parts {
  constructor(boneIndex) { this.bi = boneIndex; this.main = []; this.ol = []; }
  /**
   * geo: part geometry (Ali space unless at/rot given). o: { at, rot, color (css | Color | fn(x,y,z)), bone,
   * weights: fn(x,y,z) -> [[bone, w], [bone, w]], ol: outline thickness (m), olGeo: lower-res stand-in for the outline }
   */
  add(geo, o = {}) {
    const m = new Matrix4();
    if (o.at || o.rot) m.compose(new Vector3(...(o.at || [0, 0, 0])), new Quaternion().setFromEuler(new Euler(...(o.rot || [0, 0, 0]))), new Vector3(1, 1, 1));
    this.main.push(this.prep(geo, m, o, true));
    if (o.ol) this.ol.push(inflate(this.prep(o.olGeo || geo, m, o, false), o.ol));
  }
  prep(geo, m, o, colored) {
    let g = geo.clone();
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    const p = g.attributes.position, n = p.count;
    if (colored && (o.color || !g.attributes.color)) {
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        _cc.set(typeof o.color === 'function' ? o.color(p.getX(i), p.getY(i), p.getZ(i)) : o.color || '#ff00ff');
        arr[i * 3] = _cc.r; arr[i * 3 + 1] = _cc.g; arr[i * 3 + 2] = _cc.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    if (!g.attributes.skinIndex) {
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        if (o.weights) {
          const ws = o.weights(p.getX(i), p.getY(i), p.getZ(i));
          ws.forEach(([b, w], k) => { si[i * 4 + k] = this.bi(b); sw[i * 4 + k] = w; });
        } else { si[i * 4] = this.bi(o.bone); sw[i * 4] = 1; }
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    return g;
  }
  build(list, attrs) {
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
    const out = new THREE.BufferGeometry(), idx = new Uint32Array(ni);
    const bufs = attrs.map(([k, size, T]) => [k, size, new T(nv * size)]);
    let vo = 0, io = 0;
    for (const g of list) {
      for (const [k, size, arr] of bufs) arr.set(g.attributes[k].array, vo * size);
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      vo += g.attributes.position.count; io += gi.length;
      g.dispose();
    }
    for (const [k, size, arr] of bufs) out.setAttribute(k, k === 'skinIndex' ? new THREE.Uint16BufferAttribute(arr, size) : new THREE.BufferAttribute(arr, size));
    out.setIndex(new THREE.BufferAttribute(nv < 65536 ? Uint16Array.from(idx) : idx, 1));
    return out;
  }
}
const ATTR_MAIN = [['position', 3, Float32Array], ['normal', 3, Float32Array], ['color', 3, Float32Array], ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array]];
const ATTR_OL = [['position', 3, Float32Array], ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array]];

/** Push every vertex out along its position-averaged normal (seams and hard edges stay closed). */
function inflate(g, t) {
  const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i), v = acc.get(k) || acc.set(k, new Vector3()).get(k);
    v.x += n.getX(i); v.y += n.getY(i); v.z += n.getZ(i);
  }
  for (let i = 0; i < p.count; i++) {
    const v = acc.get(key(i));
    _b.copy(v).normalize();
    p.setXYZ(i, p.getX(i) + _b.x * t, p.getY(i) + _b.y * t, p.getZ(i) + _b.z * t);
  }
  return g;
}

// ---------------------------------------------------------------- the body
const sph = (rx, ry, rz, w, h) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
const cyl = (r0, r1, h, seg, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
const pill = (r, len, cs, rs) => new THREE.CapsuleGeometry(r, len, cs, rs);
/** Cylinder of radius r from point a to point b. */
function rod(a, b, r, seg) {
  const d = new Vector3().subVectors(b, a), g = cyl(r, r, d.length(), seg);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

function buildBody(P, rig) {
  const W = rig.world;
  const torsoW = (x, y) => (y < 0.5 ? [['hips', 1]] : y < 0.64 ? [['hips', 1 - (y - 0.5) / 0.14], ['spine', (y - 0.5) / 0.14]]
    : y < 0.77 ? [['spine', 1 - (y - 0.64) / 0.13], ['chest', (y - 0.64) / 0.13]] : [['chest', 1]]);
  const surf = (phi, y, off, out = new Vector3()) => { const r = torsoR(y) + off; return out.set(Math.sin(phi) * r, y, Math.cos(phi) * r * ZS); };
  const surfN = (phi, out = new Vector3()) => out.set(Math.sin(phi), 0, Math.cos(phi) / ZS).normalize();
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg).scale(1, 1, ZS);

  // --- thobe: one lathe from the hem to the collar, smoothly weighted hips → spine → chest
  // soft vertical folds in the skirt and a slightly deeper hem (vertex colour only)
  const shade = new Color();
  const thobeCol = (x, y, z) => {
    const phi = Math.atan2(x, z / ZS), k = clamp((0.62 - y) / 0.5);
    return shade.copy(WHITE).multiplyScalar(1 - k * (0.07 + 0.07 * Math.sin(phi * 5 + 0.6 * Math.sin(phi * 2))) - (y < 0.12 ? 0.05 : 0));
  };
  P.add(lathe(THOBE, 18), { color: thobeCol, weights: torsoW, ol: 0.009, olGeo: lathe(THOBE.filter((_, i) => ![3, 5, 7, 9, 12].includes(i)), 13) });
  P.add(cyl(0.055, 0.06, 0.03, 12, true), { at: [0, 0.866, 0.004], color: COL.collar, bone: 'chest' });
  P.add(new THREE.BoxGeometry(0.024, 0.15, 0.008), { at: [0, 0.79, surf(0, 0.79, 0).z - 0.001], rot: [-0.08, 0, 0], color: COL.collar, bone: 'chest' });
  for (const y of [0.835, 0.79]) P.add(sph(0.0058, 0.0058, 0.0058, 6, 3), { at: [0, y, surf(0, y, 0.006).z], color: COL.button, bone: 'chest' });

  // --- explorer vest: open-front shell with dark trim; pockets with flaps
  const vestTop = 0.838, vestBot = 0.5;
  const gap = (y) => lerp(0.34, 0.66, clamp((y - vestBot) / (vestTop - vestBot)) ** 1.4);
  const vestF = (u, v, out) => { const y = lerp(vestTop, vestBot, v), g = gap(y); return surf(lerp(g, Math.PI * 2 - g, u), y, 0.012 + 0.004 * v, out); };
  const vu = [0, 0.02, 0.045, ...Array.from({ length: 11 }, (_, i) => 0.08 + (i / 10) * 0.84), 0.955, 0.98, 1];
  const vest = grid(vu, [0, 0.05, 0.12, 0.3, 0.5, 0.7, 0.88, 0.95, 1], vestF, { color: (u, v) => (u < 0.03 || u > 0.97 || v > 0.92 || v < 0.06 ? COL.vestTrim : COL.vest) });
  P.add(vest, { weights: torsoW, ol: 0.006, olGeo: grid(12, 3, vestF) });
  const pocket = (phi, y, w, h) => {
    const p = surf(phi, y, 0.02), n = surfN(phi), yaw = Math.atan2(n.x, n.z);
    P.add(new THREE.BoxGeometry(w, h, 0.012), { at: p.toArray(), rot: [0, yaw, 0], color: COL.pocket, weights: torsoW });
    P.add(new THREE.BoxGeometry(w + 0.006, h * 0.32, 0.012), { at: surf(phi, y + h * 0.42, 0.026).toArray(), rot: [0.12, yaw, 0], color: COL.vestTrim, weights: torsoW });
  };
  pocket(0.98, 0.585, 0.066, 0.062);
  pocket(-0.98, 0.585, 0.066, 0.062);
  // Bahrain flag patch on the left chest (white hoist with five points, red fly)
  {
    const phi = 0.84, y = 0.74, p = surf(phi, y, 0.019), n = surfN(phi), yaw = Math.atan2(n.x, n.z);
    P.add(new THREE.BoxGeometry(0.058, 0.038, 0.006), { at: p.toArray(), rot: [0, yaw, 0], color: COL.flagRed, weights: torsoW });
    const sh = new THREE.Shape();
    sh.moveTo(-0.029, -0.019); sh.lineTo(-0.012, -0.019);
    for (let k = 0; k < 5; k++) { const y0 = -0.019 + (k / 5) * 0.038; sh.lineTo(-0.002, y0 + 0.0038); sh.lineTo(-0.012, y0 + 0.0076); }
    sh.lineTo(-0.029, 0.019); sh.closePath();
    const fg = new THREE.ShapeGeometry(sh);
    fg.rotateY(yaw); fg.translate(p.x + n.x * 0.0035, p.y, p.z + n.z * 0.0035);
    P.add(fg, { color: COL.flagWhite, weights: torsoW });
  }

  // --- satchel: strap over the right shoulder, bag on the left hip with a magnifying glass peeking out
  {
    const ctrl = [[-0.112, 0.86, 0], [-0.09, 0.79, 1], [-0.035, 0.705, 1], [0.03, 0.635, 1], [0.09, 0.565, 1], [0.135, 0.505, 1],
      [0.162, 0.48, 9], [0.135, 0.505, -1], [0.07, 0.6, -1], [0.0, 0.69, -1], [-0.06, 0.78, -1], [-0.1, 0.835, -1]];
    const pts = ctrl.map(([x, y, side]) => {
      if (side === 9) return new Vector3(x, y, 0.035);
      if (side === 0) return new Vector3(x, y + 0.012, 0);
      const r = torsoR(y) + 0.024, xx = clamp(x / r, -0.98, 0.98);
      return new Vector3(x, y, side * Math.sqrt(1 - xx * xx) * r * ZS);
    });
    const sp = new THREE.CatmullRomCurve3(pts, true, 'centripetal').getSpacedPoints(30).slice(0, 30);
    const sn = sp.map((p) => (p.y > 0.83 && Math.abs(p.z) < 0.04 ? new Vector3(0, 1, 0) : new Vector3(p.x, 0, p.z / ZS).normalize()));
    P.add(band(sp, sn, () => 0.034, () => 0.007, { closed: true, sides: 4, lift: 0, turn: Math.PI / 4 }), { color: COL.strap, weights: torsoW });
    const bp = surf(1.02, 0.455, 0.042), n = surfN(1.02), yaw = Math.atan2(n.x, n.z);
    const at = (dx, dy, dz) => [bp.x + Math.cos(yaw) * dx + n.x * dz, bp.y + dy, bp.z - Math.sin(yaw) * dx + n.z * dz];
    P.add(pill(0.035, 0.08, 1, 8).rotateZ(Math.PI / 2).scale(1, 1.55, 0.7), { at: bp.toArray(), rot: [0, yaw, 0], color: COL.bag, bone: 'hips', ol: 0.005 });
    P.add(pill(0.03, 0.084, 1, 7).rotateZ(Math.PI / 2).scale(1, 0.9, 0.4), { at: at(0, 0.03, 0.017), rot: [-0.18, yaw, 0], color: COL.bagDark, bone: 'hips' });
    P.add(new THREE.BoxGeometry(0.022, 0.018, 0.008), { at: at(0, 0.005, 0.031), rot: [-0.1, yaw, 0], color: COL.brass, bone: 'hips' });
    // magnifying glass: wooden handle in the bag, brass ring + lens above it
    const lens = at(-0.057, 0.125, 0.0);
    P.add(cyl(0.009, 0.011, 0.07, 6), { at: at(-0.042, 0.055, 0.0), rot: [0, 0, 0.25], color: COL.wood, bone: 'hips' });
    P.add(new THREE.TorusGeometry(0.026, 0.0065, 4, 12), { at: lens, rot: [0, yaw, 0.25], color: COL.brass, bone: 'hips' });
    P.add(new THREE.CircleGeometry(0.023, 12), { at: [lens[0] + n.x * 0.001, lens[1], lens[2] + n.z * 0.001], rot: [0, yaw, 0.25], color: COL.glass, bone: 'hips' });
  }

  // --- binoculars hanging on the chest from a neck cord
  {
    const z = surf(0, 0.69, 0.035).z;
    for (const s of [-1, 1]) {
      P.add(cyl(0.019, 0.021, 0.062, 8), { at: [s * 0.024, 0.69, z], color: COL.binoc, bone: 'chest' });
      P.add(cyl(0.0225, 0.0225, 0.014, 8), { at: [s * 0.024, 0.655, z], color: COL.binocDark, bone: 'chest' });
      P.add(cyl(0.013, 0.015, 0.014, 6), { at: [s * 0.024, 0.727, z], color: COL.binocDark, bone: 'chest' });
    }
    P.add(new THREE.BoxGeometry(0.03, 0.03, 0.022), { at: [0, 0.695, z - 0.004], color: COL.binocDark, bone: 'chest' });
    // the cord leaves each eyepiece, lies on the cloth up the chest and runs around the back of the neck (under the ghutra)
    const neck = (az, y) => new Vector3(Math.sin(az) * 0.066, y, 0.004 + Math.cos(az) * 0.066);
    const half = (s) => [new Vector3(s * 0.033, 0.734, z - 0.006), surf(s * 0.19, 0.775, 0.008), surf(s * 0.3, 0.81, 0.008),
      surf(s * 0.42, 0.836, 0.008), surf(s * 0.62, 0.855, 0.006), neck(s * 1.15, 0.874), neck(s * 1.9, 0.88)];
    const cord = new THREE.CatmullRomCurve3([...half(-1), neck(Math.PI, 0.882), ...half(1).reverse()], false, 'centripetal');
    P.add(new THREE.TubeGeometry(cord, 28, 0.0028, 3, false), { color: COL.binocDark, bone: 'chest' });
  }

  // --- shins (hidden by the thobe; seen only when the feet tuck in a hop) and sandals
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    P.add(pill(0.04, 0.13, 1, 6), { at: [s * 0.079, 0.19, 0], color: COL.sirwal, bone: 'shin' + S });
    const f = W['foot' + S], toe = s * 0.14;
    P.add(cyl(0.027, 0.03, 0.06, 6, true), { at: [f.x, 0.075, 0.0], color: COL.skin, bone: 'foot' + S });
    P.add(pill(0.038, 0.1, 1, 7).rotateX(Math.PI / 2).scale(1.05, 0.28, 1), { at: [f.x + s * 0.006, 0.011, 0.068], rot: [0, toe, 0], color: COL.sole, bone: 'foot' + S, ol: 0.005 });
    P.add(sph(0.033, 0.026, 0.07, 8, 6), { at: [f.x + s * 0.006, 0.036, 0.07], rot: [0, toe, 0], color: COL.skin, bone: 'foot' + S });
    P.add(new THREE.TorusGeometry(0.031, 0.008, 3, 6, Math.PI), { at: [f.x + s * 0.008, 0.03, 0.085], rot: [0, toe, 0], color: COL.sandalStrap, bone: 'foot' + S });
  }

  // --- arms in long white sleeves with cuffs; mitten hands (palm, mitten, index and thumb on their own bones)
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    const a = W['arm' + S], e = W['fore' + S], h = W['hand' + S];
    // one smooth sleeve from the shoulder cap into the cuff, blended arm → forearm around the elbow, with a single outline
    // shell (no seam rings); a rigid elbow ball (inside the sleeve when straight) fills the corner of a sharp bend
    const sleeve = (seg) => new THREE.LatheGeometry(SLEEVE.map(([r, y]) => new THREE.Vector2(r, a.y + y)), seg).translate(a.x, 0, 0);
    const elbowW = (x, y) => { const k = smooth(e.y - 0.03, e.y + 0.03, y); return [['fore' + S, 1 - k], ['arm' + S, k]]; };
    P.add(sleeve(10), { color: WHITE, weights: elbowW, ol: 0.007, olGeo: sleeve(8) });
    P.add(sph(0.039, 0.039, 0.039, 8, 5), { at: e.toArray(), color: WHITE, bone: 'fore' + S });
    P.add(cyl(0.046, 0.049, 0.034, 10, true), { at: [e.x, e.y - FORE + 0.02, 0], color: COL.collar, bone: 'fore' + S, ol: 0.006 });
    P.add(cyl(0.025, 0.027, 0.05, 6, true), { at: [h.x, h.y + 0.012, 0], color: COL.skin, bone: 'hand' + S });
    P.add(sph(0.019, 0.036, 0.033, 7, 5), { at: [h.x, h.y - 0.03, 0.003], color: COL.skin, bone: 'hand' + S, ol: 0.0045 });
    // four-finger mitten + thumb; a pointing index finger grows out of the fist (its bone is scaled to 0 otherwise)
    P.add(pill(0.0105, 0.021, 1, 8).scale(0.95, 1, 2.9), { at: [h.x, h.y - 0.0735, 0.0], color: COL.skin, bone: 'fing' + S, ol: 0.0035 });
    P.add(pill(0.0095, 0.03, 1, 6), { at: [h.x, h.y - 0.077, 0.014], color: COL.skin, bone: 'index' + S, ol: 0.0035 });
    P.add(pill(0.0095, 0.022, 1, 6), { at: [h.x - s * 0.006, h.y - 0.034, 0.036], rot: [0.55, 0, s * 0.25], color: COL.skin, bone: 'thumb' + S, ol: 0.0035 });
  }
}

function buildHead(P, rig) {
  const W = rig.world;
  P.add(cyl(0.044, 0.05, 0.09, 10, true), { at: [0, 0.895, 0], color: COL.skin, bone: 'neck' });
  // head sphere (skin), a touch warmer under the chin
  P.add(new THREE.SphereGeometry(HR, 18, 13), { at: HC.toArray(), color: (x, y) => (y < HC.y - 0.105 ? '#dba272' : COL.skin), bone: 'head', ol: 0.009, olGeo: new THREE.SphereGeometry(HR, 14, 11) });
  // button nose + rosy cheeks
  P.add(sph(0.016, 0.0125, 0.012, 8, 6), { at: onHead(0, -0.2, HR - 0.002).toArray(), color: COL.nose, bone: 'head' });
  for (const s of [-1, 1]) P.add(headDecal(s * 0.6, -0.25, 0.026, 0.017, 12, 0.0012), { color: COL.blush, bone: 'head' });

  // eyes: sclera cap + lash line on the lid bone (blink = scale), iris/pupil/highlights on the eye bone (gaze = rotation
  // about the eyeball centre, so the iris slides over the white)
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    const az = s * EYE_AZ, n = sphDir(az, EYE_EL), ball = W['eye' + S];
    P.add(cap(ball, n, SCLERA_R, 1.0, 12, 4), { color: COL.eyeWhite, bone: 'lid' + S });
    // the white meets the skin on a circle (plane at distance x from the head centre, radius a)
    const d = HC.distanceTo(ball), x = (d * d - SCLERA_R * SCLERA_R + HR * HR) / (2 * d), a = Math.sqrt(HR * HR - x * x);
    const ex = new Vector3(Math.cos(az), 0, -Math.sin(az)), ey = new Vector3().crossVectors(n, ex), rimC = n.clone().multiplyScalar(x + 0.0012).add(HC);
    const lash = [], ln = [];
    for (let i = 0; i <= 7; i++) {
      const t = lerp(0.1, 0.9, i / 7) * Math.PI;
      lash.push(rimC.clone().addScaledVector(ex, Math.cos(t) * (a + 0.0012)).addScaledVector(ey, Math.sin(t) * (a + 0.0012))); ln.push(n);
    }
    P.add(band(lash, ln, (t) => 0.0025 + 0.0045 * Math.sin(Math.PI * t) ** 0.6, () => 0.003, { sides: 4, lift: 0.2 }), { color: COL.lash, bone: 'lid' + S });
    const irisTop = ball.y + SCLERA_R * 0.36;
    P.add(cap(ball, n, SCLERA_R + 0.0009, 0.55, 16, 2), { color: (x, y) => (y > irisTop ? COL.irisDark : COL.iris), bone: 'eye' + S });
    P.add(cap(ball, n, SCLERA_R + 0.0018, 0.3, 12, 1), { color: COL.pupil, bone: 'eye' + S });
    const hl = (dx, dy, r) => P.add(cap(ball, n.clone().addScaledVector(ex, dx).addScaledVector(ey, dy).normalize(), SCLERA_R + 0.0027, r, 8, 1), { color: '#ffffff', bone: 'eye' + S });
    hl(0.17 * s, 0.2, 0.14);
    hl(-0.13 * s, -0.15, 0.065);
  }
  // eyebrows: thick soft arcs on their own bones
  for (const [S, s] of [['L', 1], ['R', -1]]) {
    const pts = [], nrm = [];
    for (let i = 0; i <= 7; i++) {
      const u = i / 7, az = s * (0.11 + 0.38 * u), el = 0.27 + 0.05 * Math.sin(Math.PI * (u * 0.85 + 0.1)) - 0.03 * u;
      pts.push(onHead(az, el, HR + 0.001)); nrm.push(sphDir(az, el));
    }
    P.add(band(pts, nrm, (t) => lerp(0.017, 0.009, t) * (t < 0.15 ? 0.75 + t * 1.6 : 1), () => 0.006, { sides: 5, lift: 0.3 }), { color: COL.brow, bone: 'brow' + S });
  }

  // mouth: a decal whose bottom edge rides the jaw bone (weights fall off toward the corners) → smile line ↔ open "D"
  {
    const el0 = -0.4, azW = 0.21, smileK = 0.07, thick = 0.028, lift = 0.0012;
    const head = rig.index('head'), jaw = rig.index('jaw');
    const mouthPart = (u0, u1, vTop, vBot, wTop, wBot, insetT, insetB, color, liftExtra, cols) => {
      const g = grid(cols, 2, (u, v, out) => {
        const x = lerp(u0, u1, u) * 2 - 1, top = el0 + smileK * x * x, bot = top - thick * Math.sqrt(Math.max(0, 1 - x * x));
        const elT = lerp(top, bot, vTop) - insetT, elB = lerp(top, bot, vBot) + insetB;
        onHead(x * azW * (1 - 0.06 * (1 - v)), lerp(elT, elB, v), HR + lift + liftExtra, out);
      });
      const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let j = 0, i = 0; j <= 2; j++) for (let c = 0; c <= cols; c++, i++) {
        const x = lerp(u0, u1, c / cols) * 2 - 1, w = clamp(lerp(wTop, wBot, j / 2) * (1 - x * x));
        si[i * 4] = head; sw[i * 4] = 1 - w; si[i * 4 + 1] = jaw; sw[i * 4 + 1] = w;
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      P.add(g, { color });
    };
    mouthPart(0, 1, 0, 1, 0, 1, 0, 0, COL.mouth, 0, 14);
    mouthPart(0.22, 0.78, 0, 0, 0, 0.3, 0.003, -0.003, COL.teeth, 0.0009, 8); // upper teeth (zero-area when closed)
    mouthPart(0.27, 0.73, 1, 1, 0.55, 1, -0.008, 0.008, COL.tongue, 0.0009, 8); // tongue (zero-area when closed)
  }

  // ghutra: white cloth cap + drape framing the face (outer + inner layer), rolled front edge, double black agal
  const RG = HR + 0.009, PHI0 = 1.1, CAPY = 1.04;
  const edgeEl = (phi) => { const a = Math.abs(phi); return a >= PHI0 ? 0 : 0.42 * (1 - (a / PHI0) ** 2.2) + 0.03 * Math.max(0, 1 - a / 0.25); };
  const capPhi = (u) => { const w = 2 * u - 1; return Math.PI * Math.sign(w) * Math.abs(w) ** 1.35; };
  const capGeo = (nu, nv) => grid(nu, nv, (u, v, out) => {
    const phi = capPhi(u), el = lerp(Math.PI / 2, edgeEl(phi), v);
    out.set(Math.cos(el) * Math.sin(phi) * RG, Math.sin(el) * RG * CAPY, Math.cos(el) * Math.cos(phi) * RG).add(HC);
  }, { wrap: true });
  P.add(capGeo(22, 6), { color: GHUTRA, bone: 'head', ol: 0.009, olGeo: capGeo(14, 4) });
  const phiD = (t) => PHI0 + 0.16 * t;
  const yBot = (phi) => { const b = (1 - Math.cos(phi)) / 2; return 0.82 - 0.1 * b * b; };
  const drapeP = (u, v, off, out) => {
    const t = lerp(-0.04, 1, v), phi = lerp(phiD(t), Math.PI * 2 - phiD(t), u), s = Math.max(0, t) ** 1.5;
    const f = 1 + 0.045 * Math.sin(phi * 6) * s; // soft folds that deepen toward the scalloped hem
    const rx = (lerp(RG, 0.232, s) + off) * f, rz = (lerp(RG, 0.19, s) + off) * f, y = lerp(HC.y, yBot(phi), t) + 0.014 * Math.sin(phi * 5) * Math.max(0, t);
    return out.set(HC.x + Math.sin(phi) * rx, y, HC.z + Math.cos(phi) * rz);
  };
  // the folds are shaded in too (vertex colour)
  const fold = new Color();
  const drapeCol = (x, y, z) => fold.copy(GHUTRA).multiplyScalar(1 - 0.1 * (0.5 + 0.5 * Math.sin(Math.atan2(x - HC.x, z - HC.z) * 6)) * clamp((HC.y - y) / 0.2));
  // the drape's lower part leans on the neck so a turning head does not swing it through the shoulders
  const drapeW = (x, y) => { const k = clamp((HC.y - 0.11 - y) / 0.12) * 0.5; return [['head', 1 - k], ['neck', k]]; };
  const drape = (nu, nv, off, flip) => grid(nu, nv, (u, v, out) => drapeP(u, v, off, out), { flip });
  P.add(drape(18, 5, 0, false), { color: drapeCol, weights: drapeW, ol: 0.009, olGeo: drape(18, 3, 0, false) });
  P.add(drape(14, 4, -0.006, true), { color: COL.ghutraIn, weights: drapeW });
  // rolled hem along the face opening
  {
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push(drapeP(0, 1 - i / 6, 0.001, new Vector3()));
    for (let i = 1; i < 16; i++) {
      const phi = lerp(PHI0, -PHI0, i / 16), el = edgeEl(phi), r = RG + 0.001;
      pts.push(new Vector3(Math.cos(el) * Math.sin(phi) * r, Math.sin(el) * r * CAPY, Math.cos(el) * Math.cos(phi) * r).add(HC));
    }
    for (let i = 0; i <= 6; i++) pts.push(drapeP(1, i / 6, 0.001, new Vector3()));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    P.add(new THREE.TubeGeometry(curve, 22, 0.0085, 4, false), { color: '#f4f2ec', weights: drapeW, ol: 0.004 });
  }
  // agal: two black cords around the crown (front a little higher) + two short tails down the back
  {
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.1);
    const ring = (h, tube, rs, ts) => new THREE.TorusGeometry(Math.sqrt(RG * RG - h * h), tube, rs, ts).rotateX(Math.PI / 2)
      .translate(0, h * CAPY, 0).applyQuaternion(tilt).translate(HC.x, HC.y, HC.z);
    for (const [h, tube] of [[0.074, 0.0105], [0.095, 0.0095]]) P.add(ring(h, tube, 4, 16), { color: COL.agal, bone: 'head', ol: 0.004 });
    for (const s of [-1, 1]) {
      const top = new Vector3(s * 0.028, 0.074 * CAPY, -Math.sqrt(RG * RG - 0.074 * 0.074) - 0.004).applyQuaternion(tilt).add(HC);
      const bot = new Vector3(top.x + s * 0.006, top.y - 0.12, -0.172 + HC.z);
      P.add(rod(top, bot, 0.0055, 5), { color: COL.agal, bone: 'head' });
      P.add(sph(0.011, 0.018, 0.011, 6, 4), { at: [bot.x, bot.y - 0.012, bot.z], color: COL.agal, bone: 'head' });
    }
  }
}

// ---------------------------------------------------------------- poses
const POSES = ['idle', 'wave', 'point', 'present', 'cheer', 'think', 'clap'];
const SIDES = ['L', 'R'];
const PARAMS = ['mouth', 'browL', 'browR', 'tiltL', 'tiltR', 'squint', 'bounce', 'eyeUp', 'eyeSide', 'indexL', 'indexR'];
const BLEND = 0.3;
const DIR = 1, ALONG = 2, AIM = 3; // hand orientation modes (see orient())
const FACE_MAX = 0.8; // the head never turns more than ~45° away from the child: the face and mouth stay in view

/**
 * Build Ali. opts: {
 *   getViewer?: (out: Vector3) => Vector3  the viewer's head in world space (default look target; may fill `out` and return
 *                                           it, which avoids an allocation per frame),
 *   shadow?: boolean                        own soft contact shadow that shrinks during hops (default on; false = none)
 * }
 */
export function buildAli(opts = {}) {
  const group = new THREE.Group();
  group.name = 'ali';

  // ---- skeleton
  const bones = [], B = {}, world = {};
  for (const [name, parent, p] of boneDefs()) {
    const b = new THREE.Bone();
    b.name = name;
    world[name] = new Vector3(...p);
    b.position.copy(world[name]);
    if (parent) { b.position.sub(world[parent]); B[parent].add(b); }
    bones.push(b); B[name] = b;
  }
  const rig = { world, index: (n) => { const i = bones.indexOf(B[n]); if (i < 0) throw new Error('ali: no bone ' + n); return i; } };

  // ---- geometry
  const P = new Parts(rig.index);
  buildBody(P, rig);
  buildHead(P, rig);
  const geo = P.build(P.main, ATTR_MAIN), olGeo = P.build(P.ol, ATTR_OL);
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(geo, vcMat());
  const outline = new THREE.SkinnedMesh(olGeo, basic(COL.outline, { side: THREE.BackSide }));
  mesh.name = 'ali-body'; outline.name = 'ali-outline';
  mesh.add(bones[0]);
  group.add(mesh, outline);
  group.updateMatrixWorld(true);
  mesh.bind(skeleton); outline.bind(skeleton);
  // generous fixed bounds (the skinned pose changes every frame; avoids per-frame bound recomputation)
  for (const m of [mesh, outline]) m.boundingSphere = new THREE.Sphere(new Vector3(0, 0.75, 0), 1.05);

  const head = new THREE.Object3D(); head.name = 'ali-head'; head.position.copy(HC).sub(world.head); B.head.add(head);
  const bubbleAnchor = new THREE.Object3D(); bubbleAnchor.name = 'ali-bubble'; bubbleAnchor.position.set(0, 1.5, 0); group.add(bubbleAnchor);
  const shadow = opts.shadow === false ? null : blobShadow(0.36, 0.3, 0.35, group);

  // ---- animation state
  const POSE_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'clavR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'fingL', 'fingR',
    'indexL', 'indexR', 'thumbL', 'thumbR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'].map((n) => B[n]);
  const NB = POSE_BONES.length, slot = {};
  POSE_BONES.forEach((b, i) => (slot[b.name] = i));
  const order = POSE_BONES.map((b) => (/^(arm|fore|hand)/.test(b.name) ? 'ZXY' : /^(neck|head)/.test(b.name) ? 'YXZ' : 'XYZ'));
  const isArm = POSE_BONES.map((b) => /^(arm|fore|hand)/.test(b.name)), ARM_SLOTS = POSE_BONES.flatMap((b, i) => (isArm[i] ? [i] : []));
  const eul = new Float32Array(NB * 3); // pose targets as Euler angles
  const from = POSE_BONES.map(() => new Quaternion()), cur = POSE_BONES.map(() => new Quaternion()), tgt = POSE_BONES.map(() => new Quaternion());
  const NP = PARAMS.length, pFrom = new Float32Array(NP), pCur = new Float32Array(NP), pTgt = new Float32Array(NP);
  const PI = Object.fromEntries(PARAMS.map((k, i) => [k, i]));
  // per-side lookups (no string building in the frame loop)
  const LIMB = ['clav', 'arm', 'fore', 'hand', 'fing', 'index', 'thumb', 'thigh', 'shin', 'foot'];
  const side = {};
  for (const S of SIDES) {
    const sg = S === 'L' ? 1 : -1;
    side[S] = {
      sign: sg, slot: Object.fromEntries(LIMB.map((n) => [n, slot[n + S]])), ...Object.fromEntries(['clav', 'arm', 'index', 'thigh', 'shin', 'foot', 'lid', 'eye', 'brow'].map((n) => [n, B[n + S]])),
      browRest: B['brow' + S].position.clone(), browUp: tangentUp(sg * 0.3, 0.29), eyeInHead: world['eye' + S].clone().sub(world.head), armRest: world['arm' + S],
      pBrow: PI['brow' + S], pTilt: PI['tilt' + S], pIndex: PI['index' + S],
      eyeYaw: 0, eyePitch: 0, ik: false, ikWorld: false, reach: 0, target: new Vector3(), pole: new Vector3(), lineDir: new Vector3(),
      orient: 0, fdir: new Vector3(), ndir: new Vector3(), // hand orientation request (see orient())
      bindHand: new Matrix4().makeBasis(new Vector3(0, -1, 0), new Vector3(-sg, 0, 0), new Vector3(0, 0, -sg)).transpose(),
    };
  }
  const restHips = B.hips.position.clone(), restClavY = B.clavL.position.y, chestToHead = HC.clone().sub(world.chest);

  let pose = 'idle', armSide = 'R', hasPoint = false, hasLook = false, talking = false;
  // numbers that change every frame live on one object: V8 boxes a double held in a closure `let` on every write
  const st = { time: 0, poseT: 0, blendT: BLEND, glanceT: 0, talkAmt: 0, blinkT: 1.5, blinkPhase: -1, saccT: 1, jumpT: -1,
    jumpFromSy: 1, squashY: 1, lookYaw: 0, lookPitch: 0, yawLimit: 1.05, aimYaw: 0 };
  const pointV = new Vector3(), lookV = new Vector3(), lookP = new Vector3(), viewP = new Vector3(), sacc = new Vector3(), R = rng(7);
  const T = { v: new Vector3(), v2: new Vector3(), p: new Vector3(), e: new Vector3(), t1: new Vector3(), t2: new Vector3(), t3: new Vector3(),
    q: new Quaternion(), q2: new Quaternion(), m: new Matrix4(), m2: new Matrix4(), eu: new Euler() };
  const AX = new Vector3(1, 0, 0), AZ = new Vector3(0, 0, 1);
  const BIND = new Matrix4().makeBasis(new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0)).transpose();

  // ---- pose writers (limb angles use the left-side convention; the right side is mirrored: (x, -y, -z))
  const set = (i, x = 0, y = 0, z = 0) => { eul[i * 3] = x; eul[i * 3 + 1] = y; eul[i * 3 + 2] = z; };
  const limb = (S, name, x = 0, y = 0, z = 0) => { const sd = side[S]; set(sd.slot[name], x, y * sd.sign, z * sd.sign); };
  const hand = (S, curl, index, thumb, wx = 0, wy = 0, wz = 0) => {
    limb(S, 'hand', wx, wy, wz); limb(S, 'fing', 0, 0, -curl); limb(S, 'index', 0, 0, -index); limb(S, 'thumb', -thumb * 0.5, 0, -thumb);
  };
  /** Two-bone IK goal for a wrist, in Ali space (left-side convention), with an elbow pole direction. */
  const ik = (S, x, y, z, px, py, pz) => {
    const sd = side[S];
    sd.ik = true; sd.ikWorld = false; sd.reach = 0; sd.target.set(x * sd.sign, y, z); sd.pole.set(px * sd.sign, py, pz);
  };
  /**
   * Exact wrist orientation (chest space, left-side convention), palm facing n. mode: DIR = fingers along f,
   * ALONG = fingers continue the forearm, AIM = fingers on the shoulder → target line (the index finger hits the target).
   */
  const orient = (S, mode, nx, ny, nz, fx = 0, fy = 0, fz = 0) => {
    const sd = side[S];
    sd.orient = mode; sd.fdir.set(fx * sd.sign, fy, fz).normalize(); sd.ndir.set(nx * sd.sign, ny, nz);
  };
  const param = (k, v) => (pTgt[PI[k]] = v);
  const relaxedArm = (S, t, ph) => {
    limb(S, 'arm', 0.05 + Math.sin(t * 1.3 + ph) * 0.025, 0.1, 0.17);
    limb(S, 'fore', -0.32, 0, 0);
    hand(S, 0.35, 0.25, 0.15, 0, 0.2, 0.05);
  };

  function evalPose(name, t) {
    eul.fill(0); pTgt.fill(0); side.L.ik = side.R.ik = false; side.L.orient = side.R.orient = 0;
    switch (name) {
      case 'wave': {
        const w = Math.sin(t * Math.PI * 2 * 1.5);
        limb('R', 'arm', -0.15, 1.45, 2.2); limb('R', 'fore', -0.35 + w * 0.45, 0, 0); limb('R', 'clav', 0, 0, 0.12);
        hand('R', 0.05, 0.05, 0.35); orient('R', ALONG, 0.2 * w, 0, 1); // open palm to the child
        relaxedArm('L', t, 1);
        set(slot.chest, 0, 0, 0.05); set(slot.head, 0, -0.06, 0.08 + w * 0.02);
        param('mouth', 0.4); param('browL', 0.45); param('browR', 0.45); param('squint', 0.25);
        break;
      }
      case 'cheer': {
        const b = Math.abs(Math.sin(t * Math.PI * 2.1)), w = Math.sin(t * Math.PI * 4.2) * 0.08;
        for (let i = 0; i < 2; i++) { // a wide "hooray" V, open palms to the child
          const S = SIDES[i];
          limb(S, 'arm', -0.12, 1.45, 2.6 + w); limb(S, 'fore', -0.2, 0, 0); limb(S, 'clav', 0, 0, 0.15);
          hand(S, 0.05, 0.05, 0.4); orient(S, ALONG, 0, 0, 1);
        }
        set(slot.chest, -0.06, 0, 0); set(slot.head, -0.1, 0, Math.sin(t * Math.PI * 2.1) * 0.06);
        param('bounce', b * 0.045); param('mouth', 0.9); param('browL', 0.8); param('browR', 0.8); param('squint', 0.6); param('eyeUp', 0.1);
        break;
      }
      case 'point':
      case 'present': {
        const pt = name === 'point', O = armSide === 'L' ? 'R' : 'L';
        aimArm(armSide, pt);
        if (pt) {
          hand(armSide, 1.65, 0, 0.9); orient(armSide, AIM, 0, -1, 0.2); param(armSide === 'L' ? 'indexL' : 'indexR', 1); // index out, palm down
          ik(O, 0.19, 0.555, 0.03, 1, -0.2, -0.9); hand(O, 0.9, 0.8, 0.4); orient(O, DIR, -1, 0, 0, 0.1, -0.6, 0.8); // other hand on the hip
          param('mouth', 0.25); param('browL', 0.35); param('browR', 0.35);
        } else {
          hand(armSide, 0.05, 0.05, 0.45); orient(armSide, ALONG, 0, 1, 0.2); // open palm up
          ik(O, 0.1, 0.62, 0.15, 1, -0.6, -0.3); hand(O, 0.15, 0.15, 0.3); orient(O, DIR, -0.1, 1, 0, -0.3, 0.1, 1);
          param('mouth', 0.35); param('browL', 0.5); param('browR', 0.5); param('squint', 0.2);
        }
        const yaw = clamp(st.aimYaw * 0.3, -0.35, 0.35); // the body turns a little toward what he shows
        set(slot.chest, 0, yaw * 0.7, 0); set(slot.spine, 0, yaw * 0.3, 0);
        break;
      }
      case 'think': {
        ik('R', 0.04, 0.83, 0.165, 0.3, -1, 0.2); hand('R', 1.4, 0.35, 0.7); orient('R', DIR, -0.15, 0.2, -1, -0.15, 1, 0.1); param('indexR', 1); // hand on the chin
        ik('L', -0.06, 0.62, 0.15, 1, -0.5, -0.3); hand('L', 0.5, 0.4, 0.3); orient('L', DIR, 0, 1, 0, -1, 0.15, 0.1); // holding the elbow
        set(slot.head, -0.06 + Math.sin(t * 1.4) * 0.02, -0.12, -0.13); set(slot.chest, 0, -0.06, 0);
        param('browL', 0.75); param('browR', -0.15); param('tiltR', 0.15); param('mouth', 0.06); param('eyeUp', 0.35); param('eyeSide', 0.25);
        break;
      }
      case 'clap': {
        const c = 0.5 + 0.5 * Math.cos(t * Math.PI * 2 * 2.2), g = 0.018 + 0.075 * Math.pow(c, 0.7);
        for (let i = 0; i < 2; i++) {
          const S = SIDES[i];
          ik(S, g, 0.64 + c * 0.015, 0.2, 1, -0.7, -0.5); hand(S, 0.08, 0.08, 0.25); orient(S, DIR, -1, 0.1, 0.25, -0.3, 0.55, 1);
        }
        set(slot.head, 0, 0, Math.sin(t * Math.PI * 2.2) * 0.04);
        param('mouth', 0.6); param('browL', 0.5); param('browR', 0.5); param('squint', 0.45); param('bounce', (1 - c) * 0.012);
        break;
      }
      default: {
        // explorer idle: right hand holds the satchel strap, left arm relaxed (beat gestures while talking)
        ik('R', 0.072, 0.675, 0.17, 0.7, -1, -0.3); hand('R', 1.35, 1.2, 0.8); orient('R', DIR, 0.15, 0, -1, -0.1, 1, 0.15);
        relaxedArm('L', t, 2);
        const k = st.talkAmt;
        if (k > 0.01) {
          limb('L', 'arm', -0.15 * k, 0.1, 0.2);
          limb('L', 'fore', -0.32 - k * (0.7 + Math.sin(t * 3.1) * 0.18), 0, 0);
          hand('L', 0.35 - k * 0.25, 0.25 - k * 0.2, 0.2, 0, 0.2 - k * 0.9, 0.05);
        }
        param('browL', 0.1); param('browR', 0.1);
      }
    }
    for (let i = 0; i < NB; i++) tgt[i].setFromEuler(T.eu.set(eul[i * 3], eul[i * 3 + 1], eul[i * 3 + 2], order[i]));
  }

  // ---- IK
  function aimArm(S, pt) {
    const sd = side[S];
    sd.ik = true; sd.ikWorld = hasPoint;
    if (hasPoint) sd.target.copy(pointV);
    else sd.target.copy(sd.armRest).addScaledVector(T.v.set(0.92 * sd.sign, pt ? -0.28 : -0.45, pt ? 0.2 : 0.45).normalize(), 1);
    sd.pole.set(0.3 * sd.sign, -1, -0.5);
    sd.reach = pt ? 0.985 : 0.82; // fraction of the full arm length
  }
  /** Two-bone solve in the clavicle's space (bones are axis-aligned in the bind pose: the arm hangs along -Y, bends toward +Z). */
  function solveIK(sd) {
    const t = T.v.copy(sd.target);
    if (!sd.ikWorld) t.sub(world.chest).applyMatrix4(B.chest.matrixWorld);
    t.applyMatrix4(T.m.copy(sd.clav.matrixWorld).invert()).sub(sd.arm.position);
    if (sd.reach) t.setLength((UPPER + FORE) * sd.reach);
    const a = UPPER, b = FORE, d = clamp(t.length(), 0.06, a + b - 0.002);
    const th = T.t3.copy(t).normalize();
    sd.lineDir.copy(th);
    const pole = T.p.copy(sd.pole).applyQuaternion(T.q.copy(sd.clav.quaternion).invert());
    pole.addScaledVector(th, -pole.dot(th));
    if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0).addScaledVector(th, -th.y);
    pole.normalize();
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const e = T.e.copy(th).multiplyScalar(cosA).addScaledVector(pole, Math.sqrt(1 - cosA * cosA)); // elbow direction
    const t2 = T.t2.copy(pole).addScaledVector(e, -pole.dot(e)).negate().normalize(); // bend direction (bind +Z)
    T.m2.makeBasis(e, t2, T.t1.crossVectors(e, t2)).multiply(BIND);
    tgt[sd.slot.arm].setFromRotationMatrix(T.m2);
    tgt[sd.slot.fore].setFromAxisAngle(AX, Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1)) - Math.PI);
  }
  /** Wrist rotation that puts the fingers/palm where orient() asked, given this frame's arm + forearm targets (FK or IK). */
  function orientHand(sd) {
    const armFore = T.q2.copy(tgt[sd.slot.arm]).multiply(tgt[sd.slot.fore]), inv = T.q.copy(sd.clav.quaternion).invert();
    const f = sd.orient === DIR ? T.t1.copy(sd.fdir).applyQuaternion(inv)
      : sd.orient === AIM ? T.t1.copy(sd.lineDir) : T.t1.set(0, -1, 0).applyQuaternion(armFore);
    const n = T.t2.copy(sd.ndir).applyQuaternion(inv);
    n.addScaledVector(f, -n.dot(f)).normalize();
    T.m2.makeBasis(f, n, T.t3.crossVectors(f, n)).multiply(sd.bindHand);
    tgt[sd.slot.hand].setFromRotationMatrix(T.m2).premultiply(armFore.invert());
  }

  // ---- runtime
  function snapshot() { for (let i = 0; i < NB; i++) from[i].copy(cur[i]); pFrom.set(pCur); st.blendT = 0; }
  function setPose(name) {
    if (!POSES.includes(name)) name = 'idle';
    if (name === pose) return;
    snapshot();
    pose = name; st.poseT = 0; st.glanceT = 0;
    if (name === 'point' || name === 'present') chooseArm();
  }
  function chooseArm() {
    // use the hand on the target's side (right preferred): no awkward reach across the body
    let S = 'R';
    st.aimYaw = -1.2;
    if (hasPoint) {
      group.updateWorldMatrix(true, false);
      T.v.copy(pointV); group.worldToLocal(T.v);
      st.aimYaw = Math.atan2(T.v.x, T.v.z);
      if (T.v.x > 0.25) S = 'L';
    }
    if (st.blendT > 0) snapshot(); // re-aiming (or switching hands) mid-pose blends too; setPose has just taken one
    armSide = S;
  }

  const SD = [side.L, side.R];
  const addQ = new Quaternion();
  const addEuler = (bone, x, y, z) => bone.quaternion.multiply(addQ.setFromEuler(T.eu.set(x, y, z, 'XYZ')));
  function update(dt, t) {
    dt = Math.min(dt, 0.1); st.time = t ?? st.time + dt;
    st.poseT += dt; st.blendT += dt; st.glanceT += dt;
    st.talkAmt += ((talking ? 1 : 0) - st.talkAmt) * (1 - Math.exp(-dt * 10));
    const w = st.blendT >= BLEND ? 1 : (st.blendT / BLEND) ** 2 * (3 - 2 * (st.blendT / BLEND));

    mesh.updateWorldMatrix(true, false);
    evalPose(pose, st.poseT);
    for (let i = 0; i < NP; i++) pCur[i] = lerp(pFrom[i], pTgt[i], w);

    // body bones + idle life (breathing, weight shift with planted feet), then matrices for the IK and look-at
    for (let i = 0; i < NB; i++) if (!isArm[i]) { cur[i].slerpQuaternions(from[i], tgt[i], w); POSE_BONES[i].quaternion.copy(cur[i]); }
    const breath = Math.sin(st.time * 2.0), shift = Math.sin(st.time * 0.55) * (pose === 'idle' ? 1 : 0.5);
    const sway = shift * 0.009, roll = shift * 0.022, legA = -(sway + 0.445 * roll) / 0.415;
    B.hips.position.set(restHips.x + sway, restHips.y + pCur[PI.bounce], restHips.z);
    addEuler(B.hips, 0, 0, roll);
    addEuler(B.spine, 0, 0, -roll * 1.3);
    addEuler(B.chest, breath * 0.012 - st.talkAmt * Math.sin(st.time * 4.1) * 0.01, 0, 0);
    B.clavL.position.y = B.clavR.position.y = restClavY + breath * 0.003;
    for (let i = 0; i < 2; i++) { addEuler(SD[i].thigh, 0, 0, legA - roll); addEuler(SD[i].foot, 0, 0, -legA); }
    jumpLayer(dt);
    B.root.updateMatrixWorld(true);

    // arms: FK targets or IK, blended the same way
    for (let i = 0; i < 2; i++) { const sd = SD[i]; if (sd.ik) solveIK(sd); if (sd.orient) orientHand(sd); }
    for (let k = 0; k < ARM_SLOTS.length; k++) {
      const i = ARM_SLOTS[k];
      cur[i].slerpQuaternions(from[i], tgt[i], w); POSE_BONES[i].quaternion.copy(cur[i]);
    }
    if (st.jumpT >= 0) { // arms swing out during a hop: hanging arms lift, raised arms open wider, level (pointing) arms stay
      const k = Math.sin(clamp((st.jumpT - 0.1) / 0.5) * Math.PI) * 0.45;
      for (let i = 0; i < 2; i++) {
        const arm = SD[i].arm, down = -T.v.set(0, -1, 0).applyQuaternion(arm.quaternion).y;
        arm.quaternion.premultiply(addQ.setFromAxisAngle(AZ, k * down * SD[i].sign));
      }
    }

    lookLayer(dt);
    faceLayer(dt);
  }

  // Where Ali looks: the explicit target, else the viewer. While pointing/presenting and talking he glances at what he shows
  // (the first 1.2 s after a new pose or look target, then briefly every 5 s) and talks to the child in between, so the child
  // follows his gaze but mostly sees his face. A quiet Ali keeps looking at an explicit target.
  function viewerPos(out) {
    if (!opts.getViewer) return out.set(0, HC.y, 3).applyMatrix4(group.matrixWorld);
    const v = opts.getViewer(out);
    return v === out ? out : out.copy(v);
  }
  function lookPoint(out) {
    st.yawLimit = 1.05;
    const showing = pose === 'point' || pose === 'present', c = st.glanceT % 5, glance = st.glanceT < 1.2 || (c > 3.6 && c < 4.4);
    if (hasLook && !(showing && st.talkAmt > 0.5 && !glance)) return out.copy(lookV);
    if (showing && glance) {
      st.yawLimit = 0.75; // a glance keeps the face in view; the eyes do the rest
      return hasPoint ? out.copy(pointV) : out.copy(side[armSide].target).applyMatrix4(group.matrixWorld);
    }
    return out.copy(viewP);
  }

  function lookLayer(dt) {
    // target → chest space; yaw/pitch clamped (head ±60° / ±30°, and at most FACE_MAX away from the viewer),
    // shared neck 35% / head 65%; the eyes take the rest
    T.m.copy(B.chest.matrixWorld).invert();
    const vw = T.v2.copy(viewerPos(viewP)).applyMatrix4(T.m).sub(chestToHead);
    const tg = T.v.copy(lookPoint(lookP)).applyMatrix4(T.m).sub(chestToHead);
    const yaw = Math.atan2(tg.x, tg.z), pitch = Math.atan2(tg.y, Math.sqrt(tg.x * tg.x + tg.z * tg.z)), vYaw = Math.atan2(vw.x, vw.z);
    const lo = Math.max(-st.yawLimit, vYaw - FACE_MAX), hi = Math.min(st.yawLimit, vYaw + FACE_MAX);
    const k = 1 - Math.exp(-dt * 7);
    st.lookYaw += ((lo <= hi ? clamp(yaw, lo, hi) : clamp(vYaw, -st.yawLimit, st.yawLimit)) - st.lookYaw) * k;
    st.lookPitch += (clamp(pitch, -0.52, 0.52) - st.lookPitch) * k;
    B.neck.quaternion.premultiply(T.q.setFromEuler(T.eu.set(-st.lookPitch * 0.35, st.lookYaw * 0.35, 0, 'YXZ')));
    B.head.quaternion.premultiply(T.q.setFromEuler(T.eu.set(-st.lookPitch * 0.65 + st.talkAmt * Math.sin(st.time * 4.3) * 0.025,
      st.lookYaw * 0.65 + Math.sin(st.time * 0.7) * 0.03, Math.sin(st.time * 0.5) * 0.02, 'YXZ')));
    B.neck.updateMatrixWorld(true);
    // eyes: residual direction in head space + small saccades; a ~30 ms ease keeps big saccades from snapping in one frame
    const ke = 1 - Math.exp(-dt * 30);
    if ((st.saccT -= dt) <= 0) { st.saccT = 0.5 + R() * 2; sacc.set((R() - 0.5) * 0.12, (R() - 0.5) * 0.07, 0); }
    T.m.copy(B.head.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      const sd = SD[i], v = T.v.copy(lookP).applyMatrix4(T.m).sub(sd.eyeInHead);
      sd.eyeYaw += (clamp(Math.atan2(v.x, v.z) + sacc.x + pCur[PI.eyeSide], -0.4, 0.4) - sd.eyeYaw) * ke;
      sd.eyePitch += (clamp(Math.atan2(v.y, Math.sqrt(v.x * v.x + v.z * v.z)) + sacc.y + pCur[PI.eyeUp], -0.3, 0.35) - sd.eyePitch) * ke;
      sd.eye.quaternion.setFromEuler(T.eu.set(-sd.eyePitch, sd.eyeYaw, 0, 'YXZ'));
    }
  }

  function faceLayer(dt) {
    // blink every 2-5 s (sometimes a double blink): the lid bone squashes the eye
    if ((st.blinkT -= dt) <= 0 && st.blinkPhase < 0) { st.blinkPhase = 0; st.blinkT = R() < 0.2 ? 0.25 : 2 + R() * 3; }
    let blink = 0;
    if (st.blinkPhase >= 0) {
      st.blinkPhase += dt / 0.16; blink = Math.sin(Math.min(1, st.blinkPhase) * Math.PI);
      if (st.blinkPhase >= 1) st.blinkPhase = -1;
    }
    const joy = st.jumpT >= 0 ? Math.sin(clamp(st.jumpT / 0.82) * Math.PI) : 0; // happy face during a hop
    const open = 1 - Math.max(pCur[PI.squint], joy * 0.55) * 0.38;
    for (let i = 0; i < 2; i++) {
      const sd = SD[i];
      sd.lid.scale.set(0.95, Math.max(0.07, 1.1 * open * (1 - blink * 0.94)), 1);
      sd.index.scale.setScalar(Math.max(0.001, pCur[sd.pIndex]));
      // eyebrows: raise along the forehead and tilt (+ accents while talking)
      const raise = pCur[sd.pBrow] + st.talkAmt * Math.max(0, Math.sin(st.time * 2.3)) * 0.35 + joy * 0.5;
      sd.brow.position.copy(sd.browRest).addScaledVector(sd.browUp, raise * 0.011);
      sd.brow.rotation.set(0, 0, sd.sign * (pCur[sd.pTilt] - raise * 0.06));
    }
    // mouth: syllables with word gaps while talking, mixed with the pose's open amount
    let speak = 0;
    if (st.talkAmt > 0.01) {
      const syl = 0.5 + 0.5 * Math.sin(st.time * 13 + 1.6 * Math.sin(st.time * 3.1));
      const gap = Math.sin(st.time * 1.7) * Math.sin(st.time * 0.93 + 1) > 0.45 ? 0.15 : 1;
      speak = st.talkAmt * gap * (0.25 + 0.75 * syl) * (0.75 + 0.25 * Math.sin(st.time * 4.7));
    }
    B.jaw.rotation.x = Math.max(Math.max(pCur[PI.mouth], speak), joy * 0.6) * 0.26;
  }

  // hop: anticipation squash → stretch (builds over ~80 ms) → air (legs tuck, arms swing) → landing squash → settle.
  // A hop restarted during the landing starts from the current squash, so nothing pops.
  function jumpLayer(dt) {
    let h = 0, sy = 1, tuck = 0;
    if (st.jumpT >= 0) {
      const j = (st.jumpT += dt);
      if (j < 0.12) sy = lerp(st.jumpFromSy, 0.9, Math.sin((j / 0.12) * Math.PI / 2));
      else if (j < 0.54) {
        const k = (j - 0.12) / 0.42;
        h = 0.68 * k * (1 - k); tuck = Math.sin(k * Math.PI);
        sy = lerp(0.9, 1 + 0.1 * (1 - k) * (1 - k) - 0.02 * k, smooth(0, 0.2, k));
      } else if (j < 0.82) {
        const k = (j - 0.54) / 0.28;
        sy = 1 - 0.02 * (1 - k) - 0.12 * Math.sin(k * Math.PI) * (1 - 0.4 * k) + 0.025 * Math.sin(k * Math.PI * 2) * k;
      } else st.jumpT = -1;
    }
    st.squashY = sy;
    B.root.position.y = h;
    B.root.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    if (tuck > 0) for (let i = 0; i < 2; i++) { addEuler(SD[i].thigh, -0.45 * tuck, 0, 0); addEuler(SD[i].shin, tuck, 0, 0); }
    if (shadow) { const s = 1 - h * 2.2; shadow.scale.set(0.72 * s, 1, 0.6 * s); shadow.material.opacity = 0.35 * s; }
  }

  // start settled in the idle pose (a zero-length update solves the IK once)
  update(0, 0);
  for (let i = 0; i < NB; i++) from[i].copy(cur[i]);
  pFrom.set(pCur);

  return {
    group, head, bubbleAnchor, mesh, outline,
    setPose,
    get pose() { return pose; },
    pointAt(v) { hasPoint = !!v; if (v) pointV.copy(v); if (pose === 'point' || pose === 'present') chooseArm(); },
    lookAt(v) { hasLook = !!v; if (v) { lookV.copy(v); st.glanceT = 0; } },
    setTalking(v) { talking = !!v; },
    jump() { if (st.jumpT < 0 || st.jumpT > 0.78) { st.jumpFromSy = st.squashY; st.jumpT = 0; } },
    update,
    dispose() { geo.dispose(); olGeo.dispose(); skeleton.dispose(); shadow?.material.dispose(); },
  };
}
