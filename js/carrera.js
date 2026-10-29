/* Vista «La carrera»: distancias en la frontera y seis frentes. Cada uno empieza por qué sabemos, qué ha cambiado y qué
   cambiaría la lectura; después, gráficos, indicadores, hechos con fuente y la lectura marcada como interpretación. */
import { t, tn, tr, L } from './i18n.js';
import { esc, fmtDate, dateFmt, num, nd, aaRace, aaCoverage, coverageText, aaIndexName, AA_LINK, quote } from './fmt.js';
import { indicatorRow, indicatorKpi, indicatorBrief, mw, mh100, usdB, usdBs, PAIS } from './indicadores.js';
import { gaps, hbars, columns, dotci, recordChart, ediMap, tip } from './charts.js';
import { logoFor } from './logos.js';

const $ = s => document.querySelector(s);
let bound = false;
export const estado = k => ({ abierta: t('Hipótesis abierta'), confirmada: t('Hipótesis confirmada'), debilitada: t('Hipótesis debilitada') }[k] || k);
const estadoWord = k => ({ abierta: t('abierta'), confirmada: t('confirmada'), debilitada: t('debilitada') }[k] || k);
const verif = k => ({ 'lectura directa': t('leído en la fuente'), buscador: t('comprobado a través de un buscador: la web de la fuente no admite lectura automática') }[k] || k);

/* Fecha de un dato curado: día, mes o «sin datos». */
export const curDate = s => !s ? t('sin datos') : /^\d{4}-\d{2}$/.test(s) ? dateFmt({ month: 'short', year: 'numeric' }).format(new Date(s + '-01T00:00:00Z')) : fmtDate(s);

export function factItem(h) {
  return `<li><p>${esc(tr(h.texto))}</p><div class="prov">${t('Fuente:')} <a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(tr(h.fuente))}</a> · ${t('dato: {fecha}', { fecha: esc(curDate(h.fecha)) })} · ${t('consulta: {fecha}', { fecha: esc(curDate(h.consulta)) })}${h.verificacion ? ` · <span class="verif v-${h.verificacion === 'buscador' ? 'buscador' : 'directa'}">${esc(verif(h.verificacion))}</span>` : ''}</div></li>`;
}

/* Cabecera de cada frente: qué sabemos (sus indicadores principales), qué ha cambiado (lo que detecta el recolector al
   comparar recogidas, y los cambios de estado de la hipótesis) y qué cambiaría la lectura. */
function resumen(f, ind, log) {
  const sab = ind ? (f.sabemos || []).map(k => { const r = indicatorBrief(ind, k); return `<li><span class="k">${esc(r.label)}</span><b>${r.value}</b></li>`; }).join('') : '';
  const own = (log?.vigilados || []).filter(v => f.indicadores.includes(v.path));
  const vig = own.filter(v => !v.detenida && !v.incompleto), stopped = own.filter(v => v.detenida), incomp = own.filter(v => v.incompleto && !v.detenida);
  const ev = (log?.events || []).filter(e => e.kind === 'indicador' && f.indicadores.includes(e.data?.path)).map(e => ({ fecha: e.detected, html: `${esc(L(e, 'what'))}${e.src?.url ? ` <a href="${esc(e.src.url)}" target="_blank" rel="noopener">${esc(e.src.name)}</a>` : ''}` }))
    .concat((f.lectura.historial || []).slice(1).map((h, i) => ({ fecha: h.fecha, html: `${h.estado === f.lectura.historial[i].estado
      ? t('Hipótesis revisada: sigue {estado}.', { estado: esc(estadoWord(h.estado)) })
      : t('La hipótesis pasa a «{estado}».', { estado: esc(estadoWord(h.estado)) })}${h.nota ? ` ${esc(tr(h.nota))}` : ''}` })))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lab = v => { const x = L(v, 'label'); return esc(/^(?!Epoch\b)[A-Z][a-z]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x); };   // minúscula inicial salvo siglas y nombres propios
  const desde = vig.map(v => v.desde).sort()[0];
  const cambios = ev.length
    ? `<ul class="sum-ev">${ev.slice(0, 4).map(x => `<li><span>${esc(curDate(x.fecha))}</span>${x.html}</li>`).join('')}</ul>${ev.length > 4 ? `<p class="m-sub">${t('Y {p1} cambios anteriores.', { p1: ev.length - 4 })}</p>` : ''}`
    : `<p>${vig.length ? t('Ningún cambio en sus indicadores vigilados desde el {curDate}.', { curDate: esc(curDate(desde)) }) : t('El recolector no vigila todavía ningún indicador de este frente.')}</p>`;
  return `<div class="front-sum">
    <div><span class="lbl">${t('Qué sabemos')}</span>${sab ? `<ul class="sum-ind">${sab}</ul>` : `<p>${nd()}</p>`}<p class="m-sub">${t('Detalle, fuentes y hechos, más abajo.')}</p></div>
    <div><span class="lbl">${t('Qué ha cambiado')}</span>${cambios}${vig.length ? `<p class="m-sub">${t('Se comparan en cada recogida: {p1}.', { p1: vig.map(v => lab(v)).join('; ') })}</p>` : ''}${stopped.length ? `<p class="m-sub">${t('Ya no se comparan, porque la serie se ha detenido: {p1}.', { p1: stopped.map(v => t('{p1} (último modelo medido, del {curDate})', { p1: lab(v), curDate: esc(curDate(v.detenida)) })).join('; ') })}</p>` : ''}${incomp.length ? `<p class="m-sub">${t('No se comparan mientras su cobertura sea incompleta: {p1}.', { p1: incomp.map(v => lab(v)).join('; ') })}</p>` : ''}</div>
    <div class="sum-lect"><span class="lbl">${t('Qué cambiaría la lectura · interpretación')}</span><p><b>${t('La reforzaría:')}</b> ${esc(tr(f.lectura.reforzaria))}</p><p><b>${t('La debilitaría:')}</b> ${esc(tr(f.lectura.debilitaria))}</p></div>
  </div>`;
}

/* Vigencia de la lectura: su última revisión es la última entrada del historial (sin historial, la fecha en que se formuló),
   y se avisa si el recolector ha detectado después cambios en los indicadores del frente. Un cambio detectado el mismo día
   de la revisión se da por visto. */
function vigencia(f, log) {
  const l = f.lectura, last = (l.historial || []).at(-1)?.fecha || l.desde;
  const later = (log?.events || []).filter(e => e.kind === 'indicador' && f.indicadores.includes(e.data?.path) && (e.detected || '').slice(0, 10) > last).length;
  const desde = (log?.vigilados || []).filter(v => f.indicadores.includes(v.path) && !v.detenida).map(v => v.desde).sort()[0];
  return `<p class="rev${later ? ' rev-old' : ''}">${t('Revisada el {curDate}.{p2}', { curDate: esc(curDate(last)), p2: later
    ? ` ${t('Después, el recolector ha detectado {p1} en los indicadores de este frente (en «Qué ha cambiado»); la lectura no se ha vuelto a revisar.', { p1: tn(later, ['un cambio', '{n} cambios']) })}`
    : !desde ? ''
    : desde > last ? ` ${t('Sus indicadores se vigilan desde el {curDate}, sin cambios desde entonces.', { curDate: esc(curDate(desde)) })}`
    : t(' Sin cambios en los indicadores vigilados de este frente desde entonces.') })}</p>`;
}

function lectura(f, log) {
  const l = f.lectura;
  const hist = (l.historial || []).map(h => `<li><b>${esc(curDate(h.fecha))}</b> · ${esc(estado(h.estado))}${h.nota ? `. ${esc(tr(h.nota))}` : ''}</li>`).join('');
  return `<aside class="lectura" aria-label="${t('Lectura Moloch: interpretación')}">
    <div class="lectura-head"><span class="tag k-lectura">${t('Lectura Moloch · interpretación')}</span><span class="estado e-${esc(l.estado)}">${esc(estado(l.estado))}</span></div>
    ${vigencia(f, log)}
    <p class="hip">${esc(tr(l.hipotesis))}</p>
    <dl class="lect">
      <dt>${t('Quién gana acelerando')}</dt><dd>${esc(tr(l.gana))}</dd>
      <dt>${t('Qué se pierde frenando')}</dt><dd>${esc(tr(l.pierde))}</dd>
      <dt>${t('Qué costes desplaza')}</dt><dd>${esc(tr(l.desplaza))}</dd>
    </dl>
    <p class="m-sub">${t('Qué la reforzaría o la debilitaría, al principio del frente.')}</p>
    <details class="hist"><summary>${t('Historial de la hipótesis (desde {curDate})', { curDate: esc(curDate(l.desde)) })}</summary><ol>${hist}</ol></details>
  </aside>`;
}

/* Gráficos de cada frente: { title, note, url, draw(el) }. Sólo con datos recogidos; si faltan, el frente no lleva gráfico. */
const quarter = d => { const dt = new Date(d + 'T00:00:00Z'); return `${t('T')}${Math.floor(dt.getUTCMonth() / 3) + 1} ${dt.getUTCFullYear()}`; };
const EPOCH = (name, url, label = true) => `${label ? `${t('Fuente:')} ` : ''}<a href="${esc(url)}" target="_blank" rel="noopener">${t('Epoch AI, {name}', { name: esc(name).replace(/«(.*?)»/g, (m, x) => quote(x)) })}</a>, CC BY 4.0.`;
/* Entregas anuales de chips desde 2024 y extrapolación trimestral hasta END: cada trimestre futuro = el mismo trimestre
   del año anterior × crecimiento interanual. Central: últimos cuatro trimestres completos frente a los cuatro anteriores;
   horquilla: menor y mayor cociente interanual de esos cuatro trimestres. */
const CHIPS_END = 2033;
function chipsTrend(ch) {
  if (!ch?.quarters?.length) return null;
  const q = (ch.cum?.incomplete ? ch.quarters.slice(0, -1) : ch.quarters).map(r => ({ d: r.d, v: r.h100e }));
  if (q.length < 8) return null;
  const sum = a => a.reduce((s, r) => s + r.v, 0);
  const last4 = q.slice(-4), prev4 = q.slice(-8, -4);
  const yoy = last4.map((r, i) => r.v / prev4[i].v);
  const G = { v: sum(last4) / sum(prev4), lo: Math.min(...yoy), hi: Math.max(...yoy) };
  const ym = d => { const dt = new Date(d + 'T00:00:00Z'); return [dt.getUTCFullYear(), Math.floor(dt.getUTCMonth() / 3)]; };
  const W = ch.cum?.tdpGW && ch.cum?.v ? ch.cum.tdpGW * 1e9 / ch.cum.v : null; // vatios nominales por H100e, con los chips ya entregados
  const years = new Map(), add = (y, k, v) => { const e = years.get(y) || { real: 0, nReal: 0, v: 0, lo: 0, hi: 0 }; if (k === 'real') { e.real += v.v; e.nReal++; e.v += v.v; e.lo += v.v; e.hi += v.v; } else { e.v += v.v; e.lo += v.lo; e.hi += v.hi; } years.set(y, e); };
  for (const r of q) { const [y] = ym(r.d); if (y >= 2024) add(y, 'real', { v: r.v }); }
  // Serie de trabajo por escenario: los últimos cuatro trimestres reales y lo que se va extrapolando.
  const win = { v: last4.map(r => r.v), lo: last4.map(r => r.v), hi: last4.map(r => r.v) };
  let [y, k] = ym(q[q.length - 1].d);
  for (;;) {
    k++; if (k > 3) { k = 0; y++; }
    if (y > CHIPS_END) break;
    const next = {};
    for (const s of ['v', 'lo', 'hi']) { next[s] = win[s].shift() * G[s]; win[s].push(next[s]); }
    add(y, 'proj', next);
  }
  const mh = v => t('{num} M de H100e', { num: num(v / 1e6, v < 1e8 ? 1 : 0) });
  const rows = [...years.entries()].sort((a, b) => a[0] - b[0]).map(([yr, e]) => {
    const full = e.nReal === 4;
    return {
      label: String(yr), v: e.v, cls: full ? '' : 'proj', real: full ? null : e.real, lo: full ? null : e.lo, hi: full ? null : e.hi,
      tip: tip(`${yr}${full ? '' : e.nReal ? t(' · en parte extrapolado') : ' · extrapolado'}`, [
        [full ? t('Entregados') : t('Tendencia central'), mh(e.v)],
        [t('Horquilla'), full ? null : `${mh(e.lo)} – ${mh(e.hi)}`],
        ['Ya entregado (trimestres completos)', !full && e.nReal ? mh(e.real) : null],
        [t('Consumo nominal de esos chips'), W ? t('{n} GW con la eficiencia actual{menos}', { n: num(e.v * W / 1e9, 0), menos: full ? '' : t('; menos si mejora') }) : null]
      ])
    };
  });
  return { rows, g: G.v, lo: G.lo, hi: G.hi };
}

/* Mapa de dificultad: cada evaluación del ECI en su fecha de publicación y a la altura de su dificultad (EDI), frente al
   mejor ECI publicado; en la ficha, lo que el modelo de Epoch prevé para los líderes y el mejor resultado medido. */
function ediChart(m) {
  if (!m?.v?.length || !m.line?.length) return null;
  const top = m.top, year = m.line[0].d.slice(0, 4), since = `${year}-01-01`;
  const recent = m.v.filter(b => b.d && b.d >= since), old = m.v.filter(b => !b.d || b.d < since);
  const up = recent.filter(b => top && b.edi > top.eci), oldUp = old.filter(b => top && b.edi > top.eci);
  const same = m.cn && m.open && m.cn.model === m.open.model;
  const pc = v => v != null ? `${num(v, 0)} %` : null;
  const foot = [top && t('El mejor: {model} ({num}).', { model: top.model, num: num(top.eci, 1) }), m.cn && t('Mejor chino{y}: {model} ({num}).', { y: same ? t(' y mejor abierto') : '', model: m.cn.model, num: num(m.cn.eci, 1) }), !same && m.open && t('Mejor abierto: {model} ({num}).', { model: m.open.model, num: num(m.open.eci, 1) }),
    t('Porcentaje del camino entre el azar (0) y el techo de la prueba (100); «previsto» es lo que da el modelo del ECI, no una medición.')].filter(Boolean).join(' ');
  const items = recent.map(b => ({
    n: b.name, d: b.d, v: b.edi, lo: b.lo, hi: b.hi, up: !!top && b.edi > top.eci,
    tip: tip(b.name, [
      [t('Publicada'), fmtDate(b.d)],
      [t('Dificultad (EDI)'), `${num(b.edi, 1)}${b.lo != null ? ` (${num(b.lo, 1)}–${num(b.hi, 1)})` : ''}`],
      [t('Previsto: el mejor'), pc(b.pred?.top)],
      [same ? t('Previsto: chino y abierto') : t('Previsto: mejor chino'), pc(b.pred?.cn)],
      same ? null : [t('Previsto: mejor abierto'), pc(b.pred?.open)],
      [t('Medido: mejor resultado'), b.best ? `${num(b.best.v, 0)} % (${b.best.model})` : null],
      [t('Modelos medidos'), b.best ? num(b.best.models, 0) : null]
    ], foot)
  }));
  const oldTxt = !old.length ? '' : oldUp.length
    ? ` ${t('De las {num} evaluaciones anteriores a {year}, que no aparecen, {p3} siguen por encima.', { num: num(old.length, 0), year, p3: num(oldUp.length, 0) })}`
    : ` ${t('Las {num} evaluaciones anteriores a {year} no aparecen: todas quedan por debajo.', { num: num(old.length, 0), year })}`;
  return {
    title: t('Dificultad de cada evaluación frente al mejor modelo'),
    wide: true,
    note: `${t('Cada punto es una evaluación del ECI publicada desde {year}, en su fecha y a la altura de su dificultad según Epoch (EDI): el ECI con el que su modelo prevé recorrer la mitad del camino entre el azar y el techo de la prueba. La raya vertical es su intervalo del 90 %. La línea es el mejor ECI publicado hasta cada fecha.', { year })}${top ? ` ${t('En naranja, las {num} que siguen por encima del mejor modelo de hoy, {model} ({p3}).', { num: num(up.length, 0), model: esc(top.model), p3: num(top.eci, 1) })}` : ''}${oldTxt} ${t('Al pasar el cursor, lo que el modelo de Epoch prevé en esa prueba para el mejor modelo, el mejor chino y el mejor abierto, y el mejor resultado medido: así se ve qué significan unos puntos de ECI.')} ${EPOCH(t('datos del ajuste del ECI'), m.url || 'https://epoch.ai/benchmarks/eci')}`,
    draw: el => ediMap(el, items, m.line, { today: m.asOf })
  };
}

const CHARTS = {
  computo: I => [
    I.chips?.quarters?.length && {
      title: t('Chips de IA entregados por trimestre'),
      note: t('{EPOCH} En equivalentes de H100 (H100e).{p2}', { EPOCH: EPOCH('«AI chip sales»', I.chips.cum?.url || 'https://epoch.ai/data/ai-chip-sales'), p2: I.chips.cum?.incomplete ? t(' El último trimestre, en gris, está incompleto.') : '' }),
      draw: el => {
        const q = I.chips.quarters;
        let acc = 0;
        columns(el, q.map((r, i) => {
          acc += r.h100e;
          const part = i === q.length - 1 && I.chips.cum?.incomplete;
          return { label: quarter(r.d), v: r.h100e, cls: part ? 'part' : '', tip: tip(quarter(r.d), [[t('Entregados'), mh100(r.h100e)], [t('Acumulado desde el inicio de la serie'), mh100(acc)], [t('Estado'), part ? 'trimestre incompleto' : null]]) };
        }), { fmt: v => v >= 1e6 ? `${num(v / 1e6, 0)} M` : `${num(v / 1e3, 0)} K`, yLabel: 'H100e', every: 4, aria: t('Chips de IA entregados por trimestre') });
      }
    },
    chipsTrend(I.chips) && (() => {
      const trend = chipsTrend(I.chips), x = v => num(v, 1).replace(/,0$/, '');
      return {
        title: t('Chips de IA entregados por año: tendencia extrapolada hasta {p1}', { p1: trend.rows[trend.rows.length - 1].label }),
        wide: true,
        note: `${t('Extrapolación propia, no una previsión de Epoch: los datos son los de {EPOCH} Cada trimestre futuro repite el crecimiento interanual reciente: ×{x} al año en la barra (los cuatro últimos trimestres completos frente a los cuatro anteriores), y la horquilla va del menor al mayor crecimiento interanual de esos cuatro trimestres (×{p3} a ×{p4}). Escala logarítmica: cada marca es diez veces la anterior. Negro: entregado;', { EPOCH: EPOCH('«AI chip sales»', I.chips.cum?.url || 'https://epoch.ai/data/ai-chip-sales', false), x: x(trend.g), p3: x(trend.lo), p4: x(trend.hi) })} <span class="proj-key"></span>${t('rayado: extrapolado, como en todo el observatorio. En el año en curso, la parte negra es lo ya entregado en trimestres completos. Empieza en 2024, el primer año en que la serie cubre todos los fabricantes. Muestra lo que pasaría si nada frenara la tendencia; no es lo que espera nadie. Al pasar el ratón se ve el consumo nominal que tendrían esos chips con la eficiencia actual, para compararlo con la potencia prevista del frente 02.')}`,
        draw: el => columns(el, trend.rows, { log: true, left: 86, fmt: v => `${num(v / 1e6, 0)} M`, yLabel: t('H100e al año'), aria: t('Chips de IA entregados por año, con la tendencia extrapolada') })
      };
    })(),
    I.chips?.makers?.length && {
      title: t('Chips entregados por fabricante, acumulado'),
      note: t('{EPOCH} Naranja: diseñador estadounidense. Verde: chino.', { EPOCH: EPOCH('«AI chip sales»', I.chips.cum?.url || 'https://epoch.ai/data/ai-chip-sales') }),
      draw: el => hbars(el, I.chips.makers.map(r => ({ label: r.maker, v: r.h100e, cls: r.country === 'US' ? 'us' : r.country === 'CN' ? 'cn' : 'dim', value: mh100(r.h100e), tip: tip(r.maker, [[t('Acumulado'), mh100(r.h100e)], [t('País del diseñador'), r.country === 'US' ? t('EE. UU.') : r.country === 'CN' ? t('China') : r.country]]) })), { aria: t('Chips por fabricante') })
    }
  ],
  energia: I => [
    I.dc?.countries?.length && {
      title: t('Potencia de TI en servicio por país'),
      note: t('{EPOCH} Sólo los centros que sigue Epoch; no es el total mundial.', { EPOCH: EPOCH('«AI data centers»', I.dc.now?.url || 'https://epoch.ai/data/data-centers') }),
      draw: el => hbars(el, I.dc.countries.map(r => ({ label: r.country === 'US' ? t('EE. UU.') : r.country === 'CN' ? t('China') : t('Otros países'), v: r.mw, cls: r.country === 'US' ? 'us' : r.country === 'CN' ? 'cn' : 'dim', value: mw(r.mw), tip: tip(r.country === 'US' ? t('EE. UU.') : r.country === 'CN' ? t('China') : t('Otros países'), [[t('Potencia de TI'), mw(r.mw)], [t('Centros'), num(r.n, 0)], [t('Cómputo'), mh100(r.h100e)]]) })), { aria: t('Potencia por país') })
    },
    I.dc?.top?.length && {
      title: t('Los centros con más potencia en servicio'),
      note: EPOCH('«AI data centers»', I.dc.now?.url || 'https://epoch.ai/data/data-centers'),
      draw: el => hbars(el, I.dc.top.map(r => ({ label: r.name, v: r.mw, value: mw(r.mw), tip: tip(r.name, [[t('Potencia de TI'), mw(r.mw)], [t('Propietario'), r.owner], [t('Usuarios'), r.users], [t('País'), tr(PAIS[r.country] || r.country)], [t('Cómputo'), r.h100e ? mh100(r.h100e) : null]]) })), { aria: t('Centros con más potencia') })
    },
    I.dc?.plan?.series?.length && {
      title: t('Potencia prevista hasta {p1}, según el calendario de Epoch', { p1: new Date((I.dc.plan.seriesEnd || I.dc.plan.lastDate) + 'T00:00:00Z').getUTCFullYear() }),
      wide: true,
      note: `${t('{EPOCH} Potencia de cada centro al final de cada trimestre: lo pasado (negro) está construido; lo futuro (', { EPOCH: EPOCH(t('«AI data centers», calendario de obras'), I.dc.plan.url || 'https://epoch.ai/data/data-centers') })}<span class="proj-key"></span>${t('rayado, como todo lo previsto en el observatorio) es la estimación de Epoch a partir de obras, permisos y anuncios de {num} centros. Es la columna «Power (MW)» del calendario, probablemente con refrigeración y pérdidas, por eso supera a la potencia de TI de arriba. El calendario no recoge entradas nuevas más allá de este punto, así que la serie se corta ahí; cuanto más lejos, menos proyectos conocidos: puede quedarse corto por obras aún no anunciadas o pasarse si las anunciadas se retrasan.', { num: num(I.dc.plan.centres, 0) })}`,
      draw: el => {
        const today = I.dc.plan.asOf || new Date().toISOString().slice(0, 10);
        columns(el, I.dc.plan.series.map(p => {
          const fut = p.d > today;
          return { label: quarter(p.d), v: p.mw, cls: fut ? 'proj' : '', tip: tip(`${quarter(p.d)}${fut ? ` · ${t('previsto')}` : ''}`, [[t('Potencia total'), mw(p.mw)], [t('EE. UU.'), mw(p.US)], [t('China'), mw(p.CN)], [t('Otros o sin país'), mw(p.otros)], [t('Centros con dato'), num(p.centres, 0)]]) };
        }), { fmt: v => `${num(v / 1000, 0)} GW`, yLabel: t('potencia'), every: 4, aria: t('Potencia prevista de los centros de datos por trimestre') });
      }
    }
  ],
  agentes: I => [
    I.bench?.mirrorSeries?.v?.length && !I.bench.mirrorSeries.detenida && {
      title: t('Mejor resultado en MirrorCode'),
      note: t('Ejecuciones propias de {EPOCH} Por fecha de publicación del modelo. Reimplementar programas enteros a partir de su comportamiento; a un ingeniero, algunas tareas le llevarían semanas. La línea discontinua es el umbral con el que el observatorio contrasta el hito de AI 2027 «Horizonte de unas tres semanas de trabajo» (lectura propia: los autores lo plantean con el horizonte de METR).', { EPOCH: EPOCH('«MirrorCode»', I.bench.mirrorSeries.url, false) }),
      draw: el => recordChart(el, I.bench.mirrorSeries.v, { yLabel: t('% de la puntuación'), unit: ' %', ref: { v: 80, label: t('Umbral del observatorio para fin de 2026: 80 %') } })
    },
    I.bench?.sweSeries?.v?.length && !I.bench.sweSeries.detenida && {
      title: t('Mejor resultado en SWE-bench Verified'),
      note: t('Ejecuciones propias de {EPOCH} Por fecha de publicación del modelo. La línea discontinua es la predicción de AI 2027 para mediados de 2025.', { EPOCH: EPOCH('«SWE-bench Verified»', I.bench.sweSeries.url, false) }),
      draw: el => recordChart(el, I.bench.sweSeries.v, { yLabel: t('% resuelto'), unit: ' %', ref: { v: 85, label: t('AI 2027: 85 % a mediados de 2025') } })
    }
  ],
  evaluacion: I => [ediChart(I.edi?.map)],
  economia: I => [
    I.companies?.revenue?.length && {
      title: t('Ingresos anualizados por empresa, último dato'),
      note: t('{EPOCH} Informes de prensa y de las empresas; las fechas y el tipo de cifra varían, véanse en cada barra.', { EPOCH: EPOCH('«AI companies»', 'https://epoch.ai/data/ai-companies') }),
      draw: el => hbars(el, I.companies.revenue.map(f => ({ label: `${f.company} · ${fmtDate(f.asOf)}`, v: f.v, value: usdBs(f.v), icon: logoFor({ org: f.company }), tip: tip(f.company, [[t('Ingresos anualizados'), usdB(f.v)], [t('Fecha del dato'), fmtDate(f.asOf)], [t('Tipo'), f.type], [t('Confianza de Epoch'), f.confidence]], '', logoFor({ org: f.company })) })), { aria: t('Ingresos anualizados por empresa') })
    }
  ],
  coordinacion: I => [
    I.aa?.labs?.length && {
      title: t('Mejor modelo de cada laboratorio (índice AA)'),
      note: t('{AA_LINK}, {aaIndexName}, consultado el {fmtDate}; publicado con su permiso. Cada laboratorio con su modelo mejor puntuado del catálogo; AA no publica intervalo de confianza.', { AA_LINK, aaIndexName: esc(aaIndexName(I.aa.gapLabs?.version)), fmtDate: esc(fmtDate(I.aa.gapLabs?.got)) }),
      draw: el => hbars(el, I.aa.labs.map(r => ({ label: r.org, v: r.ii, value: num(r.ii, 1), icon: logoFor({ name: r.model, org: r.org }), tip: tip(r.org, [[t('Modelo'), r.model], [t('Índice AA'), num(r.ii, 1)], [t('Pesos'), r.anun ? t('abiertos (anunciados en su descripción de OpenRouter; aún no descargables)') : null], [t('Publicado'), fmtDate(r.date)]], '', logoFor({ name: r.model, org: r.org })) })), { aria: t('Mejor índice de AA por laboratorio') })
    },
    I.eci?.labs?.length && {
      title: t('Mejor modelo de cada laboratorio (ECI)'),
      note: t('{EPOCH} La raya es el intervalo de confianza del 90 %: si dos rayas se solapan, no puede afirmarse cuál va primero.{firstOdds}', { EPOCH: EPOCH('«Epoch Capabilities Index»', I.eci.frontier?.url || 'https://epoch.ai/benchmarks/eci'), firstOdds: firstOdds(I) }),
      draw: el => dotci(el, I.eci.labs.map(r => ({ label: r.org, v: r.eci, lo: r.ci?.[0] ?? null, hi: r.ci?.[1] ?? null, icon: logoFor({ name: r.model, org: r.org }), tip: tip(r.org, [[t('Modelo'), r.model], ['ECI', num(r.eci, 1)], [t('Intervalo'), r.ci?.[0] != null ? `${num(r.ci[0], 1)}–${num(r.ci[1], 1)}` : null], [t('Primero en las réplicas'), r.pFirst != null ? `${num(r.pFirst, 0)} %` : null], [t('Publicado'), fmtDate(r.date)]], '', logoFor({ name: r.model, org: r.org })) })), { unit: t('puntos ECI'), aria: t('Mejor ECI por laboratorio') })
    }
  ]
};
/* Reparto del primer puesto en las réplicas bootstrap de Epoch: en cuántas tiene cada laboratorio el mejor modelo de todos. */
function firstOdds(I) {
  const n = I.eci?.gapLabs?.prob?.samples, labs = (I.eci?.labs || []).filter(l => l.pFirst != null);
  if (!n || !labs.length) return '';
  const some = labs.filter(l => l.pFirst > 0).sort((a, b) => b.pFirst - a.pFirst);
  const pc = v => v >= 100 ? t('en todas') : t('en el {num} %', { num: num(v, 0) });
  return ` ${t('En las {num} réplicas con que Epoch repite el ajuste, el mejor modelo de todos es {p2}{p3}.', { num: num(n, 0), p2: some.map(l => t('de {org} {pc}', { org: esc(l.org), pc: pc(l.pFirst) })).join(', ').replace(/, ([^,]*)$/, ` ${t('y')} $1`), p3: some.length < labs.length ? t('; del resto de laboratorios, en ninguna') : '' })}`;
}
const chartsOf = (f, ind) => ind && CHARTS[f.id] ? CHARTS[f.id](ind).filter(Boolean) : [];

function front(f, i, ind, log) {
  const n = String(i + 1).padStart(2, '0');
  return `<article class="front" id="frente-${esc(f.id)}" aria-labelledby="fh-${esc(f.id)}">
    <header class="front-head"><span class="front-n">${n}</span><div><h3 id="fh-${esc(f.id)}">${esc(tr(f.titulo))}</h3><p class="q">${esc(tr(f.pregunta))}</p></div></header>
    ${resumen(f, ind, log)}
    ${chartsOf(f, ind).length ? `<div class="front-charts">${chartsOf(f, ind).map((c, k) => `<figure class="fchart${c.wide ? ' wide' : ''}"><figcaption>${esc(c.title)}</figcaption><div class="chart" id="fc-${esc(f.id)}-${k}"></div><p class="note">${c.note}</p></figure>`).join('')}</div>` : ''}
    <div class="front-body">
      <div class="front-data">
        <h4>${t('Datos')}</h4>
        ${ind ? `<dl class="ind">${f.indicadores.map(k => indicatorRow(ind, k)).join('')}</dl>` : `<div class="empty">${t('{ND}: todavía no hay indicadores recogidos (data/indicadores.json).', { ND: nd() })}</div>`}
        <h4>${t('Hechos con fuente')}</h4>
        <ul class="facts">${f.hechos.map(factItem).join('')}</ul>
        ${f.faltan?.length ? `<h4>${t('Lo que el observatorio no puede medir todavía')}</h4><ul class="gaps-list">${f.faltan.map(x => `<li>${esc(tr(x))}</li>`).join('')}</ul>` : ''}
      </div>
      ${lectura(f, log)}
    </div>
  </article>`;
}

export function renderCarrera(d) {
  const ind = d.ind?.ind || null, cur = d.carrera;
  if (!cur) {
    $('#ca-fronts').innerHTML = `<div class="empty">${t('No se han podido cargar los frentes (data/curated/carrera.json).')}</div>`;
    return;
  }
  // Primero el índice de AA, al día: puntúa un modelo a los pocos días de salir y cuenta laboratorios que Epoch no mide.
  const aa = aaRace(d.catalog), cov = d.catalog.epochFrontier?.points?.length ? aaCoverage(d.catalog, aa.from) : null;
  $('#ca-kpis-aa').innerHTML = ind?.aa?.gapUsCn
    ? ['aa.gapUsCn', 'aa.gapClosedOpen', 'aa.gapLabs', 'aa.rate12m'].map(k => indicatorKpi(ind, k)).join('')
    : `<div class="empty">${t('{ND}: la recogida todavía no ha calculado las distancias con el índice de AA.', { ND: nd() })}</div>`;
  if (!gaps($('#ca-gaps-aa'), aa.series, { unit: t('puntos del índice AA'), short: t('puntos AA'), bands: cov?.gaps })) $('#ca-gaps-aa').innerHTML = `<div class="chart-empty">${t('Sin datos suficientes para la serie.')}</div>`;
  $('#ca-gaps-aa-note').innerHTML = `<span class="lbl">${t('Cómo se calcula')}</span>${t('Hoy y a cada fin de mes, el mejor {aaIndexName} publicado hasta esa fecha por laboratorios de cada país o por modelos con pesos cerrados y abiertos, y su diferencia; los dos primeros laboratorios, con el mejor modelo de cada uno. País del laboratorio y pesos según el catálogo del observatorio: cuenta como abierto un modelo que su descripción en OpenRouter presenta como de pesos abiertos, aunque aún no se puedan descargar. Es una reconstrucción hecha hoy, no una serie medida en cada fecha: cada modelo va en su fecha según AA, con su índice de hoy, y sólo cuentan los {n} del catálogo (los que siguen en OpenRouter y los que AA ya puntúa sin API pública), así que en los meses antiguos faltan los retirados.{coverageText} Las distancias no se convierten en meses, y las escalas AA y ECI no son comparables. Datos de {AA_LINK}, publicados con su permiso.', { aaIndexName: esc(aaIndexName(aa.ver)), n: aa.n, coverageText: esc(coverageText(cov)), AA_LINK })}`;
  // Debajo, la serie larga del ECI de Epoch: más modelos históricos e intervalos de confianza, pero llega con semanas de retraso.
  if (ind) {
    $('#ca-kpis').innerHTML = ['eci.gapUsCn', 'eci.gapClosedOpen', 'eci.gapLabs', 'eci.rate12m'].map(k => indicatorKpi(ind, k)).join('');
    const s = ind.eci?.series;
    const ok = s ? gaps($('#ca-gaps'), s.points) : false;
    if (!ok) $('#ca-gaps').innerHTML = `<div class="chart-empty">${t('Sin datos suficientes para la serie.')}</div>`;
    $('#ca-gaps-note').innerHTML = `<span class="lbl">${t('Cómo se calcula')}</span>${t('Para cada fin de mes, el mejor ECI publicado hasta esa fecha por organizaciones de cada país (o con pesos cerrados y abiertos, según la clasificación de Epoch), y su diferencia. Epoch trata como misma capacidad dos modelos a menos de 1 punto. Epoch puntúa los modelos semanas después de salir y no mide algunos laboratorios: por eso sus cifras van por detrás de las de arriba. La probabilidad de cada tarjeta sale de las réplicas bootstrap que publica Epoch: repite el ajuste entero remuestreando los resultados de cada modelo, y se cuenta en cuántas réplicas sigue por delante el primero. Las distancias no se convierten en meses. Fuente:')} <a href="https://epoch.ai/benchmarks/eci" target="_blank" rel="noopener">${t('Epoch AI')}</a>, CC BY 4.0.`;
  } else {
    $('#ca-kpis').innerHTML = `<div class="empty">${t('{ND}: todavía no hay indicadores recogidos.', { ND: nd() })}</div>`;
    $('#ca-gaps').innerHTML = '';
  }
  $('#ca-index').innerHTML = cur.frentes.map((f, i) => `<a href="#frente-${esc(f.id)}" data-jump><i>${String(i + 1).padStart(2, '0')}</i>${esc(tr(f.titulo))}</a>`).join('');
  $('#ca-fronts').innerHTML = cur.frentes.map((f, i) => front(f, i, ind, d.evLog)).join('');
  for (const f of cur.frentes) chartsOf(f, ind).forEach((c, k) => c.draw(document.getElementById(`fc-${f.id}-${k}`)));
  /* Los anclajes internos no deben cambiar de vista: se desplaza sin tocar el hash. El escuchador va en #ca-index, que no se
     reemplaza al cambiar de idioma, y se enlaza una sola vez. */
  if (bound) return;
  bound = true;
  $('#ca-index').addEventListener('click', e => {
    const a = e.target.closest('a[data-jump]');
    if (!a) return;
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
