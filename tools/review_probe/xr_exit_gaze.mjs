// Probe: after leaving the headset, is the gaze-dwell mode flag still on? (three disconnects the controllers while
// renderer.xr.getSession() still returns the ended session, so _refreshGazeMode() may compute "no pointers" = gaze.)
import { launch, DONE_ALL } from './lib.mjs';
const out = {};
const T = await launch({ xr: true, store: DONE_ALL() });
await T.page.evaluate(() => window.__ali.start('vr'));
await T.waitFor((s) => s.presenting, 'presenting');
await T.page.waitForTimeout(2500);
out.inVR = await T.page.evaluate(() => ({ gaze: window.__ali.game.input.gaze.active, sources: [...window.__ali.engine.renderer.xr.getSession().inputSources].map((s) => s.targetRayMode) }));
await T.page.evaluate(() => window.__ali.engine.exitVR());
await T.waitFor((s) => !s.presenting, 'exit');
await T.page.waitForTimeout(800);
out.afterExit = await T.page.evaluate(() => ({ gaze: window.__ali.game.input.gaze.active }));
// a scored quiz answer on screen now
await T.waitFor((s) => s.phase === 'choose', 'hub choose');
await T.waitClickable('hub:go');
await T.click('hub:go');
await T.waitFor((s) => s.place === 'hall' && s.phase === 'intro', 'hall');
await T.waitClickable('hall:start');
await T.click('hall:start');
const s = await T.waitFor((x) => x.q === 0 && x.cards === 3, 'q0');
await T.waitClickable('hall:card' + s.correctCard);
await T.click('hall:card' + s.correctCard);
await T.page.waitForTimeout(600);
out.afterScreenAnswer = { state: (await T.state()).answers, buttons: (await T.list()).filter((i) => i.startsWith('hall:')), cardStates: await T.page.evaluate(() => window.__ali.game.zones.hall.cards.map((c) => c.state)) };
out.logs = T.logs;
await T.browser.close();
console.log(JSON.stringify(out, null, 1));
