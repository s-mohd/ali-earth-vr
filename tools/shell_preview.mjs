// Preview the HTML shell (loading, start, help, settings, teacher, certificate, play chrome) with a mock store and a
// painted stand-in for the 3D scene, at desktop, tablet and phone sizes.
//   node tools/shell_preview.mjs [--sizes 1280x800,820x1180,390x844] [--out shots/shell] [--build-only]
// Writes PNGs to the output folder and prints a JSON report (files, overflow/accessibility checks, console errors).
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const OUT = path.resolve(opt('out', path.join(ROOT, 'shots/shell')));
const SIZES = opt('sizes', '1280x800,820x1180,390x844').split(',').map((s) => s.split('x').map(Number));
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));

// ---- preview entry: the real shell + mock store + a painted "scene"
const dir = path.join(ROOT, '.snap', 'shell');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'entry.js'), `
import { createShell } from '../../src/shell/shell.js';
import { drawCertificate } from '../../src/shell/certificate.js';
import { toCSV } from '../../src/shell/teacher.js';
import { TEXT, QUIZ, STATIONS, setGender } from '../../src/game/content.js';

const q = new URLSearchParams(location.search);
const names = ['مريم', 'يوسف', 'فاطمة', '', 'حسن عبدالله', 'نورة'];
const plan = [[1,1,1,1,1], [1,1,0,1,1], [1,1,0,0,1], [1,1,1,0,1], [0,1,0,0,1], [1,1,1,1,0]];
const wrongPick = { quake: 'volcano', volcano: 'erosion', weather: 'erosion', erosion: 'weather', human: 'quake' };
const attempts = plan.map((p, i) => ({
  date: new Date(2026, 9, 20 + Math.floor(i / 2), 9 + i, 5 + i * 7).toISOString(), name: names[i],
  score: p.reduce((a, b) => a + b, 0), total: 5, durationSec: 150 + i * 37,
  answers: QUIZ.map((qq, k) => ({ id: qq.id, q: qq.q, choice: p[k] ? qq.correct : (qq.correct + 1) % 3, correct: !!p[k], concept: qq.concept,
    chosenConcept: p[k] ? qq.concept : (i === 5 && k === 4 ? 'quake' : wrongPick[qq.concept]) })),
}));
const data = { settings: { voice: true, sfx: true, music: true, name: '', height: 'auto', unlockAll: false, speed: 1 }, attempts: q.has('empty') ? [] : attempts, progress: {} };
const store = {
  data, get settings() { return data.settings; }, get attempts() { return data.attempts; },
  set(k, v) { data.settings[k] = v; }, save() {}, clearAttempts() { data.attempts = []; }, resetProgress() {},
};

// stand-in for the live 3D scene
const c = document.createElement('canvas'); document.getElementById('app').append(c);
function paint() {
  const W = (c.width = innerWidth), H = (c.height = innerHeight), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#6fbfe8'); g.addColorStop(0.55, '#c9e8f5'); g.addColorStop(0.62, '#f7e9d7');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#7fd0e6'; x.fillRect(0, H * 0.58, W, H);
  x.fillStyle = '#f1dcae'; x.beginPath(); x.ellipse(W / 2, H * 1.02, W * 0.75, H * 0.38, 0, 0, 7); x.fill();
  x.fillStyle = '#a8d98a'; x.beginPath(); x.ellipse(W / 2, H * 1.06, W * 0.62, H * 0.34, 0, 0, 7); x.fill();
  for (let i = 0; i < 7; i++) { const px = W * (0.08 + i * 0.14), py = H * (0.66 + (i % 2) * 0.05); x.strokeStyle = '#a87a52'; x.lineWidth = 10; x.beginPath(); x.moveTo(px, py + 120); x.quadraticCurveTo(px + 12, py + 50, px, py); x.stroke(); x.fillStyle = '#64ad5a'; for (let k = 0; k < 6; k++) { x.beginPath(); x.ellipse(px + Math.cos(k) * 34, py + Math.sin(k) * 10, 46, 13, k, 0, 7); x.fill(); } }
  STATIONS.forEach((s, i) => { x.fillStyle = s.color; x.beginPath(); x.arc(W * (0.2 + i * 0.15), H * 0.5, 22, 0, 7); x.fill(); });
}
paint(); addEventListener('resize', paint);

const shell = createShell({
  store, TEXT, xrSupported: Promise.resolve(q.get('xr') !== '0'),
  onStart: () => Promise.resolve(), onSetting: () => {}, onResetProgress: () => {}, onRecenter: () => {},
});
window.__shell = shell; window.__csv = () => toCSV(store.attempts);
window.__certPNG = (w = 1600, h = 1131, g = 'm', name = 'يوسف') => { setGender(g); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; drawCertificate(cv.getContext('2d'), w, h, { name, score: 4, total: 5, date: new Date(2026, 9, 23) }); setGender('m'); return cv.toDataURL('image/png'); };
`);
let js;
try {
  const r = await esbuild.build({ entryPoints: [path.join(dir, 'entry.js')], bundle: true, format: 'iife', write: false, target: 'chrome110', logLevel: 'silent', charset: 'utf8' });
  js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
} catch (e) {
  console.log(JSON.stringify({ ok: false, stage: 'bundle', errors: (e.errors || []).map((x) => `${x.location?.file}:${x.location?.line}: ${x.text}`) }, null, 1));
  process.exit(1);
}
// same placeholder substitution as build.mjs
const b64 = (f) => fs.readFileSync(path.join(ROOT, 'src/fonts', f)).toString('base64');
const fonts = `@font-face{font-family:"Baloo Bhaijaan 2";font-weight:400 800;src:url(data:font/woff2;base64,${b64('baloo-700-arabic.woff2')}) format("woff2");unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC;}
@font-face{font-family:"Baloo Bhaijaan 2";font-weight:400 800;src:url(data:font/woff2;base64,${b64('baloo-700-latin.woff2')}) format("woff2");unicode-range:U+0000-00FF,U+2000-206F;}`;
const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8')
  .replace('/*@FONTS*/', () => fonts).replace('/*@CSS*/', () => fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8')).replace('/*@JS*/', () => js);
const pagePath = path.join(dir, 'index.html');
fs.writeFileSync(pagePath, html);
if (argv.includes('--build-only')) { console.log(pagePath); process.exit(0); }

// ---- drive it
const browser = await chromium.launch();
const report = { ok: true, files: [], checks: {}, console: [] };
const settle = (page, ms = 450) => page.waitForTimeout(ms);
async function open(size, query = '') {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) report.console.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => report.console.push('pageerror: ' + String(e.stack || e.message).slice(0, 600)));
  await page.goto('file://' + pagePath + query);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function shot(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file });
  report.files.push(file);
}
// horizontal overflow of the page, or of anything inside the open modal / start card (scrolling tables excepted)
const overflowX = (page) => page.evaluate(() => {
  if (document.documentElement.scrollWidth > innerWidth + 1) return 'page';
  const box = document.querySelector('dialog[open] .modal__body') || document.querySelector('.start:not([hidden]) .start__card');
  if (!box) return false;
  const r = box.getBoundingClientRect();
  for (const el of box.querySelectorAll('*')) {
    if (el.parentElement.closest('.table-wrap')) continue;
    const q = el.getBoundingClientRect();
    if (q.width && (q.left < r.left - 1 || q.right > r.right + 1)) return (el.className?.baseVal ?? el.className) || el.tagName;
  }
  return false;
});
const scrollModal = (page) => page.evaluate(() => { const b = document.querySelector('dialog[open] .modal__body'); if (b) b.scrollTop = b.scrollHeight; });

for (const size of SIZES) {
  const tag = size.join('x');
  const page = await open(size);
  const checks = (report.checks[tag] = {});
  await page.evaluate(() => window.__shell.setLoading(0.42, 'نزرع النخيل ونملأ البحر…'));
  await settle(page, 300);
  await shot(page, `${tag}_01_loading`);
  await page.evaluate(() => window.__shell.ready());
  await settle(page, 900);
  await shot(page, `${tag}_02_start`);
  checks.startOverflow = await overflowX(page);
  checks.startFocus = await page.evaluate(() => document.activeElement?.dataset?.start || document.activeElement?.tagName);
  if (size[1] < 900) { await page.evaluate(() => { const s = document.querySelector('.start'); s.scrollTop = s.scrollHeight; }); await shot(page, `${tag}_02b_start_bottom`); }

  await page.evaluate(() => window.__shell.openHelp()); await settle(page);
  await shot(page, `${tag}_03_help`);
  checks.helpOverflow = await overflowX(page);
  checks.focusInDialog = await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'));
  if (size[0] < 900) { await scrollModal(page); await shot(page, `${tag}_03b_help_bottom`); }
  await page.keyboard.press('Escape'); await settle(page, 200);
  checks.escapeCloses = await page.evaluate(() => !document.querySelector('dialog[open]'));

  await page.evaluate(() => window.__shell.openSettings()); await settle(page);
  await shot(page, `${tag}_04_settings`);
  checks.settingsOverflow = await overflowX(page);
  await page.evaluate(() => window.__shell.closeModals());

  await page.evaluate(() => window.__shell.openTeacher()); await settle(page);
  await shot(page, `${tag}_05_teacher`);
  checks.teacherOverflow = await overflowX(page);
  await page.evaluate(() => { const b = document.querySelector('dialog[open] .modal__body .tcard--attempts'); b?.scrollIntoView(); document.querySelector('dialog[open] [data-act="row"]')?.click(); });
  await settle(page, 250);
  await shot(page, `${tag}_05b_teacher_table`);
  await scrollModal(page); await settle(page, 150);
  await shot(page, `${tag}_05c_teacher_bottom`);
  if (size[0] >= 1000) {
    await page.click('dialog[open] [data-act="clear"]'); await settle(page, 350);
    await shot(page, `${tag}_05d_teacher_confirm`);
    await page.click('dialog.modal--confirm [data-close]'); await settle(page, 150);
    await page.click('dialog[open] [data-act="copy"]'); await settle(page, 350);
    await shot(page, `${tag}_05e_teacher_toast`);
    checks.toastInDialog = await page.evaluate(() => !!document.querySelector('dialog[open] .toasts .toast'));
  }
  checks.csv = await page.evaluate(() => { const t = window.__csv(); return { bom: t.charCodeAt(0) === 0xfeff, rows: t.split('\r\n').length, head: t.slice(1, 60) }; });
  await page.evaluate(() => window.__shell.closeModals());

  await page.evaluate(() => window.__shell.openCertificate({ name: 'مريم', score: 4, total: 5, date: new Date(2026, 9, 23) })); await settle(page, 700);
  await shot(page, `${tag}_06_certificate`);
  checks.certOverflow = await overflowX(page);
  await page.evaluate(() => window.__shell.closeModals());

  // screen-mode chrome: toolbar, status, caption, toast
  await page.click('[data-start="screen"]'); await settle(page, 300);
  await page.evaluate(() => { const s = window.__shell; s.setStatus({ stamps: 2, total: 5, place: 'البركان' }); s.say('انظر إلى هذا الجبل! إنه بركان. اضغط «شاهِد» لنرى ما يخرج من فوهته!'); s.toast('تم ضبط الرؤية: أنت تنظر إلى الأمام.'); });
  await page.hover('[data-act="recenter"]').catch(() => {});
  await settle(page, 400);
  await shot(page, `${tag}_07_play`);
  checks.toolbarVisible = await page.evaluate(() => !document.querySelector('.toolbar').hidden);
  await page.evaluate(() => window.__shell.setPresenting(true)); await settle(page, 100);
  checks.hiddenWhilePresenting = await page.evaluate(() => document.querySelector('.toolbar').hidden && document.querySelector('.status').hidden && document.querySelector('.caption').hidden);
  await page.close();
}

// variants at desktop size: no XR, empty dashboard, full-resolution certificate
{
  const page = await open(SIZES[0], '?xr=0');
  await page.evaluate(() => window.__shell.ready()); await settle(page, 900);
  await shot(page, `${SIZES[0].join('x')}_08_start_noxr`);
  await page.close();
  const p2 = await open(SIZES[0], '?empty');
  await p2.evaluate(() => { window.__shell.ready(); window.__shell.openTeacher(); }); await settle(p2, 900);
  await shot(p2, `${SIZES[0].join('x')}_09_teacher_empty`);
  await p2.close();
  // print layouts (window.print stubbed; print media emulated on an A4-ish viewport)
  const p3 = await open([794, 1123]);
  await p3.evaluate(() => { window.print = () => {}; window.__shell.ready(); window.__shell.openTeacher(); document.querySelector('dialog[open] [data-act="print"]').click(); });
  await settle(p3, 300); await p3.emulateMedia({ media: 'print' });
  await p3.screenshot({ path: path.join(OUT, 'print_teacher.png'), fullPage: true }); report.files.push(path.join(OUT, 'print_teacher.png'));
  await p3.emulateMedia({ media: 'screen' });
  await p3.evaluate(() => { window.__shell.openCertificate({ name: 'مريم', score: 4, total: 5 }); });
  await settle(p3, 500);
  await p3.evaluate(() => document.querySelector('dialog[open] [data-cert="print"]').click());
  await settle(p3, 300); await p3.setViewportSize({ width: 1123, height: 794 }); await p3.emulateMedia({ media: 'print' });
  await p3.screenshot({ path: path.join(OUT, 'print_certificate.png') }); report.files.push(path.join(OUT, 'print_certificate.png'));
  await p3.close();
  const p4 = await open(SIZES[0]);
  const png = await p4.evaluate(() => window.__certPNG());
  const certFile = path.join(OUT, 'certificate_full.png');
  fs.writeFileSync(certFile, Buffer.from(png.split(',')[1], 'base64'));
  report.files.push(certFile);
  const pngF = await p4.evaluate(() => window.__certPNG(1600, 1131, 'f', 'مريم عبدالله'));
  const certFileF = path.join(OUT, 'certificate_girl.png');
  fs.writeFileSync(certFileF, Buffer.from(pngF.split(',')[1], 'base64'));
  report.files.push(certFileF);
  const png2 = await p4.evaluate(() => window.__certPNG(1024, 724));
  const certFile2 = path.join(OUT, 'certificate_vr_1024.png');
  fs.writeFileSync(certFile2, Buffer.from(png2.split(',')[1], 'base64'));
  report.files.push(certFile2);
  await p4.close();
}
await browser.close();
report.ok = !report.console.some((l) => l.startsWith('pageerror') || l.startsWith('error'));
console.log(JSON.stringify(report, null, 1));
