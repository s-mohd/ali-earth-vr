// Teacher dashboard: results of the challenge hall saved on this device, per-concept accuracy, the most common
// confusion, an attempts table with drill-down, CSV export, copy/print, and the class settings.
import { QUIZ, STATIONS, CONCEPT_NAME, PASS } from '../game/content.js';
import { arDate as arDateAny, partsSVG, STATION_GLYPHS } from './certificate.js';
import { PAL } from '../core/kit.js';

const CONCEPTS = QUIZ.map((q) => q.concept);
const COLOR = Object.fromEntries(STATIONS.map((s) => [s.key, s.color]));
const PASS_PCT = PASS / QUIZ.length;
// Teacher data keeps Western digits (they line up in tables and paste cleanly into spreadsheets).
const arDate = (d, o = {}) => arDateAny(d, { ...o, digits: 'latn' });

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => `${Math.round(x * 100)}%`;
const num = (x) => (Math.round(x * 10) / 10).toString();
const mmss = (sec) => (Number.isFinite(sec) && sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '—');
/** Arabic counted noun: 1 → "مرة واحدة", 2 → "مرتان", 3–10 → "3 مرات", 11+ → "11 مرة". */
function counted(n, [one, two, few, many]) {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${n % 100 >= 3 && n % 100 <= 10 ? few : many}`;
}
const times = (n) => counted(n, ['مرة واحدة', 'مرتان', 'مرات', 'مرة']);
const attemptsWord = (n) => counted(n, ['محاولة واحدة', 'محاولتان', 'محاولات', 'محاولة']);
const level = (x) => (x >= PASS_PCT ? 'good' : x >= 0.6 ? 'mid' : 'low');
const LEVEL_TEXT = { good: 'إتقان', mid: 'قريب من الإتقان', low: 'بحاجة إلى مراجعة' };

export const isPassed = (a) => (typeof a.passed === 'boolean' ? a.passed : a.total > 0 && a.score / a.total >= PASS_PCT - 1e-9);
const answerFor = (a, q) => (a.answers || []).find((x) => x.id === q.id || x.concept === q.concept);

/** All numbers the dashboard shows, from the raw attempts. */
export function summarize(attempts) {
  const n = attempts.length;
  const pass = attempts.filter(isPassed).length;
  const mean = (f) => (n ? attempts.reduce((s, a) => s + (f(a) || 0), 0) / n : 0);
  const concept = Object.fromEntries(CONCEPTS.map((c) => [c, { right: 0, total: 0, wrong: {} }]));
  const pairs = new Map();
  const dist = new Array(QUIZ.length + 1).fill(0);
  for (const a of attempts) {
    if (a.total === QUIZ.length && a.score >= 0 && a.score <= QUIZ.length) dist[a.score]++;
    for (const ans of a.answers || []) {
      const c = concept[ans.concept];
      if (!c) continue;
      c.total++;
      if (ans.correct) { c.right++; continue; }
      if (!ans.chosenConcept || ans.chosenConcept === ans.concept) continue;
      c.wrong[ans.chosenConcept] = (c.wrong[ans.chosenConcept] || 0) + 1;
      const [x, y] = [ans.concept, ans.chosenConcept].sort();
      const key = x + '|' + y;
      const p = pairs.get(key) || { a: x, b: y, count: 0, dir: {} };
      p.count++;
      const dk = ans.concept + '>' + ans.chosenConcept;
      p.dir[dk] = (p.dir[dk] || 0) + 1;
      pairs.set(key, p);
    }
  }
  const confusions = [...pairs.values()].sort((p, q) => q.count - p.count);
  const last = n ? attempts.reduce((m, a) => (new Date(a.date) > new Date(m.date) ? a : m)) : null;
  return {
    n, pass, passRate: n ? pass / n : 0, avgScore: mean((a) => a.score), avgPct: mean((a) => (a.total ? a.score / a.total : 0)),
    avgDur: mean((a) => a.durationSec), concept, confusions, dist, last, flagged: attempts.filter((a) => needsWeatherErosion(a)).length,
  };
}

const wrongConcepts = (a) => (a.answers || []).filter((x) => !x.correct).map((x) => x.concept);
/** Flag for the teacher even when the child passed: weathering vs erosion is the key distinction of the lesson. */
const MASTERY_NOTE = 'التمييز بين التجوية والتعرية لم يثبت بعد';
const needsWeatherErosion = (a) => wrongConcepts(a).some((c) => c === 'weather' || c === 'erosion');
const formName = (a) => (a.form === 'B' ? 'ب' : a.form === 'A' ? 'أ' : '');

// ---------------------------------------------------------------- exports (CSV, plain-text summary)
const two = (v) => String(v).padStart(2, '0');
function csvCell(v) { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
export function toCSV(attempts) {
  const head = ['#', 'التاريخ', 'الوقت', 'الاسم', 'النموذج', 'الدرجة', 'من', 'النسبة المئوية', 'النتيجة', 'المدة (دقيقة:ثانية)', 'المفاهيم الخاطئة', 'ملاحظة',
    ...QUIZ.map((q, i) => `س${i + 1}: ${CONCEPT_NAME[q.concept]}`)];
  const rows = attempts.map((a, i) => {
    const d = new Date(a.date);
    return [i + 1, `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, `${two(d.getHours())}:${two(d.getMinutes())}`,
      a.name || '', formName(a), a.score, a.total, a.total ? Math.round((a.score / a.total) * 100) : '', isPassed(a) ? 'نجاح' : 'بحاجة إلى مراجعة', mmss(a.durationSec),
      wrongConcepts(a).map((c) => CONCEPT_NAME[c]).join('، '), needsWeatherErosion(a) ? MASTERY_NOTE : '',
      ...QUIZ.map((q) => { const x = answerFor(a, q); return !x ? '' : x.correct ? 'صحيحة' : `خاطئة (الاختيار: ${CONCEPT_NAME[x.chosenConcept] || '—'})`; })];
  });
  return '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
export function summaryText(st) {
  const lines = [
    'مغامرة المستكشف علي — نتائج قاعة التحدي',
    `تاريخ التقرير: ${arDate(Date.now(), { time: true })}`,
    `عدد المحاولات: ${st.n}`,
  ];
  if (st.n) {
    lines.push(
      `نسبة النجاح (${PASS} من ${QUIZ.length} فأكثر): ${pct(st.passRate)} (${st.pass} من ${st.n})`,
      `متوسط الدرجة: ${num(st.avgScore)} من ${QUIZ.length} (${pct(st.avgPct)})`,
      `متوسط المدة: ${mmss(st.avgDur)} دقيقة`,
      'دقة كل مفهوم: ' + CONCEPTS.map((c) => `${CONCEPT_NAME[c]} ${st.concept[c].total ? pct(st.concept[c].right / st.concept[c].total) : '—'}`).join(' · '),
    );
    const top = st.confusions[0];
    lines.push(top ? `أكثر خلط شائع: ${CONCEPT_NAME[top.a]} ↔ ${CONCEPT_NAME[top.b]} (${times(top.count)})` : 'لا يوجد خلط بين المفاهيم.');
    if (st.flagged) lines.push(`${MASTERY_NOTE}: ${st.flagged} من ${st.n} محاولات`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- markup
const glyph = (c) => partsSVG(STATION_GLYPHS[c], 24, { fg: '#ffffff', bg: COLOR[c], accent: PAL.sun });
const chip = (c) => `<span class="cchip" style="--c:${COLOR[c]}"><i></i>${esc(CONCEPT_NAME[c])}</span>`;

/** Six tiny columns (score 0–5), green from the pass mark up: the distribution behind the average. */
function miniDist(st) {
  const max = Math.max(1, ...st.dist);
  const cols = st.dist.map((c, s) => `<span class="mdist__col${s >= PASS ? ' is-pass' : ''}"><i style="height:${c ? Math.max(12, (c / max) * 100) : 0}%"></i><b>${s}</b></span>`).join('');
  return `<span class="mdist" role="img" aria-label="توزيع الدرجات: ${st.dist.map((c, s) => `${attemptsWord(c)} بدرجة ${s}`).join('، ')}" title="${st.dist.map((c, s) => `${s}: ${c}`).join(' · ')}">${cols}</span>`;
}

function tilesHTML(st, icon) {
  const tile = (tone, ic, label, value, sub, extra = '') => `<div class="tile tile--${tone}"><span class="tile__ic">${icon(ic)}</span>
    <span class="tile__label">${label}</span><span class="tile__value">${value}</span>${extra}<span class="tile__sub">${sub}</span></div>`;
  const meter = `<span class="meter" aria-hidden="true"><i style="width:${Math.round(st.passRate * 100)}%"></i><b style="inset-inline-start:${PASS_PCT * 100}%"></b></span>`;
  return `<section class="tiles" aria-label="ملخّص">
    ${tile('sky', 'users', 'المحاولات', st.n, st.last ? `آخرها ${esc(arDate(st.last.date, { time: true }))}` : 'لا توجد محاولات بعد')}
    ${tile('green', 'medal', 'نسبة النجاح', st.n ? pct(st.passRate) : '—', st.n ? `${st.pass} من ${st.n} حقّقوا ${PASS} من ${QUIZ.length} فأكثر` : `علامة النجاح ${PASS} من ${QUIZ.length}`, st.n ? meter : '')}
    ${tile('orange', 'star', 'متوسط الدرجة', st.n ? `${num(st.avgScore)}<small> من ${QUIZ.length}</small>` : '—', st.n ? `توزيع الدرجات من 0 إلى ${QUIZ.length}` : 'خمسة أسئلة في كل محاولة', st.n ? miniDist(st) : '')}
    ${tile('lav', 'clock', 'متوسط المدة', st.n ? `${mmss(st.avgDur)}<small> د</small>` : '—', 'من بداية التحدي إلى النتيجة')}
  </section>`;
}

function conceptsHTML(st) {
  const rows = CONCEPTS.map((c) => {
    const { right, total, wrong } = st.concept[c], x = total ? right / total : 0, lv = total ? level(x) : 'none';
    const [pick, n] = Object.entries(wrong).sort((p, q) => q[1] - p[1])[0] || [];
    return `<div class="cbar" title="${esc(CONCEPT_NAME[c])}: ${right} من ${total} إجابات صحيحة">
      <span class="cbar__chip" style="--c:${COLOR[c]}">${glyph(c)}</span>
      <span class="cbar__name">${esc(CONCEPT_NAME[c])}</span>
      <span class="cbar__track"><i class="lv-${lv}" style="width:${total ? Math.max(2, x * 100) : 0}%"></i><b style="inset-inline-start:${PASS_PCT * 100}%"></b></span>
      <span class="cbar__val"><b>${total ? pct(x) : '—'}</b>${total ? `<small>${right} من ${total}</small>` : ''}</span>
      <span class="lvl lv-${lv}">${total ? LEVEL_TEXT[lv] : 'لا بيانات'}</span>
      ${pick ? `<span class="cbar__miss">الخطأ الأكثر: اختاروا ${chip(pick)} ${times(n)}</span>` : ''}
    </div>`;
  }).join('');
  return `<section class="tcard tcard--concepts"><h3>دقة الإجابة لكل مفهوم</h3>
    <p class="tcard__hint">نسبة الإجابات الصحيحة عن سؤال كل مفهوم. الخط الرأسي = علامة الإتقان ${pct(PASS_PCT)}.</p>
    <div class="cbars">${rows}</div>
    <p class="legend"><span class="lvl lv-good">إتقان: ${pct(PASS_PCT)} فأكثر</span><span class="lvl lv-mid">قريب من الإتقان: 60–79%</span><span class="lvl lv-low">بحاجة إلى مراجعة: أقل من 60%</span></p>
  </section>`;
}

function tipFor(a, b) {
  const pair = [a, b].sort().join('|');
  if (pair === 'erosion|weather') return 'ذكّروا الطلاب: التجوية = تفتّت الصخرة في مكانها، والتعرية = انتقال التربة والفتات. شاهدوا المقارنة في محطة التعرية.';
  return `أعيدوا زيارة محطتَي «${CONCEPT_NAME[a]}» و«${CONCEPT_NAME[b]}» وقارنوا بين الدليلين في كل منهما.`;
}
function confusionHTML(st) {
  const top = st.confusions[0];
  if (!top) {
    return `<section class="tcard tcard--confusion"><h3>أكثر خلط شائع</h3><p class="empty-mini">لا يوجد خلط بين المفاهيم. أحسنتم!</p></section>`;
  }
  const d1 = top.dir[`${top.a}>${top.b}`] || 0, d2 = top.dir[`${top.b}>${top.a}`] || 0;
  const dirText = [d1 && `اختاروا «${CONCEPT_NAME[top.b]}» بدل «${CONCEPT_NAME[top.a]}» ${times(d1)}`, d2 && `واختاروا «${CONCEPT_NAME[top.a]}» بدل «${CONCEPT_NAME[top.b]}» ${times(d2)}`].filter(Boolean).join('، ');
  const more = st.confusions.slice(1, 3).map((p) => `<li>${chip(p.a)}<span class="swap">↔</span>${chip(p.b)}<span class="muted">${times(p.count)}</span></li>`).join('');
  return `<section class="tcard tcard--confusion"><h3>أكثر خلط شائع</h3>
    <div class="conf">${chip(top.a)}<span class="swap" aria-label="مع">↔</span>${chip(top.b)}<strong>${times(top.count)}</strong></div>
    <p class="conf__dir">${dirText}.</p>
    <p class="tip">${tipFor(top.a, top.b)}</p>
    ${more ? `<ul class="conf__more">${more}</ul>` : ''}
  </section>`;
}

function emptyHTML(icon) {
  return `<section class="tcard empty">${icon('teacher')}<p>لا توجد نتائج بعد</p>
    <p class="muted">بعد أن يُنهي الطالب أسئلة قاعة التحدي الخمسة على هذا الجهاز، تظهر هنا نسبة النجاح ودقة كل مفهوم وأكثر خلط شائع وجدول المحاولات.</p>
    <ol class="empty__tips">
      <li>${icon('stamp')}<span>اكتبوا الاسم في شاشة البداية ليظهر في الجدول وعلى الشهادة.</span></li>
      <li>${icon('refresh')}<span>قبل اللاعب التالي: «إعادة تقدّم اللعب» من الأسفل ليبدأ من المحطة الأولى.</span></li>
      <li>${icon('table')}<span>نزّلوا النتائج بصيغة CSV قبل مسح المحاولات.</span></li>
    </ol></section>`;
}

function attemptsHTML(attempts, icon) {
  const rows = attempts.map((a, i) => ({ a, i })).reverse().map(({ a, i }) => {
    const ok = isPassed(a), wrong = wrongConcepts(a);
    const details = QUIZ.map((q, k) => {
      const x = answerFor(a, q);
      if (!x) return '';
      return `<li class="${x.correct ? 'is-ok' : 'is-no'}">${icon(x.correct ? 'check' : 'cross')}<b>س${k + 1}</b>${chip(q.concept)}<span>${esc(x.q || q.A?.q || '')}</span>
        ${x.correct ? '' : `<em>الاختيار: ${esc(CONCEPT_NAME[x.chosenConcept] || '—')}</em>`}</li>`;
    }).join('');
    return `<tr>
      <td class="num">${i + 1}</td>
      <td>${esc(arDate(a.date, { time: true }))}</td>
      <td class="name">${a.name ? esc(a.name) : '<span class="muted">بدون اسم</span>'}</td>
      <td class="num"><b>${a.score}</b> / ${a.total}</td>
      <td class="num">${a.total ? pct(a.score / a.total) : '—'}</td>
      <td><span class="badge ${ok ? 'badge--pass' : 'badge--fail'}">${icon(ok ? 'check' : 'refresh')}${ok ? 'نجاح' : 'بحاجة إلى مراجعة'}</span></td>
      <td class="num">${mmss(a.durationSec)}</td>
      <td>${wrong.length ? wrong.map(chip).join('') : '<span class="muted">لا يوجد</span>'}${needsWeatherErosion(a) ? `<small class="flag">${MASTERY_NOTE}</small>` : ''}</td>
      <td class="no-print"><button class="more" type="button" data-act="row" aria-expanded="false" aria-label="تفاصيل إجابات المحاولة ${i + 1}">${icon('chevron')}</button></td>
    </tr>
    <tr class="detail" hidden><td colspan="9"><ol class="answers">${details}</ol></td></tr>`;
  }).join('');
  return `<section class="tcard tcard--attempts"><h3>المحاولات <span class="count">${attempts.length}</span></h3>
    <div class="table-wrap" tabindex="0" role="region" aria-label="جدول المحاولات"><table class="ttable">
      <thead><tr><th>#</th><th>التاريخ والوقت</th><th>الاسم</th><th>الدرجة</th><th>النسبة</th><th>النتيجة</th><th>المدة</th><th>المفاهيم الخاطئة</th><th class="no-print"><span class="sr-only">تفاصيل</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </section>`;
}

function settingsHTML(settings, icon, hasAttempts) {
  return `<section class="tcard tcard--settings no-print"><h3>إعدادات الصف</h3>
    <label class="setting"><span class="setting__ic tone-teal">${icon('unlock')}</span>
      <span class="setting__txt"><b>فتح جميع المحطات</b><small>يسمح بزيارة أي محطة بأي ترتيب (للمراجعة أو العرض أمام الصف).</small></span>
      <input type="checkbox" role="switch" class="switch" data-act="unlock"${settings.unlockAll ? ' checked' : ''}></label>
    <div class="setting"><span class="setting__ic tone-orange">${icon('refresh')}</span>
      <span class="setting__txt"><b>إعادة تقدّم اللعب</b><small>يمسح الأختام والأدلة المكتشفة على هذا الجهاز لتبدأ مغامرة جديدة من المحطة الأولى. لا يمسح النتائج.</small></span>
      <button type="button" class="btn btn--small btn--secondary" data-act="reset">إعادة البدء</button></div>
    <div class="setting"><span class="setting__ic tone-coral">${icon('trash')}</span>
      <span class="setting__txt"><b>مسح المحاولات</b><small>يحذف جميع نتائج قاعة التحدي من هذا الجهاز. نزّلوا ملف CSV أولًا للاحتفاظ بها.</small></span>
      <button type="button" class="btn btn--small btn--danger" data-act="clear"${hasAttempts ? '' : ' disabled'}>مسح النتائج</button></div>
    <p class="privacy">${icon('shield')}تُحفظ هذه البيانات في متصفح هذا الجهاز فقط، ولا تُرسل إلى أي مكان.</p>
  </section>`;
}

/**
 * Fill the dashboard modal. ctx: { store, icon, toast, confirm, print, download, onSetting, onResetProgress, footer }
 * The footer element receives the export actions.
 */
export function renderTeacher(body, ctx) {
  const { store, icon, toast, confirm, footer } = ctx;
  const draw = () => {
    const attempts = store.attempts || [];
    const st = summarize(attempts);
    body.innerHTML = `<div class="teacher">
      ${attempts.length ? `<div class="report">
        <header class="print-head"><h1>مغامرة المستكشف علي — تقرير قاعة التحدي</h1><p>${esc(arDate(Date.now(), { time: true }))}</p></header>
        ${tilesHTML(st, icon)}
        <div class="tgrid">${conceptsHTML(st)}${confusionHTML(st)}</div>
        ${attemptsHTML(attempts, icon)}
      </div>` : emptyHTML(icon)}
      ${settingsHTML(store.settings, icon, attempts.length > 0)}
    </div>`;
    footer.innerHTML = `<div class="foot-group">
        <button type="button" class="btn btn--secondary btn--small" data-act="csv"${attempts.length ? '' : ' disabled'}>${icon('table')}تنزيل CSV</button>
        <button type="button" class="btn btn--secondary btn--small" data-act="copy"${attempts.length ? '' : ' disabled'}>${icon('copy')}نسخ الملخّص</button>
        <button type="button" class="btn btn--secondary btn--small" data-act="print"${attempts.length ? '' : ' disabled'}>${icon('print')}طباعة</button>
      </div>
      <button type="button" class="btn btn--primary btn--small" data-close>تم</button>`;
  };

  const act = async (name, el) => {
    const attempts = store.attempts || [];
    if (name === 'row') {
      const open = el.getAttribute('aria-expanded') !== 'true';
      el.setAttribute('aria-expanded', String(open));
      el.closest('tr').nextElementSibling.hidden = !open;
    } else if (name === 'csv') {
      const d = new Date();
      ctx.download(new Blob([toCSV(attempts)], { type: 'text/csv;charset=utf-8' }), `ali-earth-results-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.csv`);
      toast('تم تنزيل ملف النتائج (CSV).');
    } else if (name === 'copy') {
      const ok = await copyText(summaryText(summarize(attempts)));
      toast(ok ? 'تم نسخ الملخّص. الصقه في رسالة أو مستند.' : 'تعذّر النسخ في هذا المتصفح.');
    } else if (name === 'print') {
      ctx.print(body.querySelector('.report').outerHTML, 'portrait');
    } else if (name === 'clear') {
      if (await confirm({ title: 'مسح جميع المحاولات؟', text: `سيُحذف ${attemptsWord(attempts.length)} من هذا الجهاز نهائيًا.`, ok: 'نعم، امسح', danger: true })) {
        store.clearAttempts(); draw(); toast('تم مسح المحاولات.');
      }
    } else if (name === 'reset') {
      if (await confirm({ title: 'إعادة تقدّم اللعب؟', text: 'ستعود جميع المحطات مقفلة، وتُمسح الأختام والأدلة المكتشفة. تبقى نتائج التحدي كما هي.', ok: 'نعم، أعِد البدء' })) {
        if (ctx.onResetProgress) ctx.onResetProgress(); else store.resetProgress();
        toast('بدأت مغامرة جديدة من البداية.');
      }
    }
  };
  const onClick = (e) => { const el = e.target.closest('[data-act]'); if (el && el.type !== 'checkbox') act(el.dataset.act, el); };
  body.onclick = onClick; footer.onclick = onClick;
  body.onchange = (e) => {
    if (e.target.dataset.act !== 'unlock') return;
    ctx.setSetting('unlockAll', e.target.checked);
    toast(e.target.checked ? 'جميع المحطات مفتوحة الآن.' : 'عادت المحطات إلى الترتيب.');
  };
  draw();
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;inset:0';
  (document.querySelector('dialog[open]') || document.body).append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}
