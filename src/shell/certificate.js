// Certificate of the little explorer, drawn on any 2D canvas context (DOM-free: also used as a texture inside VR).
// Also exports the small vector art shared with the HTML shell (Ali's portrait, the five station glyphs) and an
// Arabic date formatter, so the page, the certificate and the teacher report all speak with one voice.
import { PAL } from '../core/kit.js';
import { setFont, drawText, roundRect } from '../core/ui.js';
import { TEXT, STATIONS } from '../game/content.js';

// ---------------------------------------------------------------- dates
// Child-facing text uses Arabic-Indic digits like the lesson script (content.js `num`); teacher data may ask for Western digits.
const asDate = (d) => (d instanceof Date ? d : new Date(d ?? Date.now()));
const fmt = {};
function intl(digits, key, opts) {
  try { return (fmt[digits + key] ||= new Intl.DateTimeFormat(`ar-BH-u-nu-${digits}`, opts)); } catch { return null; }
}
/** "٢٣ أكتوبر ٢٠٢٦" (Western digits with digits: 'latn'; ", ٩:٤٢ م" appended with time: true). */
export function arDate(d, { time = false, digits = 'arab' } = {}) {
  const date = asDate(d);
  if (Number.isNaN(date.getTime())) return '';
  const day = intl(digits, 'd', { day: 'numeric', month: 'long', year: 'numeric' });
  const s = day ? day.format(date) : `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  if (!time) return s;
  const t = intl(digits, 't', { hour: 'numeric', minute: '2-digit' });
  return `${s}، ${t ? t.format(date) : `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`}`;
}

// ---------------------------------------------------------------- shared vector art (SVG path data; Path2D on canvas)
const ell = (cx, cy, rx, ry = rx) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

/** Ali's friendly portrait in a 100×100 box: ghutra, agal, smile. Parts: { d, fill?, stroke?, w?, a? }. */
export const ALI_PARTS = [
  { d: 'M12 100C14 83 29 74 50 74S86 83 88 100Z', fill: '#ffffff', stroke: '#dde3ea', w: 1.5 },
  { d: 'M21 50C21 25 34 13 50 13S79 25 79 50L84 87C73 93 62 95 50 95S27 93 16 87Z', fill: '#fbfbf7', stroke: '#dde3ea', w: 1.5 },
  { d: 'M42.5 70h15v9c-5 3-10 3-15 0Z', fill: '#c98a62' },
  { d: ell(50, 52, 20, 22.5), fill: '#e2a67c' },
  { d: 'M27.5 47C29 32 38 25.5 50 25.5S71 32 72.5 47C67 39.5 59.5 36 50 36S33 39.5 27.5 47Z', fill: '#ffffff', stroke: '#e1e6ec', w: 1 },
  { d: 'M24.5 32.5C33 22 67 22 75.5 32.5', stroke: '#2c2a33', w: 4.6 },
  { d: 'M26.5 26.5C35 17 65 17 73.5 26.5', stroke: '#2c2a33', w: 4.2 },
  { d: ell(36.5, 61, 4.6, 3), fill: '#f2836b', a: 0.4 },
  { d: ell(63.5, 61, 4.6, 3), fill: '#f2836b', a: 0.4 },
  { d: ell(42.5, 53, 3.3, 4), fill: '#2a2433' },
  { d: ell(57.5, 53, 3.3, 4), fill: '#2a2433' },
  { d: ell(43.6, 51.5, 1.15), fill: '#ffffff' },
  { d: ell(58.6, 51.5, 1.15), fill: '#ffffff' },
  { d: 'M37.5 46.2q4.5-3 8.6-0.4M54 45.8q4.1-2.6 8.6 0.4', stroke: '#5b3a2a', w: 2.1 },
  { d: 'M49.3 56.5q2.2 3.6-0.4 5.2', stroke: '#b5764f', w: 1.7 },
  { d: 'M42.6 64.2q7.4 8.4 14.8 0q-7.4 2.6-14.8 0Z', fill: '#8a3a2a', stroke: '#8a3a2a', w: 1.6 },
  { d: 'M44 80q6 4 12 0', stroke: '#dde3ea', w: 1.5 },
];

/** One glyph per station in a 24×24 box, drawn in white (fg) with sun-yellow accents (lava). */
export const STATION_GLYPHS = {
  quake: [
    { d: 'M2 6.8q2.5-3.4 5 0t5 0 5 0 5 0', stroke: 'fg', w: 1.9 },
    { d: 'M2 12.6h8.2l1.3 3.4-1.2 2.4 0.8 2.8H2ZM22 12.6h-8.2l1.1 2.8-1.3 2.6 1 3.2H22Z', fill: 'fg' },
  ],
  volcano: [
    { d: 'M1.8 21L8.6 9.6h6.8L22.2 21Z', fill: 'fg' },
    { d: 'M8.6 9.6h6.8l-1.6 3.6-1.1-1.4-1.2 3.4-1.1-2.6-1 1.2Z', fill: 'accent' },
    { d: ell(10.2, 5.4, 1.7) + ell(13.6, 4, 2.1), fill: 'fg' },
  ],
  weather: [
    { d: 'M3 18.4C2.8 12.4 6.4 7.6 12 7.4S21.2 12 21 18.4Z', fill: 'fg' },
    { d: 'M12.4 7.6l-2 3.8 2.3 2.3-1.9 2.6 1 2.1M16.8 10.4l1.5 2.4-1.3 1.8', stroke: 'bg', w: 1.5 },
    { d: ell(4.2, 21.1, 1.35) + ell(8.3, 21.6, 0.95) + ell(16.4, 21.3, 1.25) + ell(20.3, 21.6, 0.85), fill: 'fg' },
  ],
  erosion: [
    { d: 'M2 6.5q2.5-2.6 5 0t5 0 5 0 5 0M2 11.5q2.5-2.6 5 0t5 0 5 0 5 0', stroke: 'fg', w: 1.9 },
    { d: ell(4.6, 18.4, 1.7) + ell(9.6, 19.2, 1.25), fill: 'fg' },
    { d: 'M13 18.6h8.2M18.2 15.6l3 3-3 3', stroke: 'fg', w: 1.9 },
  ],
  human: [
    { d: 'M3.6 12.8h8.6v4.6H3.6ZM5.4 8.4h4.6v4.4H5.4Z', fill: 'fg' },
    { d: 'M3.4 18.6h9.2a2 2 0 0 1 0 4H3.4a2 2 0 0 1 0-4Z', fill: 'fg' },
    { d: 'M12 12.2l4.6-6.4 4.2 3.2', stroke: 'fg', w: 2 },
    { d: 'M18.8 9.6l3.4 1.3-1.2 4-3.6-2.4Z', fill: 'accent' },
  ],
};

/** SVG markup for a set of parts (fg/bg/accent resolve to the given colours). */
export function partsSVG(parts, size, colors = {}) {
  const c = (v) => colors[v] || v;
  const body = parts.map((p) => `<path d="${p.d}" fill="${p.fill ? c(p.fill) : 'none'}"${p.stroke ? ` stroke="${c(p.stroke)}" stroke-width="${p.w || 1}" stroke-linecap="round" stroke-linejoin="round"` : ''}${p.a ? ` opacity="${p.a}"` : ''}/>`).join('');
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}

const pathCache = new Map();
function drawParts(ctx, parts, x, y, scale, colors = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of parts) {
    let path = pathCache.get(p.d);
    if (!path) pathCache.set(p.d, (path = new Path2D(p.d)));
    ctx.globalAlpha = p.a ?? 1;
    if (p.fill) { ctx.fillStyle = colors[p.fill] || p.fill; ctx.fill(path); }
    if (p.stroke) { ctx.strokeStyle = colors[p.stroke] || p.stroke; ctx.lineWidth = p.w || 1; ctx.stroke(path); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- drawing helpers (reference sheet 1600 × 1131, A4 landscape)
const RW = 1600, RH = 1131;
const GOLD = '#f6b93b', GOLD_L = PAL.sun;

function starPath(ctx, cx, cy, R, r, n, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}
/** Eight-pointed star (khatam) with tips on the axes and the diagonals. */
const khatam = (ctx, cx, cy, R) => starPath(ctx, cx, cy, R, R * 0.765, 8, 0);

/** Border band: a row of interlocking eight-pointed stars, the classic star-and-cross pattern. */
function patternBand(ctx, x, y, w, h, horizontal) {
  const len = horizontal ? w : h, th = horizontal ? h : w;
  const n = Math.max(1, Math.round(len / th)), step = len / n, R = th * 0.47;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = PAL.teal; ctx.fillRect(x, y, w, h);
  for (let i = 0; i < n; i++) {
    const cx = horizontal ? x + step * (i + 0.5) : x + w / 2, cy = horizontal ? y + h / 2 : y + step * (i + 0.5);
    khatam(ctx, cx, cy, R); ctx.fillStyle = GOLD_L; ctx.fill();
    khatam(ctx, cx, cy, R * 0.62); ctx.fillStyle = PAL.tealDark; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.2, 0, Math.PI * 2); ctx.fillStyle = PAL.cream; ctx.fill();
    // small cross-shaped gaps between stars carry a coral diamond
    const gx = horizontal ? cx + step / 2 : cx, gy = horizontal ? cy : cy + step / 2;
    if (i < n - 1) { starPath(ctx, gx, gy, th * 0.16, th * 0.07, 4, 0); ctx.fillStyle = PAL.coral; ctx.fill(); }
  }
  ctx.restore();
}

function cornerRosette(ctx, cx, cy, size) {
  ctx.fillStyle = PAL.coralDark; ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  khatam(ctx, cx, cy, size * 0.48); ctx.fillStyle = GOLD_L; ctx.fill();
  starPath(ctx, cx, cy, size * 0.3, size * 0.13, 8, 0); ctx.fillStyle = PAL.coral; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.08, 0, Math.PI * 2); ctx.fillStyle = PAL.cream; ctx.fill();
}

function medal(ctx, cx, cy, R) {
  // ribbons first (behind the seal)
  const tail = (dx, color, dark) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx * 0.15 * R, cy + 0.3 * R);
    ctx.lineTo(cx + dx * 0.95 * R, cy + 0.2 * R);
    ctx.lineTo(cx + dx * 0.8 * R, cy + 1.75 * R);
    ctx.lineTo(cx + dx * 0.52 * R, cy + 1.45 * R);
    ctx.lineTo(cx + dx * 0.22 * R, cy + 1.62 * R);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + dx * 0.55 * R, cy + 0.26 * R); ctx.lineTo(cx + dx * 0.5 * R, cy + 1.45 * R);
    ctx.strokeStyle = dark; ctx.lineWidth = R * 0.05; ctx.stroke();
  };
  tail(-1, PAL.coral, PAL.coralDark); tail(1, PAL.teal, PAL.tealDark);
  // scalloped gold seal
  const n = 24;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, bx = cx + Math.cos(a) * R * 0.93, by = cy + Math.sin(a) * R * 0.93; ctx.moveTo(bx + R * 0.12, by); ctx.arc(bx, by, R * 0.12, 0, Math.PI * 2); }
  const g = ctx.createLinearGradient(cx, cy - R, cx, cy + R); g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#f0a83a');
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, Math.PI * 2); ctx.fillStyle = PAL.tealDark; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.66, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,246,230,0.7)'; ctx.lineWidth = R * 0.03; ctx.setLineDash([R * 0.05, R * 0.05]); ctx.stroke(); ctx.setLineDash([]);
  starPath(ctx, cx, cy - R * 0.1, R * 0.36, R * 0.16, 5); ctx.fillStyle = GOLD_L; ctx.fill();
  setFont(ctx, R * 0.2, 800); ctx.textAlign = 'center'; ctx.fillStyle = PAL.cream;
  ctx.fillText('أحسنت', cx, cy + R * 0.42);
}

function portrait(ctx, cx, cy, R) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(cx, cy - R, cx, cy + R); g.addColorStop(0, '#bfe6f7'); g.addColorStop(1, '#8fd0ea');
  ctx.fillStyle = g; ctx.fill();
  ctx.clip();
  drawParts(ctx, ALI_PARTS, cx - R * 0.98, cy - R * 0.86, (R * 1.96) / 100);
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.lineWidth = R * 0.08; ctx.strokeStyle = PAL.paper; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.04, 0, Math.PI * 2); ctx.lineWidth = R * 0.035; ctx.strokeStyle = PAL.sky2; ctx.stroke();
  setFont(ctx, R * 0.24, 800); ctx.textAlign = 'center'; ctx.fillStyle = PAL.inkSoft;
  ctx.fillText('المستكشف علي', cx, cy + R * 1.32);
}

function stationStamps(ctx, cx, cy, r) {
  const gap = r * 2.9, x0 = cx + gap * 2; // right to left, in lesson order
  STATIONS.forEach((s, i) => {
    const x = x0 - gap * i;
    ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
    ctx.beginPath(); ctx.arc(x, cy, r * 0.86, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = r * 0.06; ctx.setLineDash([r * 0.12, r * 0.1]); ctx.stroke(); ctx.setLineDash([]);
    drawParts(ctx, STATION_GLYPHS[s.key], x - r * 0.62, cy - r * 0.62, (r * 1.24) / 24, { fg: '#ffffff', bg: s.color, accent: PAL.sun });
    setFont(ctx, r * 0.52, 700); ctx.textAlign = 'center'; ctx.fillStyle = PAL.inkSoft;
    ctx.fillText(s.short || s.name, x, cy + r * 1.6);
  });
}

function signatureLine(ctx, cx, y, label, value) {
  ctx.strokeStyle = PAL.inkSoft; ctx.lineWidth = 2; ctx.setLineDash([2, 7]); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 150, y); ctx.lineTo(cx + 150, y); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = 'center';
  if (value) { setFont(ctx, 34, 700); ctx.fillStyle = PAL.ink; ctx.fillText(value, cx, y - 30); }
  setFont(ctx, 26, 700); ctx.fillStyle = PAL.inkSoft; ctx.fillText(label, cx, y + 32);
}

/**
 * Draw the certificate filling a W×H canvas (best at ~1.414 landscape, e.g. 1600×1131 or 1024×724).
 * data: { name, score, total, date } — score/total may be omitted (no score line), date defaults to today.
 */
export function drawCertificate(ctx, W, H, { name, score, total, date } = {}) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAL.cream; ctx.fillRect(0, 0, W, H);
  const s = Math.min(W / RW, H / RH);
  ctx.translate((W - RW * s) / 2, (H - RH * s) / 2); ctx.scale(s, s);
  ctx.direction = 'rtl';

  // paper with a warm glow
  const glow = ctx.createRadialGradient(RW / 2, RH * 0.42, 80, RW / 2, RH / 2, RW * 0.62);
  glow.addColorStop(0, '#fffdf7'); glow.addColorStop(1, '#fbecd2');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, RW, RH);

  // geometric border: four star bands + corner rosettes, framed by gold and ink hairlines
  const m = 34, b = 60;
  ctx.fillStyle = PAL.tealDark; roundRect(ctx, m - 8, m - 8, RW - 2 * m + 16, RH - 2 * m + 16, 26); ctx.fill();
  patternBand(ctx, m + b, m, RW - 2 * (m + b), b, true);
  patternBand(ctx, m + b, RH - m - b, RW - 2 * (m + b), b, true);
  patternBand(ctx, m, m + b, b, RH - 2 * (m + b), false);
  patternBand(ctx, RW - m - b, m + b, b, RH - 2 * (m + b), false);
  for (const [x, y] of [[m, m], [RW - m - b, m], [m, RH - m - b], [RW - m - b, RH - m - b]]) cornerRosette(ctx, x + b / 2, y + b / 2, b);
  const ix = m + b, iy = m + b, iw = RW - 2 * ix, ih = RH - 2 * iy;
  ctx.fillStyle = glow; ctx.fillRect(ix, iy, iw, ih);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 5; ctx.strokeRect(ix + 14, iy + 14, iw - 28, ih - 28);
  ctx.strokeStyle = PAL.ink; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5; ctx.strokeRect(ix + 24, iy + 24, iw - 48, ih - 48); ctx.globalAlpha = 1;

  const cx = RW / 2;
  // title + flourish
  drawText(ctx, TEXT.certificateTitle, { x: cx - 520, y: 166, w: 1040, h: 114 }, { size: 90, min: 56, weight: 800, color: PAL.ink, maxLines: 1 });
  ctx.strokeStyle = PAL.orange; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 230, 300); ctx.quadraticCurveTo(cx - 115, 280, cx - 26, 298); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 230, 300); ctx.quadraticCurveTo(cx + 115, 280, cx + 26, 298); ctx.stroke();
  starPath(ctx, cx, 300, 17, 7, 4, 0); ctx.fillStyle = PAL.coral; ctx.fill();

  // Ali (right) and the medal (left) frame the name
  portrait(ctx, 1292, 448, 106);
  medal(ctx, 306, 446, 116);

  // given to + name
  setFont(ctx, 38, 700); ctx.textAlign = 'center'; ctx.fillStyle = PAL.inkSoft; ctx.fillText(TEXT.certificateGivenTo, cx, 366);
  const who = String(name || '').trim() || TEXT.certificateDefaultName;
  drawText(ctx, who, { x: cx - 300, y: 386, w: 600, h: 118 }, { size: 104, min: 44, weight: 800, color: PAL.tealDark, maxLines: 1 });
  ctx.strokeStyle = PAL.teal; ctx.lineWidth = 3; ctx.setLineDash([3, 10]);
  ctx.beginPath(); ctx.moveTo(cx - 280, 520); ctx.lineTo(cx + 280, 520); ctx.stroke(); ctx.setLineDash([]);

  // what for
  drawText(ctx, TEXT.certificateBody, { x: cx - 330, y: 540, w: 660, h: 116 }, { size: 38, min: 26, weight: 600, color: PAL.ink, lh: 1.5, maxLines: 2 });

  // score: five stars + words
  if (Number.isFinite(score) && Number.isFinite(total) && total > 0) {
    const n = Math.min(5, total), filled = Math.round((score / total) * n), gap = 70, y = 722;
    setFont(ctx, 40, 800); const label = `النتيجة: ${TEXT.scoreOf(score, total)}`, lw = ctx.measureText(label).width;
    const rowW = lw + 34 + n * gap, right = cx + rowW / 2;
    ctx.textAlign = 'right'; ctx.fillStyle = PAL.ink; ctx.fillText(label, right, y + 3);
    for (let i = 0; i < n; i++) {
      const x = right - lw - 34 - gap * i - gap / 2;
      starPath(ctx, x, y, 31, 13.5, 5);
      ctx.fillStyle = i < filled ? PAL.sun : '#efe4cf'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = i < filled ? '#e9a52e' : '#dccfb6'; ctx.stroke();
    }
    ctx.textAlign = 'center';
  }

  // bottom row: date (right) · the five passport stamps (centre) · teacher signature (left)
  signatureLine(ctx, 1262, 896, 'التاريخ', arDate(date));
  stationStamps(ctx, cx, 846, 42);
  signatureLine(ctx, 338, 896, TEXT.teacherSign, '');

  setFont(ctx, 25, 600); ctx.fillStyle = PAL.inkSoft; ctx.textAlign = 'center';
  ctx.fillText(TEXT.certificateFooter, cx, 986);
  ctx.restore();
}
