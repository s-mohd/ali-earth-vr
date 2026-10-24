// Render the quiz vignettes (src/world/vignettes.js) exactly the way the game does (src/game/thumbs.js renderScenes:
// own scene, shared addLights, no fog, 2× supersampled 640×480) and save shots/vignettes/<id>.png + sheet.png.
//   node tools/vignette_snap.mjs [--only quake2,volcano2] [--out dir]
//   node tools/vignette_snap.mjs --only human2 --cam 0,2,3 --target 0,0,0 --out /tmp/x   (inspect from another camera)
// Prints a JSON summary: per-vignette draw calls / triangles / materials / build time, determinism check, errors.
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const OUT = path.resolve(opt('out', path.join(ROOT, 'shots/vignettes')));
const ONLY = opt('only', '');
const CAM_OVR = opt('cam', null), TGT_OVR = opt('target', null);
const IDS = ['quake2', 'volcano2', 'weather2', 'erosion2', 'human2'];
const BUDGET = { calls: 40, tris: 60000 };
fs.mkdirSync(OUT, { recursive: true });

// static checks on the module source
const srcPath = path.join(ROOT, 'src/world/vignettes.js');
const src = fs.readFileSync(srcPath, 'utf8');
const staticIssues = [];
if (/Math\.random\s*\(/.test(src)) staticIssues.push('Math.random() used (must be deterministic)');
if (/Mesh(Standard|Physical)Material|shadowMap|castShadow\s*=\s*true/.test(src)) staticIssues.push('forbidden material/shadow feature');
if (/https?:\/\//.test(src.replace(/\/\/.*$/gm, ''))) staticIssues.push('URL in source (no network allowed)');

// ---- bundle the page entry
const dir = path.join(ROOT, '.snap', 'vignettes');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'entry.js'), `
import * as THREE from 'three';
import { buildVignettes, buildVignette, VIGNETTE_IDS } from '../../src/world/vignettes.js';
import { addLights } from '../../src/core/lighting.js';
import { renderScenes } from '../../src/game/thumbs.js';
const W = 640, H = 480;
function sig(group) { // cheap geometry signature for the determinism check
  let s = 0, n = 0;
  group.updateMatrixWorld(true);
  group.traverse((o) => { const p = o.geometry?.attributes?.position; if (!p) return; n += p.count; for (let i = 0; i < p.count; i += 7) s += p.getX(i) * 1.3 + p.getY(i) * 2.7 + p.getZ(i) * 0.9; s += o.position.x + o.position.y * 3 + o.rotation.z; });
  return n + ':' + s.toFixed(4);
}
window.__run = (only, ovr = {}) => {
  const out = { stats: {}, images: {}, errors: [] };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  document.body.appendChild(renderer.domElement);
  const engine = { renderer };
  let list, list2;
  const t0 = performance.now();
  try { list = buildVignettes(); } catch (e) { out.errors.push('buildVignettes threw: ' + (e.stack || e)); return out; }
  out.buildMs = +(performance.now() - t0).toFixed(1);
  try { list2 = buildVignettes(); } catch (e) { out.errors.push('second build threw: ' + (e.stack || e)); return out; }
  out.ids = list.map((v) => v.id);
  out.buildEachMs = {};
  for (const id of VIGNETTE_IDS) { const t = performance.now(); buildVignette(id); out.buildEachMs[id] = +(performance.now() - t).toFixed(1); }
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  for (let k = 0; k < list.length; k++) {
    const v = list[k];
    if (only.length && !only.includes(v.id)) continue;
    const st = {};
    try {
      if (!(v.group instanceof THREE.Group)) out.errors.push(v.id + ': group is not a THREE.Group');
      for (const f of ['cam', 'target']) if (!Array.isArray(v[f]) || v[f].length !== 3 || v[f].some((x) => !Number.isFinite(x))) out.errors.push(v.id + ': bad ' + f);
      st.deterministic = sig(v.group) === sig(list2[k].group);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(v.sky || '#bfe3f4');
      addLights(scene); scene.fog = null;
      scene.add(v.group);
      const cam = new THREE.PerspectiveCamera(v.fov || 50, W / H, 0.05, 400);
      cam.position.set(...v.cam); cam.lookAt(new THREE.Vector3(...v.target));
      scene.updateMatrixWorld(true);
      renderer.info.autoReset = false; renderer.info.reset();
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      st.calls = renderer.info.render.calls; st.tris = renderer.info.render.triangles;
      const mats = new Set(), types = new Set(), tex = new Set(); let meshes = 0, transparent = 0, lights = 0;
      v.group.traverse((o) => {
        if (o.isLight) lights++;
        if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
        meshes++;
        for (const m of [].concat(o.material)) { mats.add(m); types.add(m.type); if (m.transparent) transparent++; if (m.map) tex.add(m.map); }
      });
      Object.assign(st, { meshes, materials: mats.size, types: [...types], transparent, textures: tex.size, lights, fov: v.fov || 50, sky: v.sky || null });
      const bad = [...types].filter((t) => !['MeshLambertMaterial', 'MeshBasicMaterial', 'ShaderMaterial', 'SpriteMaterial'].includes(t));
      if (bad.length) out.errors.push(v.id + ': material types ' + bad.join(','));
      if (st.calls > ${BUDGET.calls}) out.errors.push(v.id + ': draw calls ' + st.calls + ' > ${BUDGET.calls}');
      if (st.tris > ${BUDGET.tris}) out.errors.push(v.id + ': triangles ' + st.tris + ' > ${BUDGET.tris}');
      scene.remove(v.group);
    } catch (e) { out.errors.push(v.id + ': ' + (e.stack || e)); }
    out.stats[v.id] = st;
  }
  rt.dispose();
  renderer.info.autoReset = true;
  // the real path: the game's renderScenes (it also disposes the geometry afterwards)
  const sel = list2.filter((v) => !only.length || only.includes(v.id));
  if (ovr.cam) for (const v of sel) { v.cam = ovr.cam; if (ovr.target) v.target = ovr.target; }
  const t1 = performance.now();
  const canv = renderScenes(engine, sel, addLights, { w: W, h: H });
  out.renderMs = +(performance.now() - t1).toFixed(1);
  for (const [id, c] of Object.entries(canv)) out.images[id] = c.toDataURL('image/png');
  for (const v of sel) if (!canv[v.id]) out.errors.push(v.id + ': renderScenes produced no picture');
  return out;
};
window.__ready = true;
`);
let js;
try {
  const r = await esbuild.build({ entryPoints: [path.join(dir, 'entry.js')], bundle: true, format: 'iife', write: false, target: 'chrome110', logLevel: 'silent' });
  js = r.outputFiles[0].text;
} catch (e) {
  console.log(JSON.stringify({ ok: false, stage: 'bundle', errors: (e.errors || []).map((x) => `${x.location?.file}:${x.location?.line}: ${x.text}`) }, null, 1));
  process.exit(1);
}
const fontDir = path.join(ROOT, 'src/fonts');
const b64 = (f) => fs.readFileSync(path.join(fontDir, f)).toString('base64');
const FONT_CSS = `@font-face{font-family:"Baloo Bhaijaan 2";font-weight:400 800;src:url(data:font/woff2;base64,${b64('baloo-700-arabic.woff2')}) format("woff2");unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC;}
@font-face{font-family:"Baloo Bhaijaan 2";font-weight:400 800;src:url(data:font/woff2;base64,${b64('baloo-700-latin.woff2')}) format("woff2");unicode-range:U+0000-00FF,U+2000-206F;}`;
const pagePath = path.join(dir, 'index.html');
fs.writeFileSync(pagePath, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${FONT_CSS}html,body{margin:0;background:#223}</style></head><body><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);

// ---- drive it
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 700, height: 520 } });
const consoleLines = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleLines.push(m.type() + ': ' + m.text().slice(0, 400)); });
page.on('pageerror', (e) => consoleLines.push('pageerror: ' + String(e.stack || e.message).slice(0, 800)));
await page.goto('file://' + pagePath);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const res = await page.evaluate(([only, ovr]) => window.__run(only, ovr), [ONLY ? ONLY.split(',') : [], { cam: CAM_OVR && CAM_OVR.split(',').map(Number), target: TGT_OVR && TGT_OVR.split(',').map(Number) }]);
const files = [];
for (const [id, url] of Object.entries(res.images || {})) {
  const p = path.join(OUT, id + '.png');
  fs.writeFileSync(p, Buffer.from(url.split(',')[1], 'base64'));
  files.push({ id, file: p });
}
const missing = IDS.filter((id) => !(res.ids || []).includes(id));
const extra = (res.ids || []).filter((id) => !IDS.includes(id));
if (missing.length) res.errors.push('missing ids: ' + missing.join(','));
if (extra.length) res.errors.push('unexpected ids: ' + extra.join(','));

// ---- contact sheet: full-size pictures with stats, plus a row at headset thumbnail size (~300 px)
if (files.length) {
  const imgs = files.map((f) => ({ id: f.id, src: 'data:image/png;base64,' + fs.readFileSync(f.file).toString('base64'), st: res.stats[f.id] || {} }));
  const sheet = await browser.newPage({ viewport: { width: 3 * 648 + 8, height: 400 } });
  const fig = (i) => `<figure style="margin:0"><img src="${i.src}" style="width:640px;display:block;border-radius:6px"><figcaption>${i.id} · ${i.st.calls} calls · ${i.st.tris} tris · ${i.st.meshes} meshes${i.st.deterministic === false ? ' · NOT DETERMINISTIC' : ''}</figcaption></figure>`;
  const small = (i) => `<figure style="margin:0"><img src="${i.src}" style="width:300px;display:block;border-radius:10px;border:6px solid #fff"><figcaption>${i.id} @300px</figcaption></figure>`;
  await sheet.setContent(`<html><body style="margin:0;background:#223;font:15px sans-serif;color:#fff;padding:8px">
    <div style="display:grid;grid-template-columns:repeat(3,640px);gap:8px">${imgs.map(fig).join('')}</div>
    <div style="display:flex;gap:16px;margin-top:14px;background:#2c3b5c;padding:12px;border-radius:8px">${imgs.map(small).join('')}</div></body></html>`);
  await sheet.waitForTimeout(300);
  await sheet.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true });
}
await browser.close();

const errors = [...staticIssues, ...(res.errors || [])];
const summary = { ok: errors.length === 0 && !consoleLines.some((l) => l.startsWith('pageerror') || l.startsWith('error')), out: OUT, files: files.map((f) => path.basename(f.file)), buildMs: res.buildMs, buildEachMs: res.buildEachMs, renderMs: res.renderMs, stats: res.stats, errors, console: consoleLines.slice(0, 40) };
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
