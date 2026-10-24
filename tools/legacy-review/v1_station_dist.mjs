// V1: distance from the VR standing spot (placeVR) to each station's model focus and board; also desktop camera distance.
import { chromium } from 'playwright';
const W = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad/ali';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('file://' + W + '/ref/v1.html?test&speed=4');
await page.waitForFunction(() => window.__ali && window.__ali.game, null, { timeout: 120000 });
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__ali.game; const out = [];
  for (let i = 0; i < 5; i++) {
    const v = g.viewFor({ type: 'station', index: i }); const st = g.stations[i];
    const spot = v.target.clone().lerp(v.pos, 0.72); spot.y = g.world.heightAt(spot.x, spot.z);
    const head = spot.clone(); head.y += 1.2; const f = st.focusWorld ? st.focusWorld() : v.target;
    out.push({ i, desktopCamToTarget: +v.pos.distanceTo(v.target).toFixed(1), vrHeadToFocus: +head.distanceTo(f).toFixed(1), focusY: +f.y.toFixed(2), spotY: +spot.y.toFixed(2) });
  }
  const w = g.welcomeView; const s = w.target.clone().lerp(w.pos, 0.72); out.push({ welcomeSpot: s.toArray().map(x => +x.toFixed(1)), heightAt: +g.world.heightAt(s.x, s.z).toFixed(2), shoreR: +g.world.shoreR.toFixed(1), spotRadius: +Math.hypot(s.x, s.z).toFixed(1) });
  return out;
})));
await browser.close();
