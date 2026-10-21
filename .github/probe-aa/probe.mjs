/* Sonda temporal: creadores de Artificial Analysis (id, nombre y slug) para emparejar con data/curated/labs.json. */
import { readFile } from 'node:fs/promises';
const KEY = process.env.AA_API_KEY;
if (!KEY) { console.log('AA_API_KEY ausente'); process.exit(0); }
const get = async p => { const r = await fetch('https://artificialanalysis.ai/api/v2' + p, { headers: { 'x-api-key': KEY } }); console.log(p, r.status); return r.ok ? r.json() : null; };
const free = [];
for (let page = 1; page <= 6; page++) { const j = await get(`/language/models/free?page=${page}`); if (!j) break; free.push(...j.data); if (!j.pagination?.has_more) break; }
const legacy = (await get('/data/llms/models'))?.data || [];
const slugOf = new Map(legacy.map(r => [r.model_creator.id, r.model_creator.slug]));
const sameId = free.filter(r => legacy.some(l => l.id === r.id)).length;
console.log(`modelos gratuito ${free.length}, antiguo ${legacy.length}, mismos id de modelo: ${sameId}`);
const cr = new Map();
for (const r of free) { const k = r.model_creator.id; const c = cr.get(k) || { name: r.model_creator.name, slug: slugOf.get(k) || '?', n: 0, last: '' }; c.n++; if ((r.release_date || '') > c.last) c.last = r.release_date; cr.set(k, c); }
const labs = JSON.parse(await readFile('data/curated/labs.json', 'utf8'));
const wanted = new Set(Object.values(labs).map(l => l && l.aa_creator).filter(Boolean));
console.log('creador | slug | id | modelos | último lanzamiento | seguido en labs.json');
for (const [id, c] of [...cr].sort((a, b) => b[1].last.localeCompare(a[1].last))) console.log(`${c.name} | ${c.slug} | ${id} | ${c.n} | ${c.last} | ${wanted.has(c.slug) ? 'sí' : ''}`);
console.log('aa_creator de labs.json sin creador en AA:', [...wanted].filter(s => ![...cr.values()].some(c => c.slug === s)).join(', ') || 'ninguno');
const ex = free.filter(r => /^gpt-6-sol|^claude-haiku-5-5/.test(r.slug)).map(r => `${r.slug} «${r.name}» ${r.release_date}`);
console.log('ejemplos de variantes:', ex.join(' | '));
