/* Vista «AI 2027»: qué predice el escenario, en qué punto está cada predicción hoy y quién lo valora.
   Cada hito conserva la predicción original; las revisiones de los autores aparecen fechadas a su lado. */
import { esc, fmtDate } from './fmt.js';
import { indicatorRow } from './indicadores.js';
import { curDate } from './carrera.js';
import { hitoTimeline, tip } from './charts.js';

const $ = s => document.querySelector(s);
export const ESCALA = ['adelantado', 'compatible', 'retrasado', 'todavía no evaluable', 'sin evidencia suficiente'];
const cls = v => 'v-' + String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
const EV = { medida: 'Medida', declarada: 'Declarada', 'valoración de los autores': 'Valoración de los autores', contexto: 'Contexto' };
/* La escala en palabras de cualquiera. «Adelantado» o «retrasado» describen el ritmo frente al escenario, no si es bueno o malo. */
const PLAIN = {
  adelantado: 'Va por delante del escenario',
  compatible: 'Se cumple como preveía',
  retrasado: 'Va por detrás del escenario',
  'todavía no evaluable': 'Aún no ha llegado su fecha',
  'sin evidencia suficiente': 'No hay datos públicos para comprobarlo'
};
const plain = (v, due) => !v ? 'Sin valoración' : v.v === 'todavía no evaluable' && due ? 'Plazo vencido, todavía sin evaluar' : PLAIN[v.v] || v.v;

/* Valoración del observatorio: fija, o calculada por una regla del recolector (data/indicadores.json → checks). */
function resolve(val, checks) {
  if (!val?.regla) return val;
  const c = checks?.[val.regla];
  return c ? { ...val, v: c.v, texto: c.texto, fecha: c.fecha } : { ...val, v: 'sin evidencia suficiente', texto: 'La regla no ha podido calcularse en la última recogida.' };
}
const valOf = (h, quien, checks) => resolve((h.valoraciones || []).find(v => v.quien === quien), checks) || null;

const months = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / (30.44 * 86400e3));
function when(h, today) {
  const m = months(today, h.plazo);
  if (m > 0) return `faltan ${m === 1 ? 'un mes' : `${m} meses`}`;
  if (m < 0) return `venció hace ${m === -1 ? 'un mes' : `${-m} meses`}`;
  return h.plazo < today ? 'acaba de vencer' : 'vence este mes';
}

function evidence(e, ind) {
  const tag = `<span class="ev ev-${cls(e.tipo).slice(2)}">${esc(EV[e.tipo] || e.tipo)}</span>`;
  if (e.indicador) return `<li>${tag}<dl class="ind">${ind ? indicatorRow(ind, e.indicador) : '<div class="ind-row"><dd><span class="nd">sin datos</span></dd></div>'}</dl></li>`;
  return `<li>${tag}<p>${esc(e.texto)}</p><div class="prov">Fuente: <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.fuente || 'enlace')}</a> · dato: ${esc(curDate(e.fecha))}</div></li>`;
}

function hito(h, ind, checks, today) {
  const a = valOf(h, 'autores', checks), o = valOf(h, 'observatorio', checks);
  const due = h.plazo < today;
  const measured = (h.evidencia || []).filter(e => e.tipo === 'medida' && e.indicador);
  // Un hito vencido se valora con lo que había en su fecha; lo de hoy va aparte, como contexto.
  const atDue = measured.filter(e => e.momento === 'plazo'), now = measured.filter(e => e.momento !== 'plazo');
  const rows = list => list.length && ind ? `<dl class="ind">${list.map(e => indicatorRow(ind, e.indicador)).join('')}</dl>` : '';
  const rest = (h.evidencia || []).filter(e => !(e.tipo === 'medida' && e.indicador));
  const r = (h.revisiones || []).length;
  return `<article class="hito${due && o?.v === 'todavía no evaluable' ? ' overdue' : ''}" id="hito-${esc(h.id)}">
    <div class="verdict ${cls(o?.v)}"><span class="lbl">Valoración del observatorio</span><b>${esc(plain(o, due))}</b>${o?.regla ? '<small>Calculada con una regla explícita en cada recogida.</small>' : ''}</div>
    <div class="hito-main">
      <h4>${esc(h.titulo)}</h4>
      <div class="when">Para <b>${esc(h.plazo_texto)}</b> (${esc(fmtDate(h.plazo))}) · ${esc(when(h, today))}</div>
      <div class="hito-cols">
        <div><span class="lbl">Qué predecía</span><p>${esc(h.prediccion)}</p></div>
        ${due
          ? `<div><span class="lbl">Al vencer el plazo (${esc(fmtDate(h.plazo))})</span><p>${esc(o?.texto || 'Sin valoración del observatorio.')}</p>${rows(atDue)}
          ${now.length ? `<span class="lbl lbl-hoy">Y hoy (${esc(curDate(today))})</span>${rows(now)}` : ''}</div>`
          : `<div><span class="lbl">Dónde estamos${o?.fecha ? ` (${esc(curDate(o.fecha))})` : ''}</span><p>${esc(o?.texto || 'Sin valoración del observatorio.')}</p>${rows(measured)}</div>`}
      </div>
      <p class="authors"><span class="lbl">Qué dicen los autores</span>${a ? `<span class="val ${cls(a.v)}">${esc(a.v)}</span> ${esc(a.texto || '')}${a.url ? ` <a href="${esc(a.url)}" target="_blank" rel="noopener">Fuente</a>` : ''}` : 'No han publicado una valoración que el observatorio haya encontrado.'}</p>
      <details class="hito-more">
        <summary>Texto original, evidencia${r ? ' y revisiones' : ''}</summary>
        <p class="op"><span class="lbl">Dónde lo dice el escenario</span>${esc(h.seccion)} · <a href="${esc(h.url)}" target="_blank" rel="noopener">fuente de la predicción</a></p>
        ${h.cita ? `<blockquote lang="en">${esc(h.cita)}</blockquote>` : ''}
        ${h.operacionalizacion ? `<p class="op"><span class="lbl">Cómo se comprueba</span>${esc(h.operacionalizacion)}</p>` : ''}
        ${r ? `<div class="revs"><span class="lbl">Revisiones posteriores de los autores (no sustituyen la predicción original)</span><ol>${h.revisiones.map(x => `<li><b>${esc(curDate(x.fecha))}</b> · ${esc(x.texto)} <a href="${esc(x.url)}" target="_blank" rel="noopener">Fuente</a></li>`).join('')}</ol></div>` : ''}
        ${rest.length ? `<div class="evid"><span class="lbl">Otra evidencia</span><ul>${rest.map(e => evidence(e, ind)).join('')}</ul></div>` : ''}
        ${h.comparabilidad ? `<p class="op"><span class="lbl">Comparabilidad</span>${esc(h.comparabilidad)}</p>` : ''}
      </details>
    </div>
  </article>`;
}

function tally(lines, checks) {
  const rows = [['autores', 'Autores'], ['observatorio', 'Observatorio']].map(([q, label]) => {
    const cnt = Object.fromEntries([...ESCALA, null].map(k => [k, 0]));
    let total = 0;
    for (const l of lines) for (const h of l.hitos) { const v = valOf(h, q, checks); cnt[v ? v.v : null]++; total++; }
    const seg = [...ESCALA.filter(k => cnt[k]).map(k => `<span class="seg-${cls(k)}" style="flex:${cnt[k]}" title="${esc(`${k}: ${cnt[k]}`)}">${cnt[k]}</span>`),
      cnt[null] ? `<span class="seg-v-none" style="flex:${cnt[null]}" title="${esc(`sin valoración: ${cnt[null]}`)}">${cnt[null]}</span>` : ''].join('');
    return `<div class="tally-row"><span class="tally-k">${label}</span><div class="tally-bar" role="img" aria-label="${esc(`${label}: ${ESCALA.filter(k => cnt[k]).map(k => `${cnt[k]} ${k}`).join(', ')}${cnt[null] ? `, ${cnt[null]} sin valoración` : ''}`)}">${seg}</div><span class="tally-n">${total} hitos</span></div>`;
  }).join('');
  const legend = [...ESCALA.map(k => `<span><i class="seg-${cls(k)}"></i>${esc(k)}</span>`), '<span><i class="seg-v-none"></i>sin valoración publicada</span>'].join('');
  return `${rows}<div class="legend">${legend}</div>`;
}

/* Resumen a fecha de hoy, en frases. */
function status(all, checks, today, ritmo) {
  const due = all.filter(h => h.plazo < today), next = all.filter(h => h.plazo >= today).sort((x, y) => x.plazo.localeCompare(y.plazo));
  const cnt = k => due.filter(h => valOf(h, 'observatorio', checks)?.v === k).length;
  const parts = [['adelantado', 'va por delante', 'van por delante'], ['compatible', 'se cumple como preveía', 'se cumplen como preveían'], ['retrasado', 'va por detrás', 'van por detrás'], ['sin evidencia suficiente', 'no se puede comprobar con datos públicos', 'no se pueden comprobar con datos públicos'], ['todavía no evaluable', 'está sin evaluar', 'están sin evaluar']]
    .map(([k, one, many]) => [k, cnt(k), one, many]).filter(x => x[1]);
  const lastPace = ritmo?.puntos?.[ritmo.puntos.length - 1];
  const chips = parts.map(([k, n, one, many]) => `<li><span class="chip ${cls(k)}">${n}</span>${esc(n === 1 ? one : many)}</li>`).join('');
  return `<div class="st-block"><span class="lbl">A ${esc(fmtDate(today))}</span>
      <p class="st-big">De las <b>${due.length}</b> predicciones cuyo plazo ya ha pasado:</p><ul class="st-list">${chips}</ul></div>
    <div class="st-block"><span class="lbl">Lo que viene</span>
      <p class="st-big"><b>${next.length}</b> predicciones por llegar.</p>
      ${next[0] ? `<p>La próxima: <a href="#hito-${esc(next[0].id)}" data-jump>${esc(next[0].titulo)}</a>, para ${esc(next[0].plazo_texto)}.</p>` : ''}
      ${next.length > 1 && next[1].plazo === next[0].plazo ? `<p class="m-sub">Y ${next.filter(h => h.plazo === next[0].plazo).length - 1} más con la misma fecha.</p>` : ''}</div>
    ${lastPace ? `<div class="st-block"><span class="lbl">Ritmo según los propios autores</span>
      <p class="st-big"><b>${esc(lastPace.valor)}</b> de la velocidad del escenario.</p>
      <p>Su última estimación, del ${esc(curDate(lastPace.fecha))}. ${esc(ritmo.nota)} <a href="${esc(lastPace.url)}" target="_blank" rel="noopener">Fuente</a></p></div>` : ''}`;
}

export function renderAi2027(d) {
  const a = d.ai2027;
  if (!a) { $('#a7-lines').innerHTML = '<div class="empty">No se ha podido cargar el seguimiento (data/curated/ai2027.json).</div>'; return; }
  const ind = d.ind?.ind || null, checks = d.ind?.checks || {};
  const today = (d.ind?.generated || d.catalog.generated).slice(0, 10);
  const e = a.escenario;
  const all = a.lineas.flatMap(l => l.hitos.map(h => ({ ...h, lane: l.id })));

  $('#a7-scn').innerHTML = `<span class="lbl">Qué es AI 2027</span>
    <p><a href="${esc(e.url)}" target="_blank" rel="noopener"><b>${esc(e.titulo)}</b></a> es un relato publicado el ${esc(fmtDate(e.publicado))} por ${esc(e.autores)}. Cuenta, periodo a periodo, cómo la IA podría pasar de agentes que todavía tropiezan a mediados de 2025 a un programador sobrehumano en 2027, en una carrera entre una empresa estadounidense y una china, las dos ficticias.</p>
    <p>No asigna probabilidades: sus autores lo presentan como uno de varios futuros posibles. ${esc(e.nota)}</p>
    <blockquote lang="en">«${esc(e.cita)}»</blockquote>
    <p>Dos desenlaces: ${e.desenlaces.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.nombre)}</a>`).join(' y ')}.</p>
    <p class="st-how"><b>Qué hace esta página.</b> Toma ${all.length} predicciones concretas del relato, cada una con su fecha, y las compara con datos públicos. Cada predicción lleva la valoración del observatorio y, cuando existe, la de los propios autores.</p>`;

  $('#a7-status').innerHTML = status(all, checks, today, a.ritmo);

  // Calendario: un carril por línea, cada predicción en su fecha y con el color de la valoración del observatorio.
  const dates = all.map(h => h.plazo).sort();
  const to = new Date(Date.UTC(+dates[dates.length - 1].slice(0, 4), +dates[dates.length - 1].slice(5, 7) + 1, 1)).toISOString().slice(0, 10);
  hitoTimeline($('#a7-timeline'), a.lineas.map(l => ({ id: l.id, title: l.titulo })), all.map(h => {
    const o = valOf(h, 'observatorio', checks), au = valOf(h, 'autores', checks), due = h.plazo < today;
    return {
      lane: h.lane, date: h.plazo, cls: cls(o?.v), short: h.corto || h.titulo,
      go: () => { const el = document.getElementById(`hito-${h.id}`); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.classList.add('flash'); setTimeout(() => el?.classList.remove('flash'), 1600); },
      tip: tip(h.titulo, [['Plazo', `${h.plazo_texto} (${when(h, today)})`], ['Qué predecía', h.prediccion], ['Observatorio', plain(o, due)], ['Autores', au ? au.v : 'sin valoración publicada']], 'Pulsa para ir a su ficha.')
    };
  }), { today, from: '2025-04-01', to });
  $('#a7-tl-legend').innerHTML = ESCALA.map(k => `<span><i class="chip ${cls(k)}"></i>${esc(PLAIN[k])}</span>`).join('');

  $('#a7-tally').innerHTML = tally(a.lineas, checks);
  $('#a7-pace').innerHTML = `<span class="lbl">Ritmo de la realidad frente al escenario, según los autores</span>
    <ol class="pace">${a.ritmo.puntos.map(p => `<li><b>${esc(p.valor)}</b><span>${esc(curDate(p.fecha))}</span><small>${esc(p.detalle)} <a href="${esc(p.url)}" target="_blank" rel="noopener">Fuente</a></small></li>`).join('')}</ol>
    <p class="note strong">${esc(a.ritmo.nota)}</p>`;
  $('#a7-vig').innerHTML = `<summary>Vigencia de las fuentes (${a.vigencia.length} avisos)</summary><ul>${a.vigencia.map(v => `<li><b>${esc(v.fuente)}</b> (${esc(curDate(v.fecha))}). ${esc(v.texto)} <a href="${esc(v.url)}" target="_blank" rel="noopener">Fuente</a></li>`).join('')}</ul>`;

  $('#a7-index').innerHTML = a.lineas.map((l, i) => `<a href="#linea-${esc(l.id)}" data-jump><i>${String(i + 1).padStart(2, '0')}</i>${esc(l.titulo)}</a>`).join('');
  $('#a7-lines').innerHTML = a.lineas.map((l, i) => `<section class="linea" id="linea-${esc(l.id)}" aria-labelledby="lh-${esc(l.id)}">
      <header class="front-head"><span class="front-n">${String(i + 1).padStart(2, '0')}</span><div><h3 id="lh-${esc(l.id)}">${esc(l.titulo)}</h3><p class="q"><span class="lbl">Qué se comprueba</span>${esc(l.comprobar)}</p></div></header>
      <div class="hitos">${l.hitos.slice().sort((x, y) => x.plazo.localeCompare(y.plazo)).map(h => hito(h, ind, checks, today)).join('')}</div>
    </section>`).join('');

  $('#a7-rev').innerHTML = a.revisiones.slice().sort((x, y) => y.fecha.localeCompare(x.fecha)).map(r => `<li><span class="rev-d">${esc(curDate(r.fecha))}</span><span class="tag ${r.tipo === 'texto' ? 'k-texto' : 'k-valoracion'}">${r.tipo === 'texto' ? 'Cambio en el texto' : 'Valoración o previsión'}</span><span>${esc(r.texto)} <a href="${esc(r.url)}" target="_blank" rel="noopener">Fuente</a></span></li>`).join('');

  /* Los anclajes internos no deben cambiar de vista: se desplaza sin tocar el hash. */
  $('#view-ai2027').addEventListener('click', ev => {
    const link = ev.target.closest('a[data-jump]');
    if (!link) return;
    ev.preventDefault();
    document.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
