// Probe: is each evidence marker the first thing a click/ray hits, or do Ali's tap targets (body cylinder, speech
// bubble) or the console take the click? Screen click path + headset-like rays from the pad (standing / seated).
import { launch, FRESH } from './lib.mjs';
const out = {};
const T = await launch({ speed: 8, store: FRESH({ settings: { voice: false, sfx: false, music: false, captions: true, gender: 'm', name: '', height: 'auto', unlockAll: true, shadows: true } }) });
await T.page.evaluate(() => window.__ali.start('screen'));
await T.waitFor((s) => s.phase === 'choose', 'hub');
for (const key of ['quake', 'volcano', 'weather', 'erosion', 'human']) {
  await T.page.evaluate((k) => window.__ali.goTo(k), key);
  await T.waitFor((s) => s.place === key && !s.busy, key);
  await T.page.waitForTimeout(400);
  const res = [];
  for (const withBubble of [false, true]) {
    const r = await T.page.evaluate(async ({ key, withBubble }) => {
      const A = window.__ali, g = A.game, z = g.zones[key], I = g.input, E = A.engine, V = E.camera.position.constructor;
      g.cancelScript(); g.quiet(); z._clearCards(); z.console.only(z.bReplay, z.bBA, z.bMap); z.phase = 'find';
      z._setShowing('after');
      const rows = [];
      for (const m of z.markers) {
        z.active = m; z._applyMarkerVisibility(); m.k.show = 1;
        if (withBubble) { g.lastSaid = m.ev.ask; g.bubble.say(m.ev.ask); } else { g.bubble.visible = false; }
        await new Promise((r) => setTimeout(r, 700));
        const c = new V(); m.hit.getWorldPosition(c);
        const scr = I.screenOf('ev:' + key + ':' + m.ev.id);
        const sHit = scr ? I._screenPick(scr.x, scr.y)?.handler?.id : 'not-active';
        const heads = {};
        for (const [name, eye] of [['stand1.2', 1.2], ['seat1.05', 1.05]]) {
          const h = g.zonePoint(0, eye, 0, key);
          const hit = I.pick(h, c.clone().sub(h).normalize());
          heads[name] = hit?.handler?.id || null;
        }
        rows.push({ id: m.ev.id, screen: sHit, ...heads });
      }
      return rows;
    }, { key, withBubble });
    res.push({ withBubble, r });
  }
  out[key] = res;
}
out.logs = T.logs;
await T.browser.close();
console.log(JSON.stringify(out));
