#!/usr/bin/env node
/* MOLOCH.SH · recolector de datos del observatorio.

   Lee fuentes públicas y escribe JSON estático en data/:
     data/catalog.json        catálogo actual: cada cifra lleva fuente, URL, fecha del dato y fecha de consulta
     data/changes.json        diferencias con la recogida anterior (novedades, cambios de precio, pesos nuevos)
     data/history/<fecha>.json instantánea compacta para series históricas

   Fuentes:
     OpenRouter  /api/v1/models y /endpoints   (sin clave)  precios, contexto, proveedores, velocidad por proveedor
     Hugging Face /api/models/<repo>           (sin clave)  existencia de pesos, licencia, fecha del repositorio
     Artificial Analysis /api/v2/data/llms/models (requiere AA_API_KEY) índices, velocidad y fecha de lanzamiento

   Reglas:
     - Ninguna cifra se inventa ni se rellena. Si una fuente no la da, el campo queda null («sin datos»).
     - Si una fuente falla, se conserva el último valor válido con su fecha de consulta original (stale: true).
     - Si falla OpenRouter, que es la base del catálogo, no se escribe nada.

   Uso: node scripts/collect.mjs            (red real)
        FIXTURES=dir node scripts/collect.mjs (respuestas grabadas, para pruebas) */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

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

const SOURCES = {
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/models', api: 'https://openrouter.ai/api/v1/models' },
  hf: { name: 'Hugging Face', url: 'https://huggingface.co/models', api: 'https://huggingface.co/api/models' },
  aa: { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/leaderboards/models', api: 'https://artificialanalysis.ai/api/v2/data/llms/models' },
  curated: { name: 'Curado manualmente', url: null }
};

const log = (...a) => console.log('[collect]', ...a);

async function readJSON(p, fallback = null) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}

async function getJSON(url, headers = {}) {
  if (FIXTURES) {
    const key = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 180) + '.json';
    const p = path.join(FIXTURES, key);
    if (!existsSync(p)) throw new Error(`fixture ausente: ${key}`);
    return JSON.parse(await readFile(p, 'utf8'));
  }
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'moloch-sh-observatorio/1.0 (+https://github.com/rolandojf-gif/moloch-sh)', ...headers } });
      if (res.status === 404) { const e = new Error(`404 ${url}`); e.status = 404; throw e; }
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (e.status === 404) throw e;
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
  return id.replace(/:(free|extended|beta|thinking|nitro|floor|online)$/, '');
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
    return (res.data && res.data.endpoints) || [];
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

/* ── Artificial Analysis ────────────────────────────────────────────────── */
async function loadAA() {
  if (!AA_KEY && !FIXTURES) { log('AA_API_KEY ausente: índices sin datos'); return null; }
  try {
    const res = await getJSON(SOURCES.aa.api, { 'x-api-key': AA_KEY });
    const rows = res.data || [];
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

function buildModel(m, lab, endpoints, hf, aaMatch, prev) {
  const orUrl = `https://openrouter.ai/${m.id}`;
  const createdISO = m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null;
  const author = m.id.split('/')[0];
  const hfId = m.hugging_face_id || null;

  // Pesos: abiertos sólo si hay repositorio público en Hugging Face enlazado por OpenRouter y la consulta lo confirma.
  let weights, license;
  if (hfId && hf && hf.ok && !hf.isPrivate) {
    const hfUrl = `https://huggingface.co/${hfId}`;
    weights = fact('abiertos', 'hf', hfUrl, hf.createdAt || TODAY, hf.gated ? { note: 'descarga con solicitud de acceso' } : {});
    license = fact(hf.license ? (hf.license === 'other' && hf.licenseName ? hf.licenseName : hf.license) : null, 'hf', hfUrl, TODAY);
  } else if (hfId && hf && !hf.ok && !hf.notFound && prev && prev.weights) {
    weights = { ...prev.weights, stale: true };
    license = prev.license ? { ...prev.license, stale: true } : fact(null, 'hf', null);
  } else if (!hfId) {
    weights = fact('cerrados', 'openrouter', orUrl, TODAY, { note: 'OpenRouter no enlaza pesos públicos' });
    license = fact('propietaria', 'openrouter', orUrl, TODAY, { note: 'inferido: sin pesos publicados' });
  } else {
    weights = fact(null, 'hf', `https://huggingface.co/${hfId}`, TODAY, { note: 'el repositorio enlazado no responde' });
    license = fact(null, 'hf', null);
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
      tps: fact(r.median_output_tokens_per_second || null, 'aa', aaUrl, TODAY, { note: 'mediana de AA para el proveedor de referencia del laboratorio' }),
      ttft: fact(r.median_time_to_first_token_seconds || null, 'aa', aaUrl),
      ttfa: fact(r.median_time_to_first_answer_token || null, 'aa', aaUrl, TODAY, { note: 'incluye el razonamiento previo a la respuesta' }),
      release: fact(r.release_date || null, 'aa', aaUrl, r.release_date || TODAY),
      blended: fact(r.pricing ? r.pricing.price_1m_blended_3_to_1 ?? null : null, 'aa', aaUrl, TODAY, { note: 'mezcla 3:1 entrada/salida de AA' })
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
        data: { weights: m.weights.v, in: m.price.in.v, out: m.price.out.v, ii: m.aa?.intelligence?.v ?? null, identity: m.identity } });
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
    const pb = m.aa?.intelligence?.v;
    if ((p.ii === null || p.ii === undefined) && pb !== null && pb !== undefined) {
      items.push({ kind: 'evaluacion', model: m.id, date: TODAY, src: { name: 'Artificial Analysis', url: m.aa.url, got: NOW_ISO },
        what: `${m.name}: primera evaluación independiente en Artificial Analysis (índice ${pb}).`, data: { ii: pb } });
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
  const scored = models.filter(m => m.aa?.intelligence?.v !== null && m.aa?.intelligence?.v !== undefined && m.identity === 'confirmada');
  const best = w => scored.filter(m => m.weights.v === w).sort((a, b) => b.aa.intelligence.v - a.aa.intelligence.v)[0] || null;
  const o = best('abiertos'), c = best('cerrados');
  return {
    open: o ? { id: o.id, ii: o.aa.intelligence.v } : null,
    closed: c ? { id: c.id, ii: c.aa.intelligence.v } : null
  };
}

function snapshot(models) {
  const out = {};
  for (const m of models) {
    out[m.id] = {
      n: m.name,
      w: m.weights.v === 'abiertos' ? 'o' : m.weights.v === 'cerrados' ? 'c' : null,
      in: m.price.in.v, out: m.price.out.v,
      ii: m.aa?.intelligence?.v ?? null, ci: m.aa?.coding?.v ?? null
    };
  }
  return out;
}

async function main() {
  const labs = await readJSON(path.join(DATA, 'curated/labs.json'), {});
  delete labs._doc;
  const overrides = (await readJSON(path.join(DATA, 'curated/overrides.json'), {})).aa || {};
  const curatedEvents = (await readJSON(path.join(DATA, 'curated/events.json'), { events: [] })).events || [];
  const prevCatalog = await readJSON(path.join(DATA, 'catalog.json'));
  const prevMap = new Map((prevCatalog ? prevCatalog.models : []).map(m => [m.id, m]));
  const curated = await readJSON(path.join(DATA, 'curated/sources.json'), {});

  let orModels;
  try { orModels = await loadOpenRouter(labs); }
  catch (e) { console.error('[collect] OpenRouter falló; no se escribe nada:', e.message); process.exit(2); }

  const aaRows = await loadAA();
  const status = {
    openrouter: { ok: true, got: NOW_ISO },
    hf: { ok: true, got: NOW_ISO, failed: 0 },
    aa: aaRows === null ? { ok: false, reason: 'sin clave de API' } : aaRows === undefined ? { ok: false, reason: 'la consulta falló; se conservan los valores anteriores', lastOk: prevCatalog?.status?.aa?.got || prevCatalog?.status?.aa?.lastOk || null } : { ok: true, got: NOW_ISO }
  };

  const models = [];
  for (const m of orModels) {
    const author = m.id.split('/')[0];
    const lab = labs[author];
    const prev = prevMap.get(m.id);
    const [endpoints, hf] = await Promise.all([
      loadEndpoints(m.id),
      (m.hugging_face_id && !lab.stealth) ? loadHF(m.hugging_face_id) : Promise.resolve(null)
    ]);
    if (hf && !hf.ok && !hf.notFound) status.hf.failed++;
    const aaMatch = aaRows === undefined ? 'keep' : matchAA(m, lab, aaRows, overrides);
    models.push(buildModel(m, lab, endpoints, hf, aaMatch, prev));
  }
  if (status.hf.failed) status.hf.ok = status.hf.failed < models.length / 4;

  models.sort((a, b) => (b.orCreated.v || '').localeCompare(a.orCreated.v || ''));

  // Instantánea del día e histórico
  await mkdir(path.join(DATA, 'history'), { recursive: true });
  const histFiles = (await readdir(path.join(DATA, 'history'))).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const earlier = histFiles.filter(f => f.slice(0, 10) < TODAY);
  const base = earlier.length ? await readJSON(path.join(DATA, 'history', earlier[earlier.length - 1])) : null;
  const snap = {
    date: TODAY, got: NOW_ISO,
    aaIndexVersion: curated.aaIndexVersion ?? null,
    leaders: leaders(models),
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
    method: {
      blended: 'Precio combinado = (3 × entrada + salida) / 4, en USD por millón de tokens, como Artificial Analysis.',
      weights: '«Abiertos» exige un repositorio público en Hugging Face enlazado por OpenRouter. Sin enlace, «cerrados». La licencia procede de la ficha de Hugging Face.',
      speed: 'La velocidad depende de quién sirve el modelo. Se muestra la mediana de Artificial Analysis cuando existe y, aparte, la de cada proveedor de OpenRouter en los últimos 30 minutos de la recogida.',
      window: `Entran los modelos de los laboratorios seguidos dados de alta en OpenRouter en los últimos ${WINDOW_DAYS} días.`
    },
    models,
    curatedEvents,
    history: histFiles.map(f => f.slice(0, 10))
  };

  await writeFile(path.join(DATA, 'catalog.json'), JSON.stringify(catalog, null, 1) + '\n');
  // Registro acumulado de acontecimientos detectados (precio, pesos, retiradas, primeras evaluaciones)
  const logPath = path.join(DATA, 'events-log.json');
  const evLog = await readJSON(logPath, { _doc: 'Acontecimientos detectados por el recolector al comparar recogidas sucesivas. Generado; no editar a mano.', events: [] });
  const keyOf = e => [e.kind, e.model, e.date, e.data?.field || ''].join('|');
  const known = new Set(evLog.events.map(keyOf));
  for (const e of changeItems) if (e.kind !== 'nuevo' && !known.has(keyOf(e))) { evLog.events.push(e); known.add(keyOf(e)); }
  evLog.events.sort((a, b) => b.date.localeCompare(a.date));
  await writeFile(logPath, JSON.stringify(evLog, null, 1) + '\n');
  await writeFile(path.join(DATA, 'changes.json'), JSON.stringify({ generated: NOW_ISO, since: baseDate, items: changeItems }, null, 1) + '\n');
  log(`escrito: ${models.length} modelos, ${changeItems.length} cambios, AA ${status.aa.ok ? 'ok' : status.aa.reason}`);
}

main().catch(e => { console.error(e); process.exit(1); });
