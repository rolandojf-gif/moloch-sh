/* Indicadores de «La carrera» y «AI 2027»: cada clave de data/indicadores.json se presenta con su fuente.
   Las distancias se dan en puntos ECI; nunca se convierten en meses. */
import { esc, fact, src, num, fmtDate, ND } from './fmt.js';

const pts = v => `${v > 0 ? '' : v < 0 ? '−' : ''}${num(Math.abs(v), 1)} puntos ECI`;
export const mw = v => v >= 1000 ? `${num(v / 1000, 1)} GW` : `${num(v, 0)} MW`;
export const mh100 = v => v >= 1e6 ? `${num(v / 1e6, 1)} M H100e` : `${num(Math.round(v / 1000), 0)} K H100e`;
export const usdB = v => `${num(v / 1e9, v >= 1e10 ? 0 : 1)} mil millones de $`;
const who = b => b ? `${esc(b.model)}${b.org ? ` (${esc(b.org.split(',')[0])})` : ''}` : 'sin datos';
const COUNTRY = { US: 'EE. UU.', CN: 'China', otros: 'otros' };
/* Epoch da el país de cada centro en inglés. */
export const PAIS = { 'United States': 'EE. UU.', 'United States of America': 'EE. UU.', China: 'China', Malaysia: 'Malasia', 'United Arab Emirates': 'EAU', 'Saudi Arabia': 'Arabia Saudí', 'United Kingdom': 'Reino Unido', Norway: 'Noruega', Japan: 'Japón', 'South Korea': 'Corea del Sur', Germany: 'Alemania', France: 'Francia', Spain: 'España', Canada: 'Canadá', Singapore: 'Singapur', Taiwan: 'Taiwán', Qatar: 'Catar', Sweden: 'Suecia', Finland: 'Finlandia', Netherlands: 'Países Bajos' };

/* Serie detenida (scripts/indicadores.mjs): su editor la cerró o lleva más de tres meses sin medir un modelo nuevo. Se
   muestra con su fecha, pero ya no se compara, no se dibuja ni se extrapola. */
const stopTag = f => f?.detenida ? ' <span class="stop">serie detenida</span>' : '';
const stopNote = f => f?.detenida ? ` Serie detenida: el último modelo medido se publicó el ${esc(fmtDate(f.ultimo))}; ya no se compara ni se extrapola.` : '';

/* Hecho «hermano» para listas y valores derivados que no son un hecho propio: misma fuente y fechas. */
const like = (f, v, extra = {}) => f ? { src: f.src, url: f.url, asOf: f.asOf, got: f.got, stale: f.stale, ...extra, v } : null;

/* Situación en la fecha de un plazo: distancia en puntos al primer rival y, para cada rival, cuándo publicó el líder
   un modelo de su nivel. Son fechas observadas, no una conversión de puntos en meses. */
function standing(f, label) {
  if (!f?.lead) return { label, value: fact(f, pts), sub: '' };
  const name = k => COUNTRY[k] || k;
  const rival = r => {
    const lr = r.leaderReached;
    const reach = !lr ? `${esc(name(f.lead.key))} no tenía hasta esa fecha un modelo de su nivel.`
      : lr.date > r.date ? `${esc(name(f.lead.key))} no publicó un modelo de ese nivel hasta el ${esc(fmtDate(lr.date))} (${esc(lr.model)}), después que el rival.`
      : `${esc(name(f.lead.key))} había publicado un modelo de ese nivel el ${esc(fmtDate(lr.date))} (${esc(lr.model)}).`;
    return `<b>${esc(name(r.key))}</b>: ${esc(r.model)}, ${num(r.eci, 1)}, publicado el ${esc(fmtDate(r.date))}; ${pts(r.gap)} por debajo${r.overlap ? ', con intervalos de confianza solapados' : ''}. ${reach}`;
  };
  return {
    label, value: fact(f, pts),
    sub: `Primero: <b>${esc(name(f.lead.key))}</b>, ${esc(f.lead.model)}, ${num(f.lead.eci, 1)}, publicado el ${esc(fmtDate(f.lead.date))}.`,
    list: f.rivals.map(rival)
  };
}

/* Índice de AA: mismas cuentas que el ECI, con la puntuación actual de cada modelo (scripts/collect.mjs, aaIndicators). */
const ptsAA = v => `${v < 0 ? '−' : ''}${num(Math.abs(v), 1)} puntos AA`;
const whoAA = b => b ? `${who(b)}, ${num(b.ii, 1)}${b.anun ? ' (pesos anunciados, aún sin descargar)' : ''}` : 'sin datos';
const ahead = (f, second) => f?.v < 0 ? ` Va por delante ${second}.` : f?.v === 0 ? ' Empatados.' : '';

/* Probabilidad de las réplicas bootstrap de Epoch (scripts/indicadores.mjs, ediBlock), con su marca de fuente. */
const odds = p => `${p.v >= 100 ? `todas las ${num(p.samples, 0)} réplicas` : p.v <= 0 ? `ninguna de las ${num(p.samples, 0)} réplicas` : `el ${num(p.v, 0)} % de las ${num(p.samples, 0)} réplicas`} del ajuste de Epoch${src(p)}`;
/* Laboratorios: en cuántas réplicas tiene el mejor modelo cada uno de los dos primeros. */
function labsOdds(I, f) {
  const p = f.prob, second = (I.eci?.labs || []).find(l => l.org === f.second?.org);
  const pc = v => v >= 100 ? 'en todas' : v <= 0 ? 'en ninguna' : `en el ${num(v, 0)} %`;
  return ` El mejor modelo es de ${esc(f.first.org)} en ${odds(p)}${second?.pFirst != null ? `, y de ${esc(second.org)} ${pc(second.pFirst)}` : ''}.`;
}

/* Cada entrada devuelve { label, value, sub } o { label, list, sub }. value y list ya llevan su marca de fuente. */
const REG = {
  'aa.gapUsCn': (I) => {
    const f = I.aa?.gapUsCn;
    return { label: 'Distancia EE. UU. − China (índice AA)', value: fact(f, ptsAA), sub: f?.us && f?.cn ? `${whoAA(f.us)} frente a ${whoAA(f.cn)}.${ahead(f, 'China')}` : '' };
  },
  'aa.gapClosedOpen': (I) => {
    const f = I.aa?.gapClosedOpen;
    return { label: 'Distancia cerrados − abiertos (índice AA)', value: fact(f, ptsAA), sub: f?.closed && f?.open ? `${whoAA(f.closed)} frente a ${whoAA(f.open)}.${ahead(f, 'el mejor abierto')}` : '' };
  },
  'aa.gapLabs': (I) => {
    const f = I.aa?.gapLabs;
    return { label: 'Distancia entre los dos primeros laboratorios (índice AA)', value: fact(f, ptsAA), sub: f?.first && f?.second ? `${whoAA(f.first)} frente a ${whoAA(f.second)}.` : '' };
  },
  'aa.rate12m': (I) => {
    const f = I.aa?.rate12m;
    return { label: 'Avance de la frontera en 12 meses (índice AA)', value: fact(f, v => `+${num(v, 1)} puntos AA`), sub: f?.from && f?.to ? `De ${whoAA(f.from)}, publicado el ${esc(fmtDate(f.from.date))}, a ${whoAA(f.to)}. Cada modelo con su puntuación actual.` : '' };
  },
  'eci.frontier': (I) => ({ label: 'Mejor modelo (ECI)', value: fact(I.eci?.frontier, v => num(v, 1)), sub: I.eci?.frontier?.model ? esc(I.eci.frontier.model) : '' }),
  'eci.rate12m': (I) => {
    const f = I.eci?.rate12m;
    return { label: 'Avance de la frontera en 12 meses (ECI)', value: fact(f, v => `+${num(v, 1)} puntos ECI`), sub: f?.from && f?.to ? `De ${who(f.from)}, ${num(f.from.eci, 1)}, a ${who(f.to)}, ${num(f.to.eci, 1)}.` : '' };
  },
  'eci.gapUsCn': (I) => {
    const f = I.eci?.gapUsCn;
    return { label: 'Distancia EE. UU. − China (ECI)', value: fact(f, pts), sub: f?.us && f?.cn ? `${who(f.us)} frente a ${who(f.cn)}. País de la organización según Epoch.${f.prob ? ` EE. UU. sigue por delante en ${odds(f.prob)}.` : ''}` : '' };
  },
  'eci.gapClosedOpen': (I) => {
    const f = I.eci?.gapClosedOpen;
    return { label: 'Distancia cerrados − abiertos (ECI)', value: fact(f, pts), sub: f?.closed && f?.open ? `${who(f.closed)} frente a ${who(f.open)}.${f.prob ? ` El mejor cerrado sigue por delante en ${odds(f.prob)}.` : ''}` : '' };
  },
  'eci.gapLabs': (I) => {
    const f = I.eci?.gapLabs;
    return {
      label: 'Distancia entre los dos primeros laboratorios (ECI)', value: fact(f, pts),
      sub: f?.first && f?.second ? `${who(f.first)} frente a ${who(f.second)}.${f.prob ? labsOdds(I, f) : f.overlap ? ' Sus intervalos de confianza se solapan: no puede afirmarse cuál va primero.' : ''}` : ''
    };
  },
  'eci.agent0': (I) => {
    const a = I.eci?.agent0, f = I.eci?.frontier;
    if (!a?.closed || !a?.open) return { label: 'Mejor cerrado (31 dic 2025) y mejor abierto (30 abr 2026)', value: ND, sub: '' };
    return {
      label: 'Mejor cerrado (31 dic 2025) y mejor abierto (30 abr 2026)',
      value: `${num(a.closed.eci, 1)} y ${num(a.open.eci, 1)}${src(like(f, 1, { asOf: f?.got?.slice(0, 10), note: 'ECI de Epoch AI' }))}`,
      sub: `${who(a.closed)} y ${who(a.open)}.`
    };
  },
  'eci.rivals2025': (I) => standing(I.eci?.rivals2025, 'Distancia entre los dos primeros laboratorios a 31 dic 2025'),
  'eci.usCn2026': (I) => standing(I.eci?.usCn2026, 'Distancia EE. UU. − China a 31 ago 2026'),
  'edi.open': (I) => {
    const f = I.edi?.open;
    return {
      label: 'Evaluaciones del ECI que el mejor modelo aún no resuelve a medias',
      value: fact(f, v => `${num(v, 0)} de ${num(f.of, 0)}`),
      sub: f?.v != null && f.top ? `${f.names.length ? `${f.names.map(esc).join(', ')}. ` : ''}Su dificultad, según Epoch, supera el ECI de ${esc(f.top.model)} (${num(f.top.eci, 1)}): el modelo de Epoch le prevé menos de la mitad del camino entre el azar y el techo de cada prueba.` : ''
    };
  },
  'bench.saturated': (I) => {
    const f = I.bench?.saturated;
    return { label: 'Evaluaciones saturadas', value: fact(f, v => `${num(v, 0)} de ${num(f.of, 0)}`), sub: 'Evaluaciones ejecutadas por Epoch, con al menos 5 modelos, cuyo mejor resultado llega al 90 %.' };
  },
  'bench.tasks': (I) => {
    const f = I.bench?.tasks;
    const rows = Array.isArray(f?.v) ? f.v.slice(0, 8) : [];
    return { label: 'Mejor resultado por evaluación (Epoch)', list: rows.map(t => `${esc(t.task)}: <b>${num(t.best, 1)} %</b> · ${esc(t.model)}${src(f)}`), sub: rows.length ? '' : ND };
  },
  'bench.sweBest': (I) => {
    const f = I.bench?.sweBest;
    return { label: 'Mejor SWE-bench Verified (ejecución de Epoch)', value: fact(f, v => `${num(v, 1)} %`) + stopTag(f), sub: `${f?.model ? esc(f.model) + '.' : ''}${stopNote(f)}` };
  },
  'bench.mirror': (I) => {
    const f = I.bench?.mirror;
    return {
      label: 'Mejor resultado en MirrorCode (ejecución de Epoch)',
      value: fact(f, v => `${num(v, 1)} %`) + stopTag(f),
      sub: f?.v != null ? `${esc(f.model)}, publicado el ${esc(fmtDate(f.asOf))}; ${num(f.models, 0)} modelos medidos. Reimplementar programas enteros a partir de su comportamiento: a un ingeniero, algunas tareas le llevarían semanas.${stopNote(f)}` : ''
    };
  },
  'bench.swe85': (I) => {
    const f = I.bench?.swe85;
    return { label: 'Primer modelo con al menos un 85 % en SWE-bench Verified', value: fact(f, v => esc(fmtDate(v))), sub: f?.model ? `${esc(f.model)}, ${num(f.score, 1)} %. Fecha de publicación del modelo.` : 'Ningún modelo llega al 85 % en las ejecuciones de Epoch.' };
  },
  'bench.sweMid2025': (I) => {
    const f = I.bench?.sweMid2025;
    return { label: 'Mejor SWE-bench Verified de un modelo publicado hasta el 30 jun 2025', value: fact(f, v => `${num(v, 1)} %`), sub: f?.model ? esc(f.model) : '' };
  },
  'dc.now': (I) => {
    const f = I.dc?.now;
    return { label: 'Potencia de TI en servicio en los centros que sigue Epoch', value: fact(f, mw), sub: f?.v != null ? `${num(f.n, 0)} centros · ${mh100(f.h100e)}. Potencia de los equipos, sin refrigeración ni pérdidas. No es el total mundial.` : '' };
  },
  'dc.capex': (I) => {
    const f = I.dc?.now;
    return { label: 'Coste de capital de esos centros', value: f?.capexB ? `${num(f.capexB, 0)} mil millones de $${src(like(f, f.capexB))}` : ND, sub: 'Estimación de Epoch, en dólares de 2025.' };
  },
  'dc.plan': (I) => {
    const f = I.dc?.plan;
    if (!f || f.v == null || !f.today) return { label: 'Calendario estimado de potencia', value: fact(f), sub: '' };
    return {
      label: 'Calendario estimado de potencia',
      value: `${mw(f.today.mw)} hoy → ${mw(f.end2026.mw)} a fin de 2026 → ${mw(f.end2027.mw)} a fin de 2027${src(f)}`,
      sub: `Estimación de Epoch para ${num(f.centres, 0)} centros a partir de obras, permisos y anuncios, hasta ${esc(fmtDate(f.lastDate))}. Suma otra columna de Epoch («Power (MW)»)${I.dc?.now?.v != null ? `, que hoy da ${mw(f.today.mw)} frente a ${mw(I.dc.now.v)} de potencia de TI` : ''}: probablemente incluye refrigeración y pérdidas (inferencia del observatorio).`
    };
  },
  'dc.top': (I) => {
    const f = I.dc?.now, rows = I.dc?.top || [];
    return { label: 'Centros con más potencia en servicio', list: rows.map(r => `${esc(r.name)}${r.owner ? ` · ${esc(r.owner)}` : ''}${r.country ? ` · ${esc(PAIS[r.country] || r.country)}` : ''}: <b>${mw(r.mw)}</b>${src(like(f, r.mw))}`), sub: rows.length ? '' : ND };
  },
  'chips.cum': (I) => {
    const f = I.chips?.cum;
    return {
      label: 'Chips de IA entregados, acumulado', value: fact(f, mh100),
      sub: f?.v != null ? `Desde ${esc(fmtDate(f.since))}; ${mh100(f.last4)} en los últimos cuatro trimestres. Suma de medianas: entregados no es instalados.${f.incomplete ? ' El último trimestre está incompleto.' : ''}` : ''
    };
  },
  'chips.tdp': (I) => {
    const f = I.chips?.cum;
    return { label: 'Consumo nominal (TDP) de esos chips', value: f?.tdpGW ? `${num(f.tdpGW, 1)} GW${src(like(f, f.tdpGW))}` : ND, sub: 'Epoch estima que la instalación completa necesita aproximadamente el doble.' };
  },
  'chips.byDesignerCountry': (I) => {
    const c = I.chips?.byDesignerCountry, f = I.chips?.cum;
    const tot = c ? (c.US || 0) + (c.CN || 0) + (c.otros || 0) : 0;
    if (!tot) return { label: 'Por país del diseñador del chip', value: ND, sub: '' };
    const pc = k => `${COUNTRY[k]} ${num(c[k] / tot * 100, 0)} %`;
    return { label: 'Por país del diseñador del chip', value: `${['US', 'CN', 'otros'].map(pc).join(' · ')}${src(like(f, tot))}`, sub: 'Por país del diseñador, no por país donde se usan los chips.' };
  },
  'chips.makers': (I) => {
    const f = I.chips?.cum, rows = (I.chips?.makers || []).slice(0, 6);
    return { label: 'Por fabricante', list: rows.map(r => `${esc(r.maker)}${r.country ? ` (${COUNTRY[r.country] || esc(r.country)})` : ''}: <b>${mh100(r.h100e)}</b>${src(like(f, r.h100e))}`), sub: rows.length ? '' : ND };
  },
  'companies.leader': (I) => {
    const f = I.companies?.leader;
    return { label: 'Mayores ingresos anualizados', value: fact(f, usdB), sub: f?.company ? `${esc(f.company)} · ${esc(f.type || 'tipo sin datos')} · confianza de Epoch: ${esc(f.confidence || 'sin datos')}.` : '' };
  },
  'companies.openai2025': (I) => {
    const f = I.companies?.openai2025;
    return { label: 'OpenAI, último dato hasta el 31 dic 2025', value: fact(f, usdB), sub: f?.v != null ? `${esc(f.type || 'ingresos anualizados')}, a ${esc(fmtDate(f.asOf))}.` : 'Epoch no recoge ingresos de OpenAI hasta esa fecha.' };
  },
  'companies.revenue': (I) => {
    const rows = I.companies?.revenue || [];
    return { label: 'Ingresos anualizados por empresa (último dato)', list: rows.map(f => `${esc(f.company)}: <b>${usdB(f.v)}</b> · ${esc(fmtDate(f.asOf))}${src(f)}`), sub: rows.length ? 'Informes recopilados por Epoch; tipo de ingreso y confianza en la marca de fuente.' : ND };
  },
  'companies.usage': (I) => {
    const rows = I.companies?.usage || [];
    return { label: 'Usuarios activos declarados', list: rows.map(f => `${esc(f.company)}${f.product ? ` · ${esc(f.product)}` : ''}: <b>${f.v >= 1e6 ? `${num(f.v / 1e6, 0)} M` : num(f.v, 0)}</b> (${esc(f.period || 'periodo sin datos')})${src(f)}`), sub: rows.length ? 'Cifras que declaran las propias empresas, recopiladas por Epoch.' : ND };
  },
  'metr.sota': (I) => {
    const f = I.metr?.sota;
    return {
      label: 'Horizonte al 80 % del modelo puntero (METR)',
      value: fact(f, v => `${num(v, 1)} h`) + stopTag(f),
      sub: f?.v != null ? `Intervalo ${num(f.p80?.lo, 1)}–${num(f.p80?.hi, 1)} h; al 50 %: ${num(f.p50?.est, 1)} h. ${esc(f.key || '')}, publicado el ${esc(fmtDate(f.asOf))}. Horas de trabajo de un experto humano, no horas de autonomía.${stopNote(f)}` : ''
    };
  },
  'metr.ratio': (I) => {
    const f = I.metr?.sota;
    return { label: 'Relación entre los horizontes al 80 % y al 50 %', value: f?.ratio != null ? `${num(f.ratio, 2)}${src(like(f, f.ratio))}${stopTag(f)}` : ND, sub: `Cuanto más baja, más ancha es la franja de tareas que el agente sólo completa a veces.${stopNote(f)}` };
  }
};

export const hasIndicator = key => key in REG;
/* Etiqueta y valor (con su marca de fuente) de un indicador, sin la explicación: para resúmenes. */
export const indicatorBrief = (ind, key) => REG[key] ? REG[key](ind || {}) : { label: key, value: ND };

/* Fila de indicador para una ficha (dl). */
export function indicatorRow(ind, key) {
  const r = REG[key] ? REG[key](ind || {}) : { label: key, value: ND, sub: '' };
  const body = r.list && r.value
    ? `<span class="v">${r.value}</span>${r.sub ? `<span class="s">${r.sub}</span>` : ''}${r.list.length ? `<ul class="ind-list">${r.list.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}`
    : r.list
    ? (r.list.length ? `<ul class="ind-list">${r.list.map(x => `<li>${x}</li>`).join('')}</ul>` : '') + (r.sub ? `<span class="s">${r.sub}</span>` : '')
    : `<span class="v">${r.value}</span>${r.sub ? `<span class="s">${r.sub}</span>` : ''}`;
  return `<div class="ind-row"><dt>${esc(r.label)}</dt><dd>${body}</dd></div>`;
}

/* Tarjeta KPI para la cabecera de «La carrera». */
export function indicatorKpi(ind, key) {
  const r = REG[key](ind || {});
  return `<div class="kpi"><span class="k">${esc(r.label)}</span><span class="v small">${r.value}</span><span class="s">${r.sub}</span></div>`;
}
