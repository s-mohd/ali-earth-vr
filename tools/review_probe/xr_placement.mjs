// Probe: where does the viewer's head end up relative to the zone anchor?
// A) right after the session starts (first placeAt reads the desktop camera pose, then a re-place jumps without a fade);
// B) after a system recenter (reference space 'reset'): placeAt runs on the stale pre-reset pose.
import { launch, FRESH } from './lib.mjs';
const out = {};
const T = await launch({ xr: true, store: FRESH(), yaw: 0.9, eye: 1.2 });
// sample head pose in the hub frame each real frame for 2 s after start
await T.page.evaluate(() => {
  const A = window.__ali, E = A.engine, g = A.game; const t0 = performance.now();
  window.__samples = []; window.__placed = []; window.__frames = 0;
  const orig = E.placeAt.bind(E);
  E.placeAt = (a) => { const c = E.camera.position; window.__placed.push({ t: Math.round(performance.now() - t0), presenting: E.presenting, camAt: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], measured: g.measuredEye }); return orig(a); };
  const V = E.camera.position.constructor;
  E.onRealUpdate(() => { window.__frames++;
    if (!E.presenting) return;
    const f = g.frames[g.place];
    const h = E.headWorld(new V());
    f.worldToLocal(h);
    const d = new V(0, 0, -1).applyQuaternion(E.camera.getWorldQuaternion(E.camera.quaternion.clone()));
    window.__samples.push({ t: Math.round(performance.now() - t0), x: +h.x.toFixed(3), z: +h.z.toFixed(3), yawDeg: +(Math.atan2(-d.x, -d.z) * 57.3 - f.rotation.y * 57.3).toFixed(1) });
  });
});
await T.page.evaluate(() => window.__ali.start('vr'));
await T.waitFor((s) => s.presenting, 'presenting');
await T.page.waitForTimeout(8000);
const S = await T.page.evaluate(() => window.__samples.slice());
// keep the first frames and every change > 5 cm or > 5 deg
const keep = [];
for (const s of S) { const p = keep[keep.length - 1]; if (!p || Math.hypot(s.x - p.x, s.z - p.z) > 0.05 || Math.abs(s.yawDeg - p.yawDeg) > 5) keep.push(s); }
out.startTrace = keep.slice(0, 12);
out.settled = S[S.length - 1]; out.placedAtStart = await T.page.evaluate(() => window.__placed.slice()); out.frames = await T.page.evaluate(() => window.__frames);
// B) user walks 0.5 m to the right and turns 60 deg, then recenters (Oculus button)
await T.page.evaluate(() => { const d = window.__xrdev; d.position.x += 0.5; const a = 1.05 + 0.9; d.quaternion.set(0, Math.sin(a / 2), 0, Math.cos(a / 2)); });
await T.page.waitForTimeout(600);
out.beforeReset = await T.page.evaluate(() => window.__samples[window.__samples.length - 1]);
await T.page.evaluate(() => window.__xrdev.recenter());
await T.page.waitForTimeout(1200);
out.afterReset = await T.page.evaluate(() => window.__samples[window.__samples.length - 1]); out.placedAll = await T.page.evaluate(() => window.__placed.slice());
out.logs = T.logs;
await T.browser.close();
console.log(JSON.stringify(out, null, 1));
