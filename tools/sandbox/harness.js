// Sandbox page for building/inspecting one module in isolation (driven by tools/snap.mjs through window.__sb).
import * as THREE from 'three';
import { Engine } from '../../src/core/engine.js';
import { Input } from '../../src/core/input.js';
import { initUI, labelMesh } from '../../src/core/ui.js';
import { addLights } from '../../src/core/lighting.js';
import { createSfxStub } from '../../src/core/sfxStub.js';
import { PAL, blobShadow } from '../../src/core/kit.js';
import { STAGE, buildFrames, zoneTransform } from '../../src/core/layout.js';

const errors = [];
addEventListener('error', (e) => errors.push(String(e.message || e)));
addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + String(e.reason?.stack || e.reason)));

export async function boot({ kind, key, build }) {
  try { await document.fonts.load('800 40px "Baloo Bhaijaan 2"', 'عربي'); } catch {}
  const app = document.getElementById('app');
  const engine = new Engine(app);
  engine.renderer.setAnimationLoop(null); // the snap tool drives frames itself
  const input = new Input(engine);
  const sfx = createSfxStub();
  initUI(engine, input, sfx);
  addLights(engine.scene);
  engine.scene.background = new THREE.Color('#bfe3f4');
  const cam = engine.camera;
  cam.fov = 66;
  const views = {};
  const sb = (window.__sb = { kind, key, errors, sfx, engine, views, stats: null, ready: false });
  const t0 = performance.now();
  let subject = null, root = new THREE.Group();
  engine.scene.add(root);

  if (kind === 'station' || kind === 'ali') {
    // placeholder ground like the real zone: flat terrain with a pit under the stage + rim ring
    const ground = new THREE.Mesh(new THREE.RingGeometry(STAGE.radius + 0.12, 40, 96, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: PAL.grass }));
    ground.position.set(0, 0, STAGE.z);
    root.add(ground);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(STAGE.radius + 0.15, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#6b5440' }));
    pit.position.set(0, -0.9, STAGE.z);
    root.add(pit);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(STAGE.radius + 0.13, STAGE.radius + 0.16, 0.3, 96, 1, true), new THREE.MeshLambertMaterial({ color: '#d9c3a0', side: THREE.DoubleSide }));
    rim.position.set(0, 0.02, STAGE.z);
    if (kind === 'station') root.add(rim);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.45, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#fff4e2' }));
    pad.position.y = 0.01;
    root.add(pad);
  }

  if (kind === 'station') {
    const st = (subject = build({ sfx, quality: 'high' }));
    st.group.position.set(0, 0.15, STAGE.z);
    root.add(st.group);
    st.setProgress(0);
    const W = (v) => st.group.localToWorld(new THREE.Vector3(...v));
    st.group.updateMatrixWorld(true);
    const C = new THREE.Vector3(0, 0.15, STAGE.z);
    views.player = { pos: new THREE.Vector3(0, 1.22, 0), target: new THREE.Vector3(0, 0.55, STAGE.z) };
    views.playerWide = { pos: new THREE.Vector3(0, 1.22, 0.6), target: new THREE.Vector3(0, 0.9, STAGE.z), fov: 90 };
    views.seated = { pos: new THREE.Vector3(0, 0.98, 0), target: new THREE.Vector3(0, 0.45, STAGE.z) };
    views.top = { pos: new THREE.Vector3(0, 7.5, STAGE.z + 2.2), target: C };
    views.side = { pos: new THREE.Vector3(5.2, 2.4, STAGE.z + 1.2), target: C };
    views.left = { pos: new THREE.Vector3(-4.8, 2.0, STAGE.z + 2.4), target: C };
    if (st.thumb) views.thumb = { pos: W(st.thumb.cam), target: W(st.thumb.target), aspect: 4 / 3, t: st.thumb.t, fov: 50 }; // same framing as the game's quiz pictures
    // evidence debug markers
    const evGroup = new THREE.Group(); evGroup.visible = false; root.add(evGroup);
    for (const [id, ev] of Object.entries(st.evidence || {})) {
      const p = st.group.localToWorld(ev.pos.clone());
      const s = new THREE.Mesh(new THREE.SphereGeometry(ev.radius || 0.3, 20, 14), new THREE.MeshBasicMaterial({ color: '#ff00aa', transparent: true, opacity: 0.35, depthTest: false }));
      s.position.copy(p); s.renderOrder = 999; evGroup.add(s);
      const l = labelMesh(id, { h: 0.16 }); l.position.copy(p).add(new THREE.Vector3(0, (ev.radius || 0.3) + 0.15, 0)); evGroup.add(l);
    }
    sb.setProgress = (t) => st.setProgress(t);
    sb.showEvidence = (v) => (evGroup.visible = v);
    sb.play = () => st.play?.();
    sb.stop = () => st.stop?.();
    sb.update = (dt, time) => st.update?.(dt, time);
    sb.duration = st.duration;
    sb.evidence = Object.keys(st.evidence || {});
    sb.thumbT = st.thumb?.t;
  } else if (kind === 'ali') {
    const ali = (subject = build());
    ali.group.position.set(0, 0, -2.0);
    root.add(ali.group);
    views.player = { pos: new THREE.Vector3(0, 1.22, 0), target: new THREE.Vector3(0, 0.85, -2.0) };
    views.close = { pos: new THREE.Vector3(0, 1.15, -1.0), target: new THREE.Vector3(0, 1.0, -2.0) };
    views.threeq = { pos: new THREE.Vector3(1.4, 1.3, -0.6), target: new THREE.Vector3(0, 0.8, -2.0) };
    views.side = { pos: new THREE.Vector3(2.2, 1.0, -2.0), target: new THREE.Vector3(0, 0.75, -2.0) };
    views.back = { pos: new THREE.Vector3(0, 1.4, -4.2), target: new THREE.Vector3(0, 0.8, -2.0) };
    // Ali stands in a zone at (1.75, 0, -1.7) and faces the viewer; here we put him in front
    ali.group.rotation.y = 0; // faces +Z (toward the viewer at the origin)
    sb.setPose = (p) => ali.setPose(p);
    sb.pointAt = (v) => ali.pointAt(v ? new THREE.Vector3(...v) : null);
    sb.lookAt = (v) => ali.lookAt(v ? new THREE.Vector3(...v) : null);
    sb.setTalking = (v) => ali.setTalking(v);
    sb.jump = () => ali.jump?.();
    sb.update = (dt, time) => ali.update(dt, time);
    // bubble anchor marker
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: '#ff00aa' }));
    (ali.bubbleAnchor || ali.group).add(m);
  } else if (kind === 'world') {
    engine.scene.background = null;
    const frames = buildFrames(engine.scene);
    const world = (subject = build({ scene: engine.scene, frames, quality: 'high' }));
    // stand-ins for the per-zone content the game adds (so composition can be judged)
    for (const [k, f] of Object.entries(frames)) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.45, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#fff4e2' }));
      pad.position.y = 0.02; f.add(pad);
      if (!['hub', 'hall'].includes(k)) {
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(STAGE.radius + 0.13, STAGE.radius + 0.16, 0.3, 64, 1, true), new THREE.MeshLambertMaterial({ color: '#d9c3a0', side: THREE.DoubleSide }));
        rim.position.set(0, 0.02, STAGE.z); f.add(rim);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(STAGE.radius, STAGE.radius, 0.3, 64), new THREE.MeshLambertMaterial({ color: '#c9b48f' }));
        disc.position.set(0, 0.0, STAGE.z); f.add(disc);
      }
    }
    const look = (k, yawDeg = 0, pitch = -0.08, h = 1.22) => {
      const f = frames[k]; f.updateMatrixWorld(true);
      const pos = f.localToWorld(new THREE.Vector3(0, h, 0));
      const a = THREE.MathUtils.degToRad(yawDeg);
      const dir = new THREE.Vector3(-Math.sin(a), Math.sin(pitch), -Math.cos(a));
      const target = f.localToWorld(new THREE.Vector3(0, h, 0).add(dir.multiplyScalar(10)));
      return { pos, target, zone: k };
    };
    for (const k of Object.keys(frames)) views[k] = look(k);
    for (const d of [90, 180, 270]) views['hub_' + d] = look('hub', d);
    views.hall_back = look('hall', 180);
    views.quake_back = look('quake', 180);
    views.aerial = { pos: new THREE.Vector3(26, 34, 30), target: new THREE.Vector3(0, 0, -2), fov: 60 };
    views.aerialFar = { pos: new THREE.Vector3(70, 60, 70), target: new THREE.Vector3(0, 0, 0), fov: 55 };
    sb.update = (dt, time) => world.update?.(dt, time);
    sb.setZone = (k) => world.setZone?.(k);
  }
  sb.buildMs = performance.now() - t0;

  sb.setView = (name) => {
    const v = views[name];
    if (!v) throw new Error('no view ' + name);
    cam.position.copy(v.pos);
    cam.fov = v.fov || 66;
    cam.lookAt(v.target);
    if (v.zone && sb.setZone) sb.setZone(v.zone);
    return v;
  };
  sb.render = (w = 1280, h = 800) => {
    const r = engine.renderer;
    r.setPixelRatio(1);
    r.setSize(w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    r.info.reset(); r.info.autoReset = false;
    r.render(engine.scene, cam);
    const i = r.info.render;
    return { calls: i.calls, triangles: i.triangles, points: i.points, lines: i.lines, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? null };
  };
  sb.timeUpdate = (frames = 60, dt = 1 / 60) => {
    const t = performance.now();
    for (let i = 0; i < frames; i++) { engine.time += dt; sb.update?.(dt, engine.time); }
    return (performance.now() - t) / frames;
  };
  sb.timeProgress = (steps = 120) => {
    if (!sb.setProgress) return 0;
    const t = performance.now();
    for (let i = 0; i <= steps; i++) sb.setProgress(i / steps);
    return (performance.now() - t) / (steps + 1);
  };
  sb.sceneStats = () => {
    let meshes = 0, tris = 0, std = 0; const mats = new Set(), texs = new Set();
    engine.scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isPoints && !o.isLine) return;
      meshes++;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { mats.add(m); if (m.map) texs.add(m.map); if (m.isMeshStandardMaterial) std++; }
      const g = o.geometry; const n = g.index ? g.index.count : g.attributes.position?.count || 0;
      tris += ((o.isInstancedMesh ? o.count : 1) * n) / 3;
    });
    return { visibleObjects: meshes, approxTris: Math.round(tris), materials: mats.size, textures: texs.size, standardMaterials: std };
  };
  sb.subject = subject;
  sb.ready = true;
}
