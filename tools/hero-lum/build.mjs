#!/usr/bin/env node
// Builds (or checks) the hero header luminance tables: img/video/villa-hero-lum-webm.webp and -mp4.webp.
// See tools/hero-lum/README.md. No npm dependencies: Node 22+ (global fetch/WebSocket) and a local Chrome/Chromium.
//
//   node tools/hero-lum/build.mjs            build both tables, write them and tools/hero-lum/manifest.json
//   node tools/hero-lum/build.mjs --check    verify the tables in the project against the current videos (writes nothing)
//   options: --src webm|mp4 (one source only)   env CHROME=<path to chrome executable>
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const QUALITY = 0.85;                                    // WebP quality of the tables (part of the approved table format)
const args = process.argv.slice(2), CHECK = args.includes('--check');
const only = args.includes('--src') ? args[args.indexOf('--src') + 1] : null;
const SOURCES = ['webm', 'mp4'].filter(s => !only || s === only);
const MANIFEST = path.join(HERE, 'manifest.json');
const video = s => `img/video/villa-hero.${s}`, table = s => `img/video/villa-hero-lum-${s}.webp`;
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function findChrome() {
  const c = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const p = c.find(x => x && fs.existsSync(x));
  if (!p) throw new Error('Chrome/Chromium not found; set CHROME=<path to the executable>');
  return p;
}

// static server over the project, with HTTP Range (needed for video seeking)
const TYPES = { '.html': 'text/html', '.webm': 'video/webm', '.mp4': 'video/mp4', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size, type = TYPES[path.extname(f)] || 'application/octet-stream';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const s = m ? (m[1] ? +m[1] : size - +m[2]) : 0, e = m && m[1] && m[2] ? +m[2] : size - 1;
  res.writeHead(m ? 206 : 200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Cache-Control': 'no-store',
    ...(m ? { 'Content-Range': `bytes ${s}-${e}/${size}` } : {}) });
  fs.createReadStream(f, { start: s, end: e }).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// headless Chrome over the DevTools protocol (temporary profile, removed at the end)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-lum-'));
const chrome = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => { let buf = ''; const t = setTimeout(() => rej(new Error('Chrome did not start')), 30000);
  chrome.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); res(m[1]); } }); });
const browser = new WebSocket(wsUrl); await new Promise(r => browser.onopen = r);
let id = 0; const pending = new Map();
browser.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pending.set(i, r); browser.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const run = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.error || r.result.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
  return r.result.result.value; };
const pull = async k => { const n = await run(`len('${k}')`), parts = []; for (let o = 0; o < n; o += 400000) parts.push(Buffer.from(await run(`chunk('${k}', ${o}, 400000)`), 'base64')); return Buffer.concat(parts); };
const chromeVersion = (await send('Browser.getVersion')).result.product;
console.log(`${CHECK ? 'Checking' : 'Building'} hero luminance tables with ${chromeVersion}`);

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { tables: {} };
let ok = true;
try {
  for (const s of SOURCES) {
    const vbuf = fs.readFileSync(path.join(ROOT, video(s)));
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/hero-lum/build.html?src=/${video(s)}` }, sessionId);
    await new Promise(r => setTimeout(r, 1500));
    process.stdout.write(`${s}: decoding ${video(s)} ... `);
    const info = await run(`build(${QUALITY})`);
    const file = await pull('file');
    console.log(`${info.N} unique frames, table ${info.W}x${info.H}, ${file.length} bytes, compression error mean ${info.codecError.meanAbs} max ${info.codecError.maxAbs}, repeat-frame check ${info.repeatDiff}`);
    if (!CHECK) {
      fs.writeFileSync(path.join(ROOT, table(s)), file);
      manifest.tables[s] = { video: video(s), videoBytes: vbuf.length, videoSha256: sha256(vbuf), table: table(s), tableBytes: file.length, tableSha256: sha256(file),
        width: info.W, height: info.H, uniqueFrames: info.N, quality: QUALITY, builtWith: chromeVersion, builtAt: new Date().toISOString() };
      console.log(`   wrote ${table(s)}`);
      continue;
    }
    // --check: is the table in the project the one made from this video?
    const tpath = path.join(ROOT, table(s)), m = manifest.tables[s] || {};
    const tbuf = fs.existsSync(tpath) ? fs.readFileSync(tpath) : null;
    const cmp = tbuf ? await run(`checkTable('/${table(s)}')`) : { error: 'missing' };
    const checks = [
      ['table file present', !!tbuf],
      ['video unchanged since the table was built (manifest)', m.videoSha256 === sha256(vbuf)],
      ['table file unchanged since it was built (manifest)', !!tbuf && m.tableSha256 === sha256(tbuf)],
      ['table has the expected size', !!cmp.sameSize],
      ['table values match the current video (within WebP compression error)', !!cmp.sameSize && cmp.meanAbs <= Math.max(2.5, info.codecError.meanAbs + 0.5) && cmp.maxAbs <= Math.max(24, info.codecError.maxAbs + 6)],
      ['rebuilding now gives the identical file (same encoder)', !!tbuf && sha256(file) === sha256(tbuf)],
    ];
    console.log(`   project table vs current video: ${cmp.error || `mean abs diff ${cmp.meanAbs}, max ${cmp.maxAbs}`}`);
    for (const [label, pass] of checks) console.log(`   ${pass ? 'PASS' : (label.startsWith('rebuilding') ? 'note' : 'FAIL')}  ${label}`);
    if (checks.slice(0, 5).some(c => !c[1])) ok = false;
  }
  if (!CHECK) { fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n'); console.log('wrote tools/hero-lum/manifest.json'); }
  else console.log(ok ? 'CHECK PASSED' : 'CHECK FAILED: rebuild with  node tools/hero-lum/build.mjs');
} catch (e) { console.error('ERROR', e.message); ok = false; }
finally {
  try { browser.close(); } catch {} chrome.kill(); server.close();
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(ok ? 0 : 1); }, 500);
}
