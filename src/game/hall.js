// Challenge hall: 5 picture questions (A form first, B form on retries, options shuffled), feedback for each wrong option,
// active correction (the child selects the glowing right answer), results with stars, certificate on an easel.
import * as THREE from 'three';
import { TEXT, QUIZ, PASS, STATION, CONCEPT_NAME, shortName } from './content.js';
import { PAL, rng } from '../core/kit.js';
import { Panel, Card, drawText, drawPill, drawIcon, roundRect } from '../core/ui.js';
import { drawCertificate } from '../shell/certificate.js';
import { Console, buildEasel, faceYaw, BTN } from './widgets.js';

export class HallZone {
  constructor(game) {
    this.g = game;
    this.phase = 'idle';
    this.root = new THREE.Group();
    this.root.name = 'hall-zone';
    game.frames.hall.add(this.root);
    this.aliSpot = new THREE.Vector3(1.5, 0, -2.05);

    this.qPanel = new Panel({ w: 1.6, h: 0.72, ppm: 950, frame: PAL.orange, border: 0.03, depth: 0.04, radius: 0.06 });
    this.root.add(this.qPanel);
    this.results = new Panel({ w: 1.5, h: 0.98, ppm: 950, frame: PAL.sun, border: 0.03, depth: 0.04, radius: 0.06 });
    this.results.visible = false;
    this.root.add(this.results);
    this.easel = buildEasel();
    this.easel.position.set(-1.55, 0, -2.0);
    this.easel.rotation.y = Math.atan2(1.55, 2.0);
    this.easel.visible = false;
    this.root.add(this.easel);
    this.cards = [];

    const C = (this.console = new Console());
    this.root.add(C);
    this.bStart = C.addButton({ id: 'hall:start', label: TEXT.startChallenge, icon: 'play', ...BTN.cta, w: 0.46, onClick: () => this.startQuiz() });
    this.bConfirm = C.addButton({ id: 'hall:confirm', label: TEXT.confirm, icon: 'check', ...BTN.go, w: 0.3, onClick: () => this._resolveConfirm?.() });
    this.bNextQ = C.addButton({ id: 'hall:nextq', label: TEXT.nextQuestion, icon: 'next', iconSide: 'end', ...BTN.next, w: 0.42, onClick: () => this._resolveNext?.() });
    this.bResult = C.addButton({ id: 'hall:result', label: TEXT.showResult, icon: 'trophy', ...BTN.cta, w: 0.3, onClick: () => this._resolveNext?.() });
    this.bCert = C.addButton({ id: 'hall:cert', label: TEXT.certificate, icon: 'star', ...BTN.cta, w: 0.26, onClick: () => this._openCertificate() });
    this.bCert.screenOnly = true; // download/print live on the screen; in the headset the certificate stands on the easel
    this.bRetry = C.addButton({ id: 'hall:retry', label: TEXT.retry, icon: 'replay', ...BTN.cta, w: 0.34, onClick: () => this.startQuiz() });
    this.bReview = C.addButton({ id: 'hall:review', label: TEXT.review, icon: 'map', ...BTN.next, w: 0.38, onClick: () => this._review() });
    this.bMap = C.addButton({ id: 'hall:map', label: TEXT.toHub, icon: 'map', ...BTN.plain, w: 0.26, onClick: () => this.g.goTo('hub') });
    game.addMenuButton?.(C);
    C.only(this.bStart, this.bMap);
    this._drawIntro();
  }

  // ------------------------------------------------------------------ layout
  layout(h) {
    this.h = h;
    this.console.place(h);
    const eyeW = new THREE.Vector3(0, h.eye, h.vz).applyMatrix4(this.root.matrixWorld);
    this.qPanel.position.set(0, h.eye + 0.46, -2.0);
    this.results.position.set(0, h.eye + 0.26, -2.0);
    const cy = h.eye - 0.3, cz = -1.5;
    // a gentle arc: side cards a little closer
    this.cards.forEach((c, i, a) => c.position.set((a.length === 3 ? [0.62, 0, -0.62] : [0.33, -0.33])[i], cy + (c.o.picture ? 0 : 0.12), cz + Math.abs(i - (a.length - 1) / 2) * 0.08));
    for (const o of [this.qPanel, this.results, ...this.cards]) faceYaw(o, eyeW);
  }

  // ------------------------------------------------------------------ drawing
  _drawIntro() {
    this.qPanel.draw((c, W, H) => {
      drawIcon(c, 'trophy', W - 120, 110, 120, PAL.orange);
      drawText(c, TEXT.hallTitle, { x: 60, y: 40, w: W - 260, h: 140 }, { size: 110, weight: 800, align: 'right' });
      drawText(c, TEXT.hallIntro, { x: 70, y: 200, w: W - 140, h: 260 }, { size: 56, weight: 700, color: PAL.inkSoft, lh: 1.45 });
      drawPill(c, TEXT.hallRule, W / 2, H - 80, { size: 46, bg: PAL.sun, color: PAL.ink, icon: 'star' });
    });
  }
  _drawQuestion(i, clue = null) {
    const item = this.items[i], th = item.pic ? this.g.thumbs?.[item.pic] : null;
    this.qPanel.draw((c, W, H) => {
      const pw = drawPill(c, TEXT.questionOf(i + 1, QUIZ.length), 0, -999, { size: 40, icon: 'question' }).w;
      drawPill(c, TEXT.questionOf(i + 1, QUIZ.length), W - 50 - pw / 2, 70, { size: 40, bg: PAL.ink, color: '#fff', icon: 'question' });
      // progress dots (RTL: first question on the right)
      for (let k = 0; k < QUIZ.length; k++) {
        const a = this.answers[k], x = 80 + (QUIZ.length - 1 - k) * 50;
        c.beginPath(); c.arc(x, 70, 17, 0, Math.PI * 2);
        c.fillStyle = a ? (a.correct ? PAL.green : PAL.wrong) : k === i ? PAL.orange : '#dfe4ea'; c.fill();
      }
      const textH = clue ? H - 300 : H - 190;
      if (th) {
        const ph = H * 0.6, pw2 = ph * (4 / 3), px = W - 50 - pw2, py = 140;
        c.save(); roundRect(c, px, py, pw2, ph, 28); c.clip(); c.drawImage(th, px, py, pw2, ph); c.restore();
        c.lineWidth = 8; c.strokeStyle = PAL.orange; roundRect(c, px, py, pw2, ph, 28); c.stroke();
        drawText(c, item.q, { x: 50, y: 140, w: W - pw2 - 140, h: clue ? ph - 120 : ph }, { size: 84, weight: 800, lh: 1.3 });
        if (clue) drawText(c, clue, { x: 50, y: 140 + ph - 110, w: W - pw2 - 140, h: 110 }, { size: 46, weight: 800, color: PAL.greenDark, lh: 1.25 });
      } else {
        drawText(c, item.q, { x: 60, y: 140, w: W - 120, h: textH }, { size: 88, weight: 800, lh: 1.3 });
        if (clue) drawText(c, clue, { x: 60, y: H - 150, w: W - 120, h: 110 }, { size: 52, weight: 800, color: PAL.greenDark });
      }
    });
  }
  _drawResults(score, passed) {
    this.results.draw((c, W, H) => {
      drawText(c, TEXT.resultsTitle, { x: 60, y: 30, w: W - 120, h: 120 }, { size: 96, weight: 800 });
      for (let k = 0; k < QUIZ.length; k++) {
        const x = W / 2 + (2 - k) * 150; // RTL: stars fill from the right
        drawIcon(c, 'star', x, 245, 130, k < score ? '#ffc93c' : '#e3e7ec');
      }
      drawText(c, TEXT.scoreOf(score, QUIZ.length), { x: 60, y: 330, w: W - 120, h: 120 }, { size: 100, weight: 800, color: passed ? PAL.greenDark : PAL.orangeDark });
      drawText(c, passed ? TEXT.passBoard : TEXT.failBoard, { x: 80, y: 455, w: W - 160, h: 150 }, { size: 54, weight: 800, color: PAL.inkSoft, lh: 1.4 });
      const n = this.answers.length, cw = (W - 100) / n;
      this.answers.forEach((a, k) => {
        const cx = W - 50 - cw * (k + 0.5), cy = H - 150;
        c.fillStyle = a.correct ? '#e3f6ea' : '#fdebd9'; roundRect(c, cx - cw / 2 + 8, cy - 70, cw - 16, 170, 30); c.fill();
        c.beginPath(); c.arc(cx, cy - 10, 34, 0, Math.PI * 2); c.fillStyle = a.correct ? PAL.green : PAL.wrong; c.fill();
        drawIcon(c, a.correct ? 'check' : 'replay', cx, cy - 10, 44, '#fff');
        drawText(c, CONCEPT_NAME[a.concept], { x: cx - cw / 2 + 14, y: cy + 30, w: cw - 28, h: 60 }, { size: 36, weight: 800, color: PAL.ink, maxLines: 1 });
      });
    });
  }

  // ------------------------------------------------------------------ flow
  async enter(g) {
    this.phase = 'intro';
    this._clearCards();
    this.results.visible = false;
    this.easel.visible = false;
    this.qPanel.visible = true;
    this._drawIntro();
    this.qPanel.pop();
    this.console.only(this.bStart, this.bMap);
    this.bStart.setAttention(true);
    await g(this.g.say(TEXT.hallIntro, { pose: 'present' }));
    await g(this.g.say(TEXT.hallRule, { pose: 'present' }));
  }
  leave() { this._resolveChoice = this._resolveNext = this._resolveConfirm = null; this._clearCards(); this.phase = 'idle'; }
  update() {}

  startQuiz() { this.g.run((g) => this._quiz(g)); }

  async _quiz(g) {
    const S = this.g.store, attempt = S.progress.challenges || 0;
    this.form = attempt % 2 === 0 ? 'A' : 'B'; // first try A, retries alternate so a retry is never identical
    this.items = QUIZ.map((q) => q[this.form]);
    this.phase = 'quiz';
    this.answers = [];
    this.results.visible = false;
    this.easel.visible = false;
    this.qPanel.visible = true;
    const t0 = Date.now(), r = rng((Math.random() * 2 ** 31) | 0); // a different option order for every attempt and every child
    for (let i = 0; i < QUIZ.length; i++) {
      const Q = QUIZ[i], item = this.items[i];
      this.qIndex = i;
      const order = shuffle(item.opts.map((_, k) => k), r);
      const correctOpt = item.opts.findIndex((o) => o.concept === Q.concept), ci = order.indexOf(correctOpt);
      this._drawQuestion(i);
      this.qPanel.pop();
      this.console.only(this.bMap);
      this._clearCards();
      this.cards = order.map((oi, k) => {
        const o = item.opts[oi];
        const card = new Card({ id: `hall:card${k}`, w: 0.5, h: o.pic ? 0.62 : 0.3, picture: o.pic ? this.g.thumbs?.[o.pic] : null, text: o.text, index: k, onClick: () => this._resolveChoice?.(k) });
        card.visible = false;
        this.root.add(card);
        card.show(0.15 + k * 0.12);
        return card;
      });
      this.layout(this.h);
      this.g.say(item.q, { pose: 'think' }); // Ali reads only the prompt
      const pick = await this._pick(g);
      const oi = order[pick], correct = pick === ci;
      this.answers.push({ id: Q.id, q: item.q, form: this.form, order, choice: oi, correct, concept: Q.concept, chosenConcept: item.opts[oi].concept });
      this.cards.forEach((c) => c.setInteractive(false));
      const last = i === QUIZ.length - 1, nextBtn = last ? this.bResult : this.bNextQ;
      if (correct) {
        this.cards[pick].setState('correct');
        this.cards.forEach((c, k) => { if (k !== pick) c.setState('dim'); });
        this.g.audio.correct?.();
        this.g.input.rumble?.(0.7, 80);
        this.g.ali.jump?.();
        this._drawQuestion(i, item.clue || Q.clue);
        this.console.only(nextBtn);
        nextBtn.setAttention(true);
        const next = new Promise((res) => (this._resolveNext = res));
        await g(this.g.say(TEXT.praise[(i + attempt) % TEXT.praise.length], { pose: 'cheer' }));
        await g(next);
      } else {
        // kind feedback for that exact confusion, then the child selects the right card (score unchanged)
        this.cards[pick].setState('wrong');
        this.cards.forEach((c, k) => { if (k !== pick && k !== ci) c.setState('dim'); });
        this.g.audio.wrong?.();
        this.g.input.rumble?.(0.3, 40);
        await g(this.g.say(TEXT.encourage[(i + attempt) % TEXT.encourage.length] + ' ' + (item.opts[oi].fb || ''), { pose: 'think' }));
        this.cards[ci].setState('reveal');
        this.cards[ci].setInteractive(true);
        this.g.say(TEXT.fixPrompt, { pose: 'point' });
        for (;;) { if ((await this._pick(g, false)) === ci) break; }
        this.cards[ci].setInteractive(false);
        this.cards[ci].setState('correct');
        this._drawQuestion(i, item.clue || Q.clue);
        this.console.only(nextBtn);
        nextBtn.setAttention(true);
        const next = new Promise((res) => (this._resolveNext = res));
        await g(this.g.say(item.clue || Q.clue, { pose: 'present' }));
        await g(next);
      }
      this._resolveNext = null;
    }
    await this._results(g, Math.round((Date.now() - t0) / 1000));
  }

  /** Wait for a card choice. With gaze-only input a scored answer needs a confirm press (no accidental answers). */
  async _pick(g, scored = true) {
    for (;;) {
      const k = await g(new Promise((res) => (this._resolveChoice = res)));
      this._resolveChoice = null;
      if (!scored || !this.g.input.gaze.active) return k;
      // gaze-only: a look selects (neutral blue), the confirm pad answers; looking at another card moves the selection
      let sel = k;
      for (;;) {
        this.cards.forEach((c, j) => c.setState(j === sel ? 'selected' : 'idle'));
        this.console.only(this.bConfirm, this.bMap);
        const r = await g(Promise.race([new Promise((res) => (this._resolveConfirm = () => res({ ok: true }))), new Promise((res) => (this._resolveChoice = (j) => res({ j })))]));
        this._resolveConfirm = this._resolveChoice = null;
        const direct = r.j != null && !this.g.input.gaze.active; // a controller/hand click (e.g. reconnected) answers at once
        if (r.ok || direct) { this.console.only(this.bMap); this.cards.forEach((c) => c.setState('idle')); return direct ? r.j : sel; }
        if (r.j != null && r.j !== sel) sel = r.j;
      }
    }
  }

  async _results(g, durationSec) {
    this.phase = 'results';
    this._clearCards();
    const S = this.g.store, score = this.answers.filter((a) => a.correct).length, passed = score >= PASS;
    this.missed = this.answers.filter((a) => !a.correct).map((a) => a.concept);
    this.lastResult = { name: S.settings.name || TEXT.certificateDefaultName, score, total: QUIZ.length, date: new Date(), passed, gender: S.settings.gender };
    S.progress.challenges = (S.progress.challenges || 0) + 1;
    S.addAttempt({ date: new Date().toISOString(), name: S.settings.name || '', gender: S.settings.gender || '', form: this.form, score, total: QUIZ.length, passed, durationSec, answers: this.answers });
    this.qPanel.visible = false;
    this._drawResults(score, passed);
    this.results.visible = true;
    this.results.pop();
    if (passed) {
      this.g.audio.fanfare?.();
      this.g.celebrate(this.g.zonePoint(0, this.h.eye + 0.4, -2.0));
      this.easel.userData.panel.draw((c, W, H) => drawCertificate(c, W, H, this.lastResult));
      this.easel.visible = true;
      this.console.only(this.bCert, this.bRetry, this.bReview);
      this.bCert.setAttention(true);
      await g(this.g.say(TEXT.passLine, { pose: 'cheer' }));
      if (score === QUIZ.length) await g(this.g.say(TEXT.perfectLine, { pose: 'cheer' }));
      await g(this.g.say(TEXT.badgeLine, { pose: 'present' }));
    } else {
      // never voice a failing number: name what to review instead
      this.console.only(this.bReview, this.bRetry);
      this.bReview.setAttention(true);
      const names = [...new Set(this.missed)].map((k) => shortName(STATION[k])).join('، ');
      await g(this.g.say(TEXT.failReview(names), { pose: 'present' }));
      await g(this.g.say(TEXT.failLine, { pose: 'present' }));
    }
  }
  _review() {
    const k = this.missed?.[0];
    this.g.goTo(k && this.g.isUnlocked(k) ? k : 'hub');
  }
  _openCertificate() {
    if (this.lastResult) this.g.shell.openCertificate?.(this.lastResult);
  }
  _clearCards() { for (const c of this.cards) { c.dispose(); this.root.remove(c); } this.cards = []; }

  testState() {
    return { q: this.phase === 'quiz' ? this.qIndex : null, cards: this.cards.length, form: this.form, answers: (this.answers || []).map((a) => a.correct), correctCard: this.phase === 'quiz' && this.cards.length ? this._correctCardIndex() : null };
  }
  _correctCardIndex() {
    const Q = QUIZ[this.qIndex], item = this.items[this.qIndex], right = item.opts.find((o) => o.concept === Q.concept);
    return this.cards.findIndex((c) => c.o.text === right.text);
  }
}

function shuffle(a, r) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
