// Engine: renderer, scene, player rig, one render loop for screen and headset, WebXR lifecycle, comfort fade, placement.
import * as THREE from 'three';
import { stepTweens } from './tween.js';

const Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export function yawOf(obj) {
  obj.getWorldQuaternion(_q);
  _e.setFromQuaternion(_q, 'YXZ');
  return _e.y;
}

export class Engine {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(container.clientWidth || innerWidth, container.clientHeight || innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFramebufferScaleFactor(1.0);
    r.xr.setFoveation(0.5); // adjusted at run time by _adaptXR (sharper text when the GPU has room)
    r.domElement.id = 'world';
    r.domElement.tabIndex = 0;
    r.domElement.setAttribute('aria-label', 'العالم ثلاثي الأبعاد لمغامرة المستكشف علي');
    container.appendChild(r.domElement);
    this.canvas = r.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#bfe3f4');
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.rig = new THREE.Group();
    this.rig.name = 'rig';
    this.scene.add(this.rig);
    this.rig.add(this.camera);
    this.desktopEye = 1.32;
    this.desktopBack = 0.85; // screen camera stands behind the pad so the whole scene fits
    this.camera.position.set(0, this.desktopEye, this.desktopBack);
    this.look = { yaw: 0, pitch: -0.1, tyaw: 0, tpitch: -0.1 };
    this.defaultPitch = -0.1;

    this.timeScale = 1;
    this.time = 0; // scaled game time
    this.realTime = 0;
    this.paused = false;
    this.updaters = new Set(); // (dt, time, frame) scaled, skipped while paused
    this.realUpdaters = new Set(); // (realDt) always run (input, fades, ui hover)
    this.listeners = {};
    this.xrRefType = 'local-floor';
    this.baseY = 0;
    this._frames = [];
    this._lastT = performance.now();

    // comfort fade: inverted sphere glued to the viewer (works for screen and headset)
    this.fadeMat = new THREE.MeshBasicMaterial({ color: '#1d2b3a', side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    this.fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), this.fadeMat);
    this.fadeMesh.renderOrder = 100000;
    this.fadeMesh.frustumCulled = false;
    this.fadeMesh.visible = false;
    this.camera.add(this.fadeMesh);
    this._fade = { from: 0, to: 0, t: 1, dur: 0.3, resolve: null };

    addEventListener('resize', () => this.resize());
    // the 2D page may report hidden while the headset shows the game: only the XR session's own visibility counts then
    document.addEventListener('visibilitychange', () => { if (!this.presenting) this._setPaused(document.hidden, 'tab'); });
    r.xr.addEventListener('sessionstart', () => this._onSessionStart());
    r.xr.addEventListener('sessionend', () => this._onSessionEnd());
    this.resize();
    r.setAnimationLoop((t, frame) => this._tick(t, frame));
  }

  on(type, fn) { (this.listeners[type] ||= new Set()).add(fn); return () => this.listeners[type].delete(fn); }
  emit(type, data) { for (const fn of this.listeners[type] || []) fn(data); }
  onUpdate(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }
  onRealUpdate(fn) { this.realUpdaters.add(fn); return () => this.realUpdaters.delete(fn); }

  get presenting() { return this.renderer.xr.isPresenting; }

  resize() {
    if (this.presenting) return;
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.camera.aspect = w / h;
    // keep a comfortable horizontal field of view on portrait tablets
    const vfov = w / h < 1 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36)) / (w / h))) : 62;
    this.camera.fov = Math.min(vfov, 100);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ------------------------------------------------------------------ head / height
  /** Viewer eye height above the virtual floor (meters). */
  eyeHeight() { return this.rig.position.y + this.camera.position.y; }
  headWorld(out = new THREE.Vector3()) { return this.camera.getWorldPosition(out); }
  /** Yaw of the head inside the rig (rad). */
  headLocalYaw() { _e.setFromQuaternion(this.camera.quaternion, 'YXZ'); return _e.y; }

  // ------------------------------------------------------------------ placement (teleport)
  /**
   * Put the viewer on `anchor` (Object3D: player stands at its origin, faces its local -Z).
   * In the headset the user's real head is moved onto the anchor and turned to face forward (done under the fade).
   */
  placeAt(anchor) {
    anchor.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3().setFromMatrixPosition(anchor.matrixWorld);
    const yaw = yawOf(anchor);
    if (this.presenting) {
      const head = this.camera.position;
      const rigYaw = yaw - this.headLocalYaw();
      this.rig.rotation.set(0, rigYaw, 0);
      _v.set(head.x, 0, head.z).applyAxisAngle(Y, rigYaw);
      this.rig.position.set(pos.x - _v.x, pos.y + this.baseY, pos.z - _v.z);
    } else {
      this.rig.position.copy(pos);
      this.rig.rotation.set(0, yaw, 0);
      this.look.yaw = this.look.tyaw = 0;
      this.look.pitch = this.look.tpitch = this.defaultPitch;
      this.camera.position.set(0, this.desktopEye, this.desktopBack);
      this.camera.rotation.set(this.look.pitch, this.look.yaw, 0);
    }
    this.rig.updateMatrixWorld(true);
    this.emit('placed', anchor);
  }

  /** Promise for the next rendered frame (works in the headset, where window rAF may not run). */
  nextFrame() { return new Promise((r) => { const off = this.onRealUpdate(() => { off(); r(); }); }); }

  /** Rotate the viewer around their own head (snap turn). */
  turn(angle) {
    const head = this.headWorld();
    this.rig.rotation.y += angle;
    const off = this.rig.position.clone().sub(head).applyAxisAngle(Y, angle);
    this.rig.position.copy(head).add(off);
    this.rig.position.y = this.baseY;
    this.rig.updateMatrixWorld(true);
  }

  /** Screen mode: look around (radians). */
  addLook(dyaw, dpitch) {
    this.look.tyaw += dyaw;
    this.look.tpitch = Math.max(-1.15, Math.min(0.95, this.look.tpitch + dpitch));
  }
  resetLook() { this.look.tyaw = 0; this.look.tpitch = this.defaultPitch; }

  // ------------------------------------------------------------------ fade
  fade(to, dur = 0.3) {
    const f = this._fade;
    f.resolve?.();
    f.from = this.fadeMat.opacity; f.to = to; f.t = 0; f.dur = Math.max(0.001, dur);
    this.fadeMesh.visible = true;
    return new Promise((res) => (f.resolve = res));
  }

  // ------------------------------------------------------------------ XR
  async xrSupported() {
    try { return !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'))); } catch { return false; }
  }
  async enterVR() {
    if (!navigator.xr) throw new Error('webxr-unavailable');
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] });
    let type = 'local-floor';
    try { await session.requestReferenceSpace('local-floor'); } catch { type = 'local'; }
    this.xrRefType = type;
    this.renderer.xr.setReferenceSpaceType(type);
    // 'local' puts the origin at the head: lift the rig so the virtual floor sits ~1.2 m below the eyes
    this.baseY = type === 'local' ? 1.2 : 0;
    try { session.updateTargetFrameRate?.(72)?.catch?.(() => {}); } catch {}
    session.addEventListener('visibilitychange', () => this._setPaused(session.visibilityState !== 'visible', 'xr'));
    await this.renderer.xr.setSession(session);
    return session;
  }
  exitVR() { this.renderer.xr.getSession()?.end(); }
  _onSessionStart() {
    this._pauseReasons?.delete('tab');
    this._setPaused(false, 'tab');
    this.rig.position.y = this.baseY;
    this.emit('xrstart');
  }
  _onSessionEnd() {
    this.baseY = 0;
    this.rig.position.y = 0;
    this._pauseReasons?.delete('xr');
    this._setPaused(false, 'xr');
    this.camera.position.set(0, this.desktopEye, this.desktopBack);
    this.camera.quaternion.identity();
    this.resize();
    this.emit('xrend');
  }

  _setPaused(p, reason) {
    this._pauseReasons ||= new Set();
    if (p) this._pauseReasons.add(reason); else this._pauseReasons.delete(reason);
    const now = this._pauseReasons.size > 0;
    if (now !== this.paused) { this.paused = now; this.emit('pause', now); }
  }

  // ------------------------------------------------------------------ loop
  _tick(t, frame) {
    const nowMs = performance.now();
    let realDt = Math.min(0.05, Math.max(0, (nowMs - this._lastT) / 1000));
    this._lastT = nowMs;
    this.realTime += realDt;
    this.frame = frame || null;

    // fade (real time so it never stalls)
    const f = this._fade;
    if (f.t < 1) {
      f.t = Math.min(1, f.t + realDt / f.dur);
      const k = f.t * f.t * (3 - 2 * f.t);
      this.fadeMat.opacity = f.from + (f.to - f.from) * k;
      if (f.t >= 1) { this.fadeMesh.visible = this.fadeMat.opacity > 0.001; const r = f.resolve; f.resolve = null; r?.(); }
    }

    // screen-mode camera smoothing
    if (!this.presenting) {
      const L = this.look, a = 1 - Math.exp(-realDt * 14);
      L.yaw += (L.tyaw - L.yaw) * a; L.pitch += (L.tpitch - L.pitch) * a;
      this.camera.rotation.set(L.pitch, L.yaw, 0);
    }

    for (const fn of this.realUpdaters) fn(realDt);
    if (!this.paused) {
      const dt = realDt * this.timeScale;
      this.time += dt;
      stepTweens(dt);
      for (const fn of this.updaters) fn(dt, this.time, frame);
    }
    this.renderer.render(this.scene, this.camera);
    this._perf(realDt);
  }

  // headset: dynamic foveation (more peripheral savings only while frames are late); screens: adaptive pixel ratio
  _adaptXR(dt) {
    const a = (this._xrAdapt ||= { sum: 0, n: 0, good: 0, fov: 0.5 });
    a.sum += dt; a.n++;
    if (a.sum < 1) return;
    const avg = a.sum / a.n;
    a.sum = 0; a.n = 0;
    if (avg > 0.0152 && a.fov < 1) { a.fov = Math.min(1, a.fov + 0.25); a.good = 0; this.renderer.xr.setFoveation(a.fov); }
    else if (avg < 0.0145 && ++a.good >= 5 && a.fov > 0.25) { a.fov -= 0.25; a.good = 0; this.renderer.xr.setFoveation(a.fov); }
  }
  _perf(dt) {
    if (this.presenting) return this._adaptXR(dt);
    this._frames.push(dt);
    if (this._frames.length < 120) return;
    const avg = this._frames.reduce((a, b) => a + b, 0) / this._frames.length;
    this._frames.length = 0;
    const pr = this.renderer.getPixelRatio();
    if (avg > 1 / 40 && pr > 0.9) this.renderer.setPixelRatio(Math.max(0.9, pr - 0.25));
  }
}
