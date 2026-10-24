// End-to-end playthrough on screen (or emulated Quest 2 with --xr): hub tutorial → 5 stations → challenge → results.
//   node tools/e2e.mjs [dist/index.html] [--xr] [--out shots/e2e] [--speed 6] [--wrong 2] [--stations quake,volcano]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = path.resolve(ROOT, argv.find((a) => a.endsWith('.html')) || 'dist/index.html');
const XR = argv.includes('--xr');
const OUT = path.resolve(ROOT, opt('out', XR ? 'shots/e2e_xr' : 'shots/e2e'));
const SPEED = Number(opt('speed', 6));
const WRONG = Number(opt('wrong', 1)); // how many quiz questions to answer wrongly
const ONLY = opt('stations', 'quake,volcano,weather,erosion,human').split(',');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: XR ? { width: 1600, height: 800 } : { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e.stack || e.message).slice(0, 600)));
if (XR) {
  const iwer = fs.readFileSync(path.join(ROOT, 'node_modules/iwer/build/iwer.min.js'), 'utf8');
  await page.addInitScript({ content: iwer + `;(function(){ const d = new IWER.XRDevice(IWER.metaQuest2); d.position.set(0, 1.2, 0); d.installRuntime({ forceInstall: true }); window.__xrdev = d; })();` });
}
const t0 = Date.now();
await page.goto('file://' + file + `?test&speed=${SPEED}`);
await page.waitForFunction(() => window.__ali?.ready, null, { timeout: 180000 });
const steps = [];
let n = 0;
const shot = async (name) => { const p = path.join(OUT, `${String(++n).padStart(2, '0')}_${name}.png`); await page.screenshot({ path: p }); steps.push(name); };
const state = () => page.evaluate(() => window.__ali.state());
async function waitFor(pred, label, timeout = 60000) {
  const end = Date.now() + timeout;
  for (;;) {
    const s = await state();
    if (pred(s)) return s;
    if (Date.now() > end) throw new Error(`timeout waiting for ${label}; state=${JSON.stringify(s)}`);
    await page.waitForTimeout(120);
  }
}
const click = async (id) => {
  const ok = await page.evaluate((id) => window.__ali.click(id), id);
  if (!ok) throw new Error('could not click ' + id + ' active=' + JSON.stringify(await page.evaluate(() => window.__ali.list())));
  await page.waitForTimeout(150);
};
const waitIdle = () => waitFor((s) => !s.busy, 'idle');
const result = { ok: false };
try {
  await shot('start');
  await page.evaluate((xr) => window.__ali.start(xr ? 'vr' : 'screen'), XR);
  if (XR) await waitFor((s) => s.presenting, 'xr presenting', 20000);
  await waitFor((s) => s.phase === 'tutorial' || s.phase === 'choose', 'hub tutorial');
  await page.waitForTimeout(600);
  await shot('hub_welcome');
  const st = await state();
  if (st.phase === 'tutorial') {
    await waitFor((s) => s.stars === 3 || s.stars === 0, 'stars');
    await shot('hub_tutorial');
    for (let i = 0; i < 3; i++) await click('hub:star' + i);
    await waitFor((s) => s.phase === 'choose', 'hub choose');
  }
  await page.waitForTimeout(500);
  await shot('hub_choose');
  for (const key of ONLY) {
    await click(key === ONLY[0] ? 'hub:go' : `map:${key}`).catch(async () => { await page.evaluate((k) => window.__ali.goTo(k), key); });
    await waitFor((s) => s.place === key && (s.phase === 'intro' || s.phase === 'predict'), key + ' intro');
    await page.waitForTimeout(500);
    await shot(`${key}_intro`);
    await waitFor((s) => s.phase === 'predict' && s.cards === 2, key + ' predict');
    await page.waitForTimeout(600);
    await shot(`${key}_predict`);
    await click(`${key}:predict:0`);
    await waitFor((s) => s.phase === 'watch', key + ' watch');
    await page.waitForTimeout(2500);
    await shot(`${key}_watch`);
    await waitFor((s) => s.phase === 'find' && s.active, key + ' find', 90000);
    await page.waitForTimeout(500);
    await shot(`${key}_find`);
    for (let k = 0; k < 4; k++) {
      const s = await state();
      if (s.phase !== 'find' || !s.active) break;
      await click(`ev:${key}:${s.active}`);
      await waitFor((x) => x.active !== s.active, 'next clue', 30000);
      if (k === 0) { await page.waitForTimeout(300); await shot(`${key}_found1`); }
    }
    await waitFor((s) => ['reward', 'practice', 'compare', 'done'].includes(s.phase), key + ' after find', 60000);
    await page.waitForTimeout(400);
    await shot(`${key}_stamp`);
    await waitFor((s) => ['practice', 'compare', 'done'].includes(s.phase) && !(s.phase === 'practice' && s.cards === 0), key + ' after reward', 60000);
    let s = await state();
    if (s.phase === 'practice') {
      await page.waitForTimeout(700);
      await shot(`${key}_practice`);
      // wrong first, then right
      await click(`${key}:practice:${key === 'weather' ? 1 : 0}`);
      await page.waitForTimeout(500);
      await shot(`${key}_practice_wrong`);
      await click(`${key}:practice:${key === 'weather' ? 0 : 1}`);
      s = await waitFor((x) => x.phase !== 'practice', 'practice done', 60000);
    }
    if (s.phase === 'compare') {
      await page.waitForTimeout(600);
      await shot(`${key}_compare`);
      await click(`${key}:continue`);
    }
    await waitFor((x) => x.phase === 'done', key + ' done');
    await page.waitForTimeout(400);
    await shot(`${key}_done`);
    await click(`${key}:ba`);
    await shot(`${key}_before`);
    await click(`${key}:ba`);
    await click(`${key}:map`);
    await waitFor((x) => x.place === 'hub' && x.phase === 'choose', 'back to hub');
  }
  await page.waitForTimeout(400);
  await shot('hub_all');
  await click('hub:go');
  await waitFor((s) => s.place === 'hall' && s.phase === 'intro', 'hall intro');
  await page.waitForTimeout(500);
  await shot('hall_intro');
  await click('hall:start');
  const quiz = async (tag, wrongN) => {
    for (let q = 0; q < 5; q++) {
      const s = await waitFor((x) => x.q === q && x.cards === 3, 'question ' + q);
      await page.waitForTimeout(700);
      await shot(`${tag}_q${q + 1}`);
      const wrong = q < wrongN;
      await click(`hall:card${wrong ? (s.correctCard + 1) % 3 : s.correctCard}`);
      await page.waitForTimeout(500);
      if (wrong) {
        await shot(`${tag}_q${q + 1}_answered`);
        // active correction: wait until the glowing right card can be selected
        for (let k = 0; k < 200; k++) { if ((await page.evaluate(() => window.__ali.list())).includes(`hall:card${s.correctCard}`)) break; await page.waitForTimeout(100); }
        await click(`hall:card${s.correctCard}`);
        await page.waitForTimeout(400);
        await shot(`${tag}_q${q + 1}_corrected`);
      }
      for (let k = 0; k < 200; k++) { if ((await page.evaluate(() => window.__ali.list())).includes(q < 4 ? 'hall:nextq' : 'hall:result')) break; await page.waitForTimeout(100); }
      await click(q < 4 ? 'hall:nextq' : 'hall:result');
    }
  };
  await quiz('quiz', WRONG);
  await waitFor((s) => s.phase === 'results', 'results');
  await page.waitForTimeout(1200);
  await shot('results');
  if (argv.includes('--retry')) {
    // second attempt uses the B form (new quiz scenes); fail it on purpose to see the review path
    await click('hall:retry');
    await quiz('retry', 2);
    await waitFor((s) => s.phase === 'results', 'results 2');
    await page.waitForTimeout(1200);
    await shot('results_retry');
    await page.evaluate(() => window.__ali.game.shell.openTeacher?.());
    await page.waitForTimeout(800);
    await shot('teacher');
  }
  result.ok = true;
} catch (e) {
  result.error = String(e.stack || e);
  await shot('error').catch(() => {});
}
result.state = await state().catch(() => null);
result.info = await page.evaluate(() => window.__ali.info()).catch(() => null);
result.shellLog = await page.evaluate(() => (window.__shellLog || []).slice(-8)).catch(() => null);
result.attempts = await page.evaluate(() => window.__ali.store.attempts.length).catch(() => null);
result.seconds = Math.round((Date.now() - t0) / 1000);
result.steps = steps.length;
result.logs = logs.slice(0, 40);
result.out = OUT;
await browser.close();
console.log(JSON.stringify(result, null, 1));
