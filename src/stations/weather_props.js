// Props for the weathering station («التجوية»): the "time window" stele (days pass), the hot sun and its heat shimmer,
// the sidr seedling and its root, the sand detail texture, desert shrubs and a sidr tree. Build-time helpers only.
import { THREE, rng, clamp, lerp, blobGeo, gradient, canvas, mergeParts } from '../core/kit.js';

const V3 = THREE.Vector3;

// ---------------------------------------------------------------- sand detail (one tileable canvas texture)
/** Wind ripples + grain, near-white so the ground's vertex colours give the hue. Tiles seamlessly. */
export function sandTexture(size = 512) {
  const c = canvas(size, size), x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data, r = rng(41);
  const TAU = Math.PI * 2, N = 9; // ripples per tile
  const grain = new Float32Array(size * size);
  for (let i = 0; i < grain.length; i++) grain[i] = r();
  for (let j = 0; j < size; j++) {
    const w = j / size;
    for (let i = 0; i < size; i++) {
      const u = i / size;
      // periodic in u and w: integer multipliers only
      const ph = u * N + 0.28 * Math.sin(TAU * (w + u)) + 0.12 * Math.sin(TAU * (w * 2 - u) + 1.3) + 0.06 * Math.sin(TAU * (w * 4 + 0.4));
      const s = ph - Math.floor(ph);
      // gentle stoss slope up to a bright crest, then a short darker lee; the ripples fade in and out
      const amp = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(TAU * (u * 2 + w * 3) + 0.7)) * (0.6 + 0.4 * Math.sin(TAU * (w * 2 - u * 3)));
      let v = s < 0.72 ? lerp(0.95, 1.0, s / 0.72) : s < 0.8 ? lerp(1.0, 0.88, (s - 0.72) / 0.08) : lerp(0.88, 0.95, (s - 0.8) / 0.2);
      v = 1 - (1 - v) * amp;
      const g = grain[j * size + i], g2 = grain[((j * 7 + 3) % size) * size + ((i * 5 + 11) % size)];
      v *= 0.97 + 0.05 * g;
      if (g2 > 0.9965) v *= 0.62; // a dark grain now and then
      else if (g2 < 0.004) v = Math.min(1.08, v * 1.08);
      const k = (j * size + i) * 4, b = Math.round(clamp(v / 1.08) * 255);
      d[k] = b; d[k + 1] = Math.round(b * 0.985); d[k + 2] = Math.round(b * 0.96); d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------------------------------------------------------------- vegetation (parts for mergeParts)
/** A desert shrub (arfaj-like): a dome of thin twigs with small grey-green leaf clusters and a few yellow flowers. */
export function desertShrub(parts, x, y, z, s, seed, { dry = false } = {}) {
  const r = rng(seed);
  const leaf = dry ? ['#b9a56a', '#a99559', '#c7b47a'] : ['#8fa65a', '#9db466', '#7f9a4f', '#a9bb72'];
  const twig = dry ? '#8d6e4a' : '#7a5a3c';
  const n = 9 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, tilt = 0.35 + r() * 0.55, L = (0.13 + r() * 0.08) * s;
    const dx = Math.sin(tilt) * Math.cos(a), dy = Math.cos(tilt), dz = Math.sin(tilt) * Math.sin(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), new V3(dx, dy, dz));
    const e = new THREE.Euler().setFromQuaternion(q);
    parts.push({ geo: new THREE.CylinderGeometry(0.0035 * s, 0.007 * s, L, 3, 1, true), color: twig, pos: [x + (dx * L) / 2, y + (dy * L) / 2, z + (dz * L) / 2], rot: [e.x, e.y, e.z] });
    // leaf cluster at the tip and one half-way
    for (const f of [1, 0.6]) {
      const rad = (f === 1 ? 0.045 : 0.034) * s * (0.8 + r() * 0.4);
      parts.push({ geo: blobGeo(1, { detail: 0, jitter: 0.3, seed: seed * 31 + i * 3 + f * 7 }), color: leaf[Math.floor(r() * leaf.length)], pos: [x + dx * L * f, y + dy * L * f + rad * 0.3, z + dz * L * f], scale: [rad, rad * 0.75, rad] });
    }
  }
  if (!dry) for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2, rr = (0.05 + r() * 0.08) * s;
    parts.push({ geo: new THREE.IcosahedronGeometry(0.014 * s, 0), color: i % 2 ? '#ffd23f' : '#fff0a0', pos: [x + Math.cos(a) * rr, y + (0.17 + r() * 0.05) * s, z + Math.sin(a) * rr] });
  }
}

/** Sidr tree (Ziziphus spina-christi), the seedling's parent: a crooked trunk and a broad, dark-green crown. */
export function sidrTree(parts, x, y, z, s, seed) {
  const r = rng(seed);
  const bark = '#6e4d33', bark2 = '#83603f';
  const seg = (a, b, r0, r1, col) => {
    const d = new V3().subVectors(b, a), L = d.length();
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()));
    parts.push({ geo: new THREE.CylinderGeometry(r1, r0, L, 6, 1, true), color: col, pos: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], rot: [e.x, e.y, e.z] });
  };
  const p0 = new V3(x, y - 0.02, z), p1 = new V3(x + 0.05 * s, y + 0.38 * s, z - 0.02 * s), p2 = new V3(x - 0.03 * s, y + 0.62 * s, z + 0.03 * s);
  seg(p0, p1, 0.05 * s, 0.038 * s, bark); seg(p1, p2, 0.038 * s, 0.028 * s, bark2);
  const tips = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6, tip = new V3(p2.x + Math.cos(a) * 0.26 * s, p2.y + (0.16 + r() * 0.1) * s, p2.z + Math.sin(a) * 0.2 * s);
    seg(p1.clone().lerp(p2, 0.6 + i * 0.1), tip, 0.022 * s, 0.012 * s, bark2);
    tips.push(tip);
  }
  // root flare
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.3; seg(new V3(x, y + 0.08 * s, z), new V3(x + Math.cos(a) * 0.12 * s, y - 0.01, z + Math.sin(a) * 0.12 * s), 0.026 * s, 0.012 * s, bark); }
  // crown: overlapping flattened blobs, darker underneath (each blob gets a vertical gradient)
  const crown = [[0, 0.86, 0, 0.36], [0.24, 0.8, 0.06, 0.25], [-0.24, 0.81, -0.04, 0.26], [0.04, 0.8, 0.22, 0.24], [-0.02, 0.84, -0.22, 0.25], [0.1, 1.0, 0, 0.22], [-0.12, 0.97, 0.06, 0.2]];
  crown.forEach(([cx, cy, cz, cr], i) => {
    const g = blobGeo(1, { detail: 1, jitter: 0.28, seed: seed * 13 + i });
    gradient(g, i % 2 ? '#4f7f3a' : '#557f3c', i % 3 ? '#86b356' : '#7aa94e');
    parts.push({ geo: g, pos: [x + cx * s, y + cy * s, z + cz * s], scale: [cr * s, cr * 0.62 * s, cr * s] });
  });
  // a few dull-orange sidr fruits
  for (let i = 0; i < 7; i++) { const a = r() * Math.PI * 2; parts.push({ geo: new THREE.IcosahedronGeometry(0.018 * s, 0), color: i % 2 ? '#d9922e' : '#c8781f', pos: [x + Math.cos(a) * 0.3 * s, y + (0.74 + r() * 0.12) * s, z + Math.sin(a) * 0.26 * s] }); }
}

/** Small desert pebbles (grey, rust, dark chert: never the boulder's ochre, so none looks like a piece of it). */
export function pebbleField(parts, { count, seed, ok, heightAt }) {
  const r = rng(seed), cols = ['#9b958b', '#857d73', '#a8705a', '#6f6660', '#b7aea0', '#8c5f4b'];
  for (let i = 0, tries = 0; i < count && tries < count * 40; tries++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 2.6, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!ok(x, z)) continue;
    const s = 0.012 + r() * r() * 0.03;
    parts.push({ geo: new THREE.OctahedronGeometry(1, 0), color: cols[Math.floor(r() * cols.length)], pos: [x, heightAt(x, z) + s * 0.15, z], rot: [r() * 3, r() * 3, r() * 3], scale: [s * (1 + r() * 0.5), s * 0.55, s] });
    i++;
  }
}

// ---------------------------------------------------------------- the time window: days pass (an arched stele in the sand)
// A carved sandstone stele with an arched window at the top. Inside the window the sky turns day/dusk/night, and a wheel
// carries the sun and the moon round: they rise from behind a little dune at the window's sill and set again. The lower
// half of the wheel sits inside the stele's body, so it is never seen. Faces the viewer; origin at its foot.
export function timeWindow({ R = 0.42, sill = 0.78, foot = 0 } = {}) {
  const group = new THREE.Group();
  const geos = [];
  const keep = (g) => { geos.push(g); return g; };
  const W = R + 0.1, D = 0.14; // half width, depth
  // sky: the upper half disc (unlit, tinted per time of day)
  const skyGeo = keep(gradient(new THREE.CircleGeometry(R, 40, 0, Math.PI), '#ffffff', '#cbd8ea'));
  const skyMat = new THREE.MeshBasicMaterial({ color: '#8fd3f5', vertexColors: true, toneMapped: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.set(0, sill, -0.035);
  group.add(sky);
  // wheel: sun with rays on top, crescent moon with stars underneath
  const SR = R * 0.66, wp = [];
  wp.push({ geo: new THREE.CircleGeometry(0.078, 20), color: '#ffd23f', pos: [0, SR, 0.004] });
  wp.push({ geo: new THREE.CircleGeometry(0.058, 20), color: '#ffe680', pos: [0, SR, 0.006] });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, ray = new THREE.Shape();
    ray.moveTo(-0.017, 0); ray.lineTo(0.017, 0); ray.lineTo(0, 0.045);
    wp.push({ geo: new THREE.ShapeGeometry(ray), color: '#ffab3d', pos: [Math.cos(a) * 0.088, SR + Math.sin(a) * 0.088, 0.002], rot: [0, 0, a - Math.PI / 2] });
  }
  {
    const moon = new THREE.Shape(), mr = 0.085, dx = 0.06, yi = Math.sqrt(mr * mr - (dx / 2) ** 2), al = Math.atan2(yi, dx / 2);
    for (let i = 0; i <= 18; i++) { const a = lerp(al, Math.PI * 2 - al, i / 18); i ? moon.lineTo(mr * Math.cos(a), mr * Math.sin(a)) : moon.moveTo(mr * Math.cos(a), mr * Math.sin(a)); }
    const b1 = Math.atan2(-yi, -dx / 2), b2 = Math.atan2(yi, -dx / 2) - Math.PI * 2;
    for (let i = 1; i < 18; i++) { const b = lerp(b1, b2, i / 18); moon.lineTo(dx + mr * Math.cos(b), mr * Math.sin(b)); }
    wp.push({ geo: new THREE.ShapeGeometry(moon), color: '#fff3c4', pos: [-0.012, -SR, 0.004], rot: [0, 0, Math.PI] });
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.01 : 0.025; i ? star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const sg = new THREE.ShapeGeometry(star);
    for (const [x, y, s] of [[0.15, -0.2, 1], [-0.14, -0.16, 0.8], [0.2, -0.36, 0.7], [-0.2, -0.38, 0.9], [0.03, -0.11, 0.6], [-0.06, -0.44, 0.55]]) wp.push({ geo: sg, color: '#ffffff', pos: [x * R / 0.42, y * R / 0.42, 0.003], scale: s });
  }
  const wheelGeo = keep(mergeFlat(wp));
  const wheel = new THREE.Mesh(wheelGeo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  wheel.position.set(0, sill, -0.02);
  group.add(wheel);
  // motion-blur trails behind the sun and the moon (at full speed the days blur, too fast to count)
  const trailGeo = keep((() => {
    const L = Math.PI * 0.8, n = 24, pos = [], col = [], idx = [];
    for (const [a0, rgb] of [[Math.PI / 2, [1, 0.84, 0.3]], [-Math.PI / 2, [0.94, 0.95, 1]]]) {
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const u = i / n, a = a0 + u * L, fade = Math.pow(1 - u, 1.5);
        for (const rr of [SR - 0.075, SR + 0.075]) { pos.push(Math.cos(a) * rr, Math.sin(a) * rr, -0.003); col.push(...rgb, fade); }
        if (i < n) { const v = base + i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    return g;
  })());
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  wheel.add(trail);

  // the stele (lit, vertex colours): base slab, body, arch, keystone, sill dune, a fast-forward badge
  const sand = '#e2c697', sandLt = '#efdab2', sandDk = '#c9a574', ink = '#2f4a7a';
  const fp = [];
  const box = (w, h, d, r, col, pos) => fp.push({ geo: roundedBoxGeo(w, h, d, r), color: col, pos });
  box(2 * W + 0.12, 0.12, D + 0.14, 0.035, sandDk, [0, foot + 0.04, 0]); // base slab (sunk 2 cm)
  {
    // body: shaded darker toward the sand
    const g = roundedBoxGeo(2 * W, sill - foot - 0.08 + 0.02, D, 0.03);
    gradient(g, sandDk, sandLt);
    fp.push({ geo: g, pos: [0, foot + 0.09 + (sill - foot - 0.08) / 2, 0] });
  }
  // arch: a thick half ring around the window, flush with the body's sides
  {
    const shape = new THREE.Shape();
    const ro = W, ri = R + 0.005, n = 32;
    shape.moveTo(ro, 0);
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; shape.lineTo(ro * Math.cos(a), ro * Math.sin(a)); }
    for (let i = n; i >= 0; i--) { const a = (i / n) * Math.PI; shape.lineTo(ri * Math.cos(a), ri * Math.sin(a)); }
    const g = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -D / 2);
    gradient(g, sand, sandLt, 0, ro);
    fp.push({ geo: g, pos: [0, sill, 0] });
  }
  // keystone and two spring stones (deep blue: the colour of the night sky)
  fp.push({ geo: roundedBoxGeo(0.1, 0.12, D + 0.04, 0.025), color: ink, pos: [0, sill + W - 0.04, 0.005] });
  for (const sx of [-1, 1]) fp.push({ geo: roundedBoxGeo(0.12, 0.06, D + 0.03, 0.02), color: ink, pos: [sx * (W - 0.05), sill + 0.01, 0.005] });
  // the sill: a little dune skyline in front of the wheel (the sun rises from behind it)
  {
    const s = new THREE.Shape(), n = 16, hr = R + 0.01;
    s.moveTo(-hr, -0.03);
    for (let i = 0; i <= n; i++) { const x = lerp(-hr, hr, i / n); s.lineTo(x, 0.032 + 0.026 * Math.sin(i * 1.15 + 0.4) - 0.012 * Math.cos(i * 2.3)); }
    s.lineTo(hr, -0.03);
    const g = new THREE.ShapeGeometry(s);
    gradient(g, '#d6ab6c', '#f2d49a');
    fp.push({ geo: g, pos: [0, sill, 0.012] });
    // a tiny palm on the dune
    fp.push({ geo: new THREE.CylinderGeometry(0.005, 0.008, 0.07, 4), color: '#8a6440', pos: [0.2, sill + 0.075, 0.014], rot: [0, 0, -0.12] });
    for (let i = 0; i < 5; i++) { const a = -0.3 + (i / 4) * (Math.PI + 0.6); fp.push({ geo: new THREE.ConeGeometry(0.008, 0.06, 3), color: '#5f9e48', pos: [0.204 + Math.cos(a) * 0.025, sill + 0.11 + Math.sin(a) * 0.012, 0.016], rot: [0, 0, a - Math.PI / 2] }); }
  }
  // fast-forward badge on the body: a blue disc with two cream chevrons (time is sped up)
  {
    const by = foot + 0.09 + (sill - foot - 0.08) * 0.52;
    fp.push({ geo: new THREE.CylinderGeometry(0.105, 0.105, 0.02, 28).rotateX(Math.PI / 2), color: ink, pos: [0, by, D / 2 + 0.006] });
    fp.push({ geo: new THREE.TorusGeometry(0.105, 0.012, 6, 28), color: '#ffd164', pos: [0, by, D / 2 + 0.016] });
    const chev = new THREE.Shape();
    chev.moveTo(-0.032, -0.045); chev.lineTo(0.022, 0); chev.lineTo(-0.032, 0.045);
    const cg = new THREE.ShapeGeometry(chev);
    for (const dx of [-0.026, 0.03]) fp.push({ geo: cg, color: '#fff6e6', pos: [dx, by, D / 2 + 0.018] });
  }
  // a gold sun finial on the keystone
  fp.push({ geo: new THREE.SphereGeometry(0.045, 14, 10), color: '#ffc93c', pos: [0, sill + W + 0.06, 0] });
  const frameGeo = keep(mergeFlat(fp));
  const frame = new THREE.Mesh(frameGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(frame);
  return { group, sky, skyMat, wheel, trail, trailMat, frame, geos, mats: [skyMat, wheel.material, trailMat, frame.material], height: sill + W + 0.1 };
}

// ---------------------------------------------------------------- the hot sun (heat): a sun puck with a soft glow
export function hotSun() {
  const pos = [], col = [], idx = [];
  const ring = (r0, r1, a0, a1, n, c0, c1) => {
    const b = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pos.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
      col.push(...c0, a0, ...c1, a1);
      if (i < n) idx.push(b + i * 2, b + i * 2 + 1, b + i * 2 + 2, b + i * 2 + 1, b + i * 2 + 3, b + i * 2 + 2);
    }
  };
  const c = (h) => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
  // glow (behind), disc, inner highlight
  ring(0.15, 0.34, 0.55, 0, 40, c('#ffd36b'), c('#ffb347'));
  {
    const b = pos.length / 3;
    pos.push(0, 0, 0.002); col.push(...c('#fff2a8'), 1);
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pos.push(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.002); col.push(...c('#ffc93c'), 1); if (i < 40) idx.push(b, b + i + 1, b + i + 2); }
  }
  // rays: 10 rounded triangles
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, b = pos.length / 3, w = 0.045;
    const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    pos.push(ux * 0.17 + vx * w, uy * 0.17 + vy * w, 0.001, ux * 0.17 - vx * w, uy * 0.17 - vy * w, 0.001, ux * 0.27, uy * 0.27, 0.001);
    for (let k = 0; k < 3; k++) col.push(...c('#ff9f1c'), 1);
    idx.push(b, b + 2, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, opacity: 1 });
  return new THREE.Mesh(g, m);
}

/** One heat-shimmer ribbon: a wavy vertical stroke, faded at both ends (vertex alpha), origin at its bottom. */
export function shimmerGeo() {
  const pos = [], col = [], idx = [], n = 22, H = 0.42;
  for (let i = 0; i <= n; i++) {
    const u = i / n, y = u * H, x = 0.035 * Math.sin(u * Math.PI * 3.2), w = 0.011 * Math.sin(Math.PI * u) + 0.002, a = Math.pow(Math.sin(Math.PI * u), 0.8);
    pos.push(x - w, y, 0, x + w, y, 0);
    col.push(1, 0.93, 0.78, a * 0.85, 1, 0.93, 0.78, a * 0.85);
    if (i < n) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

/** A soft wet-sand patch (vertex alpha disc, no texture). */
export function softDisc(color, segs = 40, rings = 5) {
  const pos = [], col = [], idx = [], c = new THREE.Color(color);
  pos.push(0, 0, 0); col.push(c.r, c.g, c.b, 1);
  for (let k = 1; k <= rings; k++) {
    const r = k / rings, a = Math.pow(1 - r, 1.6);
    for (let i = 0; i < segs; i++) { const t = (i / segs) * Math.PI * 2; pos.push(Math.cos(t) * r, 0, Math.sin(t) * r); col.push(c.r, c.g, c.b, a); }
  }
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let k = 1; k < rings; k++) {
    const a = 1 + (k - 1) * segs, b = 1 + k * segs;
    for (let i = 0; i < segs; i++) { const j = (i + 1) % segs; idx.push(a + i, a + j, b + i, a + j, b + j, b + i); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- the sidr seedling (parts in its local frame, y up)
/** Returns [{ geo, color, grow }] where grow ∈ [0,1] is the order in which the part appears (stem first, top leaves last). */
export function seedlingParts(seed = 3, S = 1.45) {
  const r = rng(seed), out = [];
  const stem = '#7b5536', stem2 = '#94683f', leafA = '#4f9a3a', leafB = '#74b84d', leafC = '#a3d36a';
  const seg = (a, b, r0, r1, col, grow) => {
    const d = new V3().subVectors(b, a), L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, 5, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    out.push({ geo: g.scale(S, S, S), color: col, grow });
  };
  const leaf = (p, dir, s, col, grow) => {
    const g = new THREE.SphereGeometry(1, 6, 3);
    g.scale(s, s * 0.3, s * 0.62);
    g.translate(s * 0.85, 0, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), dir.clone().normalize()));
    g.translate(p.x, p.y, p.z);
    out.push({ geo: g.scale(S, S, S), color: col, grow });
  };
  // a zig-zag stem (sidr twigs zig-zag), then three side shoots
  const pts = [new V3(0, -0.02, 0), new V3(0.012, 0.06, 0.004), new V3(-0.01, 0.12, -0.004), new V3(0.008, 0.18, 0.006), new V3(0, 0.22, 0)];
  for (let i = 0; i + 1 < pts.length; i++) seg(pts[i], pts[i + 1], 0.011 - i * 0.002, 0.009 - i * 0.002, i < 2 ? stem : stem2, i * 0.08);
  const shoots = [[1, 0.6, 0.1, 0.25], [1, -0.55, 0.45, 0.3], [2, -0.5, -0.4, 0.4], [2, 0.5, 0.5, 0.45], [3, 0.4, -0.5, 0.55], [3, -0.45, 0.3, 0.6]];
  for (const [k, sx, sz, gr] of shoots) {
    const a = pts[k], b = a.clone().add(new V3(sx * 0.07, 0.035, sz * 0.07));
    seg(a, b, 0.005, 0.0035, stem2, gr);
    leaf(b, new V3(sx, 0.35, sz), 0.034, leafA, gr + 0.1);
    leaf(b, new V3(sx * 0.3 - sz, 0.5, sz * 0.3 + sx), 0.03, leafB, gr + 0.14);
  }
  // leaves along the main stem (alternate), and a bright bud cluster on top
  for (let i = 0; i < 12; i++) {
    const u = 0.15 + (i / 12) * 0.8, k = Math.min(3, Math.floor(u * 4)), p = pts[k].clone().lerp(pts[k + 1], u * 4 - k);
    const a = i * 2.4 + r() * 0.4;
    leaf(p, new V3(Math.cos(a), 0.45 + r() * 0.3, Math.sin(a)), 0.027 + r() * 0.01, i % 3 === 0 ? leafB : leafA, 0.18 + u * 0.7);
  }
  for (let i = 0; i < 3; i++) { const a = i * 2.1; leaf(pts[4], new V3(Math.cos(a), 1.2, Math.sin(a)), 0.022, leafC, 0.92 + i * 0.03); }
  return out;
}

// ---------------------------------------------------------------- small geometry utils
const _rb = new Map();
function roundedBoxGeo(w, h, d, r) {
  // cheap rounded box: a box with bevelled edges via ExtrudeGeometry of a rounded rectangle
  const key = [w, h, d, r].join(',');
  if (_rb.has(key)) return _rb.get(key).clone();
  const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y); s.lineTo(w / 2, y); s.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  s.lineTo(-x, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y); s.lineTo(-w / 2, -y); s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const bv = Math.min(r * 0.6, d * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv * 0.8, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -(d - 2 * bv) / 2);
  _rb.set(key, g);
  return g.clone();
}

const mergeFlat = (parts) => mergeParts(parts);
export { roundedBoxGeo };
