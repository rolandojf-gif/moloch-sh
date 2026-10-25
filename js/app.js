/* MOLOCH.SH · observatorio — carga de datos, navegación y tema. */
import { t, tr, lang, setLang, loadLang, applyStatic, initialLang, i18nEnabled, persistLang, missing, clearMissing } from './i18n.js';
import { esc, setSources, fmtDate, fmtDateTime, daysAgo } from './fmt.js';
import { renderHoy } from './hoy.js';
import { renderModelos, showModelPath } from './modelos.js';
import { renderLanzamientos } from './lanzamientos.js';
import { renderCarrera } from './carrera.js';
import { renderAi2027 } from './ai2027.js';
import { hideTip } from './charts.js';

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
  const HOME = { uso: 'https://openrouter.ai/rankings', openrouter: 'https://openrouter.ai', OpenRouter: 'https://openrouter.ai', hf: 'https://huggingface.co', 'Hugging Face': 'https://huggingface.co', epoch: 'https://epoch.ai', 'Epoch AI': 'https://epoch.ai', aa: 'https://artificialanalysis.ai', 'Artificial Analysis': 'https://artificialanalysis.ai' };
  const c = d.catalog;
  const age = daysAgo(c.generated);
  const cls = age <= 1.5 ? 'st-ok' : age <= 7 ? 'st-warn' : 'st-bad';
  const ageTxt = age < 1 ? t('hace {p1} h', { p1: Math.max(1, Math.round(age * 24)) }) : t('hace {p1} d', { p1: Math.floor(age) });
  const warn = age > 7 ? t(' · DATOS DESACTUALIZADOS') : age > 1.5 ? t(' · comprobar la recogida') : '';
  const st = Object.entries(c.status || {}).filter(([, s]) => !s.optional).map(([k, s]) => {
    const name = c.sources?.[k]?.name || k;
    const home = HOME[k] || HOME[name];
    const lbl = home ? `<a href="${home}" target="_blank" rel="noopener">${esc(tr(name))}</a>` : esc(tr(name));
    return s.ok ? `<span class="st-ok">● ${lbl}</span>` : `<span class="st-bad" title="${esc(tr(s.reason || ''))}">○ ${lbl}: ${esc(s.reason ? tr(s.reason) : t('sin datos'))}</span>`;
  }).join('');
  // Indicadores de La carrera y AI 2027: una sola marca si todo va bien; cada fuente que falle, por separado.
  const IND = { epoch_dc: t('Epoch AI · centros de datos'), epoch_chips: t('Epoch AI · chips'), epoch_companies: t('Epoch AI · empresas'), epoch_models: t('Epoch AI · cómputo de entrenamiento'), epoch_eci: t('Epoch AI · datos del ECI'), metr: 'METR' };
  const ist = Object.entries(d.ind?.status || {}).filter(([k]) => k in IND);
  const bad = ist.filter(([, s]) => !s.ok);
  const indSt = !d.ind ? `<span class="st-bad">${t('○ Indicadores: sin datos')}</span>`
    : bad.length ? bad.map(([k, s]) => `<span class="st-bad" title="${esc(tr(s.reason || ''))}">○ ${esc(IND[k])}: ${esc(s.reason ? tr(s.reason) : t('sin datos'))}</span>`).join('')
    : `<span class="st-ok" title="${esc(ist.map(([k]) => IND[k]).join(', '))}">${t('● Indicadores')}</span>`;
  el.innerHTML = `<span>${t('Recogida')} <b>${esc(fmtDateTime(c.generated))}</b> <span class="${cls}">(${ageTxt}${warn})</span></span>${st}${indSt}<a class="refresh" href="https://github.com/rolandojf-gif/moloch-sh/actions/workflows/collect.yml" target="_blank" rel="noopener" title="${t('Consulta el historial de recogidas en GitHub. Solo los colaboradores con permisos pueden iniciar una recogida manual.')}">${t('Ver estado de actualización ↗')}</a>`;
}

function renderMethod(d) {
  const c = d.catalog;
  const items = Object.values(c.method || {}).map(m => `<li>${esc(tr(m))}</li>`).join('');
  const srcs = Object.entries(c.sources || {}).filter(([, s]) => s.url).map(([k, s]) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(tr(s.name))}</a> (${esc({ openrouter: 'OR', aa: 'AA', hf: 'HF', epoch: 'EP', metr: 'METR' }[k] || k)})${s.license ? t(', licencia {p1}', { p1: esc(tr(s.license)) }) : ''}${k === 'aa' ? (s.permiso ? t(', publicado con su permiso por escrito del {fmtDate}', { fmtDate: esc(fmtDate(s.permiso.fecha)) }) : t(': no se usa; sin permiso no se pueden republicar sus datos')) : ''}</li>`).join('');
  $('#method-body').innerHTML = `
    <p>${t('Cada cifra lleva una marca de fuente (OR, AA, HF, EP, METR). Al pasar el cursor o enfocarla se ven la fecha del dato y la fecha de consulta; al pulsarla se abre la fuente. Una marca en ámbar indica que la última consulta falló y se muestra el último valor válido. Si una fuente no da el dato, aparece «sin datos».')}</p>
    <ul>${items}</ul>
    <p>${t('Fuentes:')}</p><ul>${srcs}</ul>
    <p>${t('País, licencia y disponibilidad de pesos son campos independientes. El país es la sede del laboratorio; los modelos anónimos figuran como «identidad sin confirmar» y no se atribuyen a ningún laboratorio.')}</p>
    <p>${t('Inteligencia, programación, agentes y velocidad de referencia de los modelos:')} <a href="https://artificialanalysis.ai" target="_blank" rel="noopener">${t('Artificial Analysis')}</a>${t(', que autorizó por escrito su uso en esta web personal y no comercial. AA no publica la fecha en que evalúa cada modelo; la fecha del dato es la de consulta.')}</p>
    <p>${t('ECI y SWE-bench Verified: Epoch AI, ‘Capabilities &amp; benchmarking’. Centros de datos, ventas de chips e ingresos y uso de empresas: conjuntos de datos de Epoch AI. Todo publicado en')} <a href="https://epoch.ai/" target="_blank" rel="noopener">${t('epoch.ai')}</a>${t(', licencia CC BY 4.0.')}</p>
    <p>${t('Horizonte temporal: METR (')}<a href="https://metr.org/time-horizons" target="_blank" rel="noopener">${t('metr.org')}</a>${t('), con todos los derechos reservados; sólo se cita el último punto del modelo puntero. METR dejó de actualizar esa página el 8 sep 2026.')}</p>
    <p>${t('La carrera y AI 2027: los hechos curados llevan fuente, fecha del dato y fecha de consulta, y dicen si se leyeron en la propia fuente o sólo a través de un buscador (la web de la IEA no admite lectura automática). Las lecturas son interpretación y se formulan como hipótesis con historial fechado.')}</p>
    <p>${t('Los datos se generan con')} <code>${t('scripts/collect.mjs')}</code>${t('; el código y el histórico están en el repositorio.')}</p>`;
}

/* Direcciones: #vista o #vista/<parte>: #modelos/<id> abre la ficha de un modelo (o #modelos/comparar/<id>,<id>),
   #ai2027/<hito> y #carrera/<frente> llevan a esa ficha. */
function route() {
  const [v, ...rest] = location.hash.replace('#', '').split('/');
  const view = VIEWS.includes(v) ? v : 'hoy';
  $$('.view').forEach(s => { s.hidden = s.dataset.view !== view; });
  $$('.navtab[data-view]').forEach(a => a.dataset.view === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  let sub = rest.join('/');
  try { sub = decodeURIComponent(sub); } catch {}
  return { view, sub: VIEWS.includes(v) && sub ? sub : null };
}

function jump(el) {
  if (!el) return false;
  el.scrollIntoView({ block: 'start' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  return true;
}
function showPath({ view, sub }) {
  if (!sub) return false;
  if (view === 'modelos') { showModelPath(sub); return true; }
  if (view === 'ai2027') return jump(document.getElementById(`hito-${sub}`));
  if (view === 'carrera') return jump(document.getElementById(`frente-${sub}`));
  return false;
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

/* Altura de lo que queda fijo arriba (cabecera y franja; en el móvil, sólo la cabecera), para que los saltos a una ficha
   o a un apartado no queden tapados. */
function trackTop() {
  const box = document.getElementById('topfix'), nav = box?.querySelector('.topnav');
  if (!box || !nav) return;
  const set = () => document.documentElement.style.setProperty('--top-h',
    `${Math.round((getComputedStyle(box).display === 'contents' ? nav : box).getBoundingClientRect().height)}px`);
  set();
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(set); ro.observe(box); ro.observe(nav); }
}

/* Cada parte se dibuja por separado: si una falla con los datos de una recogida, las demás y las direcciones directas
   siguen funcionando, y la vista afectada lo dice (data-render-error, que busca la prueba de humo). */
function safe(view, fn, d) {
  try { fn(d); }
  catch (e) {
    console.error(t('No se ha podido dibujar {p1}:', { p1: view || fn.name }), e);
    const s = view && document.querySelector(`section[data-view="${view}"]`);
    if (s) s.insertAdjacentHTML('afterbegin', `<div class="empty view-error" role="alert" data-render-error="${view}"><b>${t('Esta sección no se ha podido dibujar')}</b> ${t('con los datos de esta recogida. El resto del observatorio no se ve afectado.')}</div>`);
  }
}

/* ── Idioma ──
   Cada vista recuerda en qué idioma está pintada (rendered). Al cambiar de idioma se cargan primero las traducciones (la
   página sigue en el idioma de antes y operativa), y después, en un solo bloque síncrono, se cambia el idioma, se repinta la
   vista visible y se restaura el estado. Las demás vistas se repintan en un momento libre o, a más tardar, al abrirlas. El
   estado de los filtros, la ordenación, las comparaciones y las fichas abiertas vive en los módulos y se conserva solo. */
const RENDER = { hoy: renderHoy, modelos: renderModelos, lanzamientos: renderLanzamientos, carrera: renderCarrera, ai2027: renderAi2027 };
let D = null;
const rendered = {};

function renderView(v) {
  document.querySelector(`section[data-view="${v}"] > .view-error`)?.remove();
  safe(v, RENDER[v], D);
  rendered[v] = lang();
}
const ensureView = v => { if (D && rendered[v] !== lang()) renderView(v); };
const renderChrome = () => { safe(null, renderFreshness, D); safe(null, renderMethod, D); };
const idle = fn => 'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 60);

/* Marca de pruebas (?qa=1): deja en la página los textos que no encontraron traducción. */
function qa() {
  if (new URLSearchParams(location.search).get('qa') !== '1' || !D) return;
  for (const v of VIEWS) ensureView(v);
  document.getElementById('qa')?.remove();
  const el = document.createElement('script');
  el.id = 'qa'; el.type = 'application/json';
  el.textContent = JSON.stringify({ lang: lang(), ...missing() });
  document.body.appendChild(el);
}

const detailsState = () => $$('details').map(el => el.open);
function restoreDetails(open) { const all = $$('details'); if (all.length === open.length) all.forEach((el, i) => { el.open = open[i]; }); }

function syncLangButtons() {
  $$('[data-lang-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.langSet === lang())));
}

let switching = false;
async function switchLang(next) {
  if (next === lang() || switching) return;
  switching = true;
  const bar = $('.seg.lang');
  bar?.setAttribute('aria-busy', 'true');
  try { await loadLang(next); }
  catch (e) { console.error(e); bar?.removeAttribute('aria-busy'); switching = false; return; }   // sin traducciones: se queda como estaba
  // A partir de aquí todo es síncrono: no hay estado intermedio visible.
  const y = window.scrollY, open = detailsState(), view = route().view;
  clearMissing();
  setLang(next);
  persistLang(next);
  applyStatic();
  hideTip();
  if (D) { renderChrome(); renderView(view); restoreDetails(open); }
  syncLangButtons();
  window.scrollTo(0, y);
  bar?.removeAttribute('aria-busy');
  switching = false;
  if (D) { for (const v of VIEWS) if (v !== view) idle(() => ensureView(v)); }
  qa();
}

function initLang() {
  const bar = $('.seg.lang');
  if (!bar) return;
  bar.hidden = !i18nEnabled();   // visible sólo con la bandera ?i18n=1 (o con RELEASED en js/i18n.js)
  $$('[data-lang-set]').forEach(b => b.addEventListener('click', () => switchLang(b.dataset.langSet)));
  syncLangButtons();
}

async function main() {
  const first = initialLang();
  initTheme();
  initLang();
  trackTop();
  let ready = false;
  window.addEventListener('hashchange', () => { const r = route(); ensureView(r.view); if (!(ready && showPath(r))) window.scrollTo(0, 0); });
  route();
  // Las traducciones y los datos se piden a la vez; el idioma se aplica antes de pintar nada.
  const [loaded, data] = await Promise.allSettled([loadLang(first), loadData()]);
  if (first === 'en' && loaded.status === 'fulfilled') setLang('en');
  applyStatic();
  syncLangButtons();
  if (data.status === 'rejected') {
    $('#freshness').innerHTML = `<span class="st-bad" data-state="empty">${t('Todavía no hay datos recogidos. El recolector (scripts/collect.mjs) genera data/catalog.json.')}</span>`;
    for (const id of ['#hoy-news', '#ln-list']) $(id).innerHTML = `<div class="empty">${t('Sin datos: aún no se ha ejecutado ninguna recogida.')}</div>`;
    $('#mx-body').innerHTML = `<tr><td colspan="7"><div class="empty">${t('Sin datos: aún no se ha ejecutado ninguna recogida.')}</div></td></tr>`;
    console.error(data.reason);
    return;
  }
  D = data.value;
  setSources(D.catalog.sources);
  renderChrome();
  for (const v of VIEWS) renderView(v);
  ready = true;
  showPath(route());
  qa();
}

main();
