/* MOLOCH.SH · textos bilingües del recolector.

   Los generadores (cambios.mjs, parte.mjs, indicadores.mjs) escriben cada plantilla una sola vez y la evalúan con
   dos juegos de formato: F.es y F.en. `F.t(es, en)` elige el texto del idioma y `F.n`, `F.money`… dan las cifras
   como se escriben en cada uno (coma o punto decimal, «1,25 $» o «$1.25»). El español sale idéntico al de siempre;
   el inglés se guarda al lado, en `i18n.en`, para que la web lo muestre sin traducir nada en el navegador.

   Si una cadena no tiene versión inglesa, `both()` la deja igual y la anota en AVISOS: validate.mjs la muestra
   como advertencia, pero la recogida diaria nunca se detiene por un problema de traducción. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setDictionary, find } from '../js/i18n.js';

const LOCALE = { es: 'es-ES', en: 'en-GB' };

/* La memoria de traducción (data/i18n/en/*.json) también sirve al recolector para los textos que cita de los datos
   curados (títulos de hitos, estados de la escala…). */
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'i18n', 'en');
const ARCHIVOS = ['ui', 'hoy', 'carrera', 'ai2027', 'lanzamientos', 'notas'];
setDictionary(Object.fromEntries(ARCHIVOS.map(f => [f, JSON.parse(readFileSync(path.join(DIR, `${f}.json`), 'utf8'))])));

export const AVISOS = new Set();

function juego(l) {
  const loc = LOCALE[l], en = l === 'en';
  const nf = (v, d) => Number(v).toLocaleString(loc, { maximumFractionDigits: d });
  return {
    l,
    t: (es, enText) => {
      if (en && (enText === undefined || enText === null)) { AVISOS.add(es); return es; }
      return en ? enText : es;
    },
    /* Texto de los datos curados o de la interfaz, tal como está en la memoria de traducción; sin entrada, el original y un aviso. */
    tm: x => { if (!en || x === null || x === undefined || x === '') return x; const r = find(String(x)); if (r === null) { AVISOS.add(String(x)); return x; } return r; },
    /* Número con hasta d decimales según el idioma. */
    n: (v, d = 2) => nf(v, d),
    /* Número escrito con punto decimal en español (los hechos publicados lo usan así): sólo cambia la coma. */
    dec: v => en ? String(v) : String(v).replace('.', ','),
    /* Importe en dólares: «1,25 $» / «$1.25». */
    money: v => en ? `$${nf(v, 4)}` : `${nf(v, 4)} $`,
    usd: v => en ? `$${nf(v, v < 1 ? 3 : 2)}` : `${nf(v, v < 1 ? 3 : 2)} $`,
    pct: v => en ? `${nf(Math.abs(v), 0)}%` : `${nf(Math.abs(v), 0)} %`,
    /* Porcentaje con espacio fino en español (`12 %`), pegado en inglés (`12%`). */
    p: s => en ? `${s}%` : `${s} %`,
    day: d => new Date(d + 'T00:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    month: d => new Date(d + 'T00:00:00Z').toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  };
}
export const F = { es: juego('es'), en: juego('en') };

/* Estado de una fuente fallida: español canónico y versión inglesa para la web. */
export const failedStatus = (es, en, extra = {}) => ({ ok: false, reason: F.es.t(es, en), i18n: { en: { reason: F.en.t(es, en) } }, ...extra });

/* Evalúa una plantilla en los dos idiomas: { es, en }. */
export const both = fn => ({ es: fn(F.es), en: fn(F.en) });

/* Escribe un campo de texto en el objeto: el español en el campo y el inglés en i18n.en. */
export function put(obj, field, { es, en }) {
  obj[field] = es;
  if (en !== undefined && en !== null) { obj.i18n ??= {}; obj.i18n.en ??= {}; obj.i18n.en[field] = en; }
  return obj;
}
