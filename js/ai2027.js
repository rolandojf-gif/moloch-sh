/* Vista «AI 2027»: qué predice el escenario, en qué punto está cada predicción hoy y quién lo valora.
   Cada hito conserva la predicción original; las revisiones de los autores aparecen fechadas a su lado. */
import { t, tn, tr, L } from './i18n.js';
import { esc, fmtDate, dateFmt, nd, quote } from './fmt.js';
import { indicatorRow, indicatorBrief } from './indicadores.js';
import { curDate } from './carrera.js';
import { hitoTimeline, tip } from './charts.js';
import { OPEN, valOf, estimateCore, resolve } from './valoracion.js';

const $ = s => document.querySelector(s);
let bound = false;
export const ESCALA = ['adelantado', 'compatible', 'retrasado', 'todavía no evaluable', 'sin evidencia suficiente'];
const cls = v => 'v-' + String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
const ev = k => ({ medida: t('Medida'), declarada: t('Declarada'), 'valoración de los autores': t('Valoración de los autores'), contexto: t('Contexto') }[k] || k);
/* Los valores de la escala son datos (clases CSS, claves de las reglas): se muestran con estas palabras. */
const escala = k => ({ adelantado: t('adelantado'), compatible: t('compatible'), retrasado: t('retrasado'), 'todavía no evaluable': t('todavía no evaluable'), 'sin evidencia suficiente': t('sin evidencia suficiente') }[k] || k);
/* La escala en palabras de cualquiera. «Adelantado» o «retrasado» describen el ritmo frente al escenario, no si es bueno o malo. */
const plainOf = k => ({
  adelantado: t('Va por delante del escenario'),
  compatible: t('Se cumple como preveía'),
  retrasado: t('Va por detrás del escenario'),
  'todavía no evaluable': t('Aún no ha llegado su fecha'),
  'sin evidencia suficiente': t('No hay datos públicos para comprobarlo')
}[k]);
const plain = (v, due) => !v ? t('Sin valoración') : v.v === 'todavía no evaluable' && due ? t('Plazo vencido, todavía sin evaluar') : plainOf(v.v) || v.v;

/* Valoración y estimación vigentes: js/valoracion.js, compartido con el detector de cambios del recolector. */
const monthYear = d => dateFmt({ month: 'long', year: 'numeric' }).format(new Date(d + 'T00:00:00Z'));
const estKind = k => ({ regla: t('proyección con los datos recogidos'), autores: t('valoración de los autores'), ritmo: t('con el ritmo que estiman los autores'), fuente: t('estimación del observatorio con fuentes') }[k]);
function estimate(h, checks, a) {
  const e = estimateCore(h, checks, a);
  if (e?.metodo === 'autores') return { ...e, ready: true, texto: t('No hay una medida pública que permita comprobarlo, así que se toma como estimación la valoración que publicaron los autores ({curDate}), recogida debajo.', { curDate: curDate(e.fecha) }) };
  if (e?.metodo === 'ritmo') {
    const { early, late, punto: p, ...rest } = e;
    return {
      ...rest,
      ready: true,
      texto: t('Si la realidad avanza al {valor} de la velocidad del escenario, como estimaban los autores el {curDate}, este punto del relato llegaría entre {monthYear} y {p4}, en vez de {plazo_texto}. Inferencia del observatorio a partir de esa estimación.', { valor: p.valor, curDate: curDate(p.fecha), monthYear: monthYear(early), p4: monthYear(late), plazo_texto: tr(h.plazo_texto) }),
      fuentes: [{ texto: 'AI Futures Project', url: p.url }, ...(h.estimacion.fuentes || [])]
    };
  }
  return e;
}
const estLabel = est => est.sentido ? L(est, 'sentido') : plainOf(est.v) || est.v;

const months = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / (30.44 * 86400e3));
function when(h, today) {
  const m = months(today, h.plazo);
  if (m > 0) return t('faltan {p1}', { p1: tn(m, ['un mes', '{n} meses']) });
  if (m < 0) return t('venció hace {p1}', { p1: tn(-m, ['un mes', '{n} meses']) });
  return h.plazo < today ? t('acaba de vencer') : t('vence este mes');
}

function evidence(e, ind) {
  const tag = `<span class="ev ev-${cls(e.tipo).slice(2)}">${esc(ev(e.tipo))}</span>`;
  if (e.indicador) return `<li>${tag}<dl class="ind">${ind ? indicatorRow(ind, e.indicador) : `<div class="ind-row"><dd>${nd()}</dd></div>`}</dl></li>`;
  return `<li>${tag}<p>${esc(tr(e.texto))}</p><div class="prov">${t('Fuente:')} <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.fuente ? tr(e.fuente) : t('enlace'))}</a> ${t('· dato: {curDate}', { curDate: esc(curDate(e.fecha)) })}</div></li>`;
}

/* Predicción por partes: lectura del observatorio que separa las afirmaciones de una misma predicción. */
function partes(h, checks, today) {
  if (!h.partes?.length) return '';
  return `<div class="partes"><span class="lbl">${t('La predicción, por partes')}</span>
    <p class="m-sub">${t('Lectura del observatorio: el escenario lo dice todo junto y aquí se separa para valorar cada afirmación. La predicción completa y la cita, sin cambios, en «Texto original».')}</p>
    <ol>${h.partes.map(pt => {
      const v = resolve(pt.valoracion, checks), due = (pt.plazo || h.plazo) < today;
      return `<li><span class="chip ${cls(v?.v)}" aria-hidden="true"></span><div><p class="pt-t">${esc(tr(pt.texto))}${pt.plazo ? ` <span class="pt-when">${t('Para {plazo_texto}.', { plazo_texto: esc(tr(pt.plazo_texto)) })}</span>` : ''}</p>
        <p><b>${esc(plain(v, due))}.</b> ${esc(v?.texto ? L(v, 'texto') : '')}${v?.fuentes?.length ? ` ${v.fuentes.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(tr(f.texto))}</a>`).join(' · ')}` : ''}</p></div></li>`;
    }).join('')}</ol></div>`;
}

function hito(h, ind, checks, today, a7) {
  const a = valOf(h, 'autores', checks), o = valOf(h, 'observatorio', checks);
  const est = OPEN.includes(o?.v) ? estimate(h, checks, a7) : null;
  const due = h.plazo < today;
  const measured = (h.evidencia || []).filter(e => e.tipo === 'medida' && e.indicador);
  // Un hito vencido se valora con lo que había en su fecha; lo de hoy va aparte, como contexto.
  const atDue = measured.filter(e => e.momento === 'plazo'), now = measured.filter(e => e.momento !== 'plazo');
  const rows = list => list.length && ind ? `<dl class="ind">${list.map(e => indicatorRow(ind, e.indicador)).join('')}</dl>` : '';
  const rest = (h.evidencia || []).filter(e => !(e.tipo === 'medida' && e.indicador));
  const r = (h.revisiones || []).length;
  return `<article class="hito${due && o?.v === 'todavía no evaluable' ? ' overdue' : ''}" id="hito-${esc(h.id)}">
    <div class="verdict ${cls(o?.v)}"><span class="lbl">${t('Valoración del observatorio')}</span><b>${esc(plain(o, due))}</b>${o?.sentido ? `<span class="sentido">${esc(L(o, 'sentido'))}</span>` : ''}${o?.regla ? `<small>${t('Calculada con una regla explícita en cada recogida.')}</small>` : ''}${est ? `<span class="est-line"><i class="chip ${cls(est.v)}"></i><span><span class="lbl">${t('Estimación')}</span>${esc(estLabel(est))}</span></span>` : ''}</div>
    <div class="hito-main">
      <h4>${esc(tr(h.titulo))}</h4>
      <div class="when">${t('Para')} <b>${esc(tr(h.plazo_texto))}</b> (${esc(fmtDate(h.plazo))}) · ${esc(when(h, today))}</div>
      <div class="hito-cols">
        <div><span class="lbl">${t('Qué predecía')}</span><p>${esc(tr(h.prediccion))}</p></div>
        ${due
          ? `<div><span class="lbl">${t('Al vencer el plazo ({fmtDate})', { fmtDate: esc(fmtDate(h.plazo)) })}</span><p>${esc(o?.texto ? L(o, 'texto') : t('Sin valoración del observatorio.'))}</p>${rows(atDue)}
          ${now.length ? `<span class="lbl lbl-hoy">${t('Y hoy ({curDate})', { curDate: esc(curDate(today)) })}</span>${rows(now)}` : ''}</div>`
          : `<div><span class="lbl">${t('Dónde estamos')}${o?.fecha ? ` (${esc(curDate(o.fecha))})` : ''}</span><p>${esc(o?.texto ? L(o, 'texto') : t('Sin valoración del observatorio.'))}</p>${rows(measured)}</div>`}
      </div>
      ${partes(h, checks, today)}
      ${est ? `<div class="est-block"><span class="lbl"><span class="proj-key" aria-hidden="true"></span>${t('Estimación · {p1}', { p1: esc(est.rotulo ? tr(est.rotulo) : estKind(est.metodo)) })}</span><p>${esc(est.ready ? est.texto : L(est, 'texto'))}</p>${est.muros ? `<p class="muros"><b>${t('Qué podría frenarla o invalidarla.')}</b> ${esc(tr(est.muros))}</p>` : ''}${est.fuentes?.length ? `<p class="prov">${est.fuentes.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(tr(f.texto))}</a>`).join(' · ')}</p>` : ''}</div>` : ''}
      <p class="authors"><span class="lbl">${t('Qué dicen los autores')}</span>${a ? `<span class="val ${cls(a.v)}">${esc(escala(a.v))}</span> ${esc(a.texto ? tr(a.texto) : '')}${a.url ? ` <a href="${esc(a.url)}" target="_blank" rel="noopener">${t('Fuente')}</a>` : ''}` : t('No han publicado una valoración que el observatorio haya encontrado.')}</p>
      <details class="hito-more">
        <summary>${t('Texto original, evidencia{p1}', { p1: r ? t(' y revisiones') : '' })}</summary>
        <p class="op"><span class="lbl">${t('Dónde lo dice el escenario')}</span>${esc(tr(h.seccion))} · <a href="${esc(h.url)}" target="_blank" rel="noopener">${t('fuente de la predicción')}</a></p>
        ${h.cita ? `<blockquote lang="en">${esc(h.cita)}</blockquote>` : ''}
        ${h.operacionalizacion ? `<p class="op"><span class="lbl">${t('Cómo se comprueba')}</span>${esc(tr(h.operacionalizacion))}</p>` : ''}
        ${r ? `<div class="revs"><span class="lbl">${t('Revisiones posteriores de los autores (no sustituyen la predicción original)')}</span><ol>${h.revisiones.map(x => `<li><b>${esc(curDate(x.fecha))}</b> · ${esc(tr(x.texto))} <a href="${esc(x.url)}" target="_blank" rel="noopener">${t('Fuente')}</a></li>`).join('')}</ol></div>` : ''}
        ${rest.length ? `<div class="evid"><span class="lbl">${t('Otra evidencia')}</span><ul>${rest.map(e => evidence(e, ind)).join('')}</ul></div>` : ''}
        ${h.comparabilidad ? `<p class="op"><span class="lbl">${t('Comparabilidad')}</span>${esc(tr(h.comparabilidad))}</p>` : ''}
      </details>
    </div>
  </article>`;
}

function tally(lines, checks) {
  const rows = [['autores', t('Autores')], ['observatorio', t('Observatorio')]].map(([q, label]) => {
    const cnt = Object.fromEntries([...ESCALA, null].map(k => [k, 0]));
    let total = 0;
    for (const l of lines) for (const h of l.hitos) { const v = valOf(h, q, checks); cnt[v ? v.v : null]++; total++; }
    const seg = [...ESCALA.filter(k => cnt[k]).map(k => `<span class="seg-${cls(k)}" style="flex:${cnt[k]}" title="${esc(`${escala(k)}: ${cnt[k]}`)}">${cnt[k]}</span>`),
      cnt[null] ? `<span class="seg-v-none" style="flex:${cnt[null]}" title="${esc(t('sin valoración: {p1}', { p1: cnt[null] }))}">${cnt[null]}</span>` : ''].join('');
    return `<div class="tally-row"><span class="tally-k">${label}</span><div class="tally-bar" role="img" aria-label="${esc(`${label}: ${ESCALA.filter(k => cnt[k]).map(k => `${cnt[k]} ${escala(k)}`).join(', ')}${cnt[null] ? t(', {p1} sin valoración', { p1: cnt[null] }) : ''}`)}">${seg}</div><span class="tally-n">${t('{total} hitos', { total })}</span></div>`;
  }).join('');
  const legend = [...ESCALA.map(k => `<span><i class="seg-${cls(k)}"></i>${esc(escala(k))}</span>`), `<span><i class="seg-v-none"></i>${t('sin valoración publicada')}</span>`].join('');
  return `${rows}<div class="legend">${legend}</div>`;
}

/* Las tres próximas predicciones que se podrán comprobar con datos: con al menos una medida enlazada a un indicador
   que recoge el observatorio. Orden: plazo; a igual plazo, primero las que se calculan con una regla en cada recogida y
   cuya evidencia medida sale toda de esos indicadores; después, el orden de esta página. */
function nextChecks(all, today) {
  const measured = h => (h.evidencia || []).filter(e => e.tipo === 'medida');
  const daily = h => (h.valoraciones || []).some(v => v.quien === 'observatorio' && v.regla) || h.estimacion?.metodo === 'regla';
  const own = h => daily(h) && measured(h).every(e => e.indicador);
  return all.map((h, i) => ({ h, i })).filter(({ h }) => h.plazo >= today && measured(h).some(e => e.indicador))
    .sort((x, y) => x.h.plazo.localeCompare(y.h.plazo) || own(y.h) - own(x.h) || x.i - y.i).slice(0, 3).map(({ h }) => ({ h, own: own(h) }));
}

/* Resumen a fecha de hoy, en frases. */
const lc = x => x.charAt(0).toLowerCase() + x.slice(1);
function status(all, checks, today, a7, ind) {
  const ritmo = a7.ritmo;
  const estOf = h => { const o = valOf(h, 'observatorio', checks); return OPEN.includes(o?.v) ? estimate(h, checks, a7) : null; };
  const tallyEst = (list, words) => { const n = k => list.filter(h => estOf(h)?.v === k).length, none = list.filter(h => !estOf(h)).length; return [[n('adelantado') + n('compatible'), words[0]], [n('retrasado'), words[1]], [none, t('sin estimación')]].filter(x => x[0]).map(([k, w]) => `<b>${k}</b> ${w}`).join(', '); };
  const undecidedDue = due => due.filter(h => OPEN.includes(valOf(h, 'observatorio', checks)?.v));
  const due = all.filter(h => h.plazo < today), next = all.filter(h => h.plazo >= today).sort((x, y) => x.plazo.localeCompare(y.plazo));
  const cnt = k => due.filter(h => valOf(h, 'observatorio', checks)?.v === k).length;
  const parts = [['adelantado', t('va por delante'), t('van por delante')], ['compatible', t('se cumple como preveía'), t('se cumplen como preveían')], ['retrasado', t('va por detrás'), t('van por detrás')], ['sin evidencia suficiente', t('no se puede comprobar con datos públicos'), t('no se pueden comprobar con datos públicos')], ['todavía no evaluable', t('está sin evaluar'), t('están sin evaluar')]]
    .map(([k, one, many]) => [k, cnt(k), one, many]).filter(x => x[1]);
  const lastPace = ritmo?.puntos?.[ritmo.puntos.length - 1];
  const nc = nextChecks(all, today);
  const chips = parts.map(([k, n, one, many]) => `<li><span class="chip ${cls(k)}">${n}</span>${esc(n === 1 ? one : many)}</li>`).join('');
  return `<div class="st-block"><span class="lbl">${t('A {fecha}', { fecha: esc(fmtDate(today)) })}</span>
      <p class="st-big">${t('De las')} <b>${due.length}</b> ${t('predicciones cuyo plazo ya ha pasado:')}</p><ul class="st-list">${chips}</ul>
      ${undecidedDue(due).length ? `<p class="st-est">${t('Las que no se pueden comprobar, según las estimaciones: {tallyEst}.', { tallyEst: tallyEst(undecidedDue(due), [t('se cumplirían'), t('irían por detrás')]) })}</p>` : ''}</div>
    <div class="st-block"><span class="lbl">${t('Lo que viene')}</span>
      <p class="st-big"><b>${next.length}</b> ${t('predicciones por llegar.')}</p>
      <p class="st-est">${t('Según las estimaciones: {tallyEst}.', { tallyEst: tallyEst(next.filter(h => OPEN.includes(valOf(h, 'observatorio', checks)?.v)), [t('llegarían a tiempo o antes'), t('llegarían tarde')]) })}</p>
      ${nc.length ? `<span class="lbl lbl-next">${t('Las próximas que se podrán comprobar con datos')}</span><ol class="st-next">${nc.map(({ h, own }) => `<li><a href="#hito-${esc(h.id)}" data-jump>${esc(tr(h.titulo))}</a>${t(', para {plazo_texto}.', { plazo_texto: esc(tr(h.plazo_texto)) })} <span class="m-sub">${t('Con {p1}{p2}.', { p1: (h.evidencia || []).filter(e => e.tipo === 'medida' && e.indicador).map(e => esc(lc(indicatorBrief(ind, e.indicador).label))).join('; '), p2: own ? t('; el observatorio la calcula en cada recogida') : '' })}</span></li>`).join('')}</ol>
      <p class="m-sub">${t('Orden: fecha del plazo; a igual fecha, primero las que el observatorio calcula en cada recogida sólo con datos que recoge, y después el orden de esta página.')}</p>` : ''}</div>
    ${lastPace ? `<div class="st-block"><span class="lbl">${t('Ritmo según los propios autores')}</span>
      <p class="st-big"><b>${esc(lastPace.valor)}</b> ${t('de la velocidad del escenario.')}</p>
      <p>${t('Su última estimación, del {curDate}. {nota}', { curDate: esc(curDate(lastPace.fecha)), nota: esc(tr(ritmo.nota)) })} <a href="${esc(lastPace.url)}" target="_blank" rel="noopener">${t('Fuente')}</a></p></div>` : ''}`;
}

export function renderAi2027(d) {
  const a = d.ai2027;
  if (!a) { $('#a7-lines').innerHTML = `<div class="empty">${t('No se ha podido cargar el seguimiento (data/curated/ai2027.json).')}</div>`; return; }
  const ind = d.ind?.ind || null, checks = d.ind?.checks || {};
  const today = (d.ind?.generated || d.catalog.generated).slice(0, 10);
  const e = a.escenario;
  const all = a.lineas.flatMap(l => l.hitos.map(h => ({ ...h, lane: l.id })));

  $('#a7-scn').innerHTML = `<span class="lbl">${t('Qué es AI 2027')}</span>
    <p><a href="${esc(e.url)}" target="_blank" rel="noopener"><b>${esc(tr(e.titulo))}</b></a> ${t('es un relato publicado el {fmtDate} por {autores}. Cuenta, periodo a periodo, cómo la IA podría pasar de agentes que todavía tropiezan a mediados de 2025 a un programador sobrehumano en 2027, en una carrera entre una empresa estadounidense y una china, las dos ficticias.', { fmtDate: esc(fmtDate(e.publicado)), autores: esc(tr(e.autores)) })}</p>
    <p>${t('No asigna probabilidades: sus autores lo presentan como uno de varios futuros posibles. {nota}', { nota: esc(tr(e.nota)) })}</p>
    <blockquote lang="en">${quote(esc(e.cita))}</blockquote>
    <p>${t('Dos desenlaces: {p1}.', { p1: e.desenlaces.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(tr(x.nombre))}</a>`).join(` ${t('y')} `) })}</p>
    <p class="st-how"><b>${t('Qué hace esta página.')}</b> ${t('Toma {length} predicciones concretas del relato, cada una con su fecha, y las compara con datos públicos. Cada predicción lleva la valoración del observatorio y, cuando existe, la de los propios autores.', { length: all.length })}</p>`;

  $('#a7-status').innerHTML = status(all, checks, today, a, ind);

  // Calendario: un carril por línea, cada predicción en su fecha y con el color de la valoración del observatorio.
  const dates = all.map(h => h.plazo).sort();
  const to = new Date(Date.UTC(+dates[dates.length - 1].slice(0, 4), +dates[dates.length - 1].slice(5, 7) + 1, 1)).toISOString().slice(0, 10);
  hitoTimeline($('#a7-timeline'), a.lineas.map(l => ({ id: l.id, title: tr(l.titulo) })), all.map(h => {
    const o = valOf(h, 'observatorio', checks), au = valOf(h, 'autores', checks), due = h.plazo < today;
    const est = OPEN.includes(o?.v) ? estimate(h, checks, a) : null;
    return {
      lane: h.lane, date: h.plazo, cls: cls(o?.v), est: est ? cls(est.v) : null, short: tr(h.corto || h.titulo),
      go: () => { const el = document.getElementById(`hito-${h.id}`); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.classList.add('flash'); setTimeout(() => el?.classList.remove('flash'), 1600); },
      tip: tip(tr(h.titulo), [[t('Plazo'), `${tr(h.plazo_texto)} (${when(h, today)})`], [t('Qué predecía'), tr(h.prediccion)], [t('Observatorio'), plain(o, due)], [t('Estimación'), est ? estLabel(est) : null], [t('Autores'), au ? escala(au.v) : t('sin valoración publicada')]], t('Pulsa para ir a su ficha.'))
    };
  }), { today, from: '2025-04-01', to });
  $('#a7-tl-legend').innerHTML = ESCALA.map(k => `<span><i class="chip ${cls(k)}"></i>${esc(plainOf(k))}</span>`).join('') + `<span><i class="chip est-key"></i>${t('Anillo: color de la estimación')}</span>`;

  $('#a7-tally').innerHTML = tally(a.lineas, checks);
  $('#a7-pace').innerHTML = `<span class="lbl">${t('Ritmo de la realidad frente al escenario, según los autores')}</span>
    <ol class="pace">${a.ritmo.puntos.map(p => `<li><b>${esc(p.valor)}</b><span>${esc(curDate(p.fecha))}</span><small>${esc(tr(p.detalle))} <a href="${esc(p.url)}" target="_blank" rel="noopener">${t('Fuente')}</a></small></li>`).join('')}</ol>
    <p class="note strong">${esc(tr(a.ritmo.nota))}</p>`;
  $('#a7-vig').innerHTML = `<summary>${t('Vigencia de las fuentes ({length} avisos)', { length: a.vigencia.length })}</summary><ul>${a.vigencia.map(v => `<li><b>${esc(tr(v.fuente))}</b> (${esc(curDate(v.fecha))}). ${esc(tr(v.texto))} <a href="${esc(v.url)}" target="_blank" rel="noopener">${t('Fuente')}</a></li>`).join('')}</ul>`;

  $('#a7-index').innerHTML = a.lineas.map((l, i) => `<a href="#linea-${esc(l.id)}" data-jump><i>${String(i + 1).padStart(2, '0')}</i>${esc(tr(l.titulo))}</a>`).join('');
  $('#a7-lines').innerHTML = a.lineas.map((l, i) => `<section class="linea" id="linea-${esc(l.id)}" aria-labelledby="lh-${esc(l.id)}">
      <header class="front-head"><span class="front-n">${String(i + 1).padStart(2, '0')}</span><div><h3 id="lh-${esc(l.id)}">${esc(tr(l.titulo))}</h3><p class="q"><span class="lbl">${t('Qué se comprueba')}</span>${esc(tr(l.comprobar))}</p></div></header>
      <div class="hitos">${l.hitos.slice().sort((x, y) => x.plazo.localeCompare(y.plazo)).map(h => hito(h, ind, checks, today, a)).join('')}</div>
    </section>`).join('');

  $('#a7-rev').innerHTML = a.revisiones.slice().sort((x, y) => y.fecha.localeCompare(x.fecha)).map(r => `<li><span class="rev-d">${esc(curDate(r.fecha))}</span><span class="tag ${r.tipo === 'texto' ? 'k-texto' : 'k-valoracion'}">${r.tipo === 'texto' ? t('Cambio en el texto') : t('Valoración o previsión')}</span><span>${esc(tr(r.texto))} <a href="${esc(r.url)}" target="_blank" rel="noopener">${t('Fuente')}</a></span></li>`).join('');

  /* Los anclajes internos no deben cambiar de vista: se desplaza sin tocar el hash. #view-ai2027 no se reemplaza al cambiar
     de idioma, así que el escuchador se enlaza una sola vez. */
  if (bound) return;
  bound = true;
  $('#view-ai2027').addEventListener('click', ev => {
    const link = ev.target.closest('a[data-jump]');
    if (!link) return;
    ev.preventDefault();
    document.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
