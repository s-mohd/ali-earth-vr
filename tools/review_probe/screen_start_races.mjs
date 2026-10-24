// Probe (screen): A) the teacher's "reset progress" from the start screen starts the hub script behind the start screen;
// B) "home" (stopToStart) pressed during a teleport: goTo is ignored, the in-flight teleport then starts the station
//    script behind the start screen, and Start later runs the HUB script while the viewer stands in the station.
import { launch, FRESH } from './lib.mjs';
const out = {};
{
  const T = await launch({ store: FRESH() });
  await T.page.evaluate(() => window.__ali.game.resetProgress());
  await T.page.waitForTimeout(3000);
  out.resetOnStartScreen = { ...(await T.state()), startVisible: await T.page.evaluate(() => window.__ali.game.shell.startVisible) };
  await T.browser.close();
}
{
  const T = await launch({ store: FRESH() });
  await T.page.evaluate(() => window.__ali.start('screen'));
  await T.waitFor((s) => s.phase === 'choose', 'hub');
  await T.waitClickable('hub:go');
  await T.page.evaluate(() => { window.__ali.click('hub:go'); window.__ali.game.stopToStart(); });
  await T.page.waitForTimeout(3000);
  out.homeDuringTeleport = { ...(await T.state()), startVisible: await T.page.evaluate(() => window.__ali.game.shell.startVisible) };
  await T.page.evaluate(() => window.__ali.start('screen'));
  await T.page.waitForTimeout(2500);
  const s = await T.state();
  out.afterStart = { place: s.place, stationPhase: s.phase, hubPhase: await T.page.evaluate(() => window.__ali.game.zones.hub.phase), bubble: s.bubble, aliIn: await T.page.evaluate(() => window.__ali.game.ali.group.parent?.name) };
  await T.browser.close();
}
console.log(JSON.stringify(out, null, 1));
