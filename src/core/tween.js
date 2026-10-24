// Game-time tweens. Driven by the engine's scaled clock (pauses when the headset menu is open, speeds up in tests).
const tickers = new Set();
let now = 0;

/** Called once per frame by the engine with the scaled delta time. */
export function stepTweens(dt) {
  now += dt;
  for (const t of [...tickers]) t(dt, now);
}
export function gameTime() { return now; }

/** Register a per-frame callback (dt, time). Returns an unsubscribe function. */
export function onFrame(fn) { tickers.add(fn); return () => tickers.delete(fn); }

/**
 * Animate over `dur` seconds. fn(k) receives eased progress 0..1.
 * Returns { done: Promise, cancel() }. Cancel resolves `done` without finishing.
 */
export function tween(dur, fn, easing = (x) => x) {
  let el = 0, off, resolve;
  const done = new Promise((r) => (resolve = r));
  if (dur <= 0) { fn(easing(1)); resolve(); return { done, cancel() {} }; }
  off = onFrame((dt) => {
    el += dt;
    const k = Math.min(1, el / dur);
    fn(easing(k));
    if (k >= 1) { off(); resolve(); }
  });
  return { done, cancel() { off(); resolve(); } };
}

/** Promise that resolves after `s` game-seconds. */
export function wait(s) { return tween(s, () => {}).done; }
