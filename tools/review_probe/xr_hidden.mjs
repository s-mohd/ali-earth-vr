// Probe (headset): while the session is hidden (headset off / system menu) the game clock pauses, but Ali's lines
// (timed by setTimeout when there is no Arabic voice) keep running, so the script talks on to nobody.
import { launch, FRESH } from './lib.mjs';
const out = {};
const T = await launch({ xr: true, speed: 1, store: FRESH({ progress: { tutorial: true, done: [], evidence: {}, practice: {} } }) });
await T.page.evaluate(() => window.__ali.start('vr'));
await T.waitFor((s) => s.presenting, 'presenting');
await T.waitFor((s) => s.place === 'hub' && s.bubble, 'hub line');
out.first = await T.state();
await T.page.evaluate(() => window.__xrdev.updateVisibilityState('hidden'));
await T.page.waitForTimeout(1500);
out.paused = await T.page.evaluate(() => window.__ali.engine.paused);
const lines = [];
for (let i = 0; i < 24; i++) { const s = await T.state(); if (lines[lines.length - 1] !== s.bubble) lines.push(s.bubble); await T.page.waitForTimeout(500); }
out.linesWhileHidden = lines;
out.phaseWhileHidden = (await T.state()).phase;
await T.page.evaluate(() => window.__xrdev.updateVisibilityState('visible'));
await T.page.waitForTimeout(800);
out.pausedAfter = await T.page.evaluate(() => window.__ali.engine.paused);
out.logs = T.logs;
await T.browser.close();
console.log(JSON.stringify(out, null, 1));
