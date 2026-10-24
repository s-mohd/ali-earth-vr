// The hub: Ali's welcome, the pointing tutorial (3 stars), the island map table with travel pins, and the explorer passport.
import * as THREE from 'three';
import { TEXT, STATIONS, STATION, shortName, num } from './content.js';
import { zoneTransform, RING } from '../core/layout.js';
import { PAL, mat, mergeParts, vcMat, canvas as mkCanvas, canvasTexture, blobShadow, rng } from '../core/kit.js';
import { drawText, drawPill, drawIcon, roundRect, setFont, popIn } from '../core/ui.js';
import { onFrame } from '../core/tween.js';
import { Console, Board, Star, faceYaw, BTN } from './widgets.js';

const TABLE_R = 0.56;
const MAP_SCALE = 0.36 / 17; // world meters → table meters (outer zones sit 0.36 m from the table centre)

export class HubZone {
  constructor(game) {
    this.g = game;
    this.phase = 'idle';
    this.root = new THREE.Group();
    this.root.name = 'hub-zone';
    game.frames.hub.add(this.root);
    this.aliSpot = new THREE.Vector3(1.4, 0, -2.05);

    // ---- passport board (viewer's left)
    this.passport = new Board({ w: 1.3, h: 0.92, color: PAL.coral });
    this.passport.position.set(-1.45, 0, -2.0);
    this.passport.rotation.y = Math.atan2(1.45, 2.0);
    this.root.add(this.passport);

    // ---- map table
    this.table = new THREE.Group();
    this.root.add(this.table);
    const wood = mergeParts([
      { geo: new THREE.CylinderGeometry(TABLE_R + 0.06, TABLE_R + 0.04, 0.06, 48), color: PAL.trunk, pos: [0, -0.03, 0] },
      { geo: new THREE.CylinderGeometry(0.07, 0.1, 1, 12), color: PAL.trunkDark, pos: [0, -0.5, 0] },
      { geo: new THREE.CylinderGeometry(0.32, 0.36, 0.05, 24), color: PAL.trunkDark, pos: [0, -1.0, 0] },
    ]);
    this.tableWood = new THREE.Mesh(wood, vcMat());
    this.table.add(this.tableWood);
    this.mapCanvas = mkCanvas(1024, 1024);
    this.mapTex = canvasTexture(this.mapCanvas);
    this.mapTop = new THREE.Mesh(new THREE.CircleGeometry(TABLE_R, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: this.mapTex }));
    this.mapTop.position.y = 0.002;
    this.table.add(this.mapTop);
    this.tableShadow = blobShadow(0.55, 0.55, 0.3, this.root, [0, 0.012, -1.2]);
    this._drawMap();

    // ---- pins (one per destination)
    this.pins = {};
    const dests = [...STATIONS.map((s) => s.key), 'hall'];
    for (const key of dests) {
      const { pos } = zoneTransform(key);
      const pin = new Pin({ key, game, onClick: () => this._pinClicked(key) });
      pin.position.set(pos.x * MAP_SCALE, 0, pos.z * MAP_SCALE);
      this.table.add(pin);
      this.pins[key] = pin;
    }

    // ---- console
    const C = (this.console = new Console());
    this.root.add(C);
    this.bGo = C.addButton({ id: 'hub:go', label: TEXT.watch, icon: 'next', iconSide: 'end', ...BTN.next, w: 0.5, onClick: () => this._go() });
    game.addMenuButton?.(C);
    C.only(this.bGo);

    // ---- tutorial stars
    this.stars = [];
    this.refresh();
  }

  // ------------------------------------------------------------------ drawing
  _drawMap() {
    const c = this.mapCanvas.getContext('2d'), S = 1024, C = S / 2, k = (C / TABLE_R) * MAP_SCALE; // world m → px
    c.clearRect(0, 0, S, S);
    const sea = c.createRadialGradient(C, C, 0, C, C, C);
    sea.addColorStop(0, '#8fdcea'); sea.addColorStop(1, '#4fa9cf');
    c.fillStyle = sea; c.fillRect(0, 0, S, S);
    // gentle wave lines
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 4;
    for (let r = 25.5; r < 34; r += 2.6) { c.beginPath(); c.arc(C, C, r * k, 0, Math.PI * 2); c.setLineDash([26, 22]); c.stroke(); }
    c.setLineDash([]);
    // island: beach + grass with a soft wobble
    const blob = (rad, col) => {
      c.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2, rr = rad * (1 + 0.035 * Math.sin(a * 5 + 1) + 0.02 * Math.sin(a * 11));
        const x = C + Math.cos(a) * rr * k, y = C + Math.sin(a) * rr * k;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.fillStyle = col; c.fill();
    };
    blob(24.5, PAL.sand);
    blob(22, PAL.grass);
    // sandy paths hub → zones
    c.strokeStyle = PAL.path; c.lineCap = 'round'; c.lineWidth = 22;
    for (const key of [...STATIONS.map((s) => s.key), 'hall']) {
      const { pos } = zoneTransform(key);
      c.beginPath(); c.moveTo(C, C); c.lineTo(C + pos.x * k, C + pos.z * k); c.stroke();
    }
    // hub plaza and "you are here"
    c.beginPath(); c.arc(C, C, 2.6 * k, 0, Math.PI * 2); c.fillStyle = '#f6e7c8'; c.fill();
    c.lineWidth = 6; c.strokeStyle = PAL.teal; c.stroke();
    // little palms
    const r = rng(5);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = 6 + r() * 15;
      const x = C + Math.cos(a) * d * k, y = C + Math.sin(a) * d * k;
      c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.fillStyle = PAL.leafDark; c.fill();
    }
    // compass rose (decorative)
    const cx = S * 0.86, cy = S * 0.86;
    c.save(); c.translate(cx, cy);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(0, 0, 54, 0, Math.PI * 2); c.fill();
    c.fillStyle = PAL.coral; c.beginPath(); c.moveTo(0, -46); c.lineTo(12, 0); c.lineTo(-12, 0); c.closePath(); c.fill();
    c.fillStyle = PAL.ink; c.beginPath(); c.moveTo(0, 46); c.lineTo(12, 0); c.lineTo(-12, 0); c.closePath(); c.fill();
    c.restore();
    this.mapTex.needsUpdate = true;
  }

  _drawPassport() {
    const done = STATIONS.filter((s) => this.g.store.isDone(s.key)).length;
    this.passport.panel.draw((c, W, H) => {
      c.fillStyle = '#fff1df'; roundRect(c, 0, 0, W, 170, 46); c.fill();
      drawText(c, TEXT.passport, { x: 380, y: 22, w: W - 430, h: 125 }, { size: 100, weight: 800, align: 'right' });
      drawPill(c, TEXT.stampsOf(done, STATIONS.length), 200, 86, { size: 50, bg: done === STATIONS.length ? PAL.greenDark : PAL.ink, color: '#fff' });
      const slots = STATIONS.length, sw = (W - 60) / slots, cy = 380, r = Math.min(sw * 0.4, 100);
      STATIONS.forEach((s, i) => {
        const cx = W - 30 - sw * (i + 0.5);
        const isDone = this.g.store.isDone(s.key), th = this.g.thumbs?.[s.key];
        if (isDone) {
          c.beginPath(); c.arc(cx, cy, r + 12, 0, Math.PI * 2); c.fillStyle = s.color; c.fill();
          c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
          if (th) { const sc = (r * 2.3) / th.height; c.drawImage(th, cx - (th.width * sc) / 2, cy - r * 1.15, th.width * sc, th.height * sc); }
          c.restore();
          c.beginPath(); c.arc(cx + r * 0.72, cy - r * 0.72, 36, 0, Math.PI * 2); c.fillStyle = PAL.green; c.fill();
          c.lineWidth = 7; c.strokeStyle = '#fff'; c.stroke();
          drawIcon(c, 'check', cx + r * 0.72, cy - r * 0.72, 48, '#fff');
        } else {
          c.setLineDash([18, 13]); c.lineWidth = 8; c.strokeStyle = '#c9cfd8';
          c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
          setFont(c, 96, 800); c.textAlign = 'center'; c.fillStyle = '#c9cfd8'; c.fillText(num(s.n), cx, cy + 8);
        }
        drawText(c, shortName(s), { x: cx - sw / 2 + 4, y: cy + r + 26, w: sw - 8, h: 140 }, { size: 52, min: 34, weight: 800, color: isDone ? PAL.ink : '#9aa6b5', maxLines: 2, lh: 1.1 });
      });
      const hallOpen = this.g.isUnlocked('hall');
      c.fillStyle = hallOpen ? '#e3f6ea' : '#f1f3f6'; roundRect(c, 40, H - 160, W - 80, 120, 60); c.fill();
      drawIcon(c, hallOpen ? 'trophy' : 'lock', W - 115, H - 100, 70, hallOpen ? PAL.greenDark : '#9aa6b5');
      drawText(c, hallOpen ? TEXT.hubAllDone : TEXT.hallLocked, { x: 80, y: H - 152, w: W - 260, h: 104 }, { size: 50, min: 34, weight: 800, color: hallOpen ? PAL.greenDark : '#8a96a6', align: 'right', maxLines: 2 });
    });
  }

  refresh() {
    this._drawPassport();
    const next = this.g.nextPlace();
    for (const [key, pin] of Object.entries(this.pins)) pin.setState(this.g.store.isDone(key) ? 'done' : !this.g.isUnlocked(key) ? 'locked' : key === next ? 'next' : 'open');
    this.bGo?.setLabel(next === 'hall' ? TEXT.toHall : TEXT.goTo(shortName(STATION[next])));
  }

  // ------------------------------------------------------------------ layout
  layout(h) {
    const top = Math.max(0.62, Math.min(0.95, h.eye - 0.5)), tz = -1.15;
    this.table.position.set(0, top, tz);
    this.tableShadow.position.z = tz;
    // the "go" button is a plaque lying on the table's near rim, tilted up toward the eyes: in view, below the map pins
    const cz = tz + TABLE_R - 0.02, cy = top + 0.035;
    this.console.position.set(0, cy, cz);
    this.console.rotation.set(-Math.atan2(h.eye - cy, h.vz - cz) - 0.12, 0, 0);
    this.console.scale.setScalar(0.72);
    this.passport.setHeight(h.board);
    for (const s of this.stars) s.place(h);
  }

  // ------------------------------------------------------------------ flow
  async enter(g) {
    this.refresh();
    this.phase = 'hub';
    const S = this.g.store, G = this.g;
    if (!S.progress.tutorial) {
      this.console.only();
      await g(G.say(TEXT.welcome, { pose: 'wave' }));
      await g(G.say(TEXT.welcomePlan, { pose: 'present' }));
      if (G.engine.presenting) { G._comfortSaid = true; await g(G.say(TEXT.comfortVR, { pose: 'present' })); }
      await this._tutorial(g);
      S.progress.tutorial = true;
      S.save();
    } else if (!this._greeted) {
      this._greeted = true;
      await g(G.say(TEXT.welcomeBack, { pose: 'wave' }));
    }
    if (G.engine.presenting && !G._comfortSaid) { G._comfortSaid = true; await g(G.say(TEXT.comfortVR, { pose: 'present' })); }
    this.console.only(this.bGo);
    this.bGo.setAttention(true);
    const next = G.nextPlace();
    this.phase = 'choose';
    const reviewing = next === 'hall' && (S.progress.challenges || 0) > 0;
    await g(G.say(reviewing ? TEXT.hubReview : next === 'hall' ? TEXT.hubAllDone : TEXT.hubPick(shortName(STATION[next])), { pose: 'present' }));
  }
  leave() { this._clearStars(); this.phase = 'idle'; }
  update(dt, t) {}

  async _tutorial(g) {
    this.phase = 'tutorial';
    const E = this.g.engine, I = this.g.input;
    const xrSession = E.renderer.xr.getSession?.();
    const srcs = xrSession ? [...xrSession.inputSources] : [];
    const text = !E.presenting ? TEXT.tutorialScreen : I.gaze.active ? TEXT.tutorialGaze : srcs.some((s) => s.hand) ? TEXT.tutorialHand : TEXT.tutorialVR;
    this._clearStars();
    let got = 0, resolve;
    const all = new Promise((r) => (resolve = r));
    const spots = [[-0.55, 0.12, -1.7], [0.0, 0.42, -2.0], [0.6, -0.02, -1.6]];
    spots.forEach((p, i) => {
      const s = new Star({ id: 'hub:star' + i, input: I, onCollect: (star) => {
        got++;
        this.g.audio.sparkle?.();
        this.g.confetti.burst(star.getWorldPosition(new THREE.Vector3()), 0.35);
        if (got === spots.length) resolve();
      } });
      s.spot = p;
      s.place = (h) => s.position.set(p[0], h.eye + p[1], p[2]);
      s.place({ eye: this.g.eye() });
      s.viewer = this.g.viewer();
      s.visible = true;
      popIn(s, 0.5, 0.01);
      this.root.add(s);
      this.stars.push(s);
    });
    await g(this.g.say(text, { pose: 'point' }));
    this.g.ali.setPose('idle');
    await g(all);
    this.g.audio.fanfare?.();
    this.g.ali.setPose('cheer');
    this.g.ali.jump?.();
    await g(this.g.say(TEXT.tutorialDone, { pose: 'cheer' }));
    this._clearStars();
  }
  _clearStars() { for (const s of this.stars) { s.dispose(); this.root.remove(s); } this.stars = []; }

  _go() { this._travel(this.g.nextPlace()); }
  _pinClicked(key) { this._travel(key); }
  _travel(key) {
    if (this.phase === 'tutorial' || !this.g.store.progress.tutorial) return;
    if (!this.g.isUnlocked(key)) {
      this.g.audio.play?.('wrong', { gain: 0.5 });
      this.g.run((g) => this.g.say(key === 'hall' ? TEXT.hallLocked : TEXT.locked, { pose: 'think' }));
      return;
    }
    this.g.goTo(key);
  }
  testState() { return { stars: this.stars.filter((s) => !s.collected).length }; }
}

// ------------------------------------------------------------------ a travel pin standing on the map table
class Pin extends THREE.Group {
  constructor({ key, game, onClick }) {
    super();
    this.key = key; this.g = game;
    this.k = { t: Math.random() * 4, hover: 0 };
    this.state = 'open';
    const color = key === 'hall' ? PAL.sun : STATION[key].color;
    this.add(new THREE.Mesh(mergeParts([
      { geo: new THREE.CylinderGeometry(0.007, 0.007, 0.17, 6), color: '#ffffff', pos: [0, 0.085, 0] },
      { geo: new THREE.CylinderGeometry(0.03, 0.034, 0.014, 20), color, pos: [0, 0.007, 0] },
    ]), vcMat()));
    this.cnv = mkCanvas(320, 380);
    this.tex = canvasTexture(this.cnv);
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2375), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false }));
    this.card.position.y = 0.27;
    this.card.renderOrder = 4;
    this.add(this.card);
    this._unreg = game.input.add(this.card, { id: 'map:' + key, onClick: () => { game.audio.click?.(); onClick(); }, onHover: (v) => (this.hovered = v), enabled: () => true });
    onFrame((dt) => this.tick(dt));
  }
  /** A round picture of the place with its number; the name sits on a pill underneath (shape + colour show the state). */
  setState(state) {
    this.state = state;
    const c = this.cnv.getContext('2d'), key = this.key, def = STATION[key];
    const color = key === 'hall' ? '#ffc93c' : def.color, th = this.g.thumbs?.[key], locked = state === 'locked';
    c.clearRect(0, 0, 320, 380);
    const cx = 160, cy = 140, r = 122;
    if (state === 'next') { c.beginPath(); c.arc(cx, cy, r + 16, 0, Math.PI * 2); c.fillStyle = 'rgba(255,209,100,0.85)'; c.fill(); }
    c.beginPath(); c.arc(cx, cy, r + 8, 0, Math.PI * 2); c.fillStyle = locked ? '#b7bec8' : color; c.fill();
    c.save(); c.beginPath(); c.arc(cx, cy, r - 4, 0, Math.PI * 2); c.clip();
    if (key === 'hall') { c.fillStyle = '#fff3d6'; c.fillRect(0, 0, 320, 300); drawIcon(c, 'trophy', cx, cy, 150, PAL.orangeDark); }
    else if (th) { if (locked) c.filter = 'grayscale(1) brightness(1.08)'; const sc = (r * 2.5) / th.height; c.drawImage(th, cx - (th.width * sc) / 2, cy - r * 1.25, th.width * sc, th.height * sc); c.filter = 'none'; }
    c.restore();
    // number (or lock / check) badge, top-right in RTL reading order
    const bx = cx + r * 0.74, by = cy - r * 0.74;
    c.beginPath(); c.arc(bx, by, 40, 0, Math.PI * 2); c.fillStyle = state === 'done' ? PAL.green : locked ? '#7b8796' : PAL.ink; c.fill();
    c.lineWidth = 7; c.strokeStyle = '#fff'; c.stroke();
    if (state === 'done') drawIcon(c, 'check', bx, by, 50, '#fff');
    else if (locked) drawIcon(c, 'lock', bx, by + 2, 44, '#fff');
    else if (key === 'hall') drawIcon(c, 'star', bx, by, 48, '#fff');
    else { setFont(c, 52, 800); c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(num(def.n), bx, by + 4); }
    const label = key === 'hall' ? TEXT.hallTitle : shortName(def);
    setFont(c, 46, 800);
    const w = Math.min(312, c.measureText(label).width + 44);
    c.fillStyle = locked ? '#8a96a6' : PAL.ink; roundRect(c, cx - w / 2, 300, w, 70, 35); c.fill();
    drawText(c, label, { x: cx - w / 2 + 12, y: 302, w: w - 24, h: 66 }, { size: 44, min: 22, weight: 800, color: '#fff', maxLines: 1 });
    this.tex.needsUpdate = true;
  }
  tick(dt) {
    if (!this.parent?.parent?.visible) return;
    const k = this.k;
    k.t += dt;
    k.hover += ((this.hovered ? 1 : 0) - k.hover) * Math.min(1, dt * 12);
    const bounce = this.state === 'next' ? Math.abs(Math.sin(k.t * 3.2)) * 0.035 : 0;
    this.card.position.y = 0.27 + bounce + k.hover * 0.02;
    this.card.scale.setScalar(1 + k.hover * 0.22 + (this.state === 'next' ? 0.1 : 0));
    faceYaw(this.card, this.g.viewer());
  }
}
