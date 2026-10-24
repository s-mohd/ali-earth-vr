// Probe (headset): A) rays pass through the open in-headset menu panel and answer the quiz card behind it;
// B) after passing in the headset and leaving it, the screen has no certificate button.
import { launch, DONE_ALL } from './lib.mjs';
const out = {};
const T = await launch({ xr: true, store: DONE_ALL() });
await T.page.evaluate(() => window.__ali.start('vr'));
await T.waitFor((s) => s.presenting, 'presenting');
await T.waitFor((s) => s.phase === 'choose', 'hub choose');
await T.waitClickable('hub:go');
await T.click('hub:go');
await T.waitFor((s) => s.place === 'hall' && s.phase === 'intro', 'hall');
await T.waitClickable('hall:start');
await T.click('hall:start');
let s = await T.waitFor((x) => x.q === 0 && x.cards === 3, 'q0');
await T.page.waitForTimeout(800);
const menuId = (await T.list()).find((id) => id.startsWith('menu:open'));
await T.waitClickable(menuId);
await T.click(menuId);
await T.waitClickable('menu:recenter');
await T.page.waitForTimeout(500);
out.menuPassThrough = await T.page.evaluate(() => {
  const A = window.__ali, g = A.game, E = A.engine, I = g.input, V = E.camera.position.constructor;
  const head = E.headWorld(new V()), res = [];
  for (const [x, y] of [[0.3, -0.015], [-0.3, -0.015], [0.0, -0.2], [0.25, -0.24]]) {
    const p = g.menu.localToWorld(new V(x, y, 0.03));
    const hit = I.pick(head, p.clone().sub(head).normalize());
    res.push({ menuLocal: [x, y], firstHit: hit?.handler?.id || null, dist: hit ? +hit.distance.toFixed(2) : null });
  }
  return res;
});
await T.click('menu:close');
for (let q = 0; q < 5; q++) {
  s = await T.waitFor((x) => x.q === q && x.cards === 3, 'q' + q);
  await T.waitClickable('hall:card' + s.correctCard);
  await T.click('hall:card' + s.correctCard);
  const nx = q < 4 ? 'hall:nextq' : 'hall:result';
  await T.waitClickable(nx);
  await T.click(nx);
}
await T.waitFor((x) => x.phase === 'results', 'results');
await T.page.waitForTimeout(800);
out.resultsButtonsInVR = (await T.list()).filter((i) => i.startsWith('hall:'));
await T.page.evaluate(() => window.__ali.engine.exitVR());
await T.waitFor((x) => !x.presenting, 'exit');
await T.page.waitForTimeout(1200);
out.resultsButtonsOnScreenAfterExit = (await T.list()).filter((i) => i.startsWith('hall:'));
out.logs = T.logs;
await T.browser.close();
console.log(JSON.stringify(out, null, 1));
