#!/usr/bin/env node
/* Prueba de humo del navegador, sin dependencias: sirve el sitio con Node y abre cada vista y tres direcciones directas
   con Chrome sin ventana (--dump-dom), en escritorio y en móvil. Falla si una vista no se dibuja, si alguna lleva el
   aviso de error (data-render-error) o si una dirección directa no lleva a su sitio.
   Cada dirección se prueba también en inglés (?i18n=1&lang=en&qa=1): lang="en", título inglés y ni un texto de la interfaz
   ni de los datos sin traducir (la página los deja en <script id="qa">).
   Uso: node tests/humo.mjs   (CHROME=/ruta/al/navegador si no está en el PATH como google-chrome o chromium) */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml' };
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

const cat = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const modelId = (cat.models.find(m => m.aa?.intelligence?.v != null) || cat.models[0]).id;
const manual = cat.models.find(m => m.license?.v === 'propietaria' && m.epoch?.how === 'emparejamiento manual')?.id;
const approximate = cat.models.find(m => m.license?.v === 'propietaria' && m.epoch?.how === 'nombre aproximado')?.id;
const VIEWS = ['hoy', 'modelos', 'lanzamientos', 'carrera', 'ai2027'];
// Lo mínimo que tiene que haber dibujado cada vista (están todas en el DOM aunque sólo se vea una).
const DRAWN = { hoy: /id="hoy-kpis"[^>]*>\s*<div class="kpi/, modelos: /<tr class="row/, lanzamientos: /id="ln-list"[^>]*>\s*</, carrera: /id="frente-evaluacion"[\s\S]*?<svg/, ai2027: /id="a7-rev"[^>]*>\s*<li/ };
const CASES = [
  ...VIEWS.map(v => ({ hash: v, view: v })),
  { hash: `modelos/${modelId}`, view: 'modelos', target: new RegExp(`<tr class="row[^"]*flash[^"]*"[^>]*data-id="${modelId.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"|data-id="${modelId.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*class="row[^"]*flash`) },
  { hash: 'carrera/evaluacion', view: 'carrera', target: /id="frente-evaluacion"[^>]*class="[^"]*flash|class="[^"]*flash[^"]*"[^>]*id="frente-evaluacion"/ },
  { hash: 'ai2027/swe85', view: 'ai2027', target: /id="hito-swe85"[^>]*class="[^"]*flash|class="[^"]*flash[^"]*"[^>]*id="hito-swe85"/ },
  ...(manual && approximate ? [
    { hash: `modelos/${manual}`, view: 'modelos', translations: ['proprietary', 'manual match'] },
    { hash: `modelos/${approximate}`, view: 'modelos', translations: ['proprietary', 'approximate name match'] },
    { hash: `modelos/comparar/${manual},${approximate}`, view: 'modelos', translations: ['proprietary', 'manual match', 'approximate name match'], compare: true }
  ] : [])
];

const fails = [];
if (!manual || !approximate) fails.push('faltan modelos de muestra con licencia propietaria y emparejamientos Epoch manual/aproximado');
const unesc = x => x.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
for (const lang of ['es', 'en']) for (const [w, h] of [[1300, 900], [390, 844]]) {
  for (const c of CASES) {
    let dom = '';
    try {
      // Asíncrono: el servidor de esta misma ejecución tiene que poder responder mientras Chrome carga la página.
      const query = lang === 'en' ? '?i18n=1&lang=en&qa=1' : '';
      ({ stdout: dom } = await promisify(execFile)(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`,
        '--virtual-time-budget=20000', '--dump-dom', `${base}${query}#${c.hash}`], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 90000 }));
    } catch (e) { fails.push(`${lang} ${w}px #${c.hash}: Chrome no terminó (${e.message.split('\n')[0]})`); continue; }
    const where = `${lang} ${w}px #${c.hash}`;
    const errs = [...dom.matchAll(/data-render-error="([^"]+)"/g)].map(m => m[1]);
    if (errs.length) fails.push(`${where}: no se han podido dibujar ${errs.join(', ')}`);
    for (const v of VIEWS) if (!DRAWN[v].test(dom)) fails.push(`${where}: la vista ${v} está vacía`);
    const shown = [...dom.matchAll(/<section class="view"[^>]*data-view="([^"]+)"[^>]*>/g)].filter(m => !/\bhidden\b/.test(m[0])).map(m => m[1]);
    if (shown.length !== 1 || shown[0] !== c.view) fails.push(`${where}: se ve ${shown.join(', ') || 'ninguna vista'} en vez de ${c.view}`);
    if (c.target && !c.target.test(dom)) fails.push(`${where}: la dirección directa no lleva a su sitio`);
    if (c.translations && lang === 'en') {
      const id = c.hash.slice('modelos/'.length);
      const at = dom.indexOf(`data-id="${id}"`);
      const start = at < 0 ? -1 : dom.lastIndexOf('<tr', at);
      const part = c.compare
        ? /<div class="compare" id="mx-compare"([^>]*)>([\s\S]*?)<div class="table-wrap">/.exec(dom)?.[2] || ''
        : start < 0 ? '' : dom.slice(start, dom.indexOf('<tr class="row"', start + 1) < 0 ? undefined : dom.indexOf('<tr class="row"', start + 1));
      for (const term of c.translations) if (!part.includes(term)) fails.push(`${where}: falta «${term}» en ${c.compare ? 'la comparación' : 'la ficha'}`);
      if (/\bpropietaria\b|emparejamiento manual|nombre aproximado/.test(part)) fails.push(`${where}: quedan valores españoles en ${c.compare ? 'la comparación' : 'la ficha'}`);
    }
    if (/data-state="empty"/.test(dom)) fails.push(`${where}: no se han cargado los datos`);
    if (!new RegExp(`<html[^>]*\\blang="${lang === 'en' ? 'en-GB|en' : 'es'}"`).test(dom)) fails.push(`${where}: el atributo lang del documento no es ${lang}`);
    if (lang === 'en') {
      const q = /<script id="qa" type="application\/json">([\s\S]*?)<\/script>/.exec(dom);
      if (!q) { fails.push(`${where}: sin informe de traducción (?qa=1)`); continue; }
      const { ui, data } = JSON.parse(unesc(q[1]));
      if (ui.length) fails.push(`${where}: ${ui.length} textos de la interfaz sin traducir, p. ej. «${ui[0].slice(0, 80)}»`);
      if (data.length) fails.push(`${where}: ${data.length} textos de los datos sin traducir, p. ej. «${data[0].slice(0, 80)}»`);
      if (/<title[^>]*>[^<]*Observatorio/.test(dom)) fails.push(`${where}: título en español`);
    }
  }
}
server.close();
if (fails.length) { console.error(`Prueba de humo: ${fails.length} fallos\n- ${fails.join('\n- ')}`); process.exit(1); }
console.log(`Prueba de humo correcta: ${CASES.length} direcciones en español e inglés a 1300 y 390 px, cinco vistas dibujadas en cada una.`);
