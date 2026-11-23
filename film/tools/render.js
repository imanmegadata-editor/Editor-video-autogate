// Usage: node tools/render.js stills <outdir> t1 t2 ...    -> JPEG stills
//        node tools/render.js video <out.mp4> [start] [end]  -> frames piped to ffmpeg
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2' };
const [mode, out, ...rest] = process.argv.slice(2);
const srv = http.createServer((q, s) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  s.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).on('error', () => { s.statusCode = 404; s.end(); }).pipe(s);
}).listen(0, async () => {
  const port = srv.address().port;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  pg.on('console', (m) => { if (!m.text().includes('GPU stall')) console.log('[page]', m.text().slice(0, 300)); });
  pg.on('pageerror', (e) => console.log('[pageerror]', e.stack));
  await pg.goto(`http://localhost:${port}/src/index.html${process.env.Q || ''}`);
  await pg.waitForFunction('window.ready === true', null, { timeout: 60000 });
  const grab = async (t) => Buffer.from((await pg.evaluate((t) => window.renderFrame(t), t)).split(',')[1], 'base64');
  if (mode === 'stills') {
    fs.mkdirSync(out, { recursive: true });
    for (const t of rest.map(Number)) fs.writeFileSync(path.join(out, `t${t.toFixed(2).padStart(6, '0')}.jpg`), await grab(t));
  } else {
    const fps = 24, start = Number(rest[0] ?? 0), end = Number(rest[1] ?? 70);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const n0 = Math.round(start * fps), n1 = Math.round(end * fps);
    const T = Date.now();
    for (let i = n0; i < n1; i++) {
      const buf = await grab(i / fps);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 48 === 0) console.log(`frame ${i}/${n1}  ${((Date.now() - T) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  }
  await b.close(); srv.close();
});
