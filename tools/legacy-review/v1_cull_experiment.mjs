// Measures how much draw-call/triangle load in V1 comes from off-screen-but-drawn zones and shadows.
import { chromium } from 'playwright';
import path from 'node:path';
const W = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('file://' + path.join(W, 'ref/v1.html') + '?test&speed=4');
await page.waitForFunction(() => !!window.__ali, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__ali.game.start());
await page.waitForFunction(() => window.__ali.state().location.type === 'station' && !window.__ali.state().busy, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const frame = (label) => page.evaluate((label) => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const i = window.__ali.services.renderer.info; r({ label, calls: i.render.calls, tris: i.render.triangles });
}))), label);
const res = [];
res.push(await frame('station1 as shipped'));
// VR-like wide view from the VR stand point (fov 100, square)
await page.evaluate(() => {
  const g = window.__ali.game; g.rig.update = () => {};
  const v = g.viewFor(g.location); const s = v.target.clone().lerp(v.pos, 0.72); s.y = g.world.heightAt(s.x, s.z) + 1.25;
  g.camera.position.copy(s); g.camera.fov = 100; g.camera.aspect = 1; g.camera.updateProjectionMatrix(); const t = v.target.clone(); t.y = s.y; g.camera.lookAt(t);
});
res.push(await frame('station1 VR stand point, fov100 (one eye)'));
await page.evaluate(() => {
  const g = window.__ali.game;
  g.stations.forEach((s, i) => { if (i !== 0) s.root.visible = false; });
  g.hall.root.visible = false; g.results.root.visible = false;
  g.scene.getObjectByName('adventure-gate').visible = false;
});
res.push(await frame('+ hide other 4 stations, hall, results, gate'));
await page.evaluate(() => { window.__ali.services.renderer.shadowMap.autoUpdate = false; });
res.push(await frame('+ no shadow pass'));
await page.evaluate(() => { window.__ali.game.ali.traverse((o) => { if (o.name === 'outline') o.visible = false; }); });
res.push(await frame('+ no Ali outlines'));
console.log(JSON.stringify(res, null, 1));
await browser.close();
