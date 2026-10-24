// The HTML shell around the 3D canvas: loading screen, start screen (VR entry + safety), a small toolbar in screen
// mode, modals (help, settings, teacher dashboard, certificate), toasts, a caption bar and an aria-live mirror.
// Everything the child plays with lives in the 3D world; this layer only frames it.
import { PAL } from '../core/kit.js';
import { STATIONS, STATION, num, setGender, gender } from '../game/content.js';
import { drawCertificate, ALI_PARTS, STATION_GLYPHS, partsSVG } from './certificate.js';
import { renderTeacher, esc } from './teacher.js';

// ---------------------------------------------------------------- icons (24×24, stroke = currentColor; .f parts are filled)
const ICONS = {
  headset: '<path d="M3 9.2A2.7 2.7 0 0 1 5.7 6.5h12.6A2.7 2.7 0 0 1 21 9.2v5.1a2.7 2.7 0 0 1-2.7 2.7h-3.1a1.6 1.6 0 0 1-1.4-.8l-.6-1.1a1.4 1.4 0 0 0-2.4 0l-.6 1.1a1.6 1.6 0 0 1-1.4.8H5.7A2.7 2.7 0 0 1 3 14.3z"/><path d="M7 10.5h2.5M14.5 10.5H17"/>',
  screen: '<rect x="3" y="4.5" width="18" height="12" rx="2.2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  soundOn: '<path class="f" d="M4 9.2h3.2L12 5v14l-4.8-4.2H4z"/><path d="M15.5 9.3a3.8 3.8 0 0 1 0 5.4M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  soundOff: '<path class="f" d="M4 9.2h3.2L12 5v14l-4.8-4.2H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  recenter: '<circle cx="12" cy="12" r="6.5"/><circle class="f" cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  fullscreenExit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.6a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.3 1-1.3 1.9v.4"/><circle class="f" cx="12" cy="17.3" r="1.1"/>',
  settings: '<path d="M4 7h9M17.5 7H20M4 17h3M11.5 17H20"/><circle cx="15.2" cy="7" r="2.3"/><circle cx="9.2" cy="17" r="2.3"/>',
  teacher: '<rect x="3" y="3.5" width="18" height="12.5" rx="1.8"/><path d="M6.5 12.5l3.2-3.4 2.8 2 4.5-4.6M8.5 20.5l2-4.5M15.5 20.5l-2-4.5"/>',
  home: '<path d="M3.5 11.2L12 4l8.5 7.2"/><path d="M6 9.6V20h12V9.6"/><path d="M10 20v-5.2h4V20"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  download: '<path d="M12 4v11M7.2 10.4L12 15.2l4.8-4.8M5 20h14"/>',
  print: '<path d="M7 9V3.8h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6.2H7z"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 5.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5"/>',
  table: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M3.5 14.8h17M10 4v16"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.2 7l.9 13h9.8l.9-13M10.2 11v5.5M13.8 11v5.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M7 7l10 10M17 7L7 17"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.8 4.2v4.3h-4.3"/>',
  unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7.2a4 4 0 0 1 7.6-1.7"/><circle class="f" cx="12" cy="15.5" r="1.5"/>',
  chevron: '<path d="M14.5 6l-6 6 6 6"/>',
  star: '<path class="f" d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z"/>',
  medal: '<circle cx="12" cy="9" r="5.5"/><path d="M8.6 13.4L7 21l5-2.6 5 2.6-1.6-7.6"/><path class="f" d="M12 6.2l.9 1.9 2 .2-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.2z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.2 20a5.8 5.8 0 0 1 11.6 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.6 14.3A4.4 4.4 0 0 1 21 18.5"/>',
  space: '<circle cx="12" cy="12" r="9" stroke-dasharray="2.6 2.6"/><circle cx="12" cy="9" r="2"/><path d="M8.6 16.6a3.4 3.4 0 0 1 6.8 0"/>',
  shield: '<path d="M12 3l7.5 3v5.2c0 4.6-3.2 8.1-7.5 9.8-4.3-1.7-7.5-5.2-7.5-9.8V6z"/><path d="M12 8v5"/><circle class="f" cx="12" cy="16" r="1.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle class="f" cx="12" cy="7.8" r="1.2"/>',
  ray: '<path class="f" d="M3.3 20.7a1.7 1.7 0 0 1 0-2.4l3.3-3.3 2.4 2.4-3.3 3.3a1.7 1.7 0 0 1-2.4 0z"/><circle cx="9.4" cy="14.6" r="2.9"/><path d="M12.4 11.6l4-4" stroke-dasharray="1.6 2.2"/><circle cx="19" cy="5" r="2.6"/><circle class="f" cx="19" cy="5" r="1"/>',
  pinch: '<path d="M3.5 4.5l7.6 7" stroke-width="3.2"/><path d="M3.5 19.5l7.6-6.6" stroke-width="3.2"/><path d="M15.2 12.2h4.6M14.6 8.4l3-2.4M14.6 16l3 2.4"/>',
  gaze: '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  stick: '<circle cx="12" cy="12" r="4.4"/><circle class="f" cx="12" cy="12" r="1.8"/><path d="M1.8 12h3.6M18.6 12h3.6M4.2 9.2L1.6 12l2.6 2.8M19.8 9.2l2.6 2.8-2.6 2.8"/>',
  drag: '<rect x="8.5" y="3.5" width="7" height="11" rx="3.5"/><path d="M12 3.5v3.5M3 18.5h18M6 16l-3 2.5L6 21M18 16l3 2.5-3 2.5"/>',
  tap: '<path d="M9.5 11V5.2a1.6 1.6 0 0 1 3.2 0V10l4.2.9a2 2 0 0 1 1.6 2.2l-.6 5.2a2.6 2.6 0 0 1-2.6 2.2h-4a2.6 2.6 0 0 1-2.1-1.1l-3-4.2a1.5 1.5 0 0 1 2.3-1.9z"/><path d="M6.4 6.2a5 5 0 0 1 9.2 0"/>',
  keys: '<rect x="9" y="3.5" width="6" height="6" rx="1.4"/><rect x="2.5" y="12.5" width="6" height="6" rx="1.4"/><rect x="9" y="12.5" width="6" height="6" rx="1.4"/><rect x="15.5" y="12.5" width="6" height="6" rx="1.4"/>',
  voice: '<path d="M4 5.5h16v10.5H10l-4.5 3.8V16H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  music: '<path d="M9 17.5V6.2l10.5-2.2v11.4"/><circle class="f" cx="6.8" cy="17.6" r="2.4"/><circle class="f" cx="17.3" cy="15.5" r="2.4"/>',
  sfx: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle class="f" cx="12" cy="12" r="2.6"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10.5h4M13.5 10.5H17M7 14.5h7"/>',
  height: '<path d="M6 3.5v17M3.8 5.7L6 3.5l2.2 2.2M3.8 18.3L6 20.5l2.2-2.2"/><circle cx="15" cy="6" r="2.2"/><path d="M15 8.5v6.5M12 11h6M13 20.5l2-5.5 2 5.5"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  stamp: '<path d="M9.5 9.5l-.5-2.5a3 3 0 1 1 6 0l-.5 2.5"/><rect x="4.5" y="10" width="15" height="5" rx="1.6"/><path d="M5 19h14"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.2v1.2A3 3 0 0 0 7.2 10M17 6h2.8v1.2a3 3 0 0 1-3 2.8M12 14v3.5M8 20.5h8M9.5 17.5h5"/>',
};
export const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
const ALI_SVG = partsSVG(ALI_PARTS, 100);
const glyph = (key, color) => partsSVG(STATION_GLYPHS[key], 24, { fg: '#ffffff', bg: color, accent: PAL.sun });

// ---------------------------------------------------------------- tiny DOM helpers
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
const $ = (root, sel) => root.querySelector(sel);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Print only the given markup (the rest of the page is hidden by the print stylesheet). */
function printHTML(html, orientation = 'portrait') {
  const root = document.getElementById('print-root');
  const page = document.getElementById('print-page');
  root.innerHTML = html;
  page.textContent = `@page{size:A4 ${orientation};margin:${orientation === 'landscape' ? 6 : 12}mm}`;
  const done = () => { root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 60);
}

/** The game reports build steps as keys ('world', 'station:quake', ...); show friendly words instead. */
function loadingText(label) {
  if (!label) return '';
  if (/[\u0600-\u06FF]/.test(label)) return label;
  const [key, arg] = String(label).split(':');
  if (key === 'station' && STATION[arg]) return `نجهّز محطة ${STATION[arg].short || STATION[arg].name}…`;
  return { fonts: 'نجهّز الكلمات…', world: 'نبني الجزيرة والبحر…', ali: 'علي يستعدّ للمغامرة…', thumbs: 'نلتقط صور التحدي…', ready: 'هيا بنا!' }[key] || '';
}

// ---------------------------------------------------------------- the shell
export function createShell({ store, TEXT, xrSupported, onStart, onSetting, onResetProgress, onRecenter, onExit }) {
  const S = store.settings;
  let xr = false, busy = false, presenting = false, startVisible = false, captionTimer = 0, lastFocus = null, soundMemory = null;
  const setSetting = (key, value) => {
    store.set(key, value);
    onSetting?.(key, value);
    syncSettings();
  };
  const captionsOn = () => S.captions !== false;
  const anySound = () => S.voice || S.sfx || S.music;

  // ---------------- static layer (built once)
  const [tagA, tagB] = (() => { const p = TEXT.lesson.split(' · '); return [p.slice(0, -1).join(' · '), p[p.length - 1]]; })();
  const journey = STATIONS.map((s) => `<li style="--c:${s.color}"><span class="journey__dot">${glyph(s.key, s.color)}</span><span class="journey__name">${esc(s.short || s.name)}</span></li>`).join('')
    + `<li class="journey__goal" style="--c:${PAL.sun}"><span class="journey__dot">${icon('trophy')}</span><span class="journey__name">${esc(TEXT.hallTitle)}</span></li>`;
  const root = el(`<div class="shell">
    <div class="start" id="start" hidden>
      <section class="start__card" role="region" aria-labelledby="start-title" tabindex="-1">
        <div class="ribbon" aria-hidden="true">${STATIONS.map((s) => `<i style="background:${s.color}"></i>`).join('')}</div>
        <header class="start__head">
          <div class="start__ali" aria-hidden="true">${ALI_SVG}</div>
          <div class="start__titles">
            <p class="tags"><span class="tag tag--teal">${esc(tagA)}</span><span class="tag tag--lav">${esc(tagB)}</span></p>
            <h1 id="start-title" class="start__title">${esc(TEXT.title)}</h1>
            <p class="start__sub">${esc(TEXT.subtitle)}</p>
          </div>
        </header>
        <ol class="journey" aria-label="${esc(TEXT.goal)}">${journey}</ol>
        <div class="field who">
          <label class="field__label" for="start-name">${icon('stamp')}<span class="who__label"></span> <small>اختياري، يظهر على الشهادة</small></label>
          <div class="who__row">
            <div class="seg seg--who" role="radiogroup" aria-label="المستكشف أم المستكشفة">
              <label><input type="radio" name="gender" value="m"><span>مستكشف</span></label>
              <label><input type="radio" name="gender" value="f"><span>مستكشفة</span></label>
            </div>
            <input id="start-name" type="text" maxlength="28" autocomplete="off" spellcheck="false" placeholder="اسمي…" enterkeyhint="go">
          </div>
        </div>
        <div class="start__actions">
          <button type="button" class="btn btn--primary btn--hero" data-start="vr" hidden>${icon('headset')}<span>ندخلُ بالنظّارة</span></button>
          <button type="button" class="btn btn--secondary btn--hero" data-start="screen">${icon('screen')}<span>نلعبُ على الشاشة</span></button>
        </div>
        <section class="safety" aria-labelledby="safety-title" hidden>
          <h2 id="safety-title">${icon('shield')}قبل لبس النظارة</h2>
          <ul>
            <li>${icon('space')}<span>مساحة خالية وآمنة حول اللاعب</span></li>
            <li>${icon('users')}<span>بإشراف المعلّم أو أحد الكبار</span></li>
            <li>${icon('clock')}<span>استراحة كل ${num(10)} دقيقة</span></li>
            <li>${icon('info')}<span>اتّباع إرشادات العمر الخاصة بالنظارة</span></li>
          </ul>
        </section>
        <p class="noxr" hidden>${icon('info')}<span>اللعب بالنظارة يحتاج متصفح نظارة <b dir="ltr">Meta Quest</b> وفتح الصفحة عبر رابط آمن <b dir="ltr">https://</b> — ويمكن اللعب على الشاشة الآن.</span></p>
        <nav class="start__links" aria-label="روابط">
          <button type="button" class="link" data-act="help">${icon('help')}طريقة اللعب</button>
          <button type="button" class="link" data-act="settings">${icon('settings')}الإعدادات</button>
          <button type="button" class="link" data-act="teacher">${icon('teacher')}لوحة المعلّم</button>
        </nav>
      </section>
    </div>
    <nav class="toolbar" aria-label="أدوات" hidden>
      <button type="button" class="tb" data-act="sound" data-tip="الصوت" aria-pressed="true" aria-label="الصوت">${icon('soundOn')}</button>
      <button type="button" class="tb tb--vr" data-act="vr" data-tip="الدخول بالنظارة" aria-label="الدخول بالنظارة" hidden>${icon('headset')}</button>
      <button type="button" class="tb" data-act="recenter" data-tip="ضبط الرؤية" aria-label="ضبط الرؤية: انظر إلى الأمام">${icon('recenter')}</button>
      <button type="button" class="tb" data-act="fullscreen" data-tip="ملء الشاشة" aria-label="ملء الشاشة" aria-pressed="false">${icon('fullscreen')}</button>
      <span class="tb-sep" aria-hidden="true"></span>
      <button type="button" class="tb" data-act="help" data-tip="طريقة اللعب" aria-label="طريقة اللعب">${icon('help')}</button>
      <button type="button" class="tb" data-act="settings" data-tip="الإعدادات" aria-label="الإعدادات">${icon('settings')}</button>
      <button type="button" class="tb" data-act="teacher" data-tip="لوحة المعلّم" aria-label="لوحة المعلّم">${icon('teacher')}</button>
      <button type="button" class="tb" data-act="home" data-tip="شاشة البداية" aria-label="العودة إلى شاشة البداية">${icon('home')}</button>
    </nav>
    <div class="status" hidden>
      <span class="status__place">${icon('pin')}<b></b></span>
      <span class="status__stamps">${icon('stamp')}<span class="status__dots" aria-hidden="true">${STATIONS.map((s) => `<i style="--c:${s.color}"></i>`).join('')}</span><span class="status__count"></span></span>
    </div>
    <div class="caption" aria-hidden="true" hidden><span class="caption__ali">${ALI_SVG}</span><p></p></div>
    <div class="sr-only" role="status" aria-live="polite" id="sr-caption"></div>
    <div class="toasts" role="status" aria-live="polite"></div>
  </div>`);
  document.body.append(root);
  document.body.append(el('<div id="print-root" aria-hidden="true"></div>'), el('<style id="print-page"></style>'));

  const start = $(root, '.start'), toolbar = $(root, '.toolbar'), status = $(root, '.status');
  const caption = $(root, '.caption'), captionText = $(root, '.caption p'), live = $(root, '#sr-caption'), toasts = $(root, '.toasts');
  const nameInput = $(root, '#start-name'), vrBtn = $(root, '[data-start="vr"]'), screenBtn = $(root, '[data-start="screen"]');
  const loading = document.getElementById('loading');

  // Keys typed in the shell must not steer the 3D camera.
  start.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });

  // ---------------- XR availability
  Promise.resolve(xrSupported).catch(() => false).then((ok) => {
    xr = !!ok;
    vrBtn.hidden = !xr; $(root, '.safety').hidden = !xr; $(root, '.noxr').hidden = xr;
    $(root, '.tb--vr').hidden = !xr;
    screenBtn.classList.toggle('btn--primary', !xr); screenBtn.classList.toggle('btn--secondary', xr);
  });

  // ---------------- learner: boy or girl (Bahraini primary classes are single-sex; the lesson script follows it)
  const whoLabel = $(root, '.who__label');
  function syncGender() {
    const g = gender();
    root.querySelectorAll('input[name="gender"]').forEach((r) => { r.checked = r.value === g; });
    whoLabel.textContent = g === 'f' ? 'اسم المستكشفة' : 'اسم المستكشف';
  }
  setGender(S.gender);
  syncGender();
  $(root, '.seg--who').addEventListener('change', (e) => { setGender(e.target.value); setSetting('gender', gender()); syncGender(); });

  // ---------------- start
  function startGame(mode) {
    if (busy) return;
    const name = nameInput.value.trim().slice(0, 28);
    if (name !== (S.name || '')) setSetting('name', name);
    busy = true;
    const btn = mode === 'vr' ? vrBtn : screenBtn;
    btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
    let result;
    try { result = onStart?.(mode); } catch (e) { result = Promise.reject(e); } // called synchronously: keeps the user gesture for XR
    Promise.resolve(result).then(
      () => { hideStart(); },
      () => { toast(mode === 'vr' ? 'تعذّر تشغيل النظارة. نحاول مرة أخرى، أو نلعب على الشاشة.' : 'تعذّر بدء اللعب. نحاول مرة أخرى.', 4200); },
    ).finally(() => { busy = false; btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); });
  }
  vrBtn.onclick = () => startGame('vr');
  screenBtn.onclick = () => startGame('screen');
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); startGame(xr ? 'vr' : 'screen'); } });

  // ---------------- toolbar + links
  const actions = {
    help: () => openHelp(),
    settings: () => openSettings(),
    teacher: () => openTeacher(),
    home: () => (onExit ? onExit() : showStart()),
    vr: () => startGame('vr'),
    recenter: () => { onRecenter?.(); toast('تمّ ضبط الرؤية إلى الأمام.', 1800); },
    sound: () => {
      if (anySound()) { soundMemory = { voice: S.voice, sfx: S.sfx, music: S.music }; for (const k of ['voice', 'sfx', 'music']) if (S[k]) setSetting(k, false); toast('الصوت مكتوم.', 1500); }
      else { const m = soundMemory || { voice: true, sfx: true, music: true }; for (const k of ['voice', 'sfx', 'music']) if (m[k]) setSetting(k, true); toast('الصوت يعمل.', 1500); }
    },
    fullscreen: () => {
      const d = document;
      if (d.fullscreenElement) d.exitFullscreen?.();
      else d.documentElement.requestFullscreen?.().catch(() => toast('ملء الشاشة غير متاح هنا.'));
    },
  };
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && actions[b.dataset.act] && !b.closest('dialog')) actions[b.dataset.act](); });
  const fsBtn = $(root, '[data-act="fullscreen"]');
  if (!document.fullscreenEnabled) fsBtn.hidden = true;
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    fsBtn.innerHTML = icon(on ? 'fullscreenExit' : 'fullscreen');
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.dataset.tip = on ? 'الخروج من ملء الشاشة' : 'ملء الشاشة';
  });

  function syncSettings() {
    const on = !!anySound(), b = $(root, '[data-act="sound"]');
    b.innerHTML = icon(on ? 'soundOn' : 'soundOff');
    b.setAttribute('aria-pressed', String(on));
    b.dataset.tip = on ? 'كتم الصوت' : 'تشغيل الصوت';
    if (!captionsOn()) caption.hidden = true;
  }
  function syncChrome() {
    const screenMode = !presenting && !startVisible;
    toolbar.hidden = !screenMode;
    status.hidden = !screenMode || !status.dataset.ready;
    if (!screenMode) caption.hidden = true;
  }

  // ---------------- loading
  function setLoading(fraction, label) {
    if (!loading) return;
    const p = Math.round(Math.max(0, Math.min(1, fraction || 0)) * 100);
    loading.style.setProperty('--p', p + '%');
    const bar = loading.querySelector('[role="progressbar"]');
    bar?.setAttribute('aria-valuenow', String(p));
    const pc = loading.querySelector('.loading__pct'); if (pc) pc.textContent = num(p) + '٪';
    const text = loadingText(label);
    if (text) { const l = loading.querySelector('.loading__label'); if (l) l.textContent = text; }
  }
  function ready() {
    setLoading(1);
    if (loading) {
      loading.setAttribute('aria-busy', 'false');
      loading.classList.add('is-done');
      setTimeout(() => { loading.hidden = true; }, reduceMotion() ? 0 : 650);
    }
    showStart();
  }

  // ---------------- start screen visibility
  function showStart() {
    closeModals();
    nameInput.value = S.name || '';
    syncGender();
    start.hidden = false; startVisible = true;
    // under the loading screen: appear at once, so the loading fade reveals a finished card (no ghosting)
    if (loading && !loading.hidden) { start.classList.add('is-in', 'no-anim'); requestAnimationFrame(() => requestAnimationFrame(() => start.classList.remove('no-anim'))); }
    else requestAnimationFrame(() => start.classList.add('is-in'));
    syncChrome();
    setTimeout(() => $(start, '.start__card').focus({ preventScroll: true }), 50);
  }
  function hideStart() {
    if (!startVisible) return;
    startVisible = false;
    start.classList.remove('is-in');
    start.hidden = true;
    syncChrome();
  }
  function setPresenting(on) {
    presenting = !!on;
    if (presenting) { hideStart(); closeModals(); }
    syncChrome();
  }

  // ---------------- captions, toasts, status
  function say(text) {
    const t = String(text || '').trim();
    live.textContent = t;
    clearTimeout(captionTimer);
    if (!t || !captionsOn() || presenting || startVisible) { caption.hidden = true; return; }
    captionText.textContent = t;
    caption.hidden = false;
    caption.classList.remove('is-new'); void caption.offsetWidth; caption.classList.add('is-new');
    captionTimer = setTimeout(() => { caption.hidden = true; }, Math.max(4000, (t.length / 12.5 + 2.5) * 1000));
  }
  function toast(text, ms = 2600) {
    // an open modal dialog sits in the top layer: host the toasts inside it so they stay visible
    const host = [...root.querySelectorAll('dialog[open]')].pop() || root;
    if (toasts.parentNode !== host) host.append(toasts);
    const t = el(`<div class="toast">${esc(text)}</div>`);
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstElementChild.remove();
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, ms);
  }
  function setStatus({ stamps = 0, total = STATIONS.length, place = '' } = {}) {
    status.dataset.ready = '1';
    $(status, '.status__place b').textContent = place || '';
    $(status, '.status__place').hidden = !place;
    status.querySelectorAll('.status__dots i').forEach((d, i) => { d.classList.toggle('on', i < stamps); d.hidden = i >= total; });
    $(status, '.status__count').textContent = TEXT.stampsOf(stamps, total);
    $(status, '.status__stamps').setAttribute('aria-label', `${TEXT.passport}: ${TEXT.stampsOf(stamps, total)}`);
    syncChrome();
  }

  // ---------------- modals
  function makeModal(kind, { title, ic, tone }) {
    const d = el(`<dialog class="modal modal--${kind}" aria-labelledby="m-${kind}">
      <div class="modal__panel">
        <header class="modal__head tone-${tone}"><span class="modal__badge">${icon(ic)}</span><h2 id="m-${kind}" tabindex="-1">${title}</h2>
          <button type="button" class="modal__close" data-close aria-label="إغلاق">${icon('close')}</button></header>
        <div class="modal__body"></div>
        <footer class="modal__foot"></footer>
      </div></dialog>`);
    root.append(d);
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    d.addEventListener('close', () => {
      if (toasts.parentNode === d) root.append(toasts);
      if (!root.querySelector('dialog[open]')) lastFocus?.focus?.({ preventScroll: true });
    });
    return { d, body: $(d, '.modal__body'), foot: $(d, '.modal__foot') };
  }
  const modals = {};
  const modal = (kind, opts) => (modals[kind] ||= makeModal(kind, opts));
  function show(m) {
    if (presenting) return;
    if (!root.querySelector('dialog[open]')) lastFocus = document.activeElement;
    for (const k in modals) if (modals[k] !== m && modals[k].d.open && !modals[k].d.classList.contains('modal--confirm')) modals[k].d.close();
    if (!m.d.open) m.d.showModal();
    m.body.scrollTop = 0;
    $(m.d, 'h2').focus({ preventScroll: true });
  }
  function closeModals() { for (const k in modals) if (modals[k].d.open) modals[k].d.close(); }

  function confirmBox({ title, text, ok = 'نعم', danger = false }) {
    const m = modal('confirm', { title: '', ic: 'info', tone: 'coral' });
    $(m.d, 'h2').textContent = title;
    m.body.innerHTML = `<p class="confirm__text">${esc(text)}</p>`;
    m.foot.innerHTML = `<button type="button" class="btn btn--secondary btn--small" data-close>تراجع</button>
      <button type="button" class="btn ${danger ? 'btn--danger-solid' : 'btn--primary'} btn--small" data-ok>${esc(ok)}</button>`;
    const prev = document.activeElement;
    return new Promise((resolve) => {
      let answer = false;
      $(m.foot, '[data-ok]').onclick = () => { answer = true; m.d.close(); };
      m.d.addEventListener('close', () => {
        resolve(answer);
        // the trigger may be re-rendered by the answer: fall back to the heading of the dialog underneath
        setTimeout(() => (prev?.isConnected ? prev : root.querySelector('dialog[open] h2'))?.focus({ preventScroll: true }), 0);
      }, { once: true });
      m.d.showModal();
      $(m.foot, '[data-close]').focus();
    });
  }

  // help
  function openHelp() {
    const m = modal('help', { title: 'طريقة اللعب', ic: 'help', tone: 'teal' });
    const item = (ic, b, t) => `<li><span class="how__ic">${icon(ic)}</span><span><b>${b}</b>${t}</span></li>`;
    const step = (n, ic, t) => `<li><span class="flow__ic">${icon(ic)}<b>${num(n)}</b></span><span>${t}</span></li>`;
    m.body.innerHTML = `
      <div class="flow">
        <section class="flow__group tone-teal"><h3>${icon('pin')}في كل محطة من المحطات الخمس</h3><ol>
          ${step(1, 'voice', 'نستمع إلى علي')}${step(2, 'gaze', 'نضغط «شاهِد» ونراقب التغيّر')}${step(3, 'tap', 'نبحث عن الدليلين')}${step(4, 'stamp', 'نجمع الختم')}
        </ol></section>
        <section class="flow__group tone-sun"><h3>${icon('star')}في النهاية</h3><ol>${step(5, 'trophy', 'قاعة التحدي والشهادة')}</ol></section>
      </div>
      <div class="how">
        <section class="how__card tone-sky"><h3>${icon('screen')}على الشاشة</h3><ul>
          ${item('drag', 'نسحب بالفأرة أو بالإصبع', 'لننظر حولنا، أو نستخدم مفاتيح الأسهم.')}
          ${item('tap', 'ننقر على الزر أو البطاقة', 'لنختار. على الجهاز اللوحي: نلمس الزر.')}
          ${item('recenter', 'ضبط الرؤية', 'زرّ في الأعلى يعيدنا إلى النظر للأمام.')}
        </ul></section>
        <section class="how__card tone-teal"><h3>${icon('headset')}بالنظارة</h3><ul>
          ${item('ray', 'نوجّه الشعاع ثم نضغط الزناد', 'الزناد تحت إصبع السبّابة.')}
          ${item('pinch', 'بأيدينا: نشير ثم نقرص', 'نلمس الإبهام بإصبع السبّابة.')}
          ${item('gaze', 'أو ننظر إلى الزر قليلًا', 'حتى تمتلئ الدائرة فيُختار.')}
          ${item('stick', 'نحرّك العصا يمينًا أو يسارًا', 'لنستدير دون أن نتحرّك من مكاننا.')}
        </ul></section>
      </div>
      <section class="safety safety--wide" aria-label="السلامة"><h2>${icon('shield')}السلامة مع النظارة</h2><ul>
        <li>${icon('space')}<span>اللعب في مساحة خالية، وقوفًا أو جلوسًا</span></li>
        <li>${icon('users')}<span>بإشراف المعلّم أو أحد الكبار</span></li>
        <li>${icon('clock')}<span>استراحة كل ${num(10)} دقيقة لإراحة العينين</span></li>
        <li>${icon('info')}<span>اتّباع إرشادات العمر الخاصة بالنظارة</span></li>
      </ul></section>`;
    m.foot.innerHTML = '<button type="button" class="btn btn--primary" data-close>فهمت!</button>';
    show(m);
  }

  // settings
  function openSettings() {
    const m = modal('settings', { title: 'الإعدادات', ic: 'settings', tone: 'lav' });
    const sw = (key, ic, tone, label, hint, on) => `<label class="setting"><span class="setting__ic tone-${tone}">${icon(ic)}</span>
      <span class="setting__txt"><b>${label}</b><small>${hint}</small></span>
      <input type="checkbox" role="switch" class="switch" data-key="${key}"${on ? ' checked' : ''}></label>`;
    const h = S.height || 'auto';
    m.body.innerHTML = `
      ${sw('voice', 'voice', 'teal', 'صوت علي', 'يقرأ علي الكلام بصوت مسموع إن توفّر صوت عربي.', S.voice)}
      ${sw('sfx', 'sfx', 'orange', 'المؤثرات الصوتية', 'أصوات الأزرار والزلزال والبركان والماء.', S.sfx)}
      ${sw('music', 'music', 'coral', 'الموسيقى', 'لحن هادئ في الخلفية.', S.music)}
      ${sw('captions', 'captions', 'sky', 'شريط الكلام على الشاشة', 'يُظهر كلام علي مكتوبًا أسفل الشاشة.', captionsOn())}
      <div class="setting setting--col"><span class="setting__ic tone-green">${icon('height')}</span>
        <span class="setting__txt"><b id="h-label">الطول في النظارة</b><small>اختاروا «جلوس» إذا كان الطفل يلعب على كرسي.</small></span>
        <div class="seg" role="radiogroup" aria-labelledby="h-label">
          ${[['auto', 'تلقائي'], ['seated', 'جلوس'], ['standing', 'وقوف']].map(([v, t]) => `<label><input type="radio" name="height" value="${v}"${h === v ? ' checked' : ''}><span>${t}</span></label>`).join('')}
        </div></div>`;
    m.body.onchange = (e) => {
      const t = e.target;
      if (t.dataset.key) setSetting(t.dataset.key, t.checked);
      else if (t.name === 'height') setSetting('height', t.value);
    };
    m.foot.innerHTML = '<button type="button" class="btn btn--primary" data-close>تم</button>';
    show(m);
  }

  // teacher
  function openTeacher() {
    const m = modal('teacher', { title: 'لوحة المعلّم <small>نتائج قاعة التحدي على هذا الجهاز</small>', ic: 'teacher', tone: 'ink' });
    renderTeacher(m.body, { store, icon, toast, confirm: confirmBox, print: printHTML, download, setSetting, onResetProgress, footer: m.foot });
    show(m);
  }

  // certificate
  function openCertificate({ name, score, total, date } = {}) {
    const m = modal('cert', { title: esc(TEXT.certificateTitle), ic: 'medal', tone: 'sun' });
    const given = String(name ?? S.name ?? '').trim();
    const data = { name: given === TEXT.certificateDefaultName ? '' : given, score, total, date: date ?? Date.now() };
    m.body.innerHTML = `<div class="cert">
        <canvas class="cert__canvas" width="1600" height="1131" role="img" aria-label="${esc(TEXT.certificateTitle)}"></canvas>
        <label class="field field--inline"><span class="field__label">${icon('stamp')}الاسم على الشهادة</span>
          <input type="text" maxlength="28" autocomplete="off" spellcheck="false" placeholder="${esc(TEXT.certificateDefaultName)}" value="${esc(data.name)}"></label>
      </div>`;
    m.foot.innerHTML = `<button type="button" class="btn btn--accent" data-cert="png">${icon('download')}تنزيل الشهادة (PNG)</button>
      <button type="button" class="btn btn--secondary" data-cert="print">${icon('print')}طباعة</button>`;
    const cnv = $(m.body, 'canvas'), ctx = cnv.getContext('2d'), input = $(m.body, 'input');
    const draw = () => drawCertificate(ctx, cnv.width, cnv.height, data);
    draw();
    document.fonts?.load('800 40px "Baloo Bhaijaan 2"', 'شهادة — A').then(draw, () => {});
    input.oninput = () => { data.name = input.value.trim(); draw(); };
    input.onchange = () => { if (data.name !== (S.name || '')) setSetting('name', data.name); };
    m.foot.onclick = (e) => {
      const b = e.target.closest('[data-cert]');
      if (!b) return;
      const file = `شهادة-المستكشف${data.name ? '-' + data.name.replace(/[\\/:*?"<>|]/g, '') : ''}.png`;
      if (b.dataset.cert === 'png') {
        cnv.toBlob((blob) => blob && download(blob, file), 'image/png');
        toast('تم تنزيل الشهادة.');
      } else printHTML(`<img class="print-cert" src="${cnv.toDataURL('image/png')}" alt="">`, 'landscape');
    };
    show(m);
  }

  syncSettings();
  return {
    setLoading, ready, showStart, hideStart, setPresenting, say, toast, setStatus,
    openHelp, openSettings, openTeacher, openCertificate, closeModals,
    get modalOpen() { return !!root.querySelector('dialog[open]'); },
    get startVisible() { return startVisible; },
  };
}
