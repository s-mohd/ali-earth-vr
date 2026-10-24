// Silent stand-in for the audio engine (sandbox / tests). Records calls so tools can check sound cues.
export function createSfxStub() {
  const log = [];
  const loop = (name, o = {}) => { log.push(['loop', name, o]); return { set(p) { log.push(['set', name, p]); }, stop() { log.push(['stop', name]); } }; };
  const api = { log, loop, play(name, o) { log.push(['play', name, o]); }, setEnabled() {}, setMusic() {}, duck() {}, ambience() {}, stopLoops() {}, dispose() {}, setSfx() {} };
  for (const n of ['click', 'hover', 'correct', 'wrong', 'stamp', 'whoosh', 'pop', 'sparkle', 'fanfare', 'found']) api[n] = () => api.play(n);
  api.unlock = () => {}; // resumes the audio context only (the jingle is play('unlock'))
  return api;
}
