// Drives ref/v2.html headlessly and captures review screenshots + engine stats.
import { chromium } from 'playwright';
import fs from 'fs';
const W = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad/ali';
const OUT = W + '/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
const t0 = Date.now();
await page.goto('file://' + W + '/ref/v2.html');
await page.waitForFunction(() => !document.getElementById('intro').hidden, null, { timeout: 60000 });
console.log('intro visible after', Date.now() - t0, 'ms');
await page.click('#startScreen');
const settle = (ms = 1200) => page.waitForTimeout(ms);
const waitPlace = (p) => page.waitForFunction((p) => window.__ali.place === p, p, { timeout: 30000 });
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

// fps estimate
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 2000) requestAnimationFrame(f); else r(n / ((performance.now() - s) / 1000)); }; requestAnimationFrame(f); }));
console.log('headless fps ~', fps.toFixed(1));

await settle(1500);
await shot('v2_hub');
// hub looking down at the angled control
await page.evaluate(() => { window.__ali.look.pitch = -0.75; });
await settle(600);
await shot('v2_hub_down');
await page.evaluate(() => { window.__ali.look.pitch = -0.14; });

// engine stats
const stats = await page.evaluate(() => {
  const A = window.__ali;
  return { drawCalls: A.drawCalls() };
});
console.log('stats', JSON.stringify(stats));

for (let i = 0; i < 5; i++) {
  await page.evaluate((i) => window.__ali.goTo(i), i);
  await waitPlace(i);
  await page.evaluate(() => { window.__ali.look.yaw = 0; window.__ali.look.pitch = -0.14; });
  await settle(1500);
  await shot(`v2_st${i + 1}_before`);
  const dur = await page.evaluate((i) => window.__ali.stations[i].duration, i);
  await page.evaluate(() => window.__ali.buttons.bPlay.click());
  // mid-animation frame
  const mid = await page.waitForFunction((i) => window.__ali.stations[i].t >= 0.5 || window.__ali.stations[i].played, i, { timeout: 120000 }).then(() => true).catch(() => false);
  if (mid) await shot(`v2_st${i + 1}_mid`);
  const s = Date.now();
  const ok = await page.waitForFunction((i) => window.__ali.stations[i].played, i, { timeout: 180000 }).then(() => true).catch(() => false);
  console.log(`station ${i + 1} duration ${dur}s, finished=${ok} in ${(Date.now() - s) / 1000}s after mid`);
  await settle(1500);
  await shot(`v2_st${i + 1}_after`);
  if (i === 4) {
    // before/after compare easel + buttons; look left a bit
    await page.evaluate(() => { window.__ali.look.yaw = 0.35; window.__ali.look.pitch = -0.3; });
    await settle(800);
    await shot('v2_st5_compare');
    await page.evaluate(() => window.__ali.buttons.bBefore.click());
    await settle(800);
    await shot('v2_st5_compare_before');
    await page.evaluate(() => { window.__ali.look.yaw = 0; window.__ali.look.pitch = -0.14; });
  }
  if (i === 2) {
    await page.evaluate(() => window.__ali.buttons.bNext.click()); // opens practice
    await settle(1200);
    await shot('v2_practice');
    // answer wrong to see feedback
    await page.evaluate(() => window.__ali.practiceCards[1].click());
    await settle(1200);
    await shot('v2_practice_answered');
    await page.evaluate(() => window.__ali.buttons.practiceGo.click());
    await waitPlace(3);
    // goTo(3) handled by practice continue; next loop iteration calls goTo(3) again (busy-guarded)
    await settle(800);
  }
  if (i === 3) {
    await page.evaluate(() => window.__ali.buttons.bNext.click());
    await settle(1200);
    await shot('v2_practice2');
    await page.evaluate(() => window.__ali.practiceCards[1].click());
    await settle(600);
    await page.evaluate(() => window.__ali.buttons.practiceGo.click());
    await waitPlace(4);
    await settle(600);
  }
}

// challenge hall
await page.evaluate(() => window.__ali.goTo('hall'));
await waitPlace('hall');
await page.evaluate(() => { window.__ali.look.yaw = 0; window.__ali.look.pitch = -0.14; });
await settle(1200);
await shot('v2_hall_intro');
await page.evaluate(() => window.__ali.buttons.qStart.click());
await settle(1500);
await shot('v2_quiz');
// Q1 answer wrong (0), then correct for rest
const answers = [0, 2, 0, 1, 2];
for (let q = 0; q < 5; q++) {
  if (q === 1) { await settle(1200); await shot('v2_quiz_q2'); }
  await page.evaluate((k) => window.__ali.quizCards[k].click(), answers[q]);
  await settle(700);
  if (q === 0) await shot('v2_quiz_answered');
  await page.evaluate(() => window.__ali.buttons.qNext.click());
  await settle(400);
}
await settle(3500);
await shot('v2_results');
console.log('score', await page.evaluate(() => window.__ali.score()));
await page.evaluate(() => { window.__ali.look.pitch = -0.6; });
await settle(500);
await shot('v2_results_down');

// tablet portrait + phone viewport check
await page.setViewportSize({ width: 820, height: 1180 });
await page.evaluate(() => { window.__ali.look.pitch = -0.14; window.__ali.goTo(0); });
await waitPlace(0);
await settle(1500);
await shot('v2_tablet_st1');

fs.writeFileSync(OUT + '/v2_logs.txt', logs.join('\n'));
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
