// Art review: close-up portraits of Ali in V1 and V2 (front + 3/4), to judge character appeal.
import { chromium } from 'playwright';
const W = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad/ali';
const OUT = W + '/shots';
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });

// ---------- V1 ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('v1 err', e.message));
  await page.goto('file://' + W + '/ref/v1.html?test&speed=4');
  await page.waitForFunction(() => window.__ali && window.__ali.game, null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  for (const [name, ang, dist, fov, hy] of [['v1_ali_close_front', 0, 3.2, 30, 1.25], ['v1_ali_close_34', 0.75, 3.2, 30, 1.25], ['v1_ali_full', 0, 5.5, 32, 0.95]]) {
    await page.evaluate(([ang, dist, fov, hy]) => {
      const g = window.__ali.game; const H = g.camera.position.constructor;
      if (!g.__ru) { g.__ru = g.rig.update; g.rig.update = () => {}; }
      document.getElementById('hud').style.visibility = 'hidden';
      document.querySelectorAll('.modal, .welcome, #welcome, .card').forEach((e) => (e.style.visibility = 'hidden'));
      const a = g.ali; a.updateMatrixWorld(true);
      const p = a.getWorldPosition(new H());
      const q = a.getWorldQuaternion(g.camera.quaternion.clone());
      const fwd = new H(0, 0, 1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
      const c = Math.cos(ang), s = Math.sin(ang);
      const dir = new H(fwd.x * c - fwd.z * s, 0, fwd.x * s + fwd.z * c);
      const eye = p.clone().addScaledVector(dir, dist); eye.y = p.y + hy + 0.25;
      g.camera.position.copy(eye); g.camera.fov = fov; g.camera.updateProjectionMatrix();
      g.camera.lookAt(p.x, p.y + hy, p.z);
      g.aliFacesCamera = false;
    }, [ang, dist, fov, hy]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('shot', name);
  }
  await page.close();
}

// ---------- V2 ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('v2 err', e.message));
  await page.goto('file://' + W + '/ref/v2.html');
  await page.waitForFunction(() => !document.getElementById('intro').hidden, null, { timeout: 60000 });
  await page.click('#startScreen');
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.__ali.goTo(0));
  await page.waitForFunction(() => window.__ali.place === 0);
  await page.waitForTimeout(3500);
  for (const [name, ang, dist] of [['v2_ali_close_front', 0, 1.6], ['v2_ali_close_34', 0.75, 1.6], ['v2_ali_full', 0, 2.9]]) {
    await page.evaluate(([ang, dist]) => {
      const A = window.__ali; let root = A.stations[0].D; while (root.parent) root = root.parent; root.updateWorld(null);
      const find = (n, nm) => { if (n.name === nm) return n; for (const c of n.children) { const r = find(c, nm); if (r) return r; } return null; };
      const ali = find(root, 'ali'); const m = ali.world;
      const p = [m[12], m[13], m[14]];
      // ali local +Z in world
      let fx = m[8], fz = m[10]; const l = Math.hypot(fx, fz); fx /= l; fz /= l;
      const c = Math.cos(ang), s = Math.sin(ang);
      const dx = fx * c - fz * s, dz = fx * s + fz * c;
      const ex = p[0] + dx * dist, ez = p[2] + dz * dist;
      A.rig.pos = [ex, 0, ez];
      A.rig.yaw = Math.atan2(-(p[0] - ex), -(p[2] - ez));
      A.look.yaw = 0;
      const headY = p[1] + (dist > 2 ? 0.75 : 1.15);
      A.look.pitch = Math.atan2(headY - 1.32, dist);
    }, [ang, dist]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('shot', name);
  }
  await page.close();
}
await browser.close();
