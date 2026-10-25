#!/usr/bin/env node
/* Prueba del cambio de idioma en el navegador, sin dependencias: abre la web con Chrome sin ventana (protocolo
   DevTools por WebSocket, el de Node 22), prepara un estado (filtro, orden, comparación, ficha abierta, desplazamiento),
   cambia a inglés y de vuelta, y comprueba que el estado se conserva, que no hay errores ni pantallas vacías, que no
   se duplican los escuchadores, que los gráficos siguen dibujados y que el idioma queda recordado.
   Uso: node tests/idioma.mjs   (CHROME=/ruta/al/navegador si no es el habitual) */
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

/* Funciones de ayuda que se instalan en la página tras cargarla. */
const HELP = `
  window.sleep = ms => new Promise(r => setTimeout(r, ms));
  window.$ = s => document.querySelector(s); window.$$ = s => [...document.querySelectorAll(s)];
  window.__errs = []; addEventListener('error', e => { if (!/ResizeObserver loop/.test(e.message)) __errs.push(e.message); });   // el aviso de ResizeObserver es inofensivo addEventListener('unhandledrejection', e => __errs.push(String(e.reason)));
  const ce = console.error; console.error = (...a) => { __errs.push(a.map(String).join(' ')); ce(...a); };
  window.waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return false; };
  window.estado = () => ({
    w: $('#mx-weights [aria-pressed=true]')?.dataset.w, sort: $('#mx-sort')?.value, q: $('#mx-q')?.value,
    cmp: $$('#mx-body input[data-cmp]:checked').map(x => x.dataset.cmp), open: $$('#mx-body tr.row[aria-expanded=true]').map(x => x.dataset.id),
    hash: location.hash, y: Math.round(scrollY), rows: $$('#mx-body tr.row').length, lang: document.documentElement.lang,
    nav: $('.navtab[aria-current]')?.dataset.view, shown: $$('section.view:not([hidden])').map(s => s.dataset.view),
    details: $$('details').map(d => d.open), pressed: $$('[data-lang-set]').map(b => b.dataset.langSet + ':' + b.getAttribute('aria-pressed')).join(),
    svgs: $$('.chart svg').length, title: document.title, ls: localStorage.getItem('moloch.lang'), search: location.search
  });
`;
async function open(url, w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(300);
  await run(`await new Promise(r => { const t = setInterval(() => { if (document.readyState === 'complete') { clearInterval(t); r(); } }, 50); });`);
  await run(HELP);
  await run(`return await waitFor(() => $$('#mx-body tr.row').length > 0 && $$('.chart svg').length > 0);`);
}

for (const [w, h] of [[1300, 900], [390, 844]]) {
  const where = `${w}px`;
  await open(`${base}?i18n=1#modelos`, w, h);
  // 1 · preparar el estado: filtro, orden, búsqueda, comparación, ficha abierta, desplegable y desplazamiento
  const prep = await run(`
    $('#mx-weights [data-w="abiertos"]').click(); await sleep(150);
    const sel = $('#mx-sort'); sel.value = 'price'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(150);
    const q = $('#mx-q'); q.value = 'a'; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(150);
    $$('#mx-body input[data-cmp]')[0].click(); await sleep(150);
    $$('#mx-body input[data-cmp]:not(:checked)')[0].click(); await sleep(150);
    $$('#mx-body tr.row')[1].click(); await sleep(250);
    const d = $$('details')[0]; if (d) d.open = true;
    scrollTo(0, 400); await sleep(150);
    return estado();`);
  check(prep.w === 'abiertos' && prep.sort === 'price' && prep.cmp.length === 2 && prep.open.length === 1 && prep.hash.startsWith('#modelos/'), `${where}: no se pudo preparar el estado (${JSON.stringify(prep)})`);

  // 2 · ES → EN: nada se pierde y se ve ya traducido
  const t0 = Date.now();
  const en = await run(`
    __errs.length = 0;
    $('[data-lang-set=en]').click();
    const ok = await waitFor(() => document.documentElement.lang === 'en');
    const e = estado(); e.ok = ok; e.errs = __errs.slice(); e.th = $$('#mx-table thead th').map(x => x.textContent.trim()).join('|'); e.freshness = $('#freshness')?.textContent.slice(0, 40);
    e.blank = $$('section.view:not([hidden])').every(s => s.textContent.trim().length > 200);
    e.body = document.body.innerText.length;
    return e;`);
  const ms = Date.now() - t0;
  check(en.ok && en.lang === 'en', `${where}: no cambió a inglés`);
  for (const k of ['w', 'sort', 'q', 'hash', 'nav', 'rows']) check(JSON.stringify(en[k]) === JSON.stringify(prep[k]), `${where}: al pasar a EN se perdió «${k}»: ${JSON.stringify(prep[k])} → ${JSON.stringify(en[k])}`);
  check(JSON.stringify(en.cmp) === JSON.stringify(prep.cmp), `${where}: comparación perdida`);
  check(JSON.stringify(en.open) === JSON.stringify(prep.open), `${where}: ficha abierta perdida`);
  check(JSON.stringify(en.details) === JSON.stringify(prep.details), `${where}: desplegables cambiados`);
  check(Math.abs(en.y - prep.y) <= 2, `${where}: desplazamiento ${prep.y} → ${en.y}`);
  check(en.svgs > 0, `${where}: sin gráficos tras el cambio`);
  check(en.blank, `${where}: la vista visible quedó vacía`);
  check(!en.errs.length, `${where}: errores al cambiar: ${en.errs.join(' · ')}`);
  check(en.pressed === 'es:false,en:true', `${where}: botones ES|EN mal marcados (${en.pressed})`);
  check(en.ls === 'en' && /lang=en/.test(en.search) && /i18n=1/.test(en.search), `${where}: idioma sin recordar (${en.ls} ${en.search})`);
  check(/Observatory/.test(en.title) && /Today|Models/.test(en.th + en.title) || /Compare/.test(en.th), `${where}: título o cabeceras sin traducir (${en.title} / ${en.th})`);
  check(ms < 3000, `${where}: el cambio tardó ${ms} ms`);

  // 3 · El resto de vistas, ya en inglés y sin textos pendientes; los listeners siguen siendo uno por acción
  const rest = await run(`
    const out = {};
    for (const v of ['hoy', 'lanzamientos', 'carrera', 'ai2027', 'modelos']) {
      location.hash = '#' + v; await sleep(250);
      out[v] = { shown: $$('section.view:not([hidden])').map(s => s.dataset.view).join(), svgs: $$('section.view:not([hidden]) svg').length, err: $$('[data-render-error]').length, text: $('section.view:not([hidden])').textContent.length };
    }
    return out;`);
  for (const [v, o] of Object.entries(rest)) { check(o.shown === v && o.text > 500 && !o.err, `${where}: vista ${v} en inglés mal (${JSON.stringify(o)})`); }
  check(rest.carrera.svgs > 0 && rest.hoy.svgs > 0, `${where}: gráficos de Hoy o La carrera sin dibujar en inglés`);

  // 4 · Un clic en una fila abre/cierra una sola vez tras dos cambios de idioma (sin escuchadores duplicados)
  const dup = await run(`
    location.hash = '#modelos'; await sleep(250);
    $('[data-lang-set=es]').click(); await waitFor(() => document.documentElement.lang === 'es');
    $('[data-lang-set=en]').click(); await waitFor(() => document.documentElement.lang === 'en');
    const antes = $$('#mx-body tr.row[aria-expanded=true]').length;
    const fila = $$('#mx-body tr.row[aria-expanded=false]')[0]; fila.click(); await sleep(200);
    const despues = $$('#mx-body tr.row[aria-expanded=true]').length;
    const sel = $('#mx-sort'); sel.value = 'eci'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(150);
    return { antes, despues, sort: estado().sort, errs: __errs.length };`);
  check(dup.despues === dup.antes + 1, `${where}: una pulsación en una fila cambió ${dup.despues - dup.antes} fichas (escuchadores duplicados)`);

  // 5 · EN → ES: vuelve al español de siempre y conserva el estado
  const es = await run(`
    $('[data-lang-set=es]').click();
    await waitFor(() => document.documentElement.lang === 'es');
    const e = estado(); e.freshness = $('#freshness')?.textContent.slice(0, 20); return e;`);
  check(es.lang === 'es' && /Observatorio/.test(es.title) && es.ls === 'es' && !/lang=en/.test(es.search), `${where}: no volvió a español (${es.lang} ${es.title} ${es.search})`);
  check(es.w === 'abiertos' && es.q === 'a' && es.cmp.length === 2, `${where}: al volver a ES se perdió el estado`);
  check(es.svgs > 0, `${where}: sin gráficos al volver a español`);
  check(!(await run(`return __errs.length`)), `${where}: errores en la consola: ${await run(`return __errs.join(' · ')`)}`);

  // 6 · Recarga con el idioma recordado: inglés directo, sin parpadeo de la interfaz en español
  await send('Page.navigate', { url: `${base}?i18n=1&lang=en#ai2027` });
  await sleep(300);
  await run(`await new Promise(r => { const t = setInterval(() => { if (document.readyState === 'complete') { clearInterval(t); r(); } }, 50); });`);
  await run(HELP);
  const re = await run(`await waitFor(() => $$('.chart svg').length > 0 || $('#a7-rev li')); return estado();`);
  check(re.lang === 'en' && re.shown.join() === 'ai2027' && /Observatory/.test(re.title), `${where}: la recarga en inglés no dejó la página en inglés (${JSON.stringify(re)})`);
  // Sin ?i18n=1 el selector no existe y el sitio es el de siempre, en español, aunque haya un idioma recordado
  await send('Page.navigate', { url: `${base}?i18n=0` });
  await sleep(300);
  await run(`await new Promise(r => { const t = setInterval(() => { if (document.readyState === 'complete') { clearInterval(t); r(); } }, 50); });`);
  await run(HELP);
  const off = await run(`await waitFor(() => $$('#mx-body tr.row').length > 0); return { lang: document.documentElement.lang, hidden: $('.seg.lang').hidden, vis: getComputedStyle($('.seg.lang')).display };`);
  check(off.lang === 'es' && off.hidden && off.vis === 'none', `${where}: sin la bandera el selector debe estar oculto y el idioma ser español (${JSON.stringify(off)})`);
}

if (fails.length) { console.error(`Prueba de idioma: ${fails.length} fallos\n- ${fails.join('\n- ')}`); done(1); }
console.log('Prueba de idioma correcta: el cambio ES⇄EN conserva vista, filtros, orden, comparación, ficha, desplegables y desplazamiento, a 1300 y 390 px.');
done(0);
