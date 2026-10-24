// Probe Version 2 inside an emulated Meta Quest 2 WebXR session (IWER), headset at child eye height.
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
await page.goto('file://' + W + '/ref/v2.html');
await page.waitForFunction(() => window.__ali && !document.getElementById('intro').hidden, null, { timeout: 120000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const A = window.__ali, { m4, v3 } = window.M3;
  let root = window.UIK.UI.targets[0]; while (root.parent) root = root.parent;
  const head = () => [A.rig.pos[0], A.rig.pos[1] + EYE_H, A.rig.pos[2]];
  window.__probe = {
    root,
    stats: () => {
      let meshes = 0, vis = 0, transp = 0, textured = 0, unlit = 0, tris = 0; const canv = new Map(); let rts = 0;
      root.traverse(n => { if (!n.geometry) return; meshes++; if (!n.shown()) return; vis++; const m = n.material; if (m.transparent) transp++; if (m.map) textured++; if (m.unlit) unlit++; const g = n.geometry; const c = g.drawCount == null ? g.count : Math.min(g.drawCount, g.count); tris += c / 3; });
      root.traverse(n => { const m = n.material; if (m && m.map) { if (m.map.canvas) canv.set(m.map, [m.map.canvas.width, m.map.canvas.height]); else if (m.map.rt) canv.set(m.map, [m.map.rt.w, m.map.rt.h]); } });
      let bytes = 0, maxDim = 0; for (const [, [w, h]] of canv) { bytes += w * h * 4 * 4 / 3; maxDim = Math.max(maxDim, w, h); }
      return { meshes, visMeshes: vis, drawCallsPerEye: A.drawCalls(), drawCallsStereo: A.drawCalls() * 2, transparentVisible: transp, texturedVisible: textured, unlitVisible: unlit, trisPerEye: Math.round(tris), textures: canv.size, texMB: +(bytes / 1048576).toFixed(1), maxTexDim: maxDim };
    },
    targets: () => {
      const h = head(); const out = [];
      for (const b of window.UIK.UI.targets) {
        if (!b.shown()) continue; const ctl = b.userData.ctl; if (!ctl || !ctl.enabled) continue;
        const g = b.geometry; const W_ = b.world; const c = m4.point(W_, [(g.bmin[0] + g.bmax[0]) / 2, (g.bmin[1] + g.bmax[1]) / 2, (g.bmin[2] + g.bmax[2]) / 2]);
        const sx = Math.hypot(W_[0], W_[1], W_[2]), sy = Math.hypot(W_[4], W_[5], W_[6]);
        const wm = (g.bmax[0] - g.bmin[0]) * sx, hm = (g.bmax[1] - g.bmin[1]) * sy; const d = Math.hypot(c[0] - h[0], c[1] - h[1], c[2] - h[2]);
        out.push({ label: ctl.label || ctl.text || '', dist: +d.toFixed(2), centerY: +c[1].toFixed(2), elevDeg: +(Math.atan2(c[1] - h[1], Math.hypot(c[0] - h[0], c[2] - h[2])) * 57.3).toFixed(1), azDeg: null, hDeg: +(2 * Math.atan(hm / 2 / d) * 57.3).toFixed(1), wDeg: +(2 * Math.atan(wm / 2 / d) * 57.3).toFixed(1), w_m: +wm.toFixed(2), h_m: +hm.toFixed(2) });
      }
      return out;
    },
    text: () => {
      const h = head(); const out = [];
      root.traverse(n => { if (!n.geometry || !n.shown()) return; const m = n.material; if (!m.map || !m.map.canvas) return; const g = n.geometry; const W_ = n.world; const sx = Math.hypot(W_[0], W_[1], W_[2]); const wm = (g.bmax[0] - g.bmin[0]) * sx; const c = [W_[12], W_[13], W_[14]]; const d = Math.hypot(c[0] - h[0], c[1] - h[1], c[2] - h[2]); if (d > 8) return; out.push({ canvas: m.map.canvas.width + 'x' + m.map.canvas.height, w_m: +wm.toFixed(2), dist: +d.toFixed(2), centerY: +c[1].toFixed(2), ppm: Math.round(m.map.canvas.width / wm), texelsPerDeg: +(m.map.canvas.width / wm * d * Math.PI / 180).toFixed(1) }); });
      return out.sort((a, b) => a.dist - b.dist).slice(0, 12);
    },
    head,
  };
}, null);
await page.evaluate((e) => { window.EYE_H = e; }, EYE);
await page.evaluate(() => { /* make EYE_H visible to closures */ });

const result = { eye: EYE, xr: {} };
// Ali height
result.aliHeight = await page.evaluate(() => { let root = window.__probe.root; let ali = null; root.traverse(n => { if (n.userData && n.userData.bubble && n.userData.arms) ali = n; }); if (!ali) return null; let minY = 1e9, maxY = -1e9; ali.traverse(n => { if (!n.geometry || n === ali.userData.bubble.face || (n.parent === ali.userData.bubble)) return; let p = n; while (p) { if (p === ali.userData.bubble) return; p = p.parent; } const g = n.geometry, Wm = n.world; for (const y of [g.bmin[1], g.bmax[1]]) for (const x of [g.bmin[0], g.bmax[0]]) for (const z of [g.bmin[2], g.bmax[2]]) { const wy = Wm[1] * x + Wm[5] * y + Wm[9] * z + Wm[13]; minY = Math.min(minY, wy); maxY = Math.max(maxY, wy); } }); return +(maxY - minY).toFixed(2); });
// Enter VR from the start card
await page.click('#startVR');
await page.waitForTimeout(2500);
result.xrEnter = await page.evaluate(() => ({ inVR: document.body.classList.contains('in-vr'), introHidden: document.getElementById('intro').hidden }));
const places = ['hub', 0, 1, 2, 3, 4, 'hall'];
for (const p of places) {
  await page.evaluate((p) => window.__ali.goTo(p), p);
  await page.waitForTimeout(2200);
  result.xr[String(p)] = await page.evaluate(() => ({ place: window.__ali.place, rig: window.__ali.rig, stats: window.__probe.stats(), targets: window.__probe.targets(), text: window.__probe.text() }));
  await page.screenshot({ path: W + '/shots/xr_v2_' + p + '.png' });
}
// practice at station 0 and quiz question 1 + results
await page.evaluate(() => window.__ali.goTo(0)); await page.waitForTimeout(2200);
await page.evaluate(() => { const s = window.__ali.stations[0]; s.played = true; window.__ali.buttons.bNext.click(); });
await page.waitForTimeout(1200);
result.xr.practice0 = await page.evaluate(() => ({ place: window.__ali.place, stats: window.__probe.stats(), targets: window.__probe.targets(), text: window.__probe.text() }));
await page.screenshot({ path: W + '/shots/xr_v2_practice0.png' });
await page.evaluate(() => window.__ali.goTo('hall')); await page.waitForTimeout(2200);
await page.evaluate(() => window.__ali.buttons.qStart.click()); await page.waitForTimeout(1500);
result.xr.quiz1 = await page.evaluate(() => ({ stats: window.__probe.stats(), targets: window.__probe.targets(), text: window.__probe.text() }));
await page.screenshot({ path: W + '/shots/xr_v2_quiz1.png' });
fs.writeFileSync(W + '/tools/xr_probe_v2.json', JSON.stringify(result, null, 1));
console.log(JSON.stringify({ aliHeight: result.aliHeight, xrEnter: result.xrEnter }));
console.log(logs.filter(l => !l.startsWith('log')).slice(0, 20).join('\n'));
await browser.close();
