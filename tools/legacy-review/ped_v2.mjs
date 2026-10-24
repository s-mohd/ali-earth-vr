// Pedagogy review: capture V2 stations (before, mid, end), practice, quiz and results.
import { chromium } from 'playwright';
const W = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad/ali';
const S = W + '/shots/ped_v2_';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto('file://' + W + '/ref/v2.html');
await page.waitForFunction(() => window.__ali && document.getElementById('startScreen'), null, { timeout: 90000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: S + '00_intro.png' });
await page.click('#startScreen');
const wait = (ms) => page.waitForTimeout(ms);
await wait(3000); await page.screenshot({ path: S + '01_hub.png' });
const B = (n) => page.evaluate((n) => window.__ali.buttons[n].click(), n);
const ST = (i, k) => page.evaluate(([i, k]) => window.__ali.stations[i][k], [i, k]);
for (let i = 0; i < 5; i++) {
  await page.evaluate((i) => window.__ali.goTo(i), i); await wait(2500);
  await page.screenshot({ path: S + `s${i + 1}_a_before.png` });
  await B('bPlay');
  await page.waitForFunction((i) => window.__ali.stations[i].t >= 0.55, i, { timeout: 120000 });
  await page.screenshot({ path: S + `s${i + 1}_b_mid.png` });
  await page.waitForFunction((i) => window.__ali.stations[i].played, i, { timeout: 120000 });
  await wait(1200); await page.screenshot({ path: S + `s${i + 1}_c_end.png` });
  if (i === 2 || i === 3) {
    await B('bNext'); await wait(1500); await page.screenshot({ path: S + `s${i + 1}_d_practice.png` });
    const wrong = i === 2 ? 1 : 0;
    await page.evaluate((k) => window.__ali.practiceCards[k].userData && 0, wrong);
    await page.evaluate((k) => { const c = window.__ali.practiceCards[k]; (c.onClick || c.opts?.onClick || c.click).call(c); }, wrong).catch(e => console.log('practice click err', e.message));
    await wait(1200); await page.screenshot({ path: S + `s${i + 1}_e_practice_wrong.png` });
  }
  if (i === 4) { await B('bBefore'); await wait(800); await page.screenshot({ path: S + 's5_f_before_cmp.png' }); }
}
await page.evaluate(() => window.__ali.goTo('hall')); await wait(2500);
await page.screenshot({ path: S + 'h0_hall.png' });
await B('qStart'); await wait(2000);
const answers = [1, 0, 0, 0, 2];
for (let q = 0; q < 5; q++) {
  await page.screenshot({ path: S + `q${q + 1}_a.png` });
  await page.evaluate((k) => { const c = window.__ali.quizCards[k]; (c.onClick || c.opts?.onClick || c.click).call(c); }, answers[q]).catch(e => console.log('quiz click err', e.message));
  await wait(1200); await page.screenshot({ path: S + `q${q + 1}_b_feedback.png` });
  await B('qNext'); await wait(1500);
}
await wait(2500); await page.screenshot({ path: S + 'r_results.png' });
console.log(JSON.stringify(await page.evaluate(() => ({ score: window.__ali.score(), state: window.__ali.state }))).slice(0, 600));
console.log(logs.filter(l => /error|PAGEERROR/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
