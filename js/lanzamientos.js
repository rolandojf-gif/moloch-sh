/* Vista «Lanzamientos»: por modelo, qué etapas constan (anuncio, acceso restringido, API pública, pesos) y con qué fuente. */
import { esc, src, provLine, fmtDate, num, ii } from './fmt.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { w: 'all', days: 90 };
let D;

const STAGES = [
  ['anuncio', 'Anuncio'],
  ['preview', 'Acceso restringido'],
  ['api', 'API pública'],
  ['pesos', 'Pesos descargables']
];
const EVT = { precio: 'Cambio de precio', retirada: 'Retirada', pesos: 'Pesos abiertos', evaluacion: 'Primera evaluación', anuncio: 'Anuncio', preview: 'Acceso restringido', api: 'API pública' };

/* Etapas de un modelo. Las curadas (anuncio, preview) exigen URL; API y pesos salen del recolector. */
function stagesOf(m, curated) {
  const st = {};
  for (const e of curated.filter(e => e.model === m.id)) {
    if (!st[e.type] || e.date < st[e.type].date) st[e.type] = { date: e.date, html: src({ src: 'curated', url: e.url, asOf: e.date, note: e.note || '' }), delta: e.delta };
  }
  if (m.orCreated.v) st.api = st.api || { date: m.orCreated.v, html: src(m.orCreated), note: 'alta en OpenRouter' };
  if (m.weights.v === 'abiertos' && m.hfCreated?.v) st.pesos = st.pesos || { date: m.hfCreated.v, html: src(m.hfCreated), note: `repositorio creado · ${m.license.v || 'licencia sin datos'}` };
  return st;
}

function cardFor(m, curated) {
  const st = stagesOf(m, curated);
  const dates = Object.values(st).map(s => s.date).filter(Boolean).sort();
  const latest = dates[dates.length - 1];
  const delta = Object.values(st).find(s => s.delta)?.delta;
  const evalTxt = ii(m) !== null
    ? `sí: ECI ${num(ii(m))}${src(m.epoch.eci)} en Epoch AI`
    : 'no consta en el índice de Epoch AI';
  const aaRel = m.epoch?.release?.v ? ` · fecha del modelo según Epoch: ${esc(fmtDate(m.epoch.release.v))}${src(m.epoch.release)}` : '';
  const identity = m.identity === 'confirmada' ? '' : ' <span class="tag">Identidad sin confirmar</span>';
  return {
    date: latest, weights: m.weights.v,
    html: `<article class="rel">
      <div class="rel-date">${esc(fmtDate(latest))}</div>
      <div>
        <h3>${esc(m.name)} <span class="w ${m.weights.v || 'nd'}">${esc(m.weights.v || 'pesos sin datos')}</span>${identity}</h3>
        <div class="m-lab">${esc(m.lab.name)}</div>
        <div class="stages">${STAGES.map(([k, label]) => st[k]
          ? `<div class="stage yes"><span class="lbl">${label}</span>${esc(fmtDate(st[k].date))}${st[k].html}${st[k].note ? `<span class="m-sub">${esc(st[k].note)}</span>` : ''}</div>`
          : `<div class="stage no"><span class="lbl">${label}</span>no consta</div>`).join('')}</div>
        <div class="extra"><b>Evaluación independiente:</b> ${evalTxt}${aaRel}</div>
        <div class="extra"><b>Qué aporta frente a la versión anterior:</b> ${delta ? esc(delta) : '<span class="nd">sin datos</span>'}</div>
      </div>
    </article>`
  };
}

function eventCard(e) {
  const m = D.byId.get(e.model);
  return {
    date: e.date, weights: m?.weights?.v ?? null,
    html: `<article class="rel evt">
      <div class="rel-date">${esc(fmtDate(e.date))}</div>
      <div><span class="tag k-${esc(e.kind || e.type)}">${esc(EVT[e.kind || e.type] || e.kind || e.type)}</span>
        <div class="extra">${esc(e.what || e.title || '')}</div>
        ${provLine(e.src || { name: 'Fuente', url: e.url, date: e.date })}</div>
    </article>`
  };
}

function render() {
  const curated = D.catalog.curatedEvents || [];
  const cutoff = state.days ? new Date(Date.now() - state.days * 86400e3).toISOString().slice(0, 10) : '';
  let cards = D.catalog.models.map(m => cardFor(m, curated));
  cards = cards.concat((D.evLog.events || []).filter(e => e.kind === 'precio' || e.kind === 'retirada').map(eventCard));
  cards = cards.concat(curated.filter(e => !e.model || !D.byId.has(e.model)).map(e => eventCard({ ...e, kind: e.type, what: e.title, src: { name: e.source || 'Fuente', url: e.url, date: e.date } })));
  cards = cards.filter(c => c.date && c.date >= cutoff && (state.w === 'all' || c.weights === state.w))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!cards.length) { $('#ln-list').innerHTML = '<div class="empty">Ningún acontecimiento en este periodo.</div>'; return; }
  let html = '', month = '';
  for (const c of cards) {
    const mo = new Date(c.date + 'T00:00:00Z').toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (mo !== month) { html += `<div class="month">${esc(mo)}</div>`; month = mo; }
    html += c.html;
  }
  html += `<p class="note">«API pública» es la fecha de alta en OpenRouter, que puede ser posterior a la API del laboratorio. «Pesos descargables» es la fecha de creación del repositorio en Hugging Face. Anuncios y accesos restringidos sólo constan cuando se han registrado a mano con enlace a la fuente primaria.</p>`;
  $('#ln-list').innerHTML = html;
}

export function renderLanzamientos(d) {
  D = d;
  $('#ln-weights').addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    state.w = b.dataset.w; $$('#ln-weights [data-w]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render();
  });
  $('#ln-range').addEventListener('click', e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    state.days = Number(b.dataset.d); $$('#ln-range [data-d]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render();
  });
  render();
}
