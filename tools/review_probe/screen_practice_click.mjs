// Probe (screen): in a station practice question, a tap on the right card while Ali gives the "not quite" feedback
// is accepted by the card (click sound) but resolves the already-settled choice promise, so it is lost.
import { launch, FRESH } from './lib.mjs';
const out = {};
const T = await launch({ speed: 1, store: FRESH({ progress: { tutorial: true, done: ['quake', 'volcano'], evidence: { weather: ['pieces', 'cracks'] }, practice: {} } }) });
await T.page.evaluate(() => window.__ali.start('screen'));
await T.waitFor((s) => s.phase === 'choose', 'hub');
await T.page.evaluate(() => { window.__ali.engine.timeScale = 8; window.__ali.game.speech.timeScale = 8; });
await T.waitClickable('hub:go');
await T.click('hub:go');
await T.waitFor((s) => s.place === 'weather' && s.phase === 'predict' && s.cards === 2, 'predict');
await T.waitClickable('weather:predict:0');
await T.click('weather:predict:0');
await T.waitFor((s) => s.phase === 'practice' && s.cards === 2, 'practice', 120000);
await T.page.evaluate(() => { window.__ali.engine.timeScale = 1; window.__ali.game.speech.timeScale = 1; }); // real-time feedback line
await T.waitClickable('weather:practice:1');
await T.click('weather:practice:1'); // wrong
await T.page.waitForTimeout(400);
out.duringFeedback = { speaking: await T.page.evaluate(() => window.__ali.game.speech.speaking), clickAccepted: await T.click('weather:practice:0') }; // right, during "no"
await T.waitFor((s) => !s.bubble || true, 'x');
await T.page.waitForTimeout(9000);
const s = await T.state();
out.nineSecondsLater = { phase: s.phase, cards: s.cards, speaking: await T.page.evaluate(() => window.__ali.game.speech.speaking) };
out.logs = T.logs;
await T.browser.close();
console.log(JSON.stringify(out, null, 1));
