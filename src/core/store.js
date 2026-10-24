// Saved progress, settings and challenge attempts (localStorage with an in-memory fallback for private windows/blocked storage).
const KEY = 'aliEarthVR.v3';
const DEFAULTS = () => ({
  version: 3,
  settings: { voice: true, sfx: true, music: true, captions: true, gender: 'm', name: '', height: 'auto', unlockAll: false, shadows: true },
  progress: { tutorial: false, done: [], evidence: {}, practice: {}, challenges: 0 },
  attempts: [],
});

let mem = null;
function read() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch {}
  return mem ? JSON.parse(mem) : null;
}
function write(data) {
  const s = JSON.stringify(data);
  mem = s;
  try { localStorage.setItem(KEY, s); } catch {}
}

export const store = {
  data: null,
  load() {
    const d = read(), base = DEFAULTS();
    this.data = d && d.version === 3 ? { ...base, ...d, settings: { ...base.settings, ...d.settings }, progress: { ...base.progress, ...d.progress } } : base;
    return this;
  },
  save() { write(this.data); },
  get settings() { return this.data.settings; },
  get progress() { return this.data.progress; },
  get attempts() { return this.data.attempts; },
  set(key, value) { this.data.settings[key] = value; this.save(); },
  isDone(key) { return this.data.progress.done.includes(key); },
  markDone(key) { if (!this.isDone(key)) { this.data.progress.done.push(key); this.save(); } },
  foundEvidence(key, id) { const e = (this.data.progress.evidence[key] ||= []); if (!e.includes(id)) { e.push(id); this.save(); } return e; },
  addAttempt(a) { this.data.attempts.push(a); this.save(); },
  resetProgress() { this.data.progress = DEFAULTS().progress; this.save(); },
  clearAttempts() { this.data.attempts = []; this.save(); },
};
