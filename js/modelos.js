/* Vista «Modelos»: comparador, ficha desplegable, comparación de hasta tres y evolución de la frontera. */
import { esc, fact, src, weightsTag, usd, num, tokens, fmtDate, country, blended, ii, coding, agentic, eci, swe, aaConfig, aaConfigShort, aaIndexName, speed, priceBasis, ND, AA_LINK } from './fmt.js';
import { frontier, hbars, tip } from './charts.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { w: 'all', sort: 'ii', dir: -1, q: '', open: new Set(), cmp: [], all: false };
/* Sentido por defecto de cada criterio: el precio, de más barato a más caro; el resto, de mayor a menor. */
const DIR0 = { ii: -1, eci: -1, tps: -1, price: 1, date: -1 };
const PAGE = 40;
let D;

const yesNo = v => v === true ? 'sí' : v === false ? 'no' : null;
const weightsBadge = m => `${weightsTag(m)}${src(m.weights)}`;

function sortKey(m) {
  switch (state.sort) {
    case 'ii': return ii(m);
    case 'eci': return eci(m);
    case 'price': return freeOnly(m) ? null : blended(m);
    case 'tps': return speed(m)?.tps ?? null;
    case 'date': return m.orCreated.v ? new Date(m.orCreated.v).getTime() : null;
  }
  return null;
}

function rows() {
  const q = state.q.trim().toLowerCase();
  return D.catalog.models
    .filter(m => state.w === 'all' || m.weights.v === state.w)
    .filter(m => !q || `${m.name} ${m.lab.name} ${m.id}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const ka = sortKey(a), kb = sortKey(b);
      if (ka === null && kb === null) return a.name.localeCompare(b.name);
      if (ka === null) return 1;
      if (kb === null) return -1;
      return state.dir * (ka - kb);
    });
}

/* Modelos que OpenRouter sólo ofrece como variante gratuita: su «0 $» no es un precio. */
const freeOnly = m => !!m.orVariant && /:free$/.test(m.orVariant) && !m.price.in.v && !m.price.out.v;

function speedCell(m) {
  const s = speed(m);
  if (!s) return ND;
  const ttft = s.ttft !== null && s.ttft !== undefined ? `${num(s.ttft, 2)} s` : 'sin datos';
  return `<span class="big">${num(s.tps, 0)}</span> tok/s${src(s.f)}<span class="m-sub">latencia ${ttft}</span><span class="m-sub" title="${esc(s.provider)}">${esc(s.short)}</span>`;
}

function detail(m) {
  const eps = (m.endpoints || []);
  const aa = m.aa;
  const lic = m.license.v ? esc(m.license.v) + src(m.license) : ND + src(m.license);
  const dl = [
    ['Laboratorio', `${esc(m.lab.name)} · ${esc(country(m.lab.country))} <a class="src" href="${esc(m.lab.url)}" target="_blank" rel="noopener" title="Sede del laboratorio, dato curado">CUR</a>`],
    ['Identidad', m.identity === 'confirmada' ? 'confirmada' : 'sin confirmar: modelo anónimo'],
    ['Pesos', weightsBadge(m) + (m.weights.note ? `<span class="m-sub">${esc(m.weights.note)}</span>` : '') + (m.hfId ? `<span class="m-sub"><a href="https://huggingface.co/${esc(m.hfId)}" target="_blank" rel="noopener">${esc(m.hfId)}</a></span>` : '')],
    ['Licencia', lic],
    ['Contexto', fact(m.ctx, v => tokens(v) + ' tokens')],
    ['Razonamiento', fact(m.reasoning, yesNo)],
    ['Caché (lectura)', m.price.cacheRead.v !== null ? usd(m.price.cacheRead.v) + ' / M' + src(m.price.cacheRead) : ND + src(m.price.cacheRead)],
    ['Precio combinado 3:1', freeOnly(m) ? `gratis: solo variante ${esc(m.orVariant.slice(m.orVariant.lastIndexOf(':')))}, sin precio de pago todavía` : blended(m) !== null ? usd(blended(m)) + ' / M' + src(m.price.in) + (priceBasis(m) ? `<span class="m-sub">${esc(priceBasis(m))}</span>` : '') : ND],
    ['Alta en OpenRouter', fact(m.orCreated, v => fmtDate(v))],
    ['Repositorio de pesos', m.hfCreated ? fact(m.hfCreated, v => fmtDate(v)) : ND],
    ['Inteligencia (Artificial Analysis)', aa ? `${fact(aa.intelligence, v => num(v))}<span class="m-sub">${esc(aaIndexName(aa.version))} · como <a href="${esc(aa.url)}" target="_blank" rel="noopener">«${esc(aa.name)}»</a> en AA${aa.how && aa.how !== 'nombre exacto' ? ` (${esc(aa.how)})` : ''}</span>` : 'sin puntuación en Artificial Analysis todavía'],
    ['Programación (AA)', aa ? fact(aa.coding, v => num(v)) + '<span class="m-sub">Artificial Analysis Coding Index</span>' : ND],
    ['Agentes (AA)', aa ? fact(aa.agentic, v => num(v)) + '<span class="m-sub">Artificial Analysis Agentic Index</span>' : ND],
    ['Fecha del modelo (AA)', aa ? fact(aa.release, v => fmtDate(v)) : ND],
    ['Capacidad (ECI)', m.epoch ? `${fact(m.epoch.eci, v => num(v))}<span class="m-sub">intervalo ${num(m.epoch.eci.ci?.[0])}–${num(m.epoch.eci.ci?.[1])} · como «${esc(m.epoch.name)}» en Epoch${m.epoch.how && m.epoch.how !== 'nombre' ? ` (${esc(m.epoch.how)})` : ''}</span>` : 'sin puntuación en Epoch AI todavía'],
    ['Fecha del modelo (Epoch)', m.epoch ? fact(m.epoch.release, v => fmtDate(v)) : ND],
    ['Acceso según Epoch', m.epoch ? fact(m.epoch.access) : ND],
    ['SWE-bench Verified', m.epoch ? fact(m.epoch.swe, v => num(v) + ' %') + (m.epoch.swe.note ? `<span class="m-sub">${esc(m.epoch.swe.note)}</span>` : '') : ND]
  ];
  const provTable = eps.length ? `
    <table class="subt"><caption class="sr-only">Proveedores en OpenRouter</caption>
      <thead><tr><th>Proveedor (OpenRouter)</th><th>Cuantización</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Contexto</th><th class="num">tok/s p50</th><th class="num">Latencia p50</th><th class="num">Disponibilidad 30 min</th></tr></thead>
      <tbody>${eps.map(e => `<tr>
        <td>${esc(e.provider || '—')}</td><td>${esc(e.quant || 'sin datos')}</td>
        <td class="num">${e.in !== null ? usd(e.in) : 'sin datos'}</td><td class="num">${e.out !== null ? usd(e.out) : 'sin datos'}</td>
        <td class="num">${e.ctx ? tokens(e.ctx) : 'sin datos'}</td>
        <td class="num">${e.tps ? num(e.tps, 0) : 'sin datos'}</td><td class="num">${e.ttft !== null && e.ttft !== undefined ? num(e.ttft, 2) + ' s' : 'sin datos'}</td>
        <td class="num">${e.uptime !== null && e.uptime !== undefined ? num(e.uptime, 1) + ' %' : 'sin datos'}</td></tr>`).join('')}</tbody>
    </table>
    <div class="prov">Proveedores: ${src(m.endpointsMeta)} ${m.endpointsMeta ? `consulta ${esc(m.endpointsMeta.got.slice(0, 10))}` : ''}. Velocidad y espera dependen de quién sirve el modelo.</div>` : '<p class="note">Sin datos de proveedores.</p>';
  return `<dl class="dgrid">${dl.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${provTable}`;
}

function syncHeads() {
  for (const b of $$('[data-sort]')) {
    const on = b.dataset.sort === state.sort;
    b.setAttribute('aria-sort', on ? (state.dir < 0 ? 'descending' : 'ascending') : 'none');
    b.querySelector('.arr').textContent = on ? (state.dir < 0 ? '▼' : '▲') : '↕';
    b.title = on ? (state.dir < 0 ? 'De mayor a menor; pulsa para invertir' : 'De menor a mayor; pulsa para invertir') : 'Ordenar por esta columna';
  }
}

function renderTable() {
  syncHeads();
  const list = rows();
  $('#mx-caption').innerHTML = `${list.length} modelos${!state.all && !state.q && list.length > PAGE ? ` (se muestran ${PAGE})` : ''} · precios en USD por millón de tokens (OpenRouter) · inteligencia: ${esc(aaIndexName(D.catalog.aaIndexVersion))}, configuración de mayor índice, datos de ${AA_LINK} · ECI: Epoch Capabilities Index (Epoch AI, CC BY 4.0); las dos escalas no son comparables · pulsa una fila para ver contexto, licencia, caché, programación, agentes y proveedores.`;
  const ex = D.catalog.excluded || [];
  const TIPO = { imagen: 'genera imágenes', audio: 'genera audio', enrutador: 'enrutadores', seguridad: 'clasificadores de seguridad' };
  if (ex.length) {
    const by = Object.keys(TIPO).map(t => [t, ex.filter(e => e.tipo === t)]).filter(([, l]) => l.length);
    $('#mx-caption').innerHTML += `<details class="excl"><summary>Fuera de la tabla: ${ex.length} entradas de OpenRouter que no son modelos de lenguaje de uso general (${by.map(([t, l]) => `${l.length} ${TIPO[t].replace(/^genera /, 'de ').replace('imágenes', 'imagen')}`).join(', ')})</summary>
      <ul>${by.map(([t, l]) => `<li><b>${esc(TIPO[t][0].toUpperCase() + TIPO[t].slice(1))}:</b> ${l.map(e => `<a href="https://openrouter.ai/${esc(e.id)}" target="_blank" rel="noopener">${esc(e.name)}</a>`).join(', ')}</li>`).join('')}</ul></details>`;
  }
  if (!list.length) { $('#mx-body').innerHTML = '<tr><td colspan="7"><div class="empty">Ningún modelo coincide con el filtro.</div></td></tr>'; return; }
  const shown = state.all || state.q ? list : list.slice(0, PAGE);
  $('#mx-more')?.remove();
  if (shown.length < list.length) $('.table-wrap').insertAdjacentHTML('afterend', `<button type="button" class="show-all" id="mx-more">Mostrar los ${list.length} modelos</button>`);
  $('#mx-more')?.addEventListener('click', () => { state.all = true; renderTable(); });
  $('#mx-body').innerHTML = shown.map(m => {
    const open = state.open.has(m.id);
    const checked = state.cmp.includes(m.id);
    const dis = !checked && state.cmp.length >= 3;
    return `<tr class="row" data-id="${esc(m.id)}" aria-expanded="${open}" tabindex="0">
      <td class="c-sel" data-label="Comparar"><input type="checkbox" aria-label="Comparar ${esc(m.name)}" data-cmp="${esc(m.id)}"${checked ? ' checked' : ''}${dis ? ' disabled' : ''}></td>
      <td class="c-name"><div class="m-name">${esc(m.name)}</div><div class="m-lab">${esc(m.lab.name)} · ${esc(country(m.lab.country))}</div></td>
      <td data-label="Pesos">${weightsBadge(m)}${m.license.v && m.weights.v === 'abiertos' ? `<span class="m-sub">${esc(m.license.v)}</span>` : ''}</td>
      <td class="num" data-label="Inteligencia (AA)">${m.aa ? `<span class="big">${fact(m.aa.intelligence, v => num(v))}</span>${aaConfigShort(m) ? `<span class="m-sub" title="Configuración de AA con mayor índice: ${esc(aaConfig(m))}">${esc(aaConfigShort(m))}</span>` : ''}` : ND}</td>
      <td class="num" data-label="ECI (Epoch)">${m.epoch ? `<span class="big">${fact(m.epoch.eci, v => num(v))}</span>` : ND}</td>
      <td class="num" data-label="Velocidad">${speedCell(m)}</td>
      <td class="num" data-label="Entrada / salida">${freeOnly(m) ? `<span class="big">gratis</span>${src(m.price.in)}<span class="m-sub">solo variante ${esc(m.orVariant.slice(m.orVariant.lastIndexOf(':')))}; sin precio de pago todavía</span>` : `<span class="big">${fact(m.price.in, usd)}</span><span class="m-sub">salida ${fact(m.price.out, usd)}</span>`}${m.price.provider ? `<span class="m-sub" title="${esc(priceBasis(m))}">${esc(m.price.provider)}${m.price.basis === 'proveedor' ? `${m.price.quant ? ` (${esc(m.price.quant)})` : ''}, el más barato` : ''}</span>` : ''}</td>
    </tr>${open ? `<tr class="detail"><td colspan="7">${detail(m)}</td></tr>` : ''}`;
  }).join('');
}

function renderCompare() {
  const el = $('#mx-compare');
  const ms = state.cmp.map(id => D.byId.get(id)).filter(Boolean);
  if (!ms.length) { el.hidden = true; return; }
  el.hidden = false;
  const sp = ms.map(speed);
  const rowsDef = [
    ['Pesos', m => weightsBadge(m)],
    ['Licencia', m => fact(m.license)],
    ['País del laboratorio', m => esc(country(m.lab.country))],
    ['Inteligencia (AA)', m => m.aa ? fact(m.aa.intelligence, v => num(v)) : ND, m => ii(m), 'max'],
    ['Programación (AA)', m => m.aa ? fact(m.aa.coding, v => num(v)) : ND, m => coding(m), 'max'],
    ['Agentes (AA)', m => m.aa ? fact(m.aa.agentic, v => num(v)) : ND, m => agentic(m), 'max'],
    ['Capacidad (ECI)', m => m.epoch ? fact(m.epoch.eci, v => num(v)) : ND, m => eci(m), 'max'],
    ['SWE-bench Verified', m => m.epoch ? fact(m.epoch.swe, v => num(v) + ' %') : ND, m => swe(m), 'max'],
    ['Velocidad (tok/s)', (m, i) => sp[i] ? `${num(sp[i].tps, 0)}${src(sp[i].f)} <span class="m-sub">${esc(sp[i].provider)}</span>` : ND, (m, i) => sp[i]?.tps ?? null, 'max'],
    ['Latencia', (m, i) => sp[i] && sp[i].ttft !== null && sp[i].ttft !== undefined ? `${num(sp[i].ttft, 2)} s${src(sp[i].ft)}` : ND, (m, i) => sp[i]?.ttft ?? null, 'min'],
    ['Entrada / M', m => fact(m.price.in, usd), m => m.price.in.v, 'min'],
    ['Salida / M', m => fact(m.price.out, usd), m => m.price.out.v, 'min'],
    ['Combinado 3:1', m => blended(m) !== null ? usd(blended(m)) : ND, m => blended(m), 'min'],
    ['Contexto', m => fact(m.ctx, v => tokens(v)), m => m.ctx.v, 'max'],
    ['Razonamiento', m => fact(m.reasoning, yesNo)]
  ];
  const cols = ms.length;
  let html = `<div class="compare-head"><span>Comparación (${cols} de 3)</span><button type="button" id="cmp-clear">Vaciar</button></div>`;
  html += `<div class="cmp-grid" style="grid-template-columns: minmax(110px, .8fr) repeat(${cols}, minmax(140px, 1fr))"><div class="rh ch"></div>${ms.map(m => `<div class="ch">${esc(m.name)}<span class="m-sub">${esc(m.lab.name)}</span></div>`).join('')}`;
  for (const [label, show, val, better] of rowsDef) {
    let bestIdx = -1;
    if (val && cols > 1) {
      const vs = ms.map((m, i) => val(m, i));
      const valid = vs.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined && !(better === 'min' && v === 0 && label.includes('/')));
      if (valid.length > 1) bestIdx = valid.sort((a, b) => better === 'max' ? b[0] - a[0] : a[0] - b[0])[0][1];
    }
    html += `<div class="rh">${label}</div>${ms.map((m, i) => `<div class="${i === bestIdx ? 'best' : ''}">${show(m, i)}</div>`).join('')}`;
  }
  html += '</div>';
  el.innerHTML = html;
  $('#cmp-clear').addEventListener('click', () => { state.cmp = []; renderCompare(); renderTable(); });
}

function renderFrontier() {
  const el = $('#mx-frontier');
  const f = D.catalog.epochFrontier;
  const series = (f?.points || []).map(p => ({
    date: p.date, open: p.open, closed: p.closed, openName: p.open?.name, closedName: p.closed?.name
  }));
  if (!frontier(el, series, { models: f?.models || null, yLabel: 'Epoch Capabilities Index (ECI)' })) {
    el.innerHTML = '<div class="chart-empty">Sin datos: Epoch AI no estaba disponible en la recogida.</div>';
  }
  const last = series[series.length - 1];
  const gap = last && last.open && last.closed ? Math.round((last.closed.v - last.open.v) * 10) / 10 : null;
  $('#mx-frontier-note').innerHTML = `<span class="lbl">Cómo leerlo</span>Cada línea es el mejor ECI alcanzado hasta esa fecha por un modelo con pesos abiertos y por uno cerrado; los puntos claros son el resto de modelos. Con nombre, el líder actual de cada grupo y los mayores saltos. Al pasar el cursor por un punto aparece su ficha. Datos de los ${f?.n ?? 'sin datos'} modelos que puntúa Epoch AI (incluidos los que no están en OpenRouter). Fuente: <a href="${esc(f?.url || 'https://epoch.ai/benchmarks/eci')}" target="_blank" rel="noopener">Epoch AI</a>, CC BY 4.0, consulta ${esc((f?.got || '').slice(0, 10))}.${gap !== null ? ` Distancia actual: ${num(gap)} puntos ECI (${esc(last.closedName)} frente a ${esc(last.openName)}).` : ''} Unos puntos de diferencia no equivalen a meses de retraso.`;
}

/* Ranking de uso de OpenRouter (conjunto de datos «rankings-daily», CC BY 4.0): diez primeros por tokens en los últimos 7 días. */
const tokB = v => `${num(v / 1e12, v < 1e12 ? 2 : 1)} B`;
const tokES = v => v >= 1e12 ? `${num(v / 1e12, 1)} billones` : v >= 1e9 ? `${num(v / 1e9, 0)} mil millones` : `${num(v / 1e6, 0)} millones`;
function renderUso() {
  const u = D.catalog.uso, el = $('#mx-uso'), note = $('#mx-uso-note');
  if (!u?.top?.length) {
    el.innerHTML = `<div class="chart-empty">${ND}: el ranking de uso necesita la clave de OpenRouter en la recogida.</div>`;
    note.innerHTML = `<span class="lbl">Fuente</span><a href="https://openrouter.ai/rankings" target="_blank" rel="noopener">OpenRouter, rankings</a> (CC BY 4.0).`;
    return;
  }
  const inCat = new Set(D.catalog.models.map(m => m.id));
  hbars(el, u.top.map(r => ({
    label: `${r.rank}. ${r.name || r.slug}${/:free$/.test(r.slug) ? ' :free' : ''}`, v: r.tokens, value: `${tokB(r.tokens)}${r.share != null ? ` (${num(r.share, 0)} %)` : ''}`,
    tip: tip(r.name || r.slug, [['Tokens en 7 días', `${tokES(r.tokens)} (entrada + salida)`], ['Cuota del total de OpenRouter', r.share != null ? `${num(r.share, 1)} %` : null], ['Identificador', r.slug], ['Variante', /:free$/.test(r.slug) ? 'gratuita: OpenRouter la cuenta aparte de la de pago' : null], ['En la tabla de arriba', r.id && inCat.has(r.id) ? 'sí' : 'no (laboratorio no seguido o fuera de la ventana)']])
  })), { aria: 'Modelos más usados en OpenRouter en los últimos 7 días', right: 112 });
  note.innerHTML = `<span class="lbl">Cómo leerlo</span>B = billones de tokens (un billón es un millón de millones); entre paréntesis, la cuota. Tokens de entrada más salida procesados en OpenRouter del ${esc(fmtDate(u.from))} al ${esc(fmtDate(u.to))} (días UTC completos), sumando el ranking diario. Es el uso en OpenRouter, no en todo el mercado: no cuenta lo que se consume en la API propia de cada laboratorio ni en sus aplicaciones, y los modelos gratuitos o en promoción suben mucho. La cuota es sobre todo el tráfico de OpenRouter esos días. Puede diferir un poco de la página «top weekly», que usa su propia ventana. Fuente: OpenRouter (<a href="${esc(u.url)}" target="_blank" rel="noopener">openrouter.ai/rankings</a>), datos hasta el ${esc(fmtDate(u.asOf))}, CC BY 4.0; consulta ${esc((u.got || '').slice(0, 10))}${u.stale ? ' (la última consulta falló: se muestra el ranking anterior)' : ''}.`;
}

export function renderModelos(d) {
  D = d;
  if (!d.catalog.models.some(m => ii(m) !== null)) {
    state.sort = d.catalog.models.some(m => eci(m) !== null) ? 'eci' : 'date'; state.dir = -1;
    $('#mx-sort').value = state.sort;
  }
  $('#mx-weights').addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    state.w = b.dataset.w;
    $$('#mx-weights [data-w]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderTable();
  });
  $('#mx-sort').addEventListener('change', e => { state.sort = e.target.value; state.dir = DIR0[state.sort]; renderTable(); });
  // Flechas en las cabeceras: pulsar la columna activa invierte el orden; otra columna empieza en su sentido por defecto.
  $('#mx-table thead')?.addEventListener('click', e => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    const k = b.dataset.sort;
    state.dir = state.sort === k ? -state.dir : DIR0[k];
    state.sort = k; $('#mx-sort').value = k;
    renderTable();
  });
  $('#mx-q').addEventListener('input', e => { state.q = e.target.value; renderTable(); });
  const body = $('#mx-body');
  body.addEventListener('change', e => {
    const id = e.target.dataset?.cmp; if (!id) return;
    state.cmp = e.target.checked ? [...state.cmp, id].slice(0, 3) : state.cmp.filter(x => x !== id);
    renderCompare(); renderTable();
  });
  const toggle = tr => { const id = tr.dataset.id; state.open.has(id) ? state.open.delete(id) : state.open.add(id); renderTable(); };
  body.addEventListener('click', e => {
    if (e.target.closest('a, input, label')) return;
    const tr = e.target.closest('tr.row'); if (tr) toggle(tr);
  });
  body.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.row')) { e.preventDefault(); toggle(e.target); $(`tr.row[data-id="${CSS.escape(e.target.dataset.id)}"]`)?.focus(); }
  });
  renderTable();
  renderCompare();
  renderFrontier();
  renderUso();
}
