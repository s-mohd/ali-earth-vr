// Shared harness for review probes: launch the dev build (screen or emulated Quest 2) with ?test.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
export const HERE = path.dirname(new URL(import.meta.url).pathname);
const IWER = path.resolve(HERE, '../../node_modules/iwer/build/iwer.min.js');

export async function launch({ xr = false, speed = 8, eye = 1.2, store = null, yaw = 0 } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: xr ? { width: 1600, height: 800 } : { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e.stack || e.message).slice(0, 600)));
  if (store) await page.addInitScript({ content: `localStorage.setItem('aliEarthVR.v3', ${JSON.stringify(JSON.stringify(store))});` });
  if (xr) {
    const iwer = fs.readFileSync(IWER, 'utf8');
    await page.addInitScript({ content: iwer + `;(function(){ const d = new IWER.XRDevice(IWER.metaQuest2); d.position.set(0, ${eye}, 0); d.quaternion.set(0, Math.sin(${yaw}/2), 0, Math.cos(${yaw}/2)); d.installRuntime({ forceInstall: true }); window.__xrdev = d; })();` });
  }
  await page.goto('file://' + path.join(HERE, 'game.html') + `?test&speed=${speed}`);
  await page.waitForFunction(() => window.__ali?.ready, null, { timeout: 180000 });
  const state = () => page.evaluate(() => window.__ali.state());
  async function waitFor(pred, label, timeout = 60000) {
    const end = Date.now() + timeout;
    for (;;) {
      const s = await state();
      if (pred(s)) return s;
      if (Date.now() > end) throw new Error(`timeout waiting for ${label}; state=${JSON.stringify(s)}`);
      await page.waitForTimeout(100);
    }
  }
  const click = (id) => page.evaluate((id) => window.__ali.click(id), id);
  const list = () => page.evaluate(() => window.__ali.list());
  const waitClickable = async (id, timeout = 30000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if ((await list()).includes(id) && !(await page.evaluate(() => window.__ali.game.input.locked))) return true; await page.waitForTimeout(80); }
    return false;
  };
  return { browser, page, logs, state, waitFor, click, list, waitClickable };
}

export const DONE_ALL = (extra = {}) => ({
  version: 3,
  settings: { voice: false, sfx: false, music: false, captions: true, gender: 'm', name: '', height: 'auto', unlockAll: false, shadows: true },
  progress: { tutorial: true, done: ['quake', 'volcano', 'weather', 'erosion', 'human'], evidence: {}, practice: {} },
  attempts: [],
  ...extra,
});
export const FRESH = (extra = {}) => ({
  version: 3,
  settings: { voice: false, sfx: false, music: false, captions: true, gender: 'm', name: '', height: 'auto', unlockAll: false, shadows: true },
  progress: { tutorial: true, done: [], evidence: {}, practice: {} },
  attempts: [],
  ...extra,
});
