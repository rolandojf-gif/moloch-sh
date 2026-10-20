/* Vista «AI 2027»: el escenario como uno de varios futuros posibles, hito a hito, con la predicción original intacta. */
import { esc, fmtDate } from './fmt.js';
import { indicatorRow } from './indicadores.js';
import { curDate } from './carrera.js';

const $ = s => document.querySelector(s);
export const ESCALA = ['adelantado', 'compatible', 'retrasado', 'todavía no evaluable', 'sin evidencia suficiente'];
const cls = v => 'v-' + String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
const EV = { medida: 'Medida', declarada: 'Declarada', 'valoración de los autores': 'Valoración de los autores', contexto: 'Contexto' };

/* Valoración del observatorio: fija, o calculada por una regla del recolector (data/indicadores.json → checks). */
function resolve(val, checks) {
  if (!val?.regla) return val;
  const c = checks?.[val.regla];
  return c ? { ...val, v: c.v, texto: c.texto, fecha: c.fecha } : { ...val, v: 'sin evidencia suficiente', texto: 'La regla no ha podido calcularse en la última recogida.' };
}
const valOf = (h, quien, checks) => resolve((h.valoraciones || []).find(v => v.quien === quien), checks) || null;

function badge(v, prefix) {
  return v ? `<span class="val ${cls(v.v)}">${prefix}: ${esc(v.v)}</span>` : `<span class="val v-none">${prefix}: sin valoración publicada</span>`;
}

function evidence(e, ind) {
  const tag = `<span class="ev ev-${cls(e.tipo).slice(2)}">${esc(EV[e.tipo] || e.tipo)}</span>`;
  if (e.indicador) return `<li>${tag}<dl class="ind">${ind ? indicatorRow(ind, e.indicador) : '<div class="ind-row"><dd><span class="nd">sin datos</span></dd></div>'}</dl></li>`;
  return `<li>${tag}<p>${esc(e.texto)}</p><div class="prov">Fuente: <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.fuente || 'enlace')}</a> · dato: ${esc(curDate(e.fecha))}</div></li>`;
}

function valDetail(v, who) {
  if (!v) return `<li><b>${who}:</b> sin valoración publicada que el observatorio haya encontrado.</li>`;
  return `<li><b>${who}</b> (${esc(curDate(v.fecha))}): <span class="val ${cls(v.v)}">${esc(v.v)}</span> ${esc(v.texto || '')}${v.regla ? ` <span class="rule">Regla explícita, recalculada en cada recogida.</span>` : ''}${v.url ? ` <a href="${esc(v.url)}" target="_blank" rel="noopener">Fuente</a>` : ''}</li>`;
}

function hito(h, ind, checks, today) {
  const a = valOf(h, 'autores', checks), o = valOf(h, 'observatorio', checks);
  const overdue = h.plazo < today && o?.v === 'todavía no evaluable';
  const due = h.plazo < today;
  const n = (h.evidencia || []).length, r = (h.revisiones || []).length;
  return `<article class="hito${overdue ? ' overdue' : ''}" id="hito-${esc(h.id)}">
    <div class="hito-head">
      <div class="plazo"><span class="lbl">Plazo</span><b>${esc(h.plazo_texto)}</b><small>${esc(fmtDate(h.plazo))}</small>${due ? '<span class="tag due">vencido</span>' : ''}</div>
      <div class="hito-main">
        <h4>${esc(h.titulo)}</h4>
        <div class="m-sub">${esc(h.seccion)} · <a href="${esc(h.url)}" target="_blank" rel="noopener">fuente de la predicción</a></div>
        <p class="pred"><span class="lbl">Predicción original</span>${esc(h.prediccion)}</p>
        ${h.cita ? `<blockquote lang="en">${esc(h.cita)}</blockquote>` : ''}
        ${overdue ? '<p class="alert">Plazo vencido y todavía sin evaluar.</p>' : ''}
      </div>
      <div class="vals">${badge(a, 'Autores')}${badge(o, 'Observatorio')}</div>
    </div>
    <details class="hito-more">
      <summary>Evidencia (${n})${r ? `, revisiones (${r})` : ''} y valoraciones</summary>
      ${h.operacionalizacion ? `<p class="op"><span class="lbl">Cómo se comprueba</span>${esc(h.operacionalizacion)}</p>` : ''}
      ${r ? `<div class="revs"><span class="lbl">Revisiones posteriores de los autores (no sustituyen la predicción original)</span><ol>${h.revisiones.map(x => `<li><b>${esc(curDate(x.fecha))}</b> · ${esc(x.texto)} <a href="${esc(x.url)}" target="_blank" rel="noopener">Fuente</a></li>`).join('')}</ol></div>` : ''}
      <div class="evid"><span class="lbl">Evidencia</span>${n ? `<ul>${h.evidencia.map(e => evidence(e, ind)).join('')}</ul>` : '<p class="nd">Sin evidencia todavía.</p>'}</div>
      ${h.comparabilidad ? `<p class="op"><span class="lbl">Comparabilidad</span>${esc(h.comparabilidad)}</p>` : ''}
      <div class="valdet"><span class="lbl">Valoraciones</span><ul>${valDetail(a, 'Autores')}${valDetail(o, 'Observatorio')}</ul></div>
    </details>
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

export function renderAi2027(d) {
  const a = d.ai2027;
  if (!a) { $('#a7-lines').innerHTML = '<div class="empty">No se ha podido cargar el seguimiento (data/curated/ai2027.json).</div>'; return; }
  const ind = d.ind?.ind || null, checks = d.ind?.checks || {};
  const today = (d.ind?.generated || d.catalog.generated).slice(0, 10);
  const e = a.escenario;

  $('#a7-scn').innerHTML = `<span class="lbl">El escenario</span>
    <p><a href="${esc(e.url)}" target="_blank" rel="noopener"><b>${esc(e.titulo)}</b></a>, publicado el ${esc(fmtDate(e.publicado))} por ${esc(e.autores)}.</p>
    <blockquote lang="en">«${esc(e.cita)}»</blockquote>
    <p>Dos desenlaces: ${e.desenlaces.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.nombre)}</a>`).join(' y ')}. ${esc(e.nota)}</p>`;

  $('#a7-pace').innerHTML = `<span class="lbl">Ritmo de la realidad frente al escenario, según los autores</span>
    <ol class="pace">${a.ritmo.puntos.map(p => `<li><b>${esc(p.valor)}</b><span>${esc(curDate(p.fecha))}</span><small>${esc(p.detalle)} <a href="${esc(p.url)}" target="_blank" rel="noopener">Fuente</a></small></li>`).join('')}</ol>
    <p class="note strong">${esc(a.ritmo.nota)}</p>`;

  $('#a7-tally').innerHTML = tally(a.lineas, checks);
  $('#a7-vig').innerHTML = `<summary>Vigencia de las fuentes (${a.vigencia.length} avisos)</summary><ul>${a.vigencia.map(v => `<li><b>${esc(v.fuente)}</b> (${esc(curDate(v.fecha))}). ${esc(v.texto)} <a href="${esc(v.url)}" target="_blank" rel="noopener">Fuente</a></li>`).join('')}</ul>`;

  $('#a7-index').innerHTML = a.lineas.map((l, i) => `<a href="#linea-${esc(l.id)}" data-jump><i>${String(i + 1).padStart(2, '0')}</i>${esc(l.titulo)}</a>`).join('');
  $('#a7-lines').innerHTML = a.lineas.map((l, i) => `<section class="linea" id="linea-${esc(l.id)}" aria-labelledby="lh-${esc(l.id)}">
      <header class="front-head"><span class="front-n">${String(i + 1).padStart(2, '0')}</span><div><h3 id="lh-${esc(l.id)}">${esc(l.titulo)}</h3><p class="q"><span class="lbl">Qué comprobar</span>${esc(l.comprobar)}</p></div></header>
      <div class="hitos">${l.hitos.slice().sort((x, y) => x.plazo.localeCompare(y.plazo)).map(h => hito(h, ind, checks, today)).join('')}</div>
    </section>`).join('');

  $('#a7-rev').innerHTML = a.revisiones.slice().sort((x, y) => y.fecha.localeCompare(x.fecha)).map(r => `<li><span class="rev-d">${esc(curDate(r.fecha))}</span><span class="tag ${r.tipo === 'texto' ? 'k-texto' : 'k-valoracion'}">${r.tipo === 'texto' ? 'Cambio en el texto' : 'Valoración o previsión'}</span><span>${esc(r.texto)} <a href="${esc(r.url)}" target="_blank" rel="noopener">Fuente</a></span></li>`).join('');

  $('#a7-index').addEventListener('click', ev => {
    const link = ev.target.closest('a[data-jump]');
    if (!link) return;
    ev.preventDefault();
    document.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
