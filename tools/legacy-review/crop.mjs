// crop.mjs <in.png> <out.png> x y w h [scale]
import { chromium } from 'playwright';
const [,, inp, out, x, y, w, h, s='2'] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: +s });
await p.goto('file://' + inp); await p.addStyleTag({ content: 'body{margin:0!important;background:#fff} img{position:fixed;left:0;top:0;width:1280px;height:800px}' }); await p.waitForTimeout(300);
await p.screenshot({ path: out, clip: { x: +x, y: +y, width: +w, height: +h } }); await b.close();
