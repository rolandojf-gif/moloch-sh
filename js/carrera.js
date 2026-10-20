/* Vista «La carrera»: distancias en la frontera y seis frentes con hechos, indicadores y una lectura marcada como interpretación. */
import { esc, fmtDate, ND } from './fmt.js';
import { indicatorRow, indicatorKpi } from './indicadores.js';
import { gaps } from './charts.js';

const $ = s => document.querySelector(s);
export const ESTADO = { abierta: 'Hipótesis abierta', confirmada: 'Hipótesis confirmada', debilitada: 'Hipótesis debilitada' };
const VERIF = { 'lectura directa': 'leído en la fuente', buscador: 'comprobado a través de un buscador: la web de la fuente no admite lectura automática' };

/* Fecha de un dato curado: día, mes o «sin datos». */
export const curDate = s => !s ? 'sin datos' : /^\d{4}-\d{2}$/.test(s) ? new Date(s + '-01T00:00:00Z').toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : fmtDate(s);

export function factItem(h) {
  return `<li><p>${esc(h.texto)}</p><div class="prov">Fuente: <a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.fuente)}</a> · dato: ${esc(curDate(h.fecha))} · consulta: ${esc(curDate(h.consulta))}${h.verificacion ? ` · <span class="verif v-${h.verificacion === 'buscador' ? 'buscador' : 'directa'}">${esc(VERIF[h.verificacion] || h.verificacion)}</span>` : ''}</div></li>`;
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
      <dt>La reforzaría</dt><dd>${esc(l.reforzaria)}</dd>
      <dt>La debilitaría</dt><dd>${esc(l.debilitaria)}</dd>
    </dl>
    <details class="hist"><summary>Historial de la hipótesis (desde ${esc(curDate(l.desde))})</summary><ol>${hist}</ol></details>
  </aside>`;
}

function front(f, i, ind) {
  const n = String(i + 1).padStart(2, '0');
  return `<article class="front" id="frente-${esc(f.id)}" aria-labelledby="fh-${esc(f.id)}">
    <header class="front-head"><span class="front-n">${n}</span><div><h3 id="fh-${esc(f.id)}">${esc(f.titulo)}</h3><p class="q">${esc(f.pregunta)}</p></div></header>
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
  $('#ca-fronts').innerHTML = cur.frentes.map((f, i) => front(f, i, ind)).join('');
  /* Los anclajes internos no deben cambiar de vista: se desplaza sin tocar el hash. */
  $('#ca-index').addEventListener('click', e => {
    const a = e.target.closest('a[data-jump]');
    if (!a) return;
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
