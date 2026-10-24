// Probe (headset, gaze-only input): a child who keeps looking at Ali makes him repeat his last line over and over
// (Ali's body/bubble are dwell targets whenever he is silent).
import { launch, FRESH } from './lib.mjs';
const out = {};
const T = await launch({ xr: true, speed: 8, store: FRESH() });
await T.page.evaluate(() => window.__ali.start('vr'));
await T.waitFor((s) => s.presenting, 'presenting');
await T.waitFor((s) => s.phase === 'choose', 'hub choose');
await T.page.waitForTimeout(6000); // let the start-up re-placement happen
await T.page.evaluate(() => {
  const A = window.__ali, g = A.game, E = A.engine, I = g.input;
  I.gaze.active = true; // as with no controllers / hands
  // turn the emulated head toward Ali's body
  const V = E.camera.position.constructor, Q = E.camera.quaternion.constructor;
  const target = g.ali.group.localToWorld(new V(0, 0.75, 0));
  const head = E.headWorld(new V());
  const o = E.camera.clone(); o.position.copy(head); o.lookAt(target); // camera looks down -Z
  const rigQ = E.rig.getWorldQuaternion(new Q());
  const local = rigQ.invert().multiply(o.quaternion);
  window.__xrdev.quaternion.set(local.x, local.y, local.z, local.w);
  window.__says = [];
  const orig = g.say.bind(g);
  g.say = (t, o2) => { window.__says.push({ t: Math.round(performance.now()), text: t.slice(0, 30) }); return orig(t, o2); };
});
await T.page.waitForTimeout(15000);
out.gazeTarget = await T.page.evaluate(() => window.__ali.game.input.gaze.target?.id || null);
out.saysWhileLookingAtAli = await T.page.evaluate(() => window.__says);
out.logs = T.logs;
await T.browser.close();
console.log(JSON.stringify(out, null, 1));
