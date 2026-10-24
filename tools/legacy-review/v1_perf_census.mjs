// V1 performance census: triangle/draw breakdown by subsystem, shadow vs main pass split,
// texture inventory. Usage: node tools/v1_perf_census.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const W = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('file://' + path.join(W, 'ref/v1.html') + '?test&speed=4');
await page.waitForFunction(() => !!window.__ali, null, { timeout: 120000 });
await page.waitForTimeout(2500);

const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const i = window.__ali.services.renderer.info; r({ calls: i.render.calls, tris: i.render.triangles });
}))));

async function split(label) {
  const withShadow = await frame();
  await page.evaluate(() => { window.__ali.services.renderer.shadowMap.autoUpdate = false; });
  const noShadow = await frame();
  await page.evaluate(() => { window.__ali.services.renderer.shadowMap.autoUpdate = true; });
  return { label, total: withShadow, mainPassOnly: noShadow,
    shadowPass: { calls: withShadow.calls - noShadow.calls, tris: withShadow.tris - noShadow.tris } };
}

const out = { splits: [] };
out.splits.push(await split('welcome'));

out.breakdown = await page.evaluate(() => {
  const { scene } = window.__ali.services;
  const g = window.__ali.game;
  const triOf = (o) => { const geo = o.geometry; const n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; return o.isInstancedMesh ? n * o.count : n; };
  const sum = (root) => { let m = 0, t = 0, cs = 0; root.traverse((o) => { if (o.isMesh) { m++; t += triOf(o); if (o.castShadow) cs++; } }); return { meshes: m, tris: Math.round(t), castShadow: cs }; };
  const res = {};
  res.ali = sum(g.ali);
  res.aliOutlineMeshes = (() => { let n = 0; g.ali.traverse((o) => { if (o.name === 'outline') n++; }); return n; })();
  res.terrain = sum(g.world.terrain);
  res.water = sum(g.world.water);
  res.sky = sum(g.world.sky);
  res.worldRootAll = sum(g.world.root);
  const inst = []; g.world.root.children.forEach((c) => { if (c.isInstancedMesh) inst.push({ count: c.count, trisEach: Math.round(triOf(c) / c.count), castShadow: c.castShadow }); });
  res.worldInstanced = inst;
  res.stations = g.stations.map((s) => ({ id: s.id, ...sum(s.root), modelOnly: sum(s.model.group) }));
  res.hall = sum(g.hall.root); res.results = sum(g.results.root);
  // textures
  const texs = new Map(); const mats = new Map();
  scene.traverse((o) => { if (!o.isMesh && !o.isSprite) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => { mats.set(m.uuid, m.type); if (m.map?.image) texs.set(m.map.uuid, { w: m.map.image.width, h: m.map.image.height }); }); });
  let px = 0; const sizes = []; for (const t of texs.values()) { px += t.w * t.h; sizes.push(`${t.w}x${t.h}`); }
  res.textures = { count: texs.size, megapixels: +(px / 1e6).toFixed(2), approxGPU_MB_with_mips: +((px * 4 * 1.33) / 1048576).toFixed(1), sizes: sizes.sort() };
  const byType = {}; for (const t of mats.values()) byType[t] = (byType[t] || 0) + 1;
  res.materialsByType = byType;
  const r = window.__ali.services.renderer;
  res.renderer = { shadowMapType: r.shadowMap.type, sunShadowMapSize: g.world.sun.shadow.mapSize.toArray(), toneMapping: r.toneMapping,
    pixelRatio: r.getPixelRatio(), xrFoveation: r.xr.getFoveation?.(), xrFramebufferScale: r.xr.getFramebufferScaleFactor?.() ?? null,
    antialias: r.getContextAttributes().antialias, programs: r.info.programs.length };
  return res;
});

// station 1 + challenge splits
await page.evaluate(() => window.__ali.game.start());
await page.waitForFunction(() => window.__ali.state().location.type === 'station' && !window.__ali.state().busy, null, { timeout: 120000 });
await page.waitForTimeout(1500);
out.splits.push(await split('station1'));
fs.writeFileSync(path.join(W, 'review/v1_perf.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

// map + help modals (desktop-only overlays)
await page.evaluate(() => window.__ali.game.openMap());
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(W, 'shots/v1_map.png') });
await page.evaluate(() => window.__ali.game.hud.closeModal());
await page.evaluate(() => window.__ali.game.hud.openHelp());
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(W, 'shots/v1_help.png') });
await browser.close();
