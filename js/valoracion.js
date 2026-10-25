/* Valoración vigente de cada hito de AI 2027 y su estimación, sin textos de interfaz.
   La usan la vista (js/ai2027.js) y el detector de cambios del recolector (scripts/cambios.mjs),
   para que los dos lean siempre la misma valoración. Sin dependencias del navegador. */

export const OPEN = ['todavía no evaluable', 'sin evidencia suficiente'];
const addDays = (d, k) => new Date(Date.parse(d) + k * 86400e3).toISOString().slice(0, 10);

/* Valoración del observatorio: fija, o calculada por una regla del recolector (data/indicadores.json → checks). */
export function resolve(val, checks) {
  if (!val?.regla) return val;
  const c = checks?.[val.regla];
  return c ? { ...val, v: c.v, texto: c.texto, fecha: c.fecha, sentido: c.sentido || null, i18n: c.i18n } : { ...val, v: 'sin evidencia suficiente', texto: 'La regla no ha podido calcularse en la última recogida.' };
}
export const valOf = (h, quien, checks) => resolve((h.valoraciones || []).find(v => v.quien === quien), checks) || null;

/* Estimación: sólo para hitos sin valoración posible todavía (plazo no vencido o sin medida directa).
   Devuelve el veredicto; la vista añade el texto de los métodos «autores» y «ritmo». */
export function estimateCore(h, checks, a) {
  const e = h.estimacion;
  if (!e) return null;
  if (e.metodo === 'regla') { const c = checks?.[e.regla]; return c ? { ...e, v: c.v, sentido: c.sentido, texto: c.texto, fecha: c.fecha, i18n: c.i18n } : null; }
  if (e.metodo === 'autores') {
    const au = valOf(h, 'autores', checks);
    return au && !OPEN.includes(au.v) ? { ...e, v: au.v, sentido: e.sentido || null, fecha: au.fecha } : null;
  }
  if (e.metodo === 'ritmo') {
    const p = a.ritmo?.puntos?.at(-1), start = a.escenario.publicado;
    if (!p?.rango) return null;
    const span = (Date.parse(h.plazo) - Date.parse(start)) / 86400e3;
    return {
      ...e, v: p.rango[1] < 1 ? 'retrasado' : 'compatible', sentido: p.rango[1] < 1 ? 'Llegaría más tarde' : 'Llegaría a tiempo', fecha: p.fecha,
      early: addDays(start, span / p.rango[1]), late: addDays(start, span / p.rango[0]), punto: p
    };
  }
  return { ...e };
}

/* Veredictos vigentes de todos los hitos, para la instantánea diaria: { id: [observatorio, estimación] }. */
export function valoraciones(a, checks) {
  const out = {};
  for (const l of a?.lineas || []) for (const h of l.hitos || []) {
    const o = valOf(h, 'observatorio', checks)?.v ?? null;
    out[h.id] = [o, OPEN.includes(o) ? estimateCore(h, checks, a)?.v ?? null : null];
  }
  return out;
}
