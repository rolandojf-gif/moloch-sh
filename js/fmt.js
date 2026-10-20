/* Formato y procedencia. Toda cifra visible pasa por fact() para llevar su fuente. */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SRC_ABBR = { openrouter: 'OR', aa: 'AA', hf: 'HF', epoch: 'EP', metr: 'METR', curated: 'CUR' };
let SOURCES = {};
export function setSources(s) { SOURCES = s || {}; }

export const ND = '<span class="nd">sin datos</span>';

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

/* Precio combinado 3:1 (convención de Artificial Analysis), a partir de los precios de OpenRouter. */
export function blended(m) {
  const i = m.price?.in?.v, o = m.price?.out?.v;
  return (i === null || i === undefined || o === null || o === undefined) ? null : (3 * i + o) / 4;
}
/* Capacidad: Epoch Capabilities Index (CC BY 4.0). Programación: SWE-bench Verified ejecutado por Epoch. */
export const ii = m => m.epoch?.eci?.v ?? null;
export const coding = m => m.epoch?.swe?.v ?? null;
export const capFact = m => m.epoch?.eci ?? null;

/* Velocidad: mediana de AA si existe; si no, el proveedor de OpenRouter más rápido, nombrado. */
export function speed(m) {
  const a = m.aa;
  if (a && a.tps && a.tps.v) return { tps: a.tps.v, ttft: a.ttft?.v ?? null, f: a.tps, ft: a.ttft, provider: 'referencia de AA' };
  const eps = (m.endpoints || []).filter(e => e.tps);
  if (!eps.length) return null;
  const e = eps.slice().sort((x, y) => y.tps - x.tps)[0];
  const f = { ...(m.endpointsMeta || {}), v: e.tps, note: `proveedor ${e.provider}, mediana de los últimos 30 min`, stale: e.stale };
  return { tps: e.tps, ttft: e.ttft, f, ft: { ...f, v: e.ttft }, provider: e.provider };
}
