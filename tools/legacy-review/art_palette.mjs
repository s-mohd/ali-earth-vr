// Renders the proposed art-direction palette as a swatch sheet: shots/art_palette.png
import { chromium } from 'playwright';
const W = '/tmp/claude-1000/-home-ubuntu-my-frappe-apps/1f30f964-f0f1-4793-85c5-1e1f0a790cdb/scratchpad/ali';
const groups = [
  ['World', [['skyTop', '#4FB0E8'], ['skyMid', '#A9DDF6'], ['haze', '#FFE8CC'], ['seaDeep', '#1A8FBF'], ['seaShallow', '#47CFD6'], ['foam', '#F2FFFE'], ['sand', '#F3D9A4'], ['sandShade', '#D9B27A'], ['wetSand', '#C9A77E'], ['grass', '#8FCF6A'], ['grassShade', '#68B05A'], ['palmFrond', '#5DAA4E'], ['palmTrunk', '#A3714A'], ['dates', '#D9822B'], ['limestone', '#E6CFAB'], ['rockShade', '#B98E62'], ['soil', '#A9703F'], ['soilDark', '#7A4E2D']]],
  ['Built + phenomena', [['wall', '#F4E3C6'], ['parapet', '#E5CBA0'], ['doorTeal', '#2E8C8C'], ['woodTrim', '#8A5A3B'], ['asphalt', '#8E98A6'], ['roadLine', '#FFFFFF'], ['roadYellow', '#FFD34D'], ['crack', '#2A1E1A'], ['crackRim', '#F2D3A4'], ['basalt', '#4A3B3B'], ['basaltTop', '#6E5853'], ['lava', '#FF7A2E'], ['lavaCore', '#FFD25A'], ['ash', '#8C8399'], ['water', '#3FB6E3'], ['waterHi', '#C2F0FF'], ['freshScar', '#F4E2C6'], ['excavator', '#FFC22E']]],
  ['UI', [['ink', '#1F2F57'], ['inkSoft', '#4A5A80'], ['paper', '#FFF6E6'], ['card', '#FFFFFF'], ['frame', '#2B4A7A'], ['ctaSun', '#FF9F1C'], ['ctaBase', '#D97A00'], ['teal2', '#128C8A'], ['backLav', '#7A6CC9'], ['correct', '#1C9A57'], ['wrong', '#E0464B'], ['gold', '#FFC93C'], ['pearl', '#F7F3EE']]],
  ['Station hues (hot = sudden, cool = slow, yellow = people)', [['1 الزلزال', '#D6457A'], ['2 البركان', '#F05A28'], ['3 التجوية', '#7B5FD6'], ['4 التعرية', '#1C84DB'], ['5 الإنسان', '#FFC22E']]],
];
const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#FFF6E6;font:600 15px system-ui,sans-serif;color:#1F2F57}
h2{margin:18px 0 8px;font-size:18px} .row{display:flex;flex-wrap:wrap;gap:10px}
.sw{width:120px;border-radius:12px;overflow:hidden;box-shadow:0 2px 6px #0002;background:#fff}
.sw div{height:58px} .sw p{margin:4px 8px 6px;font-size:12px;line-height:1.3} .sw b{display:block;font-size:13px}
</style></head><body>${groups.map(([g, list]) => `<h2>${g}</h2><div class="row">${list.map(([n, h]) => `<div class="sw"><div style="background:${h}"></div><p><b>${n}</b><span dir="ltr">${h}</span></p></div>`).join('')}</div>`).join('')}</body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1320, height: 760 } });
await p.setContent(html);
await p.screenshot({ path: W + '/shots/art_palette.png', fullPage: true });
await b.close();
console.log('ok');
