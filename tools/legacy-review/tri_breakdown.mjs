// Triangle / draw-call breakdown for both versions (desktop, no XR), to find what dominates the Quest 2 budget.
import { chromium } from 'playwright';
import fs from 'node:fs';
const W = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad/ali';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = {};
{ // V1
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('file://' + W + '/ref/v1.html?test&speed=4');
  await page.waitForFunction(() => window.__ali && window.__ali.game, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  out.v1 = await page.evaluate(() => {
    const S = window.__ali.services; const rows = []; const canv = [];
    const path = (o) => { const p = []; for (let n = o; n && n !== S.scene; n = n.parent) p.unshift(n.name || n.type); return p.slice(0, 3).join('/'); };
    S.scene.traverse(o => { if (!o.isMesh) return; const g = o.geometry; const n = g.index ? g.index.count : g.attributes.position.count; const tris = (o.isInstancedMesh ? o.count : 1) * n / 3; rows.push({ path: path(o), tris: Math.round(tris), inst: o.isInstancedMesh ? o.count : 0, shadow: o.castShadow }); const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m.map && m.map.image instanceof HTMLCanvasElement) canv.push({ path: path(o), w: m.map.image.width, h: m.map.image.height }); });
    const groups = {}; for (const r of rows) { const k = r.path.split('/').slice(0, 2).join('/'); groups[k] = groups[k] || { tris: 0, meshes: 0 }; groups[k].tris += r.tris; groups[k].meshes++; }
    const instanced = rows.filter(r => r.inst).length;
    return { top: rows.sort((a, b) => b.tris - a.tris).slice(0, 15), groups: Object.entries(groups).sort((a, b) => b[1].tris - a[1].tris).slice(0, 15), instancedMeshes: instanced, bigCanvases: canv.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 12), images: Object.keys(window.__ali.game.images || {}).length, pixelRatio: S.renderer.getPixelRatio(), shadowMap: { enabled: S.renderer.shadowMap.enabled, type: S.renderer.shadowMap.type }, toneMapping: S.renderer.toneMapping, cameraNearFar: [S.camera.near, S.camera.far] };
  });
  await page.close();
}
{ // V2
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('file://' + W + '/ref/v2.html');
  await page.waitForFunction(() => window.__ali && !document.getElementById('intro').hidden, null, { timeout: 120000 });
  out.v2 = await page.evaluate(() => {
    let root = window.UIK.UI.targets[0]; while (root.parent) root = root.parent; const rows = [];
    const path = (o) => { const p = []; for (let n = o; n && n !== root; n = n.parent) p.unshift(n.name || 'node'); return p.slice(0, 3).join('/'); };
    root.traverse(n => { if (!n.geometry) return; const g = n.geometry; rows.push({ path: path(n), tris: Math.round(g.count / 3), vis: n.shown(), transparent: n.material.transparent }); });
    const groups = {}; for (const r of rows) { if (!r.vis) continue; const k = r.path.split('/').slice(0, 2).join('/'); groups[k] = groups[k] || { tris: 0, meshes: 0 }; groups[k].tris += r.tris; groups[k].meshes++; }
    // same geometry shared by several meshes?
    const geos = new Set(); root.traverse(n => { if (n.geometry) geos.add(n.geometry); });
    return { top: rows.filter(r => r.vis).sort((a, b) => b.tris - a.tris).slice(0, 15), groups: Object.entries(groups).sort((a, b) => b[1].tris - a[1].tris).slice(0, 15), uniqueGeometries: geos.size, meshes: rows.length };
  });
  await page.close();
}
fs.writeFileSync(W + '/tools/tri_breakdown.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 9000));
await browser.close();
