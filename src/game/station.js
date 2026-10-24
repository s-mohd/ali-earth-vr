// One station zone. Learning flow (pedagogy review §7): predict → watch → explain → find the evidence → check → bridge.
// The diorama sits on a plinth; the lesson board stands on its front-left corner, Ali on its front-right corner.
import * as THREE from 'three';
import { TEXT, STATIONS, STATION, shortName } from './content.js';
import { STAGE } from '../core/layout.js';
import { PAL } from '../core/kit.js';
import { tween, wait } from '../core/tween.js';
import { Panel, Card, drawText, drawPill, drawIcon, roundRect } from '../core/ui.js';
import { Console, Board, EvidenceMarker, buildPlinthRim, stampCanvas, faceYaw, BTN } from './widgets.js';

const ALI_AT = [1.65, 1.5], BOARD_AT = [-1.7, 1.45]; // station-local x, z (front corners of the plinth)
const HINT1 = 10, HINT2 = 20; // seconds without a find before Ali helps (then the target glows)

export class StationZone {
  constructor(game, key) {
    this.g = game; this.key = key; this.def = STATION[key]; this.st = game.stations[key];
    this.index = STATIONS.findIndex((s) => s.key === key);
    this.phase = 'idle';
    this.showing = 'before';
    this.revealed = game.store.isDone(key); // the name stays hidden until the child has watched once
    this.root = new THREE.Group();
    this.root.name = 'station-zone:' + key;
    game.frames[key].add(this.root);

    const s = STAGE.scale;
    this.stage = new THREE.Group();
    this.stage.position.set(0, 0.15, STAGE.z);
    this.stage.scale.setScalar(s);
    this.root.add(this.stage);
    this.stage.add(this.st.group);
    const rim = (this.rim = buildPlinthRim(STAGE.radius * s, this.def.color));
    rim.position.set(0, 0, STAGE.z);
    this.root.add(rim);

    // spots on the plinth corners follow the diorama's ground height there
    const gyA = this._groundAt(ALI_AT[0], ALI_AT[1]) * s, gyB = this._groundAt(BOARD_AT[0], BOARD_AT[1]) * s;
    this.aliSpot = new THREE.Vector3(ALI_AT[0] * s, 0.15 + gyA, STAGE.z + ALI_AT[1] * s);
    this.board = new Board({ w: 1.25, h: 0.9, color: this.def.color });
    this.board.position.set(BOARD_AT[0] * s, 0.15 + gyB, STAGE.z + BOARD_AT[1] * s);
    this.board.rotation.y = Math.atan2(-this.board.position.x, -this.board.position.z);
    this.root.add(this.board);

    // evidence markers (in diorama space), asked one at a time
    this.markers = [];
    for (const ev of this.def.evidence) {
      const spec = this.st.evidence?.[ev.id];
      if (!spec) continue;
      const m = new EvidenceMarker({ id: `${key}:${ev.id}`, radius: spec.radius ?? 0.35, label: ev.label, color: this.def.color, textColor: this.def.onColor, input: game.input, onFound: (mk) => this._found(mk) });
      m.position.copy(spec.pos);
      m.viewer = game.viewer();
      m.ev = ev;
      this.stage.add(m);
      this.markers.push(m);
    }

    // console
    const C = (this.console = new Console({ trim: this.def.color }));
    this.root.add(C);
    const last = this.index === STATIONS.length - 1;
    this.bWatch = C.addButton({ id: `${key}:watch`, label: TEXT.watch, icon: 'play', ...BTN.cta, w: 0.4, onClick: () => this.watch() });
    this.bReplay = C.addButton({ id: `${key}:replay`, label: TEXT.replay, icon: 'replay', ...BTN.cta, w: 0.44, onClick: () => this.watch() });
    this.bBA = C.addButton({ id: `${key}:ba`, label: TEXT.before, icon: 'swap', ...BTN.alt, w: 0.24, onClick: () => this.toggleBA() });
    this.bNext = C.addButton({ id: `${key}:next`, label: last ? TEXT.toHall : TEXT.next, icon: 'next', iconSide: 'end', ...BTN.next, w: last ? 0.44 : 0.26, onClick: () => { const n = this.g.nextPlace() === 'hall' ? 'hall' : this._nextKey(); this.g.goTo(this.g.isUnlocked(n) ? n : 'hub'); } });
    this.bMap = C.addButton({ id: `${key}:map`, label: TEXT.toHub, icon: 'map', ...BTN.plain, w: 0.26, onClick: () => this.g.goTo('hub') });
    this.bGo = C.addButton({ id: `${key}:continue`, label: TEXT.continue, icon: 'next', iconSide: 'end', ...BTN.go, w: 0.3, onClick: () => this._resolveContinue?.() });
    game.addMenuButton?.(C);
    C.only(this.bMap);

    // question / comparison furniture
    this.cards = [];
    this.qPanel = new Panel({ w: 1.1, h: 0.26, ppm: 900, frame: this.def.color, border: 0.02, depth: 0.03, radius: 0.05 });
    this.qPanel.visible = false;
    this.root.add(this.qPanel);
    if (this.def.compare) {
      this.cmpPanel = new Panel({ w: 1.3, h: 0.66, ppm: 900, frame: PAL.teal, border: 0.025, depth: 0.03, radius: 0.05 });
      this.cmpPanel.visible = false;
      this.root.add(this.cmpPanel);
    }
    this.layoutH = null;
    this.drawBoard(this.revealed ? 'done' : 'predict');
  }

  _nextKey() { return STATIONS[this.index + 1]?.key || 'hall'; }
  /** Ground height of the diorama (station-local) at x, z — max over "before" and "after". */
  _groundAt(x, z) {
    const g = this.st.group, parent = g.parent;
    parent?.remove(g);
    g.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0), 0, 8);
    let best = 0;
    for (const t of [0, 1]) {
      this.st.setProgress(t);
      g.updateMatrixWorld(true);
      const hit = ray.intersectObject(g, true).find((h) => h.object.isMesh && !h.object.isInstancedMesh && h.object.visible);
      if (hit) best = Math.max(best, hit.point.y);
    }
    this.st.setProgress(0);
    parent?.add(g);
    return Math.max(-0.1, Math.min(0.35, best));
  }

  // ------------------------------------------------------------------ layout & board
  layout(h) {
    this.layoutH = h;
    this.console.place(h);
    this.board.setHeight(h.board - this.board.position.y);
    const y = h.cards, z = -1.25;
    this.qPanel.position.set(0, y + 0.42, z - 0.08);
    this.cards.forEach((c, i, a) => c.position.set((a.length === 2 ? [0.33, -0.33] : [0.62, 0, -0.62])[i], y + (c.o.picture ? 0 : 0.08), z));
    if (this.cmpPanel) this.cmpPanel.position.set(0, y + 0.12, z - 0.05);
    const eyeW = new THREE.Vector3(0, h.eye, h.vz).applyMatrix4(this.root.matrixWorld);
    for (const o of [this.qPanel, this.cmpPanel, ...this.cards]) if (o) faceYaw(o, eyeW);
  }

  /** The lesson card, readable from the pad in a headset (body letters ≈ 8-10 cm). */
  drawBoard(mode, extra = {}) {
    this.boardMode = mode;
    const d = this.def;
    this.board.panel.draw((c, W, H) => {
      const pad = 56;
      const pw = drawPill(c, d.ordinal, 0, -999, { size: 44 }).w;
      drawPill(c, d.ordinal, W - pad - pw / 2, 70, { size: 44, bg: d.color, color: d.onColor });
      if (mode === 'find' || mode === 'done') {
        const ba = this.showing === 'after' ? [TEXT.after, PAL.lav, '#fff'] : [TEXT.before, PAL.grey, PAL.ink];
        drawPill(c, ba[0], pad + 80, 70, { size: 44, bg: ba[1], color: ba[2], icon: 'swap' });
      }
      const title = this.revealed ? d.name : TEXT.predictBoard;
      drawText(c, title, { x: pad, y: 125, w: W - pad * 2, h: 150 }, { size: 130, min: 70, weight: 800, maxLines: 2, lh: 1.1, color: this.revealed ? PAL.ink : PAL.coralDark });
      c.fillStyle = d.color; roundRect(c, W / 2 - 110, 290, 220, 12, 6); c.fill();
      const top = 330, bh = H - top - 40;
      if (mode === 'predict') {
        drawText(c, d.predict.q, { x: pad, y: top + 10, w: W - pad * 2, h: 300 }, { size: 84, weight: 800, lh: 1.35, maxLines: 3 });
        drawPill(c, TEXT.watch, W / 2, H - 92, { size: 50, bg: BTN.cta.color, color: BTN.cta.textColor, icon: 'play' });
      } else if (mode === 'watch') {
        drawText(c, extra.caption || '…', { x: pad, y: top, w: W - pad * 2, h: bh - (d.speed ? 110 : 0) }, { size: 96, min: 60, weight: 800, lh: 1.35, maxLines: 3 });
        if (d.speed) drawPill(c, TEXT.timeChip, W / 2, H - 92, { size: 50, bg: PAL.sun, color: PAL.ink, icon: 'clock' });
      } else if (mode === 'find') {
        drawText(c, d.definition, { x: pad, y: top - 10, w: W - pad * 2, h: 150 }, { size: 62, min: 44, weight: 800, lh: 1.25, maxLines: 2, color: PAL.inkSoft });
        this.markers.forEach((m, i) => {
          const y = top + 230 + i * 128, x1 = W - pad, active = m === this.active;
          c.fillStyle = m.found ? '#e3f6ea' : active ? '#fff3cf' : '#f1f3f6'; roundRect(c, pad, y - 54, W - pad * 2, 108, 54); c.fill();
          c.beginPath(); c.arc(x1 - 58, y, 42, 0, Math.PI * 2); c.fillStyle = m.found ? PAL.green : active ? PAL.orange : '#c3c9d1'; c.fill();
          drawIcon(c, m.found ? 'check' : active ? 'eye' : 'question', x1 - 58, y, 54, '#fff');
          drawText(c, m.found ? m.labelText : TEXT.clue(i + 1), { x: pad + 30, y: y - 48, w: W - pad * 2 - 160, h: 96 }, { size: 68, weight: 800, color: m.found ? PAL.greenDark : active ? PAL.ink : '#8a96a6', align: 'right', maxLines: 1 });
        });
      } else if (mode === 'done') {
        if (d.chip) drawPill(c, d.chip.text, W / 2, top + 30, { size: 46, bg: d.color, color: d.onColor, icon: d.chip.icon });
        drawText(c, d.definition, { x: pad, y: top + 80, w: W - pad * 2, h: 290 }, { size: 84, min: 56, weight: 800, lh: 1.3, maxLines: 3 });
        if (d.note) drawText(c, d.note, { x: pad + 30, y: top + 380, w: W - pad * 2 - 60, h: bh - 380 }, { size: 52, min: 36, weight: 700, color: PAL.inkSoft, lh: 1.3 });
      }
    });
  }

  // ------------------------------------------------------------------ arrive
  async enter(g) {
    const done = this.g.store.isDone(this.key);
    const foundIds = this.g.store.progress.evidence[this.key] || [];
    for (const m of this.markers) { if (foundIds.includes(m.ev.id)) m.markFound(this.g.viewer(), { instant: true }); else m.reset(); }
    this.active = null;
    this._clearCards();
    if (done) {
      this.phase = 'done';
      this.revealed = true;
      this._setShowing('after');
      this.drawBoard('done');
      this._doneButtons();
      await g(this.g.say(this.def.explain, { pose: 'present' }));
      return;
    }
    if (this.revealed) {
      // came back after watching, before the evidence hunt was finished
      this._setShowing('after');
      await this._find(g);
      return;
    }
    this.phase = 'intro';
    this._setShowing('before');
    this.drawBoard('predict');
    this.console.only(this.bMap);
    await g(this.g.say(this.def.intro, { pose: 'present' }));
    await this._predict(g);
  }
  leave() {
    this._sim?.cancel();
    this.st.stop?.();
    this._resolveChoice = this._resolveContinue = null;
    this._clearCards();
    if (this.cmpPanel) this.cmpPanel.visible = false;
    this.active = null;
    this.phase = 'idle';
  }
  reset() {
    this.revealed = false;
    this.prediction = null;
    for (const m of this.markers) m.reset();
    this._setShowing('before');
    this.drawBoard('predict');
    this.console.only(this.bMap);
  }
  update(dt, t) {
    this.st.update?.(dt, t);
    if (this.phase === 'find' && this.active && this.showing === 'after' && !this.g.speech.speaking && !this.g.busy) {
      this._idle += dt;
      if (this._idle > HINT1 && this._hintLevel < 1) { this._hintLevel = 1; this.g.say(this.active.ev.hint1, { pose: 'think' }); }
      else if (this._idle > HINT2 && this._hintLevel < 2) {
        this._hintLevel = 2;
        this.active.hint();
        this.g.ali.pointAt(this.active.getWorldPosition(new THREE.Vector3()));
        this.g.say(this.active.ev.hint2, { pose: 'point' });
      } else if (this._hintLevel >= 2 && this._idle > HINT2 + 8) { this._idle = HINT2 + 0.01; this.active.hint(); }
    }
  }

  // ------------------------------------------------------------------ 1. predict (unscored)
  async _predict(g) {
    this.phase = 'predict';
    const P = this.def.predict;
    this._buildCards(P.opts.map((text, i) => ({ text, i })), 'predict');
    this._question(TEXT.predictBoard, P.q);
    await g(this.g.say(P.q, { pose: 'think' }));
    const pick = await g(this._choice());
    this.cards[pick].setState('correct');
    this.cards.forEach((c, i) => { c.setInteractive(false); if (i !== pick) c.setState('dim'); });
    this.prediction = pick;
    this.g.store.progress.practice[this.key + ':predict'] = pick;
    this.g.store.save();
    await g(this.g.say(TEXT.predictAck, { pose: 'cheer' }));
    this._clearCards();
    this.watch();
  }

  // ------------------------------------------------------------------ 2. watch, 3. explain
  watch() {
    if (this.phase === 'watch') return;
    this.g.run(async (g) => {
      const first = !this.revealed;
      this.phase = 'watch';
      this._clearCards();
      this.console.only(this.bMap);
      this.active = null;
      this._setShowing('before', false);
      this.st.setProgress(0);
      this.drawBoard('watch', { caption: '' });
      this.g.ali.lookAt(this.stage.localToWorld(new THREE.Vector3(0, 0.6, 0)));
      await g(this.g.say(this.def.cue, { pose: 'point' }));
      this.g.bubble.hide();
      this.g.ali.setPose('idle');
      const st = this.st, cues = this.def.cues;
      let ci = 0, hz = 0;
      st.play?.();
      this._sim = tween(st.duration || 10, (k) => {
        st.setProgress(k);
        while (ci < cues.length && k >= cues[ci].t) this.drawBoard('watch', { caption: cues[ci++].text });
        // the earthquake is felt in the hands too (the floor never moves)
        if (this.key === 'quake' && k > 0.1 && k < 0.72 && this.g.engine.presenting && (hz = (hz + 1) % 9) === 0) this.g.input.rumble?.(0.35, 80);
      });
      await g(this._sim.done);
      st.stop?.();
      this._setShowing('after', false);
      this.g.ali.lookAt(null);
      this.g.audio.play?.('chime');
      let line = this.def.observe;
      if (first && this.prediction != null) line += ' ' + (this.prediction === this.def.predict.correct ? TEXT.predictYes : TEXT.predictNo);
      await g(this.g.say(line, { pose: 'present' }));
      // the name and the definition appear
      this.revealed = true;
      this.drawBoard('done');
      this.board.panel.pop();
      await g(this.g.say(this.def.explain, { pose: 'present' }));
      if (first && this.def.extra) await g(this.g.say(this.def.extra, { pose: 'present' }));
      if (this.markers.some((m) => !m.found)) await this._find(g);
      else if (!this.g.store.isDone(this.key)) await this._reward(g);
      else { this.phase = 'done'; this._doneButtons(); }
    });
  }

  // ------------------------------------------------------------------ 4. find the evidence, one clue at a time
  async _find(g) {
    this.phase = 'find';
    this.console.only(this.bReplay, this.bBA, this.bMap);
    for (const m of this.markers) if (m.found) m.markFound(this.g.viewer(), { instant: true });
    await this._askNext(g);
  }
  async _askNext(g) {
    this.active = this.markers.find((m) => !m.found) || null;
    this._idle = 0; this._hintLevel = 0;
    this.drawBoard('find');
    this._applyMarkerVisibility();
    if (!this.active) return this._reward(g);
    this.active.show();
    this.g.ali.pointAt(null);
    await g(this.g.say(this.active.ev.ask, { pose: 'think' }));
  }
  _found(marker) {
    if (marker !== this.active || this.showing !== 'after') return;
    marker.markFound(this.g.viewer());
    this.g.store.foundEvidence(this.key, marker.ev.id);
    this.g.audio.found?.();
    this.g.input.rumble?.(0.6, 60);
    this.active = null;
    this.drawBoard('find');
    this.g.run(async (g) => {
      const p = marker.getWorldPosition(new THREE.Vector3());
      this.g.ali.pointAt(p);
      this.g.ali.lookAt(p);
      await g(this.g.say(marker.ev.say, { pose: 'point' }));
      this.g.ali.pointAt(null);
      this.g.ali.lookAt(null);
      this.g.ali.setPose('idle');
      await this._askNext(g);
    });
  }

  // ------------------------------------------------------------------ 5. stamp, practice, comparison, bridge
  async _reward(g) {
    this.phase = 'reward';
    this.active = null;
    this.drawBoard('done');
    this.console.only(this.bMap);
    this.g.stampFX.play(stampCanvas(this.g.thumbs?.[this.key], this.def.color, shortName(this.def), this.def.onColor));
    this.g.audio.stamp?.();
    this.g.input.rumble?.(0.7, 90);
    this.g.celebrate();
    await g(this.g.say(TEXT.stampEarned, { pose: 'cheer' }));
    if (this.def.practice) await this._practice(g);
    if (this.def.compare) await this._compare(g);
    // the station counts as done only after its check, so leaving half-way brings the child back to it
    this.g.store.markDone(this.key);
    this.g.zones.hub?.refresh();
    const done = STATIONS.filter((s) => this.g.store.isDone(s.key)).length;
    this.g.shell.setStatus?.({ stamps: done, total: STATIONS.length, place: shortName(this.def) });
    this.phase = 'done';
    this._doneButtons();
    this.bNext.setAttention(true);
    await g(this.g.say(this.def.bridge, { pose: 'present' }));
  }
  _doneButtons() {
    this.console.only(this.bReplay, this.bBA, this.bNext, this.bMap);
    this._applyMarkerVisibility();
  }

  async _practice(g) {
    const P = this.def.practice;
    this.phase = 'practice';
    this.console.only(this.bMap);
    await g(this.g.say(TEXT.practiceIntro, { pose: 'present' }));
    this._buildCards(P.opts.map((o, i) => ({ text: o.text, picture: o.pic ? this.g.thumbs?.[o.pic] : null, i })), 'practice');
    this._question(TEXT.practiceTitle, P.q);
    this.g.say(P.q, { pose: 'think' });
    let tries = 0, next = this._choice();
    for (;;) {
      const pick = await g(next);
      next = this._choice(); // a tap during Ali's feedback still counts
      tries++;
      const card = this.cards[pick];
      if (pick === P.correct) {
        card.setState('correct');
        this.cards.forEach((c, i) => { c.setInteractive(false); if (i !== pick) c.setState('dim'); });
        this.g.audio.correct?.();
        this.g.input.rumble?.(0.7, 80);
        this.g.ali.jump?.();
        await g(this.g.say(P.ok, { pose: 'cheer' }));
        break;
      }
      card.setState('wrong');
      card.setInteractive(false);
      this.g.audio.wrong?.();
      await g(this.g.say(P.no, { pose: 'think' }));
    }
    const pr = this.g.store.progress.practice;
    pr[this.key] = Math.max(pr[this.key] || 0, tries);
    this.g.store.save();
    await g(wait(0.3));
    this._clearCards();
  }

  async _compare(g) {
    this.phase = 'compare';
    const P = this.cmpPanel, items = this.def.compare;
    P.draw((c, W) => {
      drawText(c, TEXT.compareTitle, { x: 30, y: 18, w: W - 60, h: 90 }, { size: 62, weight: 800 });
      items.forEach((it, i) => {
        const cw = (W - 120) / 2, x = W - 40 - cw - i * (cw + 40), y = 120, ch = cw * 0.75, col = STATION[it.key].color;
        const th = this.g.thumbs?.[it.key];
        c.save(); roundRect(c, x, y, cw, ch, 26); c.clip();
        if (th) c.drawImage(th, x, y, cw, ch); else { c.fillStyle = '#ddd'; c.fillRect(x, y, cw, ch); }
        c.restore();
        c.lineWidth = 10; c.strokeStyle = col; roundRect(c, x, y, cw, ch, 26); c.stroke();
        drawText(c, it.label, { x, y: y + ch + 18, w: cw, h: 84 }, { size: 46, weight: 800, color: col, maxLines: 1 });
      });
    });
    P.visible = true;
    P.pop();
    this.layout(this.layoutH);
    this.console.only(this.bGo, this.bMap);
    this.bGo.setAttention(true);
    const cont = new Promise((res) => (this._resolveContinue = res));
    await g(this.g.say(this.def.contrast, { pose: 'present' }));
    await g(cont);
    this._resolveContinue = null;
    P.visible = false;
  }

  // ------------------------------------------------------------------ before / after
  toggleBA() {
    if (this.phase === 'watch' || this.phase === 'predict') return;
    this._setShowing(this.showing === 'after' ? 'before' : 'after');
    this.g.audio.play?.('whoosh', { gain: 0.5, rate: 1.4 });
    if (this.def.beforeLine) this.g.say(this.showing === 'after' ? this.def.afterLine : this.def.beforeLine);
  }
  _setShowing(which, apply = true) {
    this.showing = which;
    if (apply) this.st.setProgress(which === 'after' ? 1 : 0);
    this.bBA.setLabel(which === 'after' ? TEXT.before : TEXT.after);
    this._applyMarkerVisibility();
    if (this.boardMode === 'find' || this.boardMode === 'done') this.drawBoard(this.boardMode);
  }
  _applyMarkerVisibility() {
    const after = this.showing === 'after';
    for (const m of this.markers) m.visible = after && (m.found || m === this.active);
  }

  // ------------------------------------------------------------------ cards
  _question(tag, q) {
    this.qPanel.draw((c, W, H) => {
      const pw = drawPill(c, tag, 0, -999, { size: 36, icon: 'question' }).w;
      drawPill(c, tag, W - 30 - pw / 2, H / 2, { size: 36, bg: this.def.color, color: this.def.onColor, icon: 'question' });
      drawText(c, q, { x: 30, y: 16, w: W - pw - 90, h: H - 32 }, { size: 64, weight: 800, align: 'right', maxLines: 2, lh: 1.2 });
    });
    this.qPanel.visible = true;
    this.qPanel.pop();
    this.cards.forEach((c, i) => c.show(0.15 + i * 0.12));
    this.layout(this.layoutH);
  }
  _buildCards(opts, prefix) {
    this._clearCards();
    this.cards = opts.map((o, i) => {
      const card = new Card({ id: `${this.key}:${prefix}:${i}`, w: o.picture ? 0.5 : 0.52, h: o.picture ? 0.5 : 0.26, picture: o.picture, text: o.text, index: i, onClick: () => this._resolveChoice?.(i) });
      card.visible = false;
      this.root.add(card);
      return card;
    });
  }
  _choice() { return new Promise((res) => (this._resolveChoice = res)); }
  _clearCards() {
    this.qPanel.visible = false;
    for (const c of this.cards) { c.dispose(); this.root.remove(c); }
    this.cards = [];
  }

  testState() {
    return { showing: this.showing, revealed: this.revealed, active: this.active?.ev.id || null, markers: this.markers.map((m) => ({ id: m.ev.id, found: m.found, visible: m.visible })), cards: this.cards.length };
  }
}
