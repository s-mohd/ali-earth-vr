// Render one module in the sandbox and save screenshots + stats.
//   node tools/snap.mjs station <quake|volcano|weather|erosion|human> [--t 0,0.25,0.5,0.75,1] [--views player,thumb,top,side] [--out dir]
//   node tools/snap.mjs ali [--poses idle,wave,...] [--out dir]
//   node tools/snap.mjs world [--views hub,hub_90,...] [--out dir]
// Prints a JSON summary (files, render stats, timings, errors). Also writes sheet.png (a labelled contact sheet of all shots).
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const kind = argv[0];
const key = kind === 'station' ? argv[1] : kind;
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
if (!['station', 'ali', 'world'].includes(kind) || !key) { console.error('usage: snap.mjs station <key> | ali | world'); process.exit(2); }
const name = kind === 'station' ? key : kind;
const OUT = path.resolve(opt('out', path.join(ROOT, 'shots/sb', name)));
const SIZE = (opt('size', '1280x800')).split('x').map(Number);
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));

// ---- bundle a per-module entry (other modules being broken cannot break this one)
const dir = path.join(ROOT, '.snap', name);
fs.mkdirSync(dir, { recursive: true });
const modPath = kind === 'station' ? `../../src/stations/${key}.js` : kind === 'ali' ? '../../src/world/ali.js' : '../../src/world/world.js';
const importLine = kind === 'station' ? `import build from '${modPath}';` : kind === 'ali' ? `import { buildAli as build } from '${modPath}';` : `import { buildWorld as build } from '${modPath}';`;
fs.writeFileSync(path.join(dir, 'entry.js'), `import { boot } from '../../tools/sandbox/harness.js';\n${importLine}\nboot({ kind: '${kind}', key: '${key}', build }).catch((e) => { window.__sbFatal = String(e && e.stack || e); });\n`);
let js;
try {
  const r = await esbuild.build({ entryPoints: [path.join(dir, 'entry.js')], bundle: true, format: 'iife', write: false, target: 'chrome110', logLevel: 'silent', sourcemap: 'inline' });
  js = r.outputFiles[0].text;
} catch (e) {
  console.log(JSON.stringify({ ok: false, stage: 'bundle', errors: (e.errors || []).map((x) => `${x.location?.file}:${x.location?.line}: ${x.text}`) }, null, 1));
  process.exit(1);
}
const fontDir = path.join(ROOT, 'src/fonts');
const b64 = (f) => fs.readFileSync(path.join(fontDir, f)).toString('base64');
const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:"Baloo Bhaijaan 2";font-weight:400 800;src:url(data:font/woff2;base64,${b64('baloo-700-arabic.woff2')}) format("woff2");unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC;}
@font-face{font-family:"Baloo Bhaijaan 2";font-weight:400 800;src:url(data:font/woff2;base64,${b64('baloo-700-latin.woff2')}) format("woff2");unicode-range:U+0000-00FF,U+2000-206F;}
html,body{margin:0;height:100%;overflow:hidden;background:#bfe3f4}#app{position:fixed;inset:0}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
const pagePath = path.join(dir, 'index.html');
fs.writeFileSync(pagePath, html);

// ---- drive it
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: SIZE[0], height: SIZE[1] } });
const consoleLines = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleLines.push(m.type() + ': ' + m.text().slice(0, 400)); });
page.on('pageerror', (e) => consoleLines.push('pageerror: ' + String(e.stack || e.message).slice(0, 800)));
await page.goto('file://' + pagePath);
try {
  await page.waitForFunction(() => window.__sb?.ready || window.__sbFatal, null, { timeout: 90000 });
} catch {}
const fatal = await page.evaluate(() => window.__sbFatal || (!window.__sb?.ready ? 'sandbox never became ready' : null));
if (fatal) {
  console.log(JSON.stringify({ ok: false, stage: 'build', fatal, console: consoleLines.slice(0, 30) }, null, 1));
  await browser.close();
  process.exit(1);
}
const files = [];
const stats = {};
async function shot(file, label, w = SIZE[0], h = SIZE[1]) {
  await page.setViewportSize({ width: w, height: h });
  const s = await page.evaluate(([w, h]) => window.__sb.render(w, h), [w, h]);
  const p = path.join(OUT, file);
  await page.screenshot({ path: p });
  files.push({ file: p, label });
  return s;
}

if (kind === 'station') {
  const info = await page.evaluate(() => ({ duration: window.__sb.duration, evidence: window.__sb.evidence, thumbT: window.__sb.thumbT, views: Object.keys(window.__sb.views), buildMs: window.__sb.buildMs }));
  Object.assign(stats, info);
  const ts = opt('t', '0,0.25,0.5,0.75,1').split(',').map(Number);
  const views = opt('views', 'player,thumb,top,side').split(',');
  for (const v of views) {
    if (!info.views.includes(v)) { consoleLines.push('missing view ' + v); continue; }
    const vts = v === 'thumb' ? [info.thumbT ?? 1] : ts;
    for (const t of vts) {
      await page.evaluate(([v, t]) => { const sb = window.__sb; sb.setProgress(t); sb.timeUpdate(8); sb.setView(v); }, [v, t]);
      const s = v === 'thumb' ? await shot(`thumb_t${t}.png`, `thumb t=${t}`, 800, 600) : await shot(`${v}_t${t}.png`, `${v} t=${t}`);
      stats[`${v}@${t}`] = s;
    }
  }
  await page.evaluate(() => { const sb = window.__sb; sb.setProgress(1); sb.timeUpdate(4); sb.showEvidence(true); sb.setView('player'); });
  stats.evidenceView = await shot('evidence.png', 'evidence markers (t=1)');
  await page.evaluate(() => window.__sb.showEvidence(false));
  // timing + full playthrough at 30 fps with sound cues
  const perf = await page.evaluate(async () => {
    const sb = window.__sb;
    const progressMs = sb.timeProgress(240);
    const updateMs = sb.timeUpdate(240);
    sb.sfx.log.length = 0;
    sb.setProgress(0); sb.play();
    const N = Math.max(30, Math.round(sb.duration * 30));
    for (let i = 0; i <= N; i++) { sb.setProgress(i / N); sb.update(1 / 30, i / 30); }
    sb.stop();
    // scrub back and forth (before/after) must be stable
    for (const t of [1, 0, 0.5, 1, 0]) sb.setProgress(t);
    return { progressMs: +progressMs.toFixed(3), updateMs: +updateMs.toFixed(3), sounds: sb.sfx.log.map((x) => x.slice(0, 2).join(':')), scene: sb.sceneStats() };
  });
  Object.assign(stats, perf);
} else if (kind === 'ali') {
  const poses = opt('poses', 'idle,wave,point,present,cheer,think,clap,talk').split(',');
  for (const p of poses) {
    await page.evaluate((p) => {
      const sb = window.__sb;
      sb.setTalking(p === 'talk');
      sb.setPose(p === 'talk' ? 'idle' : p);
      sb.pointAt(p === 'point' ? [1.6, 0.4, -3.6] : null);
      sb.lookAt(p === 'point' ? [1.6, 0.4, -3.6] : [0, 1.22, 0]);
      sb.timeUpdate(70, 1 / 60);
    }, p);
    stats[p] = await shot(`${p}_player.png`, `${p} (player view)`, 900, 700);
    await page.evaluate(() => window.__sb.setView('threeq'));
    await shot(`${p}_threeq.png`, `${p} (3/4 view)`, 700, 700);
    await page.evaluate(() => window.__sb.setView('player'));
  }
  await page.evaluate(() => { const sb = window.__sb; sb.setPose('idle'); sb.setTalking(true); sb.timeUpdate(40); sb.setView('close'); });
  await shot('face_talk.png', 'face close-up (talking)', 800, 800);
  await page.evaluate(() => { const sb = window.__sb; sb.setTalking(false); sb.timeUpdate(40); sb.setView('side'); });
  await shot('side.png', 'side', 700, 800);
  await page.evaluate(() => { window.__sb.setView('back'); });
  await shot('back.png', 'back', 700, 800);
  await page.evaluate(() => { window.__sb.setView('player'); });
  Object.assign(stats, await page.evaluate(() => ({ updateMs: +window.__sb.timeUpdate(240).toFixed(3), scene: window.__sb.sceneStats(), buildMs: window.__sb.buildMs })));
} else {
  const views = opt('views', 'hub,hub_90,hub_180,hub_270,quake,volcano,weather,erosion,human,hall,quake_back,aerial,aerialFar').split(',');
  for (const v of views) {
    await page.evaluate((v) => { const sb = window.__sb; sb.setView(v); sb.timeUpdate(6); }, v);
    stats[v] = await shot(`${v}.png`, v);
  }
  Object.assign(stats, await page.evaluate(() => ({ updateMs: +window.__sb.timeUpdate(240).toFixed(3), scene: window.__sb.sceneStats(), buildMs: window.__sb.buildMs })));
}
const errors = await page.evaluate(() => window.__sb.errors);

// ---- contact sheet
const cols = 3, cw = 560;
const imgs = files.map((f) => ({ src: 'data:image/png;base64,' + fs.readFileSync(f.file).toString('base64'), label: f.label }));
const sheet = await browser.newPage({ viewport: { width: cols * (cw + 8) + 8, height: 400 } });
await sheet.setContent(`<html><body style="margin:0;background:#223;display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:8px;padding:8px;font:14px sans-serif;color:#fff">${imgs.map((i) => `<figure style="margin:0"><img src="${i.src}" style="width:${cw}px;display:block"><figcaption>${i.label}</figcaption></figure>`).join('')}</body></html>`);
await sheet.waitForTimeout(300);
await sheet.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true });
await browser.close();

const summary = { ok: errors.length === 0 && !consoleLines.some((l) => l.startsWith('pageerror')), out: OUT, sheet: path.join(OUT, 'sheet.png'), files: files.map((f) => path.basename(f.file)), stats, errors, console: consoleLines.slice(0, 40) };
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
