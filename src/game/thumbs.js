// Quiz/passport pictures rendered from the real dioramas (so the pictures match what the child saw).
import * as THREE from 'three';
import { canvas as mkCanvas } from '../core/kit.js';

/**
 * Render each station at its thumb camera into a 4:3 canvas.
 * show(key) makes that station (and its surroundings) the only visible zone while rendering.
 * alt: { key: yaw } turns the second view around the diorama (radians; default 0.65).
 */
export function renderThumbs(engine, stations, { show, restore, w = 640, h = 480, alt = {} } = {}) {
  const r = engine.renderer, scale = 2;
  const rt = new THREE.WebGLRenderTarget(w * scale, h * scale, { depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(50, w / h, 0.05, 400);
  const px = new Uint8Array(w * scale * h * scale * 4);
  const big = mkCanvas(w * scale, h * scale), bctx = big.getContext('2d');
  const out = {};
  const prevXR = r.xr.enabled;
  r.xr.enabled = false;
  // each station gives a main picture and a second view from another side (used by the retry form of the challenge)
  const shots = [];
  for (const [key, st] of Object.entries(stations)) {
    const th = st.thumb || { cam: [0, 2.2, 4], target: [0, 0.4, 0], t: 1 };
    shots.push({ name: key, key, st, th, turn: 0 });
    shots.push({ name: key + '2', key, st, th, turn: (alt[key] ?? 0.65) });
  }
  for (const { name, key, st, th, turn } of shots) {
    show(key);
    st.setProgress(th.t ?? 1);
    st.update?.(0.016, 3);
    st.group.updateMatrixWorld(true);
    const target = new THREE.Vector3(...th.target), eye = new THREE.Vector3(...th.cam).sub(target);
    eye.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).multiplyScalar(turn ? 1.08 : 1).add(target);
    cam.position.copy(st.group.localToWorld(eye));
    cam.lookAt(st.group.localToWorld(target));
    cam.updateMatrixWorld(true);
    r.setRenderTarget(rt);
    r.clear();
    r.render(engine.scene, cam);
    r.readRenderTargetPixels(rt, 0, 0, w * scale, h * scale, px);
    const img = bctx.createImageData(w * scale, h * scale);
    // flip vertically (GL origin is bottom-left)
    const row = w * scale * 4;
    for (let y = 0; y < h * scale; y++) img.data.set(px.subarray((h * scale - 1 - y) * row, (h * scale - y) * row), y * row);
    bctx.putImageData(img, 0, 0);
    const c = mkCanvas(w, h), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(big, 0, 0, w, h);
    out[name] = c;
    st.setProgress(0);
  }
  r.setRenderTarget(null);
  r.xr.enabled = prevXR;
  rt.dispose();
  restore?.();
  return out;
}

/**
 * Render stand-alone quiz scenes (vignettes) once, each in its own little scene (then they are dropped).
 * list: [{ id, group, cam, target, fov, sky }] → { id: canvas }
 */
export function renderScenes(engine, list, addLights, { w = 640, h = 480 } = {}) {
  const r = engine.renderer, scale = 2, out = {};
  const rt = new THREE.WebGLRenderTarget(w * scale, h * scale, { depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const px = new Uint8Array(w * scale * h * scale * 4);
  const big = mkCanvas(w * scale, h * scale), bctx = big.getContext('2d');
  const prevXR = r.xr.enabled;
  r.xr.enabled = false;
  for (const v of list) {
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(v.sky || '#bfe3f4');
      addLights(scene);
      scene.fog = null;
      scene.add(v.group);
      const cam = new THREE.PerspectiveCamera(v.fov || 50, w / h, 0.05, 400);
      cam.position.set(...v.cam);
      cam.lookAt(new THREE.Vector3(...v.target));
      scene.updateMatrixWorld(true);
      r.setRenderTarget(rt);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, w * scale, h * scale, px);
      const img = bctx.createImageData(w * scale, h * scale), row = w * scale * 4;
      for (let y = 0; y < h * scale; y++) img.data.set(px.subarray((h * scale - 1 - y) * row, (h * scale - y) * row), y * row);
      bctx.putImageData(img, 0, 0);
      const c = mkCanvas(w, h), ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(big, 0, 0, w, h);
      out[v.id] = c;
      scene.remove(v.group);
    } catch (e) { console.error('vignette failed', v.id, e); }
  }
  r.setRenderTarget(null);
  r.xr.enabled = prevXR;
  rt.dispose();
  return out;
}
