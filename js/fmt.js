/* Formato y procedencia. Toda cifra visible pasa por fact() para llevar su fuente. */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SRC_ABBR = { openrouter: 'OR', aa: 'AA', hf: 'HF', epoch: 'EP', metr: 'METR', curated: 'CUR' };
let SOURCES = {};
export function setSources(s) { SOURCES = s || {}; }

export const ND = '<span class="nd">sin datos</span>';
/* Artificial Analysis: sus datos se publican con su permiso por escrito (data/curated/permisos.json), citándolos con enlace. */
export const AA_LINK = '<a href="https://artificialanalysis.ai" target="_blank" rel="noopener">Artificial Analysis</a>';
export const aaIndexName = v => `índice de inteligencia de Artificial Analysis${v ? ` v${v}` : ''}`;

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}
export function num(n, dec = 1) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
}
export function usd(n) {
  if (n === null || n === undefined) return null;
  if (n === 0) return '0 $';
  const dec = n < 0.1 ? 3 : n < 10 ? 2 : 1;
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: dec > 2 ? 2 : dec, maximumFractionDigits: dec })} $`;
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

/* Etiqueta de pesos. «Cerrados» inferido (sin repositorio en Hugging Face ni clasificación de Epoch) se distingue del comprobado. */
export function weightsTag(m) {
  const v = m.weights?.v;
  if (v === 'cerrados' && m.weights.inferred) return '<span class="w cerrados inf" title="OpenRouter no enlaza pesos y no hay un repositorio con su nombre en la organización del laboratorio en Hugging Face; se asume cerrado">cerrados · inferido</span>';
  return `<span class="w ${v || 'nd'}">${esc(v || 'pesos sin datos')}</span>`;
}
