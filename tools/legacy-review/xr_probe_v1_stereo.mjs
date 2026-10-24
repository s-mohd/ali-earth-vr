// Probe Version 1 inside an emulated Meta Quest 2 WebXR session (IWER), headset at child eye height.
// Usage: node xr_probe_v1.mjs <eyeHeight=1.2>
import { chromium } from 'playwright';
import fs from 'node:fs';
const ROOT = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad';
const W = ROOT + '/ali';
const EYE = Number(process.argv[2] || 1.2);
const iwer = fs.readFileSync(ROOT + '/xremu/node_modules/iwer/build/iwer.min.js', 'utf8');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.addInitScript({ content: iwer + `;(function(){ const d = new IWER.XRDevice(IWER.metaQuest2, { stereoEnabled: true }); d.position.set(0, ${EYE}, 0); d.installRuntime({ forceInstall: true }); window.__xrdev = d; })();` });
await page.goto('file://' + W + '/ref/v1.html?test&speed=4');
await page.waitForFunction(() => window.__ali && window.__ali.game, null, { timeout: 120000 });
await page.waitForTimeout(1500);

// helper installed in page
await page.evaluate(() => {
  const S = window.__ali.services, g = window.__ali.game;
  const V3 = S.camera.position.constructor;
  window.__probe = {
    waitIdle: async () => { for (let i = 0; i < 400; i++) { await new Promise(r => setTimeout(r, 50)); if (!g.busy) return true; } return false; },
    frameInfo: () => { const r = S.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, texs: r.memory.textures, programs: r.programs ? r.programs.length : null }; },
    head: () => S.camera.getWorldPosition(new V3()),
    stats: () => {
      const scene = S.scene; let meshes = 0, visMeshes = 0, std = 0, basic = 0, other = 0, transp = 0, shadowCasters = 0, tris = 0; const canv = new Map(); const mats = new Set();
      scene.traverse(o => {
        if (!o.isMesh && !o.isLine && !o.isPoints) return; meshes++;
        let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { mats.add(m); const img = m.map && m.map.image; if (img && (img instanceof HTMLCanvasElement || img instanceof OffscreenCanvas)) canv.set(m.map.uuid, [img.width, img.height]); }
        if (!vis) return; visMeshes++;
        const m = ms[0]; if (m.isMeshStandardMaterial) std++; else if (m.isMeshBasicMaterial) basic++; else other++;
        if (m.transparent) transp++; if (o.castShadow) shadowCasters++;
        const gg = o.geometry; if (gg) { const n = gg.index ? gg.index.count : (gg.attributes.position ? gg.attributes.position.count : 0); tris += (o.isInstancedMesh ? o.count : 1) * n / 3; }
      });
      let texBytes = 0, maxTex = 0; for (const [, [w, h]] of canv) { texBytes += w * h * 4 * 4 / 3; maxTex = Math.max(maxTex, w, h); }
      return { meshes, visMeshes, std, basic, other, transp, shadowCasters, trisVisibleApprox: Math.round(tris), materials: mats.size, canvasTextures: canv.size, canvasTexMB: +(texBytes / 1048576).toFixed(1), maxCanvasDim: maxTex };
    },
    targets: () => {
      const I = S.interaction, head = window.__probe.head(); const out = [];
      for (const [mesh, h] of I.items) {
        if (!I.isActive(h)) continue;
        mesh.updateWorldMatrix(true, false);
        const gg = mesh.geometry; if (!gg.boundingBox) gg.computeBoundingBox();
        const bb = gg.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        const c = bb.getCenter(new V3()), sz = bb.getSize(new V3());
        const d = c.distanceTo(head); const hgt = sz.y; const wid = Math.max(sz.x, sz.z);
        out.push({ id: h.id, dist: +d.toFixed(2), centerY: +c.y.toFixed(2), headY: +head.y.toFixed(2), elevDeg: +(Math.atan2(c.y - head.y, Math.hypot(c.x - head.x, c.z - head.z)) * 57.3).toFixed(1), hDeg: +(2 * Math.atan(hgt / 2 / d) * 57.3).toFixed(1), wDeg: +(2 * Math.atan(wid / 2 / d) * 57.3).toFixed(1), h_m: +hgt.toFixed(2), w_m: +wid.toFixed(2) });
      }
      return out;
    },
    textPanels: () => { // canvas-textured meshes visible: world size, texel density, distance
      const head = window.__probe.head(); const out = [];
      S.scene.traverse(o => {
        if (!o.isMesh) return; let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; } if (!vis) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material; const img = m.map && m.map.image; if (!(img instanceof HTMLCanvasElement)) return;
        o.updateWorldMatrix(true, false); const gg = o.geometry; if (!gg.boundingBox) gg.computeBoundingBox();
        const ws = new V3(); o.matrixWorld.decompose(new V3(), o.quaternion.clone(), ws);
        const gs = gg.boundingBox.getSize(new V3()); const wm = Math.abs(gs.x * ws.x), hm = Math.abs(gs.y * ws.y);
        const c = new V3().setFromMatrixPosition(o.matrixWorld); const d = c.distanceTo(head);
        if (d > 25) return;
        out.push({ name: o.name || o.parent?.name || '', canvas: img.width + 'x' + img.height, w_m: +wm.toFixed(2), h_m: +hm.toFixed(2), dist: +d.toFixed(2), ppm: Math.round(img.width / wm), texelsPerDeg: +(img.width / wm * d * Math.PI / 180).toFixed(1) });
      });
      return out.sort((a, b) => a.dist - b.dist).slice(0, 14);
    },
    bubbleCheck: () => { // is the speech bubble facing the head?
      const b = g.bubble; if (!b.visible) return null; const head = window.__probe.head();
      b.updateWorldMatrix(true, false); const bp = new V3().setFromMatrixPosition(b.matrixWorld);
      const n = new V3(0, 0, 1).applyQuaternion(b.getWorldQuaternion(S.camera.quaternion.clone()));
      const toHead = head.clone().sub(bp).normalize();
      return { bubblePos: bp.toArray().map(v => +v.toFixed(2)), headPos: head.toArray().map(v => +v.toFixed(2)), facingDot: +n.dot(toHead).toFixed(2), distToHead: +bp.distanceTo(head).toFixed(2) };
    },
    aliCheck: () => { const a = g.ali; const head = window.__probe.head(); const ap = a.getWorldPosition(new V3()); const fwd = new V3(0, 0, 1).applyQuaternion(a.getWorldQuaternion(S.camera.quaternion.clone())); fwd.y = 0; fwd.normalize(); const to = head.clone().sub(ap); to.y = 0; to.normalize(); const bb = new (S.scene.children.find(o => o.isMesh)?.geometry?.boundingBox?.constructor || Object)(); return { aliToHeadDot: +fwd.dot(to).toFixed(2), aliDist: +ap.distanceTo(head).toFixed(2) }; },
  };
});

const result = { eye: EYE, desktop: {}, xr: {} };
// Ali height (world units)
result.aliHeight = await page.evaluate(() => { const a = window.__ali.game.ali; const S = window.__ali.services; let minY = 1e9, maxY = -1e9; a.updateWorldMatrix(true, true); a.traverse(o => { if (!o.isMesh) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox.clone().applyMatrix4(o.matrixWorld); minY = Math.min(minY, b.min.y); maxY = Math.max(maxY, b.max.y); }); return +(maxY - minY).toFixed(2); });

const locs = [['welcome', null], ['station', 0], ['station', 1], ['station', 2], ['station', 3], ['station', 4], ['challengeGate', null], ['challenge', 0]];
async function travel(type, index) {
  await page.evaluate(async ([type, index]) => {
    const g = window.__ali.game; await window.__probe.waitIdle();
    if (type === 'welcome') { if (g.location.type !== 'welcome') await g.travel({ type: 'welcome', index: 0 }, { mode: 'fade' }); }
    else if (type === 'station') await g.travel({ type: 'station', index }, { mode: 'fade' });
    else if (type === 'challengeGate') await g.travel({ type: 'challengeGate' }, { mode: 'fade' });
    else if (type === 'challenge') { await g.travel({ type: 'challengeGate' }, { mode: 'fade' }); await window.__probe.waitIdle(); await g.startChallenge(); }
    await window.__probe.waitIdle();
  }, [type, index]);
  await page.waitForTimeout(1200);
}
// desktop pass
for (const [type, index] of locs) {
  await travel(type, index);
  const key = type + (index != null ? ':' + index : '');
  result.desktop[key] = await page.evaluate(() => ({ info: window.__probe.frameInfo(), stats: window.__probe.stats() }));
}
// enter VR
await travel('welcome', null);
const entered = await page.evaluate(async () => { const g = window.__ali.game; await g.enterVR(); await new Promise(r => setTimeout(r, 1500)); return { presenting: window.__ali.services.renderer.xr.isPresenting, vrActive: g.vrActive, refSpace: !!window.__ali.services.renderer.xr.getReferenceSpace(), foveation: window.__ali.services.renderer.xr.getFoveation(), hudHidden: document.querySelector('#hud, .hud, [class*=hud]')?.className || null }; });
result.xrEnter = entered;
for (const [type, index] of locs) {
  await travel(type, index);
  const key = type + (index != null ? ':' + index : '');
  result.xr[key] = await page.evaluate(() => ({ info: window.__probe.frameInfo(), player: window.__ali.services.game.player.position.toArray().map(v => +v.toFixed(2)), head: window.__probe.head().toArray().map(v => +v.toFixed(2)), targets: window.__probe.targets(), text: window.__probe.textPanels(), bubble: window.__probe.bubbleCheck(), ali: window.__probe.aliCheck() }));
  await page.screenshot({ path: W + '/shots/xr_v1s_' + key.replace(':', '_') + '.png' });
}
fs.writeFileSync(W + '/tools/xr_probe_v1_stereo.json', JSON.stringify(result, null, 1));
console.log(JSON.stringify({ aliHeight: result.aliHeight, xrEnter: result.xrEnter }, null, 1));
console.log(logs.filter(l => !l.startsWith('log')).slice(0, 20).join('\n'));
await browser.close();
