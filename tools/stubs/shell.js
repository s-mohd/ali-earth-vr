// Minimal stand-in shell: a start button and status line.
export function createShell({ onStart }) {
  const el = document.createElement('div');
  el.id = 'stub-start';
  el.style.cssText = 'position:fixed;inset:auto 0 20px 0;display:flex;gap:12px;justify-content:center;z-index:9;font:20px sans-serif';
  el.innerHTML = '<span id="stub-load">…</span><button id="startScreen" disabled>العب على الشاشة</button><button id="startVR" disabled>VR</button>';
  document.body.append(el);
  el.querySelector('#startScreen').onclick = () => onStart('screen');
  el.querySelector('#startVR').onclick = () => onStart('vr');
  const log = (window.__shellLog = []);
  return {
    setLoading(f, l) { el.querySelector('#stub-load').textContent = Math.round(f * 100) + '% ' + l; },
    ready() { el.querySelectorAll('button').forEach((b) => (b.disabled = false)); el.querySelector('#stub-load').textContent = 'ready'; },
    showStart() { el.hidden = false; }, hideStart() { el.hidden = true; },
    setPresenting(p) { log.push(['presenting', p]); }, say(t) { log.push(['say', t]); }, toast(t) { log.push(['toast', t]); },
    setStatus(s) { log.push(['status', s]); }, openHelp() {}, openTeacher() {}, openCertificate(d) { log.push(['cert', d]); }, closeModals() {},
  };
}
