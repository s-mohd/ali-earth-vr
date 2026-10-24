// Second pass: clean (post-fade) "before" shots, full results animation, portrait tablet, and scene statistics.
import { chromium } from 'playwright';
import fs from 'fs';
const W = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad/ali';
const OUT = W + '/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto('file://' + W + '/ref/v2.html');
await page.waitForFunction(() => !document.getElementById('intro').hidden, null, { timeout: 60000 });
await page.click('#startScreen');
const settle = (ms) => page.waitForTimeout(ms);
const waitPlace = (p) => page.waitForFunction((p) => window.__ali.place === p, p, { timeout: 30000 });
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

// ---- scene statistics (walk up from a station node to the scene root)
const stats = await page.evaluate(() => {
  const A = window.__ali; let root = A.stations[0].D; while (root.parent) root = root.parent;
  let nodes = 0, meshes = 0, visMeshes = 0, tris = 0, visTris = 0, transparent = 0, textured = 0; const geos = new Set(), mats = new Set(), texs = new Set(); let texPx = 0;
  const big = [];
  const walk = (n, vis) => {
    nodes++; const v = vis && n.visible;
    if (n.geometry && n.material) {
      meshes++; const t = (n.geometry.idx ? n.geometry.idx.length : n.geometry.pos.length / 3) / 3; tris += t; geos.add(n.geometry); mats.add(n.material);
      if (v) { visMeshes++; visTris += t; if (n.material.transparent) transparent++; }
      if (t > 20000) big.push([n.name || '(anon)', Math.round(t)]);
      if (n.material.map && n.material.map.canvas && !texs.has(n.material.map)) { texs.add(n.material.map); texPx += n.material.map.canvas.width * n.material.map.canvas.height; textured++; }
    }
    for (const c of n.children) walk(c, v);
  };
  walk(root, true);
  return { nodes, meshes, visMeshes, transparentVisible: transparent, uniqueGeometries: geos.size, uniqueMaterials: mats.size, tris: Math.round(tris), visTris: Math.round(visTris), canvasTextures: texs.size, canvasTexMPix: +(texPx / 1e6).toFixed(2), bigMeshes: big, drawCalls: A.drawCalls() };
});
console.log('STATS', JSON.stringify(stats));

for (let i = 0; i < 5; i++) {
  await page.evaluate((i) => window.__ali.goTo(i), i);
  await waitPlace(i);
  await page.evaluate(() => { window.__ali.look.yaw = 0; window.__ali.look.pitch = -0.14; });
  await settle(5000);
  await shot(`v2_st${i + 1}_before`);
  if (i === 0) {
    const dc = await page.evaluate(() => window.__ali.drawCalls());
    console.log('drawCalls at station 1', dc);
  }
}
// station 1 after: look down at the road to check the cracks hidden behind the control panel
await page.evaluate(() => { const st = window.__ali.stations[0]; st.apply(1); });
await page.evaluate(() => { window.__ali.look.pitch = -0.32; });
await settle(1500);
await shot('v2_st1_after_down');
// weathering final state, closer look for the dashed ring
await page.evaluate(() => window.__ali.goTo(2));
await waitPlace(2);
await settle(4000);
await page.evaluate(() => { const st = window.__ali.stations[2]; st.apply(1); window.__ali.look.pitch = -0.3; });
await settle(1500);
await shot('v2_st3_after_down');

// hall + results with full animation
await page.evaluate(() => window.__ali.goTo('hall'));
await waitPlace('hall');
await settle(5000);
await shot('v2_hall_intro');
await page.evaluate(() => window.__ali.buttons.qStart.click());
await settle(1000);
for (const k of [1, 2, 0, 1, 2]) {
  await page.evaluate((k) => window.__ali.quizCards[k].click(), k);
  await settle(300);
  await page.evaluate(() => window.__ali.buttons.qNext.click());
  await settle(300);
}
await settle(14000);
await shot('v2_results');
await page.evaluate(() => { window.__ali.look.yaw = 0.45; });
await settle(1500);
await shot('v2_results_badge');

// portrait tablet
await page.setViewportSize({ width: 820, height: 1180 });
await page.evaluate(() => { window.__ali.look.yaw = 0; window.__ali.look.pitch = -0.14; window.__ali.goTo(1); });
await waitPlace(1);
await settle(5000);
await shot('v2_tablet_st2');
// phone landscape
await page.setViewportSize({ width: 844, height: 390 });
await settle(2500);
await shot('v2_phone_st2');

fs.writeFileSync(OUT + '/v2_logs2.txt', logs.join('\n'));
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
