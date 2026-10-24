// The volcano's two canvas textures (built once, data colour space):
// - a tileable rock-grain detail map, multiplied over the terrain's vertex colours (pits, grains, cracks, fine layering);
// - a 2×2 atlas of shaded cumulus puffs for the smoke and ash plume (R = sun shading, G = density brightness, A = alpha),
//   lit from the upper right like the sun seen from the pad, so the plume reads as soft volumes instead of flat discs.
import { rng, canvas, canvasTexture } from '../core/kit.js';

/** Grey detail map around 0.93 (rock grain). Canvas top = upslope (flipY off: v grows down the slope). */
export function rockDetailTexture(size = 512) {
  const c = canvas(size, size), g = c.getContext('2d'), R = rng(77);
  g.fillStyle = 'rgb(240,240,240)';
  g.fillRect(0, 0, size, size);
  const wrap = (x, y, r, fn) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      const X = x + dx, Y = y + dy;
      if (X + r >= 0 && X - r <= size && Y + r >= 0 && Y - r <= size) fn(X, Y);
    }
  };
  // broad soft mottling (light and dark)
  for (let i = 0; i < 90; i++) {
    const x = R() * size, y = R() * size, r = 24 + R() * 70, dark = R() < 0.55, al = dark ? 0.06 + R() * 0.05 : 0.05 + R() * 0.04;
    wrap(x, y, r, (X, Y) => {
      const gr = g.createRadialGradient(X, Y, 0, X, Y, r), v = dark ? 40 : 255;
      gr.addColorStop(0, `rgba(${v},${v},${v},${al})`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr;
      g.fillRect(X - r, Y - r, 2 * r, 2 * r);
    });
  }
  // fine layering (periodic across u)
  for (let i = 0; i < 26; i++) {
    const y0 = R() * size, amp = 2 + R() * 5, k = 1 + Math.floor(R() * 3), ph = R() * 6.28, dark = R() < 0.6, w = 1 + R() * 2.5;
    g.strokeStyle = dark ? `rgba(40,30,30,${0.05 + R() * 0.06})` : `rgba(255,255,255,${0.06 + R() * 0.05})`;
    g.lineWidth = w;
    for (const dy of [-size, 0, size]) {
      g.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const y = y0 + dy + amp * Math.sin((x / size) * Math.PI * 2 * k + ph);
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
  }
  // pits and grains: a dark lower half and a lit upper rim (light from above)
  for (let i = 0; i < 800; i++) {
    const x = R() * size, y = R() * size, r = 1.4 + R() * R() * 5.5, ad = 0.12 + R() * 0.16, al = 0.1 + R() * 0.12, pit = R() < 0.5;
    wrap(x, y, r + 2, (X, Y) => {
      g.fillStyle = pit ? `rgba(30,22,22,${ad})` : `rgba(255,255,255,${al})`;
      g.beginPath(); g.ellipse(X, Y + r * 0.25, r, r * 0.72, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = pit ? `rgba(255,255,255,${al * 0.8})` : `rgba(30,22,22,${ad * 0.6})`;
      g.beginPath(); g.ellipse(X, Y + (pit ? -r * 0.55 : r * 0.7), r * 0.8, r * 0.3, 0, 0, Math.PI * 2); g.fill();
    });
  }
  // cracks (random walks), with a light lip below
  for (let i = 0; i < 22; i++) {
    let x = R() * size, y = R() * size, dir = R() * Math.PI * 2;
    const pts = [[x, y]], n = 5 + Math.floor(R() * 8), al = 0.1 + R() * 0.1;
    for (let k = 0; k < n; k++) { dir += (R() - 0.5) * 1.1; x += Math.cos(dir) * 7; y += Math.sin(dir) * 5; pts.push([x, y]); }
    wrap(pts[0][0], pts[0][1], 120, (X, Y) => {
      const ox = X - pts[0][0], oy = Y - pts[0][1];
      for (const [col, dy, lw] of [[`rgba(255,255,255,${al * 0.6})`, 1.4, 1.2], [`rgba(25,18,18,${al})`, 0, 1.5]]) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px + ox, py + oy + dy) : g.moveTo(px + ox, py + oy + dy)));
        g.stroke();
      }
    });
  }
  // per-pixel grain
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 16;
    d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, d[i] + n));
  }
  g.putImageData(img, 0, 0);
  const t = canvasTexture(c, { repeat: true, srgb: false });
  t.flipY = false;
  return t;
}

/** 2×2 atlas (512²) of cumulus puffs: a smooth union of spheres (soft creases), shaded as if lit from the upper right. */
export function puffAtlasTexture(size = 512) {
  const c = canvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size), D = img.data, R = rng(91);
  const cell = size / 2, Hf = new Float32Array(cell * cell);
  const L = [0.52, 0.7, 0.48], ln = Math.hypot(...L); // light in "screen" axes: right, up, toward the viewer
  for (let k = 0; k < 3; k++) L[k] /= ln;
  const smax = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (a - b)) / k)); return b + (a - b) * h + k * h * (1 - h); };
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * cell, oy = Math.floor(v / 2) * cell;
    const S = [[0, -0.1, 0.52 + R() * 0.06]]; // x, y (up), r  in cell units (-1..1)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + R() * 0.8, d = 0.3 + R() * 0.25;
      let x = Math.cos(a) * d * 1.05, y = Math.sin(a) * d * 0.8 - 0.05, r = 0.26 + R() * 0.14;
      if (y < -0.32) { y = -0.32; r *= 0.85; } // flatter base, lumps on the top and sides
      const ext = Math.max(Math.abs(x), Math.abs(y)) + r;
      if (ext > 0.9) { const f = 0.9 / ext; x *= f; y *= f; r *= f; }
      S.push([x, y, r]);
    }
    const SX = Float32Array.from(S, (q) => q[0]), SY = Float32Array.from(S, (q) => q[1]), SR = Float32Array.from(S, (q) => q[2] * q[2]), NSP = S.length;
    for (let py = 0; py < cell; py++) {
      const y = 1 - ((py + 0.5) / cell) * 2;
      for (let px = 0; px < cell; px++) {
        const x = ((px + 0.5) / cell) * 2 - 1;
        let h = -0.2;
        for (let i = 0; i < NSP; i++) {
          const dx = x - SX[i], dy = y - SY[i], dd = SR[i] - dx * dx - dy * dy;
          if (dd < -0.09) continue; // far outside this lump: it cannot raise the smooth union
          h = smax(h, dd > 0 ? Math.sqrt(dd) : -Math.sqrt(-dd) * 0.5, 0.12);
        }
        Hf[py * cell + px] = h;
      }
    }
    const e = 2 / cell;
    for (let py = 0; py < cell; py++) for (let px = 0; px < cell; px++) {
      const h = Hf[py * cell + px], o = ((oy + py) * size + ox + px) * 4;
      if (h <= 0) { D[o] = D[o + 1] = D[o + 2] = D[o + 3] = 0; continue; }
      const hx = (Hf[py * cell + Math.min(cell - 1, px + 1)] - Hf[py * cell + Math.max(0, px - 1)]) / (2 * e);
      const hy = (Hf[Math.max(0, py - 1) * cell + px] - Hf[Math.min(cell - 1, py + 1) * cell + px]) / (2 * e);
      const nl = Math.hypot(hx, hy, 1), nx = -hx / nl, ny = -hy / nl, nz = 1 / nl;
      const lam = nx * L[0] + ny * L[1] + nz * L[2];
      const shade = Math.max(0, Math.min(1, 0.42 + 0.58 * lam));
      const edge = Math.min(1, h / 0.42), alpha = edge * edge * (3 - 2 * edge);
      D[o] = Math.round(255 * shade);
      D[o + 1] = Math.round(255 * Math.min(1, 0.55 + h)); // denser cores read a touch brighter (thick, sunlit)
      D[o + 2] = Math.round(255 * nz);
      D[o + 3] = Math.round(255 * alpha);
    }
  }
  g.putImageData(img, 0, 0);
  const t = canvasTexture(c, { srgb: false });
  t.premultiplyAlpha = false;
  return t;
}
