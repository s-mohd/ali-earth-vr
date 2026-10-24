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
await page.addInitScript({ content: iwer + `;(function(){ const d = new IWER.XRDevice(IWER.metaQuest2); d.position.set(0, ${EYE}, 0); d.installRuntime({ forceInstall: true }); window.__xrdev = d; })();` });
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

// Flow probe: practice (station 3 weathering), challenge question, results — all inside the emulated VR session.
const res = {};
const snap = () => page.evaluate(() => ({ loc: JSON.stringify(window.__ali.game.location), phase: window.__ali.game.currentStation?.()?.phase ?? null, player: window.__ali.services.game.player.position.toArray().map(v => +v.toFixed(2)), targets: window.__probe.targets(), text: window.__probe.textPanels().slice(0, 6), bubble: window.__probe.bubbleCheck(), info: window.__probe.frameInfo() }));
await page.evaluate(async () => { const g = window.__ali.game; await g.enterVR(); await new Promise(r => setTimeout(r, 1000)); });
await page.evaluate(async () => { const g = window.__ali.game; await g.travel({ type: 'station', index: 2 }, { mode: 'fade' }); await window.__probe.waitIdle(); });
await page.waitForTimeout(800);
const t0 = Date.now();
await page.evaluate(() => { const g = window.__ali.game; g.onWatch(g.stations[2]); });
res.playing = await snap();
await page.waitForFunction(() => { const s = window.__ali.game.currentStation(); return s && s.phase === 'practice' && window.__ali.services.interaction.listActiveIds().some(i => /practice|opt|answer/i.test(i)); }, null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1500);
res.practiceAfterMs = Date.now() - t0;
res.practice = await snap();
await page.screenshot({ path: W + '/shots/xr_v1_practice_weathering.png' });
// challenge
await page.evaluate(async () => { const g = window.__ali.game; g.progress.stationsDone = [true, true, true, true, true]; g.progress.practiceDone = { weathering: true, erosion: true }; await g.travel({ type: 'challengeGate' }, { mode: 'fade' }); await window.__probe.waitIdle(); await g.startChallenge(); await window.__probe.waitIdle(); });
await page.waitForTimeout(2500);
res.challenge = await snap();
await page.screenshot({ path: W + '/shots/xr_v1_challenge_q1.png' });
// answer all and go to results
for (let i = 0; i < 5; i++) { await page.evaluate(async () => { const g = window.__ali.game; g.onAnswer(0); await new Promise(r => setTimeout(r, 900)); g.onNextQuestion(); await window.__probe.waitIdle(); }); await page.waitForTimeout(900); }
await page.waitForTimeout(2500);
res.results = await snap();
await page.screenshot({ path: W + '/shots/xr_v1_results.png' });
fs.writeFileSync(W + '/tools/xr_probe_v1b.json', JSON.stringify(res, null, 1));
for (const [k, v] of Object.entries(res)) { if (typeof v !== 'object') { console.log(k, v); continue; } console.log('==', k, v.loc, v.phase, 'player', v.player, JSON.stringify(v.info), 'bubble', JSON.stringify(v.bubble)); for (const t of v.targets) console.log('   T', JSON.stringify(t)); for (const t of v.text) console.log('   X', JSON.stringify(t)); }
console.log(logs.filter(l => !l.startsWith('log')).slice(0, 12).join('\n'));
await browser.close();
