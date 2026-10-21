/* Sonda temporal: qué devuelve la API gratuita de Artificial Analysis y qué modelos recientes del catálogo cubre.
   El repositorio es público y sus registros también: no se imprimen puntuaciones, sólo estructura y cobertura. */
import { readFile } from 'node:fs/promises';
const KEY = process.env.AA_API_KEY;
if (!KEY) { console.log('AA_API_KEY ausente'); process.exit(0); }
const URLS = ['https://artificialanalysis.ai/api/v2/language/models/free', 'https://artificialanalysis.ai/api/v2/language/models', 'https://artificialanalysis.ai/api/v2/data/llms/models'];
const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/^[^:]+:\s*/, '').replace(/[^a-z0-9.]+/g, ' ')
  .replace(/\b(preview|instruct|chat|latest|exp|experimental)\b/g, ' ').replace(/\s+/g, ' ').trim();
const shape = (o, d = 0) => o && typeof o === 'object' && !Array.isArray(o) && d < 2
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v, d + 1)])) : Array.isArray(o) ? `array(${o.length})` : typeof o;
let rows = null;
for (const u of URLS) {
  const r = await fetch(u, { headers: { 'x-api-key': KEY } });
  const lim = ['x-ratelimit-limit', 'x-ratelimit-remaining'].map(h => `${h}=${r.headers.get(h)}`).join(' ');
  console.log(`\n== ${u}\nHTTP ${r.status} ${lim}`);
  const txt = await r.text();
  if (!r.ok) { console.log(txt.slice(0, 300).split(KEY).join('***')); continue; }
  const j = JSON.parse(txt);
  console.log('claves:', Object.keys(j).join(', '), '| versión del índice:', j.intelligence_index_version ?? 'no consta');
  const data = j.data || [];
  console.log('modelos:', data.length);
  if (data[0]) console.log('estructura de un modelo:', JSON.stringify(shape(data[0])));
  const filled = {};
  for (const m of data) for (const [k, v] of Object.entries(m)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [k2, v2] of Object.entries(v)) if (v2 !== null && v2 !== undefined) filled[`${k}.${k2}`] = (filled[`${k}.${k2}`] || 0) + 1; }
    else if (v !== null && v !== undefined) filled[k] = (filled[k] || 0) + 1;
  }
  console.log('campos con valor (n.º de modelos):', JSON.stringify(filled));
  const dates = data.map(m => m.release_date).filter(Boolean).sort();
  console.log('fechas de lanzamiento: de', dates[0], 'a', dates[dates.length - 1], '| desde 1 oct 2026:', dates.filter(d => d >= '2026-10-01').length);
  if (!rows) rows = data;
}
if (!rows) process.exit(0);
const cat = JSON.parse(await readFile('data/catalog.json', 'utf8'));
const labs = JSON.parse(await readFile('data/curated/labs.json', 'utf8'));
const recent = cat.models.filter(m => m.identity === 'confirmada' && (m.orCreated?.v || '') >= '2026-09-20').sort((a, b) => b.orCreated.v.localeCompare(a.orCreated.v));
let inAA = 0, inEp = 0;
console.log(`\nCobertura de los ${recent.length} modelos del catálogo llegados a OpenRouter desde el 20 sep 2026 (AA por creador y nombre normalizado):`);
for (const m of recent) {
  const creator = labs[m.lab.id]?.aa_creator, t = norm(m.name);
  const hit = rows.find(r => (r.model_creator?.slug === creator) && (norm(r.name) === t || norm(r.name).startsWith(t + ' ')));
  const ep = m.epoch?.eci?.v != null;
  if (hit) inAA++; if (ep) inEp++;
  console.log(`${m.orCreated.v} | ${m.name} | AA: ${hit ? `sí (${hit.slug})` : 'no'} | Epoch: ${ep ? 'sí' : 'no'}`);
}
console.log(`\nTotal: AA ${inAA} de ${recent.length}; Epoch ${inEp} de ${recent.length}.`);
