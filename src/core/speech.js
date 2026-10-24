// Arabic narration through the Web Speech API when an Arabic voice exists; otherwise a timed "silent" read
// so Ali's mouth, captions and pacing still work (the Quest browser often has no Arabic voice).
export class Speech {
  constructor() {
    this.enabled = true;
    this.timeScale = 1; // tests run faster
    this.voice = null;
    this.speaking = false;
    this._token = 0;
    this._timer = null;
    const synth = (this.synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null);
    const pick = () => {
      const vs = synth?.getVoices?.() || [];
      const ar = vs.filter((v) => /^ar(-|_|$)/i.test(v.lang));
      this.voice = ar.find((v) => /BH|SA|AE|KW|QA/i.test(v.lang) && !/compact/i.test(v.name)) || ar.find((v) => !/compact/i.test(v.name)) || ar[0] || null;
    };
    pick();
    synth?.addEventListener?.('voiceschanged', pick);
  }
  get available() { return !!this.voice; }
  /** Estimated reading time for children (seconds). */
  static estimate(text) { return Math.max(1.6, String(text).replace(/\s+/g, ' ').length / 12.5 + 0.5); }
  setEnabled(on) { this.enabled = !!on; if (!on) this.stop(); }
  /**
   * Speak `text`. Resolves when finished (or interrupted). onBoundary not used: lips follow `speaking`.
   * With no voice (or voice disabled) it resolves after the estimated reading time.
   */
  say(text, { rate = 0.92 } = {}) {
    this.stop();
    const token = ++this._token;
    this.speaking = true;
    return new Promise((resolve) => {
      const done = (ok = true) => {
        if (ok !== false) ok = true;
        if (token !== this._token) return;
        this._pending = null; this.speaking = false; clearTimeout(this._timer); resolve(ok);
      };
      this._pending = () => done(false);
      if (this.enabled && this.voice && this.synth) {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = this.voice; u.lang = this.voice.lang; u.rate = rate; u.pitch = 1.08;
        u.onend = () => done(); u.onerror = () => done();
        // watchdog: some engines never fire onend
        this._timerMs = null;
        this._timer = setTimeout(done, (Speech.estimate(text) * 1.8 + 3) * 1000);
        try { this.synth.speak(u); } catch { done(); }
      } else {
        this._timerMs = (Speech.estimate(text) * 1000) / this.timeScale;
        this._timerAt = performance.now();
        this._timer = setTimeout(done, this._timerMs);
      }
      this._done = done;
    });
  }
  /** Freeze the current line (session hidden); resume() continues it. */
  pause() {
    if (!this.speaking || this._paused) return;
    this._paused = true;
    clearTimeout(this._timer);
    this._left = this._timerMs != null ? Math.max(200, this._timerMs - (performance.now() - this._timerAt)) : null;
    try { this.synth?.pause(); } catch {}
  }
  resume() {
    if (!this._paused) return;
    this._paused = false;
    try { this.synth?.resume(); } catch {}
    if (this.speaking && this._done) {
      // a real voice keeps its own end event; a timed (silent) line gets its remaining time back, plus a generous watchdog
      const ms = this._left ?? (Speech.estimate('…………') * 1000 + 6000);
      this._timerMs = ms; this._timerAt = performance.now();
      this._timer = setTimeout(this._done, ms);
    }
  }
  stop() {
    this._paused = false;
    this._pending?.();
    this._token++;
    this.speaking = false;
    clearTimeout(this._timer);
    try { this.synth?.cancel(); } catch {}
  }
}
