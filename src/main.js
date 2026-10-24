// Boot: engine + input + UI kit + audio + speech + HTML shell, then build the game behind the loading screen.
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { initUI } from './core/ui.js';
import { store } from './core/store.js';
import { Speech } from './core/speech.js';
import { createAudio } from './core/audio.js';
import { createShell } from './shell/shell.js';
import { TEXT } from './game/content.js';
import { Game } from './game/game.js';

async function boot() {
  store.load();
  const params = new URLSearchParams(location.search);
  const test = params.has('test');
  const speed = Math.max(0.1, Number(params.get('speed')) || 1);

  let game = null;
  const engine = new Engine(document.getElementById('app'));
  engine.timeScale = speed;
  const input = new Input(engine);
  const audio = createAudio();
  const S = store.settings;
  audio.setSfx ? audio.setSfx(S.sfx) : audio.setEnabled?.(S.sfx);
  initUI(engine, input, audio);
  input.onAnySelect = () => audio.unlock?.();
  const speech = new Speech();
  speech.timeScale = speed;
  speech.setEnabled(S.voice);

  const shell = createShell({
    store, TEXT,
    xrSupported: engine.xrSupported(),
    onStart: (mode) => game?.start(mode),
    onSetting: (key, value) => game ? game.setting(key, value) : store.set(key, value),
    onResetProgress: () => game?.resetProgress(),
    onRecenter: () => game?.recenter(),
    onExit: () => game?.stopToStart(),
  });
  shell.setLoading(0.04, 'fonts');
  try { await Promise.race([Promise.all([document.fonts.load('800 40px "Baloo Bhaijaan 2"', 'علي'), document.fonts.load('700 40px "Baloo Bhaijaan 2"', 'A1 — ©')]), new Promise((r) => setTimeout(r, 2500))]); } catch {}

  game = new Game({ engine, input, audio, speech, shell, store, test });
  if (test) window.__ali = game.testAPI();
  await game.build((f, label) => shell.setLoading(0.05 + f * 0.95, label));
  shell.ready();
  if (test) window.__ali.ready = true;
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('fatal');
  if (el) { el.hidden = false; el.querySelector('pre')?.append(String(e?.stack || e)); }
});
