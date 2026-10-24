// Build one self-contained HTML file (JS, CSS and fonts inline) that runs offline in the Quest browser.
// node build.mjs [--dev]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const dev = process.argv.includes('--dev');
// --stubs: swap modules still being built for simple stand-ins (integration testing)
const stubs = process.argv.includes('--stubs');
const STUBS = [
  [/stations[\\/](quake|volcano|weather|erosion|human)\.js$/, (m) => `tools/stubs/st_${m[1]}.js`],
  [/world[\\/]world\.js$/, () => 'tools/stubs/world.js'],
  [/world[\\/]ali\.js$/, () => 'tools/stubs/ali.js'],
  [/core[\\/]audio\.js$/, () => 'tools/stubs/audio.js'],
  [/shell[\\/]shell\.js$/, () => 'tools/stubs/shell.js'],
  [/shell[\\/]certificate\.js$/, () => 'tools/stubs/certificate.js'],
];
const only = (process.argv.find((a) => a.startsWith('--stub-only=')) || '').split('=')[1]?.split(',');
const stubPlugin = { name: 'stubs', setup(b) { b.onResolve({ filter: /\.js$/ }, (args) => {
  if (!args.importer) return;
  const full = path.resolve(args.resolveDir, args.path);
  for (const [re, to] of STUBS) { const m = full.match(re); if (m && !full.includes('tools/stubs') && (!only || only.some((o) => full.includes(o)))) return { path: path.join(ROOT, to(m)) }; }
}); } };
const t0 = Date.now();
const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true, format: 'iife', target: ['chrome100', 'safari15'], minify: !dev, sourcemap: false, write: false,
  legalComments: 'none', charset: 'utf8', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
  plugins: stubs ? [stubPlugin] : [],
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const font = (f) => fs.readFileSync(path.join(ROOT, 'src/fonts', f)).toString('base64');
const fontsCss = `@font-face{font-family:"Baloo Bhaijaan 2";font-style:normal;font-weight:400 800;font-display:swap;src:url(data:font/woff2;base64,${font('baloo-700-arabic.woff2')}) format("woff2");unicode-range:U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EEFF;}
@font-face{font-family:"Baloo Bhaijaan 2";font-style:normal;font-weight:400 800;font-display:swap;src:url(data:font/woff2;base64,${font('baloo-700-latin.woff2')}) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}`;
const css = stubs && !fs.existsSync(path.join(ROOT, 'src/styles.css')) ? '' : fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
let html = fs.readFileSync(path.join(ROOT, stubs && !(only && only.some((o) => o.includes('shell'))) ? 'tools/stubs/index.html' : 'src/index.html'), 'utf8');
html = html.replace('/*@FONTS*/', () => fontsCss).replace('/*@CSS*/', () => css).replace('/*@JS*/', () => js);
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const outArg = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6);
const out = outArg ? path.resolve(outArg) : path.join(ROOT, stubs ? 'dist/stub.html' : 'dist/index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
if (process.argv.includes('--artifact')) {
  // claude.ai artifact: the host supplies the document skeleton, so publish only the title, the styles and the body content
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  const rtl = '<script>document.documentElement.lang="ar";document.documentElement.dir="rtl";</script>';
  html = `${title}\n${rtl}\n${styles}\n${body}`;
}
fs.writeFileSync(out, html);
console.log(`built ${out} ${(html.length / 1024).toFixed(0)} KB in ${Date.now() - t0} ms${dev ? ' (dev)' : ''}`);
