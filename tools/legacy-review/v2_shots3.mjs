// Third pass: earthquake end state looking down, Ali's feet in the hub, and depth checks of blob shadows / weathering ring.
import { chromium } from 'playwright';
const W = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad/ali';
const OUT = W + '/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('file://' + W + '/ref/v2.html');
await page.waitForFunction(() => !document.getElementById('intro').hidden, null, { timeout: 60000 });
await page.click('#startScreen');
const settle = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
await settle(4000);
// Ali's feet in the hub
await page.evaluate(() => { window.__ali.look.yaw = -0.58; window.__ali.look.pitch = -0.38; });
await settle(2500);
await shot('v2_hub_ali_feet');
// world-space heights: Ali root vs plaza top, blob y vs platform top
const h = await page.evaluate(() => {
  const A = window.__ali; let root = A.stations[0].D; while (root.parent) root = root.parent; root.updateWorld(null);
  const find = (n, name) => { if (n.name === name) return n; for (const c of n.children) { const r = find(c, name); if (r) return r; } return null; };
  const ali = find(root, 'ali');
  return { aliRootY_hub: +ali.world[13].toFixed(3) };
});
console.log('heights', JSON.stringify(h));
// earthquake final state from the pad, looking down at the near cracks
await page.evaluate(() => window.__ali.goTo(0));
await page.waitForFunction(() => window.__ali.place === 0);
await settle(4000);
await page.evaluate(() => { window.__ali.stations[0].apply(1); window.__ali.look.yaw = 0; window.__ali.look.pitch = -0.32; });
await settle(2000);
await shot('v2_st1_after_down');
await browser.close();
