// Probe (screen): the station is marked done at the start of the reward, so leaving during the stamp / practice /
// comparison skips them for good (no practice record, comparison never shown again).
import { launch, FRESH } from './lib.mjs';
const out = {};
const T = await launch({ speed: 10, store: FRESH({ progress: { tutorial: true, done: ['quake', 'volcano', 'weather'], evidence: {}, practice: {} } }) });
await T.page.evaluate(() => window.__ali.start('screen'));
await T.waitFor((s) => s.phase === 'choose', 'hub');
await T.waitClickable('hub:go');
await T.click('hub:go');
const key = 'erosion';
await T.waitFor((s) => s.place === key && s.phase === 'predict' && s.cards === 2, 'predict');
await T.waitClickable(`${key}:predict:0`);
await T.click(`${key}:predict:0`);
for (let k = 0; k < 3; k++) {
  const s = await T.waitFor((x) => (x.phase === 'find' && x.active) || ['reward', 'practice'].includes(x.phase), 'find', 120000);
  if (s.phase !== 'find') break;
  await T.waitClickable(`ev:${key}:${s.active}`);
  await T.click(`ev:${key}:${s.active}`);
  await T.waitFor((x) => x.active !== s.active, 'next clue', 30000);
}
await T.waitFor((s) => s.phase === 'practice' && s.cards === 2, 'practice', 60000);
out.atPractice = { stamps: (await T.state()).stamps };
await T.waitClickable(`${key}:map`);
await T.click(`${key}:map`);
await T.waitFor((s) => s.place === 'hub' && s.phase === 'choose', 'hub again');
out.hubNext = await T.page.evaluate(() => window.__ali.game.nextPlace());
await T.waitClickable('map:' + key);
await T.click('map:' + key);
await T.waitFor((s) => s.place === key && !s.busy, 'back');
await T.page.waitForTimeout(1500);
const st = await T.state();
out.backAt = { phase: st.phase, list: (await T.list()).filter((i) => i.startsWith(key)) };
out.practiceRecord = await T.page.evaluate(() => window.__ali.store.progress.practice);
out.logs = T.logs;
await T.browser.close();
console.log(JSON.stringify(out, null, 1));
