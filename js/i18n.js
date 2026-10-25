/* MOLOCH.SH · internacionalización ES/EN, sin dependencias.

   Tres mecanismos, todos con el texto en español como clave (el español vive una sola vez, donde se usa):
   · t(es, params)        textos de la interfaz. «es» es una plantilla con {marcas}; las cifras y el HTML de los parámetros
                          se insertan tal cual (quien llama escapa con esc() lo que venga de los datos), como en una plantilla de JS.
   · tn(n, [uno, otros])  lo mismo con plural (en inglés: [singular, plural]).
   · tr(es)               texto que viene de los datos (notas, editorial, motivos…) y que se guarda en español: memoria de
                          traducción (data/i18n/en/*.json), con frases exactas y patrones con {marcas}.
   · L(obj, campo)        texto generado por el recolector, que trae su versión inglesa en obj.i18n.en[campo]; si falta,
                          cae a la memoria de traducción y, en último término, al español.
   En español no se carga nada: t() y tr() devuelven el texto tal cual. El inglés se carga entero (loadLang) ANTES de cambiar
   de idioma, así que el cambio es síncrono y nunca queda a medias.
   Lo que no tiene traducción no rompe nada: se muestra en español y se anota (missing()) para que lo vean las pruebas. */
import { lang0 } from './locale.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* El selector ES | EN sólo se ve con ?i18n=1 (queda recordado) mientras la versión inglesa se prueba. Cuando se autorice
   publicarla, basta poner RELEASED a true. Sin el selector, el sitio es el de siempre, en español. */
export const RELEASED = false;
const K_LANG = 'moloch.lang', K_FLAG = 'moloch.i18n';
export const FILES = ['ui', 'hoy', 'carrera', 'ai2027', 'lanzamientos', 'notas'];

let LANG = 'es';
const EX = new Map();        // es → en | [en uno, en otros]
let PAT = [];                // patrones: { re, names, en }
const MEMO = new Map();      // tr(): resultado por cadena (incluye los fallos, como null)
const MISSING = { ui: new Set(), data: new Set() };

export const lang = () => LANG;
export const missing = () => ({ ui: [...MISSING.ui], data: [...MISSING.data] });
export const clearMissing = () => { MISSING.ui.clear(); MISSING.data.clear(); };

export function i18nEnabled() {
  if (RELEASED) return true;
  try {
    const q = new URLSearchParams(location.search).get('i18n');
    if (q === '1') localStorage.setItem(K_FLAG, '1');
    else if (q === '0') localStorage.removeItem(K_FLAG);
    return localStorage.getItem(K_FLAG) === '1';
  } catch { return false; }
}
/* Idioma inicial: ?lang= válido, luego el recordado, luego español. Nunca se deduce del idioma del navegador. */
export function initialLang() {
  if (!i18nEnabled()) return 'es';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'es' || q === 'en') return q;
    const s = localStorage.getItem(K_LANG);
    if (s === 'es' || s === 'en') return s;
  } catch {}
  return 'es';
}
export function persistLang(l) {
  try { localStorage.setItem(K_LANG, l); } catch {}
  try {
    const u = new URL(location.href);
    if (l === 'en') u.searchParams.set('lang', 'en'); else u.searchParams.delete('lang');
    history.replaceState(history.state, '', u);   // conserva la almohadilla: la dirección directa no cambia
  } catch {}
}
export const setLang = l => { LANG = lang0(l); };

/* ── Memoria y diccionarios ── */
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compile = ([es, en]) => {
  const names = [];
  const src = es.split(/\{(\w+)\}/).map((part, i) => i % 2 ? (names.push(part), '([\\s\\S]+?)') : reEsc(part)).join('');
  return { re: new RegExp(`^${src}$`), names, en, lit: es.replace(/\{\w+\}/g, '').length };
};
/* files: { ui: {exact:{es:en}}, notas: {exact, patterns:[[es,en]]}, … } */
export function setDictionary(files) {
  EX.clear(); MEMO.clear();
  const pats = [];
  for (const f of Object.values(files || {})) {
    for (const [k, v] of Object.entries(f?.exact || {})) EX.set(k, v);
    for (const k of f?.same || []) EX.set(k, k);   // textos que se escriben igual en los dos idiomas
    for (const p of f?.patterns || []) pats.push(compile(p));
  }
  PAT = pats.sort((a, b) => b.lit - a.lit);   // primero el patrón más específico
}
let loading = null;
export function loadLang(l) {
  if (lang0(l) !== 'en' || EX.size) return Promise.resolve();
  return loading ||= Promise.all(FILES.map(f => fetch(`data/i18n/en/${f}.json`).then(r => { if (!r.ok) throw new Error(`${r.status} ${f}`); return r.json(); })))
    .then(all => setDictionary(Object.fromEntries(FILES.map((f, i) => [f, all[i]]))))
    .catch(e => { loading = null; throw e; });
}
export const loaded = () => EX.size > 0;

/* ── Textos ── */
const fill = (s, p) => p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s;
const miss = es => { MISSING.ui.add(es); return es; };
const PR = typeof Intl !== 'undefined' ? new Intl.PluralRules('en-GB') : null;

export function t(es, p) {
  if (LANG !== 'en') return fill(es, p);
  const e = EX.get(es);
  return fill(typeof e === 'string' ? e : miss(es), p);
}
/* Plural: es = [singular, plural]; el número entra como {n}. En inglés la entrada es [singular, plural]. */
export function tn(n, es, p) {
  const q = { n, ...p };
  if (LANG !== 'en') return fill(n === 1 ? es[0] : es[1], q);
  const e = EX.get(es[0]);
  if (Array.isArray(e)) return fill(PR.select(n) === 'one' ? e[0] : e[1], q);
  miss(es[0]);
  return fill(n === 1 ? es[0] : es[1], q);
}
/* Texto de los datos, en español → inglés. En español devuelve lo mismo. */
export function tr(s) {
  if (LANG !== 'en' || s === null || s === undefined || s === '') return s;
  if (typeof s !== 'string') return s;
  const r = find(s);
  if (r === null) { if (EX.size) MISSING.data.add(s); return s; }
  return r;
}
/* Traducción de la memoria o null si no la hay (sin efectos: lo usan las pruebas y el recolector). */
export function find(s) {
  let r = MEMO.get(s);
  if (r === undefined) {
    r = EX.get(s);
    if (typeof r !== 'string') {
      r = null;
      for (const p of PAT) {
        const m = p.re.exec(s);
        if (m) { r = fill(p.en, Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]]))); break; }
      }
    }
    MEMO.set(s, r);
  }
  return r;
}
/* Campo de un objeto generado por el recolector (obj.i18n.en[campo]); si no lo trae, la memoria de traducción. */
export function L(o, k, es = o?.[k]) {
  if (!o) return es;
  if (LANG === 'en') { const v = o.i18n?.en?.[k]; if (v !== undefined && v !== null) return v; }
  return tr(es);
}
/* ── Texto fijo del HTML ──
   data-t           el texto del elemento (es la clave; se guarda la primera vez)
   data-t-html      igual, con HTML dentro (enlaces)
   data-t-attr      atributos traducibles separados por comas (aria-label, title, placeholder, content) */
export function applyStatic(root = document) {
  document.documentElement.lang = LANG;
  const en = LANG === 'en';
  const look = es => { const e = EX.get(es); return typeof e === 'string' ? e : miss(es); };
  for (const el of root.querySelectorAll('[data-t]')) {
    el._es ??= el.textContent;
    el.textContent = en ? look(el._es) : el._es;
  }
  for (const el of root.querySelectorAll('[data-t-html]')) {
    el._es ??= el.innerHTML;
    el.innerHTML = en ? look(el._es) : el._es;
  }
  for (const el of root.querySelectorAll('[data-t-attr]')) {
    el._esA ??= Object.fromEntries(el.dataset.tAttr.split(',').map(a => [a.trim(), el.getAttribute(a.trim())]));
    for (const [a, es] of Object.entries(el._esA)) el.setAttribute(a, en ? look(es) : es);
  }
}
