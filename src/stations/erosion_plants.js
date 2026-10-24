// Small static props for station 4 «التعرية» (all merged by the caller into one vertex-coloured mesh):
// date palm, shaded bushes, grass tufts, reeds with cattails, boulders. Colours are baked per vertex with a dark base and
// a light top, so every prop sits in the ground (cheap ambient occlusion) and reads well against the real sun shadows.
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { THREE, PAL, rng, clamp, smooth, blobGeo } from '../core/kit.js';

const _c = new THREE.Color(), _a = new THREE.Color(), _b = new THREE.Color();

/** Smooth-shaded lumpy blob (kit blobGeo is faceted because icosahedra are non-indexed). */
export function softBlob(r, opts) {
  let g = blobGeo(r, opts);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}

/** Vertical colour ramp baked into a geometry (local y from y0 to y1), with a little value noise. */
function ramp(geo, bottom, top, y0, y1, seed = 1, jitter = 0.05) {
  const p = geo.attributes.position, r = rng(seed), cl = new Float32Array(p.count * 3);
  _a.set(bottom); _b.set(top);
  for (let i = 0; i < p.count; i++) {
    const k = clamp((p.getY(i) - y0) / (y1 - y0));
    _c.copy(_a).lerp(_b, k * k * (3 - 2 * k)).multiplyScalar(1 + (r() - 0.5) * jitter);
    cl[i * 3] = _c.r; cl[i * 3 + 1] = _c.g; cl[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  return geo;
}

/** Date palm parts: curved ringed trunk, arching fronds, dates. */
export function palmParts(x, y, z, h, yaw, seed) {
  const r = rng(seed), parts = [];
  const trunk = new THREE.CylinderGeometry(0.05, 0.085, h, 8, 12).translate(0, h / 2, 0);
  const p = trunk.attributes.position, cl = [], bend = 0.16 * h;
  const cA = new THREE.Color(PAL.trunk), cB = new THREE.Color(PAL.trunkDark), cFoot = new THREE.Color('#5e4129');
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i), k = yy / h, ring = 1 + 0.12 * Math.max(0, Math.sin(yy * 42));
    p.setX(i, p.getX(i) * ring + bend * k * k); p.setZ(i, p.getZ(i) * ring);
    _c.copy(cA).lerp(cB, Math.max(0, Math.sin(yy * 42)) * 0.8).lerp(cFoot, 1 - smooth(0, 0.18, k));
    cl.push(_c.r, _c.g, _c.b);
  }
  trunk.computeVertexNormals();
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  parts.push({ geo: trunk, pos: [x, y, z], rot: [0, yaw, 0] });
  const top = [x + Math.cos(yaw) * bend, y + h, z - Math.sin(yaw) * bend];
  const L = 0.42 + h * 0.22;
  const leaf = new THREE.BoxGeometry(0.13, 0.012, L, 1, 1, 8).translate(0, 0, L / 2);
  const lp = leaf.attributes.position;
  for (let i = 0; i < lp.count; i++) { const k = lp.getZ(i) / L; lp.setX(i, lp.getX(i) * (1 - k * 0.8) * (0.6 + Math.sin(k * Math.PI) * 0.6)); lp.setY(i, lp.getY(i) + 0.22 * L * k - 0.75 * L * k * k); }
  leaf.computeVertexNormals();
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3, tilt = -0.25 + r() * 0.35;
    // each frond runs from a dark base to a light tip
    const g = leaf.clone(), gp = g.attributes.position, gc = new Float32Array(gp.count * 3);
    _a.set([PAL.leafDark, '#4f9a4c', PAL.palmLeaf][i % 3]); _b.set(['#8fd07a', PAL.leafLight, '#a8d86f'][i % 3]);
    for (let k = 0; k < gp.count; k++) { _c.copy(_a).lerp(_b, clamp(gp.getZ(k) / L)); gc[k * 3] = _c.r; gc[k * 3 + 1] = _c.g; gc[k * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(gc, 3));
    parts.push({ geo: g, pos: top, rot: [tilt, a, 0], scale: 0.85 + r() * 0.3 });
  }
  for (let i = 0; i < 6; i++) parts.push({ geo: new THREE.IcosahedronGeometry(0.032, 0), pos: [top[0] + Math.cos(i * 1.1) * 0.07, top[1] - 0.07 - (i % 2) * 0.03, top[2] + Math.sin(i * 1.1) * 0.07], color: PAL.dates });
  parts.push({ geo: new THREE.SphereGeometry(0.075, 8, 6), pos: top, color: PAL.trunkDark, scale: [1, 0.7, 1] });
  return parts;
}

/** A rounded bush: a main blob and 1-2 side blobs, dark at the ground, light on top. */
export function bushParts(x, y, z, s, seed, hue = 0) {
  const r = rng(seed), parts = [];
  const tones = [['#3f8a45', '#8fd07a'], ['#4a9a4a', '#a6dc84'], ['#3a7f48', '#7cc77a']][hue % 3];
  const blobs = [[0, 0, 0, 1]];
  const n = s > 0.13 ? 2 : 1;
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2; blobs.push([Math.cos(a) * s * 0.75, -s * 0.18, Math.sin(a) * s * 0.75, 0.62 + r() * 0.15]); }
  for (const [ox, oy, oz, k] of blobs) {
    const rr = s * k, g = softBlob(rr, { detail: k === 1 && s > 0.12 ? 2 : 1, jitter: 0.18, seed: seed + Math.round(ox * 100), squash: 0.82 });
    ramp(g, tones[0], tones[1], -rr * 0.8, rr * 0.9, seed, 0.06);
    parts.push({ geo: g, pos: [x + ox, y + rr * 0.55 + oy, z + oz] });
  }
  return parts;
}

/** Grass tuft: thin three-sided blades leaning out (visible from every side with one-sided material). */
export function tuftGeo(seed, { blades = 6, h = 0.09, w = 0.008, spread = 0.025, base = '#4d9a44', tip = '#b5e07c', lean = 0.5 } = {}) {
  const r = rng(seed), pos = [], col = [], nrm = [];
  _a.set(base); _b.set(tip);
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + r() * 0.8, d = spread * (0.3 + r() * 0.7);
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d, hh = h * (0.6 + r() * 0.55), l = hh * lean * (0.5 + r() * 0.7);
    const tx = bx + Math.cos(a) * l, tz = bz + Math.sin(a) * l;
    const ww = w * (0.8 + r() * 0.5), rot = r() * 6.28;
    const B = [0, 1, 2].map((k) => [bx + Math.cos(rot + k * 2.09) * ww, 0, bz + Math.sin(rot + k * 2.09) * ww]);
    const tipC = _c.copy(_b).multiplyScalar(0.92 + r() * 0.16).clone();
    for (let k = 0; k < 3; k++) {
      const p0 = B[k], p1 = B[(k + 1) % 3];
      pos.push(...p0, ...p1, tx, hh, tz);
      // soft normals: half the face normal, half straight up (blades light like a lawn, not like knives)
      const ex = p1[0] - p0[0], ez = p1[2] - p0[2], fx = tx - p0[0], fy = hh, fz = tz - p0[2];
      let nx = -(ez * fy), ny = ez * fx - ex * fz, nz = ex * fy;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const ux = nx * 0.5, uy = ny * 0.5 + 0.5, uz = nz * 0.5, ul = Math.hypot(ux, uy, uz);
      for (let v = 0; v < 3; v++) nrm.push(ux / ul, uy / ul, uz / ul);
      col.push(_a.r, _a.g, _a.b, _a.r, _a.g, _a.b, tipC.r, tipC.g, tipC.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Reed clump with a few brown cattails. */
export function reedParts(x, y, z, seed, s = 1) {
  const r = rng(seed), parts = [];
  parts.push({ geo: tuftGeo(seed, { blades: 9, h: 0.24 * s, w: 0.009, spread: 0.04 * s, base: '#3f7f3c', tip: '#a9cf6a', lean: 0.22 }), pos: [x, y - 0.01, z] });
  const cat = new THREE.CylinderGeometry(0.011, 0.011, 0.055, 6).translate(0, 0.0275, 0);
  const stem = new THREE.CylinderGeometry(0.0035, 0.004, 1, 4).translate(0, 0.5, 0);
  for (let i = 0; i < 3; i++) {
    const a = r() * 6.28, d = 0.02 * s, hh = (0.2 + r() * 0.08) * s, lx = x + Math.cos(a) * d, lz = z + Math.sin(a) * d, tilt = (r() - 0.5) * 0.25;
    parts.push({ geo: stem, pos: [lx, y - 0.01, lz], rot: [tilt, 0, tilt * 0.6], scale: [1, hh, 1], color: '#6f9a45' });
    parts.push({ geo: cat, pos: [lx + Math.sin(tilt * 0.6) * -hh, y - 0.01 + hh * Math.cos(tilt), lz + Math.sin(tilt) * hh], rot: [tilt, 0, tilt * 0.6], color: '#7a4a2a' });
  }
  return parts;
}

/** A pale rock / boulder, darker underneath. */
export function boulderGeo(s, seed, { light = '#e2d2b8', dark = '#a58d72', squash = 0.72, jitter = 0.28 } = {}) {
  const g = blobGeo(s, { detail: 1, jitter, seed, squash });
  return ramp(g, dark, light, -s * squash * 0.7, s * squash * 0.8, seed, 0.08);
}
