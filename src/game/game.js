// Game director: builds the world, owns Ali, moves the child between zones (fade teleport), runs zone scripts.
import * as THREE from 'three';
import { TEXT, STATIONS, STATION, shortName, setGender } from './content.js';
import { buildFrames, uiHeights, STAGE } from '../core/layout.js';
import { addLights } from '../core/lighting.js';
import { Bubble } from '../core/ui.js';
import { PAL, mat, mergeParts, vcMat, basic } from '../core/kit.js';
import { enableShadows, aimSun, shadowTree, polishTree } from '../core/lookdev.js';
import { buildWorld } from '../world/world.js';
import { buildAli } from '../world/ali.js';
import buildQuake from '../stations/quake.js';
import buildVolcano from '../stations/volcano.js';
import buildWeather from '../stations/weather.js';
import buildErosion from '../stations/erosion.js';
import buildHuman from '../stations/human.js';
import { renderThumbs, renderScenes } from './thumbs.js';
import { buildVignettes } from '../world/vignettes.js';
import { HubZone } from './hub.js';
import { StationZone } from './station.js';
import { HallZone } from './hall.js';
import { Confetti, StampFX, VRMenu, Console, faceYaw, BTN, buildViewerPad } from './widgets.js';

const BUILDERS = { quake: buildQuake, volcano: buildVolcano, weather: buildWeather, erosion: buildErosion, human: buildHuman };
export const CANCEL = Symbol('cancel');
const rafFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const BREAK_EVERY = 10 * 60; // seconds in the headset before a rest reminder (given at the next place change)

export class Game {
  constructor({ engine, input, audio, speech, shell, store, test = false }) {
    Object.assign(this, { engine, input, audio, speech, shell, store, test });
    this.place = 'hub';
    this.busy = false;
    this.started = false;
    this.mode = 'screen';
    this.stations = {};
    this.zones = {};
    this._sid = 0;
    this._sayId = 0;
    this.vrTime = 0;
    this.measuredEye = null;
    this.head = new THREE.Vector3(0, 1.3, 0); // viewer head, world space, refreshed every frame
  }

  // ------------------------------------------------------------------ build
  async build(progress = () => {}) {
    const E = this.engine;
    setGender(this.store.settings.gender);
    this.consoles = [];
    this.lights = addLights(E.scene);
    if (this.store.settings.shadows !== false) enableShadows(E.renderer, this.lights.sun, { size: 1024 });
    this.frames = buildFrames(E.scene);
    progress(0.12, 'world');
    await rafFrame();
    this.world = this._safe('world', () => buildWorld({ scene: E.scene, frames: this.frames, quality: 'high' }), () => fallbackWorld(E.scene));

    progress(0.3, 'ali');
    await rafFrame();
    this.ali = this._safe('ali', () => buildAli({ getViewer: (o) => E.headWorld(o) }), () => fallbackAli());
    shadowTree(this.ali.group, { cast: true, receive: false });
    this.bubble = new Bubble({ maxW: 1.05, tail: 'center' });
    this.ali.group.add(this.bubble);
    this.ali.group.updateMatrixWorld(true);
    const anchorY = this.ali.bubbleAnchor ? this.ali.bubbleAnchor.getWorldPosition(new THREE.Vector3()).y - this.ali.group.position.y : 1.5;
    this.bubble.position.set(0, Math.max(1.35, Math.min(1.75, anchorY)), 0);
    // tap Ali (or his bubble) to hear the line again
    const again = { onClick: () => this.lastSaid && this.say(this.lastSaid), enabled: () => !this.speech.speaking && !!this.lastSaid };
    this.input.add(this.bubble.mesh, { id: 'ali:bubble', ...again, noDwell: true });
    const aliHit = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.3, 10), new THREE.MeshBasicMaterial({ visible: false }));
    aliHit.position.y = 0.65;
    this.ali.group.add(aliHit);
    this.input.add(aliHit, { id: 'ali:body', ...again, noDwell: true });

    let i = 0;
    for (const s of STATIONS) {
      progress(0.35 + 0.1 * i++, 'station:' + s.key);
      await rafFrame();
      this.stations[s.key] = this._safe('station ' + s.key, () => BUILDERS[s.key]({ sfx: this.audio, quality: 'high' }), () => fallbackStation(s));
      this.zones[s.key] = new StationZone(this, s.key);
      shadowTree(this.zones[s.key].root);
    }
    for (const [k, f] of Object.entries(this.frames)) f.add(buildViewerPad(STATION[k]?.color || (k === 'hall' ? '#ffc93c' : PAL.teal)));

    progress(0.88, 'thumbs');
    await rafFrame();
    this.thumbs = {};
    try {
      const chrome = (k, v) => { const z = this.zones[k]; if (z) z.console.visible = z.board.visible = z.rim.visible = v; };
      this.thumbs = renderThumbs(E, this.stations, { show: (k) => { this._showOnly(k); chrome(k, false); this._focusShadow(k); }, restore: () => { for (const s of STATIONS) chrome(s.key, true); this._showOnly(this.place); this._focusShadow(this.place); }, alt: { quake: -0.7, volcano: 0.6, weather: -0.75, erosion: 0.55, human: -0.6 } });
    } catch (e) { console.error('thumbnails failed', e); }
    // new scenes for the retry form of the challenge (transfer, not memory); built, photographed once, then dropped
    try {
      const vignettes = buildVignettes();
      Object.assign(this.thumbs, renderScenes(E, vignettes, addLights));
      for (const v of vignettes) v.group.traverse((o) => o.geometry?.dispose());
    } catch (e) { console.error('vignettes failed', e); }
    this.zones.hub = new HubZone(this);
    this.zones.hall = new HallZone(this);
    shadowTree(this.zones.hub.root);
    shadowTree(this.zones.hall.root);

    this.menu = new VRMenu({
      title: TEXT.menu,
      onClose: () => this.menu.close(),
      items: [
        { id: 'sound', icon: 'speaker', ...BTN.next, label: () => `${TEXT.menuSound}: ${this.store.settings.sfx ? TEXT.on : TEXT.off}`, onClick: () => this.setting('sfx', !this.store.settings.sfx) },
        { id: 'voice', icon: 'speaker', ...BTN.alt, label: () => `${TEXT.menuVoice}: ${this.store.settings.voice ? TEXT.on : TEXT.off}`, onClick: () => this.setting('voice', !this.store.settings.voice) },
        { id: 'recenter', icon: 'eye', ...BTN.plain, label: () => TEXT.menuRecenter, onClick: () => { this.menu.close(); this.recenter(); } },
        { id: 'exit', icon: 'home', ...BTN.stop, label: () => TEXT.menuExit, onClick: () => { this.menu.close(); this.engine.exitVR(); } },
      ],
    });
    E.scene.add(this.menu);
    // the open menu catches rays, so pointing at it never answers something behind it
    this.input.add(this.menu.panel.face, { id: 'menu:panel', onClick: () => {}, noDwell: true });
    this.confetti = new Confetti();
    E.scene.add(this.confetti);
    this.stampFX = new StampFX();
    E.camera.add(this.stampFX);
    this.stampFX.position.set(0, 0, -1.1);

    E.onUpdate((dt, t) => {
      this.world.update?.(dt, t);
      this.ali.update(dt, t);
      const z = this.zones[this.place];
      z?.update?.(dt, t);
    });
    E.onRealUpdate((dt) => { E.headWorld(this.head); this._watchComfort(dt); });
    E.on('xrstart', () => this._onXRStart());
    E.on('xrend', () => this._onXREnd());
    E.on('pause', (p) => (p ? this.speech.pause() : this.speech.resume()));
    this.input.onSnapTurn = () => this.audio.play?.('click', { gain: 0.25, rate: 1.4 });

    // soft rim light on every lit material (one shared shader variant)
    polishTree(E.scene);

    // compile every shader now (all places visible for a moment) so the first visit to a place never stutters
    progress(0.96, 'ready');
    try {
      for (const z of Object.values(this.zones)) z.root.visible = true;
      await Promise.race([E.renderer.compileAsync(E.scene, E.camera), new Promise((r) => setTimeout(r, 4000))]);
    } catch (e) { console.warn('shader prewarm skipped', e); }

    // stand in the hub, ready behind the start screen
    this._arrive('hub');
    progress(1, 'ready');
  }

  /** Every zone console gets a ⚙ button that only shows inside the headset. */
  addMenuButton(consoleObj) {
    const b = consoleObj.addButton({ id: 'menu:open:' + this.consoles.length, label: '', icon: 'gear', ...BTN.plain, w: 0.13, onClick: () => this.toggleMenu() });
    b.persistent = true;
    this.consoles.push(consoleObj);
    return b;
  }
  toggleMenu() {
    if (this.menu.visible) return this.menu.close();
    const f = this.frames[this.place], e = this.eye();
    f.add(this.menu);
    this.menu.position.set(0, e - 0.12, -0.95);
    this.menu.updateMatrixWorld(true);
    faceYaw(this.menu, this.head);
    this.menu.open();
  }
  _refreshConsoles() {
    Console.persistent = this.engine.presenting;
    for (const c of this.consoles) c.refresh();
  }

  _safe(label, fn, fallback) {
    try { return fn(); } catch (e) { console.error(`[ali] ${label} failed to build`, e); return fallback(); }
  }

  // ------------------------------------------------------------------ start / modes
  /** Called from the start screen's click handler (keeps the user gesture for WebXR and audio). */
  start(mode = 'screen') {
    this.audio.unlock?.();
    let xr = null;
    if (mode === 'vr') {
      xr = this.engine.enterVR().catch((e) => {
        console.warn('enterVR failed', e);
        this.shell.toast?.('تعذّر تشغيل النظارة. سنلعب على الشاشة.', 4000);
        this.mode = 'screen';
      });
      this.mode = 'vr';
    } else this.mode = 'screen';
    this.shell.hideStart?.();
    if (!this.started) {
      this.started = true;
      this.startedAt = Date.now();
      this.audio.setMusic?.(this.store.settings.music);
      this.audio.ambience?.(this.place);
      this.run((g) => this.zones.hub.enter(g));
    }
    return xr;
  }
  stopToStart() {
    this.started = false;
    this.cancelScript();
    this.quiet();
    this.bubble.hide();
    if (this.engine.presenting) this.engine.exitVR();
    const home = () => (this.busy ? setTimeout(home, 120) : this.goTo('hub', { script: false }));
    home();
    this.shell.showStart?.();
  }
  setting(key, value) {
    this.store.set(key, value);
    if (key === 'voice') this.speech.setEnabled(value);
    if (key === 'sfx') this.audio.setSfx ? this.audio.setSfx(value) : this.audio.setEnabled?.(value);
    if (key === 'music') this.audio.setMusic?.(value);
    if (key === 'height') this.relayout();
    if (key === 'unlockAll') this.zones.hub?.refresh();
    if (key === 'gender') { setGender(value); this.zones.hub?.refresh(); }
  }
  resetProgress() {
    this.store.resetProgress();
    for (const z of Object.values(this.zones)) z.reset?.();
    this.zones.hub?.refresh();
    this.goTo('hub', { script: this.started });
  }
  /** Headset: put the child back on the pad facing forward, without touching the lesson in progress. */
  async recenter() {
    if (!this.engine.presenting) return this.engine.resetLook();
    if (this.busy) return;
    this.busy = true;
    this.input.locked = true;
    try {
      await this.engine.fade(1, 0.2);
      await this.engine.nextFrame();
      this.engine.placeAt(this.frames[this.place].userData.anchor);
      await this.engine.nextFrame();
      await this.engine.fade(0, 0.3);
    } finally {
      this.busy = false;
      setTimeout(() => { if (!this.busy) this.input.locked = false; }, 300);
    }
  }

  // ------------------------------------------------------------------ scripts (cancellable async flows)
  run(fn) {
    const id = ++this._sid;
    const guard = (p) => Promise.resolve(p).then((v) => { if (id !== this._sid) throw CANCEL; return v; });
    guard.alive = () => id === this._sid;
    return fn(guard).catch((e) => { if (e !== CANCEL) console.error(e); });
  }
  cancelScript() { this._sid++; }

  /** Ali speaks (bubble + voice + caption mirror). Resolves when finished or interrupted. */
  async say(text, { pose = null, accent = PAL.teal } = {}) {
    const id = ++this._sayId;
    this.lastSaid = text;
    this.bubble.say(text, { accent });
    this.shell.say?.(text);
    if (pose) this.ali.setPose(pose);
    this.ali.setTalking(true);
    this.audio.duck?.(true);
    const ok = await this.speech.say(text);
    if (id === this._sayId) {
      this.ali.setTalking(false);
      this.audio.duck?.(false);
      // while the child is hunting for evidence the bubble steps aside so it never hides the clue (tap Ali to hear it again)
      if (this.zones[this.place]?.phase === 'find') setTimeout(() => { if (id === this._sayId) this.bubble.hide(); }, 3500);
    }
    return ok;
  }
  quiet() { this._sayId++; this.speech.stop(); this.ali.setTalking(false); this.audio.duck?.(false); }

  // ------------------------------------------------------------------ places
  isUnlocked(key) {
    if (this.store.settings.unlockAll) return true;
    if (key === 'hub') return true;
    if (key === 'hall') return STATIONS.every((s) => this.store.isDone(s.key));
    const i = STATIONS.findIndex((s) => s.key === key);
    return i === 0 || this.store.isDone(STATIONS[i - 1].key) || this.store.isDone(key);
  }
  nextPlace() {
    const s = STATIONS.find((x) => !this.store.isDone(x.key));
    return s ? s.key : 'hall';
  }
  placeName(key) { return key === 'hall' ? TEXT.hallTitle : key === 'hub' ? TEXT.toHub : shortName(STATION[key]); }

  async goTo(place, { script = true, sameZone = false } = {}) {
    if (this.busy || !this.zones[place]) return false;
    this.busy = true;
    this.input.locked = true; // no selections while the world is dark
    try {
      this.cancelScript();
      this.quiet();
      this.bubble.hide();
      this.menu?.close();
      if (!sameZone) this.audio.whoosh?.();
      await this.engine.fade(1, 0.25);
      if (!sameZone) { try { this.zones[this.place]?.leave?.(); } catch (e) { console.error(e); } }
      this._arrive(place);
      await this.engine.nextFrame();
      await this.engine.fade(0, 0.35);
    } finally {
      this.busy = false;
      setTimeout(() => { if (!this.busy) this.input.locked = false; }, 300);
    }
    if (script && !sameZone && this.started) {
      const zone = this.zones[place];
      if (this._breakDue && this.engine.presenting) {
        this._breakDue = false;
        this.shell.toast?.(TEXT.breakTime + ' ' + TEXT.breakRemove, 8000);
        this.run(async (g) => {
          await g(this.say(TEXT.breakTime, { pose: 'wave' }));
          await g(this.say(TEXT.breakRemove, { pose: 'present' }));
          await zone.enter(g);
        });
      } else this.run((g) => zone.enter(g));
    }
    return true;
  }
  _arrive(place) {
    this.place = place;
    this._showOnly(place);
    this.world.setZone?.(place);
    if (this.started) this.audio.ambience?.(place);
    this.engine.placeAt(this.frames[place].userData.anchor);
    this._placeAli(place);
    this._focusShadow(place);
    this.relayout();
    const done = STATIONS.filter((s) => this.store.isDone(s.key)).length;
    this.shell.setStatus?.({ stamps: done, total: STATIONS.length, place: this.placeName(place) });
  }
  _showOnly(place) {
    for (const [k, z] of Object.entries(this.zones)) z.root.visible = k === place;
  }
  _placeAli(place) {
    const z = this.zones[place], a = this.ali.group;
    this.frames[place].add(a);
    a.position.copy(z.aliSpot);
    a.rotation.set(0, Math.atan2(-a.position.x, -a.position.z), 0); // face the viewer standing at the frame origin
    this.ali.setPose('idle');
    this.ali.lookAt(null);
    this.ali.pointAt(null);
  }
  /** Light each place from its front-right (as tuned in the sandbox); the shadow map only covers that place (sharp and cheap). */
  _focusShadow(place) {
    const z = this.zones[place], f = this.frames[place];
    if (this._skySun === undefined) {
      this._skySun = null;
      this.engine.scene.traverse((o) => { if (o.material?.uniforms?.uSun) this._skySun = o.material.uniforms.uSun; });
    }
    const c = z?.stage ? z.stage.getWorldPosition(new THREE.Vector3()).lerp(this.zonePoint(0, 0, -1.6, place), 0.25) : this.zonePoint(0, 0, place === 'hall' ? -1.9 : -1.4, place);
    aimSun(this.lights.sun, c, { yaw: f.rotation.y, radius: z?.stage ? 3.4 * STAGE.scale + 0.3 : 2.8, sky: this._skySun });
  }
  /** Eye height used for UI placement. */
  eye() {
    if (!this.engine.presenting) return this.engine.desktopEye;
    const pref = this.store.settings.height;
    if (pref === 'seated') return 1.05;
    if (pref === 'standing') return 1.32;
    return this.measuredEye ?? 1.2;
  }
  relayout() {
    const E = this.engine, h = uiHeights(this.eye(), E.presenting ? 0 : E.desktopBack);
    for (const z of Object.values(this.zones)) z.layout?.(h);
  }
  /** World position of the viewer's head (for facing labels). */
  viewer() { return this.head; }
  /** World position of a point in the current zone frame. */
  zonePoint(x, y, z, place = this.place) { return this.frames[place].localToWorld(new THREE.Vector3(x, y, z)); }

  celebrate(at) {
    this.confetti.burst(at || this.zonePoint(0, this.eye() + 0.2, -1.6), 0.9);
    this.ali.jump?.();
  }

  // ------------------------------------------------------------------ headset lifecycle & comfort
  _onXRStart() {
    this.shell.setPresenting?.(true);
    this._refreshConsoles();
    this.measuredEye = null;
    // stay dark until the real head pose is known (about half a second), then stand on the pad facing forward
    this.engine.fade(1, 0);
    this.input.locked = true;
    const samples = [];
    let wait = 0.35;
    this._measureOff?.();
    const off = (this._measureOff = this.engine.onRealUpdate((dt) => {
      if ((wait -= dt) > 0) return;
      if (this.engine.xrRefType === 'local') { this.measuredEye = 1.2; off(); this._afterMeasure(); return; }
      samples.push(this.engine.camera.position.y);
      if (samples.length >= 20) {
        samples.sort((a, b) => a - b);
        this.measuredEye = Math.max(0.85, Math.min(1.8, samples[10]));
        off();
        this._afterMeasure();
      }
    }));
    try {
      const ref = this.engine.renderer.xr.getReferenceSpace();
      // the system recenter: re-place on the next frame, once the new pose is in
      ref?.addEventListener?.('reset', () => { if (!this.busy && this.engine.presenting) this.recenter(); });
    } catch {}
  }
  _afterMeasure() {
    this._measureOff = null;
    this.engine.placeAt(this.frames[this.place].userData.anchor);
    this.relayout();
    this.engine.fade(0, 0.4);
    setTimeout(() => { if (!this.busy) this.input.locked = false; }, 450);
  }
  _onXREnd() {
    this._measureOff?.();
    this._measureOff = null;
    this.engine.fade(0, 0);
    if (!this.busy) this.input.locked = false;
    this.shell.setPresenting?.(false);
    this.menu.close();
    this._refreshConsoles();
    this.mode = 'screen';
    this.engine.placeAt(this.frames[this.place].userData.anchor);
    this.relayout();
  }
  _watchComfort(dt) {
    if (!this.engine.presenting || this.engine.paused) return;
    this.vrTime += dt;
    if (this.vrTime > BREAK_EVERY) { this.vrTime = 0; this._breakDue = true; }
  }

  // ------------------------------------------------------------------ test API
  testAPI() {
    const g = this;
    return {
      game: g,
      engine: g.engine,
      store: g.store,
      state: () => ({ place: g.place, busy: g.busy, started: g.started, phase: g.zones[g.place]?.phase || null, stamps: g.store.progress.done.slice(), presenting: g.engine.presenting, eye: g.eye(), bubble: g.bubble.visible ? g.bubble.text : null, ...(g.zones[g.place]?.testState?.() || {}) }),
      list: () => g.input.list(),
      click: (id) => g.input.clickId(id),
      screenOf: (id) => g.input.screenOf(id),
      goTo: (p) => g.goTo(p),
      start: (mode) => g.start(mode),
      thumbs: () => Object.keys(g.thumbs),
      info: () => { const r = g.engine.renderer.info; return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length }; },
    };
  }
}

// ------------------------------------------------------------------ small shared builders & fallbacks
function fallbackWorld(scene) {
  scene.background = new THREE.Color('#bfe3f4');
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), mat(PAL.grass));
  ground.position.y = -0.01;
  scene.add(ground);
  return { update() {}, setZone() {} };
}

function fallbackAli() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(mergeParts([
    { geo: new THREE.CapsuleGeometry(0.2, 0.55, 4, 12), color: '#ffffff', pos: [0, 0.5, 0] },
    { geo: new THREE.SphereGeometry(0.17, 16, 12), color: '#c98e62', pos: [0, 1.05, 0] },
    { geo: new THREE.SphereGeometry(0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), color: '#ffffff', pos: [0, 1.08, 0] },
  ]), vcMat());
  group.add(body);
  const head = new THREE.Object3D(); head.position.y = 1.05; group.add(head);
  const bubbleAnchor = new THREE.Object3D(); bubbleAnchor.position.y = 1.5; group.add(bubbleAnchor);
  return { group, head, bubbleAnchor, setPose() {}, pointAt() {}, lookAt() {}, setTalking() {}, jump() {}, update() {} };
}

function fallbackStation(s) {
  const group = new THREE.Group();
  const g = new THREE.Mesh(new THREE.CylinderGeometry(2.72, 2.72, 1, 48), mat(PAL.sand));
  g.position.y = -0.5;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.06), basic(s.color));
  sign.position.y = 0.8;
  group.add(g, sign);
  return { key: s.key, group, duration: 4, setProgress() {}, update() {}, play() {}, stop() {}, evidence: {}, thumb: { cam: [0, 1.4, 3], target: [0, 0.6, 0], t: 1 } };
}

export { STAGE };
