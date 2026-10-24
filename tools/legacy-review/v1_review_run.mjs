// V1 review driver: walks the whole V1 flow via its ?test API, captures screenshots
// and renderer statistics. Usage: node tools/v1_review_run.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const W = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = path.join(W, 'ref/v1.html');
const SHOTS = path.join(W, 'shots');
const OUT_JSON = path.join(W, 'review/v1_stats.json');
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

const t0 = Date.now();
await page.goto('file://' + FILE + '?test&speed=4');
await page.waitForFunction(() => !!window.__ali, null, { timeout: 120000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(1500);

const stats = { loadMs, locations: {} };

async function idle(extra = 400) {
  await page.waitForFunction(() => {
    const s = window.__ali.state();
    return !s.busy && !window.__ali.game.rig.busy;
  }, null, { timeout: 120000 });
  await page.waitForTimeout(extra);
}

// renderer.info + scene census for the current frame
async function census(label) {
  const r = await page.evaluate(() => {
    const { renderer, scene } = window.__ali.services;
    // let one frame render with fresh stats
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const info = renderer.info;
      let meshes = 0, visibleMeshes = 0, castShadow = 0, instanced = 0, instances = 0, tris = 0;
      const mats = new Set(), texs = new Map(), progs = new Set();
      scene.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        let v = true, p = o; while (p) { if (!p.visible) { v = false; break; } p = p.parent; }
        if (!v) return;
        visibleMeshes++;
        if (o.castShadow) castShadow++;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { mats.add(m); if (m.map && m.map.image) texs.set(m.map.uuid, [m.map.image.width, m.map.image.height]); });
        const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        if (o.isInstancedMesh) { instanced++; instances += o.count; tris += n * o.count; } else tris += n;
      });
      let texPixels = 0; for (const [w, h] of texs.values()) texPixels += w * h;
      res({
        drawCalls: info.render.calls, trianglesRendered: info.render.triangles,
        programs: info.programs?.length, geometriesGPU: info.memory.geometries, texturesGPU: info.memory.textures,
        meshesTotal: meshes, meshesVisible: visibleMeshes, visibleCastShadow: castShadow,
        instancedMeshes: instanced, instances, visibleTriangles: Math.round(tris), uniqueMaterialsVisible: mats.size,
        visibleMapTextures: texs.size, visibleMapMegapixels: +(texPixels / 1e6).toFixed(2),
        pixelRatio: renderer.getPixelRatio(), shadowMap: renderer.shadowMap.enabled, toneMapping: renderer.toneMapping,
      });
    })));
  });
  stats.locations[label] = r;
  return r;
}

// Where would a VR user stand (game.placeVR logic, line 9332) and how far are the interactive items?
async function vrProbe(label, shotName) {
  const r = await page.evaluate(async (shotName) => {
    const a = window.__ali, g = a.game, H = g.camera.position.constructor;
    const view = g.viewFor(g.location);
    const stand = view.target.clone().lerp(view.pos, 0.72);
    stand.y = g.world.heightAt(stand.x, stand.z);
    const eye = stand.clone(); eye.y += 1.25; // seated child / small standing child eye height
    const items = [];
    for (const it of g.interaction.items.values()) {
      if (!g.interaction.isActive(it)) continue;
      const p = it.mesh.getWorldPosition(new H());
      items.push({ id: it.id, dist: +p.distanceTo(eye).toFixed(2), heightAboveFloor: +(p.y - stand.y).toFixed(2) });
    }
    return { stand: stand.toArray().map((v) => +v.toFixed(2)), items };
  }, shotName);
  stats.locations[label + ':vr'] = r;
  if (shotName) {
    // Render from the approximate VR eye (fov 90, square) to visualise what a headset user sees
    await page.evaluate(() => {
      const a = window.__ali, g = a.game;
      g.__rigUpdate = g.rig.update; g.rig.update = () => {};
      const view = g.viewFor(g.location);
      const stand = view.target.clone().lerp(view.pos, 0.72);
      stand.y = g.world.heightAt(stand.x, stand.z) + 1.25;
      const look = view.target.clone(); look.y = stand.y - 0.2;
      g.__camSave = { pos: g.camera.position.clone(), fov: g.camera.fov };
      g.camera.position.copy(stand); g.camera.fov = 90; g.camera.updateProjectionMatrix(); g.camera.lookAt(look);
      document.getElementById('hud').style.visibility = 'hidden';
      g.__oldFacing = g.aliFacesCamera;
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS, shotName) });
    await page.evaluate(() => {
      const g = window.__ali.game;
      g.rig.update = g.__rigUpdate; g.camera.position.copy(g.__camSave.pos); g.camera.fov = g.__camSave.fov;
      g.camera.updateProjectionMatrix(); document.getElementById('hud').style.visibility = '';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(300);
  }
  return r;
}

const shot = (n) => page.screenshot({ path: path.join(SHOTS, n) });

// ---------- hub / welcome ----------
await page.waitForTimeout(1500);
await shot('v1_hub.png');
await census('welcome');
await vrProbe('welcome', 'v1_vr_welcome.png');

// ---------- start -> station 1 ----------
await page.evaluate(() => window.__ali.game.start());
await page.waitForTimeout(800);
await page.waitForFunction(() => window.__ali.state().location.type === 'station', null, { timeout: 120000 });
await idle(1200);

const practiceCorrect = { 2: 0, 3: 1 };
for (let i = 0; i < 5; i++) {
  await page.waitForFunction((i) => {
    const s = window.__ali.state();
    return s.location.type === 'station' && s.location.index === i && !s.busy;
  }, i, { timeout: 120000 });
  await idle(1500);
  await shot(`v1_st${i + 1}_before.png`);
  if (i === 0) await census('station1_before');
  await page.evaluate((i) => window.__ali.game.onWatch(window.__ali.game.stations[i]), i);
  await page.waitForTimeout(500);
  if (i === 1 || i === 4) {
    // mid-animation capture for the longest sims
    await page.waitForTimeout(i === 4 ? 1500 : 900);
    await shot(`v1_st${i + 1}_mid.png`);
  }
  await page.waitForFunction(() => !window.__ali.state().stationPlaying, null, { timeout: 120000 });
  await page.waitForTimeout(250);
  await shot(`v1_st${i + 1}_after.png`);
  await census(`station${i + 1}_after`);
  if (i === 0) await vrProbe('station1', 'v1_vr_station1.png');
  if (i in practiceCorrect) {
    await page.waitForFunction(() => window.__ali.state().stationPhase === 'practice' &&
      window.__ali.game.currentStation().practice.visible, null, { timeout: 60000 });
    await idle(1200);
    if (i === 3) { await shot('v1_practice.png'); await census('practice_erosion'); }
    if (i === 2) await shot('v1_practice_weathering.png');
    // first a wrong answer to see feedback, then right
    const wrong = practiceCorrect[i] === 0 ? 1 : 0;
    await page.evaluate(([i, w]) => window.__ali.game.onPracticeAnswer(window.__ali.game.stations[i], w), [i, wrong]);
    await page.waitForTimeout(700);
    if (i === 3) await shot('v1_practice_wrong.png');
    await page.waitForTimeout(1200);
    await page.evaluate(([i, c]) => window.__ali.game.onPracticeAnswer(window.__ali.game.stations[i], c), [i, practiceCorrect[i]]);
    await page.waitForTimeout(1200);
  }
  await page.waitForFunction((i) => window.__ali.state().progress.stationsDone[i], i, { timeout: 60000 });
  await idle(300);
  if (i === 4) {
    // before/after toggle exists only for station 5
    await page.evaluate(() => window.__ali.game.onBeforeAfter(window.__ali.game.stations[4]));
    await page.waitForTimeout(500);
    await shot('v1_st5_toggle_before.png');
    await page.evaluate(() => window.__ali.game.onBeforeAfter(window.__ali.game.stations[4]));
  }
  await page.evaluate((i) => window.__ali.game.onNext(window.__ali.game.stations[i]), i);
  await page.waitForTimeout(600);
}

// ---------- challenge gate -> hall ----------
await page.waitForFunction(() => window.__ali.state().location.type === 'challengeGate', null, { timeout: 120000 });
await idle(1000);
await shot('v1_challenge_gate.png');
await page.evaluate(() => window.__ali.game.startChallenge());
await page.waitForFunction(() => window.__ali.state().location.type === 'challenge', null, { timeout: 120000 });
await idle(1500);
await shot('v1_quiz.png');
await census('challenge_q1');
await vrProbe('challenge', 'v1_vr_challenge.png');

const correct = [1, 2, 0, 1, 2];
for (let q = 0; q < 5; q++) {
  await page.waitForFunction((q) => window.__ali.state().qIndex === q, q, { timeout: 60000 });
  await page.waitForTimeout(900);
  if (q === 1) await shot('v1_quiz_q2.png');
  const choice = q === 2 ? 1 : correct[q]; // one deliberate mistake -> 4/5 = 80% (pass)
  await page.evaluate((c) => window.__ali.game.onAnswer(c), choice);
  await page.waitForTimeout(1300);
  if (q === 2) await shot('v1_quiz_wrong_reveal.png');
  await page.evaluate(() => window.__ali.game.onNextQuestion());
  await page.waitForTimeout(700);
}

await page.waitForFunction(() => window.__ali.state().location.type === 'results', null, { timeout: 120000 });
await idle(2500);
await shot('v1_results.png');
await census('results');
await vrProbe('results', 'v1_vr_results.png');

// certificate modal (desktop only)
await page.evaluate(() => window.__ali.game.openCertificate());
await page.waitForTimeout(800);
await shot('v1_certificate_modal.png');
await page.evaluate(() => window.__ali.game.hud.closeModal());
// teacher dashboard + map (desktop-only HTML overlays)
await page.evaluate(() => window.__ali.game.openTeacher());
await page.waitForTimeout(600);
await shot('v1_teacher.png');
await page.evaluate(() => window.__ali.game.hud.closeModal());
await page.evaluate(() => window.__ali.game.openMap());
await page.waitForTimeout(600);
await shot('v1_map.png');
await page.evaluate(() => window.__ali.game.hud.closeModal());

// what does the HUD do in VR? simulate the XR change callback (no real session in headless)
stats.vrSim = await page.evaluate(() => {
  const g = window.__ali.game;
  const before = getComputedStyle(document.getElementById('hud')).display;
  g.onXRChange(true);
  const after = getComputedStyle(document.getElementById('hud')).display;
  const ids = window.__ali.activeIds();
  g.onXRChange(false);
  return { hudDisplayBefore: before, hudDisplayInVR: after, active3DIdsAtResults: ids };
});
stats.speechVoices = await page.evaluate(() => (speechSynthesis.getVoices() || []).map((v) => v.lang).slice(0, 20));
stats.logs = logs.slice(0, 40);
fs.writeFileSync(OUT_JSON, JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
await browser.close();
