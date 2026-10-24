// Probe (screen): GPU memory growth per challenge attempt (Card.dispose frees nothing), resources held by the dropped
// vignette scenes, the gaze-confirm selection drawn as a green "correct" tick, form choice from device-wide attempts.
import { launch, DONE_ALL } from './lib.mjs';
const out = {};
const T = await launch({ store: DONE_ALL({ attempts: [{ date: '2026-10-01T08:00:00Z', name: 'other child', form: 'A', score: 5, total: 5, passed: true, answers: [] }] }) });
const mem = () => T.page.evaluate(() => { const r = window.__ali.engine.renderer.info; return { geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length }; });
// resources alive in the scene graph vs. what the renderer still holds
out.atReady = await T.page.evaluate(() => {
  const A = window.__ali, sc = A.engine.scene, geos = new Set(), texs = new Set();
  sc.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of [].concat(o.material || [])) for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) texs.add(v); }
  });
  const r = A.engine.renderer.info.memory;
  return { rendererGeometries: r.geometries, sceneGeometries: geos.size, rendererTextures: r.textures, sceneTextures: texs.size };
});
await T.page.evaluate(() => window.__ali.start('screen'));
await T.waitFor((s) => s.phase === 'choose', 'hub');
await T.waitClickable('hub:go');
await T.click('hub:go');
await T.waitFor((s) => s.place === 'hall' && s.phase === 'intro', 'hall');
await T.page.waitForTimeout(800);
async function attempt(tag, gazeWrongFirst = false) {
  const startId = (await T.state()).phase === 'results' ? 'hall:retry' : 'hall:start'; await T.waitClickable(startId); await T.click(startId);
  for (let q = 0; q < 5; q++) {
    const s = await T.waitFor((x) => x.q === q && x.cards === 3, 'q' + q);
    if (q === 0 && gazeWrongFirst) {
      // gaze-only headset input: a scored pick needs a confirm press; look at how the picked card is drawn
      await T.page.evaluate(() => { window.__ali.game.input.gaze.active = true; });
      const wrong = (s.correctCard + 1) % 3;
      await T.waitClickable('hall:card' + wrong);
      await T.click('hall:card' + wrong);
      await T.page.waitForTimeout(300);
      out.gazePick = await T.page.evaluate((w) => ({ picked: w, states: window.__ali.game.zones.hall.cards.map((c) => c.state), console: window.__ali.list().filter((i) => i.startsWith('hall:')) }), wrong);
      await T.page.screenshot({ path: new URL('./gaze_pick.png', import.meta.url).pathname });
      await T.page.evaluate(() => { window.__ali.game.input.gaze.active = false; window.__ali.game.zones.hall._resolveChoice?.(); });
      await T.page.waitForTimeout(200);
    }
    await T.waitClickable('hall:card' + s.correctCard);
    await T.click('hall:card' + s.correctCard);
    const nx = q < 4 ? 'hall:nextq' : 'hall:result';
    await T.waitClickable(nx);
    await T.click(nx);
  }
  await T.waitFor((x) => x.phase === 'results', 'results');
  return { form: (await T.state()).form, mem: await mem() };
}
out.before = await mem();
out.a1 = await attempt('a1', true);
out.a2 = await attempt('a2');
out.a3 = await attempt('a3');
out.logs = T.logs;
await T.browser.close();
console.log(JSON.stringify(out, null, 1));
