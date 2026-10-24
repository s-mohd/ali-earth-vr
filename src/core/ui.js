// In-world UI kit (works identically on screen and in the headset):
// Arabic RTL canvas text with auto-fit, Panel, Button, Card, Bubble, Icon set.
import * as THREE from 'three';
import { PAL, mat, roundedBox, canvas as mkCanvas, canvasTexture, ease } from './kit.js';

export const FONT = '"Baloo Bhaijaan 2", "Noto Sans Arabic", "Noto Naskh Arabic", "Geeza Pro", Tahoma, sans-serif';
const MAX_TEX = 2048;

let ENGINE = null, INPUT = null, SFX = null;
const live = new Set(); // animated widgets
export function initUI(engine, input, sfx) {
  ENGINE = engine; INPUT = input; SFX = sfx || null;
  engine.onRealUpdate((dt) => { for (const w of live) w._tick(dt); });
}
export function setUISfx(sfx) { SFX = sfx; }

// ---------------------------------------------------------------- text
export function setFont(ctx, size, weight = 700) {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';
}
export function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(t).width > maxW) { out.push(cur); cur = w; } else cur = t;
    }
    out.push(cur);
  }
  return out;
}
/**
 * Draw wrapped Arabic text inside a box, shrinking the font until it fits.
 * box: { x, y, w, h } (x,y = top-left). opts: { size, min, weight, color, align: 'center'|'right'|'left', lh, maxLines, valign, stroke, strokeW }
 */
export function drawText(ctx, text, box, o = {}) {
  let size = o.size || 48;
  const min = o.min || 16, lhK = o.lh || 1.4, maxLines = o.maxLines || 8;
  let lines, lh;
  for (;;) {
    setFont(ctx, size, o.weight || 700);
    lines = wrapLines(ctx, text, box.w);
    lh = size * lhK;
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    if ((lines.length * lh <= box.h && lines.length <= maxLines && widest <= box.w + 1) || size <= min) break;
    size -= Math.max(1, size * 0.06);
  }
  const total = lines.length * lh;
  let y0 = o.valign === 'top' ? box.y + lh / 2 : o.valign === 'bottom' ? box.y + box.h - total + lh / 2 : box.y + (box.h - total) / 2 + lh / 2;
  ctx.textAlign = o.align === 'right' ? 'right' : o.align === 'left' ? 'left' : 'center';
  const x = o.align === 'right' ? box.x + box.w : o.align === 'left' ? box.x : box.x + box.w / 2;
  for (const l of lines) {
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeW || size * 0.18; ctx.strokeText(l, x, y0 + size * 0.04); }
    ctx.fillStyle = o.color || PAL.ink;
    ctx.fillText(l, x, y0 + size * 0.04);
    y0 += lh;
  }
  return { size, lines, height: total };
}
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** Pill-shaped tag (e.g. "محاكاة مسرّعة"). */
export function drawPill(ctx, text, cx, cy, { size = 40, bg = PAL.sun, color = PAL.ink, padX = 0.9, icon = null } = {}) {
  setFont(ctx, size, 800);
  const tw = ctx.measureText(text).width, iw = icon ? size * 1.15 : 0, w = tw + iw + size * padX * 2, h = size * 1.7;
  ctx.fillStyle = bg; roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fill();
  const right = cx + w / 2 - size * padX;
  if (icon) drawIcon(ctx, icon, right - iw / 2 + size * 0.1, cy, size * 0.95, color);
  ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.fillText(text, right - iw, cy + size * 0.05);
  return { w, h };
}

// ---------------------------------------------------------------- icons (vector, any color)
export function drawIcon(ctx, name, x, y, s, color = '#fff') {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const h = s / 2, P = () => ctx.beginPath();
  switch (name) {
    case 'play': P(); ctx.moveTo(-h * 0.55, -h * 0.8); ctx.lineTo(h * 0.85, 0); ctx.lineTo(-h * 0.55, h * 0.8); ctx.closePath(); ctx.fill(); break;
    case 'replay': { P(); ctx.arc(0, 0, h * 0.68, -Math.PI * 0.3, Math.PI * 1.35); ctx.stroke(); const a = -Math.PI * 0.3, px = Math.cos(a) * h * 0.68, py = Math.sin(a) * h * 0.68; P(); ctx.moveTo(px + h * 0.42, py - h * 0.02); ctx.lineTo(px - h * 0.08, py - h * 0.42); ctx.lineTo(px - h * 0.12, py + h * 0.22); ctx.closePath(); ctx.fill(); break; }
    case 'next': case 'prev': { const d = name === 'next' ? -1 : 1; ctx.lineWidth = s * 0.16; P(); ctx.moveTo(-d * h * 0.7, 0); ctx.lineTo(d * h * 0.55, 0); ctx.stroke(); P(); ctx.moveTo(d * h * 0.85, 0); ctx.lineTo(d * h * 0.2, -h * 0.6); ctx.lineTo(d * h * 0.2, h * 0.6); ctx.closePath(); ctx.fill(); break; }
    case 'home': P(); ctx.moveTo(0, -h * 0.85); ctx.lineTo(h * 0.9, -h * 0.05); ctx.lineTo(h * 0.62, -h * 0.05); ctx.lineTo(h * 0.62, h * 0.8); ctx.lineTo(h * 0.18, h * 0.8); ctx.lineTo(h * 0.18, h * 0.3); ctx.lineTo(-h * 0.18, h * 0.3); ctx.lineTo(-h * 0.18, h * 0.8); ctx.lineTo(-h * 0.62, h * 0.8); ctx.lineTo(-h * 0.62, -h * 0.05); ctx.lineTo(-h * 0.9, -h * 0.05); ctx.closePath(); ctx.fill(); break;
    case 'map': ctx.lineWidth = s * 0.11; P(); ctx.moveTo(-h * 0.85, -h * 0.55); ctx.lineTo(-h * 0.3, -h * 0.75); ctx.lineTo(h * 0.3, -h * 0.55); ctx.lineTo(h * 0.85, -h * 0.75); ctx.lineTo(h * 0.85, h * 0.6); ctx.lineTo(h * 0.3, h * 0.8); ctx.lineTo(-h * 0.3, h * 0.6); ctx.lineTo(-h * 0.85, h * 0.8); ctx.closePath(); ctx.stroke(); P(); ctx.moveTo(-h * 0.3, -h * 0.75); ctx.lineTo(-h * 0.3, h * 0.6); ctx.moveTo(h * 0.3, -h * 0.55); ctx.lineTo(h * 0.3, h * 0.8); ctx.stroke(); break;
    case 'check': ctx.lineWidth = s * 0.2; P(); ctx.moveTo(-h * 0.62, h * 0.02); ctx.lineTo(-h * 0.15, h * 0.5); ctx.lineTo(h * 0.68, -h * 0.5); ctx.stroke(); break;
    case 'cross': ctx.lineWidth = s * 0.18; P(); ctx.moveTo(-h * 0.5, -h * 0.5); ctx.lineTo(h * 0.5, h * 0.5); ctx.moveTo(h * 0.5, -h * 0.5); ctx.lineTo(-h * 0.5, h * 0.5); ctx.stroke(); break;
    case 'star': P(); for (let i = 0; i < 10; i++) { const r = i % 2 ? h * 0.42 : h * 0.95, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
    case 'trophy': P(); ctx.moveTo(-h * 0.55, -h * 0.75); ctx.lineTo(h * 0.55, -h * 0.75); ctx.lineTo(h * 0.45, -h * 0.05); ctx.quadraticCurveTo(0, h * 0.35, -h * 0.45, -h * 0.05); ctx.closePath(); ctx.fill(); ctx.fillRect(-h * 0.1, h * 0.1, h * 0.2, h * 0.4); ctx.fillRect(-h * 0.45, h * 0.5, h * 0.9, h * 0.22); ctx.lineWidth = s * 0.08; P(); ctx.arc(-h * 0.62, -h * 0.4, h * 0.22, Math.PI * 0.4, Math.PI * 1.6); ctx.stroke(); P(); ctx.arc(h * 0.62, -h * 0.4, h * 0.22, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke(); break;
    case 'speaker': P(); ctx.moveTo(-h * 0.75, -h * 0.25); ctx.lineTo(-h * 0.35, -h * 0.25); ctx.lineTo(h * 0.05, -h * 0.65); ctx.lineTo(h * 0.05, h * 0.65); ctx.lineTo(-h * 0.35, h * 0.25); ctx.lineTo(-h * 0.75, h * 0.25); ctx.closePath(); ctx.fill(); ctx.lineWidth = s * 0.09; P(); ctx.arc(h * 0.12, 0, h * 0.35, -0.9, 0.9); ctx.stroke(); P(); ctx.arc(h * 0.12, 0, h * 0.65, -0.9, 0.9); ctx.stroke(); break;
    case 'point': { // pointing hand / finger
      ctx.lineWidth = s * 0.09; P(); roundRect(ctx, -h * 0.55, -h * 0.05, h * 0.9, h * 0.75, h * 0.25); ctx.fill(); P(); roundRect(ctx, -h * 0.2, -h * 0.85, h * 0.28, h * 0.95, h * 0.14); ctx.fill(); break; }
    case 'eye': ctx.lineWidth = s * 0.1; P(); ctx.moveTo(-h * 0.85, 0); ctx.quadraticCurveTo(0, -h * 0.8, h * 0.85, 0); ctx.quadraticCurveTo(0, h * 0.8, -h * 0.85, 0); ctx.stroke(); P(); ctx.arc(0, 0, h * 0.28, 0, Math.PI * 2); ctx.fill(); break;
    case 'lock': ctx.lineWidth = s * 0.12; P(); ctx.arc(0, -h * 0.2, h * 0.38, Math.PI, 0); ctx.stroke(); P(); roundRect(ctx, -h * 0.6, -h * 0.15, h * 1.2, h * 0.95, h * 0.18); ctx.fill(); break;
    case 'flag': ctx.lineWidth = s * 0.1; P(); ctx.moveTo(-h * 0.5, h * 0.85); ctx.lineTo(-h * 0.5, -h * 0.8); ctx.stroke(); P(); ctx.moveTo(-h * 0.5, -h * 0.8); ctx.lineTo(h * 0.7, -h * 0.5); ctx.lineTo(-h * 0.5, -h * 0.15); ctx.closePath(); ctx.fill(); break;
    case 'swap': ctx.lineWidth = s * 0.1; P(); ctx.moveTo(-h * 0.7, -h * 0.28); ctx.lineTo(h * 0.65, -h * 0.28); ctx.moveTo(h * 0.3, -h * 0.6); ctx.lineTo(h * 0.68, -h * 0.28); ctx.lineTo(h * 0.3, h * 0.04); ctx.moveTo(h * 0.7, h * 0.36); ctx.lineTo(-h * 0.65, h * 0.36); ctx.moveTo(-h * 0.3, h * 0.04); ctx.lineTo(-h * 0.68, h * 0.36); ctx.lineTo(-h * 0.3, h * 0.68); ctx.stroke(); break;
    case 'clock': ctx.lineWidth = s * 0.1; P(); ctx.arc(0, 0, h * 0.75, 0, Math.PI * 2); ctx.stroke(); P(); ctx.moveTo(0, -h * 0.45); ctx.lineTo(0, 0); ctx.lineTo(h * 0.32, h * 0.2); ctx.stroke(); break;
    case 'question': ctx.lineWidth = s * 0.14; P(); ctx.arc(0, -h * 0.25, h * 0.38, Math.PI * 1.05, Math.PI * 0.45); ctx.stroke(); P(); ctx.moveTo(h * 0.13, h * 0.1); ctx.lineTo(0, h * 0.28); ctx.stroke(); P(); ctx.arc(0, h * 0.68, h * 0.11, 0, Math.PI * 2); ctx.fill(); break;
    case 'bolt': P(); ctx.moveTo(h * 0.2, -h * 0.9); ctx.lineTo(-h * 0.55, h * 0.12); ctx.lineTo(-h * 0.02, h * 0.12); ctx.lineTo(-h * 0.25, h * 0.9); ctx.lineTo(h * 0.58, -h * 0.18); ctx.lineTo(h * 0.05, -h * 0.18); ctx.closePath(); ctx.fill(); break;
    case 'gear': { P(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? h * 0.62 : h * 0.86; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation = 'destination-out'; P(); ctx.arc(0, 0, h * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; break; }
    case 'pause': ctx.fillRect(-h * 0.55, -h * 0.7, h * 0.38, h * 1.4); ctx.fillRect(h * 0.17, -h * 0.7, h * 0.38, h * 1.4); break;
    case 'hand': { ctx.lineWidth = s * 0.08; for (let i = 0; i < 4; i++) { P(); roundRect(ctx, -h * 0.55 + i * h * 0.3, -h * 0.85 + (i === 0 || i === 3 ? h * 0.15 : 0), h * 0.22, h * 0.9, h * 0.11); ctx.fill(); } P(); roundRect(ctx, -h * 0.6, -h * 0.1, h * 1.15, h * 0.9, h * 0.3); ctx.fill(); break; }
    default: P(); ctx.arc(0, 0, h * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- Panel
/** A framed board with a canvas face. draw((ctx, W, H, ppm) => ...) */
export class Panel extends THREE.Group {
  constructor({ w = 1, h = 0.6, ppm = 512, radius = 0.06, depth = 0.04, frame = PAL.teal, border = 0.025, bg = PAL.paper, bgRadius = null } = {}) {
    super();
    this.w = w; this.h = h; this.bg = bg; this.radius = radius;
    const scale = Math.min(1, MAX_TEX / (w * ppm), MAX_TEX / (h * ppm));
    this.ppm = ppm * scale;
    this.canvas = mkCanvas(w * this.ppm, h * this.ppm);
    this.ctx = this.canvas.getContext('2d');
    this.tex = canvasTexture(this.canvas);
    if (depth > 0 && frame) {
      this.frame = new THREE.Mesh(roundedBox(w + border * 2, h + border * 2, depth, radius + border, 3), mat(frame));
      this.add(this.frame);
    }
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false }));
    this.face.position.z = depth > 0 ? depth / 2 + 0.002 : 0.001;
    this.face.renderOrder = 2;
    this.add(this.face);
    this.bgRadius = bgRadius ?? radius;
  }
  draw(fn) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    if (this.bg) { c.fillStyle = this.bg; roundRect(c, 0, 0, W, H, this.bgRadius * this.ppm); c.fill(); }
    fn?.(c, W, H, this.ppm);
    this.tex.needsUpdate = true;
    return this;
  }
  /** Quick: centred text. */
  text(t, opts = {}) { return this.draw((c, W, H) => drawText(c, t, { x: W * 0.06, y: H * 0.08, w: W * 0.88, h: H * 0.84 }, { size: opts.size || H * 0.3, ...opts })); }
  pop() { popIn(this); return this; }
}

/** Scale-bounce an object in (UI juice). */
export function popIn(obj, dur = 0.35, from = 0.6) {
  const s0 = obj.userData._baseScale || (obj.userData._baseScale = obj.scale.clone());
  obj._popT = 0; obj._popDur = dur; obj._popFrom = from;
  if (!obj._popTick) {
    obj._popTick = (dt) => {
      obj._popT += dt;
      const k = Math.min(1, obj._popT / obj._popDur), s = obj._popFrom + (1 - obj._popFrom) * ease.outBack(k);
      obj.scale.copy(s0).multiplyScalar(s);
      if (k >= 1) { live.delete(obj._popW); obj.scale.copy(s0); }
    };
    obj._popW = { _tick: obj._popTick };
  }
  live.add(obj._popW);
}

// ---------------------------------------------------------------- Button
export class Button extends THREE.Group {
  /**
   * opts: { id, label, icon, w, h, color, textColor, size, onClick, depth, sound:false }
   */
  constructor(o = {}) {
    super();
    this.o = o;
    this.uiId = o.id; // Object3D.id is read-only
    this.w = o.w || 0.5; this.h = o.h || 0.15;
    const d = o.depth ?? 0.045;
    this.color = new THREE.Color(o.color || PAL.coral);
    this.enabled = true; this.hovered = false; this.attention = false;
    this.k = { hover: 0, press: 0, show: 1, pulse: 0 };
    this.inner = new THREE.Group();
    this.add(this.inner);
    this.bodyMat = new THREE.MeshLambertMaterial({ color: this.color.clone(), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
    this.body = new THREE.Mesh(roundedBox(this.w, this.h, d, this.h * 0.46, 4), this.bodyMat);
    this.body.position.z = d / 2;
    const baseCol = this.color.clone().multiplyScalar(0.72);
    this.baseMat = new THREE.MeshLambertMaterial({ color: baseCol });
    this.base = new THREE.Mesh(roundedBox(this.w + 0.02, this.h + 0.02, 0.025, (this.h + 0.02) * 0.46, 3), this.baseMat);
    this.base.position.z = 0.0125;
    this.add(this.base);
    this.inner.add(this.body);
    this.ppm = 420;
    this.canvas = mkCanvas(this.w * this.ppm, this.h * this.ppm);
    this.ctx = this.canvas.getContext('2d');
    this.tex = canvasTexture(this.canvas);
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false }));
    this.face.position.z = d + 0.002;
    this.face.renderOrder = 3;
    this.inner.add(this.face);
    this.setLabel(o.label || '', o.icon);
    this._unreg = INPUT?.add(this.body, {
      id: o.id,
      onClick: (via) => this.click(via),
      onHover: (v) => { this.hovered = v; if (v && this.enabled) SFX?.hover?.(); },
      enabled: () => this.enabled && this.k.show > 0.6,
    });
    live.add(this);
  }
  setLabel(label, icon = this.icon) {
    this.label = label; this.icon = icon;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height, tc = this.o.textColor || '#ffffff';
    c.clearRect(0, 0, W, H);
    let size = this.o.size ? this.o.size * this.ppm : H * 0.44;
    setFont(c, size, 800);
    const iconS = icon ? H * 0.46 : 0, gap = icon && label ? H * 0.18 : 0;
    let tw = c.measureText(label).width;
    while (tw + iconS + gap > W * 0.86 && size > 12) { size -= 2; setFont(c, size, 800); tw = c.measureText(label).width; }
    const total = tw + iconS + gap, right = W / 2 + total / 2;
    // RTL: icon at the start (right) unless iconSide === 'end'
    const iconAtEnd = this.o.iconSide === 'end';
    if (icon) drawIcon(c, icon, iconAtEnd ? right - total + iconS / 2 : right - iconS / 2, H / 2, iconS, tc);
    c.textAlign = 'right';
    c.lineJoin = 'round'; c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = size * 0.14;
    const tx = iconAtEnd ? right : right - iconS - gap;
    if (label) { c.strokeText(label, tx, H / 2 + size * 0.06); c.fillStyle = tc; c.fillText(label, tx, H / 2 + size * 0.06); }
    this.tex.needsUpdate = true;
    return this;
  }
  setColor(col) { this.color.set(col); this.baseMat.color.copy(this.color).multiplyScalar(0.72); if (this.enabled) this.bodyMat.color.copy(this.color); return this; }
  setEnabled(e) { this.enabled = !!e; this.bodyMat.color.set(e ? this.color : PAL.grey); this.baseMat.color.set(e ? this.color.clone().multiplyScalar(0.72) : '#a9b0b8'); this.face.material.opacity = e ? 1 : 0.8; return this; }
  setAttention(a) { this.attention = !!a; return this; }
  click(via) {
    if (!this.enabled) return;
    this.k.press = 1;
    if (this.o.sound !== false) SFX?.click?.();
    this.o.onClick?.(this, via);
  }
  show(delay = 0) {
    this.visible = true; this._hideT = null;
    this.k.show = 0; this._showDelay = delay;
    return this;
  }
  hide(instant = false) { if (instant) { this.visible = false; this.k.show = 0; } else this._hideT = 0; return this; }
  _tick(dt) {
    if (!this.visible) return;
    const k = this.k;
    if (this._showDelay > 0) { this._showDelay -= dt; this.inner.scale.setScalar(0.001); this.base.scale.setScalar(0.001); return; }
    if (this._hideT != null) { k.show = Math.max(0, k.show - dt * 5); if (k.show <= 0) { this.visible = false; this._hideT = null; } }
    else if (k.show < 1) k.show = Math.min(1, k.show + dt * 3.2);
    const target = this.hovered && this.enabled ? 1 : 0;
    k.hover += (target - k.hover) * Math.min(1, dt * 14);
    k.press = Math.max(0, k.press - dt * 5);
    k.pulse += dt;
    const att = this.attention && this.enabled && !this.hovered ? Math.sin(k.pulse * 4.2) * 0.035 : 0;
    const s = (this._hideT != null ? k.show : ease.outBack(k.show)) * (1 + k.hover * 0.07 + att);
    this.inner.scale.set(s, s * (1 - k.press * 0.1), s);
    this.base.scale.set(s, s, s);
    this.inner.position.z = k.hover * 0.012 - k.press * 0.015;
    this.bodyMat.emissiveIntensity = this.enabled ? k.hover * 0.16 + (att > 0 ? att * 1.5 : 0) : 0;
  }
  dispose() { this._unreg?.(); live.delete(this); }
}

// ---------------------------------------------------------------- Answer card (picture + label)
const LETTERS = ['أ', 'ب', 'ج', 'د'];
const CARD_FRAME = { idle: '#cfe8f6', hover: PAL.sky2, selected: '#2f7fc0', correct: PAL.green, wrong: PAL.wrong, reveal: PAL.green, dim: '#d8dde3' };
export class Card extends THREE.Group {
  /** opts: { id, w, h, picture (canvas|null), text, index, onClick } */
  constructor(o = {}) {
    super();
    this.o = o; this.uiId = o.id;
    this.w = o.w || 0.6; this.h = o.h || (o.picture ? 0.7 : 0.5);
    this.state = 'idle'; this.interactive = true; this.hovered = false;
    this.k = { hover: 0, shake: 0, show: 1, t: Math.random() * 6 };
    this.inner = new THREE.Group(); this.add(this.inner);
    this.frameMat = new THREE.MeshLambertMaterial({ color: CARD_FRAME.idle, emissive: new THREE.Color('#000'), emissiveIntensity: 0.3 });
    this.frame = new THREE.Mesh(roundedBox(this.w + 0.05, this.h + 0.05, 0.05, 0.07, 3), this.frameMat);
    this.inner.add(this.frame);
    this.ppm = 520;
    this.canvas = mkCanvas(this.w * this.ppm, this.h * this.ppm);
    this.ctx = this.canvas.getContext('2d');
    this.tex = canvasTexture(this.canvas);
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false }));
    this.face.position.z = 0.027; this.face.renderOrder = 2;
    this.inner.add(this.face);
    this.letter = LETTERS[o.index ?? 0];
    this.redraw();
    this._unreg = INPUT?.add(this.frame, {
      id: o.id,
      onClick: (via) => { if (this.interactive) { SFX?.click?.(); this.o.onClick?.(this, via); } },
      onHover: (v) => { this.hovered = v; if (v && this.interactive) SFX?.hover?.(); this.updateFrame(); },
      enabled: () => this.interactive && this.k.show > 0.7,
    });
    live.add(this);
  }
  setState(s) { this.state = s; if (s === 'wrong') this.k.shake = 1; this.redraw(); this.updateFrame(); return this; }
  setInteractive(v) { this.interactive = !!v; this.updateFrame(); return this; }
  updateFrame() {
    const st = this.state === 'idle' && this.hovered && this.interactive ? 'hover' : this.state;
    this.frameMat.color.set(CARD_FRAME[st] || CARD_FRAME.idle);
    this.frameMat.emissive.set(st === 'correct' || st === 'reveal' ? '#1b6b42' : st === 'hover' || st === 'selected' ? '#20507a' : '#000000');
  }
  redraw() {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height, pic = this.o.picture, st = this.state;
    c.clearRect(0, 0, W, H);
    const bg = { idle: ['#ffffff', '#fff7ea'], correct: ['#f1fff6', '#d3f5e1'], reveal: ['#f1fff6', '#d3f5e1'], wrong: ['#fffaf3', '#fde4cf'], dim: ['#f6f6f6', '#e8eaed'] }[st] || ['#fff', '#fff7ea'];
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
    c.fillStyle = g; roundRect(c, 0, 0, W, H, 0.05 * this.ppm); c.fill();
    const pad = W * 0.05;
    let textBox;
    if (pic) {
      const pw = W - pad * 2, ph = Math.min(H * 0.68, pw * 0.75);
      c.save(); roundRect(c, pad, pad, pw, ph, 0.035 * this.ppm); c.clip();
      const s = Math.max(pw / pic.width, ph / pic.height), dw = pic.width * s, dh = pic.height * s;
      c.globalAlpha = st === 'dim' ? 0.5 : 1;
      c.drawImage(pic, pad + (pw - dw) / 2, pad + (ph - dh) / 2, dw, dh);
      c.restore();
      textBox = { x: pad, y: pad + ph + H * 0.02, w: W - pad * 2, h: H - ph - pad * 2 - H * 0.02 };
    } else textBox = { x: pad * 1.2, y: H * 0.2, w: W - pad * 2.4, h: H * 0.7 };
    drawText(c, this.o.text || '', textBox, { size: pic ? H * 0.075 : H * 0.17, min: 18, weight: 800, color: st === 'dim' ? '#8a96a6' : PAL.ink, maxLines: pic ? 2 : 3, lh: 1.25 });
    // letter badge (top-right in RTL)
    const r = W * 0.085, bx = W - pad - r * 0.6, by = pad + r * 0.6;
    c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fillStyle = st === 'dim' ? '#9aa6b5' : PAL.ink; c.fill();
    c.lineWidth = r * 0.16; c.strokeStyle = '#fff'; c.stroke();
    setFont(c, r * 1.15, 800); c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(this.letter, bx, by + r * 0.08);
    // result badge (top-left)
    if (st === 'correct' || st === 'reveal' || st === 'wrong') {
      const rb = W * 0.1, ax = pad + rb * 0.7, ay = pad + rb * 0.7;
      c.beginPath(); c.arc(ax, ay, rb, 0, Math.PI * 2); c.fillStyle = st === 'wrong' ? '#f0a05a' : PAL.green; c.fill();
      c.lineWidth = rb * 0.14; c.strokeStyle = '#fff'; c.stroke();
      drawIcon(c, st === 'wrong' ? 'cross' : 'check', ax, ay, rb * 1.3, '#fff');
    }
    this.tex.needsUpdate = true;
  }
  show(delay = 0) { this.visible = true; this.k.show = 0; this._delay = delay; return this; }
  hide() { this._hide = true; return this; }
  _tick(dt) {
    if (!this.visible) return;
    const k = this.k;
    if (this._delay > 0) { this._delay -= dt; this.inner.scale.setScalar(0.001); return; }
    if (this._hide) { k.show = Math.max(0, k.show - dt * 5); if (k.show <= 0) { this.visible = false; this._hide = false; } }
    else k.show = Math.min(1, k.show + dt * 3);
    const lift = this.hovered && this.interactive ? 1 : this.state === 'correct' || this.state === 'reveal' || this.state === 'selected' ? 0.6 : 0;
    k.hover += (lift - k.hover) * Math.min(1, dt * 12);
    k.shake = Math.max(0, k.shake - dt * 1.8);
    k.t += dt;
    const pulse = this.state === 'reveal' ? 1 + Math.sin(k.t * 5) * 0.025 : 1;
    const s = (this._hide ? k.show : ease.outBack(k.show)) * (1 + k.hover * 0.05) * pulse;
    this.inner.scale.setScalar(Math.max(0.001, s));
    this.inner.position.set(Math.sin(k.t * 40) * k.shake * 0.02, Math.sin(k.t * 1.6) * 0.008 + k.hover * 0.02, k.hover * 0.05);
    this.inner.rotation.z = Math.sin(k.t * 32) * k.shake * 0.04;
  }
  dispose() {
    this._unreg?.(); live.delete(this);
    // free this card's own GPU memory (the frame geometry is the shared rounded box: keep it)
    this.tex.dispose(); this.face.geometry.dispose(); this.face.material.dispose(); this.frameMat.dispose();
  }
}

// ---------------------------------------------------------------- Speech bubble (sized to its text, faces the viewer)
const _bh = new THREE.Vector3(), _bp = new THREE.Vector3(), _bq = new THREE.Quaternion(), _be = new THREE.Euler();
export class Bubble extends THREE.Group {
  constructor({ maxW = 1.25, ppm = 460, tail = 'center' } = {}) {
    super();
    this.maxW = maxW; this.ppm = ppm; this.tail = tail;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }));
    this.mesh.renderOrder = 6;
    this.add(this.mesh);
    this.visible = false;
    this.k = { show: 0 };
    this.text = '';
    live.add(this);
  }
  say(text, { tail = this.tail, accent = PAL.teal } = {}) {
    this.text = text;
    const scratch = mkCanvas(8, 8).getContext('2d');
    const size = 56, lh = size * 1.42, padX = 54, padY = 40, tailH = 46;
    setFont(scratch, size, 700);
    const lines = wrapLines(scratch, text, this.maxW * this.ppm - padX * 2);
    const textW = Math.max(240, ...lines.map((l) => scratch.measureText(l).width));
    const W = Math.ceil(textW + padX * 2), Hb = Math.ceil(lines.length * lh + padY * 2), H = Hb + tailH;
    const cnv = mkCanvas(W + 16, H + 16), c = cnv.getContext('2d');
    c.translate(8, 8);
    c.fillStyle = 'rgba(31,59,99,0.18)'; roundRect(c, 4, 10, W - 8, Hb - 6, 44); c.fill();
    c.fillStyle = '#ffffff'; roundRect(c, 0, 0, W, Hb, 44); c.fill();
    const tx = tail === 'left' ? W * 0.22 : tail === 'right' ? W * 0.78 : W / 2;
    c.beginPath(); c.moveTo(tx - 30, Hb - 4); c.lineTo(tx, H - 2); c.lineTo(tx + 30, Hb - 4); c.closePath(); c.fill();
    c.lineWidth = 8; c.strokeStyle = accent; roundRect(c, 0, 0, W, Hb, 44); c.stroke();
    c.beginPath(); c.moveTo(tx - 30, Hb); c.lineTo(tx, H - 2); c.lineTo(tx + 30, Hb); c.stroke();
    c.fillStyle = '#fff'; c.fillRect(tx - 26, Hb - 10, 52, 12);
    setFont(c, size, 700); c.fillStyle = PAL.ink; c.textAlign = 'center';
    lines.forEach((l, i) => c.fillText(l, W / 2, padY + lh * i + lh / 2 + size * 0.04));
    const old = this.mesh.material.map;
    this.mesh.material.map = canvasTexture(cnv);
    this.mesh.material.needsUpdate = true;
    old?.dispose();
    const w = cnv.width / this.ppm, h = cnv.height / this.ppm;
    this.mesh.scale.set(w, h, 1);
    // anchor = the tail tip, so the bubble body extends away from the speaker
    this.mesh.position.set((cnv.width / 2 - (tx + 8)) / this.ppm, h / 2, 0);
    this.visible = true; this.k.show = 0; this._hiding = false;
    return this;
  }
  hide() { if (this.visible) this._hiding = true; }
  _tick(dt) {
    if (!this.visible) return;
    if (this._hiding) { this.k.show = Math.max(0, this.k.show - dt * 5); if (this.k.show <= 0) { this.visible = false; this._hiding = false; } }
    else this.k.show = Math.min(1, this.k.show + dt * 3.5);
    const s = this._hiding ? this.k.show : ease.outBack(this.k.show);
    this.scale.setScalar(Math.max(0.001, s));
    // face the viewer (yaw only keeps text upright and comfortable)
    if (ENGINE) {
      const head = ENGINE.headWorld(_bh), p = this.getWorldPosition(_bp);
      const yaw = Math.atan2(head.x - p.x, head.z - p.z);
      const parentYaw = this.parent ? _be.setFromQuaternion(this.parent.getWorldQuaternion(_bq), 'YXZ').y : 0;
      this.rotation.y = yaw - parentYaw;
    }
  }
}

/** Floating text label sprite (e.g. "+ ختم", sign posts). */
export function labelMesh(text, { h = 0.18, size = 64, bg = PAL.sun, color = PAL.ink, icon = null, ppm = 420 } = {}) {
  const scratch = mkCanvas(8, 8).getContext('2d'); setFont(scratch, size, 800);
  const iw = icon ? size * 1.2 : 0, w = scratch.measureText(text).width + iw + size * 1.6, hh = size * 1.8;
  const cnv = mkCanvas(w, hh), c = cnv.getContext('2d');
  drawPill(c, text, w / 2, hh / 2, { size, bg, color, icon });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * (w / hh), h), new THREE.MeshBasicMaterial({ map: canvasTexture(cnv), transparent: true, toneMapped: false, depthWrite: false }));
  m.renderOrder = 5;
  return m;
}
