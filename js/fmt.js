/* Formato y procedencia. Toda cifra visible pasa por fact() para llevar su fuente. */

import { esc, t, tn, tr, L, lang } from './i18n.js';
import * as LC from './locale.js';
export { esc };

const SRC_ABBR = { openrouter: 'OR', aa: 'AA', hf: 'HF', epoch: 'EP', metr: 'METR', curated: 'CUR' };
let SOURCES = {};
export function setSources(s) { SOURCES = s || {}; }

/* Ordinal: «2.º» / «2nd». */
export const ord = n => lang() === 'en' ? `${n}${[, 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n % 100 / 10) === 1 ? 0 : n % 10] || 'th'}` : `${n}.º`;
/* Fuente RSS del parte diario en el idioma de la página. */
export const rssUrl = () => lang() === 'en' ? 'data/parte.en.xml' : 'data/parte.xml';
/* Comillas del idioma: «así» en español y “así” en inglés (británico). */
export const quote = s => lang() === 'en' ? `“${s}”` : `«${s}»`;
export const nd = () => `<span class="nd">${t('sin datos')}</span>`;
/* Artificial Analysis: sus datos se publican con su permiso por escrito (data/curated/permisos.json), citándolos con enlace. */
export const AA_LINK = '<a href="https://artificialanalysis.ai" target="_blank" rel="noopener">Artificial Analysis</a>';
export const aaIndexName = v => t('índice de inteligencia de Artificial Analysis{v}', { v: v ? ` v${v}` : '' });

/* Idioma de fechas y números, en un solo sitio. Los formateadores se crean una vez y se reutilizan: crear uno en cada
   llamada (toLocaleDateString / toLocaleString con opciones) costaba unos 3 s de CPU al cargar en un móvil lento. */
export const locale = () => LC.LOCALES[lang()];
export const dateFmt = opts => LC.dateFmt(lang(), opts);
export const numFmt = opts => LC.numFmt(lang(), opts);

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return LC.date(lang(), iso);
}
export const fmtDateTime = iso => LC.dateTime(lang(), iso);
export const num = (n, dec = 1) => LC.num(lang(), n, dec);
export const usd = n => LC.usd(lang(), n);
export function tokens(n) {
  if (!n) return null;
  return n >= 1e6 ? `${num(n / 1e6, 2)} M` : `${num(Math.round(n / 1000), 0)} K`;
}
export function daysAgo(iso) {
  return (Date.now() - new Date(iso).getTime()) / 86400e3;
}

/* Marca de fuente: abreviatura enlazada con fecha del dato y fecha de consulta en el título. */
export function src(f) {
  if (!f || !f.src) return '';
  const name = tr(SOURCES[f.src]?.name || f.src);
  const parts = [t('Fuente: {name}', { name })];
  if (f.asOf) parts.push(t('dato: {asOf}', { asOf: f.asOf }));
  if (f.got) parts.push(t('consulta: {got} UTC', { got: f.got.slice(0, 16).replace('T', ' ') }));
  if (f.note) parts.push(f.noteTr ? f.note : tr(f.note));   // noteTr: la nota ya viene traducida
  if (f.stale) parts.push(t('ÚLTIMO VALOR VÁLIDO: la consulta más reciente falló'));
  const title = esc(parts.join(' · '));
  const cls = `src${f.stale ? ' stale' : ''}`;
  const label = SRC_ABBR[f.src] || f.src;
  return f.url
    ? `<a class="${cls}" href="${esc(f.url)}" target="_blank" rel="noopener" title="${title}" aria-label="${title}">${label}</a>`
    : `<span class="${cls}" title="${title}">${label}</span>`;
}

/* Valor + fuente, o «sin datos». */
export function fact(f, format = v => esc(v)) {
  if (!f || f.v === null || f.v === undefined) return nd() + (f && f.src ? src(f) : '');
  const out = format(f.v);
  return out === null ? nd() : out + src(f);
}

/* Línea de procedencia completa, para fichas y novedades. */
export function provLine(s) {
  if (!s) return '';
  const name = esc(tr(s.name || SOURCES[s.src]?.name || s.src || ''));
  const link = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${name}</a>` : name;
  const bits = [t('Fuente: {link}', { link })];
  if (s.asOf || s.date) bits.push(t('dato: {fecha}', { fecha: fmtDate(s.asOf || s.date) }));
  if (s.got) bits.push(t('consulta: {fecha}', { fecha: fmtDateTime(s.got) }));
  return `<div class="prov">${bits.join(' · ')}</div>`;
}

export const COUNTRY = { US: 'EE. UU.', CN: 'China', FR: 'Francia', CA: 'Canadá', IL: 'Israel', GB: 'Reino Unido', DE: 'Alemania', JP: 'Japón', KR: 'Corea del Sur', AE: 'EAU' };
export const country = c => c ? (COUNTRY[c] ? tr(COUNTRY[c]) : c) : t('sin confirmar');

/* Quién fija el precio mostrado: el propio laboratorio en OpenRouter o, si no lo sirve, el proveedor más barato. Texto sin escapar. */
export const priceBasis = m => m.price?.basis === 'laboratorio' ? t('precio de {provider}', { provider: m.price.provider })
  : m.price?.basis === 'proveedor' ? t('proveedor más barato: {provider}{p2}', { provider: m.price.provider, p2: m.price.quant ? t(', cuantización {quant}', { quant: m.price.quant }) : '' })
  : m.price?.basis === 'referencia' ? t('precio de referencia de OpenRouter')
  : m.price?.basis === 'sin-api' ? t('sin API pública') : null;
/* Precio combinado 3:1 (convención de Artificial Analysis), a partir de los precios de OpenRouter. */
export function blended(m) {
  const i = m.price?.in?.v, o = m.price?.out?.v;
  return (i === null || i === undefined || o === null || o === undefined) ? null : (3 * i + o) / 4;
}
/* Capacidad en las vistas de modelos: Artificial Analysis Intelligence Index (configuración de mayor índice).
   Epoch Capabilities Index y SWE-bench Verified (Epoch AI, CC BY 4.0) como referencia; las escalas no se mezclan. */
export const ii = m => m.aa?.intelligence?.v ?? null;
export const capFact = m => m.aa?.intelligence ?? null;
export const coding = m => m.aa?.coding?.v ?? null;
export const agentic = m => m.aa?.agentic?.v ?? null;
export const eci = m => m.epoch?.eci?.v ?? null;
export const swe = m => m.epoch?.swe?.v ?? null;
/* Nombre en AA cuando aporta algo frente al del catálogo, p. ej. la configuración «(Max)»; no por guiones o mayúsculas. */
const bare = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const aaConfig = m => m.aa && m.aa.name && bare(m.aa.name) !== bare(m.name) ? m.aa.name : null;
/* Versión corta para la tabla: sólo la configuración entre paréntesis si el resto coincide con el nombre del catálogo. */
export const aaConfigShort = m => {
  const full = aaConfig(m); if (!full) return null;
  const mm = /^(.*)\(([^)]*)\)\s*$/.exec(full);
  return mm && bare(mm[1]) === bare(m.name) ? mm[2] : full;
};

/* La carrera con el índice de AA (complemento del ECI, que tarda en puntuar los modelos nuevos y no mide algunos laboratorios):
   modelos del catálogo puntuados por AA, colocados en la fecha del modelo según AA (si falta, la de Epoch o el alta en
   OpenRouter) con su índice actual. Abiertos y cerrados según el catálogo: los abiertos anunciados cuentan como abiertos y
   un «cerrados» inferido, como cerrado.
   Sólo entran los modelos del catálogo (los que siguen en OpenRouter y los que AA ya puntúa sin API pública): los retirados
   faltan en los meses antiguos. */
export function aaRace(catalog) {
  const ver = catalog?.aaIndexVersion ?? null, today = (catalog?.generated || new Date().toISOString()).slice(0, 10);
  const list = (catalog?.models || []).filter(m => ii(m) !== null && (!ver || !m.aa.version || m.aa.version === ver))
    .map(m => ({ d: m.aa.release?.v || m.epochPub?.v || m.orCreated?.v || null, v: ii(m), n: m.name, id: m.id, org: m.lab?.name || null, c: m.lab?.country || null,
      g: m.weights?.v === 'abiertos' ? 'o' : m.weights?.v === 'cerrados' ? 'c' : null, inf: m.weights?.v === 'cerrados' && !!m.weights.inferred,
      anun: m.weights?.v === 'abiertos' && !!m.weights.announced }))
    .filter(m => m.d && m.d <= today).sort((a, b) => a.d.localeCompare(b.d) || b.v - a.v);
  // Frontera: máximo acumulado de cada grupo, con la misma forma que la de Epoch.
  const best = { o: null, c: null }, points = [], models = [];
  for (const m of list.filter(x => x.g)) {
    const rec = !best[m.g] || m.v > best[m.g].v;
    if (rec) { best[m.g] = { v: m.v, name: m.n }; points.push({ date: m.d, open: best.o, closed: best.c }); }
    models.push({ ...m, rec });
  }
  // Distancias a cada fin de mes y hoy: mejor índice publicado hasta esa fecha en cada lado.
  const top = (d, f) => list.filter(m => m.d <= d && f(m)).reduce((a, m) => (!a || m.v > a.v ? m : a), null);
  const gap = (a, b) => a && b ? Math.round((a.v - b.v) * 10) / 10 : null;
  const dates = [];
  for (let t = new Date(`${list[0]?.d || today}T00:00:00Z`); ; ) {
    const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    if (end >= today) break;
    dates.push(end); t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
  }
  dates.push(today);
  const series = dates.map(d => {
    const us = top(d, m => m.c === 'US'), cn = top(d, m => m.c === 'CN'), cl = top(d, m => m.g === 'c'), op = top(d, m => m.g === 'o');
    return { d, usCn: gap(us, cn), closedOpen: gap(cl, op), who: { us: us?.n, cn: cn?.n, closed: cl?.n, open: op?.n } };
  }).filter(p => p.usCn !== null || p.closedOpen !== null);
  // Situación de hoy: los cuatro lados, los dos primeros laboratorios (mejor modelo de cada uno) y la frontera hace 12 meses.
  const byLab = new Map();
  for (const m of list) if (m.org && (!byLab.has(m.org) || m.v > byLab.get(m.org).v)) byLab.set(m.org, m);
  const labs = [...byLab.values()].sort((a, b) => b.v - a.v);
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const now = list.length ? {
    us: top(today, m => m.c === 'US'), cn: top(today, m => m.c === 'CN'), closed: top(today, m => m.g === 'c'), open: top(today, m => m.g === 'o'),
    openDl: top(today, m => m.g === 'o' && !m.anun),
    first: labs[0] || null, second: labs[1] || null, labs, from: top(yearAgo, () => true), to: top(today, () => true), yearAgo
  } : null;
  return { ver, today, points, models, series, now, n: list.length, from: list[0]?.d || null };
}

/* Cobertura de la frontera reconstruida con AA. Para cada récord de la frontera del ECI de Epoch (el mejor modelo abierto
   y el mejor cerrado según Epoch desde esa fecha), si el catálogo tiene ese modelo con índice AA de la versión vigente.
   Mientras el mejor según Epoch no lo tenga, la reconstrucción de AA no puede incluirlo y ese tramo queda marcado como
   incompleto. No se rellena ni se estima nada: sólo se señala. El emparejamiento con Epoch es el del recolector (m.epoch.name).
   from: fecha desde la que interesa (el primer modelo de la reconstrucción). */
export function aaCoverage(catalog, from = null) {
  const ver = catalog?.aaIndexVersion ?? null, today = (catalog?.generated || new Date().toISOString()).slice(0, 10);
  const models = catalog?.models || [], byEpoch = new Map(), byName = new Map();
  for (const m of models) { if (m.epoch?.name && !byEpoch.has(m.epoch.name)) byEpoch.set(m.epoch.name, m); if (!byName.has(m.name)) byName.set(m.name, m); }
  const scoredNow = m => m && ii(m) !== null && (!ver || !m.aa.version || m.aa.version === ver);
  const recs = [];
  for (const g of ['open', 'closed']) {
    let prev = null;
    const mine = [];
    for (const p of catalog?.epochFrontier?.points || []) {
      const x = p[g];
      if (x && x.name !== prev) { mine.push({ g: g === 'open' ? 'o' : 'c', d: p.date, n: x.name, eci: x.v }); prev = x.name; }
    }
    mine.forEach((r, i) => { r.to = mine[i + 1]?.d || today; });
    recs.push(...mine);
  }
  for (const r of recs) {
    const m = byEpoch.get(r.n) || byName.get(r.n);
    r.ok = !!scoredNow(m);
    if (!r.ok) { r.sinIndice = !!m; r.why = m ? 'sin índice AA' : 'fuera del catálogo: OpenRouter ya no lo lista o lo nombra de otro modo'; }   // why es el texto que publica el recolector; la lógica usa sinIndice
  }
  const missing = recs.filter(r => !r.ok && r.to > (from || '') && r.d <= today).sort((a, b) => a.d.localeCompare(b.d));
  // Tramos incompletos: uniones de [récord sin índice, siguiente récord de su grupo).
  const gaps = [];
  for (const r of missing) {
    const last = gaps[gaps.length - 1], a = from && r.d < from ? from : r.d;
    if (last && a <= last.to) { last.to = r.to > last.to ? r.to : last.to; last.missing.push(r); }
    else gaps.push({ from: a, to: r.to, missing: [r] });
  }
  const at = d => missing.filter(r => r.d <= d && d < r.to);
  const end = gaps.length ? gaps[gaps.length - 1].to : null;
  return { recs, missing, gaps, at, completeFrom: end && end < today ? end : gaps.length ? null : from, today };
}

/* Frase para las notas de los gráficos reconstruidos con AA: qué tramos están rayados y por qué. */
export function coverageText(cov) {
  if (!cov) return '';
  if (!cov.gaps.length) return ' ' + t('En todo el periodo, el mejor modelo abierto y el mejor cerrado según el ECI de Epoch tienen índice AA en el catálogo.');
  const list = ns => ns.length > 1 ? t('{head} y {last}', { head: ns.slice(0, -1).join(', '), last: ns[ns.length - 1] }) : ns[0];
  const why = g => {
    const sin = g.missing.filter(r => r.sinIndice).map(r => r.n), fuera = g.missing.filter(r => !r.sinIndice).map(r => r.n);
    return [sin.length && t('sin índice AA, {list}', { list: list(sin) }),
      fuera.length && tn(fuera.length, ['fuera del catálogo, porque OpenRouter ya no lo lista o lo nombra de otro modo, {list}', 'fuera del catálogo, porque OpenRouter ya no los lista o los nombra de otro modo, {list}'], { list: list(fuera) })].filter(Boolean).join('; ');
  };
  return ' ' + t('Rayado: tramos con cobertura incompleta, en los que el mejor modelo abierto o cerrado según el ECI de Epoch no tiene índice AA en el catálogo; ahí la reconstrucción no lo cuenta y las líneas y distancias pueden quedar desviadas.')
    + ' ' + cov.gaps.map(g => t('Del {from} al {to}: {why}', { from: fmtDate(g.from), to: fmtDate(g.to), why: why(g) })).join('. ') + '.'
    + (cov.completeFrom ? ' ' + t('Completa desde el {fecha}.', { fecha: fmtDate(cov.completeFrom) }) : '') + ' ' + t('No se rellena ni se estima nada.');
}

/* Velocidad: mediana de AA si existe; si no, el proveedor de OpenRouter más rápido, nombrado. */
export function speed(m) {
  const a = m.aa;
  // AA mide con la misma configuración que puntúa (la de mayor índice). Latencia: hasta el primer token de la respuesta,
  // incluido el tiempo de pensar. Su «primer token» no sirve para comparar: en los modelos que muestran el razonamiento
  // es el primer token pensado (un segundo) y en los que lo ocultan, la respuesta (minutos).
  const cfg = a && ((/\(([^)]*)\)\s*$/.exec(a.name || '') || [])[1] || null);
  if (a && a.tps && a.tps.v) return { tps: a.tps.v, lat: a.ttfa?.v ?? null, f: a.tps, fl: a.ttfa, aa: true, provider: t('referencia de AA{p1}', { p1: cfg ? t(', configuración {cfg}', { cfg }) : '' }), short: `AA${cfg ? `, ${cfg}` : ''}`, cfg };
  const eps = (m.endpoints || []).filter(e => e.tps);
  if (!eps.length) return null;
  const e = eps.slice().sort((x, y) => y.tps - x.tps)[0];
  const f = { ...(m.endpointsMeta || {}), v: e.tps, note: t('proveedor {provider}, mediana de los últimos 30 min', { provider: e.provider }), stale: e.stale };
  // Sin AA, la latencia es la del proveedor más rápido de OpenRouter: hasta el primer token, sea o no de la respuesta.
  return { tps: e.tps, lat: e.ttft, f, fl: { ...f, v: e.ttft }, aa: false, provider: e.provider, short: e.provider };
}

/* Etiqueta de pesos. «Cerrados» inferido (sin repositorio en Hugging Face ni clasificación de Epoch) y «abiertos» anunciados
   (su descripción en OpenRouter dice que son abiertos, pero aún no se pueden descargar) se distinguen de los comprobados.
   La descripción de OpenRouter no se atribuye al laboratorio: no consta quién la redacta. */
export const anunText = m => t('Su descripción en OpenRouter lo presenta como de pesos abiertos{since}, pero aún no hay repositorio público en Hugging Face: cuenta como abierto, aunque todavía no se puede descargar.',
  { since: m.weights?.since ? ' ' + t('(consta desde el {fecha})', { fecha: fmtDate(m.weights.since) }) : '' });
/* Modelos que Artificial Analysis ya puntúa y aún no están en OpenRouter (aaOnly): cuentan como los demás, sin precio. */
export const sinApiText = m => t('Artificial Analysis ya lo puntúa, pero aún no está en OpenRouter: sin API pública ni precio{since}.',
  { since: m.aaOnly?.since ? ' ' + t('(consta desde el {fecha})', { fecha: fmtDate(m.aaOnly.since) }) : '' });
export const sinApiTag = m => m.aaOnly ? ` <span class="sinapi" title="${esc(sinApiText(m))}">${t('sin API pública')}</span>` : '';
/* Valor de pesos de los datos (abiertos / cerrados) en el idioma de la página. */
export const weightsWord = v => v === 'abiertos' ? t('abiertos') : v === 'cerrados' ? t('cerrados') : t('pesos sin datos');
export function weightsTag(m) {
  const v = m.weights?.v;
  if (v === 'abiertos' && m.weights.announced) return `<span class="w abiertos anun" title="${esc(anunText(m))}">${t('abiertos · anunciados')}</span>`;
  if (v === 'cerrados' && m.weights.inferred) return `<span class="w cerrados inf" title="${m.aaOnly ? t('Aún no está en OpenRouter y no hay un repositorio con su nombre en la organización del laboratorio en Hugging Face; se asume cerrado') : t('OpenRouter no enlaza pesos y no hay un repositorio con su nombre en la organización del laboratorio en Hugging Face; se asume cerrado')}">${t('cerrados · inferido')}</span>`;
  return `<span class="w ${v || 'nd'}">${esc(weightsWord(v))}</span>`;
}
