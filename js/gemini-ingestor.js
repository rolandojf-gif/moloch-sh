/* MOLOCH.SH v2.6 — daily-signal ingestor.
   Two engines produce the same normalized shape:
   - parseWithGemini(): Gemini generateContent with a JSON response schema.
   - parseLocal(): deterministic regex parser (structured PROMPT v2.0 lines + free Spanish text).
   applyParsed() diffs the result against state and mutates it. */

const KEY_STORAGE = 'moloch.gemini.key';
const MODEL_STORAGE = 'moloch.gemini.model';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

function store(k, v) {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); return true; } catch { return false; }
}
function read(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}

export function loadGeminiConfig() {
  return { key: read(KEY_STORAGE) || '', model: read(MODEL_STORAGE) || DEFAULT_GEMINI_MODEL };
}

export function saveGeminiConfig({ key, model }) {
  const okKey = store(KEY_STORAGE, key ? key.trim() : null);
  const okModel = store(MODEL_STORAGE, (model || DEFAULT_GEMINI_MODEL).trim().replace(/^models\//, ''));
  return okKey && okModel;
}

export function clearGeminiConfig() {
  store(KEY_STORAGE, null);
  store(MODEL_STORAGE, null);
}

/* ── Matching ─────────────────────────────────────────────────────────────── */

const compiled = new WeakMap();
function patternsOf(model) {
  if (!compiled.has(model)) {
    const list = (model.match || []).map(p => new RegExp(p, 'i'));
    list.push(new RegExp(escapeRe(model.name), 'i'));
    if (model.short) list.push(new RegExp(escapeRe(model.short), 'i'));
    if (model.alias) list.push(new RegExp(escapeRe(model.alias), 'i'));
    compiled.set(model, list);
  }
  return compiled.get(model);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* Most specific match wins: score = length of the matched substring. */
export function matchModel(text, models) {
  let best = null, bestLen = 0;
  for (const m of models) {
    for (const re of patternsOf(m)) {
      const hit = text.match(re);
      if (hit && hit[0].length > bestLen) { best = m; bestLen = hit[0].length; }
    }
  }
  return best;
}

function modelsInLine(line, models) {
  return models.filter(m => patternsOf(m).some(re => re.test(line)));
}

/* ── Local deterministic parser ───────────────────────────────────────────── */

const n = s => parseFloat(String(s).replace(',', '.').replace('−', '-').replace(/\s/g, ''));
const RX = {
  pair: /\$\s?(\d+(?:[.,]\d+)?)\s*\/\s*\$?\s?(\d+(?:[.,]\d+)?)(?!\s*(?:tarea|task))/i,
  costTask: /(?:coste\s*\/\s*tarea|coste\s+por\s+tarea|cost\s*(?:\/|per)\s*task)\s*:?\s*\$?\s?(\d+(?:[.,]\d+)?)|\$\s?(\d+(?:[.,]\d+)?)\s*\/\s*(?:tarea|task)/i,
  aa: /\bAA(?:\s*v[\d.]+)?\s*(?:score|index|índice)?\s*:?\s*(\d{2}(?:[.,]\d+)?)/i,
  vol: /(\d+(?:[.,]\d+)?)\s*T\s*tok/i,
  delta: /tok[^|]*?([+\-−]\s?\d+(?:[.,]\d+)?)\s*%/i,
  cache: /cache(?:[\s-]*read)?\s*:?\s*\$\s?(\d+(?:[.,]\d+)?)/i,
  rotation: /\b(PROMOTED|ACTIVE|WATCHLIST|PROMOVIDO|ACTIVO|VIGILANCIA)\b/i,
  threshold: /(?:umbral\s*:?\s*|>\s*|encima\s+de\s+|above\s+)(\d+)\s*K/i,
  date: /(\d{4}-\d{2}-\d{2})/,
  sev: /\bSEV(?:ERIDAD)?\s*:?\s*([1-5])\b/i,
  thesis: /TESIS\s*:?\s*(CONFIRMED|WEAKENED|REJECTED|CONFIRMADA|DEBILITADA|RECHAZADA)/i,
  valley: /\b(valle|valley|off-peak|descuento nocturno)\b/i,
  cliffWord: /\b(recargo|surcharge|cliff|precipicio|penalizaci[oó]n)\b/i,
  incidentWord: /\b(desenmascar\w*|unmask\w*|swap|silencios\w*|lanza\w*|launch\w*|promo\w*|rug[- ]?pull|retirad\w*|deprecat\w*|degradaci[oó]n|incidente)\b/i,
  bank: /^BANCO\s*:/i
};

const ROT_MAP = { PROMOVIDO: 'PROMOTED', ACTIVO: 'ACTIVE', VIGILANCIA: 'WATCHLIST' };
const THESIS_MAP = { CONFIRMADA: 'CONFIRMED', DEBILITADA: 'WEAKENED', RECHAZADA: 'REJECTED' };

function extractFields(seg) {
  const f = {};
  const cm = seg.match(RX.cache);
  const segNoCache = cm ? seg.replace(cm[0], ' ') : seg;
  const pm = segNoCache.match(RX.pair);
  if (pm) { f.priceIn = n(pm[1]); f.priceOut = n(pm[2]); }
  if (cm) f.cacheRead = n(cm[1]);
  const ct = seg.match(RX.costTask);
  if (ct) f.costTask = n(ct[1] ?? ct[2]);
  const aa = seg.match(RX.aa);
  if (aa) f.aa = n(aa[1]);
  const v = seg.match(RX.vol);
  if (v) f.volumeT = n(v[1]);
  const d = seg.match(RX.delta);
  if (d) f.deltaPct = n(d[1]);
  const r = seg.match(RX.rotation);
  if (r) { const k = r[1].toUpperCase(); f.rotation = ROT_MAP[k] || k; }
  return f;
}

function guessBlock(name) {
  return /(xiaomi|mimo|deepseek|minimax|z\.ai|glm|qwen|kimi|moonshot|ernie|baidu|hunyuan|tencent|stepfun|bytedance|doubao|open|mit)/i.test(name) ? 'open' : 'us';
}

function sevFromText(t) {
  if (/(desenmascar|unmask|precipicio|cliff|recargo|rug)/i.test(t)) return 5;
  if (/(swap|silencios|degradaci|retirad|deprecat)/i.test(t)) return 4;
  if (/(promo|subsid)/i.test(t)) return 3;
  return 2;
}

function tagsFromText(t) {
  const tags = [];
  if (/(desenmascar|unmask|stealth)/i.test(t)) tags.push('STEALTH');
  if (/(swap|silencios)/i.test(t)) tags.push('SILENT SWAP');
  if (/(recargo|cliff|precipicio)/i.test(t)) tags.push('BILLING TRAP');
  if (/(promo|subsid|rug)/i.test(t)) tags.push('SUBSIDY');
  if (/(lanza|launch)/i.test(t)) tags.push('LAUNCH');
  if (!tags.length) tags.push('SIGNAL');
  return tags;
}

export function parseLocal(text, models, today) {
  const out = { engine: 'LOCAL-DETERMINISTIC', models: [], incidents: [], banks: [], thesis: null, summary: '', lines: 0 };
  const byKey = new Map();
  const push = (entry) => {
    const key = entry.id || entry.name.toLowerCase();
    if (byKey.has(key)) Object.assign(byKey.get(key), entry, { fields: { ...byKey.get(key).fields, ...entry.fields } });
    else { byKey.set(key, entry); out.models.push(entry); }
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    out.lines++;

    const th = line.match(RX.thesis);
    if (th) { const k = th[1].toUpperCase(); out.thesis = THESIS_MAP[k] || k; continue; }

    if (RX.bank.test(line)) {
      const tool = /codex/i.test(line) ? 'codex' : /claude/i.test(line) ? 'claude-code' : null;
      const h = line.match(/RESET\s*:?\s*(\d+(?:[.,]\d+)?)\s*h/i);
      const q = line.match(/CUOTA\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/i);
      if (tool) out.banks.push({ tool, resetHours: h ? n(h[1]) : null, quotaPct: q ? n(q[1]) : null });
      continue;
    }

    if (/^INCIDENTE\s*:/i.test(line)) {
      const parts = line.replace(/^INCIDENTE\s*:\s*/i, '').split('|').map(s => s.trim());
      const date = (parts.find(p => RX.date.test(p)) || today).match(RX.date)?.[1] || today;
      const sevPart = parts.find(p => RX.sev.test(p));
      const rest = parts.filter(p => !RX.date.test(p) && !RX.sev.test(p));
      const title = rest[0] || 'Incidente sin título';
      out.incidents.push({ date, sev: sevPart ? +sevPart.match(RX.sev)[1] : sevFromText(line), title, detail: rest.slice(1).join(' · '), tags: tagsFromText(line) });
      continue;
    }

    if (/^RECARGO\s*:/i.test(line)) {
      const parts = line.replace(/^RECARGO\s*:\s*/i, '').split('|').map(s => s.trim());
      const m = matchModel(parts[0], models);
      const thr = line.match(RX.threshold) || line.match(/(\d+)\s*K/i);
      const pm = line.match(RX.pair);
      if (m && thr && pm) push({ id: m.id, name: m.name, fields: { cliffThresholdK: n(thr[1]), cliffPriceIn: n(pm[1]), cliffPriceOut: n(pm[2]) } });
      continue;
    }

    if (/^MODELO\s*:/i.test(line)) {
      const segs = line.replace(/^MODELO\s*:\s*/i, '').split('|').map(s => s.trim());
      const name = segs[0];
      const m = matchModel(name, models);
      push({ id: m ? m.id : null, name: m ? m.name : name, block: m ? m.block : guessBlock(name), fields: extractFields(segs.slice(1).join(' | ')) });
      continue;
    }

    /* Free text: only lines that name exactly one known model mutate it. */
    const hits = modelsInLine(line, models);
    if (hits.length === 1) {
      const best = hits[0];
      const pm = line.match(RX.pair);
      if (RX.cliffWord.test(line) && pm) {
        const thr = line.match(RX.threshold);
        push({ id: best.id, name: best.name, fields: { cliffThresholdK: thr ? n(thr[1]) : 100, cliffPriceIn: n(pm[1]), cliffPriceOut: n(pm[2]) } });
      } else if (RX.valley.test(line) && pm) {
        push({ id: best.id, name: best.name, fields: { valleyIn: n(pm[1]), valleyOut: n(pm[2]) } });
      } else {
        const f = extractFields(line);
        if (Object.keys(f).length) push({ id: best.id, name: best.name, fields: f });
      }
    }
    if (RX.incidentWord.test(line) && !RX.valley.test(line)) {
      const date = line.match(RX.date)?.[1] || today;
      out.incidents.push({ date, sev: line.match(RX.sev) ? +line.match(RX.sev)[1] : sevFromText(line), title: line.length > 110 ? line.slice(0, 107) + '…' : line, detail: line.length > 110 ? line : '', tags: tagsFromText(line) });
    }
  }
  out.summary = `${out.lines} líneas · ${out.models.length} modelos · ${out.incidents.length} incidentes${out.thesis ? ' · tesis ' + out.thesis : ''}`;
  return out;
}

/* ── Gemini Flash engine ──────────────────────────────────────────────────── */

const NUM = { type: 'NUMBER', nullable: true };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    models: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          block: { type: 'STRING', enum: ['open', 'us'], nullable: true },
          priceIn: NUM, priceOut: NUM, cacheRead: NUM, aa: NUM, costTask: NUM,
          volumeT: NUM, deltaPct: NUM,
          rotation: { type: 'STRING', enum: ['ACTIVE', 'PROMOTED', 'WATCHLIST'], nullable: true },
          cliffThresholdK: NUM, cliffPriceIn: NUM, cliffPriceOut: NUM,
          valleyIn: NUM, valleyOut: NUM
        },
        required: ['name']
      }
    },
    incidents: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' },
          severity: { type: 'INTEGER' },
          title: { type: 'STRING' },
          detail: { type: 'STRING' },
          tags: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['date', 'severity', 'title']
      }
    },
    banks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          tool: { type: 'STRING', enum: ['codex', 'claude-code'] },
          resetHours: NUM, quotaPct: NUM
        },
        required: ['tool']
      }
    },
    thesis: { type: 'STRING', enum: ['CONFIRMED', 'WEAKENED', 'REJECTED', 'UNKNOWN'] },
    summary: { type: 'STRING' }
  },
  required: ['models', 'incidents', 'thesis', 'summary']
};

const SYSTEM_PROMPT = `Eres el extractor de MOLOCH.SH. Recibes un informe diario en español sobre precios y uso de LLMs.
Devuelve SOLO JSON conforme al esquema. Reglas:
- Extrae únicamente cifras escritas explícitamente en el texto. Si un campo no aparece, devuelve null. Nunca inventes ni completes.
- Precios en USD por 1M tokens. priceIn/priceOut son el precio estándar (pico). Si el texto habla de un tramo valle/off-peak, usa valleyIn/valleyOut.
- Si el texto describe un recargo por contexto (p. ej. ">100K"), usa cliffThresholdK y cliffPriceIn/cliffPriceOut; no lo pongas en priceIn/priceOut.
- volumeT en billones (T) de tokens por semana; deltaPct con signo.
- name: usa el nombre canónico del catálogo si el modelo ya existe.
- incidents: eventos (lanzamientos, swaps silenciosos, desenmascaramientos, recargos, fin de promos). date en AAAA-MM-DD; si no hay fecha usa la fecha de hoy indicada. severity 1-5.
- thesis: CONFIRMED/WEAKENED/REJECTED si el texto la declara; si no, UNKNOWN.`;

export async function parseWithGemini(text, models, cfg, today, { signal } = {}) {
  const slug = (cfg.model || DEFAULT_GEMINI_MODEL).trim().replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(slug)}:generateContent`;
  const catalog = models.map(m => `${m.name}${m.alias ? ' (alias ' + m.alias + ')' : ''}`).join('; ');
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: `FECHA DE HOY: ${today}\nCATÁLOGO: ${catalog}\n\nINFORME:\n${text}` }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg += ` · ${j?.error?.message || ''}`; } catch { /* non-JSON error body */ }
    throw new Error(msg.slice(0, 280));
  }
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if (!txt) throw new Error(`Respuesta vacía (finishReason: ${data?.candidates?.[0]?.finishReason || 'N/D'})`);
  const json = JSON.parse(txt);
  return normalizeGemini(json, models, today, slug);
}

function normalizeGemini(json, models, today, slug) {
  const out = { engine: `GEMINI · ${slug}`, models: [], incidents: [], banks: [], thesis: null, summary: json.summary || '', lines: 0 };
  const keys = ['priceIn', 'priceOut', 'cacheRead', 'aa', 'costTask', 'volumeT', 'deltaPct', 'rotation', 'cliffThresholdK', 'cliffPriceIn', 'cliffPriceOut', 'valleyIn', 'valleyOut'];
  for (const gm of json.models || []) {
    if (!gm || !gm.name) continue;
    const m = matchModel(gm.name, models);
    const fields = {};
    for (const k of keys) if (gm[k] !== null && gm[k] !== undefined && gm[k] !== '') fields[k] = gm[k];
    out.models.push({ id: m ? m.id : null, name: m ? m.name : gm.name, block: m ? m.block : (gm.block || guessBlock(gm.name)), fields });
  }
  for (const inc of json.incidents || []) {
    if (!inc || !inc.title) continue;
    const date = RX.date.test(inc.date || '') ? inc.date.match(RX.date)[1] : today;
    out.incidents.push({ date, sev: Math.min(5, Math.max(1, Math.round(inc.severity || 2))), title: inc.title, detail: inc.detail || '', tags: (inc.tags && inc.tags.length ? inc.tags : tagsFromText(inc.title)).map(t => String(t).toUpperCase()) });
  }
  for (const b of json.banks || []) if (b && b.tool) out.banks.push({ tool: b.tool, resetHours: b.resetHours ?? null, quotaPct: b.quotaPct ?? null });
  if (json.thesis && json.thesis !== 'UNKNOWN') out.thesis = json.thesis;
  return out;
}

/* ── Apply: diff + mutate ─────────────────────────────────────────────────── */

const same = (a, b) => (a === null || a === undefined) ? (b === null || b === undefined) : Math.abs(a - b) < 1e-9;

export function applyParsed(state, parsed, makeId) {
  const report = { mutations: [], confirmed: 0, newModels: [], incidents: [], duplicates: 0, banks: [], thesis: null };
  const set = (m, field, label, from, to, assign) => {
    if (typeof to === 'number' && !Number.isFinite(to)) return;
    if (typeof from === 'number' || typeof to === 'number' ? same(from, to) : from === to) { report.confirmed++; return; }
    assign();
    report.mutations.push({ id: m.id, name: m.short || m.name, field: label, from, to });
  };

  for (const pm of parsed.models) {
    let m = pm.id ? state.models.find(x => x.id === pm.id) : null;
    const f = pm.fields || {};
    if (!m) {
      if (!Number.isFinite(f.priceIn) && !Number.isFinite(f.aa) && !Number.isFinite(f.volumeT)) continue;
      m = {
        id: makeId(pm.name), name: pm.name, short: pm.name, vendor: pm.name.split(/\s+/)[0], block: pm.block || guessBlock(pm.name),
        license: null, arch: 'N/D · añadido por ingesta', ctxMax: null, aa: null,
        price: { in: null, out: null, cache: null }, costTask: null, volume: null, volRank: null, delta: null,
        quant: 'Ingestado ' + parsed.engine, silicon: '—', rotation: 'WATCHLIST', cot: 1.0, compressed: false,
        thirdParty: (pm.block || guessBlock(pm.name)) === 'open', scope: false, color: '#E0E0E0', alias: null,
        match: [escapeRe(pm.name)], ingested: true
      };
      state.models.push(m);
      report.newModels.push(m.name);
    }
    if ('priceIn' in f) set(m, 'price.in', '$/1M in', m.price.in, f.priceIn, () => { m.price.in = f.priceIn; });
    if ('priceOut' in f) set(m, 'price.out', '$/1M out', m.price.out, f.priceOut, () => { m.price.out = f.priceOut; });
    if ('cacheRead' in f) set(m, 'price.cache', 'cache read', m.price.cache, f.cacheRead, () => { m.price.cache = f.cacheRead; });
    if ('aa' in f) set(m, 'aa', 'AA score', m.aa, f.aa, () => { m.aa = f.aa; });
    if ('costTask' in f) set(m, 'costTask', 'coste/tarea', m.costTask, f.costTask, () => { m.costTask = f.costTask; });
    if ('volumeT' in f) set(m, 'volume', 'T tok/sem', m.volume, f.volumeT, () => { m.volume = f.volumeT; });
    if ('deltaPct' in f) set(m, 'delta', 'Δ volumen %', m.delta, f.deltaPct, () => { m.delta = f.deltaPct; });
    if ('rotation' in f) set(m, 'rotation', 'rotación', m.rotation, f.rotation, () => { m.rotation = f.rotation; });
    if ('valleyIn' in f && 'valleyOut' in f) {
      const cur = m.valley || { in: null, out: null };
      set(m, 'valley.in', 'valle in', cur.in, f.valleyIn, () => { m.valley = { ...(m.valley || {}), in: f.valleyIn, out: m.valley?.out ?? f.valleyOut }; });
      set(m, 'valley.out', 'valle out', m.valley?.out ?? null, f.valleyOut, () => { m.valley = { ...(m.valley || {}), out: f.valleyOut }; });
    }
    if ('cliffPriceIn' in f && Number.isFinite(m.price.in) && m.price.in > 0) {
      const thr = (f.cliffThresholdK || 100) * 1000;
      const mult = Math.round(f.cliffPriceIn / m.price.in * 100) / 100;
      const cur = m.cliff || { threshold: null, mult: null };
      set(m, 'cliff.threshold', 'umbral recargo', cur.threshold, thr, () => { m.cliff = { ...(m.cliff || {}), threshold: thr, mult: m.cliff?.mult ?? mult }; });
      set(m, 'cliff.mult', 'multiplicador recargo', m.cliff?.mult ?? null, mult, () => { m.cliff = { ...(m.cliff || {}), threshold: m.cliff?.threshold ?? thr, mult }; });
    }
  }

  for (const inc of parsed.incidents) {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim().slice(0, 42);
    const dup = state.incidents.find(x => x.date === inc.date && (norm(x.title) === norm(inc.title) || norm(x.title).slice(0, 24) === norm(inc.title).slice(0, 24)));
    if (dup) { report.duplicates++; continue; }
    const entry = { id: makeId('inc-' + inc.date), date: inc.date, dateLabel: null, sev: inc.sev, title: inc.title, detail: inc.detail, tags: inc.tags, source: parsed.engine };
    state.incidents.push(entry);
    report.incidents.push(entry);
  }

  for (const b of parsed.banks) {
    const bank = state.bank.tools[b.tool];
    if (!bank) continue;
    if (Number.isFinite(b.resetHours)) bank.hours = Math.min(168, Math.max(1, Math.round(b.resetHours)));
    if (Number.isFinite(b.quotaPct)) bank.quota = Math.min(100, Math.max(0, Math.round(b.quotaPct)));
    report.banks.push(b.tool);
  }

  if (parsed.thesis) {
    if (state.thesis !== parsed.thesis) report.mutations.push({ id: 'thesis', name: 'TESIS', field: 'estado', from: state.thesis, to: parsed.thesis });
    else report.confirmed++;
    state.thesis = parsed.thesis;
    report.thesis = parsed.thesis;
  }
  return report;
}
