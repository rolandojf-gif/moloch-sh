/* Emparejamiento de nombres entre OpenRouter y Artificial Analysis (scripts/collect.mjs), aparte para poder probarlo. */

const QUALS = ['preview', 'instruct', 'chat', 'latest', 'exp', 'experimental'];
const QUAL_RE = /\b(preview|instruct|chat|latest|exp|experimental)\b/g;

/* Retira el nombre del propio laboratorio al principio del modelo («Tencent Hy4» → «Hy4») sólo si detrás queda el modelo. */
export function stripLab(s, lab = null) {
  const clean = String(s || '').trim();
  if (!lab) return clean;
  const raw = [lab.id, lab.aa_creator, String(lab.name || '').replace(/\s*\(.*?\)\s*/g, '').trim()]
    .filter(Boolean)
    .flatMap(x => [x, x.replace(/[-_]+/g, ' ')]);
  const prefs = [...new Set(raw.map(x => x.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const p of prefs) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s\\-_]+');
    const m = new RegExp(`^${esc}[\\s\\-_]+(.+)$`, 'i').exec(clean);
    if (m && /[a-z0-9]/i.test(m[1])) return m[1].trim();
  }
  return clean;
}

/* Normalización estricta (conserva calificadores como «preview», «exp», «chat») y laxa (los suprime). */
export const strictNorm = (s, lab = null) => stripLab(
  String(s || '').replace(/\(.*?\)/g, ' ').replace(/^[^:]+:\s*/, ''),
  lab
).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();

export const norm = (s, lab = null) => strictNorm(s, lab).replace(QUAL_RE, ' ').replace(/\s+/g, ' ').trim();

/* AA publica una fila por configuración de razonamiento («GPT-6 Sol (High)», «(Max, Default Fallback)»…). Se toma la de
   mayor índice entre ésas; las ediciones especiales («(Daybreak Blue, max)») sólo cuentan si no hay otra. */
export const AA_SETTING = /^(non-reasoning|reasoning|minimal|low|medium|high|xhigh|max)$/;
export const aaSetting = r => ((/\(([^)]*)\)\s*$/.exec(r.name || '') || [])[1] || '').split(',')[0].toLowerCase().trim();
export const aaBase = r => String(r?.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

function qualsOf(s) {
  const low = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const out = new Set();
  for (const q of QUALS) if (new RegExp(`\\b${q}\\b`).test(low)) out.add(q === 'experimental' ? 'exp' : q);
  return out;
}
function sameQuals(a, b) {
  if (a.size !== b.size) return false;
  for (const q of a) if (!b.has(q)) return false;
  return true;
}

export function matchAA(orModel, lab, aaRows, overrides = {}, creatorIds = {}) {
  if (!aaRows || !lab?.aa_creator) return null;
  if (Object.prototype.hasOwnProperty.call(overrides || {}, orModel.id)) {
    const slug = overrides[orModel.id];
    if (!slug) return null;
    const row = aaRows.find(r => r.slug === slug);
    return row ? { row, how: 'manual' } : null;
  }
  const target = norm(orModel.name, lab);
  if (!target) return null;
  const cid = creatorIds[lab.aa_creator];
  const cands = aaRows.filter(r => r.model_creator && (r.model_creator.slug ? r.model_creator.slug === lab.aa_creator : r.model_creator.id === cid));
  const exactAll = cands.filter(r => norm(r.name, lab) === target);
  const mq = qualsOf(`${orModel.name} ${orModel.id.split('/')[1] || ''}`);
  const exactQual = exactAll.filter(r => sameQuals(mq, qualsOf(`${aaBase(r)} ${r.slug}`)));
  const exact = exactQual.length ? exactQual : exactAll;
  const variants = exact.length ? exact : cands.filter(r => {
    const n = norm(r.name, lab);
    return n.startsWith(target + ' ') && !/\d/.test(n.slice(target.length));   // «gpt 5» no casa con «gpt 5.1»
  });
  if (!variants.length) return null;
  const plain = variants.filter(r => !aaSetting(r) || AA_SETTING.test(aaSetting(r)));
  const pool = plain.length ? plain : variants;
  const ii = r => (r.evaluations && r.evaluations.artificial_analysis_intelligence_index) ?? -1;
  const best = pool.slice().sort((a, b) => ii(b) - ii(a))[0];
  return { row: best, how: pool.length > 1 ? `configuración de mayor índice entre ${pool.length}` : exact.length ? 'nombre exacto' : 'variante', variants: pool.length };
}

/* Empareja el catálogo entero de OpenRouter con AA evitando que dos modelos compartan el mismo slug automático. */
function scorePair(m, lab, hit) {
  if (hit.how === 'manual') return 1e9;
  const r = hit.row;
  const ms = qualsOf(`${m.name} ${m.id.split('/')[1] || ''}`);
  const rs = qualsOf(`${aaBase(r)} ${r.slug}`);
  let shared = 0, extra = 0;
  for (const q of ms) if (rs.has(q)) shared++; else extra++;
  for (const q of rs) if (!ms.has(q)) extra++;
  const sExact = strictNorm(m.name, lab) === strictNorm(aaBase(r), lab) ? 1 : 0;
  const d1 = m.orCreated?.v || (m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null);
  const d2 = r.release_date || null;
  const dayDiff = d1 && d2 ? Math.abs((Date.parse(d1) - Date.parse(d2)) / 86400e3) : 9999;
  return shared * 1000 - extra * 1000 + sExact * 100 - Math.min(dayDiff, 99);
}

export function matchCatalogAA(orModels, labs = {}, aaRows, overrides = {}, creatorIds = {}) {
  const out = new Map((orModels || []).map(m => [m.id, null]));
  if (!aaRows) return out;
  const bySlug = new Map();
  for (const m of orModels || []) {
    const author = m.id.split('/')[0];
    const lab = labs[author] || m.lab;
    const hit = matchAA(m, lab, aaRows, overrides, creatorIds);
    if (!hit) continue;
    const key = hit.how === 'manual' ? `manual:${m.id}` : hit.row.slug;
    if (!bySlug.has(key)) bySlug.set(key, []);
    bySlug.get(key).push({ m, hit, score: scorePair(m, lab, hit) });
  }
  for (const arr of bySlug.values()) {
    arr.sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
    out.set(arr[0].m.id, arr[0].hit);
  }
  return out;
}

/* Modelos que Artificial Analysis ya puntúa y que aún no están en OpenRouter (acceso restringido o sólo en los productos del
   laboratorio). Entran en el catálogo marcados «sin API pública» (aaOnly) y cuentan como los demás. Sólo laboratorios
   seguidos (no anónimos), publicados en los últimos AA_ONLY_DAYS días, con índice de la versión vigente, y sólo si ninguna
   de sus configuraciones está ya emparejada y ningún modelo del catálogo del mismo laboratorio tiene un nombre equivalente:
   así no se duplica un modelo que está en OpenRouter pero no casa por nombre. overrides.aaSolo: { slug: null } descarta uno.
   Su id es el que previsiblemente tendrá en OpenRouter (autor/nombre); si llega con otro, el recolector lo enlaza por su
   puntuación de AA (preApi). */
export const slugify = s => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
/* Equivalentes: el mismo nombre, el del catálogo más largo (variante con sufijo: «Pro», «0902», «Preview»…) o el de AA más
   largo sólo con palabras sin cifras («Full») o con una fecha de versión («1019», «2026-10-19»): «GPT-6.1 Sol» no equivale
   a «GPT-6». Ante la duda se toman por el mismo modelo: es peor duplicarlo que dejarlo fuera. */
const DATE_TAG = /^(\d{4}|\d{6}|\d{8}|\d{4} \d{2} \d{2})$/;
export function sameModelName(aaName, catName, lab = null) {
  const a = norm(aaName, lab), b = norm(catName, lab);
  if (!a || !b) return false;
  if (a === b || b.startsWith(a + ' ')) return true;
  if (!a.startsWith(b + ' ')) return false;
  const rest = a.slice(b.length + 1);
  return !/\d/.test(rest) || DATE_TAG.test(rest);
}
export function aaOnlyCandidates(aaRows, models, labs, aaCreators, overrides, ignore, since, keep = new Set()) {
  const used = new Set([...models.map(m => m.aa?.slug), ...Object.values(overrides || {})].filter(Boolean));
  const authorsOf = new Map();   // id de creador en AA → autores de OpenRouter de ese laboratorio
  for (const [author, lab] of Object.entries(labs)) {
    const cid = lab?.aa_creator && aaCreators[lab.aa_creator];
    if (!cid || lab.stealth) continue;
    if (!authorsOf.has(cid)) authorsOf.set(cid, []);
    authorsOf.get(cid).push(author);
  }
  const groups = new Map();
  for (const r of aaRows || []) {
    const cid = r.model_creator?.id;
    const authors = authorsOf.get(cid);
    if (!authors || !aaBase(r)) continue;
    const lab = { ...labs[authors[0]], id: labs[authors[0]]?.id || authors[0] };
    const k = `${cid}|${norm(aaBase(r), lab)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const ii = r => r.evaluations?.artificial_analysis_intelligence_index ?? null;
  const out = [];
  for (const rows of groups.values()) {
    if (rows.some(r => used.has(r.slug) || Object.prototype.hasOwnProperty.call(ignore || {}, r.slug))) continue;
    const plain = rows.filter(r => !aaSetting(r) || AA_SETTING.test(aaSetting(r)));
    const best = (plain.length ? plain : rows).filter(r => ii(r) !== null).sort((a, b) => ii(b) - ii(a))[0];
    // Los que ya estaban en el catálogo sin API pública (keep: sus slugs de AA) siguen aunque salgan de la ventana.
    if (!best || !best.release_date || (best.release_date < since && !rows.some(r => keep.has(r.slug)))) continue;
    const authors = authorsOf.get(best.model_creator.id);
    const mine = models.filter(m => authors.includes(m.id.split('/')[0]));
    if (mine.some(m => sameModelName(aaBase(best), m.name, { ...labs[m.id.split('/')[0]], id: m.id.split('/')[0] }))) continue;
    // El autor con más modelos en el catálogo (un laboratorio puede publicar con más de un autor en OpenRouter).
    const author = authors.slice().sort((a, b) => mine.filter(m => m.id.startsWith(b + '/')).length - mine.filter(m => m.id.startsWith(a + '/')).length)[0];
    const id = `${author}/${slugify(aaBase(best))}`;
    if (models.some(m => m.id === id)) continue;
    out.push({ id, author, name: aaBase(best), row: best, variants: (plain.length ? plain : rows).length });
  }
  return out;
}

