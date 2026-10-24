// Audio check: bundles src/core/audio.js, renders every sound in Chromium with an OfflineAudioContext (stepped like the
// real-time scheduler) and reports peak / RMS / duration / NaN / silence / clipping / node counts / JS cost.
// Also runs a short real-time smoke test (lazy context, unlock, mute/suspend, loops) and writes for the record:
//   shots/audio/<id>.wav, shots/audio/sheet_oneshots.png, shots/audio/sheet_loops.png (waveform + log spectrogram per
//   sound), shots/audio/report.json.        node tools/audio_check.mjs [--only id,id] [--no-wav]
// Exit code 1 when any check fails.
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'shots/audio');
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const wantWav = !argv.includes('--no-wav');
fs.mkdirSync(OUT, { recursive: true });

const { outputFiles } = await esbuild.build({ entryPoints: [path.join(ROOT, 'src/core/audio.js')], bundle: true, format: 'iife', globalName: 'AliAudio', write: false, logLevel: 'error' });
const lib = outputFiles[0].text;
const { SFX_NAMES } = await import(path.join(ROOT, 'src/core/audio.js'));

// ---------------------------------------------------------------- jobs
const LONG = { boom: 3, fanfare: 2.6, chime: 2.6, unlock: 2.4, rockBreak: 2, whoosh: 1.6, correct: 1.8, found: 1.8 };
// one-shots start at 0.6 s, once the limiter's make-up gain has settled (as in the running game)
const shot = (name, opts, id = name) => { const dur = (LONG[name] ?? 1.4) + 0.55; return { id, sheet: 'oneshots', dur, events: [{ t: 0.6, do: 'play', name, opts }], expect: 'sound', tiles: [[0.55, dur, id]] }; };
const loopJob = (name, extra = []) => ({
  id: 'loop_' + name, sheet: 'loops', dur: 9, expect: 'loop',
  events: [{ t: 0, do: 'loop', name, id: 'h' }, { t: 4, do: 'set', id: 'h', opts: { rate: 1.5 } }, ...extra, { t: 7, do: 'stop', id: 'h' }],
  windows: { on: [0.6, 4], fast: [4.6, 6.9], after: [8.3, 9] },
});
const JOBS = [
  ...SFX_NAMES.map((n) => shot(n)),
  shot('pop', { rate: 1.4, pan: -0.7 }, 'pop_rate1.4_panL'),
  shot('crack', { rate: 0.8, gain: 0.7, pan: 0.5 }, 'crack_rate0.8'),
  shot('drip', { rate: 1.25 }, 'drip_rate1.25'),
  ...['rumble', 'lava', 'water', 'rain', 'wind'].map((n) => loopJob(n)),
  { ...loopJob('engine'), events: [{ t: 0, do: 'loop', name: 'engine', id: 'h', opts: { rate: 0.7 } }, { t: 2.5, do: 'set', id: 'h', opts: { rate: 1.6 } }, { t: 4.5, do: 'set', id: 'h', opts: { rate: 1, gain: 0.7 } }, { t: 7, do: 'stop', id: 'h' }] },
  { id: 'loop_ambience', sheet: 'loops', dur: 12, expect: 'sound', events: [{ t: 0, do: 'loop', name: 'ambience', id: 'h' }] },
  { id: 'amb_hub', sheet: 'loops', dur: 24, expect: 'sound', events: [{ t: 0, do: 'setMusic', arg: false }, { t: 0, do: 'ambience', arg: 'hub' }, { t: 0, do: 'unlock' }] },
  { id: 'amb_hall', sheet: 'loops', dur: 20, expect: 'sound', events: [{ t: 0, do: 'setMusic', arg: false }, { t: 0, do: 'ambience', arg: 'hall' }, { t: 0, do: 'unlock' }] },
  { id: 'amb_xfade', sheet: 'loops', dur: 22, expect: 'sound', events: [{ t: 0, do: 'setMusic', arg: false }, { t: 0, do: 'unlock' }, { t: 0, do: 'ambience', arg: 'hub' }, { t: 7, do: 'ambience', arg: 'hall' }, { t: 14, do: 'ambience', arg: 'volcano' }, { t: 19, do: 'ambience', arg: null }], windows: { hub: [2, 7], hall: [11, 14], volcano: [17, 19], off: [21.8, 22] } },
  { id: 'music', sheet: 'music', tileW: 1500, dur: 92, expect: 'sound', events: [{ t: 0, do: 'unlock' }], tiles: [[0, 92, 'music (full cycle, 32 bars + intro)'], [5.2, 26, 'music: phrase A (bars 1–8)'], [47, 68, 'music: Hijaz section (bars 17–24)']] },
  { id: 'duck', sheet: 'loops', dur: 13, expect: 'sound', events: [{ t: 0, do: 'ambience', arg: 'hub' }, { t: 0, do: 'unlock' }, { t: 5, do: 'duck', arg: true }, { t: 9, do: 'duck', arg: false }], windows: { normal: [2, 5], ducked: [6, 9], back: [10.5, 13] } },
  { id: 'mute', sheet: 'loops', dur: 8, expect: 'sound', events: [{ t: 0, do: 'ambience', arg: 'hub' }, { t: 0, do: 'unlock' }, { t: 1, do: 'play', name: 'click' }, { t: 2, do: 'setEnabled', arg: false }, { t: 3, do: 'play', name: 'correct' }, { t: 5, do: 'setEnabled', arg: true }, { t: 6, do: 'play', name: 'correct' }], windows: { muted: [2.5, 5], back: [5.6, 7.5] } },
  { id: 'stress', sheet: 'loops', dur: 4, expect: 'sound', events: [{ t: 0, do: 'loop', name: 'rumble', id: 'a', opts: { gain: 1.5, rate: 1.5 } }, { t: 0, do: 'loop', name: 'engine', id: 'b', opts: { gain: 1.5 } },
    ...['boom', 'thud', 'stamp', 'crack', 'rockBreak', 'splash', 'fanfare', 'correct', 'unlock', 'found', 'whoosh', 'chime', 'pop', 'sparkle'].map((name) => ({ t: 0.3, do: 'play', name, opts: { gain: 1.5 } }))] },
  { id: 'stoploops', sheet: 'loops', dur: 4, expect: 'sound', events: [{ t: 0, do: 'loop', name: 'water', id: 'a' }, { t: 0, do: 'loop', name: 'engine', id: 'b' }, { t: 1.5, do: 'stopLoops' }], windows: { on: [0.5, 1.5], after: [2.4, 4] } },
  { id: 'station_mix', sheet: 'loops', dur: 12, expect: 'sound', events: [{ t: 0, do: 'ambience', arg: 'quake' }, { t: 0, do: 'unlock' }, { t: 1, do: 'loop', name: 'rumble', id: 'r', opts: { gain: 0.8 } }, { t: 2, do: 'play', name: 'crack' }, { t: 3.5, do: 'play', name: 'thud' }, { t: 5, do: 'play', name: 'crack', opts: { rate: 0.9 } }, { t: 6, do: 'stop', id: 'r' }, { t: 7, do: 'duck', arg: true }, { t: 7.5, do: 'play', name: 'found' }, { t: 9, do: 'play', name: 'stamp' }, { t: 10, do: 'duck', arg: false }] },
  // main-thread cost: every one-shot played 6× (warm) while ambience + music run; per-name median reported
  { id: 'perf', sheet: null, dur: 30, events: [{ t: 0, do: 'ambience', arg: 'hub' }, { t: 0, do: 'unlock' }, ...Array.from({ length: 6 * SFX_NAMES.length }, (_, i) => ({ t: 1 + i * 0.22, do: 'play', name: SFX_NAMES[i % SFX_NAMES.length] }))] },
].filter((j) => !only || only.includes(j.id));

// ---------------------------------------------------------------- in-page harness (serialised into the page)
function harness() {
  const SR = 48000;
  const NODE_FACTORIES = ['createGain', 'createOscillator', 'createBufferSource', 'createBiquadFilter', 'createStereoPanner', 'createDelay', 'createDynamicsCompressor', 'createChannelMerger', 'createConstantSource', 'createWaveShaper', 'createConvolver'];
  const tiles = (window.tiles = {});
  // count disconnect() calls: proves that finished one-shots and stopped loops release their nodes
  let disconnects = 0;
  const disc = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...a) { disconnects++; return disc.apply(this, a); };
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  const N = 2048, win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const re = new Float32Array(N), im = new Float32Array(N);
  function spectrum(mono, start) {
    for (let i = 0; i < N; i++) { const v = mono[start + i] || 0; re[i] = v * win[i]; im[i] = 0; }
    fft(re, im);
    const p = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) p[i] = (re[i] * re[i] + im[i] * im[i]) / (N * N / 16);
    return p;
  }
  // loudness: ITU BS.1770 K-weighting (48 kHz) and a "headset speaker" weighting (4th-order high-pass at 250 Hz + K shelf);
  // momentary = 400 ms windows every 100 ms → max, and the gated (> -60) mean
  const K1 = [[1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]];
  const K2 = [[1, -2, 1], [1, -1.99004745483398, 0.99007225036621]];
  const HP250 = (() => { const w = (2 * Math.PI * 250) / SR, al = Math.sin(w) / (2 * Math.SQRT1_2), c = Math.cos(w), a0 = 1 + al; return [[(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0], [1, (-2 * c) / a0, (1 - al) / a0]]; })();
  const biq = (x, [b, a]) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  function loudness(L, R, chain) {
    const [l, r] = [L, R].map((x) => chain.reduce((acc, f) => biq(acc, f), x)), win = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
    let max = -99, sum = 0, cnt = 0;
    for (let s = 0; s + win <= l.length; s += hop) {
      let e = 0; for (let i = s; i < s + win; i++) e += l[i] * l[i] + r[i] * r[i];
      const v = -0.691 + 10 * Math.log10(e / win + 1e-12);
      if (v > max) max = v;
      if (v > -60) { sum += 10 ** (v / 10); cnt++; }
    }
    return { max: +max.toFixed(1), mean: cnt ? +(10 * Math.log10(sum / cnt)).toFixed(1) : -99 };
  }
  const STOPS = [[0, 0, 4], [40, 15, 90], [150, 40, 120], [230, 90, 70], [252, 180, 60], [252, 253, 190]];
  const cmap = (x) => { x = Math.max(0, Math.min(0.9999, x)) * (STOPS.length - 1); const i = Math.floor(x), f = x - i, a = STOPS[i], b = STOPS[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };

  function drawTile(id, label, mono, a, b, info, W = 420) {
    const H = 210, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#10131a'; g.fillRect(0, 0, W, H);
    g.fillStyle = info.fail ? '#ff8a7a' : '#e8f0ff'; g.font = 'bold 14px sans-serif'; g.fillText(label, 6, 16);
    g.fillStyle = '#9fb0c8'; g.font = '11px monospace'; g.fillText(info.line, 6, 31);
    const i0 = Math.floor(a * SR), i1 = Math.min(mono.length, Math.floor(b * SR)), cols = W - 12, span = (i1 - i0) / cols;
    // waveform (fixed scale: full height = ±1, grid at ±0.5)
    const wy = 38, wh = 52, mid = wy + wh / 2;
    g.fillStyle = '#1a2130'; g.fillRect(6, wy, cols, wh);
    g.strokeStyle = '#2c3850'; g.beginPath(); g.moveTo(6, mid - wh / 4); g.lineTo(6 + cols, mid - wh / 4); g.moveTo(6, mid + wh / 4); g.lineTo(6 + cols, mid + wh / 4); g.stroke();
    g.fillStyle = '#7fd0e6';
    for (let x = 0; x < cols; x++) {
      let mn = 0, mx = 0; const s0 = Math.floor(i0 + x * span), s1 = Math.floor(i0 + (x + 1) * span);
      for (let i = s0; i < s1; i++) { const v = mono[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      g.fillRect(6 + x, mid - mx * wh / 2, 1, Math.max(1, (mx - mn) * wh / 2));
    }
    // log-frequency spectrogram 40 Hz – 16 kHz, -100..-10 dB
    const sy = 96, sh = H - sy - 6, img = g.createImageData(cols, sh), fmin = 40, fmax = 16000;
    for (let x = 0; x < cols; x++) {
      const s0 = i0 + x * span, frames = Math.max(1, Math.min(4, Math.floor(span / 512))), acc = new Float32Array(N / 2);
      for (let k = 0; k < frames; k++) { const p = spectrum(mono, Math.floor(s0 + (k + 0.5) * span / frames - N / 2)); for (let i = 0; i < N / 2; i++) acc[i] += p[i] / frames; }
      for (let y = 0; y < sh; y++) {
        const f = fmin * (fmax / fmin) ** (1 - y / (sh - 1)), bin = Math.min(N / 2 - 1, Math.round((f * N) / SR));
        const db = 10 * Math.log10(acc[bin] + 1e-14), [r, gg, bb] = cmap((db + 100) / 90), o = (y * cols + x) * 4;
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = bb; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 6, sy);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '9px monospace';
    for (const f of [100, 1000, 10000]) { const y = sy + (1 - Math.log(f / fmin) / Math.log(fmax / fmin)) * (sh - 1); g.fillRect(6, y, 4, 1); g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 11, y + 3); }
    g.fillText(`${a.toFixed(1)}–${b.toFixed(1)} s`, W - 70, H - 9);
    tiles[id] = cv;
  }

  window.sheet = (ids, cols) => {
    const list = ids.map((id) => tiles[id]).filter(Boolean), W = list[0].width, H = 210, rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * W + (cols + 1) * 6; cv.height = rows * H + (rows + 1) * 6;
    const g = cv.getContext('2d'); g.fillStyle = '#05070b'; g.fillRect(0, 0, cv.width, cv.height);
    list.forEach((t, i) => g.drawImage(t, 6 + (i % cols) * (W + 6), 6 + Math.floor(i / cols) * (H + 6)));
    return cv.toDataURL('image/png');
  };

  window.runJob = async (job, wantPcm) => {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(SR * job.dur), sampleRate: SR });
    let created = 0;
    const kinds = {};
    for (const k of NODE_FACTORIES) { const orig = ctx[k].bind(ctx); ctx[k] = (...a) => { created++; kinds[k] = (kinds[k] || 0) + 1; return orig(...a); }; }
    const errors = [];
    window.onerror = (e) => errors.push(String(e));
    let s0 = performance.now();
    const audio = window.AliAudio.createAudio({ context: ctx });
    const setupMs = performance.now() - s0, base = created, handles = {}, events = [];
    let jsMs = 0, pumpMs = 0;
    const run = (ev) => {
      const before = created, s = performance.now();
      try {
        if (ev.do === 'play') audio.play(ev.name, ev.opts);
        else if (ev.do === 'loop') handles[ev.id] = audio.loop(ev.name, ev.opts);
        else if (ev.do === 'set') handles[ev.id].set(ev.opts);
        else if (ev.do === 'stop') handles[ev.id].stop();
        else audio[ev.do](ev.arg);
      } catch (e) { errors.push(String(e && e.stack || e)); }
      const ms = performance.now() - s;
      jsMs += ms;
      events.push({ t: ev.t, do: ev.do, what: ev.name ?? ev.arg, nodes: created - before, ms });
    };
    let pumpMax = 0, pumpNodesMax = 0;
    const pump = () => {
      const s = performance.now(), before = created;
      try { audio.pump(ctx.currentTime + 0.7); } catch (e) { errors.push(String(e)); }
      const ms = performance.now() - s; pumpMs += ms; pumpMax = Math.max(pumpMax, ms); pumpNodesMax = Math.max(pumpNodesMax, created - before);
    };
    const at = new Map(), q = (t, fn) => { const k = Math.round((t * SR) / 128); if (!at.has(k)) at.set(k, []); at.get(k).push(fn); };
    for (const ev of job.events) if (ev.t > 0) q(ev.t, () => run(ev)); else run(ev);
    pump();
    for (let t = 0.2; t < job.dur - 0.05; t += 0.2) q(t, pump);
    for (const [k, fns] of at) ctx.suspend((k * 128) / SR).then(() => { fns.forEach((f) => f()); ctx.resume(); });
    const d0 = disconnects, r0 = performance.now(), buf = await ctx.startRendering(), renderMs = performance.now() - r0;
    await new Promise((r) => setTimeout(r, 60)); // let the last 'ended' events run
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, mono = new Float32Array(n);
    let peak = 0, sum = 0, nan = 0, clip = 0, on = -1, off = -1, dc = 0, maxJump = 0;
    for (let i = 0; i < n; i++) {
      const l = L[i], r = R[i];
      if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
      const a = Math.max(Math.abs(l), Math.abs(r));
      if (a > peak) peak = a;
      if (a >= 0.99) clip++;
      if (a > 0.001) { if (on < 0) on = i; off = i; }
      sum += l * l + r * r; dc += l + r; mono[i] = (l + r) / 2;
      if (i) maxJump = Math.max(maxJump, Math.abs(l - L[i - 1]), Math.abs(r - R[i - 1]));
    }
    const rmsOf = (a, b) => { let s = 0, c = 0; for (let i = Math.floor(a * SR); i < Math.min(n, b * SR); i++) { s += L[i] * L[i] + R[i] * R[i]; c += 2; } return c ? Math.sqrt(s / c) : 0; };
    // brightness: share of energy above 6 kHz (harshness indicator) from a coarse STFT
    let hi = 0, tot = 0;
    for (let s = 0; s + N < n; s += Math.max(N, Math.floor(n / 300))) { const p = spectrum(mono, s); for (let i = 1; i < N / 2; i++) { tot += p[i]; if ((i * SR) / N > 6000) hi += p[i]; } }
    const windows = {};
    for (const [k, [a, b]] of Object.entries(job.windows || {})) windows[k] = +rmsOf(a, b).toFixed(5);
    const st = {
      id: job.id, dur: job.dur, peak: +peak.toFixed(4), rms: +Math.sqrt(sum / (2 * n)).toFixed(5), activeRms: on >= 0 ? +rmsOf(on / SR, off / SR).toFixed(5) : 0,
      onset: on >= 0 ? +(on / SR).toFixed(3) : null, soundDur: on >= 0 ? +((off - on) / SR).toFixed(3) : 0, nan, clip, dc: +(dc / (2 * n)).toFixed(6),
      released: disconnects - d0, lufs: loudness(L, R, [K1, K2]), spk: loudness(L, R, [HP250, HP250, K1]),
      maxJump: +maxJump.toFixed(4), hf6k: tot ? +(hi / tot).toFixed(4) : 0, nodesSetup: base, nodes: created - base, kinds, events, windows,
      setupMs: +setupMs.toFixed(1), jsMs: +jsMs.toFixed(2), pumpMs: +pumpMs.toFixed(2), pumpMax: +pumpMax.toFixed(2), pumpNodesMax, renderMs: Math.round(renderMs), errors,
    };
    const line = `pk ${st.peak.toFixed(2)} M ${st.lufs.max} spk ${st.spk.max} dur ${st.soundDur.toFixed(2)}s nodes ${st.nodes}`;
    for (const [a, b, label] of job.tiles || [[0, job.dur, job.id]]) drawTile(job.tiles ? `${job.id}@${a}` : job.id, label, mono, a, b, { line }, job.tileW);
    st.tileIds = (job.tiles || [[0]]).map(([a]) => (job.tiles ? `${job.id}@${a}` : job.id));
    if (wantPcm) { // 16-bit interleaved PCM, base64
      const pcm = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i] || 0)) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i] || 0)) * 32767; }
      const bytes = new Uint8Array(pcm.buffer); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      st.pcm = btoa(bin);
    }
    return st;
  };

  // real-time smoke test: lazy context, unlock, ambience + music + loops, mute → suspended, unmute → running
  window.realtime = async () => {
    const errs = [], wait = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
    try {
      const a = window.AliAudio.createAudio();
      a.ambience('hub'); a.play('click');
      out.beforeUnlock = a.context ? a.context.state : 'no context';
      const early = a.loop('rain'); // a loop asked for before the first gesture waits for unlock()
      a.unlock(); a.play('click'); a.setMusic(true);
      const h = a.loop('engine', { rate: 1 });
      await wait(1200);
      h.set({ rate: 1.5 }); a.correct(); a.duck(true);
      await wait(800);
      out.running = a.context.state; out.time = +a.context.currentTime.toFixed(2);
      a.setEnabled(false); await wait(600); out.mutedState = a.context.state;
      a.play('fanfare');
      a.setEnabled(true); await wait(300); out.unmutedState = a.context.state;
      h.stop(); early.set({ gain: 0.5 }); a.stopLoops(); a.duck(false); a.ambience('hall'); a.setMusic(false); a.found(); a.play('unlock'); a.play('nope');
      await wait(800);
      out.time2 = +a.context.currentTime.toFixed(2);
      a.dispose();
    } catch (e) { errs.push(String(e && e.stack || e)); }
    out.errors = errs;
    return out;
  };
}

// ---------------------------------------------------------------- run
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: lib });
await page.addScriptTag({ content: `(${harness})()` });

const results = [], fails = [];
const fail = (id, msg) => fails.push(`${id}: ${msg}`);
for (const job of JOBS) {
  const st = await page.evaluate(([j, w]) => window.runJob(j, w), [job, wantWav && !!job.sheet]);
  if (job.id === 'perf') {
    const by = {};
    for (const e of st.events.filter((e) => e.do === 'play')) (by[e.what] ||= []).push(e.ms);
    const med = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, +v.sort((a, b) => a - b)[v.length >> 1].toFixed(3)]));
    st.playMedianMs = med;
    console.log(`perf: play() median ms ${JSON.stringify(med)}  | pump max ${st.pumpMax} ms (${st.pumpNodesMax} nodes), setup ${st.setupMs} ms`);
    results.push(st);
    continue;
  }
  if (st.pcm) { writeWav(path.join(OUT, `${job.id}.wav`), Buffer.from(st.pcm, 'base64')); delete st.pcm; }
  results.push(st);
  if (st.errors.length) fail(job.id, 'errors ' + st.errors.join(' | '));
  if (st.nan) fail(job.id, `${st.nan} NaN samples`);
  if (st.peak > 0.9) fail(job.id, `peak ${st.peak} > 0.9`);
  if (st.clip) fail(job.id, `${st.clip} clipped samples`);
  if (st.peak < 0.003) fail(job.id, 'silent');
  if (job.sheet === 'oneshots' && st.nodes > 16) fail(job.id, `${st.nodes} nodes for one sound`);
  if (job.sheet === 'oneshots' && st.released < 1) fail(job.id, 'voice was not released (no disconnect after it ended)');
  if (job.expect === 'loop' && st.released < st.events[0].nodes) fail(job.id, `stopped loop released ${st.released}/${st.events[0].nodes} nodes`);
  if (job.expect === 'loop') {
    if (st.windows.after > 0.0005) fail(job.id, `not silent after stop (rms ${st.windows.after})`);
    if (st.windows.on < 0.004) fail(job.id, `loop too quiet (rms ${st.windows.on})`);
    if (st.events[0].nodes > 16) fail(job.id, `${st.events[0].nodes} nodes for one loop`);
  }
  if (job.id === 'duck' && !(st.windows.ducked < 0.6 * st.windows.normal && st.windows.back > 0.6 * st.windows.normal)) fail(job.id, `ducking ${JSON.stringify(st.windows)}`);
  if (job.id === 'stoploops' && st.windows.after > 0.0003) fail(job.id, `loops still audible after stopLoops (rms ${st.windows.after})`);
  if (job.id === 'mute' && st.windows.muted > 0.0003) fail(job.id, `audible while muted (rms ${st.windows.muted})`);
  if (job.id === 'amb_xfade' && (st.windows.off > 0.0005 || st.windows.hall < 0.002)) fail(job.id, `crossfade ${JSON.stringify(st.windows)}`);
  const ev = st.events.map((e) => `${e.what}:${e.nodes}`).join(' ');
  console.log(`${job.id.padEnd(18)} peak ${st.peak.toFixed(3)}  M ${st.lufs.max}/${st.lufs.mean}  spk ${st.spk.max}/${st.spk.mean}  rms ${st.activeRms.toFixed(4)}  dur ${String(st.soundDur).padStart(6)}s  hf ${(st.hf6k * 100).toFixed(1).padStart(4)}%  nodes ${String(st.nodes).padStart(4)} [${ev}]  released ${st.released}  js ${st.jsMs}ms pump ${st.pumpMs}ms render ${st.renderMs}ms${Object.keys(st.windows).length ? '  ' + JSON.stringify(st.windows) : ''}`);
}
for (const sheet of ['oneshots', 'loops', 'music']) {
  const ids = results.filter((r) => JOBS.find((j) => j.id === r.id).sheet === sheet).flatMap((r) => r.tileIds);
  if (!ids.length) continue;
  const url = await page.evaluate(([i, c]) => window.sheet(i, c), [ids, { oneshots: 4, loops: 3, music: 1 }[sheet]]);
  fs.writeFileSync(path.join(OUT, `sheet_${sheet}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
const rt = only ? null : await page.evaluate(() => window.realtime());
if (rt) {
  console.log('realtime', JSON.stringify(rt));
  if (rt.errors.length || rt.running !== 'running' || rt.mutedState !== 'suspended' || rt.unmutedState !== 'running' || !(rt.time2 > rt.time)) fail('realtime', JSON.stringify(rt));
}
if (pageErrors.length) fail('page', pageErrors.join(' | '));
await browser.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, realtime: rt, fails }, null, 1));
console.log(fails.length ? `\nFAIL (${fails.length})\n  ` + fails.join('\n  ') : `\nOK: ${results.length} renders, all checks passed`);
process.exit(fails.length ? 1 : 0);

function writeWav(file, pcm) {
  const h = Buffer.alloc(44), sr = 48000;
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}
