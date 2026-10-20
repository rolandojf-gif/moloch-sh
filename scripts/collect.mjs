#!/usr/bin/env node
/* MOLOCH.SH · recolector de datos del observatorio.

   Lee fuentes públicas y escribe JSON estático en data/:
     data/catalog.json        catálogo actual: cada cifra lleva fuente, URL, fecha del dato y fecha de consulta
     data/changes.json        diferencias con la recogida anterior (novedades, cambios de precio, pesos nuevos)
     data/history/<fecha>.json instantánea compacta para series históricas
     data/indicadores.json     cifras de «La carrera» y «AI 2027» (scripts/indicadores.mjs)

   Fuentes:
     OpenRouter  /api/v1/models y /endpoints   (sin clave)  precios, contexto, proveedores, velocidad por proveedor
     Hugging Face /api/models/<repo>           (sin clave)  existencia de pesos, licencia, fecha del repositorio
     Epoch AI     eci_scores.csv y benchmarks.csv (CC BY 4.0) índice de capacidades ECI, SWE-bench Verified, apertura
     Artificial Analysis /api/v2/language/models/free (AA_API_KEY y AA_REDISTRIBUTION=permitida)
                  Su licencia gratuita no permite republicar datos tabulados; sin permiso expreso no se usa.
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
import { collectIndicators, indicatorSnapshot } from './indicadores.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const NOW = new Date();
const NOW_ISO = NOW.toISOString().replace(/\.\d{3}Z$/, 'Z');
const TODAY = NOW_ISO.slice(0, 10);
const WINDOW_DAYS = Number(process.env.WINDOW_DAYS || 540);   // antigüedad máxima en OpenRouter para entrar en el catálogo
const NEW_DAYS = 14;                                           // «novedad» si no hay recogida anterior
const PRICE_CHANGE_MIN = 0.05;                                 // cambios de precio por debajo del 5 % no se listan
const FIXTURES = process.env.FIXTURES;
const AA_KEY = process.env.AA_API_KEY || '';
const AA_ALLOWED = process.env.AA_REDISTRIBUTION === 'permitida';

const SOURCES = {
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/models', api: 'https://openrouter.ai/api/v1/models' },
  hf: { name: 'Hugging Face', url: 'https://huggingface.co/models', api: 'https://huggingface.co/api/models' },
  epoch: { name: 'Epoch AI', url: 'https://epoch.ai/benchmarks/eci', api: 'https://epoch.ai/data/eci_scores.csv', bench: 'https://epoch.ai/data/benchmarks.csv', license: 'CC BY 4.0', cite: "Epoch AI, 'Capabilities & benchmarking', epoch.ai" },
  aa: { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/leaderboards/models', api: 'https://artificialanalysis.ai/api/v2/language/models/free', legacy: 'https://artificialanalysis.ai/api/v2/data/llms/models' },
  metr: { name: 'METR', url: 'https://metr.org/time-horizons', api: 'https://metr.org/assets/benchmark_results_1_1.yaml', license: '© METR; sólo se cita el último punto' },
  curated: { name: 'Curado manualmente', url: null }
};

const log = (...a) => console.log('[collect]', ...a);

async function readJSON(p, fallback = null) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}

const getJSON = (url, headers) => getRaw(url, headers, false);
const getText = (url, headers) => getRaw(url, headers, true);

async function getRaw(url, headers = {}, asText = false) {
  if (FIXTURES) {
    const key = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 180) + (asText ? '.txt' : '.json');
    const p = path.join(FIXTURES, key);
    if (!existsSync(p)) throw new Error(`fixture ausente: ${key}`);
    const t = await readFile(p, 'utf8');
    return asText ? t : JSON.parse(t);
  }
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'moloch-sh-observatorio/1.0 (+https://github.com/rolandojf-gif/moloch-sh)', ...headers } });
      if (res.status === 404) { const e = new Error(`404 ${url}`); e.status = 404; throw e; }
      if (!res.ok) { const e = new Error(`${res.status} ${url}`); e.status = res.status; throw e; }
      return asText ? await res.text() : await res.json();
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
const money = n => `${n.toLocaleString('es-ES', { maximumFractionDigits: 4 })} $`;
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
async function loadOpenRouter(labs) {
  const res = await getJSON(SOURCES.openrouter.api);
  const all = res.data || [];
  const cutoff = NOW.getTime() / 1000 - WINDOW_DAYS * 86400;
  const seen = new Set();
  const out = [];
  for (const m of all) {
    const id = baseId(m.id);
    if (id !== m.id) continue;                   // sólo la variante base
    const author = id.split('/')[0];
    if (!labs[author]) continue;
    if ((m.created || 0) < cutoff) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(m);
  }
  log(`OpenRouter: ${all.length} modelos, ${out.length} en el catálogo`);
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
  return out;
}

/* Frontera por fecha según Epoch: máximo acumulado del ECI en cada grupo de apertura. */
function epochFrontier(rows) {
  const pts = [];
  const best = { open: null, closed: null };
  const sorted = rows.filter(r => r.date && (r.group === 'Open weights' || r.group === 'Closed weights')).sort((a, b) => a.date.localeCompare(b.date));
  for (const r of sorted) {
    const g = r.group === 'Open weights' ? 'open' : 'closed';
    if (!best[g] || r.eci > best[g].v) {
      best[g] = { v: r.eci, name: r.name };
      pts.push({ date: r.date, open: best.open, closed: best.closed });
    }
  }
  return pts;
}

/* ── Artificial Analysis ────────────────────────────────────────────────── */
async function loadAA() {
  if (!AA_KEY && !FIXTURES) { log('AA_API_KEY ausente'); return null; }
  if (!AA_ALLOWED && !FIXTURES) { log('AA_REDISTRIBUTION no es «permitida»: no se publican datos de AA'); return null; }
  try {
    let res;
    try { res = await getJSON(SOURCES.aa.api, { 'x-api-key': AA_KEY }); }
    catch (e) { if (e.status === 404 || e.status === 410) res = await getJSON(SOURCES.aa.legacy, { 'x-api-key': AA_KEY }); else throw e; }
    const rows = (res.data || []).map(r => ({ ...r, ...(r.performance || {}) }));
    log(`Artificial Analysis: ${rows.length} modelos`);
    return rows;
  } catch (e) {
    log(`Artificial Analysis falló: ${e.message}`);
    return undefined;   // undefined = fallo (se conservan valores previos); null = sin clave
  }
}

function matchAA(orModel, lab, aaRows, overrides) {
  if (!aaRows || !lab.aa_creator) return null;
  if (Object.prototype.hasOwnProperty.call(overrides, orModel.id)) {
    const slug = overrides[orModel.id];
    if (!slug) return null;
    const row = aaRows.find(r => r.slug === slug);
    return row ? { row, how: 'manual' } : null;
  }
  const target = norm(orModel.name);
  const cands = aaRows.filter(r => (r.model_creator && r.model_creator.slug) === lab.aa_creator);
  const exact = cands.filter(r => norm(r.name) === target);
  const variants = exact.length ? exact : cands.filter(r => {
    const n = norm(r.name);
    return n.startsWith(target + ' ') && !/\d/.test(n.slice(target.length));   // «gpt 5» no casa con «gpt 5.1»
  });
  if (!variants.length) return null;
  const ii = r => (r.evaluations && r.evaluations.artificial_analysis_intelligence_index) ?? -1;
  const best = variants.slice().sort((a, b) => ii(b) - ii(a))[0];
  return { row: best, how: exact.length ? 'nombre exacto' : 'variante de mayor índice', variants: variants.length };
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

function buildModel(m, lab, endpoints, hf, aaMatch, prev, ep, epochOv) {
  const orUrl = `https://openrouter.ai/${m.id}`;
  const createdISO = m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null;
  const author = m.id.split('/')[0];
  const hfId = m.hugging_face_id || m._hfOverride || null;

  // Pesos: abiertos sólo si hay repositorio público en Hugging Face enlazado por OpenRouter y la consulta lo confirma.
  let weights, license;
  if (hfId && hf && hf.ok && !hf.isPrivate) {
    const hfUrl = `https://huggingface.co/${hfId}`;
    weights = fact('abiertos', 'hf', hfUrl, hf.createdAt || TODAY, hf.gated ? { note: 'descarga con solicitud de acceso' } : {});
    license = fact(hf.license ? (hf.license === 'other' && hf.licenseName ? hf.licenseName : hf.license) : null, 'hf', hfUrl, TODAY);
  } else if (hfId && hf && !hf.ok && !hf.notFound && prev && prev.weights) {
    weights = { ...prev.weights, stale: true };
    license = prev.license ? { ...prev.license, stale: true } : fact(null, 'hf', null);
  } else if (!hfId || (m._hfOverride && hf && hf.notFound)) {
    weights = fact('cerrados', 'openrouter', orUrl, TODAY, { inferred: true, note: 'inferido: OpenRouter no enlaza pesos públicos; puede corregirse en data/curated/overrides.json' });
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
  if (lab.stealth) {
    weights = fact(null, 'openrouter', orUrl, TODAY, { note: 'modelo anónimo' });
    license = fact(null, 'openrouter', orUrl, TODAY);
  }

  const p = m.pricing || {};
  const params = m.supported_parameters || [];
  const price = {
    in: fact(perMillion(p.prompt), 'openrouter', orUrl),
    out: fact(perMillion(p.completion), 'openrouter', orUrl),
    cacheRead: fact(perMillion(p.input_cache_read), 'openrouter', orUrl),
    cacheWrite: fact(perMillion(p.input_cache_write), 'openrouter', orUrl)
  };

  const eps = speedFromEndpoints(endpoints) ?? (prev && prev.endpoints ? prev.endpoints.map(e => ({ ...e, stale: true })) : null);
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
    aa = {
      slug: r.slug, name: r.name, how: aaMatch.how, url: aaUrl,
      intelligence: fact(ev.artificial_analysis_intelligence_index, 'aa', aaUrl),
      coding: fact(ev.artificial_analysis_coding_index, 'aa', aaUrl),
      version: r.intelligence_index_version || (r.evaluations && r.evaluations.intelligence_index_version) || null,
      tps: fact(r.median_output_tokens_per_second || null, 'aa', aaUrl, TODAY, { note: 'mediana de AA para el proveedor de referencia del laboratorio' }),
      ttft: fact(r.median_time_to_first_token_seconds || null, 'aa', aaUrl),
      ttfa: fact(r.median_time_to_first_answer_token || null, 'aa', aaUrl, TODAY, { note: 'incluye el razonamiento previo a la respuesta' }),
      release: fact(r.release_date || null, 'aa', aaUrl, r.release_date || TODAY),
      blended: fact(r.pricing ? r.pricing.price_1m_blended_3_to_1 ?? null : null, 'aa', aaUrl, TODAY, { note: 'mezcla 3:1 entrada/salida de AA' })
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

  return {
    id: m.id,
    name: (m.name || m.id).replace(/^[^:]+:\s*/, ''),
    lab: { id: author, name: lab.name, country: lab.country, url: lab.url, src: 'curated' },
    identity: lab.stealth ? 'sin confirmar' : 'confirmada',
    hfId: lab.stealth ? null : hfId,
    weights, license,
    orCreated: fact(createdISO, 'openrouter', orUrl, createdISO || TODAY, { note: 'fecha de alta en OpenRouter' }),
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

/* ── Diferencias con la última instantánea de un día anterior ──────────── */
function diff(models, base) {
  const items = [];
  const prev = base ? base.models : null;
  const cutoff = new Date(NOW.getTime() - NEW_DAYS * 86400e3).toISOString().slice(0, 10);
  const orSrc = m => ({ name: 'OpenRouter', url: `https://openrouter.ai/${m.id}`, got: NOW_ISO });

  for (const m of models) {
    const p = prev ? prev[m.id] : undefined;
    if (!p) {
      // Sin instantánea previa sólo cuentan las altas recientes; con ella, un alta antigua indica un laboratorio o ventana nuevos, no un lanzamiento.
      if (!m.orCreated.v || m.orCreated.v < cutoff) continue;
      items.push({ kind: 'nuevo', model: m.id, date: m.orCreated.v, src: orSrc(m),
        what: `${m.name} (${m.lab.name}) aparece en el catálogo de OpenRouter.`,
        data: { weights: m.weights.v, in: m.price.in.v, out: m.price.out.v, eci: m.epoch?.eci?.v ?? null, identity: m.identity } });
      continue;
    }
    for (const k of ['in', 'out']) {
      const a = p[k], b = m.price[k].v;
      if (a > 0 && b !== null && Math.abs(b - a) / a >= PRICE_CHANGE_MIN) {
        items.push({ kind: 'precio', model: m.id, date: TODAY, src: orSrc(m),
          what: `${m.name}: el precio de ${k === 'in' ? 'entrada' : 'salida'} pasa de ${money(a)} a ${money(b)} por millón de tokens.`,
          data: { field: k, from: a, to: b, pct: Math.round((b - a) / a * 1000) / 10, since: base.date } });
      }
    }
    if (p.w !== 'o' && m.weights.v === 'abiertos') {
      items.push({ kind: 'pesos', model: m.id, date: m.hfCreated?.v || TODAY, src: { name: 'Hugging Face', url: m.weights.url, got: NOW_ISO },
        what: `${m.name}: pesos descargables en Hugging Face (licencia ${m.license.v || 'sin datos'}).`, data: { license: m.license.v } });
    }
    const pb = m.epoch?.eci?.v;
    if ((p.eci === null || p.eci === undefined) && pb !== null && pb !== undefined) {
      items.push({ kind: 'evaluacion', model: m.id, date: TODAY, src: { name: 'Epoch AI', url: SOURCES.epoch.url, got: NOW_ISO },
        what: `${m.name}: primera puntuación en el índice ECI de Epoch AI (${pb}).`, data: { eci: pb } });
    }
  }
  if (prev) {
    const now = new Set(models.map(m => m.id));
    for (const [id, p] of Object.entries(prev)) {
      if (!now.has(id)) items.push({ kind: 'retirada', model: id, date: TODAY, src: { name: 'OpenRouter', url: 'https://openrouter.ai/models', got: NOW_ISO },
        what: `${p.n || id} deja de figurar en el catálogo de OpenRouter.`, data: { name: p.n || null } });
    }
  }
  return items;
}

function leaders(models) {
  const scored = models.filter(m => m.epoch?.eci?.v !== null && m.epoch?.eci?.v !== undefined && m.identity === 'confirmada');
  const best = w => scored.filter(m => m.weights.v === w).sort((a, b) => b.epoch.eci.v - a.epoch.eci.v)[0] || null;
  const o = best('abiertos'), c = best('cerrados');
  return {
    open: o ? { id: o.id, eci: o.epoch.eci.v } : null,
    closed: c ? { id: c.id, eci: c.epoch.eci.v } : null
  };
}

function snapshot(models) {
  const out = {};
  for (const m of models) {
    out[m.id] = {
      n: m.name,
      w: m.weights.v === 'abiertos' ? 'o' : m.weights.v === 'cerrados' ? 'c' : null,
      in: m.price.in.v, out: m.price.out.v,
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

  let orModels;
  try { orModels = await loadOpenRouter(labs); }
  catch (e) { console.error('[collect] OpenRouter falló; no se escribe nada:', e.message); process.exit(2); }

  const aaRows = await loadAA();
  let ep;
  try { ep = await loadEpoch(); } catch (e) { log(`Epoch falló: ${e.message}`); ep = 'keep'; }
  const epochOv = ovFile.epoch || {};
  const status = {
    openrouter: { ok: true, got: NOW_ISO },
    hf: { ok: true, got: NOW_ISO, failed: 0 },
    epoch: ep === 'keep' ? { ok: false, reason: 'la consulta falló; se conservan los valores anteriores' } : { ok: true, got: NOW_ISO, ...(ep.sweFailed ? { note: 'SWE-bench no disponible en esta recogida' } : {}) },
    aa: aaRows === null ? { ok: false, optional: true, reason: !AA_KEY ? 'no conectado' : 'sin permiso de redistribución' } : aaRows === undefined ? { ok: false, reason: 'la consulta falló; se conservan los valores anteriores', lastOk: prevCatalog?.status?.aa?.got || prevCatalog?.status?.aa?.lastOk || null } : { ok: true, got: NOW_ISO }
  };

  const models = [];
  for (const m of orModels) {
    const author = m.id.split('/')[0];
    const lab = labs[author];
    const prev = prevMap.get(m.id);
    if (!m.hugging_face_id && hfOverrides[m.id]) m._hfOverride = hfOverrides[m.id];
    const hfRepo = m.hugging_face_id || m._hfOverride;
    const [endpoints, hf] = await Promise.all([
      loadEndpoints(m.id),
      (hfRepo && !lab.stealth) ? loadHF(hfRepo) : Promise.resolve(null)
    ]);
    if (hf && !hf.ok && !hf.notFound) status.hf.failed++;
    if (hf && hf.notFound && m._hfOverride) log(`override HF sin repositorio: ${m.id} → ${m._hfOverride}`);
    const aaMatch = aaRows === undefined ? 'keep' : matchAA(m, lab, aaRows, overrides);
    models.push(buildModel(m, lab, endpoints, hf, aaMatch, prev, ep, epochOv));
  }
  if (status.hf.failed) status.hf.ok = status.hf.failed < models.length / 4;

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
  }

  models.sort((a, b) => (b.orCreated.v || '').localeCompare(a.orCreated.v || ''));

  // Instantánea del día e histórico
  await mkdir(path.join(DATA, 'history'), { recursive: true });
  const histFiles = (await readdir(path.join(DATA, 'history'))).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const earlier = histFiles.filter(f => f.slice(0, 10) < TODAY);
  const base = earlier.length ? await readJSON(path.join(DATA, 'history', earlier[earlier.length - 1])) : null;
  // Indicadores de «La carrera» y «AI 2027»
  const prevInd = await readJSON(path.join(DATA, 'indicadores.json'));
  const indicators = await collectIndicators({ getText, parseCSV, fact, log, NOW_ISO, TODAY }, ep, prevInd);

  const snap = {
    date: TODAY, got: NOW_ISO,
    aaIndexVersion: curated.aaIndexVersion ?? null,
    leaders: leaders(models),
    ind: indicatorSnapshot(indicators.ind),
    models: snapshot(models)
  };
  await writeFile(path.join(DATA, 'history', `${TODAY}.json`), JSON.stringify(snap) + '\n');
  if (!histFiles.includes(`${TODAY}.json`)) histFiles.push(`${TODAY}.json`);
  const changeItems = diff(models, base);
  const baseDate = base ? base.date : null;

  const catalog = {
    schema: 2,
    generated: NOW_ISO,
    sources: SOURCES,
    status,
    aaIndexVersion: curated.aaIndexVersion ?? null,
    epochFrontier: ep === 'keep' ? (prevCatalog?.epochFrontier || null) : { points: epochFrontier(ep.rows), got: NOW_ISO, src: 'epoch', url: SOURCES.epoch.url, n: ep.rows.length },
    method: {
      capability: 'La capacidad se mide con el Epoch Capabilities Index (ECI), que combina muchos benchmarks en una escala común con intervalo de confianza; datos de Epoch AI con licencia CC BY 4.0. La programación usa SWE-bench Verified ejecutado por Epoch. El emparejamiento con OpenRouter es por nombre exacto normalizado.',
      blended: 'Precio combinado = (3 × entrada + salida) / 4, en USD por millón de tokens, como Artificial Analysis.',
      weights: '«Abiertos» exige un repositorio público en Hugging Face enlazado por OpenRouter. Sin enlace, «cerrados». La licencia procede de la ficha de Hugging Face.',
      speed: 'La velocidad depende de quién sirve el modelo. La API abierta de OpenRouter no publica latencia ni rendimiento, y la licencia gratuita de Artificial Analysis no permite republicar sus datos en tablas, así que de momento no hay fuente publicable.',
      window: `Entran los modelos de los laboratorios seguidos dados de alta en OpenRouter en los últimos ${WINDOW_DAYS} días.`
    },
    models,
    curatedEvents,
    history: histFiles.map(f => f.slice(0, 10))
  };

  await writeFile(path.join(DATA, 'catalog.json'), JSON.stringify(catalog) + '\n');
  await writeFile(path.join(DATA, 'indicadores.json'), JSON.stringify({
    schema: 1, generated: NOW_ISO,
    sources: { epoch: SOURCES.epoch, metr: SOURCES.metr },
    status: indicators.status,
    ind: indicators.ind,
    checks: indicators.checks
  }) + '\n');
  // Registro acumulado de acontecimientos detectados (precio, pesos, retiradas, primeras evaluaciones)
  const logPath = path.join(DATA, 'events-log.json');
  const evLog = await readJSON(logPath, { _doc: 'Acontecimientos detectados por el recolector al comparar recogidas sucesivas. Generado; no editar a mano.', events: [] });
  const keyOf = e => [e.kind, e.model, e.date, e.data?.field || ''].join('|');
  const known = new Set(evLog.events.map(keyOf));
  for (const e of changeItems) if (e.kind !== 'nuevo' && !known.has(keyOf(e))) { evLog.events.push(e); known.add(keyOf(e)); }
  evLog.events.sort((a, b) => b.date.localeCompare(a.date));
  await writeFile(logPath, JSON.stringify(evLog, null, 1) + '\n');
  await writeFile(path.join(DATA, 'changes.json'), JSON.stringify({ generated: NOW_ISO, since: baseDate, items: changeItems }, null, 1) + '\n');
  log(`escrito: ${models.length} modelos (${models.filter(m => m.epoch?.eci?.v).length} con ECI), ${changeItems.length} cambios, AA ${status.aa.ok ? 'ok' : status.aa.reason}`);
}

main().catch(e => { console.error(e); process.exit(1); });
