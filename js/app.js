/* MOLOCH.SH · observatorio — carga de datos, navegación y tema. */
import { esc, setSources, fmtDateTime, daysAgo } from './fmt.js';
import { renderHoy } from './hoy.js';
import { renderModelos } from './modelos.js';
import { renderLanzamientos } from './lanzamientos.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const VIEWS = ['hoy', 'modelos', 'lanzamientos'];

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function loadData() {
  const catalog = await getJSON('data/catalog.json');
  const [changes, evLog] = await Promise.all([
    getJSON('data/changes.json').catch(() => ({ items: [], since: null })),
    getJSON('data/events-log.json').catch(() => ({ events: [] }))
  ]);
  const today = catalog.generated.slice(0, 10);
  const dates = (catalog.history || []).filter(d => d < today).sort();
  const prevSnap = dates.length ? await getJSON(`data/history/${dates[dates.length - 1]}.json`).catch(() => null) : null;
  return { catalog, changes, evLog, prevSnap, byId: new Map(catalog.models.map(m => [m.id, m])) };
}

/* Antigüedad de la recogida: el observatorio sigue precios y lanzamientos, así que una semana ya es mucho. */
function renderFreshness(d) {
  const el = $('#freshness');
  const c = d.catalog;
  const age = daysAgo(c.generated);
  const cls = age <= 1.5 ? 'st-ok' : age <= 7 ? 'st-warn' : 'st-bad';
  const ageTxt = age < 1 ? `hace ${Math.max(1, Math.round(age * 24))} h` : `hace ${Math.floor(age)} d`;
  const warn = age > 7 ? ' · DATOS DESACTUALIZADOS' : age > 1.5 ? ' · comprobar la recogida' : '';
  const st = Object.entries(c.status || {}).map(([k, s]) => {
    const name = c.sources?.[k]?.name || k;
    return s.ok ? `<span class="st-ok">● ${esc(name)}</span>` : `<span class="st-bad" title="${esc(s.reason || '')}">○ ${esc(name)}: ${esc(s.reason || 'sin datos')}</span>`;
  }).join('');
  el.innerHTML = `<span>Recogida <b>${esc(fmtDateTime(c.generated))}</b> <span class="${cls}">(${ageTxt}${warn})</span></span>${st}`;
}

function renderMethod(d) {
  const c = d.catalog;
  const items = Object.values(c.method || {}).map(t => `<li>${esc(t)}</li>`).join('');
  const srcs = Object.entries(c.sources || {}).filter(([, s]) => s.url).map(([k, s]) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a> (${esc({ openrouter: 'OR', aa: 'AA', hf: 'HF' }[k] || k)})</li>`).join('');
  $('#method-body').innerHTML = `
    <p>Cada cifra lleva una marca de fuente (OR, AA, HF). Al pasar el cursor o enfocarla se ven la fecha del dato y la fecha de consulta; al pulsarla se abre la fuente. Una marca en ámbar indica que la última consulta falló y se muestra el último valor válido. Si una fuente no da el dato, aparece «sin datos».</p>
    <ul>${items}</ul>
    <p>Fuentes:</p><ul>${srcs}</ul>
    <p>País, licencia y disponibilidad de pesos son campos independientes. El país es la sede del laboratorio; los modelos anónimos figuran como «identidad sin confirmar» y no se atribuyen a ningún laboratorio.</p>
    <p>Los datos se generan con <code>scripts/collect.mjs</code>; el código y el histórico están en el repositorio.</p>`;
}

function route() {
  const v = location.hash.replace('#', '');
  const view = VIEWS.includes(v) ? v : 'hoy';
  $$('.view').forEach(s => { s.hidden = s.dataset.view !== view; });
  $$('.navtab[data-view]').forEach(a => a.dataset.view === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
}

function initTheme() {
  const root = document.documentElement;
  const sync = () => $$('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === (root.dataset.theme || 'auto'))));
  $$('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    root.dataset.theme = b.dataset.themeSet;
    try { b.dataset.themeSet === 'auto' ? localStorage.removeItem('moloch.theme') : localStorage.setItem('moloch.theme', b.dataset.themeSet); } catch {}
    sync();
  }));
  sync();
}

async function main() {
  initTheme();
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  route();
  let d;
  try { d = await loadData(); }
  catch (e) {
    $('#freshness').innerHTML = '<span class="st-bad">Todavía no hay datos recogidos. El recolector (scripts/collect.mjs) genera data/catalog.json.</span>';
    for (const id of ['#hoy-news', '#ln-list']) $(id).innerHTML = '<div class="empty">Sin datos: aún no se ha ejecutado ninguna recogida.</div>';
    $('#mx-body').innerHTML = '<tr><td colspan="7"><div class="empty">Sin datos: aún no se ha ejecutado ninguna recogida.</div></td></tr>';
    console.error(e);
    return;
  }
  setSources(d.catalog.sources);
  renderFreshness(d);
  renderMethod(d);
  renderHoy(d);
  renderModelos(d);
  renderLanzamientos(d);
}

main();
