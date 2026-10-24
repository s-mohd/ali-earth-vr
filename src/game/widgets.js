// Game-specific world widgets: control console, info board on posts, evidence markers, stars, stamp, confetti, plinth rim, easel.
import * as THREE from 'three';
import { PAL, mat, basic, roundedBox, mergeParts, vcMat, canvas as mkCanvas, canvasTexture, puffTexture, rng, ease, blobShadow } from '../core/kit.js';
import { Button, Panel, drawText, drawPill, drawIcon, roundRect, setFont, labelMesh, popIn } from '../core/ui.js';
import { onFrame } from '../core/tween.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

/** Turn `obj` (yaw only) so its +Z faces the world point `p`. */
export function faceYaw(obj, p) {
  obj.parent.updateWorldMatrix(true, false);
  const wp = obj.getWorldPosition(_v.set(0, 0, 0));
  const yaw = Math.atan2(p.x - wp.x, p.z - wp.z);
  obj.parent.getWorldQuaternion(_q);
  _e.setFromQuaternion(_q, 'YXZ');
  obj.rotation.y = yaw - _e.y;
}

/** Button colour roles (art brief §3.6): ink on bright faces, white on deep faces. */
export const BTN = {
  cta: { color: '#ffc93c', textColor: '#25385c' }, // watch / replay / start
  next: { color: '#1f8a80', textColor: '#ffffff' }, // forward
  alt: { color: '#6f55c9', textColor: '#ffffff' }, // before / after
  go: { color: '#26935b', textColor: '#ffffff' }, // confirm / continue
  plain: { color: '#ffffff', textColor: '#25385c' }, // map / menu
  stop: { color: '#c4523c', textColor: '#ffffff' }, // leave the headset
};

// ------------------------------------------------------------------ console (waist-height desk with buttons, RTL order)
export class Console extends THREE.Group {
  constructor({ w = 1.3, trim = PAL.tealDark } = {}) {
    super();
    this.w = w;
    this.board = new THREE.Group();
    this.add(this.board);
    const slab = new THREE.Mesh(roundedBox(w, 0.24, 0.035, 0.05, 3), mat('#fbf4e8'));
    slab.position.z = -0.03;
    const trimMesh = new THREE.Mesh(roundedBox(w + 0.04, 0.28, 0.02, 0.07, 3), mat(trim));
    trimMesh.position.z = -0.05;
    this.board.add(slab, trimMesh);
    this.buttons = [];
  }
  /** defs: [{ id, label, icon, color, w, onClick, iconSide }] in reading order (first = rightmost). */
  addButton(def) {
    const b = new Button({ h: 0.13, w: def.w || 0.29, size: def.size, depth: 0.04, ...def });
    b.position.z = -0.012;
    this.board.add(b);
    this.buttons.push(b);
    return b;
  }
  refresh() { this.only(...(this._last || [])); }
  /** Lay out the visible buttons right-to-left, centred. */
  arrange() {
    const vis = this.buttons.filter((b) => b.visible && !b._hideT);
    this.visible = vis.length > 0; // an empty desk is just clutter
    const gap = 0.035, total = vis.reduce((s, b) => s + b.w, 0) + gap * Math.max(0, vis.length - 1);
    let x = total / 2;
    for (const b of vis) { b.position.x = x - b.w / 2; x -= b.w + gap; }
    const slabW = Math.max(0.6, total + 0.12);
    this.board.children[0].scale.x = slabW / this.w;
    this.board.children[1].scale.x = (slabW + 0.04) / (this.w + 0.04);
  }
  /** Show exactly these buttons (plus persistent ones such as the headset menu), then arrange. */
  only(...list) {
    this._last = list;
    for (const b of this.buttons) {
      b.setAttention(false);
      const on = (list.includes(b) && !(b.screenOnly && Console.persistent)) || (b.persistent && Console.persistent);
      if (on && !b.visible) b.show();
      else if (!on && b.visible) b.hide(true);
    }
    this.arrange();
  }
  /** Place at the waist in front of the viewer (h from layout.uiHeights), tilted toward the eyes. */
  place(h) {
    // headset: at the waist, 0.66 m ahead (the eyes look over it at the diorama);
    // screen: low in the picture, close to the camera, so it never covers the diorama
    const dy = h.vz ? 0.56 : Math.min(0.55, Math.max(0.38, h.eye * 0.4)), z = h.vz ? h.vz - 1.0 : -0.66;
    this.position.set(0, h.eye - dy, z);
    this.rotation.set(-(Math.atan2(dy, h.vz - z) + (h.vz ? 0.05 : 0.12)), 0, 0);
    this.scale.setScalar(h.vz ? 0.8 : 1);
  }
}

Console.persistent = false; // true while presenting in the headset (shows the ⚙ menu button)

// ------------------------------------------------------------------ in-headset menu (replaces the screen toolbar inside VR)
export class VRMenu extends THREE.Group {
  constructor({ title, items, onClose }) {
    super();
    this.panel = new Panel({ w: 0.92, h: 0.56, ppm: 900, frame: PAL.ink, border: 0.02, depth: 0.03, radius: 0.05 });
    this.panel.draw((c, W) => drawText(c, title, { x: 40, y: 18, w: W - 80, h: 90 }, { size: 62, weight: 800 }));
    this.add(this.panel);
    this.buttons = items.map((it, i) => {
      const b = new Button({ id: 'menu:' + it.id, label: it.label(), icon: it.icon, color: it.color, textColor: it.textColor, w: 0.4, h: 0.13, onClick: () => { it.onClick(); b.setLabel(it.label()); } });
      b.position.set(i % 2 ? -0.215 : 0.215, 0.07 - Math.floor(i / 2) * 0.17, 0.03);
      b.item = it;
      this.add(b);
      return b;
    });
    const close = new Button({ id: 'menu:close', label: '', icon: 'cross', ...BTN.stop, w: 0.1, h: 0.1, onClick: onClose });
    close.position.set(-0.4, 0.22, 0.04);
    this.add(close);
    this.visible = false;
  }
  open() { for (const b of this.buttons) b.setLabel(b.item.label()); this.visible = true; popIn(this, 0.3, 0.7); }
  close() { this.visible = false; }
}

// ------------------------------------------------------------------ info board on two posts
export class Board extends THREE.Group {
  constructor({ w = 1.0, h = 0.72, color = PAL.teal } = {}) {
    super();
    this.panel = new Panel({ w, h, ppm: 1000, frame: color, border: 0.03, depth: 0.04, radius: 0.05 });
    this.add(this.panel);
    const wood = mergeParts([
      { geo: new THREE.CylinderGeometry(0.035, 0.04, 1, 10), color: PAL.trunk, pos: [-w * 0.36, 0.5, -0.03] },
      { geo: new THREE.CylinderGeometry(0.035, 0.04, 1, 10), color: PAL.trunk, pos: [w * 0.36, 0.5, -0.03] },
    ]);
    this.posts = new THREE.Mesh(wood, vcMat());
    this.add(this.posts);
    blobShadow(w * 0.55, 0.18, 0.25, this, [0, 0.01, -0.03]);
    this.w = w; this.h = h;
  }
  /** Board centre height above its feet. */
  setHeight(y) {
    this.panel.position.y = y;
    this.posts.scale.y = Math.max(0.2, y - this.h / 2 + 0.05);
  }
}

// ------------------------------------------------------------------ evidence marker: pulsing ring + hidden hit sphere, becomes a label when found
const ringGeo = new THREE.TorusGeometry(1, 0.06, 8, 40);
const glowGeo = new THREE.PlaneGeometry(1, 1);
export class EvidenceMarker extends THREE.Group {
  constructor({ id, radius = 0.35, label, color = PAL.sun, textColor = '#ffffff', input, onFound }) {
    super();
    this.evId = id; this.radius = Math.max(0.28, radius); this.labelText = label; this.color = color; this.textColor = textColor;
    this.found = false; this.hovered = false; this.k = { t: Math.random() * 6, hover: 0, show: 0, hint: 0 };
    this.spin = new THREE.Group(); this.add(this.spin);
    this.ringMat = basic(PAL.sun, { unique: true, transparent: true, opacity: 0.95, depthWrite: false, fog: false });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.scale.setScalar(this.radius);
    this.ring.renderOrder = 20;
    this.glowMat = new THREE.MeshBasicMaterial({ map: puffTexture(), color: '#fff3b0', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    this.glow = new THREE.Mesh(glowGeo, this.glowMat);
    this.glow.scale.setScalar(this.radius * 2.6);
    this.glow.renderOrder = 19;
    this.spin.add(this.glow, this.ring);
    const hitMat = new THREE.MeshBasicMaterial();
    hitMat.visible = false;
    this.hit = new THREE.Mesh(new THREE.SphereGeometry(this.radius * 1.15, 12, 8), hitMat);
    this.add(this.hit);
    this._unreg = input.add(this.hit, {
      id: 'ev:' + id,
      onClick: () => { if (!this.found) onFound?.(this); },
      onHover: (v) => { this.hovered = v; },
      enabled: () => !this.found && this.k.show > 0.5,
    });
    this.visible = false;
    this._off = onFrame((dt) => this.tick(dt));
  }
  show() { this.visible = true; this.k.show = 0; return this; }
  hide() { this.visible = false; return this; }
  hint() { this.k.hint = 2.2; }
  /** Turn into a floating label above the feature. */
  markFound(viewer, { instant = false } = {}) {
    this.found = true;
    this.spin.visible = false;
    if (!this.label) {
      this.label = labelMesh(this.labelText, { h: 0.2, size: 70, bg: this.color, color: this.textColor, icon: 'check' });
      this.label.position.y = this.radius + 0.22;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), basic('#ffffff'));
      stick.position.y = this.radius + 0.06;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), basic(this.color));
      this.labelGroup = new THREE.Group();
      this.labelGroup.add(this.label, stick, dot);
      this.add(this.labelGroup);
    }
    this.labelGroup.visible = true;
    this.visible = true;
    if (!instant) popIn(this.labelGroup, 0.45, 0.2);
    this.viewer = viewer;
  }
  reset() { this.found = false; this.spin.visible = true; if (this.labelGroup) this.labelGroup.visible = false; this.visible = false; }
  tick(dt) {
    if (!this.visible) return;
    const k = this.k;
    k.t += dt; k.show = Math.min(1, k.show + dt * 2.5); k.hint = Math.max(0, k.hint - dt);
    k.hover += ((this.hovered ? 1 : 0) - k.hover) * Math.min(1, dt * 12);
    const s = ease.outBack(k.show) * (1 + Math.sin(k.t * 3.2) * 0.07 + k.hover * 0.18 + Math.sin(k.t * 12) * k.hint * 0.08);
    this.spin.scale.setScalar(Math.max(0.001, s));
    this.spin.position.y = k.hint > 0 ? Math.abs(Math.sin(k.t * 6)) * 0.08 : 0;
    this.ringMat.color.set(this.hovered ? '#ffffff' : PAL.sun);
    this.glowMat.opacity = 0.35 + 0.25 * Math.sin(k.t * 3.2) + k.hover * 0.3;
    const head = this.viewer;
    if (head) {
      // face the viewer (yaw only) so rings and labels stay readable
      faceYaw(this.spin, head);
      if (this.labelGroup) faceYaw(this.labelGroup, head);
    }
  }
  dispose() { this._unreg?.(); this._off?.(); }
}

// ------------------------------------------------------------------ tutorial star
const starShape = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.42 : 1, a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  return s;
})();
const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 }).center();
export class Star extends THREE.Group {
  constructor({ id, input, onCollect }) {
    super();
    this.mesh = new THREE.Mesh(starGeo, mat(PAL.sun, { emissive: '#ffb43a', emissiveIntensity: 0.45, unique: true }));
    this.mesh.scale.setScalar(0.11);
    this.glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: puffTexture(), color: '#fff0a0', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.glow.scale.setScalar(0.5);
    this.add(this.glow, this.mesh);
    this.k = { t: Math.random() * 5, hover: 0, gone: 0 };
    this.collected = false;
    this._unreg = input.add(this.mesh, {
      id,
      onClick: () => { if (!this.collected) { this.collected = true; onCollect?.(this); } },
      onHover: (v) => (this.hovered = v),
      enabled: () => !this.collected,
    });
    this._off = onFrame((dt) => this.tick(dt));
  }
  tick(dt) {
    if (!this.visible) return;
    const k = this.k;
    k.t += dt;
    k.hover += ((this.hovered ? 1 : 0) - k.hover) * Math.min(1, dt * 12);
    if (this.collected) {
      k.gone += dt * 2.2;
      const s = Math.max(0.001, 1 + k.gone * 0.6) * Math.max(0, 1 - k.gone);
      this.scale.setScalar(Math.max(0.001, s));
      this.mesh.rotation.y += dt * 14;
      if (k.gone >= 1) this.visible = false;
      return;
    }
    this.mesh.rotation.y = Math.sin(k.t * 1.3) * 0.5;
    this.mesh.position.y = Math.sin(k.t * 2) * 0.03;
    this.scale.setScalar(1 + k.hover * 0.25);
    if (this.viewer) faceYaw(this.glow, this.viewer);
  }
  dispose() { this._unreg?.(); this._off?.(); }
}

// ------------------------------------------------------------------ confetti burst (one instanced draw call)
export class Confetti extends THREE.InstancedMesh {
  constructor(count = 140) {
    super(new THREE.PlaneGeometry(0.035, 0.022), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), count);
    this.frustumCulled = false;
    this.visible = false;
    this.p = [];
    const cols = [PAL.coral, PAL.sun, PAL.teal, PAL.lav, PAL.green, PAL.orange, PAL.sky2].map((c) => new THREE.Color(c));
    const r = rng(7);
    for (let i = 0; i < count; i++) {
      this.setColorAt(i, cols[i % cols.length]);
      this.p.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(r() * 9 - 4.5, r() * 9 - 4.5, r() * 9 - 4.5), seed: r() });
    }
    this.instanceColor.needsUpdate = true;
    this._m = new THREE.Matrix4(); this._qq = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1);
    this.life = 0;
    onFrame((dt) => this.tick(dt));
  }
  burst(origin, spread = 1) {
    this.position.set(0, 0, 0);
    let i = 0;
    for (const q of this.p) {
      const a = q.seed * Math.PI * 2 + i * 2.39996, up = 1.6 + ((i * 37) % 17) / 17 * 1.6;
      q.pos.copy(origin);
      q.vel.set(Math.cos(a) * spread * (0.4 + ((i * 13) % 11) / 11), up, Math.sin(a) * spread * (0.4 + ((i * 7) % 11) / 11));
      i++;
    }
    this.life = 3.2;
    this.visible = true;
  }
  tick(dt) {
    if (!this.visible) return;
    this.life -= dt;
    if (this.life <= 0) { this.visible = false; return; }
    let i = 0;
    for (const q of this.p) {
      q.vel.y -= 3.2 * dt; q.vel.multiplyScalar(1 - dt * 1.4);
      q.pos.addScaledVector(q.vel, dt);
      q.rot.x += q.spin.x * dt; q.rot.y += q.spin.y * dt; q.rot.z += q.spin.z * dt;
      this._qq.setFromEuler(q.rot);
      this._s.setScalar(Math.min(1, this.life));
      this._m.compose(q.pos, this._qq, this._s);
      this.setMatrixAt(i++, this._m);
    }
    this.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ plinth rim around a station diorama
export function buildPlinthRim(radius = 2.72, hue = PAL.teal) {
  // one smooth lathed ring: a pale stone cap, warm stone wall with a band in the station's colour, a flared foot
  const r0 = radius - 0.03, r1 = radius + 0.2;
  const prof = [
    [r0 - 0.01, 0.1, '#cdb185'], [r0, 0.19, '#e6d6b6'], [r0 + 0.025, 0.207, '#f3e7cd'], [r1 - 0.025, 0.207, '#f3e7cd'],
    [r1 + 0.012, 0.188, '#e9dabd'], [r1 - 0.004, 0.168, '#c9ad80'], [r1 - 0.004, 0.15, hue], [r1 - 0.004, 0.09, hue],
    [r1 - 0.002, 0.072, '#d8bf94'], [r1 + 0.03, -0.01, '#cdb185'], [r1 + 0.034, -0.12, '#b99a6c'],
  ];
  const seg = 120;
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const col = new Float32Array(g.attributes.position.count * 3), c = new THREE.Color();
  for (let i = 0; i <= seg; i++) for (let j = 0; j < prof.length; j++) {
    c.set(prof[j][2]);
    if (j === 6 || j === 7) c.multiplyScalar(i % 6 < 3 ? 1 : 0.86); // tiled band
    c.toArray(col, (i * prof.length + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, vcMat());
  m.name = 'plinth-rim';
  return m;
}

/** The spot where the child stands: a sandy disc with footprints facing the diorama and a ring in the place's colour. */
export function buildViewerPad(hue = PAL.teal) {
  const S = 512, cv = mkCanvas(S, S), x = cv.getContext('2d');
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.49, 0, Math.PI * 2); x.fillStyle = '#fff4e2'; x.fill();
  x.lineWidth = S * 0.05; x.strokeStyle = hue; x.beginPath(); x.arc(S / 2, S / 2, S * 0.44, 0, Math.PI * 2); x.stroke();
  x.setLineDash([S * 0.03, S * 0.025]); x.lineWidth = S * 0.012; x.strokeStyle = hue;
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  const foot = (fx, fy, flip) => {
    x.save(); x.translate(fx, fy); x.scale(flip, 1); x.fillStyle = 'rgba(37,56,92,0.42)';
    x.beginPath(); x.ellipse(0, 0, S * 0.045, S * 0.085, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(-S * 0.004, S * 0.1, S * 0.035, S * 0.04, 0, 0, Math.PI * 2); x.fill();
    for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(-S * 0.03 + k * S * 0.016, -S * 0.1 - (k === 0 ? 0.006 : Math.abs(k - 1.2) * 0.004) * S, S * (0.016 - k * 0.0015), 0, Math.PI * 2); x.fill(); }
    x.restore();
  };
  foot(S * 0.42, S * 0.53, 1); foot(S * 0.58, S * 0.53, -1);
  // a small arrow toward the diorama (canvas top = forward)
  x.fillStyle = hue; x.beginPath(); x.moveTo(S / 2, S * 0.17); x.lineTo(S * 0.45, S * 0.25); x.lineTo(S * 0.55, S * 0.25); x.closePath(); x.fill();
  const tex = canvasTexture(cv);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
  disc.position.y = 0.014;
  disc.renderOrder = 1;
  disc.name = 'viewer-pad';
  return disc;
}

// ------------------------------------------------------------------ easel for the certificate in the hall
export function buildEasel(w = 1.15, h = 0.82) {
  const g = new THREE.Group();
  const legs = mergeParts([
    { geo: new THREE.BoxGeometry(0.05, 1.9, 0.05), color: PAL.trunk, pos: [-w * 0.42, 0.92, 0.06], rot: [-0.12, 0, 0.06] },
    { geo: new THREE.BoxGeometry(0.05, 1.9, 0.05), color: PAL.trunk, pos: [w * 0.42, 0.92, 0.06], rot: [-0.12, 0, -0.06] },
    { geo: new THREE.BoxGeometry(0.05, 1.8, 0.05), color: PAL.trunkDark, pos: [0, 0.86, -0.32], rot: [0.28, 0, 0] },
    { geo: new THREE.BoxGeometry(w * 0.95, 0.05, 0.08), color: PAL.trunkDark, pos: [0, 0.6, 0.12] },
  ]);
  g.add(new THREE.Mesh(legs, vcMat()));
  blobShadow(0.6, 0.35, 0.25, g);
  const panel = new Panel({ w, h, ppm: 1100, frame: PAL.sun, border: 0.025, depth: 0.03, radius: 0.03, bg: '#fffaf1' });
  panel.position.set(0, 0.6 + h / 2 + 0.03, 0.15);
  panel.rotation.x = -0.12;
  g.add(panel);
  g.userData.panel = panel;
  return g;
}

// ------------------------------------------------------------------ stamp that slams onto the screen in front of the viewer
export function stampCanvas(thumb, color, label, textColor = '#fff') {
  const S = 512, c = mkCanvas(S, S), x = c.getContext('2d');
  x.save();
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2); x.fillStyle = color; x.fill();
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); x.fillStyle = '#ffffff'; x.fill();
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.37, 0, Math.PI * 2); x.clip();
  if (thumb) { const s = Math.max((S * 0.74) / thumb.width, (S * 0.74) / thumb.height); x.drawImage(thumb, S / 2 - (thumb.width * s) / 2, S / 2 - (thumb.height * s) / 2, thumb.width * s, thumb.height * s); }
  x.restore();
  // dashed inner ring (passport stamp look)
  x.setLineDash([18, 12]); x.lineWidth = 8; x.strokeStyle = color;
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.43, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  if (label) {
    setFont(x, 54, 800);
    const w = x.measureText(label).width + 60;
    x.fillStyle = color; roundRect(x, S / 2 - w / 2, S * 0.76, w, 78, 39); x.fill();
    x.fillStyle = textColor; x.textAlign = 'center'; x.fillText(label, S / 2, S * 0.76 + 42);
  }
  return c;
}

export class StampFX extends THREE.Group {
  constructor() {
    super();
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthTest: false, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), this.mat);
    this.mesh.renderOrder = 5000;
    this.add(this.mesh);
    this.visible = false;
    this.k = 0;
    onFrame((dt) => this.tick(dt));
  }
  play(canvas) {
    this.mat.map?.dispose();
    this.mat.map = canvasTexture(canvas);
    this.mat.needsUpdate = true;
    this.visible = true; this.k = 0;
  }
  tick(dt) {
    if (!this.visible) return;
    this.k += dt;
    const k = this.k;
    const s = k < 0.28 ? 2.2 - 1.25 * ease.in(k / 0.28) : k < 0.5 ? 0.95 + 0.05 * ease.outBack((k - 0.28) / 0.22) : 1;
    this.mesh.scale.setScalar(s);
    this.mesh.rotation.z = -0.18 * Math.min(1, k / 0.28);
    this.mat.opacity = k < 0.15 ? k / 0.15 : k > 2.2 ? Math.max(0, 1 - (k - 2.2) / 0.4) : 1;
    if (k > 2.6) this.visible = false;
  }
}
