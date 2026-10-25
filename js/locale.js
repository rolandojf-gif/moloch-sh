/* Idiomas y formatos de números y fechas, sin dependencias del navegador: los usan la web (js/fmt.js) y el recolector
   (scripts/textos.mjs), así que una cifra se escribe igual en la página y en el parte diario.
   Los formateadores se crean una vez y se reutilizan (crear uno en cada llamada costaba unos 3 s de CPU en un móvil lento);
   el idioma forma parte de la clave de la caché, para que un idioma nunca devuelva el formato del otro. */

export const LANGS = ['es', 'en'];
export const LOCALES = { es: 'es-ES', en: 'en-GB' };
export const lang0 = l => (l === 'en' ? 'en' : 'es');

const FMT = new Map();
export function formatter(lang, Kind, opts) {
  const k = `${lang}|${Kind.name}|${JSON.stringify(opts)}`;
  let f = FMT.get(k);
  if (!f) FMT.set(k, f = new Kind(LOCALES[lang0(lang)], opts));
  return f;
}
/* Fecha en UTC con las opciones de Intl.DateTimeFormat. En inglés británico el mes de septiembre sale «Sept»: se deja «Sep». */
export function dateFmt(lang, opts) {
  const f = formatter(lang, Intl.DateTimeFormat, { ...opts, timeZone: 'UTC' });
  if (lang0(lang) !== 'en') return f;
  const out = { format: d => f.format(d).replace(/\bSept\b/g, 'Sep'), formatToParts: d => f.formatToParts(d) };
  return out;
}
export const numFmt = (lang, opts) => formatter(lang, Intl.NumberFormat, opts);

export const num = (lang, n, dec = 1) => numFmt(lang, { maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(Number(n));
/* Dólares: «1,25 $» en español, «$1.25» en inglés. */
export function usd(lang, n) {
  if (n === null || n === undefined) return null;
  const en = lang0(lang) === 'en';
  if (n === 0) return en ? '$0' : '0 $';
  const dec = n < 0.1 ? 3 : n < 10 ? 2 : 1;
  const s = numFmt(lang, { minimumFractionDigits: dec > 2 ? 2 : dec, maximumFractionDigits: dec }).format(n);
  return en ? `$${s}` : `${s} $`;
}
const dayFmt = lang => dateFmt(lang, { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = lang => dateFmt(lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function date(lang, iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return Number.isNaN(d.getTime()) ? iso : dayFmt(lang).format(d);
}
export function dateTime(lang, iso) {
  if (!iso) return '—';
  return timeFmt(lang).format(new Date(iso)) + ' UTC';
}
/* «2026-10» → «oct 2026» / «Oct 2026»; «2026-10-25» → fecha completa. */
export const monthYear = (lang, s, month = 'short') => dateFmt(lang, { month, year: 'numeric' }).format(new Date(s.length === 7 ? `${s}-01T00:00:00Z` : `${s}T00:00:00Z`));
