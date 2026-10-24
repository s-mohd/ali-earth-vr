// Probes two suspected V1 bugs: (1) stale 'reveal' timeout leaking into the next quiz question,
// (2) VR floor offset computed from the previous location in travel(). Usage: node tools/v1_bug_probe.mjs
import { chromium } from 'playwright';
import path from 'node:path';
const W = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('file://' + path.join(W, 'ref/v1.html') + '?test');   // speed 1 on purpose
await page.waitForFunction(() => !!window.__ali, null, { timeout: 120000 });
await page.waitForTimeout(1500);
// unlock everything and jump to the challenge
await page.evaluate(() => { const g = window.__ali.game; g.progress.stationsDone = [true,true,true,true,true]; g.progress.practiceDone = {weathering:true, erosion:true}; g.save(); g.start(); });
await page.waitForFunction(() => ['challengeGate','station'].includes(window.__ali.state().location.type) && !window.__ali.state().busy, null, { timeout: 120000 });
await page.evaluate(() => window.__ali.game.goTo('challenge'));
await page.waitForFunction(() => window.__ali.state().location.type === 'challengeGate' && !window.__ali.state().busy, null, { timeout: 120000 });
await page.evaluate(() => window.__ali.game.startChallenge());
await page.waitForFunction(() => window.__ali.state().location.type === 'challenge' && !window.__ali.state().busy, null, { timeout: 120000 });
await page.waitForTimeout(800);
// (1) wrong answer on Q1 (correct=1) then immediately go next (HUD primary/Enter is enabled at once)
const r1 = await page.evaluate(async () => {
  const g = window.__ali.game;
  g.onAnswer(0);
  const hudPrimaryEnabled = !document.getElementById('hud-primary').disabled;
  g.onNextQuestion();
  await new Promise((r) => setTimeout(r, 1500));
  return { hudPrimaryEnabledRightAfterAnswer: hudPrimaryEnabled, qIndex: g.qIndex, q2CardStates: g.hall.cards.map((c) => c.state), q2Answered: g.quiz.answers[1] != null };
});
console.log('quiz-stale-reveal', JSON.stringify(r1));
await page.waitForFunction(() => window.__ali.game.hall.cards.every((c) => c.showScale > 0.95), null, { timeout: 60000 }); await page.waitForTimeout(500); await page.screenshot({ path: path.join(W, 'shots/v1_bug_stale_reveal.png') });
// (2) simulate VR travel from challenge -> results and challengeGate -> challenge floor offsets
const r2 = await page.evaluate(async () => {
  const g = window.__ali.game;
  g.xr.fade = async () => {};
  g.vrActive = true;
  const out = {};
  // challenge -> station 0 (should be ground level, +0 expected)
  await g.travel({ type: 'station', index: 0 }, { mode: 'fade' });
  out.toStationFromChallenge_playerY = +g.player.position.y.toFixed(2);
  await g.travel({ type: 'challengeGate' }, { mode: 'fade' });
  out.toGate_playerY = +g.player.position.y.toFixed(2);
  await g.travel({ type: 'challenge', question: 0 }, { mode: 'fade' });
  out.toChallengeFromGate_playerY = +g.player.position.y.toFixed(2);
  out.hallFloorTopY = 0.3;
  g.vrActive = false;
  return out;
});
console.log('vr-floor-offset', JSON.stringify(r2));
await browser.close();
