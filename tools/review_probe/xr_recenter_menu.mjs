// Probe: in the headset, the menu's "recenter" item cancels the running zone script and nothing restarts it.
// A) station predict step: after recenter the predict cards still take clicks but nothing happens (stuck).
// B) hub tutorial: after recenter the stars no longer finish the tutorial and the map pins stay blocked.
// C) the hub console has no menu button in the headset.
import { launch, FRESH } from './lib.mjs';
const out = {};
{
  const T = await launch({ xr: true, store: FRESH() });
  await T.page.evaluate(() => window.__ali.start('vr'));
  await T.waitFor((s) => s.presenting, 'presenting');
  await T.waitFor((s) => s.phase === 'choose', 'hub choose');
  out.hubMenuButtons = (await T.list()).filter((id) => id.startsWith('menu:'));
  await T.waitClickable('hub:go'); await T.click('hub:go');
  await T.waitFor((s) => s.place === 'quake' && s.phase === 'predict' && s.cards === 2, 'predict');
  const menuId = (await T.list()).find((id) => id.startsWith('menu:open'));
  out.stationMenuButton = menuId;
  await T.waitClickable(menuId);
  await T.click(menuId);
  await T.waitClickable('menu:recenter');
  out.recenterClicked = await T.click('menu:recenter');
  await T.waitFor((s) => !s.busy, 'idle');
  await T.page.waitForTimeout(800);
  out.afterRecenter = await T.state();
  await T.waitClickable('quake:predict:0');
  out.cardClick = await T.click('quake:predict:0');
  await T.page.waitForTimeout(4000);
  out.fourSecondsLater = await T.state();
  out.stationLogs = T.logs.slice(0, 10);
  await T.browser.close();
}
{
  const T = await launch({ xr: true, store: FRESH({ progress: { tutorial: false, done: [], evidence: {}, practice: {} } }) });
  await T.page.evaluate(() => window.__ali.start('vr'));
  await T.waitFor((s) => s.presenting, 'presenting');
  await T.waitFor((s) => s.phase === 'tutorial' && s.stars === 3, 'tutorial');
  await T.page.evaluate(() => window.__ali.game.recenter()); // what menu:recenter does (the hub has no menu button)
  await T.waitFor((s) => !s.busy, 'idle');
  await T.page.waitForTimeout(600);
  for (let i = 0; i < 3; i++) { await T.waitClickable('hub:star' + i); await T.click('hub:star' + i); await T.page.waitForTimeout(300); }
  await T.page.waitForTimeout(4000);
  out.hubAfterStars = await T.state();
  out.hubPinClick = await T.click('map:quake');
  await T.page.waitForTimeout(1500);
  out.hubAfterPin = await T.state();
  out.hubLogs = T.logs.slice(0, 10);
  await T.browser.close();
}
console.log(JSON.stringify(out, null, 1));
