import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('file://' + new URL('./vig.html', import.meta.url).pathname);
await p.waitForFunction(() => window.__vig, null, { timeout: 60000 }).catch(() => {});
console.log(JSON.stringify(await p.evaluate(() => window.__vig)), errs);
await b.close();
