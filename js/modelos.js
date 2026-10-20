/* Vista «Modelos»: comparador, ficha desplegable, comparación de hasta tres y evolución de la frontera. */
import { esc, fact, src, usd, num, tokens, fmtDate, country, blended, ii, coding, speed, ND, AA_LEADERBOARD } from './fmt.js';
import { frontier } from './charts.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { w: 'all', sort: 'ii', q: '', open: new Set(), cmp: [], all: false };
const PAGE = 40;
let D;

const yesNo = v => v === true ? 'sí' : v === false ? 'no' : null;
const weightsBadge = m => {
  const v = m.weights.v;
  return `<span class="w ${v || 'nd'}">${v || 'sin datos'}</span>${src(m.weights)}${m.weights.inferred ? '<span class="m-sub" title="OpenRouter no enlaza pesos; se asume cerrado">inferido</span>' : ''}`;
};

function sortKey(m) {
  switch (state.sort) {
    case 'ii': return ii(m);
    case 'coding': return coding(m);
    case 'price': { const b = blended(m); return b === null ? null : -b; }
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
      return kb - ka;
    });
}

function speedCell(m) {
  const s = speed(m);
  if (!s) return ND;
  const ttft = s.ttft !== null && s.ttft !== undefined ? `${num(s.ttft, 2)} s` : 'sin datos';
  return `<span class="big">${num(s.tps, 0)}</span> tok/s${src(s.f)}<span class="m-sub">espera inicial ${ttft}</span><span class="m-sub">${esc(s.provider)}</span>`;
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
    ['Precio combinado 3:1', blended(m) !== null ? usd(blended(m)) + ' / M' + src(m.price.in) : ND],
    ['Alta en OpenRouter', fact(m.orCreated, v => fmtDate(v))],
    ['Repositorio de pesos', m.hfCreated ? fact(m.hfCreated, v => fmtDate(v)) : ND],
    ['Fecha del modelo (Epoch)', m.epoch ? fact(m.epoch.release, v => fmtDate(v)) : ND],
    ['Capacidad (ECI)', m.epoch ? `${fact(m.epoch.eci, v => num(v))}<span class="m-sub">intervalo ${num(m.epoch.eci.ci?.[0])}–${num(m.epoch.eci.ci?.[1])} · como «${esc(m.epoch.name)}» en Epoch${m.epoch.how && m.epoch.how !== 'nombre' ? ` (${esc(m.epoch.how)})` : ''}</span>` : `sin puntuación en Epoch AI todavía; consulta la ${AA_LEADERBOARD}`],
    ['Acceso según Epoch', m.epoch ? fact(m.epoch.access) : ND],
    ['SWE-bench Verified', m.epoch ? fact(m.epoch.swe, v => num(v) + ' %') + (m.epoch.swe.note ? `<span class="m-sub">${esc(m.epoch.swe.note)}</span>` : '') : ND],
    ...(aa ? [['Artificial Analysis', `<a href="${esc(aa.url)}" target="_blank" rel="noopener">${esc(aa.name)}</a>: índice ${fact(aa.intelligence, v => num(v))}`]] : [])
  ];
  const provTable = eps.length ? `
    <table class="subt"><caption class="sr-only">Proveedores en OpenRouter</caption>
      <thead><tr><th>Proveedor (OpenRouter)</th><th>Cuantización</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Contexto</th><th class="num">tok/s p50</th><th class="num">Espera inicial p50</th><th class="num">Disponibilidad 30 min</th></tr></thead>
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

function renderTable() {
  const list = rows();
  $('#mx-caption').innerHTML = `${list.length} modelos${!state.all && !state.q && list.length > PAGE ? ` (se muestran ${PAGE})` : ''} · precios en USD por millón de tokens (OpenRouter) · capacidad: Epoch Capabilities Index; programación: % de SWE-bench Verified resuelto según Epoch (CC BY 4.0) · pulsa una fila para ver contexto, licencia, caché y proveedores.`;
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
      <td class="num" data-label="Capacidad (ECI)">${m.epoch ? `<span class="big">${fact(m.epoch.eci, v => num(v))}</span>` : ND}</td>
      <td class="num" data-label="SWE-bench Verified">${m.epoch ? fact(m.epoch.swe, v => num(v) + ' %') : ND}</td>
      <td class="num" data-label="Velocidad">${speedCell(m)}</td>
      <td class="num" data-label="Entrada / salida">${fact(m.price.in, usd)}<span class="m-sub">${fact(m.price.out, usd)}</span></td>
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
    ['Capacidad (ECI)', m => m.epoch ? fact(m.epoch.eci, v => num(v)) : ND, m => ii(m), 'max'],
    ['SWE-bench Verified', m => m.epoch ? fact(m.epoch.swe, v => num(v) + ' %') : ND, m => coding(m), 'max'],
    ['Velocidad (tok/s)', (m, i) => sp[i] ? `${num(sp[i].tps, 0)}${src(sp[i].f)} <span class="m-sub">${esc(sp[i].provider)}</span>` : ND, (m, i) => sp[i]?.tps ?? null, 'max'],
    ['Espera inicial', (m, i) => sp[i] && sp[i].ttft !== null && sp[i].ttft !== undefined ? `${num(sp[i].ttft, 2)} s${src(sp[i].ft)}` : ND, (m, i) => sp[i]?.ttft ?? null, 'min'],
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
    date: p.date, version: 'eci',
    open: p.open?.v ?? null, closed: p.closed?.v ?? null, openName: p.open?.name, closedName: p.closed?.name
  }));
  if (!frontier(el, series, { step: true, yLabel: 'Epoch Capabilities Index (ECI)' })) {
    el.innerHTML = '<div class="chart-empty">Sin datos: Epoch AI no estaba disponible en la recogida.</div>';
  }
  const last = series[series.length - 1];
  const gap = last && last.open !== null && last.closed !== null ? Math.round((last.closed - last.open) * 10) / 10 : null;
  $('#mx-frontier-note').innerHTML = `<span class="lbl">Cómo leerlo</span>Cada línea es el mejor ECI alcanzado hasta esa fecha por un modelo con pesos abiertos y por uno cerrado, entre los ${f?.n ?? 'sin datos'} modelos que puntúa Epoch AI (incluidos los que no están en OpenRouter). Fuente: <a href="${esc(f?.url || 'https://epoch.ai/benchmarks/eci')}" target="_blank" rel="noopener">Epoch AI</a>, CC BY 4.0, consulta ${esc((f?.got || '').slice(0, 10))}.${gap !== null ? ` Distancia actual: ${num(gap)} puntos ECI (${esc(last.closedName)} frente a ${esc(last.openName)}).` : ''} Unos puntos de diferencia no equivalen a meses de retraso.`;
}

export function renderModelos(d) {
  D = d;
  if (!d.catalog.models.some(m => ii(m) !== null)) { state.sort = 'date'; $('#mx-sort').value = 'date'; }
  $('#mx-weights').addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    state.w = b.dataset.w;
    $$('#mx-weights [data-w]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderTable();
  });
  $('#mx-sort').addEventListener('change', e => { state.sort = e.target.value; renderTable(); });
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
}
