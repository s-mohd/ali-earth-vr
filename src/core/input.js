// Unified pointing: mouse/touch (drag to look, tap to select), headset controllers (laser + trigger),
// tracked hands (pinch), gaze-dwell fallback, haptics, and comfortable 30° snap turning.
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const DRAG_PX = 8;
const DWELL = 1.5; // seconds to activate by looking (only when no controllers/hands)
const SNAP = Math.PI / 6;

function shownInTree(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _head = new THREE.Vector3();

export class Input {
  constructor(engine) {
    this.engine = engine;
    this.targets = new Map(); // mesh -> handler
    this.ray = new THREE.Raycaster();
    this.ray.far = 30;
    this.locked = false;
    this.mouse = { x: 0, y: 0, inside: false, down: false, sx: 0, sy: 0, moved: 0, type: 'mouse', id: null };
    this.mouseHover = null;
    this.pointers = [];
    this.gaze = { active: false, target: null, t: 0, cool: 0 };
    this.onAnySelect = null; // optional hook (e.g. unlock audio)
    this.onMiss = null; // called when a click hits nothing interactive
    this._initMouse();
    this._initXR();
    engine.onRealUpdate((dt) => this.update(dt));
  }

  /**
   * Make a mesh interactive. handler: { id, onClick(), onHover(bool), enabled(): bool, cursor:'pointer' }
   * Returns an unregister function.
   */
  add(mesh, handler = {}) {
    handler.mesh = mesh;
    handler._hover = 0;
    this.targets.set(mesh, handler);
    return () => this.remove(mesh);
  }
  remove(mesh) {
    const h = this.targets.get(mesh);
    if (!h) return;
    if (h._hover > 0) { h._hover = 0; h.onHover?.(false); }
    if (this.mouseHover === h) this.mouseHover = null;
    for (const p of this.pointers) if (p.hover === h) p.hover = null;
    if (this.gaze.target === h) this.gaze.target = null;
    this.targets.delete(mesh);
  }
  isActive(h) { return shownInTree(h.mesh) && (!h.enabled || h.enabled() !== false); }
  candidates() { const out = []; for (const [m, h] of this.targets) if (this.isActive(h)) out.push(m); return out; }

  /** Raycast from origin/direction; returns { handler, point, distance } or null (also returns non-interactive blocker hits as null handler). */
  pick(origin, dir) {
    if (this.locked) return null;
    this.ray.set(origin, dir);
    const hits = this.ray.intersectObjects(this.candidates(), false);
    if (!hits.length) return null;
    return { handler: this.targets.get(hits[0].object), point: hits[0].point, distance: hits[0].distance };
  }

  activate(h, via = 'pointer') {
    if (!h || this.locked || !this.isActive(h)) return false;
    // debounce: one activation per 250 ms (children double-press; gaze and trigger can coincide)
    const now = performance.now();
    if (via !== 'test' && now - (this._lastAct || 0) < 250) return false;
    this._lastAct = now;
    this.onAnySelect?.(h, via);
    h.onClick?.(via);
    return true;
  }

  _hoverChange(h, d) {
    if (!h) return;
    const was = h._hover > 0;
    h._hover = Math.max(0, h._hover + d);
    const is = h._hover > 0;
    if (was !== is) h.onHover?.(is);
  }

  // ------------------------------------------------------------------ mouse / touch
  _initMouse() {
    const c = this.engine.canvas, M = this.mouse;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      c.setPointerCapture?.(e.pointerId);
      Object.assign(M, { down: true, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: 0, type: e.pointerType, id: e.pointerId, inside: true });
    });
    c.addEventListener('pointermove', (e) => {
      if (M.down && e.pointerId === M.id) {
        const dx = e.clientX - M.x, dy = e.clientY - M.y;
        M.moved += Math.abs(dx) + Math.abs(dy);
        if (M.moved > DRAG_PX) {
          const k = e.pointerType === 'touch' ? 0.006 : 0.0045;
          this.engine.addLook(dx * k, dy * k * 0.8);
        }
      }
      M.x = e.clientX; M.y = e.clientY; M.inside = true; M.type = e.pointerType;
    });
    const up = (e) => {
      if (!M.down || e.pointerId !== M.id) return;
      M.down = false;
      if (M.moved <= DRAG_PX && !this.engine.presenting) {
        const hit = this._screenPick(e.clientX, e.clientY);
        if (hit?.handler) this.activate(hit.handler, 'mouse');
        else this.onMiss?.(hit);
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { if (e.pointerId === M.id) M.down = false; });
    c.addEventListener('pointerleave', () => { M.inside = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (this.engine.presenting || document.body.classList.contains('modal-open')) return;
      const t = e.target?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      const step = 0.16;
      if (e.key === 'ArrowLeft') { this.engine.addLook(step, 0); e.preventDefault(); }
      if (e.key === 'ArrowRight') { this.engine.addLook(-step, 0); e.preventDefault(); }
      if (e.key === 'ArrowUp') { this.engine.addLook(0, step * 0.7); e.preventDefault(); }
      if (e.key === 'ArrowDown') { this.engine.addLook(0, -step * 0.7); e.preventDefault(); }
    });
  }
  _screenRay(x, y) {
    const r = this.engine.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.engine.camera);
    return { o: this.ray.ray.origin.clone(), d: this.ray.ray.direction.clone() };
  }
  _screenPick(x, y) { const r = this._screenRay(x, y); return this.pick(r.o, r.d); }

  // ------------------------------------------------------------------ headset
  _initXR() {
    const xr = this.engine.renderer.xr, rig = this.engine.rig;
    const lineGeo = new THREE.CylinderGeometry(0.0025, 0.0045, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2);
    const handFactory = new XRHandModelFactory();
    for (let i = 0; i < 2; i++) {
      const controller = xr.getController(i);
      const grip = xr.getControllerGrip(i);
      const hand = xr.getHand(i);
      rig.add(controller, grip, hand);
      const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, fog: false });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.renderOrder = 9000;
      line.visible = false;
      controller.add(line);
      const cursor = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.016, 24), new THREE.MeshBasicMaterial({ color: '#ffab52', depthTest: false, transparent: true, toneMapped: false, fog: false, side: THREE.DoubleSide }));
      cursor.renderOrder = 9001;
      cursor.visible = false;
      this.engine.scene.add(cursor);
      // simple friendly controller body (no network model download)
      const body = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.07, 4, 10), new THREE.MeshLambertMaterial({ color: '#f4f1fb' }));
      shell.rotation.x = Math.PI / 2;
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 20), new THREE.MeshLambertMaterial({ color: '#3fb3a6' }));
      ringM.position.set(0, 0.02, -0.03); ringM.rotation.x = Math.PI / 2.6;
      body.add(shell, ringM);
      body.visible = false;
      grip.add(body);
      let handModel = null;
      const p = { i, controller, grip, hand, line, cursor, body, source: null, hover: null, pressed: null, axisArmed: true, handModel: null };
      controller.addEventListener('connected', (e) => {
        p.source = e.data;
        const isPointer = e.data.targetRayMode === 'tracked-pointer';
        p.line.visible = isPointer;
        p.body.visible = isPointer && !e.data.hand;
        if (e.data.hand && !handModel) { handModel = handFactory.createHandModel(hand, 'spheres'); hand.add(handModel); }
        this._refreshGazeMode();
      });
      controller.addEventListener('disconnected', () => {
        p.source = null; p.line.visible = false; p.cursor.visible = false; p.body.visible = false;
        if (p.hover) { this._hoverChange(p.hover, -1); p.hover = null; }
        this._refreshGazeMode();
      });
      controller.addEventListener('selectstart', () => { p.pressed = p.hover; this.haptic(p, 0.35, 25); });
      const select = () => {
        if (this.gaze.active) return;
        if (p.hover) { if (this.activate(p.hover, 'controller')) this.haptic(p, 0.6, 40); }
        else this.onMiss?.(null);
        p.pressed = null;
      };
      controller.addEventListener('select', select);
      // young children often squeeze the grip instead of the trigger: treat it the same
      controller.addEventListener('squeeze', select);
      this.pointers.push(p);
    }
    this.engine.on('xrstart', () => this._refreshGazeMode());
    this.engine.on('xrend', () => {
      for (const p of this.pointers) { if (p.hover) this._hoverChange(p.hover, -1); p.hover = null; p.cursor.visible = false; }
      this._setGazeTarget(null); this.reticle.visible = false;
      this.gaze.active = false;
    });
    // gaze reticle (child of camera)
    const ret = (this.reticle = new THREE.Group());
    const dot = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.011, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, toneMapped: false, fog: false }));
    dot.renderOrder = 9002;
    this.dwellRing = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.02, 40, 1, Math.PI / 2, Math.PI * 2), new THREE.MeshBasicMaterial({ color: '#ffab52', depthTest: false, transparent: true, toneMapped: false, fog: false, side: THREE.DoubleSide }));
    this.dwellRing.geometry.setDrawRange(0, 0);
    this.dwellRing.renderOrder = 9003;
    ret.add(dot, this.dwellRing);
    ret.visible = false;
    this.engine.camera.add(ret);
  }
  _refreshGazeMode() {
    const session = this.engine.renderer.xr.getSession();
    const pointers = session ? [...session.inputSources].filter((s) => s.targetRayMode === 'tracked-pointer') : [];
    this.gaze.active = !!session && this.engine.presenting && pointers.length === 0;
  }
  haptic(p, strength = 0.3, ms = 20) {
    const gp = p.source?.gamepad;
    try {
      if (gp?.hapticActuators?.[0]?.pulse) gp.hapticActuators[0].pulse(strength, ms);
      else gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength });
    } catch {}
  }
  _setGazeTarget(h) {
    if (h === this.gaze.target) return;
    if (this.gaze.target) this._hoverChange(this.gaze.target, -1);
    this.gaze.target = h;
    this.gaze.t = 0;
    if (h) this._hoverChange(h, 1);
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const E = this.engine;
    if (!E.presenting) {
      // mouse hover
      let h = null;
      if (this.mouse.inside && !this.mouse.down && this.mouse.type === 'mouse') h = this._screenPick(this.mouse.x, this.mouse.y)?.handler || null;
      if (h !== this.mouseHover) { this._hoverChange(this.mouseHover, -1); this.mouseHover = h; this._hoverChange(h, 1); }
      E.canvas.style.cursor = h ? 'pointer' : this.mouse.down && this.mouse.moved > DRAG_PX ? 'grabbing' : 'grab';
      return;
    }
    if (this.mouseHover) { this._hoverChange(this.mouseHover, -1); this.mouseHover = null; }
    const o = _o, d = _d, m = _m;
    for (const p of this.pointers) {
      const ok = p.source && p.source.targetRayMode === 'tracked-pointer' && p.controller.visible;
      let hit = null;
      if (ok) {
        p.controller.updateMatrixWorld(true);
        m.extractRotation(p.controller.matrixWorld);
        o.setFromMatrixPosition(p.controller.matrixWorld);
        d.set(0, 0, -1).applyMatrix4(m).normalize();
        hit = this.pick(o, d);
      }
      const h = hit?.handler || null;
      if (h !== p.hover) {
        this._hoverChange(p.hover, -1); p.hover = h; this._hoverChange(h, 1);
        if (h) this.haptic(p, 0.12, 12);
      }
      p.line.visible = !!ok;
      if (ok) {
        const len = hit ? hit.distance : 3;
        p.line.scale.set(1, 1, len);
        p.line.material.opacity = h ? 0.9 : 0.35;
        p.line.material.color.set(h ? '#ffd164' : '#ffffff');
      }
      p.cursor.visible = !!hit;
      if (hit) { p.cursor.position.copy(hit.point); p.cursor.lookAt(E.headWorld(_head)); }
      this._stick(p, dt);
    }
    // gaze-dwell fallback
    if (this.gaze.active) {
      E.camera.updateMatrixWorld(true);
      // in XR the user camera carries the head pose after the first frame
      m.extractRotation(E.camera.matrixWorld);
      o.setFromMatrixPosition(E.camera.matrixWorld);
      d.set(0, 0, -1).applyMatrix4(m).normalize();
      const hit = this.pick(o, d);
      this._setGazeTarget(hit?.handler && !hit.handler.noDwell ? hit.handler : null);
      const dist = hit ? Math.max(0.3, Math.min(hit.distance - 0.02, 2.5)) : 1.6;
      this.reticle.visible = true;
      this.reticle.position.set(0, 0, -dist);
      this.reticle.scale.setScalar(dist);
      this.gaze.cool = Math.max(0, this.gaze.cool - dt);
      if (this.gaze.target && this.gaze.cool <= 0) {
        this.gaze.t += dt;
        if (this.gaze.t >= DWELL) { this.activate(this.gaze.target, 'gaze'); this.gaze.t = 0; this.gaze.cool = 1.2; }
      } else this.gaze.t = 0;
      const k = Math.min(1, this.gaze.t / DWELL);
      this.dwellRing.geometry.setDrawRange(0, Math.floor(k * 40) * 6);
    } else this.reticle.visible = false;
  }

  /** Vibrate every connected controller (earthquake, stamps, correct answers). */
  rumble(strength = 0.4, ms = 60) { if (this.engine.presenting) for (const p of this.pointers) this.haptic(p, strength, ms); }

  _stick(p, dt) {
    if (this.locked) return;
    const gp = p.source?.gamepad;
    if (!gp || !gp.axes || gp.axes.length < 2) return;
    const x = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
    if (p.axisArmed && Math.abs(x) > 0.7) {
      p.axisArmed = false;
      this.engine.turn(x > 0 ? -SNAP : SNAP);
      this.haptic(p, 0.2, 15);
      this.onSnapTurn?.();
    } else if (!p.axisArmed && Math.abs(x) < 0.3) p.axisArmed = true;
  }

  // ------------------------------------------------------------------ test helpers
  list() { const out = []; for (const h of this.targets.values()) if (h.id && this.isActive(h)) out.push(h.id); return out; }
  find(id) { for (const h of this.targets.values()) if (h.id === id) return h; return null; }
  clickId(id) { const h = this.find(id); return h ? this.activate(h, 'test') : false; }
  screenOf(id) {
    const h = this.find(id);
    if (!h || !this.isActive(h)) return null;
    const box = new THREE.Box3().setFromObject(h.mesh), c = box.getCenter(new THREE.Vector3()).project(this.engine.camera);
    const r = this.engine.canvas.getBoundingClientRect();
    return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height, z: c.z };
  }
}
