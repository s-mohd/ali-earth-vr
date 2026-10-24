// Procedural audio: every sound is synthesised with WebAudio at run time (no files, no network).
//
//   one-shots ─┐                                  ┌─ sends ─> echo ─┐
//   loops ─────┼─> buses (sfx · loops · amb · music) ─> duck gains ──┴─> master (on/off) ─> limiter ─> out
//
// • One-shots build 2–14 short-lived nodes and disconnect themselves when they end (voice cap + per-name rate limit).
// • Loops and ambience beds are small persistent graphs. Their random life (waves, birds, bubbles, drops, notes) is
//   written ahead as AudioParam automation by a light look-ahead scheduler (`pump`), so most events create no nodes.
// • Music: a generative, Khaleeji-flavoured tune in D (oud-like Karplus-Strong plucks, ney, frame drum, soft drone),
//   32 bars ≈ 84 s per cycle; ornaments, drum variations and the lead instrument change on every repeat.
// Real-time contexts are created lazily and resumed by unlock() on a user gesture. Tests may pass an
// OfflineAudioContext as `context`: one-shots and loops work at once, unlock() starts music/ambience, and pump(t) lets
// the generators schedule up to context time t (the real-time scheduler does this by itself every 200 ms).
//
// API: unlock() resumes the context (idempotent; call it on every early gesture) — the "unlock" jingle is play('unlock').
//      setEnabled(on) mutes/unmutes everything (state is kept; a muted real-time context is suspended to save CPU).
//      setMusic(on), duck(on) while Ali talks, ambience(zoneKey) crossfades the bed ('hall' → breeze + murmur, any
//      other zone → sea + birds, null → silence). play(name, {gain, rate, pan}); loop(name, {gain, rate}) → {set, stop};
//      stopLoops() stops every loop() still running (safety net when leaving a station).

export const SFX_NAMES = ['click', 'hover', 'correct', 'wrong', 'stamp', 'whoosh', 'pop', 'sparkle', 'fanfare', 'unlock',
  'found', 'crack', 'thud', 'boom', 'rockBreak', 'splash', 'drip', 'beep', 'chime'];
export const LOOP_NAMES = ['rumble', 'lava', 'water', 'rain', 'wind', 'engine', 'ambience', 'music'];

const LEVEL = { sfx: 1, loops: 0.85, amb: 0.27, music: 0.21 }; // bus gains (music is "very quiet" through its own mix)
const DUCK = { music: 0.32, amb: 0.45, loops: 0.7 };          // bus multipliers while Ali talks
const LOOKAHEAD = 0.7;                                          // s of generative events written ahead
const TICK_MS = 200;
const MAX_VOICES = 24;
const NOOP_LOOP = Object.freeze({ set() {}, stop() {} });

// ---------------------------------------------------------------- small helpers
const TAU = Math.PI * 2;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const noteNum = (s) => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
function prng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Hold a param's current value at t, then glide toward v (time constant tc). Safe in the middle of automation. */
function glide(p, v, t, tc) {
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
  else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
  p.setTargetAtTime(v, t, Math.max(tc, 0.002));
}
/** 0 → peak (linear attack a) → hold h → exponential decay d. Returns the end time. */
function envelope(p, t, peak, a, h, d) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (h > 0) p.setValueAtTime(peak, t + a + h);
  p.exponentialRampToValueAtTime(1e-4, t + a + h + d);
  return t + a + h + d;
}
/** One envelope per note on a single param: each note fades to 0 right before the next starts (click-free steps). */
function articulate(p, starts, peaks, a, H, D) {
  p.setValueAtTime(0, starts[0]);
  let end = 0;
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i], next = starts[i + 1], pk = Math.max(peaks[i], 2e-4), h = H(i), d = D(i);
    p.linearRampToValueAtTime(pk, s + a);
    if (h > 0) p.setValueAtTime(pk, s + a + h);
    end = s + a + h + d;
    if (next === undefined) p.exponentialRampToValueAtTime(1e-4, end);
    else if (end < next - 0.004) { p.exponentialRampToValueAtTime(1e-4, end); p.setValueAtTime(0, next); }
    else {
      const e = Math.max(s + a + h + 0.001, next - 0.004);
      p.exponentialRampToValueAtTime(Math.max(1e-4, pk * 1e-4 ** ((e - s - a - h) / d)), e);
      p.linearRampToValueAtTime(0, next);
    }
  }
  return end;
}
/** Frequency as a number, or a path [[hz, time], ...] joined by exponential ramps (times relative to t). */
function freqPath(p, f, t, k, ts) {
  if (!Array.isArray(f)) { p.setValueAtTime(f * k, t); return; }
  p.setValueAtTime(f[0][0] * k, t + f[0][1] * ts);
  for (let i = 1; i < f.length; i++) p.exponentialRampToValueAtTime(f[i][0] * k, t + f[i][1] * ts);
}
const first = (f) => (Array.isArray(f) ? f[0][0] : f);
/** Biquad whose frequency/Q automation runs at k-rate: per-sample coefficient updates are the costliest thing on Quest. */
function biquad(c, type, f, q) {
  const b = c.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  try { b.frequency.automationRate = 'k-rate'; b.Q.automationRate = 'k-rate'; } catch { /* older engines: a-rate */ }
  return b;
}

// ---------------------------------------------------------------- buffers (built once per context)
function normalize(d, peak) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
}
/** Pink or brown noise that loops seamlessly (an extra tail is cross-faded into the head), normalised to RMS 0.22. */
function loopNoise(d, rand, pink) {
  const n = d.length, fade = Math.min(n >> 2, 14400), tmp = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, y = 0;
  for (let i = 0; i < tmp.length; i++) {
    const w = rand() * 2 - 1;
    if (pink) { // Paul Kellet's pink filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      tmp[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    } else tmp[i] = y = 0.997 * y + 0.03 * w; // leaky integrator: brown, no DC
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    let v = tmp[i];
    if (i < fade) { const w = ((i + 0.5) / fade) * (Math.PI / 2); v = v * Math.sin(w) + tmp[n + i] * Math.cos(w); }
    d[i] = v; s += v * v;
  }
  const k = 0.22 / Math.sqrt(s / n);
  for (let i = 0; i < n; i++) d[i] *= k;
}
/** RBJ peaking EQ applied in place (used to give the plucked strings a wooden body). */
function peaking(d, sr, f, q, db) {
  const A = 10 ** (db / 40), w = (TAU * f) / sr, al = Math.sin(w) / (2 * q), cw = Math.cos(w), a0 = 1 + al / A;
  const b0 = (1 + al * A) / a0, b1 = (-2 * cw) / a0, b2 = (1 - al * A) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al / A) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) { const x = d[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y; }
}
/** Karplus-Strong pluck (oud / qanun-like): soft plectrum burst near the bridge, ~1.4 s decay at any pitch. */
function ksPluck(ctx, rand, midi, sec) {
  const sr = ctx.sampleRate, N = Math.max(3, Math.round(sr / mtof(midi) + 0.5)), n = Math.round(sr * sec); // loop period = N - 0.5
  const buf = ctx.createBuffer(1, n, sr), out = buf.getChannelData(0), line = new Float32Array(N);
  let lp = 0, mean = 0;
  for (let i = 0; i < N; i++) { lp += 0.45 * (rand() * 2 - 1 - lp); line[i] = lp; mean += lp / N; }
  const pick = Math.max(1, Math.round(N * 0.12));
  for (let i = N - 1; i >= 0; i--) line[i] -= mean + (i >= pick ? line[i - pick] - mean : 0);
  const rho = 0.001 ** ((N - 0.5) / (1.4 * sr));
  for (let i = 0, k = 0; i < n; i++) {
    const a = line[k], k1 = k + 1 === N ? 0 : k + 1;
    out[i] = a;
    line[k] = rho * 0.5 * (a + line[k1]);
    k = k1;
  }
  peaking(out, sr, 240, 0.9, 5);   // wooden body
  peaking(out, sr, 1300, 1.2, 3);  // nasal plectrum bite
  const fi = Math.round(sr * 0.0015), fo = Math.round(sr * 0.08);
  for (let i = 0; i < fi; i++) out[i] *= i / fi;
  for (let i = 0; i < fo; i++) out[n - 1 - i] *= i / fo;
  normalize(out, 0.9);
  return { buffer: buf, f: sr / (N - 0.5), midi };
}
/** Frame drum (daf): deep "dum", rim "tak", and the jingles of a riq ("zil"). */
function drumKit(ctx, rand) {
  const sr = ctx.sampleRate;
  const make = (sec, fill) => {
    const b = ctx.createBuffer(1, Math.round(sr * sec), sr), d = b.getChannelData(0), fo = Math.round(d.length * 0.3);
    fill(d);
    for (let i = 0; i < fo; i++) d[d.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo); // fade the tail: no cut-off click
    normalize(d, 0.9);
    return b;
  };
  return {
    dum: make(0.75, (d) => {
      let ph = 0, lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr; ph += (TAU * (64 + 80 * Math.exp(-t / 0.03))) / sr; lp += 0.1 * (rand() * 2 - 1 - lp);
        d[i] = (Math.sin(ph) * Math.exp(-t / 0.17) + 0.3 * Math.sin(ph * 1.59) * Math.exp(-t / 0.07) + 2 * lp * Math.exp(-t / 0.012)) * Math.min(1, t / 0.002);
      }
    }),
    tak: make(0.2, (d) => {
      let p1 = 0, p2 = 0, hp = 0, prev = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, w = rand() * 2 - 1; p1 += (TAU * 410 * (1 + 0.25 * Math.exp(-t / 0.004))) / sr; p2 += (TAU * 670) / sr;
        hp = 0.7 * (hp + w - prev); prev = w;
        d[i] = (0.6 * Math.sin(p1) * Math.exp(-t / 0.045) + 0.3 * Math.sin(p2) * Math.exp(-t / 0.025) + 0.45 * hp * Math.exp(-t / 0.012)) * Math.min(1, t / 0.0008);
      }
    }),
    zil: make(0.3, (d) => {
      const fs = [5200, 6350, 7900, 9100], ph = fs.map(() => rand() * TAU);
      let hp = 0, prev = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, w = rand() * 2 - 1; hp = 0.5 * (hp + w - prev); prev = w;
        let s = 0;
        for (let k = 0; k < 4; k++) s += Math.sin(TAU * fs[k] * t + ph[k]) / (1 + k * 0.4);
        const e = Math.exp(-t / 0.07) + (t > 0.016 ? 0.6 * Math.exp(-(t - 0.016) / 0.06) : 0);
        d[i] = (0.25 * s + 0.5 * hp) * e * Math.min(1, t / 0.0006);
      }
    }),
  };
}

// ---------------------------------------------------------------- one-shot voices
// Natural variation for sounds that repeat a lot (± fraction of pitch/speed), so they never sound machine-gunned.
const VARY = { click: 0.03, hover: 0.03, pop: 0.06, drip: 0.08, crack: 0.05, thud: 0.04, rockBreak: 0.05, splash: 0.05, sparkle: 0.03 };

class Shot {
  constructor(A, name, { gain = 1, rate = 1, pan = 0 } = {}) {
    const c = (this.c = A.ctx);
    this.A = A; this.r = (rate > 0 ? rate : 1) * (1 + (A.rand() * 2 - 1) * (VARY[name] || 0)); this.t0 = c.currentTime + 0.012; this.end = 0; this.last = null;
    this.out = c.createGain(); this.out.gain.value = gain;
    this.tail = this.out;
    if (pan && c.createStereoPanner) { this.tail = c.createStereoPanner(); this.tail.pan.value = Math.max(-1, Math.min(1, pan)); this.out.connect(this.tail); }
    this.tail.connect(A.G.sfx);
  }
  at(x) { return this.t0 + x / this.r; }
  src(node, t, stop, offset) { node.start(t, offset); node.stop(stop); this.track(node, stop); }
  track(node, stop) { if (stop > this.end) { this.end = stop; this.last = node; } }
  amp(pan, send) {
    const g = this.c.createGain();
    if (pan && this.c.createStereoPanner) { const p = this.c.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(this.out); } else g.connect(this.out);
    if (send) g.connect(this.wet());
    return g;
  }
  /** Echo send of this shot (follows the shot's gain); only the parts that ask for it ring out. */
  wet() {
    if (!this.wetG) { this.wetG = this.c.createGain(); this.wetG.gain.value = this.out.gain.value; this.wetG.connect(this.A.G.sfxSend); }
    return this.wetG;
  }
  /** Oscillator note: optional frequency path and FM [ratio, index, indexDecay] for bells and tines. */
  tone({ type = 'sine', f, at = 0, a = 0.004, h = 0, d = 0.2, g = 0.2, fm, pan, send }) {
    const c = this.c, r = this.r, t = this.at(at), o = c.createOscillator(), amp = this.amp(pan, send);
    o.type = type;
    freqPath(o.frequency, f, t, r, 1 / r);
    const end = envelope(amp.gain, t, g, a / r, h / r, d / r) + 0.02;
    o.connect(amp);
    if (fm) {
      const m = c.createOscillator(), mg = c.createGain(), base = first(f) * r;
      freqPath(m.frequency, f, t, r * fm[0], 1 / r);
      mg.gain.setValueAtTime(base * fm[1], t);
      mg.gain.setTargetAtTime(base * fm[1] * 0.08, t, fm[2] / r / 3);
      m.connect(mg).connect(o.frequency);
      this.src(m, t, end);
    }
    this.src(o, t, end);
  }
  /** Filtered noise burst (white / pink / brown buffer) with a frequency path on the filter. */
  noise({ buf = 'white', type = 'bandpass', f = 1000, q = 1, at = 0, a = 0.004, h = 0, d = 0.2, g = 0.2 }) {
    const c = this.c, r = this.r, t = this.at(at), s = c.createBufferSource(), fl = biquad(c, type, first(f), q), amp = this.amp();
    s.buffer = this.A.buf[buf]; s.loop = true;
    freqPath(fl.frequency, f, t, r, 1 / r);
    s.connect(fl).connect(amp);
    this.src(s, t, envelope(amp.gain, t, g, a / r, h / r, d / r) + 0.02, this.A.rand() * (s.buffer.duration - 0.6));
  }
  /** Several notes on ONE source (oscillator, or noise through a stepped band-pass): 2–4 nodes for a whole figure. */
  seq({ noise, type, notes, times, step = 0.06, at = 0, a = 0.003, h = 0, d = 0.12, g = 0.1, gains, bend, bendT = 0.03, q = 2.5, fm, pan, lp, send }) {
    const c = this.c, r = this.r, starts = notes.map((_, i) => this.at(at + (times ? times[i] : i * step)));
    const amp = this.amp(pan, send);
    let s, freq;
    if (noise) {
      s = c.createBufferSource(); s.buffer = this.A.buf.white; s.loop = true;
      const fl = biquad(c, type || 'bandpass', notes[0], q); freq = fl.frequency;
      s.connect(fl).connect(amp);
    } else {
      s = c.createOscillator(); s.type = type || 'sine'; freq = s.frequency;
      if (lp) {
        const fl = biquad(c, 'lowpass', first(lp), 1.2);
        freqPath(fl.frequency, lp, starts[0], 1, 1 / r);
        s.connect(fl).connect(amp);
      } else s.connect(amp);
    }
    notes.forEach((f, i) => {
      freq.setValueAtTime(f * r, starts[i]);
      if (bend) freq.exponentialRampToValueAtTime(f * r * bend, starts[i] + bendT / r);
    });
    const H = (i) => (Array.isArray(h) ? h[i] : h) / r, D = (i) => (Array.isArray(d) ? d[i] : d) / r;
    const end = articulate(amp.gain, starts, notes.map((_, i) => g * (gains ? gains[i] : 1)), a / r, H, D) + 0.02;
    if (fm) {
      const m = c.createOscillator(), mg = c.createGain();
      notes.forEach((f, i) => {
        m.frequency.setValueAtTime(f * r * fm[0], starts[i]);
        mg.gain.setValueAtTime(f * r * fm[1], starts[i]);
        mg.gain.setTargetAtTime(f * r * fm[1] * 0.08, starts[i], fm[2] / r / 3);
      });
      m.connect(mg).connect(freq);
      this.src(m, starts[0], end);
    }
    this.src(s, starts[0], end, noise ? this.A.rand() * 1.2 : undefined);
  }
  /** Several oscillators through one envelope (a soft chord). */
  chord({ type = 'triangle', notes, at = 0, a = 0.04, h = 0, d = 0.6, g = 0.05 }) {
    const t = this.at(at), amp = this.amp(), end = envelope(amp.gain, t, g, a / this.r, h / this.r, d / this.r) + 0.02;
    for (const f of notes) { const o = this.c.createOscillator(); o.type = type; o.frequency.value = f * this.r; o.connect(amp); this.src(o, t, end); }
  }
  pluck(midi, at, g, send) {
    const { src, amp, end } = pluckNote(this.A, this.out, midi + 12 * Math.log2(this.r), this.at(at), g);
    if (send) amp.connect(this.wet());
    this.track(src, end);
  }
  drum(name, at, g) {
    const s = this.c.createBufferSource(), amp = this.amp(), t = this.at(at);
    s.buffer = instruments(this.A).drums[name]; s.playbackRate.value = this.r; amp.gain.value = g; s.connect(amp);
    this.src(s, t, t + s.buffer.duration / this.r);
  }
  /** Pan sweep across the stereo field (inserted after the output gain). */
  sweep(from, to, dur) {
    if (this.tail !== this.out || !this.c.createStereoPanner) return;
    const p = (this.tail = this.c.createStereoPanner());
    this.out.disconnect(); this.out.connect(p).connect(this.A.G.sfx);
    p.pan.setValueAtTime(from, this.t0); p.pan.linearRampToValueAtTime(to, this.at(dur));
  }
  finish() {
    const { A, out, tail, wetG, last } = this;
    if (!last) return;
    A.voices++;
    let done = false;
    last.onended = () => {
      if (done) return;
      done = true; A.voices--;
      out.disconnect(); if (tail !== out) tail.disconnect(); wetG?.disconnect();
    };
  }
}
/** Plucked strings and frame drum: rendered once, on first need (deferred after unlock so the first tap stays snappy). */
function instruments(A) {
  if (!A.plucks) {
    A.plucks = [45, 50, 57, 62, 69, 74, 81].map((m) => ksPluck(A.ctx, A.rand, m, m < 55 ? 2 : m < 70 ? 1.6 : 1.2));
    A.drums = drumKit(A.ctx, A.rand);
  }
  return A;
}
/** A Karplus-Strong note: nearest pre-rendered string, re-pitched; optional cut (damped) and slide-in. */
function pluckNote(A, dest, midi, t, g, cut, slide) {
  instruments(A);
  let best = A.plucks[0];
  for (const p of A.plucks) if (Math.abs(p.midi - midi) < Math.abs(best.midi - midi)) best = p;
  const c = A.ctx, s = c.createBufferSource(), amp = c.createGain(), rate = mtof(midi) / best.f;
  s.buffer = best.buffer;
  if (slide) { s.playbackRate.setValueAtTime(rate * 0.944, t); s.playbackRate.exponentialRampToValueAtTime(rate, t + 0.09); }
  else s.playbackRate.value = rate;
  let end = t + best.buffer.duration / rate;
  amp.gain.value = g;
  if (cut && cut < end) { amp.gain.setValueAtTime(g, cut); amp.gain.linearRampToValueAtTime(0, cut + 0.09); end = cut + 0.1; }
  s.connect(amp).connect(dest);
  s.start(t); s.stop(end);
  return { src: s, amp, end };
}

const pent = [1175, 1319, 1480, 1760, 1976, 2349, 2637, 2960, 3520];
const pick = (A, arr, n) => Array.from({ length: n }, () => arr[Math.floor(A.rand() * arr.length)]);
const sortedTimes = (A, n, a, b) => Array.from({ length: n }, () => a + (b - a) * A.rand() ** 1.6).sort((x, y) => x - y)
  .map((t, i, arr) => (i && t - arr[i - 1] < 0.045 ? (arr[i] = arr[i - 1] + 0.045) : t));

// recipe(s, A): s = Shot. Levels are absolute (balanced against each other and the limiter).
const SHOTS = {
  click(s) {
    s.tone({ f: [[1500, 0], [1050, 0.025]], a: 0.0015, d: 0.05, g: 0.14 });
    s.noise({ f: 3600, q: 1.2, a: 0.001, d: 0.014, g: 0.07 });
  },
  hover(s) { s.tone({ f: [[1900, 0], [2250, 0.04]], a: 0.006, d: 0.055, g: 0.035 }); },
  correct(s) { // "da-ding!" rising major third, e-piano tines with an echo
    s.tone({ f: 880, a: 0.002, d: 0.5, g: 0.2, fm: [3, 0.9, 0.2], send: true });
    s.tone({ f: 1108.7, at: 0.11, a: 0.002, d: 0.9, g: 0.22, fm: [3, 0.9, 0.25], send: true });
    s.tone({ f: 2217.5, at: 0.11, a: 0.002, d: 0.35, g: 0.035 });
  },
  wrong(s) { // soft "hmm-mm" falling third: rounded, low, no buzz, no sad droop
    s.tone({ type: 'triangle', f: [[392, 0], [375, 0.2]], a: 0.015, d: 0.2, g: 0.12 });
    s.tone({ type: 'triangle', f: [[330, 0], [324, 0.4]], at: 0.17, a: 0.015, d: 0.34, g: 0.12 });
  },
  stamp(s) { // rubber stamp thump + paper slap + sparkle
    s.tone({ f: [[170, 0], [52, 0.1]], a: 0.002, d: 0.3, g: 0.5 });
    s.noise({ type: 'lowpass', f: [[1600, 0], [300, 0.08]], q: 0.8, a: 0.001, d: 0.08, g: 0.38 });
    s.seq({ notes: [1760, 2217, 2637, 3520], step: 0.055, at: 0.09, a: 0.003, d: 0.22, g: 0.085, gains: [1, 0.85, 0.8, 1], send: true });
  },
  whoosh(s) { // teleport: airy band sweep crossing the stereo field, with a faint rising shimmer
    s.noise({ buf: 'pink', f: [[280, 0], [2300, 0.38], [700, 0.85]], q: 1.3, a: 0.32, d: 0.5, g: 0.55 });
    s.tone({ f: [[620, 0], [1500, 0.6]], a: 0.25, d: 0.4, g: 0.025 });
    s.sweep(-0.6, 0.6, 0.8);
  },
  pop(s) { s.tone({ f: [[380, 0], [1150, 0.04]], a: 0.002, d: 0.09, g: 0.22 }); },
  sparkle(s, A) {
    s.seq({ notes: pick(A, pent, 6), step: 0.05, a: 0.002, d: 0.16, g: 0.09, gains: [1, 0.9, 0.8, 0.75, 0.6, 0.5], pan: -0.5, send: true });
    s.seq({ notes: pick(A, pent, 5), step: 0.05, at: 0.025, a: 0.002, d: 0.16, g: 0.075, pan: 0.5, send: true });
  },
  fanfare(s) { // toy-horn "ta-da-da-DAA" over a soft chord, a frame-drum dum and a sparkle
    s.seq({ type: 'sawtooth', notes: [587.3, 740, 880, 1174.7], times: [0, 0.12, 0.24, 0.38], a: 0.015, h: [0.03, 0.03, 0.03, 0.35], d: [0.1, 0.1, 0.1, 0.6], g: 0.09, gains: [0.8, 0.85, 0.9, 1], lp: [[2400, 0], [1300, 1.3]], send: true });
    s.chord({ notes: [587.3, 740, 880], at: 0.38, a: 0.06, h: 0.3, d: 0.8, g: 0.05 });
    s.drum('dum', 0.38, 0.4);
    s.seq({ notes: [2349, 2960, 3520, 2637, 3136], step: 0.06, at: 0.5, a: 0.002, d: 0.2, g: 0.05, send: true });
  },
  unlock(s) { // magic rising run then an open bell chord
    s.seq({ notes: [587, 659, 740, 880, 988, 1175, 1319, 1480], step: 0.045, a: 0.002, d: 0.12, g: 0.07, fm: [3, 0.7, 0.1], send: true });
    s.tone({ f: 1174.7, at: 0.38, a: 0.002, d: 1.3, g: 0.13, fm: [3.5, 0.9, 0.5], send: true });
    s.tone({ f: 1760, at: 0.38, a: 0.002, d: 1.0, g: 0.07, fm: [3.5, 0.6, 0.4] });
  },
  found(s) { // discovery: qanun-like plucked arpeggio + bell
    [69, 74, 78, 81].forEach((m, i) => s.pluck(m, i * 0.07, 0.25, i === 3));
    s.tone({ f: 1174.7, at: 0.28, a: 0.002, d: 0.9, g: 0.1, fm: [3, 0.8, 0.25], send: true });
  },
  chime(s) { // one gentle wind-chime bell
    s.tone({ f: 1480, a: 0.002, d: 1.6, g: 0.1, fm: [3.5, 1.0, 0.6], send: true });
    s.tone({ f: 2217.5, a: 0.002, d: 0.9, g: 0.03 });
  },
  crack(s) { // ground splitting: dry crackles over a short grinding groan (not a gunshot)
    s.seq({ noise: true, notes: [1700, 1150, 2100, 900, 1400, 650], times: [0, 0.045, 0.085, 0.15, 0.21, 0.3], a: 0.002, d: 0.06, g: 1.5, gains: [1, 0.7, 0.8, 0.55, 0.5, 0.35], q: 2 });
    s.noise({ buf: 'pink', f: [[620, 0], [260, 0.45]], q: 1.4, a: 0.01, d: 0.42, g: 0.8 });
    s.tone({ type: 'triangle', f: [[95, 0], [58, 0.5]], a: 0.02, d: 0.5, g: 0.16 });
  },
  thud(s) { // heavy, soft landing: sub drop + an audible woody "tok"
    s.tone({ f: [[125, 0], [46, 0.16]], a: 0.003, d: 0.42, g: 0.42 });
    s.noise({ buf: 'pink', f: [[480, 0], [230, 0.1]], q: 1.1, a: 0.002, d: 0.16, g: 1.1 });
    s.tone({ type: 'triangle', f: [[340, 0], [180, 0.08]], a: 0.002, d: 0.12, g: 0.35 });
  },
  boom(s) { // deep, round "whump" with a soft attack and a rolling tail (no crack, nothing scary)
    s.noise({ buf: 'brown', type: 'lowpass', f: [[520, 0], [110, 1.5]], q: 0.7, a: 0.035, h: 0.12, d: 1.7, g: 0.5 });
    s.noise({ buf: 'pink', f: [[650, 0], [220, 1.1]], q: 0.9, a: 0.04, h: 0.05, d: 1.1, g: 0.8 });
    s.tone({ f: [[72, 0], [36, 1.2]], a: 0.025, d: 1.4, g: 0.3 });
    s.tone({ type: 'triangle', f: [[160, 0], [75, 0.3]], a: 0.01, d: 0.35, g: 0.22 });
  },
  rockBreak(s, A) { // snap + knock, then pebbles tumbling down
    s.noise({ f: 1600, q: 1.4, a: 0.001, d: 0.07, g: 0.8 });
    s.tone({ type: 'triangle', f: [[230, 0], [95, 0.12]], a: 0.002, d: 0.2, g: 0.3 });
    const n = 9;
    s.seq({ noise: true, notes: Array.from({ length: n }, () => 1100 + A.rand() * 1700), times: sortedTimes(A, n, 0.12, 1), a: 0.001, d: 0.045, g: 0.8, gains: Array.from({ length: n }, (_, i) => 1 - (i / n) * 0.7), q: 3 });
    s.seq({ type: 'triangle', notes: Array.from({ length: 5 }, () => 1700 + A.rand() * 900), times: sortedTimes(A, 5, 0.15, 0.8), a: 0.001, d: 0.03, g: 0.07 });
  },
  splash(s) {
    s.noise({ f: [[2400, 0], [900, 0.35]], q: 0.8, a: 0.006, d: 0.45, g: 0.4 });
    s.noise({ type: 'highpass', f: 4500, q: 0.5, a: 0.003, d: 0.18, g: 0.06 });
    s.seq({ notes: [950, 1300, 1150], times: [0.16, 0.27, 0.4], bend: 1.9, bendT: 0.03, a: 0.002, d: 0.07, g: 0.08 });
  },
  drip(s) {
    s.tone({ f: [[820, 0], [1650, 0.025]], a: 0.002, d: 0.1, g: 0.19 });
    s.tone({ f: [[1000, 0], [1900, 0.02]], at: 0.11, a: 0.002, d: 0.06, g: 0.05 });
  },
  beep(s) { s.seq({ type: 'triangle', notes: [1046.5, 1046.5], times: [0, 0.42], a: 0.01, h: 0.17, d: 0.05, g: 0.07 }); }, // reversing machine
};

// ---------------------------------------------------------------- loops and beds
class LoopVoice {
  constructor(A, dest) {
    this.A = A; this.c = A.ctx; this.t0 = this.c.currentTime + 0.01; this.nodes = []; this.srcs = [];
    this.out = this.gain(0); this.out.connect(dest);
  }
  node(n) { this.nodes.push(n); return n; }
  gain(v) { const g = this.node(this.c.createGain()); g.gain.value = v; g.gain.setValueAtTime(v, this.t0); return g; }
  filter(type, f, q = 0.7) { const b = this.node(biquad(this.c, type, f, q)); b.frequency.setValueAtTime(f, this.t0); return b; }
  osc(type, f) { const o = this.node(this.c.createOscillator()); o.type = type; o.frequency.value = f; o.frequency.setValueAtTime(f, this.t0); this.start(o); return o; }
  pan() { const p = this.node(this.c.createStereoPanner ? this.c.createStereoPanner() : this.c.createGain()); return p; }
  noise(buf, rate = 1) {
    const s = this.node(this.c.createBufferSource());
    s.buffer = this.A.buf[buf]; s.loop = true; s.playbackRate.value = rate;
    this.start(s, this.A.rand() * s.buffer.duration);
    return s;
  }
  start(s, offset) { s.start(this.t0, offset); this.srcs.push(s); }
  /** Slow random modulation: brown noise played very slowly, added to a param (irregular tremble, gusts). */
  wobble(param, speed, depth) { this.noise('brown', speed).connect(this.gain(depth)).connect(param); }
  ramp(p, v, tc) { if (tc) glide(p, v, this.c.currentTime, tc); else { p.value = v; p.setValueAtTime(v, this.t0); } }
  stop(fade) {
    const t = this.c.currentTime;
    glide(this.out.gain, 0, t, fade / 6); // ≈ -55 dB when the sources stop: no click
    for (const s of this.srcs) s.stop(t + fade + 0.05);
    this.srcs[0].onended = () => { for (const n of this.nodes) n.disconnect(); this.nodes.length = 0; };
  }
}

// Every factory builds its graph into L.out and returns { rate(r, tc), pump(t1)?, configure(zone)? }.
const LOOPS = {
  rumble(L) { // low earth rumble with an irregular tremble; rate = intensity
    const src = L.noise('brown'), lp = L.filter('lowpass', 170, 0.8), body = L.gain(0.3), mid = L.filter('bandpass', 360, 0.9), grit = L.gain(0.55);
    const hi = L.filter('bandpass', 900, 1.6), rattle = L.gain(0.12);
    src.connect(lp).connect(body).connect(L.out);
    src.connect(mid).connect(grit).connect(L.out);
    src.connect(hi).connect(rattle).connect(L.out);
    L.wobble(body.gain, 0.35, 0.4); L.wobble(grit.gain, 0.6, 0.8); L.wobble(rattle.gain, 2, 0.3);
    return { rate(r, tc) { L.ramp(lp.frequency, 170 * r, tc); L.ramp(mid.frequency, 360 * Math.sqrt(r), tc); L.ramp(hi.frequency, 900 * Math.sqrt(r), tc); } };
  },
  lava(L) { // thick bubbling over a soft glugging roar; rate = bubbling speed
    const { A } = L, src = L.noise('brown'), lp = L.filter('lowpass', 320, 0.6), roar = L.gain(0.28);
    src.connect(lp).connect(roar).connect(L.out);
    L.wobble(roar.gain, 0.2, 0.25);
    const voices = [0, 1].map(() => { const o = L.osc('sine', 200), g = L.gain(0), p = L.pan(); o.connect(g).connect(p).connect(L.out); return { o, g, p }; });
    let rate = 1, next = L.t0 + 0.1, v = 0;
    return {
      rate(r) { rate = r; },
      pump(t1) {
        next = Math.max(next, L.c.currentTime + 0.02);
        while (next < t1) {
          const b = voices[(v = 1 - v)], big = A.rand() < 0.25, f = (big ? 170 : 230 + A.rand() * 200) * Math.sqrt(rate), d = big ? 0.13 : 0.08;
          b.p.pan?.setValueAtTime(A.rand() * 1.2 - 0.6, next);
          b.o.frequency.setValueAtTime(f, next); b.o.frequency.exponentialRampToValueAtTime(f * 2.3, next + d);
          b.g.gain.setValueAtTime(0, next); b.g.gain.linearRampToValueAtTime(big ? 0.42 : 0.3, next + 0.008); b.g.gain.exponentialRampToValueAtTime(1e-4, next + d); b.g.gain.setValueAtTime(0, next + d + 0.005);
          next += (0.09 + A.rand() * 0.35) / rate + d * 0.3;
        }
      },
    };
  },
  water(L) { // a babbling stream; rate = flow
    const { A } = L, src = L.noise('pink'), bp = L.filter('bandpass', 750, 0.6), body = L.gain(0.36), hp = L.filter('bandpass', 3200, 0.7), fizz = L.gain(0.14);
    src.connect(bp).connect(body).connect(L.out);
    src.connect(hp).connect(fizz).connect(L.out);
    L.wobble(fizz.gain, 2.5, 0.16); L.wobble(body.gain, 0.8, 0.2);
    const o = L.osc('sine', 600), g = L.gain(0), p = L.pan(); o.connect(g).connect(p).connect(L.out);
    let rate = 1, next = L.t0 + 0.05;
    return {
      rate(r, tc) { rate = r; L.ramp(bp.frequency, 750 * r, tc); L.ramp(hp.frequency, 3200 * Math.sqrt(r), tc); },
      pump(t1) {
        next = Math.max(next, L.c.currentTime + 0.02);
        while (next < t1) {
          const f = 480 + A.rand() * 800, d = 0.035 + A.rand() * 0.03;
          p.pan?.setValueAtTime(A.rand() * 1.4 - 0.7, next);
          o.frequency.setValueAtTime(f, next); o.frequency.exponentialRampToValueAtTime(f * 1.7, next + d);
          g.gain.setValueAtTime(0, next); g.gain.linearRampToValueAtTime(0.035 + A.rand() * 0.05, next + 0.004); g.gain.exponentialRampToValueAtTime(1e-4, next + d); g.gain.setValueAtTime(0, next + d + 0.004);
          next += d + (0.03 + A.rand() * 0.25) / rate;
        }
      },
    };
  },
  rain(L) { // steady soft hiss, a low patter and single drops; rate = intensity
    const { A } = L, bp = L.filter('bandpass', 3800, 0.35), hiss = L.gain(0.2), lp = L.filter('lowpass', 600, 0.5), patter = L.gain(0.26);
    L.noise('pink').connect(bp).connect(hiss).connect(L.out);
    L.noise('brown').connect(lp).connect(patter).connect(L.out);
    const ds = L.noise('white'), dbp = L.filter('bandpass', 3000, 4), dg = L.gain(0), dp = L.pan();
    ds.connect(dbp).connect(dg).connect(dp).connect(L.out);
    let rate = 1, next = L.t0 + 0.05;
    return {
      rate(r, tc) { rate = r; L.ramp(hiss.gain, 0.2 * Math.min(1.6, r), tc); L.ramp(bp.frequency, 3800 * Math.sqrt(r), tc); },
      pump(t1) {
        next = Math.max(next, L.c.currentTime + 0.02);
        while (next < t1) {
          const d = 0.02 + A.rand() * 0.02;
          dp.pan?.setValueAtTime(A.rand() * 1.6 - 0.8, next);
          dbp.frequency.setValueAtTime(1800 + A.rand() * 3400, next);
          dg.gain.setValueAtTime(0, next); dg.gain.linearRampToValueAtTime(0.15 + A.rand() * 0.25, next + 0.0015); dg.gain.exponentialRampToValueAtTime(1e-4, next + d); dg.gain.setValueAtTime(0, next + d + 0.003);
          next += d + (0.015 + A.rand() * 0.08) / rate;
        }
      },
    };
  },
  wind(L) { // gusty breeze with a faint whistle; rate = gust strength/speed
    const { A } = L, src = L.noise('pink'), bp = L.filter('bandpass', 480, 0.8), body = L.gain(0.5), wbp = L.filter('bandpass', 1100, 7), whistle = L.gain(0.1);
    src.connect(bp).connect(body).connect(L.out);
    src.connect(wbp).connect(whistle).connect(L.out);
    L.wobble(body.gain, 0.03, 0.75); L.wobble(whistle.gain, 0.05, 0.2);
    let rate = 1, next = L.t0;
    return {
      rate(r) { rate = r; },
      pump(t1) {
        next = Math.max(next, L.c.currentTime);
        while (next < t1) {
          const d = (1.2 + A.rand() * 1.6) / rate;
          bp.frequency.linearRampToValueAtTime((300 + A.rand() * 550) * Math.sqrt(rate), next + d);
          wbp.frequency.linearRampToValueAtTime((850 + A.rand() * 700) * Math.sqrt(rate), next + d);
          next += d;
        }
      },
    };
  },
  engine(L) { // small diesel idle: firing pulse through a resonant low-pass, uneven chug, light clatter; rate = rpm
    const o1 = L.osc('sawtooth', 27), o2 = L.osc('square', 13.5), sub = L.gain(0.2), lp = L.filter('lowpass', 420, 2.6), amp = L.gain(0.12);
    o1.connect(lp); o2.connect(sub).connect(lp); lp.connect(amp).connect(L.out);
    const lfo = L.osc('sine', 13.5), chug = L.gain(0.12); lfo.connect(chug).connect(amp.gain);
    const ns = L.noise('white'), nbp = L.filter('bandpass', 1700, 1.2), clat = L.gain(0.05), clatMod = L.gain(0.05);
    ns.connect(nbp).connect(clat).connect(L.out); lfo.connect(clatMod).connect(clat.gain);
    return {
      rate(r, tc) {
        L.ramp(o1.frequency, 27 * r, tc); L.ramp(o2.frequency, 13.5 * r, tc); L.ramp(lfo.frequency, 13.5 * r, tc);
        L.ramp(lp.frequency, 420 * r ** 0.8, tc); L.ramp(amp.gain, 0.1 + 0.025 * r, tc); L.ramp(nbp.frequency, 1700 * Math.sqrt(r), tc);
      },
    };
  },
  ambience: (L) => BEDS.coast(L, 'hub'),
  music: (L) => musicGen(L),
};

// ---- ambience beds
const COAST = { hub: [1, 1], quake: [0.7, 0.85], volcano: [0.35, 0.9], weather: [0.9, 0.85], erosion: [0.8, 1], human: [0.7, 0.85] }; // [birds, waves]
const BEDS = {
  coast(L, zone) { // sea waves rolling in (surf + foam fizz) and occasional songbirds / a dove
    const { A } = L, src = L.noise('pink');
    const lp = L.filter('lowpass', 420, 0.4), surf = L.gain(0.25), hp = L.filter('highpass', 2800, 0.5), foam = L.gain(0);
    src.connect(lp).connect(surf).connect(L.out);
    src.connect(hp).connect(foam).connect(L.out);
    const bird = L.osc('sine', 3000), bg = L.gain(0), bp = L.pan();
    bird.connect(bg).connect(bp).connect(L.out);
    let [birds, waves] = COAST[zone] || COAST.hub, nextWave = L.t0, nextBird = L.t0 + 1.5 + A.rand() * 3;
    const call = (t) => {
      bp.pan?.setValueAtTime(A.rand() * 1.6 - 0.8, t);
      const f = bird.frequency, g = bg.gain;
      if (A.rand() < 0.22) { // collared dove: "coo-COO-coo"
        const base = 500 + A.rand() * 60;
        for (let i = 0; i < 3; i++) {
          const d = i === 1 ? 0.42 : 0.28, k = i === 1 ? 1.06 : 1;
          f.setValueAtTime(base * k * 1.05, t); f.exponentialRampToValueAtTime(base * k * 0.93, t + d);
          g.setValueAtTime(0, t); g.linearRampToValueAtTime(i === 1 ? 0.15 : 0.11, t + 0.08); g.linearRampToValueAtTime(0, t + d);
          t += d + 0.12;
        }
        return t;
      }
      const n = 2 + Math.floor(A.rand() * 4), base = 2600 + A.rand() * 1200, up = A.rand() < 0.5, lvl = 0.08 + A.rand() * 0.05;
      for (let i = 0; i < n; i++) {
        const d = 0.05 + A.rand() * 0.04, f0 = base * (0.95 + A.rand() * 0.1);
        f.setValueAtTime(up ? f0 : f0 * 1.35, t); f.exponentialRampToValueAtTime(up ? f0 * 1.35 : f0, t + d);
        g.setValueAtTime(0, t); g.linearRampToValueAtTime(lvl, t + 0.012); g.linearRampToValueAtTime(0, t + d);
        t += d + 0.06 + A.rand() * 0.06;
      }
      return t;
    };
    return {
      configure(z) { [birds, waves] = COAST[z] || COAST.hub; },
      pump(t1) {
        const now = L.c.currentTime;
        nextWave = Math.max(nextWave, now); nextBird = Math.max(nextBird, now);
        while (nextWave < t1) {
          const rise = 2 + A.rand() * 1.4, fall = 3 + A.rand() * 2.2, pk = waves * (0.7 + A.rand() * 0.3), tp = nextWave + rise;
          surf.gain.linearRampToValueAtTime(0.85 * pk, tp); surf.gain.linearRampToValueAtTime(0.22 * waves, tp + fall);
          lp.frequency.linearRampToValueAtTime(800 + 500 * pk, tp); lp.frequency.linearRampToValueAtTime(380, tp + fall);
          foam.gain.linearRampToValueAtTime(0, tp - 0.3); foam.gain.linearRampToValueAtTime(0.3 * pk, tp + 0.5); foam.gain.linearRampToValueAtTime(0, tp + 0.5 + fall * 0.8);
          nextWave = tp + fall;
        }
        while (nextBird < t1) nextBird = call(nextBird) + (2.5 + A.rand() * 6) / Math.max(0.1, birds);
      },
    };
  },
  hall(L) { // light breeze, distant sea and a soft distant crowd murmur
    const { A } = L, src = L.noise('pink');
    const bp = L.filter('bandpass', 500, 0.8), breeze = L.gain(0.3), sea = L.filter('lowpass', 320, 0.5), seaG = L.gain(0.18);
    src.connect(bp).connect(breeze).connect(L.out);
    src.connect(sea).connect(seaG).connect(L.out);
    L.wobble(breeze.gain, 0.04, 0.4);
    const lpM = L.filter('lowpass', 1500, 0.5); lpM.connect(L.out);
    const voices = [380, 640, 1050].map((f) => { const b = L.filter('bandpass', f, 2.5), g = L.gain(0); src.connect(b).connect(g).connect(lpM); return { b, g, f, next: L.t0 }; });
    let nextGust = L.t0;
    return {
      pump(t1) {
        const now = L.c.currentTime;
        nextGust = Math.max(nextGust, now);
        while (nextGust < t1) { const d = 1.5 + A.rand() * 1.5; bp.frequency.linearRampToValueAtTime(350 + A.rand() * 450, nextGust + d); nextGust += d; }
        for (const v of voices) {
          v.next = Math.max(v.next, now);
          while (v.next < t1) {
            const d = 0.09 + A.rand() * 0.14, lvl = A.rand() < 0.15 ? 0.15 : 0.45 + 0.55 * A.rand();
            v.g.gain.linearRampToValueAtTime(lvl * 0.55, v.next + d);
            if (A.rand() < 0.2) v.b.frequency.linearRampToValueAtTime(v.f * (0.8 + 0.4 * A.rand()), v.next + d);
            v.next += d;
          }
        }
      },
    };
  },
};

// ---- music: a gentle Khaleeji-flavoured tune in D. Melody bars use eighth-note slots ("A4/2" = two eighths, "-" = rest).
const BPM = 92, E8 = 30 / BPM, BAR = 8 * E8;
const PHRASES = [ // [melody (4 bars), bass root per bar (chosen to stay consonant with the melody), drone level, groove]
  ['D4 E4 F#4/2 F#4 G4 A4/2 | B4 A4 G4 F#4 E4/2 D4 E4 | F#4 G4 A4/2 A4 B4 C#5 B4 | A4/4 -/2 F#4 G4', 'D3 G2 D3 A2', 0, 'main'],
  ['A4 B4 A4 G4 F#4/2 G4 A4 | B4/2 A4 G4 F#4 E4 F#4/2 | G4 F#4 E4 D4 E4/2 C#4 E4 | D4/4 -/4', 'D3 B2 A2 D3', 0.35, 'main'],
  ['A4 D5 D5 C#5 D5/2 E5 F#5 | E5 D5 C#5 B4 A4/2 - A4 | B4 C#5 D5 E5 F#5/2 E5 D5 | E5/4 -/2 E5 F#5', 'D3 A2 B2 A2', 0.5, 'main'],
  ['G5 F#5 E5 D5 C#5/2 D5 E5 | F#5/2 E5 D5 C#5 B4 A4/2 | B4 A4 G4 F#4 E4/2 F#4 E4 | D4/4 -/4', 'A2 D3 A2 D3', 0.5, 'main'],
  ['D4 Eb4 F#4/2 G4 F#4 Eb4/2 | D4/2 -/2 A4 G4 F#4 G4 | A4 Bb4 A4 G4 F#4/2 G4 F#4 | Eb4/2 D4/2 -/4', 'D3 G2 D3 D3', 0.9, 'calm'], // Hijaz colour (Eb→D cadence)
  ['F#4 G4 A4/2 Bb4 A4 G4/2 | F#4 G4 F#4 Eb4 D4/4 | A4 B4 C#5 D5 E5/2 C#5 A4 | D5/4 -/4', 'D3 D3 A2 D3', 0.6, 'calm'],
].map(([mel, bass, drone, groove]) => ({
  bars: mel.split('|').map((bar) => {
    let slot = 0;
    return bar.trim().split(/\s+/).map((tok) => {
      const [n, len = '1'] = tok.split('/'), ev = { slot, len: +len, m: n === '-' ? null : noteNum(n) };
      slot += ev.len;
      return ev;
    }).filter((ev) => ev.m !== null);
  }),
  bass: bass.split(' ').map(noteNum), drone, groove,
}));
const ORDER = [0, 1, 2, 3, 4, 5, 0, 1]; // 32 bars ≈ 83.5 s
const GROOVES = { // D dum · T tak · t soft tak · z riq jingle · . rest (8 eighths)
  main: ['DT.TD.T.', 'DTzTDzT.', 'DT.TDtTz', 'D.tTD.Tt'],
  calm: ['D..TD...', 'D..tD..t', 'D.zTD.z.'],
  fill: ['DT.TDTTT', 'DTtTDtTT', 'D.TTD.TT'],
  intro: ['D...D...', 'D..tD.t.'],
};
const SCALE = { ajam: [1, 2, 4, 6, 7, 9, 11], hijaz: [0, 2, 3, 6, 7, 9, 10] }; // pitch classes (D Ajam = D major; D Hijaz)
const upper = (m, mode) => { for (let k = m + 1; k < m + 4; k++) if (SCALE[mode].includes(k % 12)) return k; return m + 2; };

function musicGen(L) {
  const { A, c } = L, R = A.rand;
  // persistent voices: soft drone (D + A), one monophonic ney with portamento, vibrato and breath
  const dlp = L.filter('lowpass', 650, 0.5), drone = L.gain(0);
  L.osc('triangle', mtof(50)).connect(dlp); L.osc('triangle', mtof(50) * 1.5).connect(dlp);
  dlp.connect(drone).connect(L.out);
  const ney = L.osc('sine', 440), neyG = L.gain(0);
  ney.setPeriodicWave(A.neyWave); ney.connect(neyG).connect(L.out);
  L.osc('sine', 5.2).connect(L.gain(11)).connect(ney.detune);
  const breath = L.filter('bandpass', 1900, 0.9), breathG = L.gain(0);
  L.noise('white').connect(breath).connect(breathG).connect(L.out);
  let bar = -2, next = L.t0 + 0.05, neyEnd = 0;
  const leads = ORDER.map(() => 'oud');
  // A bar is planned ahead as [time, fn] pairs; nodes are only created once a note enters the look-ahead window,
  // so node creation is spread evenly over time (no burst every bar on the main thread).
  const queue = [];
  const pl = (m, t, v, cut, slide) => queue.push([t, () => pluckNote(A, L.out, m, t, v, cut, slide)]);
  const hit = (name, t, v) => queue.push([t, () => {
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = A.drums[name]; g.gain.value = v; s.connect(g).connect(L.out); s.start(t); s.stop(t + s.buffer.duration);
  }]);
  const oud = (m, t, len, v, mode) => {
    const dur = len * E8;
    if (len >= 3 && R() < 0.45) { // risha tremolo on long notes
      const step = E8 / 3, n = Math.round(dur / step);
      for (let k = 0; k < n; k++) pl(m, t + k * step, v * (k ? 0.4 + (k % 2 ? 0 : 0.12) + 0.08 * R() : 1), t + (k + 1) * step + 0.04);
      return;
    }
    if (R() < 0.2) pl(upper(m, mode), t - 0.06, v * 0.35, t + 0.01);
    pl(m, t, v, t + dur + 0.25, len >= 2 && R() < 0.3);
  };
  const neyNote = (m, t, len, v) => {
    const f = mtof(m), dur = len * E8 - 0.03;
    if (t - neyEnd > 0.05) ney.frequency.setValueAtTime(f, t - 0.004); else ney.frequency.setTargetAtTime(f, t - 0.01, 0.018);
    neyG.gain.setTargetAtTime(0.15 * v, t, 0.03); neyG.gain.setTargetAtTime(0, t + dur, 0.05);
    breathG.gain.setTargetAtTime(0.05 * v, t, 0.01); breathG.gain.setTargetAtTime(0.012 * v, t + 0.06, 0.06); breathG.gain.setTargetAtTime(0, t + dur, 0.04);
    neyEnd = t + dur;
  };
  const scheduleBar = (T) => {
    const intro = bar < 0, bi = ((bar % 4) + 4) % 4, pi = intro ? 0 : Math.floor(bar / 4) % ORDER.length;
    const ph = PHRASES[ORDER[pi]], mode = ORDER[pi] === 4 || (ORDER[pi] === 5 && bi < 2) ? 'hijaz' : 'ajam';
    if (!intro && bar % 32 === 0) ORDER.forEach((_, i) => { leads[i] = bar && i && R() < 0.4 ? 'ney' : 'oud'; });
    if (bi === 0 || intro) drone.gain.setTargetAtTime((intro ? 0.5 : ph.drone) * 0.07, T, 1.2);
    // frame drum: groove with variations, a fill on every 4th bar
    const set = intro ? GROOVES.intro : bi === 3 && ph.groove === 'main' ? GROOVES.fill : GROOVES[ph.groove];
    const pat = set[Math.floor(R() * set.length)];
    for (let i = 0; i < 8; i++) {
      const ch = pat[i], t = T + i * E8 + (i % 2 ? 0.028 : 0) + (R() - 0.5) * 0.012, hum = 0.9 + R() * 0.2;
      if (ch === 'D') hit('dum', t, (i === 0 ? 0.26 : 0.2) * hum);
      else if (ch === 'T') hit('tak', t, 0.13 * hum);
      else if (ch === 't') hit('tak', t, 0.07 * hum);
      else if (ch === 'z') hit('zil', t, 0.06 * hum);
    }
    // low oud bass on the downbeat (and the half bar outside the calm section)
    const root = ph.bass[intro ? 0 : bi];
    pl(root, T, 0.36, T + 3.5 * E8);
    if (ph.groove === 'main' && bi !== 3) pl(R() < 0.5 ? root : root + 7, T + 4 * E8, 0.22, T + 7.5 * E8);
    // melody
    if (!intro) {
      const lead = leads[pi];
      for (const ev of ph.bars[bi]) {
        const t = T + ev.slot * E8 + (ev.slot % 2 ? 0.028 : 0) + (R() - 0.5) * 0.01, v = (ev.slot === 0 ? 1 : ev.slot % 2 ? 0.78 : 0.88) * (0.92 + R() * 0.12);
        if (lead === 'ney') neyNote(ev.m, t, ev.len, v); else oud(ev.m, t, ev.len, 0.5 * v, mode);
      }
    }
    bar++;
  };
  return {
    pump(t1) {
      if (!A.plucks) return; // instruments are still being rendered
      next = Math.max(next, c.currentTime + 0.05);
      while (next < t1 + 0.1) { scheduleBar(next); next += BAR; }
      for (let i = 0; i < queue.length;) if (queue[i][0] < t1) queue.splice(i, 1)[0][1](); else i++;
    },
  };
}

// ---------------------------------------------------------------- engine
function buildGraph(ctx) {
  const g = (v, dest) => { const n = ctx.createGain(); n.gain.value = v; if (dest) n.connect(dest); return n; };
  const out = g(0.8, ctx.destination), lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -10; lim.knee.value = 8; lim.ratio.value = 12; lim.attack.value = 0.001; lim.release.value = 0.25;
  lim.connect(out);
  const master = g(1, lim);
  // shared ping-pong echo (eighth / dotted eighth at the music tempo) for bells and music
  const echoIn = g(1), elp = biquad(ctx, 'lowpass', 2600, 0.7), dl = ctx.createDelay(1), dr = ctx.createDelay(1), fb = g(0.3), merge = ctx.createChannelMerger(2);
  dl.delayTime.value = E8; dr.delayTime.value = E8 / 2;
  echoIn.connect(elp).connect(dl); dl.connect(merge, 0, 0); dl.connect(dr); dr.connect(merge, 0, 1); dr.connect(fb).connect(dl);
  merge.connect(master);
  const loopDuck = g(1, master), ambDuck = g(1, master), musDuck = g(1, master);
  musDuck.connect(g(0.24, echoIn));
  return { master, loopDuck, ambDuck, musDuck, sfx: g(LEVEL.sfx, master), loops: g(LEVEL.loops, loopDuck), amb: g(LEVEL.amb, ambDuck), music: g(LEVEL.music, musDuck), sfxSend: g(0.3, echoIn) };
}

export function createAudio({ context } = {}) {
  let ctx = context || null;
  const offline = !!(ctx && typeof ctx.startRendering === 'function');
  let A = null, enabled = true, sfxOn = true, musicOn = true, unlocked = false, unlockedAt = 0, zone = null, bed = null, music = null, ducked = false, timer = 0, suspendTimer = 0;
  const lastPlay = Object.create(null), loops = new Set();

  function applySfx() {
    if (!A) return;
    const t = ctx.currentTime, G = A.G, k = sfxOn ? 1 : 0;
    glide(G.sfx.gain, LEVEL.sfx * k, t, 0.05); glide(G.loops.gain, LEVEL.loops * k, t, 0.05); glide(G.amb.gain, LEVEL.amb * k, t, 0.05); glide(G.sfxSend.gain, 0.3 * k, t, 0.05);
  }
  function ensure() {
    if (A) return A;
    try {
      if (!ctx) { const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null; ctx = new AC({ latencyHint: 'interactive' }); }
      const rand = prng(20261023);
      const noise = (pink) => { const b = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate); loopNoise(b.getChannelData(0), rand, pink); loopNoise(b.getChannelData(1), rand, pink); return b; };
      const white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), wd = white.getChannelData(0);
      for (let i = 0; i < wd.length; i++) wd[i] = (rand() * 2 - 1) * 0.7;
      A = {
        ctx, rand, voices: 0, gens: new Set(), G: buildGraph(ctx),
        buf: { white, pink: noise(true), brown: noise(false) }, plucks: null, drums: null,
        neyWave: ctx.createPeriodicWave(new Float32Array(6), new Float32Array([0, 1, 0.3, 0.1, 0.05, 0.02])),
      };
      if (!sfxOn) applySfx();
      if (offline) instruments(A);
      else {
        timer = setInterval(() => { if (ctx.state === 'running') pump(ctx.currentTime + LOOKAHEAD); }, TICK_MS);
        setTimeout(() => A && instruments(A), 80);
      }
      return A;
    } catch {
      A = null;
      return null;
    }
  }
  const live = () => enabled && A && (offline || ctx.state === 'running' || (unlockedAt && performance.now() - unlockedAt < 1500));
  function pump(until) { if (A) for (const g of A.gens) g.pump(until); }

  function makeLoop(name, dest, { gain = 1, rate = 1 } = {}, fade = 0.35, arg) {
    const L = new LoopVoice(A, dest), impl = name in BEDS ? BEDS[name](L, arg) : LOOPS[name](L);
    impl.rate?.(rate, 0);
    L.out.gain.linearRampToValueAtTime(gain, L.t0 + fade);
    if (impl.pump) { A.gens.add(impl); impl.pump(ctx.currentTime + LOOKAHEAD); }
    let stopped = false;
    return {
      impl,
      set(p = {}) {
        if (stopped) return;
        const t = ctx.currentTime;
        if (p.gain != null) glide(L.out.gain, Math.max(0, p.gain), t, 0.08);
        if (p.rate != null && p.rate > 0) impl.rate?.(p.rate, 0.12);
      },
      stop(f = 0.5) {
        if (stopped) return;
        stopped = true; A.gens.delete(impl); L.stop(f);
      },
    };
  }
  function setBed(key) {
    const type = !key || key === 'none' ? null : key === 'hall' ? 'hall' : 'coast'; // any other zone: sea + birds
    if (bed && bed.type === type) { bed.impl.configure?.(key); return; }
    bed?.stop(2.5);
    bed = type ? Object.assign(makeLoop(type, A.G.amb, {}, 2.5, key), { type }) : null;
  }
  function applyMusic() {
    if (musicOn && !music) music = makeLoop('music', A.G.music, {}, 3);
    else if (!musicOn && music) { music.stop(1.5); music = null; }
  }
  const safe = (fn) => (...args) => { try { return fn(...args); } catch { return undefined; } };

  const api = {
    get context() { return ctx; },
    pump: safe(pump),
    unlock: safe(() => {
      if (!ensure()) return;
      if (!offline && enabled && ctx.state !== 'running') {
        ctx.resume().catch(() => {});
        if (!unlockedAt) { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(); } // iOS
        unlockedAt = performance.now();
      }
      if (unlocked) return;
      unlocked = true;
      applyMusic();
      if (zone) setBed(zone);
    }),
    setEnabled: safe((on) => {
      enabled = !!on;
      if (!A) return;
      const t = ctx.currentTime;
      clearTimeout(suspendTimer);
      if (enabled) {
        if (!offline && unlocked) ctx.resume().catch(() => {});
        glide(A.G.master.gain, 1, t, 0.06);
      } else {
        glide(A.G.master.gain, 0, t, 0.03);
        if (!offline) suspendTimer = setTimeout(() => { if (!enabled) ctx.suspend().catch(() => {}); }, 300);
      }
    }),
    setMusic: safe((on) => { musicOn = !!on; if (unlocked && ensure()) applyMusic(); }),
    /** Sound effects, station loops and the ambience bed on/off (music and Ali's voice are separate switches). */
    setSfx: safe((on) => { sfxOn = !!on; applySfx(); }),
    duck: safe((on) => {
      if (!A || ducked === !!on) return;
      ducked = !!on;
      const t = ctx.currentTime, tc = ducked ? 0.12 : 0.45, G = A.G;
      glide(G.musDuck.gain, ducked ? DUCK.music : 1, t, tc);
      glide(G.ambDuck.gain, ducked ? DUCK.amb : 1, t, tc);
      glide(G.loopDuck.gain, ducked ? DUCK.loops : 1, t, tc);
    }),
    ambience: safe((key) => { zone = key || null; if (unlocked && ensure()) setBed(zone); }),
    play: safe((name, opts) => {
      const recipe = SHOTS[name];
      if (!recipe || !live() || A.voices >= MAX_VOICES) return;
      const t = ctx.currentTime;
      if (t - (lastPlay[name] ?? -1) < (name === 'hover' ? 0.07 : 0.03)) return;
      lastPlay[name] = t;
      const s = new Shot(A, name, opts);
      recipe(s, A);
      s.finish();
    }),
    loop: (name, opts) => {
      try {
        if (!LOOPS[name] || !ensure()) return NOOP_LOOP;
        const h = makeLoop(name, name === 'music' ? A.G.music : name === 'ambience' ? A.G.amb : A.G.loops, opts, name === 'music' ? 3 : 0.35);
        const handle = { set: safe(h.set), stop: safe((f) => { loops.delete(handle); h.stop(f); }) };
        loops.add(handle);
        return handle;
      } catch { return NOOP_LOOP; }
    },
    /** Safety net for zone changes: fades out every loop started with loop() (ambience() and setMusic() beds stay). */
    stopLoops: safe(() => { for (const h of [...loops]) h.stop(); }),
    dispose: safe(() => { clearInterval(timer); clearTimeout(suspendTimer); if (!offline && ctx) ctx.close(); A = null; }),
  };
  // UI shortcuts (the "unlock" jingle is play('unlock'): unlock() itself is the context unlock)
  for (const n of ['click', 'hover', 'correct', 'wrong', 'stamp', 'whoosh', 'pop', 'sparkle', 'fanfare', 'found']) api[n] = () => api.play(n);
  if (offline) ensure();
  return api;
}
