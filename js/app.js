/* MOLOCH.SH · observatorio — carga de datos, navegación y tema. */
import { esc, setSources, fmtDate, fmtDateTime, daysAgo } from './fmt.js';
import { renderHoy } from './hoy.js';
import { renderModelos } from './modelos.js';
import { renderLanzamientos } from './lanzamientos.js';
import { renderCarrera } from './carrera.js';
import { renderAi2027 } from './ai2027.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const VIEWS = ['hoy', 'modelos', 'lanzamientos', 'carrera', 'ai2027'];

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function loadData() {
  const catalog = await getJSON('data/catalog.json');
  const [changes, evLog, ind, carrera, ai2027, historia] = await Promise.all([
    getJSON('data/changes.json').catch(() => ({ items: [], since: null })),
    getJSON('data/events-log.json').catch(() => ({ events: [] })),
    getJSON('data/indicadores.json').catch(() => null),
    getJSON('data/curated/carrera.json').catch(() => null),
    getJSON('data/curated/ai2027.json').catch(() => null),
    getJSON('data/historia.json').catch(() => null)
  ]);
  const today = catalog.generated.slice(0, 10);
  const dates = (catalog.history || []).filter(d => d < today).sort();
  const prevSnap = dates.length ? await getJSON(`data/history/${dates[dates.length - 1]}.json`).catch(() => null) : null;
  return { catalog, changes, evLog, ind, carrera, ai2027, historia, prevSnap, byId: new Map(catalog.models.map(m => [m.id, m])) };
}

/* Antigüedad de la recogida: el observatorio sigue precios y lanzamientos, así que una semana ya es mucho. */
function renderFreshness(d) {
  const el = $('#freshness');
  // Web principal de cada proveedor de datos (por clave de fuente o por nombre).
  const HOME = { openrouter: 'https://openrouter.ai', OpenRouter: 'https://openrouter.ai', hf: 'https://huggingface.co', 'Hugging Face': 'https://huggingface.co', epoch: 'https://epoch.ai', 'Epoch AI': 'https://epoch.ai', aa: 'https://artificialanalysis.ai', 'Artificial Analysis': 'https://artificialanalysis.ai' };
  const c = d.catalog;
  const age = daysAgo(c.generated);
  const cls = age <= 1.5 ? 'st-ok' : age <= 7 ? 'st-warn' : 'st-bad';
  const ageTxt = age < 1 ? `hace ${Math.max(1, Math.round(age * 24))} h` : `hace ${Math.floor(age)} d`;
  const warn = age > 7 ? ' · DATOS DESACTUALIZADOS' : age > 1.5 ? ' · comprobar la recogida' : '';
  const st = Object.entries(c.status || {}).filter(([, s]) => !s.optional).map(([k, s]) => {
    const name = c.sources?.[k]?.name || k;
    const home = HOME[k] || HOME[name];
    const lbl = home ? `<a href="${home}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
    return s.ok ? `<span class="st-ok">● ${lbl}</span>` : `<span class="st-bad" title="${esc(s.reason || '')}">○ ${lbl}: ${esc(s.reason || 'sin datos')}</span>`;
  }).join('');
  // Indicadores de La carrera y AI 2027: una sola marca si todo va bien; cada fuente que falle, por separado.
  const IND = { epoch_dc: 'Epoch AI · centros de datos', epoch_chips: 'Epoch AI · chips', epoch_companies: 'Epoch AI · empresas', epoch_models: 'Epoch AI · cómputo de entrenamiento', metr: 'METR' };
  const ist = Object.entries(d.ind?.status || {}).filter(([k]) => k in IND);
  const bad = ist.filter(([, s]) => !s.ok);
  const indSt = !d.ind ? '<span class="st-bad">○ Indicadores: sin datos</span>'
    : bad.length ? bad.map(([k, s]) => `<span class="st-bad" title="${esc(s.reason || '')}">○ ${esc(IND[k])}: ${esc(s.reason || 'sin datos')}</span>`).join('')
    : `<span class="st-ok" title="${esc(ist.map(([k]) => IND[k]).join(', '))}">● Indicadores</span>`;
  el.innerHTML = `<span>Recogida <b>${esc(fmtDateTime(c.generated))}</b> <span class="${cls}">(${ageTxt}${warn})</span></span>${st}${indSt}<a class="refresh" href="https://github.com/rolandojf-gif/moloch-sh/actions/workflows/collect.yml" target="_blank" rel="noopener" title="Abre la recogida en GitHub: pulsa «Run workflow» en la rama main. Tarda un par de minutos en verse publicada.">Actualizar ahora ↗</a>`;
}

function renderMethod(d) {
  const c = d.catalog;
  const items = Object.values(c.method || {}).map(t => `<li>${esc(t)}</li>`).join('');
  const srcs = Object.entries(c.sources || {}).filter(([, s]) => s.url).map(([k, s]) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a> (${esc({ openrouter: 'OR', aa: 'AA', hf: 'HF', epoch: 'EP', metr: 'METR' }[k] || k)})${s.license ? `, licencia ${esc(s.license)}` : ''}${k === 'aa' ? (s.permiso ? `, publicado con su permiso por escrito del ${esc(fmtDate(s.permiso.fecha))}` : ': no se usa; sin permiso no se pueden republicar sus datos') : ''}</li>`).join('');
  $('#method-body').innerHTML = `
    <p>Cada cifra lleva una marca de fuente (OR, AA, HF, EP, METR). Al pasar el cursor o enfocarla se ven la fecha del dato y la fecha de consulta; al pulsarla se abre la fuente. Una marca en ámbar indica que la última consulta falló y se muestra el último valor válido. Si una fuente no da el dato, aparece «sin datos».</p>
    <ul>${items}</ul>
    <p>Fuentes:</p><ul>${srcs}</ul>
    <p>País, licencia y disponibilidad de pesos son campos independientes. El país es la sede del laboratorio; los modelos anónimos figuran como «identidad sin confirmar» y no se atribuyen a ningún laboratorio.</p>
    <p>Inteligencia, programación, agentes y velocidad de referencia de los modelos: <a href="https://artificialanalysis.ai" target="_blank" rel="noopener">Artificial Analysis</a>, que autorizó por escrito su uso en esta web personal y no comercial. AA no publica la fecha en que evalúa cada modelo; la fecha del dato es la de consulta.</p>
    <p>ECI y SWE-bench Verified: Epoch AI, ‘Capabilities &amp; benchmarking’. Centros de datos, ventas de chips e ingresos y uso de empresas: conjuntos de datos de Epoch AI. Todo publicado en <a href="https://epoch.ai/" target="_blank" rel="noopener">epoch.ai</a>, licencia CC BY 4.0.</p>
    <p>Horizonte temporal: METR (<a href="https://metr.org/time-horizons" target="_blank" rel="noopener">metr.org</a>), con todos los derechos reservados; sólo se cita el último punto del modelo puntero. METR dejó de actualizar esa página el 8 sep 2026.</p>
    <p>La carrera y AI 2027: los hechos curados llevan fuente, fecha del dato y fecha de consulta, y dicen si se leyeron en la propia fuente o sólo a través de un buscador (la web de la IEA no admite lectura automática). Las lecturas son interpretación y se formulan como hipótesis con historial fechado.</p>
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
  const sync = () => $$('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === (root.dataset.theme || 'light'))));
  $$('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    root.dataset.theme = b.dataset.themeSet;
    try { localStorage.setItem('moloch.theme', b.dataset.themeSet); } catch {}
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
  renderCarrera(d);
  renderAi2027(d);
}

main();
