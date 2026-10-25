/* Indicadores de «La carrera» y «AI 2027»: cada clave de data/indicadores.json se presenta con su fuente.
   Las distancias se dan en puntos ECI; nunca se convierten en meses. */
import { t, tn, tr, L } from './i18n.js';
import { esc, fact, src, num, fmtDate, nd } from './fmt.js';

const sign = v => v > 0 ? '' : v < 0 ? '−' : '';

const pts = v => `${sign(v)}${t('{n} puntos ECI', { n: num(Math.abs(v), 1) })}`;
export const mw = v => v >= 1000 ? `${num(v / 1000, 1)} GW` : `${num(v, 0)} MW`;
export const mh100 = v => v >= 1e6 ? `${num(v / 1e6, 1)} M H100e` : `${num(Math.round(v / 1000), 0)} K H100e`;
export const usdBs = v => t('{num} mil M$', { num: num(v / 1e9, v >= 1e10 ? 0 : 1) });
export const usdB = v => t('{num} mil millones de $', { num: num(v / 1e9, v >= 1e10 ? 0 : 1) });
const who = b => b ? `${esc(b.model)}${b.org ? ` (${esc(b.org.split(',')[0])})` : ''}` : t('sin datos');
const cn = k => ({ US: t('EE. UU.'), CN: t('China'), otros: t('otros') }[k] || k);
/* Epoch da el país de cada centro en inglés. */
export const PAIS = { 'United States': 'EE. UU.', 'United States of America': 'EE. UU.', China: 'China', Malaysia: 'Malasia', 'United Arab Emirates': 'EAU', 'Saudi Arabia': 'Arabia Saudí', 'United Kingdom': 'Reino Unido', Norway: 'Noruega', Japan: 'Japón', 'South Korea': 'Corea del Sur', Germany: 'Alemania', France: 'Francia', Spain: 'España', Canada: 'Canadá', Singapore: 'Singapur', Taiwan: 'Taiwán', Qatar: 'Catar', Sweden: 'Suecia', Finland: 'Finlandia', Netherlands: 'Países Bajos' };

/* Serie detenida (scripts/indicadores.mjs): su editor la cerró o lleva más de tres meses sin medir un modelo nuevo. Se
   muestra con su fecha, pero ya no se compara, no se dibuja ni se extrapola. */
const stopTag = f => f?.detenida ? ` <span class="stop">${t('serie detenida')}</span>` : '';
const stopNote = f => f?.detenida ? ` ${t('Serie detenida: el último modelo medido se publicó el {fmtDate}; ya no se compara ni se extrapola.', { fmtDate: esc(fmtDate(f.ultimo)) })}` : '';

/* Cobertura incompleta (scripts/collect.mjs, aaIndicators): en una fecha que usa el indicador, el mejor modelo abierto o
   cerrado según la frontera del ECI de Epoch no tiene índice AA en el catálogo. Se dice cuál falta; no se corrige nada. */
const incTag = f => f?.incompleto ? ` <span class="stop">${t('incompleto')}</span>` : '';
const incNote = (f, start = null) => {
  if (!f?.incompleto) return '';
  const one = x => t('{model} (mejor {tipo} según el ECI de Epoch desde el {fecha}; {why})', { model: esc(x.model), tipo: x.g === 'o' ? t('abierto') : t('cerrado'), fecha: esc(fmtDate(x.since)), why: esc(tr(x.why)) });
  const y = ` ${t('y')} `;
  const a = start ? f.incompleto.filter(x => x.since <= start) : [], b = f.incompleto.filter(x => !a.includes(x));
  return ` <b>${t('Incompleto.')}</b>${a.length ? ` ${t('En el punto de partida falta {p1}: la frontera de entonces puede quedar por debajo de lo que hubo y el avance, por encima.', { p1: a.map(one).join(y) })}` : ''}${b.length ? ` ${t('Hoy falta {p1}.', { p1: b.map(one).join(y) })}` : ''} ${t('No se compara entre recogidas mientras siga así.')}`;
};

/* Hecho «hermano» para listas y valores derivados que no son un hecho propio: misma fuente y fechas. */
const like = (f, v, extra = {}) => f ? { src: f.src, url: f.url, asOf: f.asOf, got: f.got, stale: f.stale, ...extra, v } : null;

/* Situación en la fecha de un plazo: distancia en puntos al primer rival y, para cada rival, cuándo publicó el líder
   un modelo de su nivel. Son fechas observadas, no una conversión de puntos en meses. */
function standing(f, label) {
  if (!f?.lead) return { label, value: fact(f, pts), sub: '' };
  const name = cn;
  const rival = r => {
    const lr = r.leaderReached;
    const reach = !lr ? t('{name} no tenía hasta esa fecha un modelo de su nivel.', { name: esc(name(f.lead.key)) })
      : lr.date > r.date ? t('{name} no publicó un modelo de ese nivel hasta el {fmtDate} ({model}), después que el rival.', { name: esc(name(f.lead.key)), fmtDate: esc(fmtDate(lr.date)), model: esc(lr.model) })
      : t('{name} había publicado un modelo de ese nivel el {fmtDate} ({model}).', { name: esc(name(f.lead.key)), fmtDate: esc(fmtDate(lr.date)), model: esc(lr.model) });
    return `<b>${esc(name(r.key))}</b>${t(': {model}, {num}, publicado el {fmtDate}; {pts} por debajo{p5}. {reach}', { model: esc(r.model), num: num(r.eci, 1), fmtDate: esc(fmtDate(r.date)), pts: pts(r.gap), p5: r.overlap ? t(', con intervalos de confianza solapados') : '', reach })}`;
  };
  return {
    label, value: fact(f, pts),
    sub: `${t('Primero:')} <b>${esc(name(f.lead.key))}</b>${t(', {model}, {num}, publicado el {fmtDate}.', { model: esc(f.lead.model), num: num(f.lead.eci, 1), fmtDate: esc(fmtDate(f.lead.date)) })}`,
    list: f.rivals.map(rival)
  };
}

/* Índice de AA: mismas cuentas que el ECI, con la puntuación actual de cada modelo (scripts/collect.mjs, aaIndicators). */
const ptsAA = v => `${v < 0 ? '−' : ''}${t('{n} puntos AA', { n: num(Math.abs(v), 1) })}`;
const whoAA = b => b ? `${who(b)}, ${num(b.ii, 1)}${b.anun ? ` ${t('(pesos anunciados, aún sin descargar)')}` : ''}` : t('sin datos');
const ahead = (f, second) => f?.v < 0 ? ` ${t('Va por delante {second}.', { second })}` : f?.v === 0 ? ` ${t('Empatados.')}` : '';

/* Probabilidad de las réplicas bootstrap de Epoch (scripts/indicadores.mjs, ediBlock), con su marca de fuente. */
const odds = p => t('{p1} del ajuste de Epoch{src}', { p1: p.v >= 100 ? t('todas las {num} réplicas', { num: num(p.samples, 0) }) : p.v <= 0 ? t('ninguna de las {num} réplicas', { num: num(p.samples, 0) }) : t('el {num} % de las {p2} réplicas', { num: num(p.v, 0), p2: num(p.samples, 0) }), src: src(p) });
/* Laboratorios: en cuántas réplicas tiene el mejor modelo cada uno de los dos primeros. */
function labsOdds(I, f) {
  const p = f.prob, second = (I.eci?.labs || []).find(l => l.org === f.second?.org);
  const pc = v => v >= 100 ? t('en todas') : v <= 0 ? t('en ninguna') : t('en el {num} %', { num: num(v, 0) });
  return ` ${t('El mejor modelo es de {org} en {odds}{p3}.', { org: esc(f.first.org), odds: odds(p), p3: second?.pFirst != null ? t(', y de {org} {pc}', { org: esc(second.org), pc: pc(second.pFirst) }) : '' })}`;
}

/* Cada entrada devuelve { label, value, sub } o { label, list, sub }. value y list ya llevan su marca de fuente. */
const REG = {
  'aa.gapUsCn': (I) => {
    const f = I.aa?.gapUsCn;
    return { label: t('Distancia EE. UU. − China (índice AA)'), value: fact(f, ptsAA) + incTag(f), sub: f?.us && f?.cn ? t('{whoAA} frente a {p2}.{ahead}{incNote}', { whoAA: whoAA(f.us), p2: whoAA(f.cn), ahead: ahead(f, t('China')), incNote: incNote(f) }) : '' };
  },
  'aa.gapClosedOpen': (I) => {
    const f = I.aa?.gapClosedOpen;
    return { label: t('Distancia cerrados − abiertos (índice AA)'), value: fact(f, ptsAA) + incTag(f), sub: f?.closed && f?.open ? t('{a} frente a {b}.{ahead}{dl}{inc}', { a: whoAA(f.closed), b: whoAA(f.open), ahead: ahead(f, t('el mejor abierto')), dl: f.openDl && f.vDl != null ? ` ${t('Con pesos ya descargables, el mejor es {whoAA}: {num} puntos AA.', { whoAA: whoAA(f.openDl), num: num(f.vDl, 1) })}` : '', inc: incNote(f) }) : '' };
  },
  'aa.gapLabs': (I) => {
    const f = I.aa?.gapLabs;
    return { label: t('Distancia entre los dos primeros laboratorios (índice AA)'), value: fact(f, ptsAA) + incTag(f), sub: f?.first && f?.second ? t('{whoAA} frente a {p2}.{incNote}', { whoAA: whoAA(f.first), p2: whoAA(f.second), incNote: incNote(f) }) : '' };
  },
  'aa.rate12m': (I) => {
    const f = I.aa?.rate12m;
    return { label: t('Avance de la frontera en 12 meses (índice AA)'), value: fact(f, v => `+${num(v, 1)} puntos AA`) + incTag(f), sub: f?.from && f?.to ? t('De {whoAA}, publicado el {fmtDate}, a {p3}. Cada modelo con su puntuación actual.{incNote}', { whoAA: whoAA(f.from), fmtDate: esc(fmtDate(f.from.date)), p3: whoAA(f.to), incNote: incNote(f, f.since) }) : '' };
  },
  'eci.frontier': (I) => ({ label: t('Mejor modelo (ECI)'), value: fact(I.eci?.frontier, v => num(v, 1)), sub: I.eci?.frontier?.model ? esc(I.eci.frontier.model) : '' }),
  'eci.rate12m': (I) => {
    const f = I.eci?.rate12m;
    return { label: t('Avance de la frontera en 12 meses (ECI)'), value: fact(f, v => `+${num(v, 1)} puntos ECI`), sub: f?.from && f?.to ? t('De {a}, {ea}, a {b}, {eb}.', { a: who(f.from), ea: num(f.from.eci, 1), b: who(f.to), eb: num(f.to.eci, 1) }) : '' };
  },
  'eci.gapUsCn': (I) => {
    const f = I.eci?.gapUsCn;
    return { label: t('Distancia EE. UU. − China (ECI)'), value: fact(f, pts), sub: f?.us && f?.cn ? t('{a} frente a {b}. País de la organización según Epoch.{odds}', { a: who(f.us), b: who(f.cn), odds: f.prob ? ` ${t('EE. UU. sigue por delante en {odds}.', { odds: odds(f.prob) })}` : '' }) : '' };
  },
  'eci.gapClosedOpen': (I) => {
    const f = I.eci?.gapClosedOpen;
    return { label: t('Distancia cerrados − abiertos (ECI)'), value: fact(f, pts), sub: f?.closed && f?.open ? t('{a} frente a {b}.{odds}', { a: who(f.closed), b: who(f.open), odds: f.prob ? ` ${t('El mejor cerrado sigue por delante en {odds}.', { odds: odds(f.prob) })}` : '' }) : '' };
  },
  'eci.gapLabs': (I) => {
    const f = I.eci?.gapLabs;
    return {
      label: t('Distancia entre los dos primeros laboratorios (ECI)'), value: fact(f, pts),
      sub: f?.first && f?.second ? t('{who} frente a {p2}.{p3}', { who: who(f.first), p2: who(f.second), p3: f.prob ? labsOdds(I, f) : f.overlap ? t(' Sus intervalos de confianza se solapan: no puede afirmarse cuál va primero.') : '' }) : ''
    };
  },
  'eci.agent0': (I) => {
    const a = I.eci?.agent0, f = I.eci?.frontier;
    if (!a?.closed || !a?.open) return { label: t('Mejor cerrado (31 dic 2025) y mejor abierto (30 abr 2026)'), value: nd(), sub: '' };
    return {
      label: t('Mejor cerrado (31 dic 2025) y mejor abierto (30 abr 2026)'),
      value: t('{c} y {o}{src}', { c: num(a.closed.eci, 1), o: num(a.open.eci, 1), src: src(like(f, 1, { asOf: f?.got?.slice(0, 10), note: t('ECI de Epoch AI') })) }),
      sub: t('{a} y {b}.', { a: who(a.closed), b: who(a.open) })
    };
  },
  'eci.rivals2025': (I) => standing(I.eci?.rivals2025, t('Distancia entre los dos primeros laboratorios a 31 dic 2025')),
  'eci.usCn2026': (I) => standing(I.eci?.usCn2026, t('Distancia EE. UU. − China a 31 ago 2026')),
  'edi.open': (I) => {
    const f = I.edi?.open;
    return {
      label: t('Evaluaciones del ECI que el mejor modelo aún no resuelve a medias'),
      value: fact(f, v => t('{num} de {p2}', { num: num(v, 0), p2: num(f.of, 0) })),
      sub: f?.v != null && f.top ? t('{names}Su dificultad, según Epoch, supera el ECI de {model} ({eci}): el modelo de Epoch le prevé menos de la mitad del camino entre el azar y el techo de cada prueba.', { names: f.names.length ? `${f.names.map(esc).join(', ')}. ` : '', model: esc(f.top.model), eci: num(f.top.eci, 1) }) : ''
    };
  },
  'bench.saturated': (I) => {
    const f = I.bench?.saturated;
    return { label: t('Evaluaciones saturadas'), value: fact(f, v => t('{num} de {p2}', { num: num(v, 0), p2: num(f.of, 0) })), sub: t('Evaluaciones ejecutadas por Epoch, con al menos 5 modelos, cuyo mejor resultado llega al 90 %.') };
  },
  'bench.tasks': (I) => {
    const f = I.bench?.tasks;
    const rows = Array.isArray(f?.v) ? f.v.slice(0, 8) : [];
    return { label: t('Mejor resultado por evaluación (Epoch)'), list: rows.map(r => `${esc(r.task)}: <b>${num(r.best, 1)} %</b> · ${esc(r.model)}${src(f)}`), sub: rows.length ? '' : nd() };
  },
  'bench.sweBest': (I) => {
    const f = I.bench?.sweBest;
    return { label: t('Mejor SWE-bench Verified (ejecución de Epoch)'), value: fact(f, v => `${num(v, 1)} %`) + stopTag(f), sub: `${f?.model ? esc(f.model) + '.' : ''}${stopNote(f)}` };
  },
  'bench.mirror': (I) => {
    const f = I.bench?.mirror;
    return {
      label: t('Mejor resultado en MirrorCode (ejecución de Epoch)'),
      value: fact(f, v => `${num(v, 1)} %`) + stopTag(f),
      sub: f?.v != null ? t('{model}, publicado el {fmtDate}; {num} modelos medidos. Reimplementar programas enteros a partir de su comportamiento: a un ingeniero, algunas tareas le llevarían semanas.{stopNote}', { model: esc(f.model), fmtDate: esc(fmtDate(f.asOf)), num: num(f.models, 0), stopNote: stopNote(f) }) : ''
    };
  },
  'bench.swe85': (I) => {
    const f = I.bench?.swe85;
    return { label: t('Primer modelo con al menos un 85 % en SWE-bench Verified'), value: fact(f, v => esc(fmtDate(v))), sub: f?.model ? t('{model}, {num} %. Fecha de publicación del modelo.', { model: esc(f.model), num: num(f.score, 1) }) : t('Ningún modelo llega al 85 % en las ejecuciones de Epoch.') };
  },
  'bench.sweMid2025': (I) => {
    const f = I.bench?.sweMid2025;
    return { label: t('Mejor SWE-bench Verified de un modelo publicado hasta el 30 jun 2025'), value: fact(f, v => `${num(v, 1)} %`), sub: f?.model ? esc(f.model) : '' };
  },
  'dc.now': (I) => {
    const f = I.dc?.now;
    return { label: t('Potencia de TI en servicio en los centros que sigue Epoch'), value: fact(f, mw), sub: f?.v != null ? t('{num} centros · {mh100}. Potencia de los equipos, sin refrigeración ni pérdidas. No es el total mundial.', { num: num(f.n, 0), mh100: mh100(f.h100e) }) : '' };
  },
  'dc.capex': (I) => {
    const f = I.dc?.now;
    return { label: t('Coste de capital de esos centros'), value: f?.capexB ? t('{num} mil millones de ${src}', { num: num(f.capexB, 0), src: src(like(f, f.capexB)) }) : nd(), sub: t('Estimación de Epoch, en dólares de 2025.') };
  },
  'dc.plan': (I) => {
    const f = I.dc?.plan;
    if (!f || f.v == null || !f.today) return { label: t('Calendario estimado de potencia'), value: fact(f), sub: '' };
    return {
      label: t('Calendario estimado de potencia'),
      value: t('{mw} hoy → {p2} a fin de 2026 → {p3} a fin de 2027{src}', { mw: mw(f.today.mw), p2: mw(f.end2026.mw), p3: mw(f.end2027.mw), src: src(f) }),
      sub: t('Estimación de Epoch para {num} centros a partir de obras, permisos y anuncios, hasta {fmtDate}. Suma otra columna de Epoch («Power (MW)»){p3}: probablemente incluye refrigeración y pérdidas (inferencia del observatorio).', { num: num(f.centres, 0), fmtDate: esc(fmtDate(f.lastDate)), p3: I.dc?.now?.v != null ? t(', que hoy da {mw} frente a {p2} de potencia de TI', { mw: mw(f.today.mw), p2: mw(I.dc.now.v) }) : '' })
    };
  },
  'dc.top': (I) => {
    const f = I.dc?.now, rows = I.dc?.top || [];
    return { label: t('Centros con más potencia en servicio'), list: rows.map(r => `${esc(r.name)}${r.owner ? ` · ${esc(r.owner)}` : ''}${r.country ? ` · ${esc(tr(PAIS[r.country] || r.country))}` : ''}: <b>${mw(r.mw)}</b>${src(like(f, r.mw))}`), sub: rows.length ? '' : nd() };
  },
  'chips.cum': (I) => {
    const f = I.chips?.cum;
    return {
      label: t('Chips de IA entregados, acumulado'), value: fact(f, mh100),
      sub: f?.v != null ? t('Desde {fmtDate}; {mh100} en los últimos cuatro trimestres. Suma de medianas: entregados no es instalados.{p3}', { fmtDate: esc(fmtDate(f.since)), mh100: mh100(f.last4), p3: f.incomplete ? t(' El último trimestre está incompleto.') : '' }) : ''
    };
  },
  'chips.tdp': (I) => {
    const f = I.chips?.cum;
    return { label: t('Consumo nominal (TDP) de esos chips'), value: f?.tdpGW ? `${num(f.tdpGW, 1)} GW${src(like(f, f.tdpGW))}` : nd(), sub: t('Epoch estima que la instalación completa necesita aproximadamente el doble.') };
  },
  'chips.byDesignerCountry': (I) => {
    const c = I.chips?.byDesignerCountry, f = I.chips?.cum;
    const tot = c ? (c.US || 0) + (c.CN || 0) + (c.otros || 0) : 0;
    if (!tot) return { label: t('Por país del diseñador del chip'), value: nd(), sub: '' };
    const pc = k => `${cn(k)} ${num(c[k] / tot * 100, 0)} %`;
    return { label: t('Por país del diseñador del chip'), value: `${['US', 'CN', 'otros'].map(pc).join(' · ')}${src(like(f, tot))}`, sub: t('Por país del diseñador, no por país donde se usan los chips.') };
  },
  'chips.makers': (I) => {
    const f = I.chips?.cum, rows = (I.chips?.makers || []).slice(0, 6);
    return { label: t('Por fabricante'), list: rows.map(r => `${esc(r.maker)}${r.country ? ` (${esc(cn(r.country))})` : ''}: <b>${mh100(r.h100e)}</b>${src(like(f, r.h100e))}`), sub: rows.length ? '' : nd() };
  },
  'companies.leader': (I) => {
    const f = I.companies?.leader;
    return { label: t('Mayores ingresos anualizados'), value: fact(f, usdB), sub: f?.company ? t('{company} · {p2} · confianza de Epoch: {p3}.', { company: esc(f.company), p2: esc(f.type || t('tipo sin datos')), p3: esc(f.confidence || t('sin datos')) }) : '' };
  },
  'companies.openai2025': (I) => {
    const f = I.companies?.openai2025;
    return { label: t('OpenAI, último dato hasta el 31 dic 2025'), value: fact(f, usdB), sub: f?.v != null ? t('{type}, a {fecha}.', { type: esc(f.type || t('ingresos anualizados')), fecha: esc(fmtDate(f.asOf)) }) : t('Epoch no recoge ingresos de OpenAI hasta esa fecha.') };
  },
  'companies.revenue': (I) => {
    const rows = I.companies?.revenue || [];
    return { label: t('Ingresos anualizados por empresa (último dato)'), list: rows.map(f => `${esc(f.company)}: <b>${usdB(f.v)}</b> · ${esc(fmtDate(f.asOf))}${src(f)}`), sub: rows.length ? t('Informes recopilados por Epoch; tipo de ingreso y confianza en la marca de fuente.') : nd() };
  },
  'companies.usage': (I) => {
    const rows = I.companies?.usage || [];
    return { label: t('Usuarios activos declarados'), list: rows.map(f => `${esc(f.company)}${f.product ? ` · ${esc(f.product)}` : ''}: <b>${f.v >= 1e6 ? `${num(f.v / 1e6, 0)} M` : num(f.v, 0)}</b> (${esc(f.period || t('periodo sin datos'))})${src(f)}`), sub: rows.length ? t('Cifras que declaran las propias empresas, recopiladas por Epoch.') : nd() };
  },
  'metr.sota': (I) => {
    const f = I.metr?.sota;
    return {
      label: t('Horizonte al 80 % del modelo puntero (METR)'),
      value: fact(f, v => `${num(v, 1)} h`) + stopTag(f),
      sub: f?.v != null ? t('Intervalo {num}–{p2} h; al 50 %: {p3} h. {p4}, publicado el {fmtDate}. Horas de trabajo de un experto humano, no horas de autonomía.{stopNote}', { num: num(f.p80?.lo, 1), p2: num(f.p80?.hi, 1), p3: num(f.p50?.est, 1), p4: esc(f.key || ''), fmtDate: esc(fmtDate(f.asOf)), stopNote: stopNote(f) }) : ''
    };
  },
  'metr.ratio': (I) => {
    const f = I.metr?.sota;
    return { label: t('Relación entre los horizontes al 80 % y al 50 %'), value: f?.ratio != null ? `${num(f.ratio, 2)}${src(like(f, f.ratio))}${stopTag(f)}` : nd(), sub: t('Cuanto más baja, más ancha es la franja de tareas que el agente sólo completa a veces.{stopNote}', { stopNote: stopNote(f) }) };
  }
};

export const hasIndicator = key => key in REG;
/* Etiqueta y valor (con su marca de fuente) de un indicador, sin la explicación: para resúmenes. */
export const indicatorBrief = (ind, key) => REG[key] ? REG[key](ind || {}) : { label: key, value: nd() };

/* Fila de indicador para una ficha (dl). */
export function indicatorRow(ind, key) {
  const r = REG[key] ? REG[key](ind || {}) : { label: key, value: nd(), sub: '' };
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
