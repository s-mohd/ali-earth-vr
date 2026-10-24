// Contact sheet of PNGs: node tools/sheet.mjs <dir> [--match regex] [--cols 3] [--w 520] [--out file]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const dir = path.resolve(argv[0]);
const re = new RegExp(opt('match', '.'));
const cols = Number(opt('cols', 3)), cw = Number(opt('w', 520));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith('sheet') && re.test(f)).sort();
const out = path.resolve(opt('out', path.join(dir, 'sheet.png')));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: cols * (cw + 8) + 8, height: 300 } });
await page.setContent(`<html><body style="margin:0;background:#223;display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:8px;padding:8px;font:13px sans-serif;color:#fff">${files.map((f) => `<figure style="margin:0"><img src="data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}" style="width:${cw}px;display:block"><figcaption>${f}</figcaption></figure>`).join('')}</body></html>`);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out, files.length);
