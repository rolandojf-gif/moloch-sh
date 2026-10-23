/* Vista «La carrera»: distancias en la frontera y seis frentes. Cada uno empieza por qué sabemos, qué ha cambiado y qué
   cambiaría la lectura; después, gráficos, indicadores, hechos con fuente y la lectura marcada como interpretación. */
import { esc, fmtDate, num, ND } from './fmt.js';
import { indicatorRow, indicatorKpi, indicatorBrief, mw, mh100, usdB, PAIS } from './indicadores.js';
import { gaps, hbars, columns, dotci, recordChart, tip } from './charts.js';

const $ = s => document.querySelector(s);
export const ESTADO = { abierta: 'Hipótesis abierta', confirmada: 'Hipótesis confirmada', debilitada: 'Hipótesis debilitada' };
const VERIF = { 'lectura directa': 'leído en la fuente', buscador: 'comprobado a través de un buscador: la web de la fuente no admite lectura automática' };

/* Fecha de un dato curado: día, mes o «sin datos». */
export const curDate = s => !s ? 'sin datos' : /^\d{4}-\d{2}$/.test(s) ? new Date(s + '-01T00:00:00Z').toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : fmtDate(s);

export function factItem(h) {
  return `<li><p>${esc(h.texto)}</p><div class="prov">Fuente: <a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.fuente)}</a> · dato: ${esc(curDate(h.fecha))} · consulta: ${esc(curDate(h.consulta))}${h.verificacion ? ` · <span class="verif v-${h.verificacion === 'buscador' ? 'buscador' : 'directa'}">${esc(VERIF[h.verificacion] || h.verificacion)}</span>` : ''}</div></li>`;
}

/* Cabecera de cada frente: qué sabemos (sus indicadores principales), qué ha cambiado (lo que detecta el recolector al
   comparar recogidas, y los cambios de estado de la hipótesis) y qué cambiaría la lectura. */
function resumen(f, ind, log) {
  const sab = ind ? (f.sabemos || []).map(k => { const r = indicatorBrief(ind, k); return `<li><span class="k">${esc(r.label)}</span><b>${r.value}</b></li>`; }).join('') : '';
  const own = (log?.vigilados || []).filter(v => f.indicadores.includes(v.path));
  const vig = own.filter(v => !v.detenida), stopped = own.filter(v => v.detenida);
  const ev = (log?.events || []).filter(e => e.kind === 'indicador' && f.indicadores.includes(e.data?.path)).map(e => ({ fecha: e.detected, html: `${esc(e.what)}${e.src?.url ? ` <a href="${esc(e.src.url)}" target="_blank" rel="noopener">${esc(e.src.name)}</a>` : ''}` }))
    .concat((f.lectura.historial || []).slice(1).map(h => ({ fecha: h.fecha, html: `La hipótesis pasa a «${esc((ESTADO[h.estado] || h.estado).toLowerCase())}».${h.nota ? ` ${esc(h.nota)}` : ''}` })))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const desde = vig.map(v => v.desde).sort()[0];
  const cambios = ev.length
    ? `<ul class="sum-ev">${ev.slice(0, 4).map(x => `<li><span>${esc(curDate(x.fecha))}</span>${x.html}</li>`).join('')}</ul>${ev.length > 4 ? `<p class="m-sub">Y ${ev.length - 4} cambios anteriores.</p>` : ''}`
    : `<p>${vig.length ? `Ningún cambio en sus indicadores vigilados desde el ${esc(curDate(desde))}.` : 'El recolector no vigila todavía ningún indicador de este frente.'}</p>`;
  return `<div class="front-sum">
    <div><span class="lbl">Qué sabemos</span>${sab ? `<ul class="sum-ind">${sab}</ul>` : `<p>${ND}</p>`}<p class="m-sub">Detalle, fuentes y hechos, más abajo.</p></div>
    <div><span class="lbl">Qué ha cambiado</span>${cambios}${vig.length ? `<p class="m-sub">Se comparan en cada recogida: ${vig.map(v => esc(v.label.charAt(0).toLowerCase() + v.label.slice(1))).join('; ')}.</p>` : ''}${stopped.length ? `<p class="m-sub">Ya no se comparan, porque la serie se ha detenido: ${stopped.map(v => `${esc(v.label.charAt(0).toLowerCase() + v.label.slice(1))} (último modelo medido, del ${esc(curDate(v.detenida))})`).join('; ')}.</p>` : ''}</div>
    <div class="sum-lect"><span class="lbl">Qué cambiaría la lectura · interpretación</span><p><b>La reforzaría:</b> ${esc(f.lectura.reforzaria)}</p><p><b>La debilitaría:</b> ${esc(f.lectura.debilitaria)}</p></div>
  </div>`;
}

function lectura(l) {
  const hist = (l.historial || []).map(h => `<li><b>${esc(curDate(h.fecha))}</b> · ${esc(ESTADO[h.estado] || h.estado)}${h.nota ? `. ${esc(h.nota)}` : ''}</li>`).join('');
  return `<aside class="lectura" aria-label="Lectura Moloch: interpretación">
    <div class="lectura-head"><span class="tag k-lectura">Lectura Moloch · interpretación</span><span class="estado e-${esc(l.estado)}">${esc(ESTADO[l.estado] || l.estado)}</span></div>
    <p class="hip">${esc(l.hipotesis)}</p>
    <dl class="lect">
      <dt>Quién gana acelerando</dt><dd>${esc(l.gana)}</dd>
      <dt>Qué se pierde frenando</dt><dd>${esc(l.pierde)}</dd>
      <dt>Qué costes desplaza</dt><dd>${esc(l.desplaza)}</dd>
    </dl>
    <p class="m-sub">Qué la reforzaría o la debilitaría, al principio del frente.</p>
    <details class="hist"><summary>Historial de la hipótesis (desde ${esc(curDate(l.desde))})</summary><ol>${hist}</ol></details>
  </aside>`;
}

/* Gráficos de cada frente: { title, note, url, draw(el) }. Sólo con datos recogidos; si faltan, el frente no lleva gráfico. */
const quarter = d => { const t = new Date(d + 'T00:00:00Z'); return `T${Math.floor(t.getUTCMonth() / 3) + 1} ${t.getUTCFullYear()}`; };
const EPOCH = (name, url) => `Fuente: <a href="${esc(url)}" target="_blank" rel="noopener">Epoch AI, ${esc(name)}</a>, CC BY 4.0.`;
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
  const ym = d => { const t = new Date(d + 'T00:00:00Z'); return [t.getUTCFullYear(), Math.floor(t.getUTCMonth() / 3)]; };
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
  const mh = v => `${num(v / 1e6, v < 1e8 ? 1 : 0)} M de H100e`;
  const rows = [...years.entries()].sort((a, b) => a[0] - b[0]).map(([yr, e]) => {
    const full = e.nReal === 4;
    return {
      label: String(yr), v: e.v, cls: full ? '' : 'proj', real: full ? null : e.real, lo: full ? null : e.lo, hi: full ? null : e.hi,
      tip: tip(`${yr}${full ? '' : e.nReal ? ' · en parte extrapolado' : ' · extrapolado'}`, [
        [full ? 'Entregados' : 'Tendencia central', mh(e.v)],
        ['Horquilla', full ? null : `${mh(e.lo)} – ${mh(e.hi)}`],
        ['Ya entregado (trimestres completos)', !full && e.nReal ? mh(e.real) : null],
        ['Consumo nominal de esos chips', W ? `${num(e.v * W / 1e9, 0)} GW con la eficiencia actual${full ? '' : '; menos si mejora'}` : null]
      ])
    };
  });
  return { rows, g: G.v, lo: G.lo, hi: G.hi };
}

const CHARTS = {
  computo: I => [
    I.chips?.quarters?.length && {
      title: 'Chips de IA entregados por trimestre',
      note: `${EPOCH('«AI chip sales»', I.chips.cum?.url || 'https://epoch.ai/data/ai-chip-sales')} En equivalentes de H100 (H100e).${I.chips.cum?.incomplete ? ' El último trimestre, en gris, está incompleto.' : ''}`,
      draw: el => {
        const q = I.chips.quarters;
        let acc = 0;
        columns(el, q.map((r, i) => {
          acc += r.h100e;
          const part = i === q.length - 1 && I.chips.cum?.incomplete;
          return { label: quarter(r.d), v: r.h100e, cls: part ? 'part' : '', tip: tip(quarter(r.d), [['Entregados', mh100(r.h100e)], ['Acumulado desde el inicio de la serie', mh100(acc)], ['Estado', part ? 'trimestre incompleto' : null]]) };
        }), { fmt: v => v >= 1e6 ? `${num(v / 1e6, 0)} M` : `${num(v / 1e3, 0)} K`, yLabel: 'H100e', every: 4, aria: 'Chips de IA entregados por trimestre' });
      }
    },
    chipsTrend(I.chips) && (() => {
      const t = chipsTrend(I.chips), x = v => num(v, 1).replace(/,0$/, '');
      return {
        title: `Chips de IA entregados por año: tendencia extrapolada hasta ${t.rows[t.rows.length - 1].label}`,
        wide: true,
        note: `Extrapolación propia, no una previsión de Epoch: los datos son los de ${EPOCH('«AI chip sales»', I.chips.cum?.url || 'https://epoch.ai/data/ai-chip-sales').replace('Fuente: ', '')} Cada trimestre futuro repite el crecimiento interanual reciente: ×${x(t.g)} al año en la barra (los cuatro últimos trimestres completos frente a los cuatro anteriores), y la horquilla va del menor al mayor crecimiento interanual de esos cuatro trimestres (×${x(t.lo)} a ×${x(t.hi)}). Escala logarítmica: cada marca es diez veces la anterior. Negro: entregado; <span class="proj-key"></span>rayado: extrapolado, como en todo el observatorio. En el año en curso, la parte negra es lo ya entregado en trimestres completos. Empieza en 2024, el primer año en que la serie cubre todos los fabricantes. Muestra lo que pasaría si nada frenara la tendencia; no es lo que espera nadie. Al pasar el ratón se ve el consumo nominal que tendrían esos chips con la eficiencia actual, para compararlo con la potencia prevista del frente 02.`,
        draw: el => columns(el, t.rows, { log: true, left: 86, fmt: v => `${num(v / 1e6, 0)} M`, yLabel: 'H100e al año', aria: 'Chips de IA entregados por año, con la tendencia extrapolada' })
      };
    })(),
    I.chips?.makers?.length && {
      title: 'Chips entregados por fabricante, acumulado',
      note: `${EPOCH('«AI chip sales»', I.chips.cum?.url || 'https://epoch.ai/data/ai-chip-sales')} Naranja: diseñador estadounidense. Verde: chino.`,
      draw: el => hbars(el, I.chips.makers.map(r => ({ label: r.maker, v: r.h100e, cls: r.country === 'US' ? 'us' : r.country === 'CN' ? 'cn' : 'dim', value: mh100(r.h100e), tip: tip(r.maker, [['Acumulado', mh100(r.h100e)], ['País del diseñador', r.country === 'US' ? 'EE. UU.' : r.country === 'CN' ? 'China' : r.country]]) })), { aria: 'Chips por fabricante' })
    }
  ],
  energia: I => [
    I.dc?.countries?.length && {
      title: 'Potencia de TI en servicio por país',
      note: `${EPOCH('«AI data centers»', I.dc.now?.url || 'https://epoch.ai/data/data-centers')} Sólo los centros que sigue Epoch; no es el total mundial.`,
      draw: el => hbars(el, I.dc.countries.map(r => ({ label: r.country === 'US' ? 'EE. UU.' : r.country === 'CN' ? 'China' : 'Otros países', v: r.mw, cls: r.country === 'US' ? 'us' : r.country === 'CN' ? 'cn' : 'dim', value: mw(r.mw), tip: tip(r.country === 'US' ? 'EE. UU.' : r.country === 'CN' ? 'China' : 'Otros países', [['Potencia de TI', mw(r.mw)], ['Centros', num(r.n, 0)], ['Cómputo', mh100(r.h100e)]]) })), { aria: 'Potencia por país' })
    },
    I.dc?.top?.length && {
      title: 'Los centros con más potencia en servicio',
      note: EPOCH('«AI data centers»', I.dc.now?.url || 'https://epoch.ai/data/data-centers'),
      draw: el => hbars(el, I.dc.top.map(r => ({ label: r.name, v: r.mw, value: mw(r.mw), tip: tip(r.name, [['Potencia de TI', mw(r.mw)], ['Propietario', r.owner], ['Usuarios', r.users], ['País', PAIS[r.country] || r.country], ['Cómputo', r.h100e ? mh100(r.h100e) : null]]) })), { aria: 'Centros con más potencia' })
    },
    I.dc?.plan?.series?.length && {
      title: `Potencia prevista hasta ${new Date((I.dc.plan.seriesEnd || I.dc.plan.lastDate) + 'T00:00:00Z').getUTCFullYear()}, según el calendario de Epoch`,
      wide: true,
      note: `${EPOCH('«AI data centers», calendario de obras', I.dc.plan.url || 'https://epoch.ai/data/data-centers')} Potencia de cada centro al final de cada trimestre: lo pasado (negro) está construido; lo futuro (<span class="proj-key"></span>rayado, como todo lo previsto en el observatorio) es la estimación de Epoch a partir de obras, permisos y anuncios de ${num(I.dc.plan.centres, 0)} centros. Es la columna «Power (MW)» del calendario, probablemente con refrigeración y pérdidas, por eso supera a la potencia de TI de arriba. El calendario no recoge entradas nuevas más allá de este punto, así que la serie se corta ahí; cuanto más lejos, menos proyectos conocidos: puede quedarse corto por obras aún no anunciadas o pasarse si las anunciadas se retrasan.`,
      draw: el => {
        const today = I.dc.plan.asOf || new Date().toISOString().slice(0, 10);
        columns(el, I.dc.plan.series.map(p => {
          const fut = p.d > today;
          return { label: quarter(p.d), v: p.mw, cls: fut ? 'proj' : '', tip: tip(`${quarter(p.d)}${fut ? ' · previsto' : ''}`, [['Potencia total', mw(p.mw)], ['EE. UU.', mw(p.US)], ['China', mw(p.CN)], ['Otros o sin país', mw(p.otros)], ['Centros con dato', num(p.centres, 0)]]) };
        }), { fmt: v => `${num(v / 1000, 0)} GW`, yLabel: 'potencia', every: 4, aria: 'Potencia prevista de los centros de datos por trimestre' });
      }
    }
  ],
  agentes: I => [
    I.bench?.mirrorSeries?.v?.length && !I.bench.mirrorSeries.detenida && {
      title: 'Mejor resultado en MirrorCode',
      note: `Ejecuciones propias de ${EPOCH('«MirrorCode»', I.bench.mirrorSeries.url).replace('Fuente: ', '')} Por fecha de publicación del modelo. Reimplementar programas enteros a partir de su comportamiento; a un ingeniero, algunas tareas le llevarían semanas. La línea discontinua es el umbral con el que el observatorio contrasta el hito de AI 2027 «Horizonte de unas tres semanas de trabajo» (lectura propia: los autores lo plantean con el horizonte de METR).`,
      draw: el => recordChart(el, I.bench.mirrorSeries.v, { yLabel: '% de la puntuación', unit: ' %', ref: { v: 80, label: 'Umbral del observatorio para fin de 2026: 80 %' } })
    },
    I.bench?.sweSeries?.v?.length && !I.bench.sweSeries.detenida && {
      title: 'Mejor resultado en SWE-bench Verified',
      note: `Ejecuciones propias de ${EPOCH('«SWE-bench Verified»', I.bench.sweSeries.url).replace('Fuente: ', '')} Por fecha de publicación del modelo. La línea discontinua es la predicción de AI 2027 para mediados de 2025.`,
      draw: el => recordChart(el, I.bench.sweSeries.v, { yLabel: '% resuelto', unit: ' %', ref: { v: 85, label: 'AI 2027: 85 % a mediados de 2025' } })
    }
  ],
  evaluacion: I => [
    I.bench?.tasks?.v?.length && {
      title: 'Mejor resultado en cada evaluación',
      note: `${EPOCH('«Benchmarking»', I.bench.tasks.url)} Evaluaciones ejecutadas por Epoch con al menos 5 modelos. En rojo, las saturadas (90 % o más).`,
      draw: el => hbars(el, I.bench.tasks.v.slice().sort((a, b) => b.best - a.best).map(t => ({ label: t.task, v: t.best, cls: t.best >= 90 ? 'hit' : '', value: `${num(t.best, 1)} %`, tip: tip(t.task, [['Mejor resultado', `${num(t.best, 1)} %`], ['Modelo', t.model], ['Publicado', t.release ? fmtDate(t.release) : null], ['Modelos evaluados', num(t.models, 0)]]) })), { max: 100, ref: { v: 90, label: 'saturada' }, aria: 'Mejor resultado por evaluación' })
    }
  ],
  economia: I => [
    I.companies?.revenue?.length && {
      title: 'Ingresos anualizados por empresa, último dato',
      note: `${EPOCH('«AI companies»', 'https://epoch.ai/data/ai-companies')} Informes de prensa y de las empresas; las fechas y el tipo de cifra varían, véanse en cada barra.`,
      draw: el => hbars(el, I.companies.revenue.map(f => ({ label: `${f.company} · ${fmtDate(f.asOf)}`, v: f.v, value: usdB(f.v).replace(' mil millones de $', ' mil M$'), tip: tip(f.company, [['Ingresos anualizados', usdB(f.v)], ['Fecha del dato', fmtDate(f.asOf)], ['Tipo', f.type], ['Confianza de Epoch', f.confidence]]) })), { aria: 'Ingresos anualizados por empresa' })
    }
  ],
  coordinacion: I => [
    I.eci?.labs?.length && {
      title: 'Mejor modelo de cada laboratorio (ECI)',
      note: `${EPOCH('«Epoch Capabilities Index»', I.eci.frontier?.url || 'https://epoch.ai/benchmarks/eci')} La raya es el intervalo de confianza del 90 %: si dos rayas se solapan, no puede afirmarse cuál va primero.`,
      draw: el => dotci(el, I.eci.labs.map(r => ({ label: r.org, v: r.eci, lo: r.ci?.[0] ?? null, hi: r.ci?.[1] ?? null, tip: tip(r.org, [['Modelo', r.model], ['ECI', num(r.eci, 1)], ['Intervalo', r.ci?.[0] != null ? `${num(r.ci[0], 1)}–${num(r.ci[1], 1)}` : null], ['Publicado', fmtDate(r.date)]]) })), { unit: 'puntos ECI', aria: 'Mejor ECI por laboratorio' })
    }
  ]
};
const chartsOf = (f, ind) => ind && CHARTS[f.id] ? CHARTS[f.id](ind).filter(Boolean) : [];

function front(f, i, ind, log) {
  const n = String(i + 1).padStart(2, '0');
  return `<article class="front" id="frente-${esc(f.id)}" aria-labelledby="fh-${esc(f.id)}">
    <header class="front-head"><span class="front-n">${n}</span><div><h3 id="fh-${esc(f.id)}">${esc(f.titulo)}</h3><p class="q">${esc(f.pregunta)}</p></div></header>
    ${resumen(f, ind, log)}
    ${chartsOf(f, ind).length ? `<div class="front-charts">${chartsOf(f, ind).map((c, k) => `<figure class="fchart${c.wide ? ' wide' : ''}"><figcaption>${esc(c.title)}</figcaption><div class="chart" id="fc-${esc(f.id)}-${k}"></div><p class="note">${c.note}</p></figure>`).join('')}</div>` : ''}
    <div class="front-body">
      <div class="front-data">
        <h4>Datos</h4>
        ${ind ? `<dl class="ind">${f.indicadores.map(k => indicatorRow(ind, k)).join('')}</dl>` : `<div class="empty">${ND}: todavía no hay indicadores recogidos (data/indicadores.json).</div>`}
        <h4>Hechos con fuente</h4>
        <ul class="facts">${f.hechos.map(factItem).join('')}</ul>
        ${f.faltan?.length ? `<h4>Lo que el observatorio no puede medir todavía</h4><ul class="gaps-list">${f.faltan.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>
      ${lectura(f.lectura)}
    </div>
  </article>`;
}

export function renderCarrera(d) {
  const ind = d.ind?.ind || null, cur = d.carrera;
  if (!cur) {
    $('#ca-fronts').innerHTML = '<div class="empty">No se han podido cargar los frentes (data/curated/carrera.json).</div>';
    return;
  }
  if (ind) {
    $('#ca-kpis').innerHTML = ['eci.gapUsCn', 'eci.gapClosedOpen', 'eci.gapLabs', 'eci.rate12m'].map(k => indicatorKpi(ind, k)).join('');
    const s = ind.eci?.series;
    const ok = s ? gaps($('#ca-gaps'), s.points) : false;
    if (!ok) $('#ca-gaps').innerHTML = '<div class="chart-empty">Sin datos suficientes para la serie.</div>';
    $('#ca-gaps-note').innerHTML = `<span class="lbl">Cómo se calcula</span>Para cada fin de mes, el mejor ECI publicado hasta esa fecha por organizaciones de cada país (o con pesos cerrados y abiertos, según la clasificación de Epoch), y su diferencia. Epoch trata como misma capacidad dos modelos a menos de 1 punto. Las distancias no se convierten en meses. Fuente: <a href="https://epoch.ai/benchmarks/eci" target="_blank" rel="noopener">Epoch AI</a>, CC BY 4.0.`;
  } else {
    $('#ca-kpis').innerHTML = `<div class="empty">${ND}: todavía no hay indicadores recogidos.</div>`;
    $('#ca-gaps').innerHTML = '';
  }
  $('#ca-index').innerHTML = cur.frentes.map((f, i) => `<a href="#frente-${esc(f.id)}" data-jump><i>${String(i + 1).padStart(2, '0')}</i>${esc(f.titulo)}</a>`).join('');
  $('#ca-fronts').innerHTML = cur.frentes.map((f, i) => front(f, i, ind, d.evLog)).join('');
  for (const f of cur.frentes) chartsOf(f, ind).forEach((c, k) => c.draw(document.getElementById(`fc-${f.id}-${k}`)));
  /* Los anclajes internos no deben cambiar de vista: se desplaza sin tocar el hash. */
  $('#ca-index').addEventListener('click', e => {
    const a = e.target.closest('a[data-jump]');
    if (!a) return;
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
