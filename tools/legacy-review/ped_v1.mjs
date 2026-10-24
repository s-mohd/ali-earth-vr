// Pedagogy review: capture V1 stations (mid + end of animation), practice, quiz and results.
import { chromium } from 'playwright';
const W = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad/ali';
const S = W + '/shots/ped_v1_';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto('file://' + W + '/ref/v1.html?test&speed=2');
await page.waitForFunction(() => window.__ali && window.__ali.game, null, { timeout: 90000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: S + '00_welcome.png' });
const wait = (ms) => page.waitForTimeout(ms);
const notBusy = async () => { await page.waitForFunction(() => !window.__ali.game.busy, null, { timeout: 60000 }); await wait(400); };
await page.evaluate(() => window.__ali.game.start());
await wait(3000); await notBusy();
const durs = await page.evaluate(() => window.__ali.game.stations.map(s => s.model?.duration ?? s.duration ?? null));
console.log('durations', JSON.stringify(durs));
for (let i = 0; i < 5; i++) {
  if (i > 0) { await page.evaluate((i) => window.__ali.game.goTo('station:' + i), i); await wait(2500); await notBusy(); }
  await page.screenshot({ path: S + `s${i + 1}_a_intro.png` });
  await page.evaluate((i) => window.__ali.game.onWatch(window.__ali.game.stations[i]), i);
  await page.waitForFunction((i) => { const s = window.__ali.game.stations[i]; return s.time >= s.model.duration * 0.55; }, i, { timeout: 120000 });
  await page.screenshot({ path: S + `s${i + 1}_b_mid.png` });
  await page.waitForFunction(() => !window.__ali.state().stationPlaying, null, { timeout: 120000 });
  await wait(1200); await page.screenshot({ path: S + `s${i + 1}_c_end.png` });
  const st = await page.evaluate(() => JSON.stringify(window.__ali.state()).slice(0, 600));
  console.log('station', i, st);
  const prac = await page.evaluate((i) => !!window.__ali.game.stations[i].def.practice, i);
  if (prac) {
    await wait(2500); await page.screenshot({ path: S + `s${i + 1}_d_practice.png` });
    const correct = i === 2 ? 0 : 1; const wrong = 1 - correct;
    await page.evaluate(([i, k]) => window.__ali.game.onPracticeAnswer(window.__ali.game.stations[i], k), [i, wrong]);
    await wait(600); await page.screenshot({ path: S + `s${i + 1}_e_practice_wrong.png` });
    await wait(1600);
    await page.evaluate(([i, k]) => window.__ali.game.onPracticeAnswer(window.__ali.game.stations[i], k), [i, correct]);
    await wait(900); await page.screenshot({ path: S + `s${i + 1}_f_practice_ok.png` });
  }
  if (i === 4) { await page.evaluate(() => window.__ali.game.onBeforeAfter(window.__ali.game.stations[4])); await wait(800); await page.screenshot({ path: S + `s5_g_beforeafter.png` }); }
}
await page.evaluate(() => window.__ali.game.goTo('challenge')); await wait(3000); await notBusy();
await page.screenshot({ path: S + 'h0_gate.png' });
await page.evaluate(() => window.__ali.game.startChallenge()); await wait(4000); await notBusy();
const answers = [1, 0, 0, 0, 2]; // q2 and q4 wrong on purpose -> 3/5 fail
for (let q = 0; q < 5; q++) {
  await page.screenshot({ path: S + `q${q + 1}_a.png` });
  await page.evaluate((k) => window.__ali.game.onAnswer(k), answers[q]);
  await wait(1400); await page.screenshot({ path: S + `q${q + 1}_b_feedback.png` });
  await page.evaluate(() => window.__ali.game.onNextQuestion()); await wait(2500); await notBusy();
}
await wait(2500);
await page.screenshot({ path: S + 'r_results.png' });
console.log(logs.filter(l => /error|PAGEERROR/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
