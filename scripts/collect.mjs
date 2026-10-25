#!/usr/bin/env node
/* MOLOCH.SH · recolector de datos del observatorio.

   Lee fuentes públicas y escribe JSON estático en data/:
     data/catalog.json        catálogo actual: cada cifra lleva fuente, URL, fecha del dato y fecha de consulta
     data/changes.json        cambios de la ventana de «Hoy» (scripts/cambios.mjs: modelos, líderes, indicadores, valoraciones, uso)
     data/events-log.json     registro acumulado de esos cambios
     data/parte.xml           fuente RSS del parte diario (scripts/parte.mjs)
     data/history/<fecha>.json instantánea compacta para series históricas
     data/indicadores.json     cifras de «La carrera» y «AI 2027» (scripts/indicadores.mjs)

   Fuentes:
     OpenRouter  /api/v1/models y /endpoints   (sin clave)  precios, contexto, proveedores, velocidad por proveedor
     Hugging Face /api/models/<repo>           (sin clave)  existencia de pesos, licencia, fecha del repositorio
     Epoch AI     eci_scores.csv, benchmarks.csv y benchmark_data.zip (CC BY 4.0) índice de capacidades ECI, SWE-bench Verified, apertura, dificultad de las evaluaciones
     Artificial Analysis /api/v2/language/models/free (clave AA_API_KEY) índices de inteligencia, programación y agentes, velocidad
     OpenRouter   /api/v1/datasets/rankings-daily (clave OPENROUTER_API_KEY, CC BY 4.0) tokens diarios de los 50 modelos más usados (rankings de 7 y 30 días)
                  Se publica con su permiso por escrito, registrado en data/curated/permisos.json; sin él no se usa.
     Epoch AI y METR, para los indicadores: véase scripts/indicadores.mjs.

   Reglas:
     - Ninguna cifra se inventa ni se rellena. Si una fuente no la da, el campo queda null («sin datos»).
     - Si una fuente falla, se conserva el último valor válido con su fecha de consulta original (stale: true).
     - Si falla OpenRouter, que es la base del catálogo, no se escribe nada.

   Uso: node scripts/collect.mjs            (red real)
        FIXTURES=dir node scripts/collect.mjs (respuestas grabadas, para pruebas) */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { collectIndicators } from './indicadores.mjs';
import { aaRace, aaCoverage } from '../js/fmt.js';
import { detectChanges, mergeLog, snapshotExtras, indSnapshot, vigilados } from './cambios.mjs';
import { enrich, parte, rss } from './parte.mjs';
import { AVISOS, failedStatus } from './textos.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const NOW = new Date();
const NOW_ISO = NOW.toISOString().replace(/\.\d{3}Z$/, 'Z');
const TODAY = NOW_ISO.slice(0, 10);
const WINDOW_DAYS = Number(process.env.WINDOW_DAYS || 540);   // antigüedad máxima en OpenRouter para entrar en el catálogo
const NEW_DAYS = 14;                                           // altas recientes de autores no seguidos, para el registro
const HOY_DAYS = 7;                                            // ventana de «Hoy»: modelos nuevos y acontecimientos de la última semana
const FIXTURES = process.env.FIXTURES;
const AA_KEY = process.env.AA_API_KEY || '';
const OR_KEY = process.env.OPENROUTER_API_KEY || '';
const USO_DAYS = 7;                                            // ranking de uso: últimos siete días UTC completos
const USO_MES = 30;                                            // y últimos treinta
// AA (plan gratuito) limita las consultas diarias: si la última consulta buena es reciente, se reutiliza en vez de repetirla.
// En main basta con 6 h (la recogida diaria siempre consulta); en las ramas de prueba, 20 h, porque cada push lanza una recogida.
const AA_REUSE_H = process.env.GITHUB_REF === 'refs/heads/main' ? 6 : 20;
const AA_PAGES = 10;                                           // tope de páginas de 200 modelos; cada una cuenta para el límite diario de AA

const SOURCES = {
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/models', api: 'https://openrouter.ai/api/v1/models' },
  hf: { name: 'Hugging Face', url: 'https://huggingface.co/models', api: 'https://huggingface.co/api/models' },
  epoch: { name: 'Epoch AI', url: 'https://epoch.ai/benchmarks/eci', api: 'https://epoch.ai/data/eci_scores.csv', bench: 'https://epoch.ai/data/benchmarks.csv', license: 'CC BY 4.0', cite: "Epoch AI, 'Capabilities & benchmarking', epoch.ai" },
  aa: { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/leaderboards/models', home: 'https://artificialanalysis.ai', api: 'https://artificialanalysis.ai/api/v2/language/models/free' },
  uso: { name: 'OpenRouter · uso', url: 'https://openrouter.ai/rankings', home: 'https://openrouter.ai/rankings', api: 'https://openrouter.ai/api/v1/datasets/rankings-daily', license: 'CC BY 4.0', cite: 'Source: OpenRouter (openrouter.ai/rankings), as of {as_of}' },
  metr: { name: 'METR', url: 'https://metr.org/time-horizons', api: 'https://metr.org/assets/benchmark_results_1_1.yaml', license: '© METR; sólo se cita el último punto' },
  curated: { name: 'Curado manualmente', url: null }
};

const log = (...a) => console.log('[collect]', ...a);

async function readJSON(p, fallback = null) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}

const getJSON = (url, headers) => getRaw(url, headers, 'json');
const getText = (url, headers) => getRaw(url, headers, 'text');
const getBuf = (url, headers) => getRaw(url, headers, 'buf');

async function getRaw(url, headers = {}, as = 'json') {
  if (FIXTURES) {
    const key = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 180) + ({ json: '.json', text: '.txt', buf: '.bin' })[as];
    const p = path.join(FIXTURES, key);
    if (!existsSync(p)) throw new Error(`fixture ausente: ${key}`);
    if (as === 'buf') return readFile(p);
    const t = await readFile(p, 'utf8');
    return as === 'text' ? t : JSON.parse(t);
  }
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'moloch-sh-observatorio/1.0 (+https://github.com/rolandojf-gif/moloch-sh)', ...headers } });
      if (res.status === 404) { const e = new Error(`404 ${url}`); e.status = 404; throw e; }
      if (!res.ok) { const e = new Error(`${res.status} ${url}`); e.status = res.status; throw e; }
      return as === 'text' ? await res.text() : as === 'buf' ? Buffer.from(await res.arrayBuffer()) : await res.json();
    } catch (e) {
      lastErr = e;
      if ([401, 403, 404, 410].includes(e.status)) throw e;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

/* Un «hecho»: valor + procedencia. asOf = fecha a la que corresponde el dato según la fuente;
   cuando la fuente sólo expone el valor vigente, asOf es la fecha de consulta. */
const fact = (v, src, url, asOf = TODAY, extra = {}) => ({ v: v ?? null, src, url: url ?? null, asOf, got: NOW_ISO, ...extra });
const perMillion = s => {
  if (s === undefined || s === null || s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;     // OpenRouter usa -1 para «variable»
  return Math.round(n * 1e6 * 10000) / 10000;
};
const pctl = x => (x && typeof x === 'object') ? (x.p50 ?? null) : (Number.isFinite(x) ? x : null);

function baseId(id) {
  return id.replace(/:[a-z0-9-]+$/, '');          // :free, :batch, :thinking… son variantes de servicio, no modelos
}

const norm = s => String(s || '').toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/^[^:]+:\s*/, '')                    // «Anthropic: Claude …» → «Claude …»
  .replace(/[^a-z0-9.]+/g, ' ')
  .replace(/\b(preview|instruct|chat|latest|exp|experimental)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

/* ── OpenRouter ─────────────────────────────────────────────────────────── */
/* Lo que no es un modelo de lenguaje de uso general: generadores de imagen o audio (por la salida que declara
   OpenRouter) y, por patrón curado, enrutadores y clasificadores de seguridad. */
function kindOf(m, id, excl) {
  const outs = m.architecture?.output_modalities || [];
  if (outs.includes('image')) return { tipo: 'imagen', motivo: 'genera imágenes' };
  if (outs.includes('audio')) return { tipo: 'audio', motivo: 'genera audio' };
  for (const r of excl.reglas || []) if (new RegExp(r.patron, 'i').test(id)) return { tipo: r.tipo, motivo: r.motivo };
  return null;
}

async function loadOpenRouter(labs, excl = { reglas: [] }) {
  const res = await getJSON(SOURCES.openrouter.api);
  const all = res.data || [];
  const cutoff = NOW.getTime() / 1000 - WINDOW_DAYS * 86400;
  const recent = NOW.getTime() / 1000 - NEW_DAYS * 86400;
  const ids = new Set(all.map(m => m.id));
  const seen = new Set();
  const out = [], untracked = [], orphan = [], excluded = [];
  for (const m of all) {
    const id = baseId(m.id);
    const isRecent = (m.created || 0) >= recent;
    const author = id.split('/')[0];
    if (!labs[author]) { if (isRecent) untracked.push(m.id); continue; }
    // Sólo la variante base; si OpenRouter sólo ofrece una variante (p. ej. «:free»), ésa representa al modelo con el id base.
    if (id !== m.id && ids.has(id)) continue;
    if ((m.created || 0) < cutoff) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const kind = kindOf(m, id, excl);
    if (kind) { excluded.push({ id, name: (m.name || id).replace(/^[^:]+:\s*/, ''), ...kind }); continue; }
    if (id !== m.id) { orphan.push(m.id); out.push({ ...m, id, orVariant: m.id }); }
    else out.push(m);
  }
  log(`OpenRouter: ${all.length} modelos, ${out.length} en el catálogo`);
  // Para responder a «¿por qué no aparece X?»: altas recientes que el catálogo descarta.
  if (untracked.length) log(`OpenRouter: altas de ${NEW_DAYS} días de autores no seguidos (curated/labs.json): ${untracked.join(', ')}`);
  if (orphan.length) log(`OpenRouter: modelos que sólo existen como variante (entran con el id base): ${orphan.join(', ')}`);
  if (excluded.length) log(`OpenRouter: fuera del catálogo por no ser modelos de lenguaje de uso general (${excluded.length}): ${excluded.map(e => `${e.id} (${e.tipo})`).join(', ')}`);
  out.excluded = excluded;
  // Todo lo que OpenRouter sigue listando, aunque quede fuera de la ventana: salir de la ventana no es una retirada.
  out.listed = new Set(all.map(m => baseId(m.id)));
  // Nombre por id y por «canonical_slug» (el permaslug del ranking de uso), para todo lo listado.
  out.names = new Map();
  for (const m of all) {
    const e = { id: baseId(m.id), name: (m.name || m.id).replace(/^[^:]+:\s*/, '').replace(/\s*\(free\)$/i, '') };
    if (!out.names.has(e.id)) out.names.set(e.id, e);
    if (m.canonical_slug && !out.names.has(m.canonical_slug)) out.names.set(m.canonical_slug, e);
  }
  return out;
}

async function loadEndpoints(id) {
  try {
    const res = await getJSON(`https://openrouter.ai/api/v1/models/${id}/endpoints`);
    const eps = (res.data && res.data.endpoints) || [];
    return eps;
  } catch (e) {
    log(`endpoints ${id}: ${e.message}`);
    return null;
  }
}

/* ── Hugging Face ───────────────────────────────────────────────────────── */
async function loadHF(repo) {
  try {
    const r = await getJSON(`${SOURCES.hf.api}/${repo}`);
    const tagLic = (r.tags || []).find(t => t.startsWith('license:'));
    return {
      ok: true,
      license: (r.cardData && r.cardData.license) || (tagLic ? tagLic.slice(8) : null),
      licenseName: (r.cardData && r.cardData.license_name) || null,
      createdAt: r.createdAt ? r.createdAt.slice(0, 10) : null,
      gated: r.gated || false,
      isPrivate: !!r.private
    };
  } catch (e) {
    return { ok: false, notFound: e.status === 404, err: e.message };
  }
}

/* Repositorios públicos de una organización de Hugging Face (los más recientes primero). Una consulta por organización. */
const HF_ORGS = new Map();
function loadHFOrg(org) {
  if (!HF_ORGS.has(org)) {
    HF_ORGS.set(org, getJSON(`${SOURCES.hf.api}?author=${encodeURIComponent(org)}&sort=createdAt&direction=-1&limit=1000`)
      .then(rows => (rows || []).filter(r => r.id && !r.private).map(r => r.id))
      .catch(e => { log(`Hugging Face: no se pudo listar ${org}: ${e.message}`); return []; }));
  }
  return HF_ORGS.get(org);
}
/* Busca en las organizaciones del laboratorio un repositorio con el mismo nombre que el modelo (sin mayúsculas ni signos),
   admitiendo sólo sufijos que no cambian el modelo (instruct, it, chat, hf, fp8, bf16). */
const HF_SUFFIX = /^(instruct|it|chat|hf|fp8|bf16)?$/;
async function findHFRepo(m, orgs) {
  const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const keys = [...new Set([norm(m.id.split('/')[1]?.replace(/:.*$/, '')), norm(m.name)].filter(Boolean))];
  for (const org of orgs) {
    const hit = (await loadHFOrg(org)).find(id => { const r = norm(id.split('/')[1]); return keys.some(k => r.startsWith(k) && HF_SUFFIX.test(r.slice(k.length))); });
    if (hit) return hit;
  }
  return null;
}

/* ── Epoch AI ───────────────────────────────────────────────────────────── */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const key = s => norm(s).replace(/\s+/g, '');
const EPOCH_AMBIGUOUS = [];   // sólo para el registro
const ANNOUNCED = [];         // pesos anunciados según la descripción de OpenRouter, para el registro

/* Emparejamiento con Epoch: primero el nombre completo (con lo que va entre paréntesis);
   después una clave laxa, sólo si no la comparten dos filas de Epoch. Así «DeepSeek V3.2 Exp»
   no hereda la nota de «DeepSeek-V3.2», ni «Gemini 2.5 Flash» la de una de sus tres versiones fechadas. */
const fullKey = s => String(s || '').toLowerCase().replace(/^[^:]+:\s*/, '').replace(/[^a-z0-9.]+/g, '');
const looseKey = s => String(s || '').toLowerCase().replace(/^[^:]+:\s*/, '').replace(/\(.*?\)/g, ' ')
  .replace(/[^a-z0-9.]+/g, ' ').replace(/\b(preview|instruct|it|latest)\b/g, ' ').replace(/\s+/g, '');
function nameIndex(rows, namesOf, better) {
  const full = new Map(), loose = new Map();
  for (const r of rows) for (const n of new Set(namesOf(r).filter(Boolean))) {
    const f = fullKey(n), l = looseKey(n);
    if (f && (!full.has(f) || better(r, full.get(f)))) full.set(f, r);
    if (l) { const c = loose.get(l) || []; if (!c.includes(r)) c.push(r); loose.set(l, c); }
  }
  return {
    exact: n => full.get(fullKey(n)) || null,
    find(n) {
      const f = full.get(fullKey(n));
      if (f) return { row: f, how: 'nombre' };
      const c = loose.get(looseKey(n)) || [];
      return c.length === 1 ? { row: c[0], how: 'nombre aproximado' } : { row: null, ambiguous: c.length > 1 ? c : null };
    }
  };
}
const num = s => { const n = Number(s); return s !== '' && Number.isFinite(n) ? n : null; };

/* ECI: un índice por modelo con intervalo; SWE-bench Verified: ejecuciones propias de Epoch (mejor variante por modelo). */
async function loadEpoch() {
  const out = { rows: [] };
  const eci = parseCSV(await getText(SOURCES.epoch.api));
  for (const r of eci) {
    const v = num(r.eci);
    if (v === null) continue;
    out.rows.push({
      name: r['Display name'] || r.Model, model: r.Model || null, eci: v, lo: num(r.eci_ci_low), hi: num(r.eci_ci_high), date: r.date || null,
      org: r.Organization || null, country: r['Country (of organization)'] || null,
      access: r['Model accessibility'] || null, group: r['Accessibility group'] || null
    });
  }
  out.eci = nameIndex(out.rows, r => [r.model, r.name], (a, b) => a.eci > b.eci);
  out.swe = nameIndex([], () => []);
  out.bench = [];
  let nSwe = 0;
  try {
    const best = new Map();
    out.bench = parseCSV(await getText(SOURCES.epoch.bench));
    for (const r of out.bench) {
      if (!/^swe-bench verified$/i.test(r.task || '') || (r.Status && r.Status !== 'Success')) continue;
      const v = num(r['Best score (across scorers)']);
      if (v === null || !r.Model) continue;
      const prev = best.get(r.Model);
      if (!prev || v > prev.v) best.set(r.Model, { model: r.Model, v, version: r.id_model_version || r.Model, date: (r.started_at || '').slice(0, 10) || null });
    }
    out.swe = nameIndex([...best.values()], r => [r.model], (a, b) => a.v > b.v);
    nSwe = best.size;
  } catch (e) { log(`Epoch benchmarks falló: ${e.message}`); out.sweFailed = true; }
  log(`Epoch: ${out.rows.length} modelos con ECI, ${nSwe} con SWE-bench Verified`);
  // Base de modelos de Epoch: su «Publication date» (publicación, anuncio o lanzamiento) sirve de anuncio cuando no hay uno curado.
  out.pub = nameIndex([], () => []);
  for (const u of EPOCH_MODELS) {
    try {
      const rows = parseCSV(await getText(u)).map(r => ({ name: r.Model, date: String(r['Publication date'] || '').slice(0, 10) }))
        .filter(r => r.name && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
      out.pub = nameIndex(rows, r => [r.name], (a, b) => a.date < b.date);
      log(`Epoch, base de modelos: ${u} · ${rows.length} con fecha de publicación`);
      break;
    } catch (e) { log(`Epoch, base de modelos: ${u} falló: ${e.message}`); }
  }
  return out;
}
const EPOCH_MODELS = ['https://epoch.ai/data/all_ai_models.csv', 'https://epoch.ai/data/notable_ai_models.csv', 'https://epoch.ai/data/large_scale_ai_models.csv'];

/* Frontera por fecha según Epoch: máximo acumulado del ECI en cada grupo de apertura. */
function epochFrontier(rows) {
  const pts = [], models = [];
  const best = { open: null, closed: null };
  const sorted = rows.filter(r => r.date && (r.group === 'Open weights' || r.group === 'Closed weights')).sort((a, b) => a.date.localeCompare(b.date) || b.eci - a.eci);
  for (const r of sorted) {
    const g = r.group === 'Open weights' ? 'open' : 'closed';
    const rec = !best[g] || r.eci > best[g].v;
    if (rec) {
      best[g] = { v: r.eci, name: r.name };
      pts.push({ date: r.date, open: best.open, closed: best.closed });
    }
    // Todos los modelos puntuados, para dibujarlos junto a la frontera como hace Epoch.
    models.push({ d: r.date, v: r.eci, g: g[0], n: r.name, org: (r.org || '').split(',')[0].trim() || null, lo: r.lo, hi: r.hi, rec });
  }
  return { points: pts, models };
}

/* ── Artificial Analysis ────────────────────────────────────────────────── */
async function loadAA(permiso) {
  if (!AA_KEY && !FIXTURES) { log('AA_API_KEY ausente'); return null; }
  if (permiso?.estado !== 'permitido') { log('Artificial Analysis sin permiso en data/curated/permisos.json: no se publican sus datos'); return null; }
  try {
    const rows = [];
    let version = null;
    for (let page = 1; page <= AA_PAGES; page++) {
      const res = await getJSON(`${SOURCES.aa.api}?page=${page}`, { 'x-api-key': AA_KEY });
      if (version === null && res.intelligence_index_version != null) version = String(res.intelligence_index_version);
      rows.push(...(res.data || []).map(r => ({ ...r, ...(r.performance || {}) })));
      if (!res.pagination?.has_more) break;
    }
    log(`Artificial Analysis: ${rows.length} modelos, índice de inteligencia v${version ?? '?'}`);
    return { rows, version };
  } catch (e) {
    log(`Artificial Analysis falló: ${e.message}`);
    return undefined;   // undefined = fallo (se conservan valores previos); null = sin clave o sin permiso
  }
}

/* Ranking de uso de OpenRouter: tokens (entrada + salida) por modelo en los últimos USO_DAYS días UTC completos,
   sumando las filas diarias del conjunto de datos «rankings-daily» (50 modelos por día más una fila «other»).
   Devuelve null sin clave y undefined si la consulta falla (se conserva el ranking anterior). */
async function loadUso(names) {
  if (!OR_KEY && !FIXTURES) { log('OPENROUTER_API_KEY ausente: sin ranking de uso'); return null; }
  const day = n => new Date(NOW.getTime() - n * 86400e3).toISOString().slice(0, 10);
  const to = day(1);
  try {
    // Una sola consulta de USO_MES días; la semana sale de los últimos USO_DAYS.
    const res = await getJSON(`${SOURCES.uso.api}?start_date=${day(USO_MES)}&end_date=${to}`, { authorization: `Bearer ${OR_KEY}` });
    const rows = Array.isArray(res) ? res : res.data || res.rows || [];
    if (rows[0]) log(`ranking de uso: ${rows.length} filas; campos ${Object.keys(rows[0]).join(', ')}`);
    const slugOf = r => r.model_permaslug || r.permaslug || r.model || r.model_slug || null;
    const tokOf = r => { const t = Number(r.total_tokens ?? r.tokens ?? ((Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0))); return Number.isFinite(t) ? t : 0; };
    // Permaslug = id de OpenRouter con sufijo de fecha o versión; se empareja con el id más largo que sea prefijo.
    const ids = [...names.keys()].sort((a, b) => b.length - a.length);
    const who = slug => names.get(slug) || names.get(ids.find(id => slug.startsWith(id + '-'))) || null;
    const window = n => {
      const from = day(n);
      const per = new Map(); let total = 0; const days = new Set();
      for (const r of rows) {
        const d = String(r.date || '').slice(0, 10);
        if (d && (d < from || d > to)) continue;
        const t = tokOf(r); total += t; if (d) days.add(d);
        const slug = slugOf(r);
        if (!slug || /^other$/i.test(slug)) continue;
        per.set(slug, (per.get(slug) || 0) + t);
      }
      if (!per.size) throw new Error('respuesta sin filas de modelos');
      const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([slug, t], i) => ({ rank: i + 1, slug, id: who(slug)?.id || null, name: who(slug)?.name || null, tokens: t, share: total ? Math.round(t / total * 1000) / 10 : null }));
      log(`ranking de uso ${from}…${to}: ${top.map(r => `${r.rank}. ${r.slug} ${(r.tokens / 1e9).toFixed(0)} mil M`).join(' | ')}`);
      return { from, to, asOf: res.as_of || res.asOf || [...days].sort().pop() || to, days: days.size || n, total, top, got: NOW_ISO, src: 'uso', url: SOURCES.uso.url };
    };
    return { semana: window(USO_DAYS), mes: window(USO_MES) };
  } catch (e) {
    log(`ranking de uso falló: ${e.message}`);
    return undefined;
  }
}

/* AA publica una fila por configuración de razonamiento («GPT-6 Sol (High)», «(Max, Default Fallback)»…). Se toma la de
   mayor índice entre ésas; las ediciones especiales («(Daybreak Blue, max)») sólo cuentan si no hay otra. */
const AA_SETTING = /^(non-reasoning|reasoning|minimal|low|medium|high|xhigh|max)$/;
const aaSetting = r => ((/\(([^)]*)\)\s*$/.exec(r.name || '') || [])[1] || '').split(',')[0].toLowerCase().trim();

function matchAA(orModel, lab, aaRows, overrides, creatorIds) {
  if (!aaRows || !lab.aa_creator) return null;
  if (Object.prototype.hasOwnProperty.call(overrides, orModel.id)) {
    const slug = overrides[orModel.id];
    if (!slug) return null;
    const row = aaRows.find(r => r.slug === slug);
    return row ? { row, how: 'manual' } : null;
  }
  const target = norm(orModel.name);
  const cid = creatorIds[lab.aa_creator];
  const cands = aaRows.filter(r => r.model_creator && (r.model_creator.slug ? r.model_creator.slug === lab.aa_creator : r.model_creator.id === cid));
  const exact = cands.filter(r => norm(r.name) === target);
  const variants = exact.length ? exact : cands.filter(r => {
    const n = norm(r.name);
    return n.startsWith(target + ' ') && !/\d/.test(n.slice(target.length));   // «gpt 5» no casa con «gpt 5.1»
  });
  if (!variants.length) return null;
  const plain = variants.filter(r => !aaSetting(r) || AA_SETTING.test(aaSetting(r)));
  const pool = plain.length ? plain : variants;
  const ii = r => (r.evaluations && r.evaluations.artificial_analysis_intelligence_index) ?? -1;
  const best = pool.slice().sort((a, b) => ii(b) - ii(a))[0];
  return { row: best, how: pool.length > 1 ? `configuración de mayor índice entre ${pool.length}` : exact.length ? 'nombre exacto' : 'variante', variants: pool.length };
}

/* ── Construcción del catálogo ──────────────────────────────────────────── */
function speedFromEndpoints(endpoints) {
  if (!endpoints) return null;
  const rows = endpoints
    .filter(e => e.status === undefined || e.status === 0 || e.status === 'online' || e.status === null)
    .map(e => ({
      provider: e.provider_name || e.name || null,
      quant: e.quantization || null,
      in: perMillion(e.pricing && e.pricing.prompt),
      out: perMillion(e.pricing && e.pricing.completion),
      cacheRead: perMillion(e.pricing && e.pricing.input_cache_read),
      ctx: e.context_length || null,
      tps: pctl(e.throughput_last_30m),
      ttft: (() => { const v = pctl(e.latency_last_30m); return v === null ? null : (v > 50 ? v / 1000 : v); })(), // ms → s
      uptime: Number.isFinite(e.uptime_last_30m) ? e.uptime_last_30m : null
    }));
  return rows;
}

function labTiers(eps, own) {
  const seen = new Map();
  for (const e of eps || []) if (own.has(e.provider) && e.in !== null && e.out !== null) seen.set(`${e.in}|${e.out}`, [e.in, e.out]);
  return [...seen.values()].sort((a, b) => (3 * a[0] + a[1]) - (3 * b[0] + b[1]));
}

/* Pesos anunciados: la descripción del modelo en OpenRouter lo presenta como de pesos abiertos (no consta quién la redacta:
   no se atribuye al laboratorio), pero aún no hay
   repositorio público. Sólo cuenta si la frase habla del propio modelo (al principio, o tras «is», «are», «'s»), no si lo
   compara con otros («outperforms open-weight models»). Devuelve el fragmento citado o null. */
const OPEN_DESC = /\bopen[- ]?(?:weights?|source[d]?)\b/i;
const NOT_SELF = /\b(?:than|outperform\w*|rival\w*|beat\w*|compar\w*|versus|vs\.?|against|other|leading|top|best|surpass\w*|like|among|for)\b[^.]{0,60}$/i;
const NOT_MODEL = /^\s*(?:tool\w*|framework\w*|librar\w*|communit\w*|ecosystem\w*|project\w*|software|stack\w*|sdk\w*|harness\w*|code(?:base)?|alternatives?|models|systems|ones|offerings|rivals|competitors|peers|developers)\b/i;
function openWeightDesc(desc) {
  const sentences = String(desc || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).slice(0, 2);
  for (const t of sentences) {
    const mm = OPEN_DESC.exec(t);
    if (!mm) continue;
    const before = t.slice(0, mm.index);
    if (NOT_SELF.test(before) || NOT_MODEL.test(t.slice(mm.index + mm[0].length))) continue;
    if (!(before.length < 24 || /\b(?:is|are|its)\b|'s\b/i.test(before))) continue;
    const a = Math.max(0, mm.index - 70), b = Math.min(t.length, mm.index + mm[0].length + 40);
    return `${a ? '…' : ''}${t.slice(a, b).trim()}${b < t.length ? '…' : ''}`;
  }
  return null;
}

function buildModel(m, lab, endpoints, hf, aaMatch, prev, ep, epochOv, pesosOv) {
  const orUrl = `https://openrouter.ai/${m.orVariant || m.id}`;
  const createdISO = m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null;
  const author = m.id.split('/')[0];
  const hfId = m.hugging_face_id || m._hfOverride || m._hfFound || null;

  // Pesos: abiertos sólo si hay repositorio público en Hugging Face enlazado por OpenRouter y la consulta lo confirma.
  let weights, license;
  if (hfId && hf && hf.ok && !hf.isPrivate) {
    const hfUrl = `https://huggingface.co/${hfId}`;
    const notes = [m._hfFound ? 'encontrado en la organización del laboratorio en Hugging Face; OpenRouter no lo enlaza' : null, hf.gated ? 'descarga con solicitud de acceso' : null].filter(Boolean);
    weights = fact('abiertos', 'hf', hfUrl, hf.createdAt || TODAY, notes.length ? { note: notes.join('; ') } : {});
    license = fact(hf.license ? (hf.license === 'other' && hf.licenseName ? hf.licenseName : hf.license) : null, 'hf', hfUrl, TODAY);
  } else if (hfId && hf && !hf.ok && !hf.notFound && prev && prev.weights) {
    weights = { ...prev.weights, stale: true };
    license = prev.license ? { ...prev.license, stale: true } : fact(null, 'hf', null);
  } else if (!hfId || ((m._hfOverride || m._hfFound) && hf && hf.notFound)) {
    weights = fact('cerrados', 'openrouter', orUrl, TODAY, { inferred: true, note: 'inferido: OpenRouter no enlaza pesos públicos y no hay un repositorio con su nombre en la organización del laboratorio en Hugging Face; puede corregirse en data/curated/overrides.json' });
    license = fact('propietaria', 'openrouter', orUrl, TODAY, { inferred: true, note: 'inferido: sin pesos enlazados' });
  } else {
    weights = fact(null, 'hf', `https://huggingface.co/${hfId}`, TODAY, { note: 'el repositorio enlazado no responde' });
    license = fact(null, 'hf', null);
  }
  // Epoch clasifica la apertura de cada modelo; sustituye a la inferencia, nunca a una comprobación en Hugging Face.
  let eRow = null, eHow = null;
  if (ep && ep !== 'keep' && !lab.stealth) {
    if (epochOv && Object.prototype.hasOwnProperty.call(epochOv, m.id)) {
      eRow = epochOv[m.id] ? ep.eci.exact(epochOv[m.id]) : null;
      eHow = 'emparejamiento manual';
      if (epochOv[m.id] && !eRow) log(`override Epoch sin fila: ${m.id} → ${epochOv[m.id]}`);
    } else {
      const hit = ep.eci.find(m.name);
      eRow = hit.row; eHow = hit.how;
      if (hit.ambiguous) EPOCH_AMBIGUOUS.push(`${m.id} → ${hit.ambiguous.map(r => r.name).join(' / ')}`);
    }
  }
  if (eRow && weights.inferred && (eRow.group === 'Open weights' || eRow.group === 'Closed weights')) {
    const open = eRow.group === 'Open weights';
    weights = fact(open ? 'abiertos' : 'cerrados', 'epoch', SOURCES.epoch.url, TODAY, { note: `clasificación de Epoch: ${eRow.access}` });
    license = open ? fact(null, 'epoch', SOURCES.epoch.url, TODAY, { note: `Epoch: ${eRow.access}; OpenRouter no enlaza el repositorio` }) : fact('propietaria', 'epoch', SOURCES.epoch.url, TODAY, { note: `Epoch: ${eRow.access}` });
  }
  // Sin repositorio ni clasificación de Epoch: si su descripción de OpenRouter lo presenta como de pesos abiertos, «abiertos» anunciados.
  // data/curated/overrides.json («pesos») puede impedirlo (null) cuando la frase se lee mal.
  const quote = weights.inferred && !(pesosOv && Object.prototype.hasOwnProperty.call(pesosOv, m.id) && pesosOv[m.id] === null) ? openWeightDesc(m.description) : null;
  if (quote) {
    weights = fact('abiertos', 'openrouter', orUrl, TODAY, { announced: true, quote, note: `pesos anunciados: la descripción del modelo en OpenRouter lo presenta como de pesos abiertos («${quote}»), pero aún no hay repositorio público en Hugging Face, así que todavía no se pueden descargar` });
    license = fact(null, 'openrouter', orUrl, TODAY, { note: 'sin licencia publicada: los pesos aún no se pueden descargar' });
    ANNOUNCED.push(`${m.id} «${quote}»`);
  }
  if (lab.stealth) {
    weights = fact(null, 'openrouter', orUrl, TODAY, { note: 'modelo anónimo' });
    license = fact(null, 'openrouter', orUrl, TODAY);
  }

  const p = m.pricing || {};
  const params = m.supported_parameters || [];
  const fresh = speedFromEndpoints(endpoints);
  // Precio: el del propio laboratorio en OpenRouter; si no sirve el modelo, el del proveedor más barato (mezcla 3:1), nombrado.
  // El precio por modelo de OpenRouter es el de un proveedor de referencia que cambia de un día a otro: sólo se usa sin proveedores.
  const own = new Set(lab.or_provider || []);
  const priced = (fresh || []).filter(e => e.in !== null && e.out !== null);
  const cheapest = rows => rows.slice().sort((a, b) => (3 * a.in + a.out) - (3 * b.in + b.out))[0] || null;
  const labEp = cheapest(priced.filter(e => own.has(e.provider)));
  // Todas las tarifas del laboratorio (entrada, salida): distinguen una subida de precio de la retirada de su tarifa más barata.
  const tiers = labTiers(fresh, own);
  const chosen = labEp || cheapest(priced);
  let price;
  if (chosen) {
    const quant = chosen.quant && chosen.quant !== 'unknown' ? chosen.quant : null;
    const note = labEp ? `precio del propio laboratorio (${chosen.provider}) en OpenRouter` : `el laboratorio no lo sirve en OpenRouter: proveedor más barato, ${chosen.provider}${quant ? `, con cuantización ${quant}` : ''}`;
    const u = `${orUrl}/providers`;
    price = {
      basis: labEp ? 'laboratorio' : 'proveedor', provider: chosen.provider, quant, ...(labEp ? { tiers } : {}),
      in: fact(chosen.in, 'openrouter', u, TODAY, { note }),
      out: fact(chosen.out, 'openrouter', u, TODAY, { note }),
      cacheRead: fact(chosen.cacheRead ?? null, 'openrouter', u, TODAY, { note }),
      cacheWrite: fact(null, 'openrouter', u)
    };
  } else {
    const note = 'precio de referencia de OpenRouter; no se pudieron leer sus proveedores';
    price = {
      basis: 'referencia', provider: null,
      in: fact(perMillion(p.prompt), 'openrouter', orUrl, TODAY, { note }),
      out: fact(perMillion(p.completion), 'openrouter', orUrl, TODAY, { note }),
      cacheRead: fact(perMillion(p.input_cache_read), 'openrouter', orUrl, TODAY, { note }),
      cacheWrite: fact(perMillion(p.input_cache_write), 'openrouter', orUrl, TODAY, { note })
    };
  }

  const eps = fresh ?? (prev && prev.endpoints ? prev.endpoints.map(e => ({ ...e, stale: true })) : null);
  const epsMeta = endpoints ? { src: 'openrouter', url: orUrl + '/providers', asOf: TODAY, got: NOW_ISO } : (prev && prev.endpointsMeta ? { ...prev.endpointsMeta, stale: true } : null);

  let aa = null;
  if (aaMatch === 'keep') {
    aa = prev && prev.aa ? { ...prev.aa, stale: true } : null;
    if (aa) for (const k of Object.keys(aa)) if (aa[k] && typeof aa[k] === 'object' && 'v' in aa[k]) aa[k] = { ...aa[k], stale: true };
  }
  else if (aaMatch) {
    const r = aaMatch.row;
    const ev = r.evaluations || {};
    const aaUrl = `https://artificialanalysis.ai/models/${r.slug}`;
    const pr = r.pricing || {};
    const nowNote = 'valor vigente en Artificial Analysis en la fecha de consulta; AA no publica la fecha de evaluación';
    const blendAA = Number.isFinite(pr.price_1m_input_tokens) && Number.isFinite(pr.price_1m_output_tokens) ? Math.round((3 * pr.price_1m_input_tokens + pr.price_1m_output_tokens) / 4 * 10000) / 10000 : null;
    aa = {
      slug: r.slug, name: r.name, how: aaMatch.how, url: aaUrl, version: aaMatch.version ?? null,
      intelligence: fact(ev.artificial_analysis_intelligence_index ?? null, 'aa', aaUrl, TODAY, { note: `Artificial Analysis Intelligence Index${aaMatch.version ? ` v${aaMatch.version}` : ''}, configuración «${r.name}»; ${nowNote}` }),
      coding: fact(ev.artificial_analysis_coding_index ?? null, 'aa', aaUrl, TODAY, { note: `Artificial Analysis Coding Index; ${nowNote}` }),
      agentic: fact(ev.artificial_analysis_agentic_index ?? null, 'aa', aaUrl, TODAY, { note: `Artificial Analysis Agentic Index; ${nowNote}` }),
      tps: fact(r.median_output_tokens_per_second || null, 'aa', aaUrl, TODAY, { note: 'mediana de AA para el proveedor de referencia del laboratorio' }),
      ttft: fact(r.median_time_to_first_token_seconds || null, 'aa', aaUrl),
      ttfa: fact(r.median_time_to_first_answer_token_seconds || r.median_time_to_first_answer_token || null, 'aa', aaUrl, TODAY, { note: 'incluye el razonamiento previo a la respuesta' }),
      release: fact(r.release_date || null, 'aa', aaUrl, r.release_date || TODAY, { note: 'fecha del modelo según AA' }),
      blended: fact(blendAA, 'aa', aaUrl, TODAY, { note: 'precio de AA, mezcla 3:1 entrada/salida' })
    };
  }

  let epoch = null;
  if (ep === 'keep') epoch = prev && prev.epoch ? JSON.parse(JSON.stringify(prev.epoch, (k, v) => (v && typeof v === 'object' && 'v' in v) ? { ...v, stale: true } : v)) : null;
  else if (eRow && !lab.stealth) {
    const s = (eRow.model && ep.swe.find(eRow.model).row) || ep.swe.find(eRow.name).row;
    epoch = {
      name: eRow.name, how: eHow,
      eci: fact(eRow.eci, 'epoch', SOURCES.epoch.url, TODAY, { ci: [eRow.lo, eRow.hi], note: `intervalo ${eRow.lo}–${eRow.hi}` }),
      release: fact(eRow.date, 'epoch', SOURCES.epoch.url, eRow.date || TODAY, { note: 'fecha del modelo según Epoch' }),
      access: fact(eRow.access, 'epoch', SOURCES.epoch.url),
      swe: s ? fact(Math.round(s.v * 1000) / 10, 'epoch', 'https://epoch.ai/benchmarks/swe-bench-verified', s.date || TODAY, { note: `SWE-bench Verified, ejecución de Epoch, variante ${s.version}` }) : fact(null, 'epoch', 'https://epoch.ai/benchmarks/swe-bench-verified')
    };
  }

  // Publicación según la base de modelos de Epoch: sólo por nombre exacto (el de su ECI o el del catálogo).
  const name = (m.name || m.id).replace(/^[^:]+:\s*/, '').replace(/\s*\(free\)$/i, '');
  let epochPub = null;
  if (ep === 'keep') epochPub = prev?.epochPub || null;
  else if (ep && !lab.stealth) {
    const r = (eRow && (ep.pub.exact(eRow.model) || ep.pub.exact(eRow.name))) || ep.pub.exact(name);
    if (r) epochPub = fact(r.date, 'epoch', 'https://epoch.ai/data/ai-models', r.date, { note: `fecha de publicación en la base de modelos de Epoch AI («${r.name}»)` });
  }

  return {
    id: m.id,
    name,
    orVariant: m.orVariant || null,
    lab: { id: author, name: lab.name, country: lab.country, url: lab.url, src: 'curated' },
    identity: lab.stealth ? 'sin confirmar' : 'confirmada',
    hfId: lab.stealth ? null : hfId,
    weights, license,
    orCreated: fact(createdISO, 'openrouter', orUrl, createdISO || TODAY, { note: 'fecha de alta en OpenRouter' }),
    epochPub,
    hfCreated: (hf && hf.ok && hf.createdAt) ? fact(hf.createdAt, 'hf', `https://huggingface.co/${hfId}`, hf.createdAt, { note: 'creación del repositorio' }) : (prev && prev.hfCreated) || null,
    ctx: fact(m.context_length || null, 'openrouter', orUrl),
    reasoning: fact(params.includes('reasoning') || params.includes('include_reasoning') ? true : (params.length ? false : null), 'openrouter', orUrl, TODAY, { note: 'parámetro «reasoning» admitido' }),
    caching: fact(price.cacheRead.v !== null ? true : null, 'openrouter', orUrl, TODAY, { note: 'precio de lectura de caché publicado' }),
    modalities: (m.architecture && m.architecture.input_modalities) || null,
    price,
    endpoints: eps,
    endpointsMeta: epsMeta,
    epoch,
    aa
  };
}

/* Líderes abierto y cerrado por índice de AA (vistas de modelos) y por ECI de Epoch (referencia histórica). */
function leaders(models, version) {
  const pick = (val) => {
    const scored = models.filter(m => val(m) !== null && val(m) !== undefined && m.identity === 'confirmada');
    const best = w => scored.filter(m => m.weights.v === w).sort((a, b) => val(b) - val(a))[0] || null;
    return [best('abiertos'), best('cerrados')];
  };
  const [ao, ac] = pick(m => m.aa?.intelligence?.v);
  const [o, c] = pick(m => m.epoch?.eci?.v);
  return {
    open: o ? { id: o.id, eci: o.epoch.eci.v } : null,
    closed: c ? { id: c.id, eci: c.epoch.eci.v } : null,
    aa: { v: version ?? null, open: ao ? { id: ao.id, ii: ao.aa.intelligence.v } : null, closed: ac ? { id: ac.id, ii: ac.aa.intelligence.v } : null }
  };
}

/* Distancias de «La carrera» con el índice de AA, al día: el mismo cálculo que hace la web con aaRace (js/fmt.js), sobre
   los modelos del catálogo con su índice actual y su fecha de publicación. Las distancias llevan signo: negativa si va
   por delante el segundo lado.
   Cobertura (aaCoverage, js/fmt.js): si en una fecha que usa el indicador el mejor modelo abierto o cerrado según la frontera
   del ECI de Epoch no tiene índice AA en el catálogo, el indicador se marca «incompleto» con los que faltan; no se corrige
   ni se estima nada, y el detector de cambios no lo compara. */
function aaIndicators(models, version, st, epFront) {
  const cat = { models, aaIndexVersion: version, generated: NOW_ISO, epochFrontier: epFront };
  const r = aaRace(cat), n = r.now;
  if (!n) return {};
  const cov = epFront?.points?.length ? aaCoverage(cat, r.from) : null;
  const inc = (...dates) => {
    const miss = cov ? [...new Map(dates.flatMap(d => cov.at(d)).map(x => [x.n, x])).values()] : [];
    return miss.length ? { incompleto: miss.map(x => ({ model: x.n, g: x.g, since: x.d, why: x.why })) } : {};
  };
  const who = x => x ? { model: x.n, org: x.org, ii: x.v, date: x.d, id: x.id, ...(x.anun ? { anun: true } : {}) } : null;
  const gap = (a, b) => a && b ? Math.round((a.v - b.v) * 10) / 10 : null;
  const got = st?.ok ? st.got : st?.lastOk || NOW_ISO;
  const f = (v, extra) => ({ v, src: 'aa', url: SOURCES.aa.url, asOf: got.slice(0, 10), got, version, ...(st?.ok ? {} : { stale: true }), ...extra });
  const base = 'índice de inteligencia de Artificial Analysis' + (version ? ` v${version}` : '') + ', con la puntuación actual de cada modelo del catálogo';
  return {
    gapUsCn: f(gap(n.us, n.cn), { signed: true, us: who(n.us), cn: who(n.cn), ...inc(r.today), note: `mejor modelo de un laboratorio estadounidense menos el mejor de uno chino; ${base}` }),
    gapClosedOpen: f(gap(n.closed, n.open), { signed: true, closed: who(n.closed), open: who(n.open), ...inc(r.today),
      // Si el abierto en cabeza sólo tiene pesos anunciados, también la distancia al mejor que ya se puede descargar.
      ...(n.open?.anun && n.openDl ? { openDl: who(n.openDl), vDl: gap(n.closed, n.openDl) } : {}),
      note: `mejor modelo de pesos cerrados menos el mejor de pesos abiertos (incluidos los anunciados en su descripción de OpenRouter, aún sin repositorio público); ${base}` }),
    gapLabs: f(gap(n.first, n.second), { first: who(n.first), second: who(n.second), ...inc(r.today), note: `mejor modelo del primer laboratorio menos el del segundo; ${base}` }),
    labs: n.labs.slice(0, 10).map(who),
    rate12m: f(gap(n.to, n.from), { from: who(n.from), to: who(n.to), since: n.yearAgo, ...inc(n.yearAgo, r.today), note: `puntos ganados por la frontera desde el ${n.yearAgo}: mejor modelo publicado hasta hoy menos el mejor publicado hasta esa fecha, los dos con su puntuación actual; sólo modelos que siguen en OpenRouter` })
  };
}

function snapshot(models) {
  const out = {};
  for (const m of models) {
    out[m.id] = {
      n: m.name,
      // «a»: abiertos anunciados (sin pesos descargables todavía); su publicación en Hugging Face será un cambio «pesos».
      w: m.weights.v === 'abiertos' ? (m.weights.announced ? 'a' : 'o') : m.weights.v === 'cerrados' ? 'c' : null,
      in: m.price.in.v, out: m.price.out.v, pb: m.price.basis, pp: m.price.provider, ...(m.price.tiers ? { lp: m.price.tiers } : {}),
      eci: m.epoch?.eci?.v ?? null, swe: m.epoch?.swe?.v ?? null,
      ii: m.aa?.intelligence?.v ?? null
    };
  }
  return out;
}

async function main() {
  const labs = await readJSON(path.join(DATA, 'curated/labs.json'), {});
  delete labs._doc;
  const ovFile = await readJSON(path.join(DATA, 'curated/overrides.json'), {});
  const overrides = ovFile.aa || {};
  const hfOverrides = ovFile.hf || {};
  const curatedEvents = (await readJSON(path.join(DATA, 'curated/events.json'), { events: [] })).events || [];
  const prevCatalog = await readJSON(path.join(DATA, 'catalog.json'));
  const prevMap = new Map((prevCatalog ? prevCatalog.models : []).map(m => [m.id, m]));
  const curated = await readJSON(path.join(DATA, 'curated/sources.json'), {});
  const permisos = await readJSON(path.join(DATA, 'curated/permisos.json'), {});
  const aaCreators = await readJSON(path.join(DATA, 'curated/aa-creadores.json'), {});
  delete aaCreators._doc;
  if (permisos.aa?.estado === 'permitido') SOURCES.aa.permiso = { fecha: permisos.aa.fecha, forma: permisos.aa.forma, alcance: permisos.aa.alcance };

  let orModels;
  const excl = await readJSON(path.join(DATA, 'curated/excluidos.json'), { reglas: [] });
  try { orModels = await loadOpenRouter(labs, excl); }
  catch (e) { console.error('[collect] OpenRouter falló; no se escribe nada:', e.message); process.exit(2); }

  const aaPrevGot = prevCatalog?.status?.aa?.ok ? prevCatalog.status.aa.got : null;
  const aaReuse = !FIXTURES && aaPrevGot && (NOW - new Date(aaPrevGot)) / 3600e3 < AA_REUSE_H && prevCatalog?.models?.some(m => m.aa);
  if (aaReuse) log(`Artificial Analysis: se reutiliza la consulta de ${aaPrevGot} (menos de ${AA_REUSE_H} h) para no gastar el cupo diario`);
  const aaRes = aaReuse ? undefined : await loadAA(permisos.aa);
  const usoRes = await loadUso(orModels.names);
  const aaRows = aaRes ? aaRes.rows : aaRes;
  const aaVersion = aaRes ? aaRes.version : (aaRes === undefined ? prevCatalog?.aaIndexVersion ?? null : null);
  let ep;
  try { ep = await loadEpoch(); } catch (e) { log(`Epoch falló: ${e.message}`); ep = 'keep'; }
  const epochOv = ovFile.epoch || {};
  const status = {
    openrouter: { ok: true, got: NOW_ISO },
    hf: { ok: true, got: NOW_ISO, failed: 0 },
    epoch: ep === 'keep' ? failedStatus('la consulta falló; se conservan los valores anteriores', 'the check failed; previous values have been retained') : { ok: true, got: NOW_ISO, ...(ep.sweFailed ? { note: 'SWE-bench no disponible en esta recogida' } : {}) },
    aa: aaReuse ? { ok: true, got: aaPrevGot, reused: true } : aaRows === null ? !AA_KEY ? failedStatus('no conectado', 'not connected', { optional: true }) : failedStatus('sin permiso de publicación', 'publication permission not granted', { optional: true }) : aaRows === undefined ? failedStatus('la consulta falló; se conservan los valores anteriores', 'the check failed; previous values have been retained', { lastOk: prevCatalog?.status?.aa?.got || prevCatalog?.status?.aa?.lastOk || null }) : { ok: true, got: NOW_ISO }
  };
  status.uso = usoRes === null ? failedStatus('no conectado', 'not connected', { optional: true }) : usoRes === undefined ? failedStatus('la consulta falló; se conserva el ranking anterior', 'the check failed; the previous ranking has been retained', { lastOk: prevCatalog?.uso?.got || null }) : { ok: true, got: NOW_ISO };

  // Organizaciones de Hugging Face de cada laboratorio: las que ya usan sus modelos enlazados (OpenRouter u overrides).
  const labOrgs = new Map();
  for (const m of orModels) {
    const repo = m.hugging_face_id || hfOverrides[m.id];
    const name = labs[m.id.split('/')[0]]?.name;
    if (!repo || !name || !repo.includes('/')) continue;
    if (!labOrgs.has(name)) labOrgs.set(name, new Set());
    labOrgs.get(name).add(repo.split('/')[0]);
  }
  const hfFound = [];

  const models = [];
  for (const m of orModels) {
    const author = m.id.split('/')[0];
    const lab = labs[author];
    const prev = prevMap.get(m.id);
    if (!m.hugging_face_id && hfOverrides[m.id]) m._hfOverride = hfOverrides[m.id];
    if (!m.hugging_face_id && !m._hfOverride && !lab.stealth && labOrgs.has(lab.name)) {
      m._hfFound = await findHFRepo(m, labOrgs.get(lab.name));
      if (m._hfFound) hfFound.push(`${m.id} → ${m._hfFound}`);
    }
    const hfRepo = m.hugging_face_id || m._hfOverride || m._hfFound;
    const [endpoints, hf] = await Promise.all([
      loadEndpoints(m.orVariant || m.id),
      (hfRepo && !lab.stealth) ? loadHF(hfRepo) : Promise.resolve(null)
    ]);
    if (hf && !hf.ok && !hf.notFound) status.hf.failed++;
    if (hf && hf.notFound && m._hfOverride) log(`override HF sin repositorio: ${m.id} → ${m._hfOverride}`);
    const aaMatch = aaRows === undefined ? 'keep' : matchAA(m, lab, aaRows, overrides, aaCreators);
    if (aaMatch && aaMatch !== 'keep') aaMatch.version = aaVersion;
    models.push(buildModel(m, lab, endpoints, hf, aaMatch, prev, ep, epochOv, ovFile.pesos || {}));
  }
  if (status.hf.failed) status.hf.ok = status.hf.failed < models.length / 4;
  // Desde cuándo constan los pesos anunciados de cada modelo: se arrastra de la recogida anterior; la primera vez, de la
  // instantánea diaria más antigua que ya los registraba («a»). Sirve para ver si un anuncio no llega a publicarse.
  const prevSince = id => { const w = prevMap.get(id)?.weights; return w?.announced ? w.since || null : null; };
  const ann = models.filter(m => m.weights.announced), need = ann.filter(m => !prevSince(m.id)).map(m => m.id), first = new Map();
  if (need.length) {
    const files = (await readdir(path.join(DATA, 'history')).catch(() => [])).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files) {
      const h = await readJSON(path.join(DATA, 'history', f));
      for (const id of need) if (!first.has(id) && h?.models?.[id]?.w === 'a') first.set(id, f.slice(0, 10));
      if (first.size === need.length) break;
    }
  }
  for (const m of ann) m.weights.since = prevSince(m.id) || first.get(m.id) || TODAY;
  log(`Hugging Face: ${hfFound.length} repositorios encontrados en la organización del laboratorio sin enlace de OpenRouter${hfFound.length ? `: ${hfFound.join(' | ')}` : ''}`);

  // Diagnóstico de emparejamiento con Epoch (sólo en el registro): ayuda a completar overrides.epoch.
  if (ep !== 'keep') {
    const used = new Set(models.map(m => m.epoch?.name).filter(Boolean));
    const since = new Date(NOW.getTime() - WINDOW_DAYS * 86400e3).toISOString().slice(0, 10);
    const missEp = ep.rows.filter(r => r.date >= since && !used.has(r.name)).map(r => r.name);
    const missOr = models.filter(m => !m.epoch?.eci && m.identity === 'confirmada').map(m => `${m.id} «${m.name}»`);
    log(`Epoch: ${used.size} modelos emparejados; ${missEp.length} recientes de Epoch sin pareja en el catálogo`);
    if (missEp.length) log(`  Epoch sin pareja: ${missEp.slice(0, 80).join(' | ')}`);
    if (missOr.length) log(`  catálogo sin ECI (${missOr.length}): ${missOr.slice(0, 120).join(' | ')}`);
    if (EPOCH_AMBIGUOUS.length) log(`  ambiguos, sin emparejar (${EPOCH_AMBIGUOUS.length}): ${EPOCH_AMBIGUOUS.join(' | ')}`);
    if (ANNOUNCED.length) log(`Pesos anunciados según la descripción de OpenRouter (${ANNOUNCED.length}; se corrige con «pesos» en overrides.json): ${ANNOUNCED.join(' | ')}`);
  }

  // Diagnóstico de emparejamiento con AA (sólo en el registro): ayuda a completar overrides.aa y aa-creadores.json.
  if (aaRows) {
    const ids = new Set(aaRows.map(r => r.model_creator?.id));
    const dead = Object.entries(aaCreators).filter(([, id]) => !ids.has(id)).map(([k]) => k);
    if (dead.length) log(`  aa-creadores.json: ids sin modelos en AA: ${dead.join(', ')}`);
    const recent = new Date(NOW.getTime() - 60 * 86400e3).toISOString().slice(0, 10);
    const used = new Set(models.map(m => m.aa?.slug).filter(Boolean));
    const known = new Set(Object.values(aaCreators));
    const missAA = aaRows.filter(r => (r.release_date || '') >= recent && known.has(r.model_creator?.id) && !used.has(r.slug)).map(r => `${r.slug} «${r.name}»`);
    const missOr = models.filter(m => !m.aa && m.identity === 'confirmada' && (m.orCreated.v || '') >= recent).map(m => `${m.id} «${m.name}»`);
    const others = [...new Set(aaRows.filter(r => (r.release_date || '') >= recent && !known.has(r.model_creator?.id)).map(r => r.model_creator?.name))];
    log(`AA: ${models.filter(m => m.aa).length} modelos emparejados (${models.filter(m => m.aa?.intelligence?.v != null).length} con índice)`);
    if (missOr.length) log(`  catálogo de los últimos 60 días sin AA (${missOr.length}): ${missOr.join(' | ')}`);
    if (missAA.length) log(`  AA de los últimos 60 días sin pareja, de laboratorios seguidos (${missAA.length}): ${missAA.slice(0, 80).join(' | ')}`);
    if (others.length) log(`  creadores de AA con modelos de los últimos 60 días que no se siguen: ${others.join(', ')}`);
  }

  models.sort((a, b) => (b.orCreated.v || '').localeCompare(a.orCreated.v || ''));

  // Instantánea del día e histórico
  await mkdir(path.join(DATA, 'history'), { recursive: true });
  const histFiles = (await readdir(path.join(DATA, 'history'))).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const earlier = histFiles.filter(f => f.slice(0, 10) < TODAY);
  const base = earlier.length ? await readJSON(path.join(DATA, 'history', earlier[earlier.length - 1])) : null;
  // Indicadores de «La carrera» y «AI 2027»
  const prevInd = await readJSON(path.join(DATA, 'indicadores.json'));
  const indicators = await collectIndicators({ getText, getBuf, parseCSV, fact, log, NOW_ISO, TODAY }, ep, prevInd);
  const epFront = ep === 'keep' ? (prevCatalog?.epochFrontier || null) : { ...epochFrontier(ep.rows), got: NOW_ISO, src: 'epoch', url: SOURCES.epoch.url, n: ep.rows.length };
  indicators.ind.aa = aaIndicators(models, aaVersion, status.aa, epFront);
  const ai2027 = await readJSON(path.join(DATA, 'curated/ai2027.json'));
  const usoNow = usoRes ? usoRes.semana : null;

  const snap = {
    date: TODAY, got: NOW_ISO,
    aaIndexVersion: aaVersion ?? curated.aaIndexVersion ?? null,
    leaders: leaders(models, aaVersion),
    ind: indSnapshot(indicators.ind),
    ...snapshotExtras({ ai2027, checks: indicators.checks, uso: usoNow }),
    models: snapshot(models)
  };
  await writeFile(path.join(DATA, 'history', `${TODAY}.json`), JSON.stringify(snap) + '\n');
  if (!histFiles.includes(`${TODAY}.json`)) histFiles.push(`${TODAY}.json`);
  // Serie diaria compacta para los gráficos de evolución: un registro por instantánea guardada.
  const serie = [];
  const firstSeen = new Map();   // primera recogida en la que figura cada modelo: su fecha de detección
  for (const f of histFiles.slice().sort()) {
    const h = f === `${TODAY}.json` ? snap : await readJSON(path.join(DATA, 'history', f));
    if (!h?.models) continue;
    for (const id of Object.keys(h.models)) if (!firstSeen.has(id)) firstSeen.set(id, h.date);
    const best = w => Object.entries(h.models).filter(([, x]) => (x.w === w || (w === 'o' && x.w === 'a')) && x.ii !== null && x.ii !== undefined).sort((x, y) => y[1].ii - x[1].ii)[0];
    const lead = (id, w) => { const e = id && h.models[id] ? [id, h.models[id]] : best(w); return e ? { id: e[0], n: e[1].n, ii: e[1].ii } : null; };
    serie.push({ d: h.date, aaV: h.aaIndexVersion ?? null, open: lead(h.leaders?.aa?.open?.id, 'o'), closed: lead(h.leaders?.aa?.closed?.id, 'c'), eciClosedOpen: h.ind?.closedOpen ?? null, eciUsCn: h.ind?.usCn ?? null });
  }
  await writeFile(path.join(DATA, 'historia.json'), JSON.stringify({ _doc: 'Serie diaria derivada de data/history/<fecha>.json: líderes por índice de Artificial Analysis (cerrado y abierto) y distancias ECI. Generado; no editar a mano.', generated: NOW_ISO, serie }) + '\n');
  // Cambios frente a la última instantánea de un día anterior. El ranking de uso entró en las instantáneas el 23 oct 2026:
  // hasta que la base lo tenga, se compara con el de la recogida anterior si es de otro día.
  const hoyFrom = new Date(NOW.getTime() - (HOY_DAYS - 1) * 86400e3).toISOString().slice(0, 10);
  const usoPrev = base?.uso ?? (prevCatalog?.uso?.top && prevCatalog.generated.slice(0, 10) < TODAY ? prevCatalog.uso.top.map(r => r.slug) : null);
  // Tarifas del laboratorio en la base; las instantáneas anteriores al 23 oct 2026 no las guardan: si la recogida anterior
  // es del mismo día que la base, se sacan de sus proveedores.
  const prevSameDay = base && prevCatalog?.generated?.slice(0, 10) === base.date;
  const prevTiers = id => base?.models?.[id]?.lp ?? (prevSameDay && prevMap.get(id) ? labTiers(prevMap.get(id).endpoints, new Set(labs[id.split('/')[0]]?.or_provider || [])) : null);
  const { items: changeItems, novedades } = detectChanges({
    models, base, listed: orModels.listed, leaders: snap.leaders, ind: indicators.ind, checks: indicators.checks, ai2027,
    uso: usoNow, usoPrev, prevTiers, firstSeen, hoyFrom, TODAY, NOW_ISO
  });
  const baseDate = base ? base.date : null;

  const catalog = {
    schema: 2,
    generated: NOW_ISO,
    sources: SOURCES,
    status,
    aaIndexVersion: aaVersion ?? curated.aaIndexVersion ?? null,
    epochFrontier: epFront,
    method: {
      capability: `En las vistas de modelos, la capacidad se mide con el Artificial Analysis Intelligence Index${aaVersion ? ` v${aaVersion}` : ''}, que AA calcula con sus propias pruebas y suele puntuar un modelo a los pocos días de salir. AA publica una cifra por configuración de razonamiento; se muestra la de mayor índice y se nombra. Junto a él figura el Epoch Capabilities Index (ECI) de Epoch AI (CC BY 4.0), que combina muchos benchmarks con intervalo de confianza y es la base de las series históricas de «La carrera». Las dos escalas no son comparables entre sí. El emparejamiento con OpenRouter es por laboratorio y nombre normalizado.`,
      blended: 'Precio combinado = (3 × entrada + salida) / 4, en USD por millón de tokens, como Artificial Analysis.',
      price: 'Precio: el que cobra el propio laboratorio cuando sirve el modelo en OpenRouter; si no lo sirve, el del proveedor más barato, nombrado y con su cuantización cuando OpenRouter la publica (puede no ser la versión que evalúan AA o Epoch). El precio por modelo que publica OpenRouter no se usa porque corresponde a un proveedor de referencia que cambia de un día a otro. Sólo se registran como cambio de precio los del propio laboratorio.',
      weights: '«Abiertos» con un repositorio público en Hugging Face, enlazado por OpenRouter o con el mismo nombre en la organización del laboratorio. Sin repositorio, la clasificación de Epoch si la hay; si no, «abiertos · anunciados» cuando su descripción de OpenRouter lo presenta como de pesos abiertos (no consta quién la redacta, así que no se atribuye al laboratorio; cuenta como abierto, aunque aún no se pueda descargar), y si no, «cerrados», marcado como inferido. La licencia procede de la ficha de Hugging Face.',
      speed: 'La velocidad depende de quién sirve el modelo. Se muestra la mediana que mide Artificial Analysis en el proveedor de referencia, con la misma configuración que da su puntuación; con el razonamiento al máximo, la latencia (tiempo hasta el primer token) incluye el tiempo de pensar y puede llegar a minutos. Si AA no la tiene, la del proveedor más rápido de OpenRouter cuando su API la publica.',
      window: `Entran los modelos de los laboratorios seguidos dados de alta en OpenRouter en los últimos ${WINDOW_DAYS} días.`
    },
    models,
    excluded: orModels.excluded || prevCatalog?.excluded || [],
    uso: usoRes ? usoRes.semana : (usoRes === undefined && prevCatalog?.uso ? { ...prevCatalog.uso, stale: true } : null),
    usoMes: usoRes ? usoRes.mes : (usoRes === undefined && prevCatalog?.usoMes ? { ...prevCatalog.usoMes, stale: true } : null),
    curatedEvents,
    history: histFiles.map(f => f.slice(0, 10))
  };

  await writeFile(path.join(DATA, 'catalog.json'), JSON.stringify(catalog) + '\n');
  await writeFile(path.join(DATA, 'indicadores.json'), JSON.stringify({
    schema: 1, generated: NOW_ISO,
    sources: { epoch: SOURCES.epoch, metr: SOURCES.metr, aa: SOURCES.aa },
    status: indicators.status,
    ind: indicators.ind,
    checks: indicators.checks
  }) + '\n');
  // Registro acumulado de los cambios detectados (todos los tipos salvo las altas, que salen de la fecha de OpenRouter)
  const logPath = path.join(DATA, 'events-log.json');
  const evLog = await readJSON(logPath, { events: [] });
  evLog._doc = 'Cambios detectados por el recolector (scripts/cambios.mjs) al comparar cada recogida con la del día anterior. Generado; no editar a mano.';
  // Los cambios de precio anteriores al 21 oct 2026 comparaban el precio de referencia de OpenRouter, que salta entre proveedores: se descartan.
  evLog.events = evLog.events.filter(e => e.kind !== 'precio' || e.data?.basis === 'laboratorio');
  // Tampoco son retiradas los modelos que OpenRouter sigue listando y sólo salieron de la ventana de antigüedad.
  evLog.events = evLog.events.filter(e => e.kind !== 'retirada' || !orModels.listed.has(e.model));
  // Lo que se ha sacado del catálogo (imagen, audio, enrutadores, seguridad) tampoco cuenta como acontecimiento.
  const exclIds = new Set((orModels.excluded || []).map(e => e.id));
  evLog.events = evLog.events.filter(e => !exclIds.has(e.model));
  evLog.events = mergeLog(evLog.events, changeItems, TODAY);
  // Parte diario: titular, importancia según la regla fija y consecuencia de cada cambio (scripts/parte.mjs).
  const carrera = await readJSON(path.join(DATA, 'curated/carrera.json'));
  const P = {
    byId: new Map(models.map(m => [m.id, m])), models, base, leaders: snap.leaders, ind: indicators.ind, checks: indicators.checks, ai2027, carrera,
    hitos: new Map((ai2027?.lineas || []).flatMap(l => (l.hitos || []).map(h => [h.id, h]))), uso: usoNow || catalog.uso
  };
  enrich(evLog.events, P, TODAY);
  enrich(novedades, P, TODAY);
  await writeFile(logPath, JSON.stringify({ _doc: evLog._doc, vigilados: vigilados(indicators?.ind), events: evLog.events }, null, 1) + '\n');
  // «Hoy»: altas de la última semana más los cambios registrados en ella.
  // Un cambio entra por su fecha o por la de su detección (unos pesos publicados hace semanas pero detectados hoy).
  const hoyItems = novedades.concat(evLog.events.filter(e => e.date >= hoyFrom || e.detected >= hoyFrom));
  const brief = parte(hoyItems, TODAY, novedades.concat(evLog.events));
  await writeFile(path.join(DATA, 'changes.json'), JSON.stringify({ generated: NOW_ISO, window: HOY_DAYS, since: hoyFrom, base: baseDate, parte: brief, items: hoyItems }, null, 1) + '\n');
  await writeFile(path.join(DATA, 'parte.xml'), rss(novedades.concat(evLog.events), { NOW_ISO, TODAY }));
  await writeFile(path.join(DATA, 'parte.en.xml'), rss(novedades.concat(evLog.events), { NOW_ISO, TODAY }, 'en'));
  // Textos que no han salido en inglés: aviso identificable (::warning:: en GitHub Actions); la recogida sigue.
  if (AVISOS.size) for (const a of AVISOS) console.log(`::warning title=Traducción pendiente::${a.length > 220 ? a.slice(0, 220) + '…' : a}`);
  log(`parte del ${TODAY}: ${brief.noticias.length ? brief.noticias.join(' | ') : `sin noticias${brief.ultima ? ` (la última, ${brief.ultima.key}, del ${brief.ultima.fecha})` : ''}`}`);
  log(`escrito: ${models.length} modelos (${models.filter(m => m.epoch?.eci?.v).length} con ECI), ${changeItems.length} cambios frente al ${baseDate || '—'} (${Object.entries(changeItems.reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] || 0) + 1 }), {})).map(([k, n]) => `${k} ${n}`).join(', ') || 'ninguno'}), ${hoyItems.length} en la ventana de Hoy, AA ${status.aa.ok ? 'ok' : status.aa.reason}`);
}

main().catch(e => { console.error(e); process.exit(1); });
