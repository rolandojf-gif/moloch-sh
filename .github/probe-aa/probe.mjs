/* Sonda temporal: qué devuelve la API gratuita de Artificial Analysis y qué modelos recientes del catálogo cubre.
   El repositorio es público y sus registros también: no se imprimen puntuaciones, sólo estructura y cobertura. */
import { readFile } from 'node:fs/promises';
const KEY = process.env.AA_API_KEY;
if (!KEY) { console.log('AA_API_KEY ausente'); process.exit(0); }
const BASE = 'https://artificialanalysis.ai/api/v2';
const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/^[^:]+:\s*/, '').replace(/[^a-z0-9.]+/g, ' ')
  .replace(/\b(preview|instruct|chat|latest|exp|experimental)\b/g, ' ').replace(/\s+/g, ' ').trim();
const shape = (o, d = 0) => o && typeof o === 'object' && !Array.isArray(o) && d < 2
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v, d + 1)])) : Array.isArray(o) ? `array(${o.length})` : typeof o;
async function get(path) {
  const r = await fetch(BASE + path, { headers: { 'x-api-key': KEY } });
  const lim = ['x-ratelimit-limit', 'x-ratelimit-remaining'].map(h => `${h}=${r.headers.get(h)}`).join(' ');
  console.log(`GET ${path} → HTTP ${r.status} ${lim}`);
  const txt = await r.text();
  if (!r.ok) { console.log(txt.slice(0, 300).split(KEY).join('***')); return null; }
  return JSON.parse(txt);
}
function describe(label, data) {
  const filled = {};
  for (const m of data) for (const [k, v] of Object.entries(m)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [k2, v2] of Object.entries(v)) if (v2 !== null && v2 !== undefined) filled[`${k}.${k2}`] = (filled[`${k}.${k2}`] || 0) + 1; }
    else if (v !== null && v !== undefined) filled[k] = (filled[k] || 0) + 1;
  }
  const dates = data.map(m => m.release_date).filter(Boolean).sort();
  console.log(`\n[${label}] modelos: ${data.length} | fechas de lanzamiento: de ${dates[0]} a ${dates.at(-1)} | desde 1 oct 2026: ${dates.filter(d => d >= '2026-10-01').length}`);
  console.log(`[${label}] campos con valor:`, JSON.stringify(filled));
}

// 1) Endpoint gratuito, con todas sus páginas.
const free = [];
let page = 1, pag = null;
while (page <= 6) {
  const j = await get(`/language/models/free?page=${page}`);
  if (!j) break;
  if (page === 1) console.log('claves:', Object.keys(j).join(', '), '| tier:', j.tier, '| versión del índice:', j.intelligence_index_version ?? 'no consta');
  pag = j.pagination; console.log('paginación:', JSON.stringify(pag));
  const before = free.length;
  for (const m of j.data || []) if (!free.some(x => x.id === m.id)) free.push(m);
  if (free.length === before || !(pag?.has_more ?? pag?.next_page ?? (pag?.total_pages > page))) break;
  page++;
}
describe('gratuito', free);
if (free[0]) console.log('[gratuito] estructura de model_creator:', JSON.stringify(shape(free[0].model_creator)));

// 2) Endpoint antiguo (data/llms/models), que también acepta la clave.
const j2 = await get('/data/llms/models');
const legacy = j2?.data || [];
if (j2) { console.log('claves:', Object.keys(j2).join(', '), '| status:', j2.status, '| prompt_options:', JSON.stringify(shape(j2.prompt_options))); describe('antiguo', legacy); }

// 3) Cobertura de los modelos recientes del catálogo.
const cat = JSON.parse(await readFile('data/catalog.json', 'utf8'));
const labs = JSON.parse(await readFile('data/curated/labs.json', 'utf8'));
const recent = cat.models.filter(m => m.identity === 'confirmada' && (m.orCreated?.v || '') >= '2026-09-20').sort((a, b) => b.orCreated.v.localeCompare(a.orCreated.v));
const creatorIds = new Map();  // slug del creador (antiguo) → id del creador, para cruzar con el gratuito, que no trae slug
for (const r of legacy) if (r.model_creator?.slug) creatorIds.set(r.model_creator.slug, r.model_creator.id);
const sameCreator = (r, slug) => r.model_creator?.slug ? r.model_creator.slug === slug : r.model_creator?.id === creatorIds.get(slug);
const find = (rows, slug, t) => rows.find(r => sameCreator(r, slug) && (norm(r.name) === t || norm(r.name).startsWith(t + ' ')));
const tot = { free: 0, freeIdx: 0, legacy: 0, legacyIdx: 0, epoch: 0 };
const hasIdx = r => r?.evaluations?.artificial_analysis_intelligence_index != null;
console.log(`\nCobertura de los ${recent.length} modelos del catálogo llegados a OpenRouter desde el 20 sep 2026:`);
for (const m of recent) {
  const slug = labs[m.lab.id]?.aa_creator, t = norm(m.name);
  const f = find(free, slug, t), l = find(legacy, slug, t), ep = m.epoch?.eci?.v != null;
  if (f) tot.free++; if (hasIdx(f)) tot.freeIdx++; if (l) tot.legacy++; if (hasIdx(l)) tot.legacyIdx++; if (ep) tot.epoch++;
  const st = r => r ? `sí${hasIdx(r) ? ', con índice' : ', sin índice'} (${r.slug})` : 'no';
  let line = `${m.orCreated.v} | ${m.name} | gratuito: ${st(f)} | antiguo: ${st(l)} | Epoch: ${ep ? 'sí' : 'no'}`;
  if (!f && !l) {
    const cands = [...free, ...legacy].filter(r => sameCreator(r, slug) && (r.release_date || '') >= '2026-09-01').map(r => r.name);
    line += ` | nombres de AA del mismo creador desde sep: ${[...new Set(cands)].join('; ') || 'ninguno'}`;
  }
  console.log(line);
}
console.log(`\nTotal de ${recent.length}: gratuito ${tot.free} (con índice ${tot.freeIdx}); antiguo ${tot.legacy} (con índice ${tot.legacyIdx}); Epoch ${tot.epoch}.`);
