// Serve dist/ for testing. node tools/serve.mjs [--port 8080] [--quest]
// --quest also runs `adb reverse` so a Quest connected by USB can open http://localhost:<port> — localhost counts as a
// secure origin, so WebXR works without HTTPS (the headset needs developer mode and USB debugging allowed).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf('--port') + 1]) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`Serving ${ROOT} at http://localhost:${port}`);
  if (!argv.includes('--quest')) return;
  // WSL: use the Windows adb (the Quest is plugged into Windows); elsewhere the adb on PATH
  const candidates = ['/mnt/c/Users/sayed/AppData/Local/Android/Sdk/platform-tools/adb.exe', 'adb'];
  for (const adb of candidates) {
    try {
      const devices = execFileSync(adb, ['devices'], { encoding: 'utf8' });
      execFileSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`]);
      console.log(devices.trim());
      console.log(`Quest: open http://localhost:${port} in the Quest Browser, then press «ادخل بالنظارة».`);
      return;
    } catch { /* try the next adb */ }
  }
  console.log('adb reverse failed: plug the Quest in by USB, allow USB debugging in the headset, then run this again.');
});
