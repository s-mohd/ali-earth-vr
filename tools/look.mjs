// Look at places in the built game from the child's pad: node tools/look.mjs <html> <outdir> [--places quake,volcano] [--after] [--t 0,0.5,1]
//   [--xr] (emulated Quest 2 via IWER, one eye shown) [--eye 1.2] [--light hemi,sun] [--tag _x]. Prints draw calls/triangles per place.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = path.resolve(argv[0]), OUT = path.resolve(argv[1]);
const places = opt('places', 'hub,quake,volcano,weather,erosion,human,hall').split(',');
const XR = argv.includes('--xr'), AFTER = argv.includes('--after'), light = opt('light', null), tag = opt('tag', '');
const TS = opt('t', null)?.split(',').map(Number) || null;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: XR ? { width: 1600, height: 800 } : { width: 1280, height: 800 } });
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('console.error ' + m.text().slice(0, 300)); });
if (XR) {
  const iwer = fs.readFileSync(path.join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8');
  await page.addInitScript({ content: iwer + `;(function(){ const d = new IWER.XRDevice(IWER.metaQuest2); d.position.set(0, ${Number(opt('eye', 1.2))}, 0); d.installRuntime({ forceInstall: true }); window.__xrdev = d; })();` });
}
await page.goto('file://' + file + '?test&speed=20');
await page.waitForFunction(() => window.__ali?.ready, null, { timeout: 180000 });
await page.evaluate(([light, xr]) => {
  const g = window.__ali.game;
  if (light) { const [h, s] = light.split(',').map(Number); g.lights.hemi.intensity = h; g.lights.sun.intensity = s; }
  g.started = true; // skip scripts: we only want to look
  if (xr) g.engine.enterVR();
  g.shell.hideStart?.();
  document.querySelectorAll('.toolbar,.hud,.caption,[class*=toolbar],[class*=status],[class*=caption]').forEach((e) => (e.style.display = 'none'));
}, [light, XR]);
if (XR) await page.waitForFunction(() => window.__ali.engine.presenting, null, { timeout: 20000 });
const stats = {};
for (const p of places) {
  await page.evaluate((p) => window.__ali.game.goTo(p, { script: false }), p);
  await page.waitForFunction(() => !window.__ali.game.busy, null, { timeout: 20000 });
  await page.evaluate((after) => { const g = window.__ali.game, z = g.zones[g.place]; if (after && z._setShowing) { z.revealed = true; z._setShowing('after'); z.drawBoard?.('done'); } g.bubble.hide(); }, AFTER);
  await page.waitForTimeout(1500);
  if (TS && !['hub', 'hall'].includes(p)) {
    for (const t of TS) {
      await page.evaluate((t) => { const g = window.__ali.game, z = g.zones[g.place]; z.st.setProgress(t); for (let i = 0; i < 6; i++) z.st.update?.(1 / 30, i / 30); }, t);
      await page.waitForTimeout(600);
      stats[`${p}@${t}`] = await page.evaluate(() => window.__ali.info());
      await page.screenshot({ path: path.join(OUT, `${p}${tag}_t${t}.png`) });
    }
    continue;
  }
  stats[p] = await page.evaluate(() => window.__ali.info());
  await page.screenshot({ path: path.join(OUT, `${p}${tag}.png`) });
}
console.log(JSON.stringify({ stats, logs: logs.slice(0, 20) }, null, 1));
await browser.close();
