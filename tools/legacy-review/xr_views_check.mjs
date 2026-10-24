// Check how many XR views three renders per frame under IWER (mono vs stereo) and resulting draw calls.
import { chromium } from 'playwright';
import fs from 'node:fs';
const ROOT = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad';
const W = ROOT + '/ali';
const iwer = fs.readFileSync(ROOT + '/xremu/node_modules/iwer/build/iwer.min.js', 'utf8');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const stereo of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
  await page.addInitScript({ content: iwer + `;(function(){ const d = new IWER.XRDevice(IWER.metaQuest2, { stereoEnabled: ${stereo} }); d.position.set(0, 1.2, 0); d.installRuntime({ forceInstall: true }); })();` });
  await page.goto('file://' + W + '/ref/v1.html?test&speed=4');
  await page.waitForFunction(() => window.__ali && window.__ali.game, null, { timeout: 120000 });
  const r = await page.evaluate(async () => {
    const S = window.__ali.services, g = window.__ali.game; await g.enterVR(); await new Promise(r => setTimeout(r, 2500));
    const R = S.renderer; const samples = [];
    const orig = R.render.bind(R); let n = 0;
    R.render = (s, c) => { orig(s, c); n++; samples.push({ calls: R.info.render.calls, tris: R.info.render.triangles, views: R.xr.getCamera().cameras.length }); };
    await new Promise(r => setTimeout(r, 2500)); R.render = orig;
    const sh = S.scene.getObjectByProperty('isDirectionalLight', true);
    return { renders: n, last: samples.slice(-3), shadowAutoUpdate: R.shadowMap.autoUpdate };
  });
  console.log('stereo', stereo, JSON.stringify(r));
  await page.close();
}
await browser.close();
