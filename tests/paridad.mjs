#!/usr/bin/env node
/* Paridad ES/EN en el navegador, sin dependencias: abre cada una de las cinco vistas en español y en inglés (a 1300 px,
   con los desplegables abiertos) y comprueba que las cifras visibles, los enlaces, las etiquetas HTML y las formas de los
   gráficos son los mismos: sólo cambia el idioma de las palabras. Los dos RSS (parte.xml / parte.en.xml) son la única
   diferencia de enlaces admitida; las líneas de un rótulo SVG pueden partirse distinto según la longitud del texto.
   Uso: node tests/paridad.mjs   (CHROME=/ruta/al/navegador si no es el habitual) */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml' };
const chrome = process.env.CHROME || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find(b => { try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; } })
  || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if (!chrome) { console.error('No hay Chrome: indica su ruta en CHROME.'); process.exit(2); }

const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const profile = mkdtempSync(path.join(tmpdir(), 'moloch-chrome-'));
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const done = code => { try { proc.kill(); } catch {} server.close(); try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); };

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 100 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
  if (!target) await sleep(100);
}
if (!target) { console.error('Chrome no ha abierto el puerto de depuración'); done(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async expr => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'error en la página');
  return r.result.result.value;
};

const fails = [];
const check = (c, msg) => { if (!c) fails.push(msg); };

const HELP = `
  window.sleep = ms => new Promise(r => setTimeout(r, ms));
  window.$ = s => document.querySelector(s); window.$$ = s => [...document.querySelectorAll(s)];
  window.waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return false; };`;

await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 900, deviceScaleFactor: 1, mobile: false });
const CAP = `
  const sec = document.querySelector('section.view[data-view="' + VIEW + '"]');
  const tags = {}; sec.querySelectorAll('*').forEach(e => { if (e.tagName.toLowerCase() !== 'tspan') tags[e.tagName] = (tags[e.tagName] || 0) + 1; });
  return { text: sec.innerText.replace(/\\s+/g, ' '), tags, hrefs: [...sec.querySelectorAll('a[href]')].map(a => a.getAttribute('href').replace(/parte\\.en\\.xml/, 'parte.xml')).sort(),
    shapes: sec.querySelectorAll('svg rect, svg path, svg circle, svg line').length };`;
const VIEWS = ['hoy', 'modelos', 'lanzamientos', 'carrera', 'ai2027'];
const cap = {};
for (const lang of ['es', 'en']) {
  await send('Page.navigate', { url: `${base}?i18n=1&lang=${lang}#hoy` });
  await sleep(300);
  await run(`await new Promise(r => { const t = setInterval(() => { if (document.readyState === 'complete') { clearInterval(t); r(); } }, 50); });`);
  await run(HELP);
  await run(`await waitFor(() => $$('.chart svg').length > 0 || $('#mx-body tr.row'));`);
  cap[lang] = {};
  for (const v of VIEWS) {
    await run(`location.hash = '#${v}'; await sleep(700); $$('details').forEach(d => d.open = true); await sleep(200); return 1;`);
    cap[lang][v] = await run(`const VIEW = '${v}'; ${CAP}`);
  }
}
const nums = s => (String(s).match(/\d+(?:[.,]\d+)*/g) || []).map(x => x.replace(/[.,]/g, '').replace(/0+$/, '')).sort();
const diff = (a, b) => { const m = new Map(); a.forEach(x => m.set(x, (m.get(x) || 0) + 1)); b.forEach(x => m.set(x, (m.get(x) || 0) - 1)); return [...m].filter(([, n]) => n).map(([k, n]) => `${k}:${n > 0 ? '+' : ''}${n}`); };
for (const v of VIEWS) {
  const a = cap.es[v], b = cap.en[v];
  check(a.text.length > 200 && b.text.length > 200, `${v}: la vista está vacía`);
  const dn = diff(nums(a.text), nums(b.text));
  check(!dn.length, `${v}: las cifras visibles difieren entre ES y EN (${dn.slice(0, 10).join(' ')})`);
  const dh = diff(a.hrefs, b.hrefs);
  check(!dh.length, `${v}: los enlaces difieren (${dh.slice(0, 5).join(' ')})`);
  const dt = diff(Object.entries(a.tags).map(([k, n]) => k + n), Object.entries(b.tags).map(([k, n]) => k + n));
  check(!dt.length, `${v}: la estructura HTML difiere (${dt.slice(0, 8).join(' ')})`);
  check(a.shapes === b.shapes, `${v}: las formas de los gráficos difieren (${a.shapes} ≠ ${b.shapes})`);
}
if (fails.length) { console.error(`Paridad ES/EN: ${fails.length} fallos\n- ${fails.join('\n- ')}`); done(1); }
console.log('Paridad ES/EN correcta: las cinco vistas muestran las mismas cifras, enlaces, estructura y gráficos en los dos idiomas.');
done(0);
