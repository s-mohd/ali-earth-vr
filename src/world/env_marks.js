// Station landmarks: a tall pole per zone with a waving flag in the station colour (pictogram + Arabic-Indic number on a
// cream hoist edged with a sadu-weave stripe), readable from the hub. All flags, the hall sign and the hall bunting share
// ONE canvas atlas and ONE cloth mesh.
import { THREE, PAL, canvas, canvasTexture } from '../core/kit.js';
import { drawText, drawIcon, roundRect } from '../core/ui.js';
import { STATIONS, TEXT, num } from '../game/content.js';
import { toWorld, zoneYaw } from './env_util.js';
import { heightAt } from './env_terrain.js';

const HALL_COLOR = PAL.sun;
/** Atlas cell of the hall flag (after the five stations). */
export const HALL_CELL = STATIONS.length;
const AW = 1024, AH = 512, CW = 340, CH = 170;
const KEYS = [...STATIONS.map((s) => s.key), 'hall'];
/** uv rectangle [u0, v0, u1, v1] of a flag cell (canvas y grows down, uv v grows up) */
const cellRect = (i) => { const x = (i % 3) * (CW + 1), y = Math.floor(i / 3) * (CH + 1); return [x / AW, 1 - (y + CH) / AH, (x + CW) / AW, 1 - y / AH]; };
export const SIGN_RECT = [0, 1 - 504 / AH, 1, 1 - 346 / AH];

function shade(hex, k) { return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString(); }

// simple, bold pictograms (drawn in `c` on a white disc of radius s)
const PICTO = {
  quake(x, s, c) {
    x.fillStyle = c; roundRect(x, -0.72 * s, 0.08 * s, 1.44 * s, 0.5 * s, 0.1 * s); x.fill();
    x.save(); x.rotate(-0.16); x.fillRect(-0.32 * s, -0.42 * s, 0.5 * s, 0.42 * s);
    x.beginPath(); x.moveTo(-0.42 * s, -0.4 * s); x.lineTo(-0.07 * s, -0.7 * s); x.lineTo(0.28 * s, -0.4 * s); x.fill(); x.restore();
    x.strokeStyle = '#fff'; x.lineWidth = 0.11 * s; x.lineJoin = 'round'; x.beginPath();
    x.moveTo(0.05 * s, 0.06 * s); x.lineTo(0.22 * s, 0.24 * s); x.lineTo(0.02 * s, 0.38 * s); x.lineTo(0.2 * s, 0.6 * s); x.stroke();
    x.strokeStyle = c; x.lineWidth = 0.08 * s; x.lineCap = 'round';
    for (const d of [-1, 1]) { x.beginPath(); x.arc(d * 0.08 * s, -0.25 * s, 0.6 * s, d > 0 ? -0.5 : Math.PI - 0.3, d > 0 ? 0.3 : Math.PI + 0.5); x.stroke(); }
  },
  volcano(x, s, c) {
    x.fillStyle = 'rgba(150,150,160,0.8)';
    for (const [cx, cy, r] of [[-0.1, -0.62, 0.15], [0.12, -0.75, 0.13], [0.0, -0.45, 0.12]]) { x.beginPath(); x.arc(cx * s, cy * s, r * s, 0, 7); x.fill(); }
    x.fillStyle = c; x.beginPath(); x.moveTo(-0.75 * s, 0.58 * s); x.lineTo(-0.2 * s, -0.28 * s); x.lineTo(0.2 * s, -0.28 * s); x.lineTo(0.75 * s, 0.58 * s); x.closePath(); x.fill();
    x.fillStyle = PAL.lavaHot; x.beginPath(); x.moveTo(-0.2 * s, -0.28 * s); x.lineTo(0.2 * s, -0.28 * s); x.lineTo(0.12 * s, 0.05 * s); x.lineTo(0.2 * s, 0.35 * s); x.lineTo(0.05 * s, 0.2 * s); x.lineTo(-0.08 * s, 0.4 * s); x.lineTo(-0.1 * s, 0.0); x.closePath(); x.fill();
  },
  weather(x, s, c) {
    x.fillStyle = c; x.beginPath(); x.ellipse(-0.12 * s, 0.0, 0.55 * s, 0.45 * s, -0.1, 0, 7); x.fill();
    for (const [cx, cy, r] of [[0.48, 0.42, 0.13], [0.66, 0.2, 0.09], [0.3, 0.56, 0.08]]) { x.beginPath(); x.arc(cx * s, cy * s, r * s, 0, 7); x.fill(); }
    x.strokeStyle = '#fff'; x.lineWidth = 0.08 * s; x.lineJoin = 'round'; x.beginPath();
    x.moveTo(-0.15 * s, -0.42 * s); x.lineTo(-0.02 * s, -0.12 * s); x.lineTo(-0.2 * s, 0.1 * s); x.lineTo(-0.05 * s, 0.42 * s);
    x.moveTo(-0.02 * s, -0.12 * s); x.lineTo(0.28 * s, -0.05 * s); x.stroke();
  },
  erosion(x, s, c) {
    x.strokeStyle = c; x.lineWidth = 0.12 * s; x.lineCap = 'round';
    for (const dy of [-0.3, 0.05, 0.4]) {
      x.beginPath();
      for (let i = 0; i <= 20; i++) { const u = -0.7 + i * 0.07; x.lineTo(u * s, (dy + Math.sin(u * 7) * 0.08) * s); }
      x.stroke();
    }
    x.fillStyle = PAL.soil;
    for (const [cx, cy, r] of [[-0.25, -0.12, 0.09], [0.15, 0.23, 0.08], [0.45, -0.1, 0.07]]) { x.beginPath(); x.arc(cx * s, cy * s, r * s, 0, 7); x.fill(); }
    x.fillStyle = c; x.beginPath(); x.moveTo(0.78 * s, 0.6 * s); x.lineTo(0.5 * s, 0.48 * s); x.lineTo(0.5 * s, 0.72 * s); x.fill();
  },
  human(x, s, c) {
    x.fillStyle = c;
    roundRect(x, -0.72 * s, 0.32 * s, 0.95 * s, 0.26 * s, 0.13 * s); x.fill();
    x.fillRect(-0.62 * s, -0.08 * s, 0.75 * s, 0.38 * s);
    x.fillRect(-0.55 * s, -0.42 * s, 0.38 * s, 0.36 * s);
    x.fillStyle = '#fff'; x.fillRect(-0.47 * s, -0.35 * s, 0.24 * s, 0.2 * s);
    x.strokeStyle = c; x.lineWidth = 0.13 * s; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(0.05 * s, 0.0); x.lineTo(0.42 * s, -0.48 * s); x.lineTo(0.7 * s, 0.05 * s); x.stroke();
    x.fillStyle = c; x.beginPath(); x.moveTo(0.58 * s, 0.02 * s); x.lineTo(0.82 * s, 0.02 * s); x.lineTo(0.72 * s, 0.3 * s); x.closePath(); x.fill();
  },
  hall(x, s, c) { drawIcon(x, 'trophy', 0, 0, s * 1.55, c); },
};

/** One canvas: 6 flag cells (5 stations + hall), the hall sign, and a white corner for plain cloth (bunting). */
export function buildAtlas() {
  const cv = canvas(AW, AH), x = cv.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, AW, AH);
  KEYS.forEach((key, i) => {
    const col = key === 'hall' ? HALL_COLOR : STATIONS[i].color, ox = (i % 3) * (CW + 1), oy = Math.floor(i / 3) * (CH + 1);
    x.save(); x.translate(ox, oy);
    x.fillStyle = col; x.fillRect(0, 0, CW, CH);
    // cream hoist with the station number, edged by a sadu-weave stripe (a chain of diamonds, as on Bahraini woven tents)
    const band = CW * 0.25, sadu = 24;
    x.fillStyle = '#fff6e4'; x.fillRect(0, 0, band, CH);
    x.fillStyle = shade(col, 0.6); x.fillRect(band, 0, sadu, CH);
    for (let k = 0, step = CH / 9; k < 9; k++) {
      const cy = (k + 0.5) * step;
      x.fillStyle = k % 2 ? PAL.sun : '#fff6e4';
      x.beginPath(); x.moveTo(band + sadu / 2, cy - step / 2); x.lineTo(band + sadu - 4, cy); x.lineTo(band + sadu / 2, cy + step / 2); x.lineTo(band + 4, cy); x.closePath(); x.fill();
    }
    if (key !== 'hall') drawText(x, num(STATIONS[i].n), { x: 4, y: 6, w: band - 8, h: CH - 12 }, { size: 120, weight: 800, color: shade(col, 0.8) });
    else drawIcon(x, 'star', band / 2, CH / 2, 70, shade(col, 0.75));
    // emblem
    const cx = band + sadu + (CW - band - sadu) / 2, cy = CH / 2, s = 62;
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, s * 1.08, 0, 7); x.fill();
    x.translate(cx, cy); PICTO[key](x, s * 0.82, shade(col, 0.82));
    x.restore();
  });
  // hall sign
  const sy = 346, sh = 158;
  x.fillStyle = '#c98a5e'; roundRect(x, 0, sy, AW, sh, 26); x.fill();
  x.fillStyle = '#fff7e8'; roundRect(x, 10, sy + 10, AW - 20, sh - 20, 20); x.fill();
  x.fillStyle = PAL.teal; for (const ex of [70, AW - 70]) drawIcon(x, 'star', ex, sy + sh / 2, 70, ex < 100 ? PAL.coral : PAL.teal);
  drawText(x, TEXT.hallTitle, { x: 140, y: sy + 14, w: AW - 280, h: sh - 28 }, { size: 110, weight: 800, color: PAL.ink });
  x.fillStyle = '#fff'; x.fillRect(AW - 40, AH - 6, 40, 6);
  const tex = canvasTexture(cv);
  tex.anisotropy = 8;
  return tex;
}

const POLE = new THREE.CylinderGeometry(0.06, 0.075, 1, 8), PED = new THREE.CylinderGeometry(0.42, 0.5, 1, 8), BALL = new THREE.IcosahedronGeometry(1, 1);
const FW = 2.5, FH = 1.25, FLAG = new THREE.PlaneGeometry(FW, FH, 8, 3), TIP = new THREE.ConeGeometry(0.05, 0.22, 6);

/**
 * One flag pole (static batch B) with its waving flag (cloth batch) in a zone frame: pole foot at zone-local (lx, base, lz),
 * height H; the flag flies toward local +x and faces local +Z (the viewer and the hub). cell = atlas cell index.
 */
export function addFlag(B, cloth, key, lx, lz, base, H, cell, { pedestal = true } = {}) {
  const col = cell < STATIONS.length ? STATIONS[cell].color : HALL_COLOR, yaw = zoneYaw(key), [x, z] = toWorld(key, lx, lz);
  if (pedestal) {
    B.add(PED, { pos: [x, base - 0.3, z], scale: [1, 0.6, 1], grad: ['#e6d3b3', '#fbf1df'] });
    B.add(PED, { pos: [x, base + 0.02, z], scale: [0.8, 0.06, 0.8], color: col });
    for (const by of [0.8, 1.1]) B.add(POLE, { pos: [x, base + by, z], scale: [1.35, 0.12, 1.35], color: col });
  }
  B.add(POLE, { pos: [x, base + H / 2, z], scale: [1, H, 1], color: '#f6f1e8' });
  B.add(BALL, { pos: [x, base + 0.12 + H, z], scale: 0.17, color: col });
  B.add(TIP, { pos: [x, base + 0.36 + H, z], color: PAL.sun });
  const [fx, fz] = toWorld(key, lx + FW / 2 + 0.07, lz);
  cloth.add(FLAG, { pos: [fx, base + H - FH / 2 - 0.1, fz], rot: [0, yaw, 0], uvRect: cellRect(cell), color: '#ffffff', sway: (px) => (px + FW / 2) * 0.7 });
}

/**
 * Station landmarks, a little behind each diorama and well to one side. Seen from the station the cloth flies at ≈ 51–56°
 * to the side, beyond Ali's speech bubble (≈ 27–49° right) and the board, so nothing waves next to the text. Seen from the
 * hub each flag stands in one gap between two stations' paths (quake and volcano on their right, the others on their left),
 * leaving the gap in front of the fishing village empty.
 */
const MARK_H = 7.0, SIDE = { quake: 1, volcano: 1, weather: -1, erosion: -1, human: -1 };
/** Zone-local [x, z] of a station's flag pole (the cloth always flies toward local +x). */
export const markSpot = (key) => (SIDE[key] > 0 ? [10, -8] : [-12, -8]);
/** World positions of the flag pedestals (for baked contact shadows). */
export function landmarkFeet() {
  return STATIONS.map((st) => { const [x, z] = toWorld(st.key, ...markSpot(st.key)); return { x, z, r: 1.1, k: 0.35 }; });
}
export function addLandmarks(stat, cloth) {
  STATIONS.forEach((st, i) => {
    const [lx, lz] = markSpot(st.key), [x, z] = toWorld(st.key, lx, lz);
    addFlag(stat.pick(x, z), cloth, st.key, lx, lz, heightAt(x, z) + 0.5, MARK_H, i);
  });
}
