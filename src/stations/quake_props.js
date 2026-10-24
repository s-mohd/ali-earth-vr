// Geometry for the earthquake diorama (station «الزلزال»): Bahraini houses, date palms, the street lamp, a car, birds and
// small street props. Everything is built from merged vertex-coloured parts (one draw call per object) with baked shading:
// darker wall bases and corners (ambient occlusion), soft plaster variation and lighter tops.
import { THREE, PAL, rng, clamp, lerp, smooth, fbm, mergeParts, roundedBox, blobGeo, gradient } from '../core/kit.js';

export const TAU = Math.PI * 2;
export const C = (h) => new THREE.Color(h);
export const shade = (hex, k) => C(hex).multiplyScalar(k);
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);

/** Multiply every vertex colour by fn(x, y, z, nx, ny, nz) (baked AO, plaster variation, light gradients). */
export function bake(geo, fn) {
  const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return geo;
}

/** Merge parts given in a local frame into one coloured geometry (used as a single part of a bigger object). */
const sub = (parts) => mergeParts(parts);

// ---------------------------------------------------------------- facade elements (frame: x along the wall, +z out of it)
function windowParts(ww, wh, o) {
  const P = [], white = C('#fffaf3'), trim = C(o.trim), fr = 0.024;
  // recessed glass with a sky reflection (light top, deep bottom)
  P.push({ geo: gradient(box(ww, wh, 0.01), '#4e8fb6', '#bfe6f7'), pos: [0, 0, 0.004] });
  // white frame bars (proud of the wall, so they catch light and cast small shadows)
  P.push({ geo: box(ww + 2 * fr, fr, 0.03), color: white, pos: [0, wh / 2 + fr / 2, 0.012] });
  P.push({ geo: box(ww + 2 * fr, fr, 0.03), color: white, pos: [0, -wh / 2 - fr / 2, 0.012] });
  for (const s of [-1, 1]) P.push({ geo: box(fr, wh, 0.03), color: white, pos: [s * (ww / 2 + fr / 2), 0, 0.012] });
  P.push({ geo: box(0.012, wh, 0.016), color: white, pos: [0, 0, 0.01] });
  // dark grille bars
  for (const b of [-0.3, 0.3]) P.push({ geo: box(0.007, wh, 0.02), color: C('#4a5260'), pos: [b * ww, 0, 0.016] });
  P.push({ geo: box(ww, 0.007, 0.02), color: C('#4a5260'), pos: [0, wh * 0.12, 0.016] });
  if (o.shutter) {
    for (const s of [-1, 1]) {
      const sw = ww * 0.46, x = s * (ww / 2 + fr + sw / 2 + 0.004);
      P.push({ geo: gradient(box(sw, wh + 0.03, 0.016), shade(o.shutter, 0.78), C(o.shutter)), pos: [x, 0, 0.01] });
      for (const yy of [-0.25, 0, 0.25]) P.push({ geo: box(sw * 0.8, 0.008, 0.006), color: shade(o.shutter, 0.7), pos: [x, yy * wh, 0.02] });
    }
  }
  // sill and a small lintel
  P.push({ geo: box(ww + 0.1, 0.022, 0.06), color: trim, pos: [0, -wh / 2 - fr - 0.011, 0.024] });
  P.push({ geo: box(ww + 0.08, 0.026, 0.035), color: trim, pos: [0, wh / 2 + fr + 0.013, 0.014] });
  if (o.ac) { // a window air-conditioner in the lower pane (very common in the Gulf)
    P.push({ geo: box(0.15, 0.095, 0.1), color: C('#efe9dc'), pos: [o.ac * ww * 0.18, -wh / 2 + 0.06, 0.04] });
    P.push({ geo: box(0.12, 0.05, 0.006), color: C('#8f969e'), pos: [o.ac * ww * 0.18, -wh / 2 + 0.065, 0.092] });
    P.push({ geo: box(0.008, 0.008, 0.04), color: C('#8f969e'), pos: [o.ac * ww * 0.18 + 0.05, -wh / 2 + 0.01, 0.07] });
  }
  return P;
}

function doorParts(o) {
  const P = [], dw = 0.2, dh = 0.34, trim = C(o.trim), door = C(o.door);
  // stone frame with a round arch
  P.push({ geo: box(dw + 0.07, dh + 0.02, 0.022), color: trim, pos: [0, (dh + 0.02) / 2, 0.006] });
  P.push({ geo: new THREE.CylinderGeometry(dw / 2 + 0.035, dw / 2 + 0.035, 0.022, 16, 1, false, -Math.PI / 2, Math.PI), color: trim, pos: [0, dh + 0.02, 0.006], rot: [Math.PI / 2, 0, 0] });
  // wooden leaves (darker at the bottom) with the arch fanlight
  P.push({ geo: gradient(box(dw, dh, 0.024), shade(o.door, 0.72), door), pos: [0, dh / 2, 0.011] });
  P.push({ geo: new THREE.CylinderGeometry(dw / 2, dw / 2, 0.024, 16, 1, false, -Math.PI / 2, Math.PI), color: shade(o.door, 1.08), pos: [0, dh, 0.011], rot: [Math.PI / 2, 0, 0] });
  P.push({ geo: box(0.008, dh, 0.03), color: shade(o.door, 0.6), pos: [0, dh / 2, 0.013] });
  for (const s of [-1, 1]) {
    P.push({ geo: box(0.07, 0.11, 0.008), color: shade(o.door, 0.86), pos: [s * 0.05, 0.25, 0.026] });
    P.push({ geo: box(0.07, 0.11, 0.008), color: shade(o.door, 0.86), pos: [s * 0.05, 0.1, 0.026] });
    for (const yy of [0.06, 0.17, 0.29]) P.push({ geo: box(0.012, 0.012, 0.01), color: C('#f1c04a'), pos: [s * 0.088, yy, 0.028] });
  }
  P.push({ geo: box(dw + 0.14, 0.03, 0.1), color: shade(o.trim, 0.92), pos: [0, 0.015, 0.05] }); // step
  P.push({ geo: box(0.05, 0.05, 0.035), color: C('#ffe9a8'), pos: [0, dh + 0.17, 0.02] }); // lamp above the door
  P.push({ geo: box(0.07, 0.012, 0.045), color: C('#6d5a48'), pos: [0, dh + 0.2, 0.024] });
  P.push({ geo: box(0.07, 0.045, 0.008), color: C('#2f6fb0'), pos: [dw / 2 + 0.09, dh * 0.72, 0.006] }); // blue house-number plate
  P.push({ geo: box(0.05, 0.02, 0.004), color: C('#ffffff'), pos: [dw / 2 + 0.09, dh * 0.72, 0.011] });
  return P;
}

function mashrabiyaParts(w, h) {
  // a projecting wooden lattice window on corbels with a little roof
  const P = [], wood = C('#9a6a42'), dark = C('#3b2a20');
  P.push({ geo: box(w, h, 0.012), color: dark, pos: [0, 0, 0.07] });
  P.push({ geo: box(w + 0.02, h + 0.02, 0.07), color: shade('#9a6a42', 0.85), pos: [0, 0, 0.035] });
  for (let i = 0; i <= 4; i++) P.push({ geo: box(0.012, h, 0.012), color: wood, pos: [-w / 2 + (w * i) / 4, 0, 0.082] });
  for (let j = 1; j < 4; j++) P.push({ geo: box(w, 0.012, 0.012), color: wood, pos: [0, -h / 2 + (h * j) / 4, 0.082] });
  P.push({ geo: box(w + 0.06, 0.03, 0.11), color: C('#b98457'), pos: [0, h / 2 + 0.025, 0.05] });
  P.push({ geo: box(w + 0.04, 0.03, 0.1), color: C('#b98457'), pos: [0, -h / 2 - 0.02, 0.05] });
  for (const s of [-1, 1]) P.push({ geo: box(0.03, 0.06, 0.07), color: shade('#9a6a42', 0.8), pos: [s * w * 0.35, -h / 2 - 0.06, 0.035] });
  return P;
}

/** Face transform of a house wall: side 'f' (front, +z), 'r' (+x), 'l' (-x); u runs left→right as seen from outside. */
function facePart(geo, side, w, d, u, y, out = 0) {
  if (side === 'f') return { geo, pos: [u, y, d / 2 + out] };
  if (side === 'r') return { geo, pos: [w / 2 + out, y, -u], rot: [0, Math.PI / 2, 0] };
  return { geo, pos: [-w / 2 - out, y, u], rot: [0, -Math.PI / 2, 0] };
}

/**
 * Flat-roofed Gulf house: plastered walls (subdivided so the baked plaster variation and AO read), skirting, frieze,
 * a parapet with stepped merlons, wooden rain spouts, an arched door, windows with shutters / AC units, and roof props.
 * o: { w, d, h, wall, trim, door, shutter, doorX, windows: [[side, u, y, ww, wh, opts]], barjeel, tank, dish, stair, mashrabiya, seed }
 */
export function houseGeo(o) {
  const { w, d, h } = o, P = [], wall = C(o.wall), trim = C(o.trim);
  const zf = d / 2, H = h + 0.02, y0 = -0.02;
  const face = (ww, nx, ny) => new THREE.PlaneGeometry(ww, H, nx, ny);
  const ny = Math.max(4, Math.round(H / 0.08));
  P.push({ geo: face(w, Math.round(w / 0.08), ny), color: wall, pos: [0, y0 + H / 2, zf] });
  P.push({ geo: face(w, 2, 2), color: wall, pos: [0, y0 + H / 2, -zf], rot: [0, Math.PI, 0] });
  P.push({ geo: face(d, Math.round(d / 0.1), ny), color: wall, pos: [w / 2, y0 + H / 2, 0], rot: [0, Math.PI / 2, 0] });
  P.push({ geo: face(d, Math.round(d / 0.1), ny), color: wall, pos: [-w / 2, y0 + H / 2, 0], rot: [0, -Math.PI / 2, 0] });
  // skirting, frieze band under the roof, roof slab
  P.push({ geo: box(w + 0.03, 0.075, d + 0.03), color: shade(o.wall, 0.8), pos: [0, 0.0175, 0] });
  P.push({ geo: box(w + 0.02, 0.03, d + 0.02), color: trim, pos: [0, h - 0.075, 0] });
  if (o.upper) P.push({ geo: box(w + 0.02, 0.026, d + 0.02), color: trim, pos: [0, o.upper, 0] });
  P.push({ geo: box(w + 0.06, 0.04, d + 0.06), color: trim, pos: [0, h + 0.02, 0] });
  // parapet + stepped merlons (شرفات)
  const ph = 0.065, py = h + 0.04 + ph / 2, pt = 0.035;
  P.push({ geo: box(w + 0.06, ph, pt), color: wall, pos: [0, py, zf + 0.03 - pt / 2] });
  P.push({ geo: box(w + 0.06, ph, pt), color: wall, pos: [0, py, -zf - 0.03 + pt / 2] });
  P.push({ geo: box(pt, ph, d + 0.06), color: wall, pos: [w / 2 + 0.03 - pt / 2, py, 0] });
  P.push({ geo: box(pt, ph, d + 0.06), color: wall, pos: [-w / 2 - 0.03 + pt / 2, py, 0] });
  P.push({ geo: box(w + 0.07, 0.014, d + 0.07), color: trim, pos: [0, h + 0.04 + ph, 0] });
  const my = h + 0.047 + ph;
  const merlon = (x, z) => {
    P.push({ geo: box(0.052, 0.04, 0.04), color: trim, pos: [x, my + 0.02, z] });
    P.push({ geo: box(0.026, 0.028, 0.03), color: trim, pos: [x, my + 0.054, z] });
  };
  const nx = Math.round((w + 0.04) / 0.12), nz = Math.round((d + 0.04) / 0.12);
  for (let i = 0; i <= nx; i++) { const x = -w / 2 - 0.012 + ((w + 0.024) * i) / nx; merlon(x, zf + 0.012); merlon(x, -zf - 0.012); }
  for (let i = 1; i < nz; i++) { const z = -d / 2 - 0.012 + ((d + 0.024) * i) / nz; merlon(w / 2 + 0.012, z); merlon(-w / 2 - 0.012, z); }
  // wooden rain spouts (مرازيم) poking out of the front parapet
  for (const s of [-0.36, 0.36]) P.push({ geo: cyl(0.011, 0.013, 0.1, 6), color: C('#8a5a3b'), pos: [s * w, h + 0.03, zf + 0.06], rot: [Math.PI / 2 - 0.15, 0, 0] });
  // door and windows
  P.push(facePart(sub(doorParts(o)), 'f', w, d, o.doorX, 0, 0));
  for (const [side, u, y, ww, wh, wo] of o.windows) P.push(facePart(sub(windowParts(ww, wh, { trim: o.trim, shutter: o.shutter, ...(wo || {}) })), side, w, d, u, y, 0));
  if (o.awning) { // striped fabric awning over the door
    const ax = o.doorX, ay = 0.62, n = 7, aw = 0.42;
    for (let i = 0; i < n; i++) {
      const c = C(i % 2 ? '#ffffff' : '#2fa39a');
      P.push({ geo: box(aw / n + 0.002, 0.012, 0.2), color: c, pos: [ax - aw / 2 + (aw * (i + 0.5)) / n, ay, zf + 0.085], rot: [0.5, 0, 0] });
      P.push({ geo: box(aw / n + 0.002, 0.045, 0.008), color: c, pos: [ax - aw / 2 + (aw * (i + 0.5)) / n, ay - 0.065, zf + 0.175] });
    }
    for (const sx of [-1, 1]) P.push({ geo: box(0.008, 0.008, 0.2), color: C('#5b6470'), pos: [ax + sx * aw * 0.48, ay - 0.06, zf + 0.09], rot: [-0.25, 0, 0] });
  }
  if (o.vents) { // a row of small pointed niches high on the wall
    const vy = h - 0.2, dark = shade(o.wall, 0.58);
    for (let i = 0; i < 5; i++) {
      const vx = (i - 2) * 0.16;
      P.push({ geo: box(0.04, 0.06, 0.008), color: dark, pos: [vx, vy, zf + 0.003] });
      P.push({ geo: box(0.0283, 0.0283, 0.008), color: dark, pos: [vx, vy + 0.03, zf + 0.003], rot: [0, 0, Math.PI / 4] });
      P.push({ geo: box(0.06, 0.012, 0.02), color: trim, pos: [vx, vy - 0.036, zf + 0.008] });
    }
  }
  if (o.mashrabiya) P.push(facePart(sub(mashrabiyaParts(0.3, 0.26)), 'f', w, d, o.mashrabiya[0], o.mashrabiya[1], 0));
  // roof props
  const roofY = h + 0.04;
  if (o.barjeel) {
    // wind tower: plastered shaft, tall dark openings split by a pier, wooden poles through it, crenellated cap
    const [bx, bz] = o.barjeel, bh = 0.64, bw = 0.3;
    P.push({ geo: gradient(box(bw, bh, bw), shade(o.wall, 0.86), C(o.wall)), pos: [bx, roofY + bh / 2, bz] });
    for (const [fx, fz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      for (const s of [-1, 1]) {
        const along = s * 0.062, x = bx + fx * (bw / 2 + 0.002) + (fz ? along : 0), z = bz + fz * (bw / 2 + 0.002) + (fx ? along : 0);
        P.push({ geo: box(fx ? 0.006 : 0.09, 0.3, fx ? 0.09 : 0.006), color: C('#2c2420'), pos: [x, roofY + bh - 0.2, z] });
      }
    }
    for (const yy of [0.16, 0.46]) P.push({ geo: cyl(0.01, 0.01, bw + 0.14, 5), color: C(PAL.trunkDark), pos: [bx, roofY + yy, bz + 0.06], rot: [0, 0, Math.PI / 2] });
    P.push({ geo: cyl(0.01, 0.01, bw + 0.14, 5), color: C(PAL.trunkDark), pos: [bx - 0.06, roofY + 0.31, bz], rot: [Math.PI / 2, 0, 0] });
    P.push({ geo: box(bw + 0.06, 0.035, bw + 0.06), color: trim, pos: [bx, roofY + bh + 0.017, bz] });
    for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 1], [1, 0], [-1, 0], [0, -1]]) {
      P.push({ geo: box(0.05, 0.05, 0.05), color: trim, pos: [bx + cx * 0.15, roofY + bh + 0.06, bz + cz * 0.15] });
      P.push({ geo: box(0.024, 0.03, 0.024), color: trim, pos: [bx + cx * 0.15, roofY + bh + 0.1, bz + cz * 0.15] });
    }
  }
  if (o.tank) { // white water tank with a blue lid on a little steel stand
    const [tx, tz, tr = 0.1] = o.tank;
    P.push({ geo: box(tr * 2.1, 0.05, tr * 2.1), color: C('#8c96a1'), pos: [tx, roofY + 0.025, tz] });
    P.push({ geo: gradient(cyl(tr, tr, tr * 2, 16), '#d9e2ea', '#ffffff'), pos: [tx, roofY + 0.05 + tr, tz] });
    P.push({ geo: cyl(tr * 1.02, tr * 1.02, 0.03, 16), color: C('#3f8fd0'), pos: [tx, roofY + 0.05 + tr * 1.6, tz] });
    P.push({ geo: cyl(tr * 0.35, tr * 0.35, 0.03, 10), color: C('#3f8fd0'), pos: [tx, roofY + 0.065 + tr * 2, tz] });
  }
  if (o.dish) {
    const [dx, dz] = o.dish;
    P.push({ geo: new THREE.SphereGeometry(0.08, 12, 4, 0, TAU, 0, 1.0), color: C('#f4f5f2'), pos: [dx, roofY + 0.15, dz], rot: [1.15, 0.6, 0] });
    P.push({ geo: cyl(0.008, 0.008, 0.15, 5), color: C('#9aa3ad'), pos: [dx, roofY + 0.075, dz] });
  }
  if (o.stair) { // roof stair-house with a little door
    const [sx, sz] = o.stair;
    P.push({ geo: gradient(box(0.3, 0.28, 0.26), shade(o.wall, 0.86), C(o.wall)), pos: [sx, roofY + 0.14, sz] });
    P.push({ geo: box(0.34, 0.03, 0.3), color: trim, pos: [sx, roofY + 0.295, sz] });
    P.push({ geo: box(0.1, 0.18, 0.012), color: C(o.door), pos: [sx + 0.06, roofY + 0.09, sz + 0.13] });
  }
  if (o.condenser) { // roof AC condenser
    const [cx, cz] = o.condenser;
    P.push({ geo: box(0.18, 0.12, 0.12), color: C('#e9e6df'), pos: [cx, roofY + 0.06, cz] });
    P.push({ geo: cyl(0.045, 0.045, 0.006, 12), color: C('#7d858e'), pos: [cx, roofY + 0.06, cz + 0.062], rot: [Math.PI / 2, 0, 0] });
  }
  const g = mergeParts(P);
  // baked light: AO at the foot of the walls and under the roof slab, soft plaster blotches, lighter roofline
  const sd = o.seed || 1;
  return bake(g, (x, y, z, nx_, ny_) => {
    let k = lerp(0.6, 1, smooth(-0.02, 0.32, y));
    if (Math.abs(ny_) < 0.6) {
      k *= 1 + 0.08 * fbm(x * 1.5 + sd * 7, y * 1.5 + z * 1.1 + sd, 2); // soft plaster blotches (low frequency: no aliasing on the 8 cm grid)
      k *= 1 - 0.14 * smooth(h - 0.11, h - 0.005, y) * (y < h ? 1 : 0); // under the frieze / roof slab
      k *= 1 + 0.06 * smooth(0.25, h, y); // walls catch more sky light toward the top
    }
    if (y > h + 0.03) k *= 1.05;
    return k;
  });
}

// ---------------------------------------------------------------- date palm
function frondGeo(len, yaw, pitch, droop, base, tip, width = 0.13, N = 11) {
  const pos = [], col = [], c = new THREE.Color();
  const dir = [Math.cos(yaw), Math.sin(yaw)], perp = [-dir[1], dir[0]];
  const pt = (s) => [dir[0] * len * s * Math.cos(pitch * (1 - s)), len * (Math.sin(pitch) * s - droop * s * s), dir[1] * len * s * Math.cos(pitch * (1 - s))];
  for (let j = 0; j < N; j++) {
    const s0 = j / N, s1 = (j + 1) / N, a = pt(s0), b = pt(s1), sm = (s0 + s1) / 2, m = pt(sm);
    const ww = width * Math.pow(Math.sin(Math.PI * Math.min(0.98, sm * 1.05 + 0.04)), 0.6);
    for (const sd of [-1, 1]) {
      const e = [m[0] + perp[0] * sd * ww + dir[0] * ww * 0.45, m[1] - ww * 0.45, m[2] + perp[1] * sd * ww + dir[1] * ww * 0.45];
      for (const [p, s] of [[a, s0], [b, s1], [e, sm + 0.1]]) { pos.push(...p); c.copy(base).lerp(tip, clamp(s)); col.push(c.r, c.g, c.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Date palm: trunk parts + crown parts (crown origin = trunk top). */
export function palmParts(seed, H, lean, nFronds = 12, dates = 3) {
  const r = rng(seed), trunk = [], crown = [];
  const n = 11, segH = H / n;
  for (let i = 0; i < n; i++) {
    const y = i * segH, k = (i + 0.5) / n, rad = lerp(0.08, 0.056, k);
    const ox = lean * k * k, slope = (2 * lean * k) / H;
    trunk.push({ geo: cyl(rad * 0.84, rad * 1.16, segH * 1.08, 8), color: shade(PAL.trunk, (i % 2 ? 1 : 0.84) * lerp(0.78, 1.05, k)), pos: [ox, y + segH / 2, 0], rot: [0, (i * 0.7) % 1, -slope] });
  }
  trunk.push({ geo: cyl(0.1, 0.14, 0.08, 9), color: shade(PAL.trunkDark, 0.85), pos: [0, 0.03, 0] });
  const leaf = C(PAL.palmLeaf), leafTip = C(PAL.leafLight), dry = C(PAL.palmDry);
  for (let i = 0; i < nFronds; i++) {
    const yaw = (i / nFronds) * TAU + r() * 0.35, upper = i % 3 === 0;
    crown.push({ geo: frondGeo(0.62 + r() * 0.16, yaw, upper ? 0.95 : 0.55 + r() * 0.2, upper ? 0.75 : 0.95 + r() * 0.2, shade(PAL.palmLeaf, 0.62), leaf.clone().lerp(leafTip, 0.55)) });
  }
  for (let i = 0; i < 2; i++) crown.push({ geo: frondGeo(0.5, r() * TAU, -0.6, 0.3, shade(PAL.palmDry, 0.8), dry, 0.1, 8), pos: [0, -0.04, 0] });
  crown.push({ geo: blobGeo(0.075, { detail: 1, seed: seed + 3, squash: 0.8 }), color: shade(PAL.trunk, 0.8), pos: [0, 0, 0] });
  const datePts = [];
  for (let c = 0; c < dates; c++) {
    const a = (c / dates) * TAU + 0.6, cx = Math.cos(a) * 0.1, cz = Math.sin(a) * 0.1;
    crown.push({ geo: cyl(0.008, 0.008, 0.12, 5), color: C('#e9b043'), pos: [cx * 0.7, -0.06, cz * 0.7], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
    for (let k = 0; k < 9; k++) {
      const ka = r() * TAU, kr = 0.02 + r() * 0.035, ky = -0.1 - r() * 0.09;
      const p = [cx + Math.cos(ka) * kr * (1 + ky * -2), ky, cz + Math.sin(ka) * kr * (1 + ky * -2)];
      crown.push({ geo: new THREE.IcosahedronGeometry(0.019, 0), color: C(k % 3 ? PAL.dates : '#e09a3a'), pos: p, scale: [1, 1.35, 1] });
      if (k === 0) datePts.push(p);
    }
  }
  return { trunk, crown, top: [lean, H, 0], datePts };
}

// ---------------------------------------------------------------- street furniture
/** Street lamp (origin at the base): concrete footing, slim dark pole, curved arm and lantern. */
export function lampParts() {
  const pole = C('#34495e'), poleHi = C('#4d6680'), P = [];
  P.push({ geo: roundedBox(0.15, 0.06, 0.15, 0.015, 1), color: C('#d9d2c4'), pos: [0, 0.03, 0] });
  P.push({ geo: cyl(0.038, 0.05, 0.12, 10), color: pole, pos: [0, 0.12, 0] });
  P.push({ geo: gradient(cyl(0.022, 0.03, 1.2, 10), pole, poleHi), pos: [0, 0.78, 0] });
  P.push({ geo: cyl(0.03, 0.03, 0.025, 10), color: poleHi, pos: [0, 0.6, 0] });
  P.push({ geo: new THREE.SphereGeometry(0.03, 10, 6), color: pole, pos: [0, 1.38, 0] });
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 1.35, 0), new THREE.Vector3(0, 1.56, 0), new THREE.Vector3(-0.2, 1.52, -0.2));
  P.push({ geo: new THREE.TubeGeometry(curve, 10, 0.015, 6), color: pole });
  P.push({ geo: cyl(0.05, 0.1, 0.06, 14), color: pole, pos: [-0.215, 1.49, -0.215] });
  P.push({ geo: cyl(0.014, 0.014, 0.04, 6), color: pole, pos: [-0.215, 1.535, -0.215] });
  return { parts: P, bulbPos: [-0.215, 1.452, -0.215] };
}

export function carGeo() {
  const body = C('#ef6f5e'), glass = C('#bfe6f5'), dark = C('#2f3640'), P = [];
  P.push({ geo: gradient(roundedBox(0.42, 0.1, 0.2, 0.035, 2).clone(), shade('#ef6f5e', 0.78), body), pos: [0, 0.09, 0] });
  P.push({ geo: roundedBox(0.25, 0.1, 0.18, 0.04, 2), color: body, pos: [-0.03, 0.17, 0] });
  P.push({ geo: gradient(box(0.2, 0.055, 0.184), '#7fb7d4', '#d8f2fb'), pos: [-0.03, 0.18, 0] });
  P.push({ geo: gradient(box(0.254, 0.055, 0.14), '#7fb7d4', '#d8f2fb'), pos: [-0.03, 0.18, 0] });
  P.push({ geo: box(0.008, 0.06, 0.186), color: body, pos: [-0.03, 0.18, 0] });
  for (const sz of [-1, 1]) {
    P.push({ geo: box(0.03, 0.025, 0.04), color: C('#fff6c8'), pos: [0.205, 0.1, sz * 0.065] });
    P.push({ geo: box(0.03, 0.022, 0.035), color: C('#e84a3a'), pos: [-0.205, 0.105, sz * 0.068] });
    P.push({ geo: box(0.03, 0.012, 0.012), color: C('#2f3640'), pos: [0.0, 0.125, sz * 0.104] });
    for (const sx of [-1, 1]) {
      P.push({ geo: cyl(0.046, 0.046, 0.034, 12), color: dark, pos: [sx * 0.13, 0.046, sz * 0.092], rot: [Math.PI / 2, 0, 0] });
      P.push({ geo: cyl(0.022, 0.022, 0.038, 8), color: C('#d5d9de'), pos: [sx * 0.13, 0.046, sz * 0.092], rot: [Math.PI / 2, 0, 0] });
    }
  }
  P.push({ geo: box(0.44, 0.025, 0.205), color: C('#5c6470'), pos: [0, 0.05, 0] });
  P.push({ geo: box(0.02, 0.03, 0.15), color: C('#d5d9de'), pos: [0.215, 0.07, 0] });
  return mergeParts(P);
}

/** White-eared bulbul (faces +z): body parts, and one wing that extends along +x from its root. */
export function bulbulGeo() {
  const P = [];
  P.push({ geo: new THREE.IcosahedronGeometry(0.032, 1), color: C('#8c8075'), pos: [0, 0, 0], scale: [0.8, 0.78, 1.3] });
  P.push({ geo: new THREE.IcosahedronGeometry(0.024, 0), color: C('#d9d0c4'), pos: [0, -0.008, 0.012], scale: [0.75, 0.7, 1] });
  P.push({ geo: new THREE.IcosahedronGeometry(0.023, 0), color: C('#34302e'), pos: [0, 0.03, 0.035] });
  for (const sx of [-1, 1]) P.push({ geo: new THREE.IcosahedronGeometry(0.009, 0), color: C('#ffffff'), pos: [sx * 0.017, 0.027, 0.04] });
  P.push({ geo: new THREE.ConeGeometry(0.007, 0.022, 5), color: C('#3b3633'), pos: [0, 0.028, 0.065], rot: [Math.PI / 2, 0, 0] });
  P.push({ geo: box(0.024, 0.006, 0.05), color: C('#5e5650'), pos: [0, 0.006, -0.06], rot: [-0.35, 0, 0] });
  P.push({ geo: box(0.016, 0.012, 0.016), color: C('#f2c230'), pos: [0, -0.012, -0.035] });
  return { body: mergeParts(P), wing: new THREE.BoxGeometry(0.06, 0.006, 0.045).translate(0.03, 0, -0.005) };
}

/** Garden wall closing an alley, with a bougainvillea spilling over it (origin: wall centre at the ground). */
export function alleyWallGeo(len, h, seed) {
  const r = rng(seed), P = [], wall = '#f0dcbc';
  P.push({ geo: new THREE.PlaneGeometry(len, h, 6, 4), color: C(wall), pos: [0, h / 2 - 0.01, 0.04] });
  P.push({ geo: box(len, h, 0.07), color: C(wall), pos: [0, h / 2 - 0.01, 0] });
  P.push({ geo: box(len + 0.04, 0.03, 0.1), color: C(PAL.parapet), pos: [0, h + 0.005, 0] });
  P.push({ geo: box(len + 0.03, 0.05, 0.085), color: shade(wall, 0.8), pos: [0, 0.015, 0] });
  // bougainvillea: green mass + magenta flower clusters (the earthquake hue, on purpose)
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * len * 1.1, y = h + 0.02 + r() * 0.08, z = (r() - 0.3) * 0.12;
    P.push({ geo: blobGeo(0.06 + r() * 0.03, { detail: 1, seed: seed + i, jitter: 0.25 }), color: C(i % 3 ? PAL.leafDark : PAL.leaf), pos: [x, y, z] });
  }
  for (let i = 0; i < 12; i++) {
    const x = (r() - 0.5) * len * 1.15, y = h - 0.06 + r() * 0.2, z = 0.04 + r() * 0.06;
    P.push({ geo: new THREE.IcosahedronGeometry(0.026 + r() * 0.014, 0), color: C(['#d6457a', '#e8609a', '#c23a6c'][i % 3]), pos: [x, y, z] });
  }
  const g = mergeParts(P);
  return bake(g, (x, y) => lerp(0.68, 1, smooth(-0.01, 0.2, y)) * (1 + 0.06 * fbm(x * 4 + 3, y * 4, 2)));
}

/** Flower pot that can tip over: origin at the pivot (bottom rim on the +x side). */
export function potGeo(s = 1) {
  const P = [], terra = '#cf7d5c', rr = 0.07 * s;
  P.push({ geo: gradient(cyl(rr, rr * 0.75, 0.13 * s, 12), shade(terra, 0.75), C(terra)), pos: [-rr * 0.75, 0.065 * s, 0] });
  P.push({ geo: cyl(rr * 1.1, rr * 1.1, 0.025 * s, 12), color: shade(terra, 1.1), pos: [-rr * 0.75, 0.125 * s, 0] });
  P.push({ geo: cyl(rr * 0.95, rr * 0.95, 0.01, 12), color: C('#5a3b26'), pos: [-rr * 0.75, 0.133 * s, 0] });
  P.push({ geo: blobGeo(0.085 * s, { detail: 1, seed: 5, jitter: 0.22 }), color: C(PAL.leaf), pos: [-rr * 0.75, 0.2 * s, 0] });
  const fr = rng(3);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + fr(); P.push({ geo: new THREE.IcosahedronGeometry(0.02 * s, 0), color: C(['#ff8fb1', '#ffd45c', '#ffffff'][i % 3]), pos: [-rr * 0.75 + Math.cos(a) * 0.06 * s, 0.23 * s + fr() * 0.03, Math.sin(a) * 0.06 * s] }); }
  return mergeParts(P);
}

/** A zig-zag hairline as a thin dark strip in the xy-plane (faces +z), starting at the origin; reveal by scaling. */
export function hairlineGeo(pts, width, color = '#2a1e1a') {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const wv = width * (1 - (0.7 * i) / (pts.length - 1));
    pos.push(pts[i][0] - dy * wv, pts[i][1] + dx * wv, 0, pts[i][0] + dy * wv, pts[i][1] - dx * wv, 0);
  }
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0, 1);
  const out = g.toNonIndexed();
  const c = C(color), col = new Float32Array(out.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
