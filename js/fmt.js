/* Formato y procedencia. Toda cifra visible pasa por fact() para llevar su fuente. */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SRC_ABBR = { openrouter: 'OR', aa: 'AA', hf: 'HF', epoch: 'EP', metr: 'METR', curated: 'CUR' };
let SOURCES = {};
export function setSources(s) { SOURCES = s || {}; }

export const ND = '<span class="nd">sin datos</span>';
/* Artificial Analysis: sus datos se publican con su permiso por escrito (data/curated/permisos.json), citándolos con enlace. */
export const AA_LINK = '<a href="https://artificialanalysis.ai" target="_blank" rel="noopener">Artificial Analysis</a>';
export const aaIndexName = v => `índice de inteligencia de Artificial Analysis${v ? ` v${v}` : ''}`;

/* Idioma de fechas y números, en un solo sitio. Los formateadores se crean una vez y se reutilizan: crear uno en cada
   llamada (toLocaleDateString / toLocaleString con opciones) costaba unos 3 s de CPU al cargar en un móvil lento. */
export const LOCALE = 'es-ES';
const FMT = new Map();
const formatter = (Kind, opts) => {
  const k = `${Kind.name}${JSON.stringify(opts)}`;
  let f = FMT.get(k);
  if (!f) FMT.set(k, f = new Kind(LOCALE, opts));
  return f;
};
/* Fecha en UTC con las opciones de Intl.DateTimeFormat; número con las de Intl.NumberFormat. */
export const dateFmt = opts => formatter(Intl.DateTimeFormat, { ...opts, timeZone: 'UTC' });
export const numFmt = opts => formatter(Intl.NumberFormat, opts);

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return dateFmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return dateFmt({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) + ' UTC';
}
export function num(n, dec = 1) {
  return numFmt({ maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(Number(n));
}
export function usd(n) {
  if (n === null || n === undefined) return null;
  if (n === 0) return '0 $';
  const dec = n < 0.1 ? 3 : n < 10 ? 2 : 1;
  return `${numFmt({ minimumFractionDigits: dec > 2 ? 2 : dec, maximumFractionDigits: dec }).format(n)} $`;
}
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
  const name = SOURCES[f.src]?.name || f.src;
  const parts = [`Fuente: ${name}`];
  if (f.asOf) parts.push(`dato: ${f.asOf}`);
  if (f.got) parts.push(`consulta: ${f.got.slice(0, 16).replace('T', ' ')} UTC`);
  if (f.note) parts.push(f.note);
  if (f.stale) parts.push('ÚLTIMO VALOR VÁLIDO: la consulta más reciente falló');
  const title = esc(parts.join(' · '));
  const cls = `src${f.stale ? ' stale' : ''}`;
  const label = SRC_ABBR[f.src] || f.src;
  return f.url
    ? `<a class="${cls}" href="${esc(f.url)}" target="_blank" rel="noopener" title="${title}" aria-label="${title}">${label}</a>`
    : `<span class="${cls}" title="${title}">${label}</span>`;
}

/* Valor + fuente, o «sin datos». */
export function fact(f, format = v => esc(v)) {
  if (!f || f.v === null || f.v === undefined) return ND + (f && f.src ? src(f) : '');
  const out = format(f.v);
  return out === null ? ND : out + src(f);
}

/* Línea de procedencia completa, para fichas y novedades. */
export function provLine(s) {
  if (!s) return '';
  const name = esc(s.name || SOURCES[s.src]?.name || s.src || '');
  const link = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${name}</a>` : name;
  const bits = [`Fuente: ${link}`];
  if (s.asOf || s.date) bits.push(`dato: ${fmtDate(s.asOf || s.date)}`);
  if (s.got) bits.push(`consulta: ${fmtDateTime(s.got)}`);
  return `<div class="prov">${bits.join(' · ')}</div>`;
}

export const COUNTRY = { US: 'EE. UU.', CN: 'China', FR: 'Francia', CA: 'Canadá', IL: 'Israel', GB: 'Reino Unido', DE: 'Alemania', JP: 'Japón', KR: 'Corea del Sur', AE: 'EAU' };
export const country = c => c ? (COUNTRY[c] || c) : 'sin confirmar';

/* Quién fija el precio mostrado: el propio laboratorio en OpenRouter o, si no lo sirve, el proveedor más barato. Texto sin escapar. */
export const priceBasis = m => m.price?.basis === 'laboratorio' ? `precio de ${m.price.provider}`
  : m.price?.basis === 'proveedor' ? `proveedor más barato: ${m.price.provider}${m.price.quant ? `, cuantización ${m.price.quant}` : ''}`
  : m.price?.basis === 'referencia' ? 'precio de referencia de OpenRouter' : null;
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
   Sólo entran los modelos que siguen en OpenRouter: los retirados faltan en los meses antiguos. */
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
    first: labs[0] || null, second: labs[1] || null, labs, from: top(yearAgo, () => true), to: top(today, () => true), yearAgo
  } : null;
  return { ver, today, points, models, series, now, n: list.length, from: list[0]?.d || null };
}

/* Velocidad: mediana de AA si existe; si no, el proveedor de OpenRouter más rápido, nombrado. */
export function speed(m) {
  const a = m.aa;
  // AA mide con la misma configuración que puntúa (la de mayor índice). Latencia: hasta el primer token de la respuesta,
  // incluido el tiempo de pensar. Su «primer token» no sirve para comparar: en los modelos que muestran el razonamiento
  // es el primer token pensado (un segundo) y en los que lo ocultan, la respuesta (minutos).
  const cfg = a && ((/\(([^)]*)\)\s*$/.exec(a.name || '') || [])[1] || null);
  if (a && a.tps && a.tps.v) return { tps: a.tps.v, lat: a.ttfa?.v ?? null, f: a.tps, fl: a.ttfa, aa: true, provider: `referencia de AA${cfg ? `, configuración ${cfg}` : ''}`, short: `AA${cfg ? `, ${cfg}` : ''}`, cfg };
  const eps = (m.endpoints || []).filter(e => e.tps);
  if (!eps.length) return null;
  const e = eps.slice().sort((x, y) => y.tps - x.tps)[0];
  const f = { ...(m.endpointsMeta || {}), v: e.tps, note: `proveedor ${e.provider}, mediana de los últimos 30 min`, stale: e.stale };
  // Sin AA, la latencia es la del proveedor más rápido de OpenRouter: hasta el primer token, sea o no de la respuesta.
  return { tps: e.tps, lat: e.ttft, f, fl: { ...f, v: e.ttft }, aa: false, provider: e.provider, short: e.provider };
}

/* Etiqueta de pesos. «Cerrados» inferido (sin repositorio en Hugging Face ni clasificación de Epoch) y «abiertos» anunciados
   (el laboratorio dice que son abiertos, pero aún no se pueden descargar) se distinguen de los comprobados. */
export function weightsTag(m) {
  const v = m.weights?.v;
  if (v === 'abiertos' && m.weights.announced) return '<span class="w abiertos anun" title="El laboratorio lo presenta como de pesos abiertos, pero aún no hay repositorio público en Hugging Face: cuenta como abierto, aunque todavía no se puede descargar">abiertos · anunciados</span>';
  if (v === 'cerrados' && m.weights.inferred) return '<span class="w cerrados inf" title="OpenRouter no enlaza pesos y no hay un repositorio con su nombre en la organización del laboratorio en Hugging Face; se asume cerrado">cerrados · inferido</span>';
  return `<span class="w ${v || 'nd'}">${esc(v || 'pesos sin datos')}</span>`;
}
