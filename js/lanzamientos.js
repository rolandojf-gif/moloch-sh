/* Vista «Lanzamientos»: por modelo, qué etapas constan (anuncio, acceso restringido, API pública, pesos) y con qué fuente. */
import { t, tn, tr, L } from './i18n.js';
import { esc, src, weightsTag, provLine, fmtDate, dateFmt, num, ii, eci, aaConfig, nd, quote } from './fmt.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { w: 'all', days: 90 };
let D;

const stages = () => [
  ['anuncio', t('Anuncio')],
  ['preview', t('Acceso restringido')],
  ['producto', t('Solo en productos del laboratorio')],
  ['sinapi', t('Puntuado por AA, sin API pública')],
  ['api', t('API pública')],
  ['pesos', t('Pesos descargables')]
];
const evt = k => ({ pesos: t('Pesos abiertos'), evaluacion: t('Primera evaluación'), anuncio: t('Anuncio'), preview: t('Acceso restringido'), producto: t('Solo en productos del laboratorio'), api: t('API pública') }[k] || k);

/* Etapas de un modelo. Las curadas (anuncio, preview, producto) exigen URL de la fuente primaria; sin anuncio curado se usa la
   fecha de publicación de la base de modelos de Epoch. API y pesos salen del recolector. */
function stagesOf(m, curated) {
  const st = {};
  for (const e of curated.filter(e => e.model === m.id)) {
    if (!st[e.type] || e.date < st[e.type].date) st[e.type] = { date: e.date, html: src({ src: 'curated', url: e.url, asOf: e.date, got: e.consulta, noteTr: true, note: [tr(e.fuente), e.verificacion === 'buscador' ? t('fecha comprobada con buscador') : null].filter(Boolean).join(' · ') }), note: e.nota ? tr(e.nota) : null, delta: e.delta };
  }
  if (!st.anuncio && m.epochPub?.v) st.anuncio = { date: m.epochPub.v, html: src(m.epochPub), note: t('publicación según Epoch AI') };
  // Puntuado por AA antes de tener API pública: desde que el observatorio lo detectó así (aaOnly o, ya en OpenRouter, preApi).
  if (m.aaOnly) st.sinapi = { date: m.aaOnly.since, html: src(m.aaOnly), note: t('detectado por el observatorio; aún no está en OpenRouter') };
  else if (m.preApi?.since) st.sinapi = { date: m.preApi.since, html: '', note: t('detectado por el observatorio, hasta su alta en OpenRouter') };
  if (m.orCreated.v) st.api = st.api || { date: m.orCreated.v, html: src(m.orCreated), note: t('alta en OpenRouter') };
  if (m.weights.v === 'abiertos' && m.hfCreated?.v) st.pesos = st.pesos || { date: m.hfCreated.v, html: src(m.hfCreated), note: t('repositorio creado · {licencia}', { licencia: m.license.v ? tr(m.license.v) : t('licencia sin datos') }) };
  return st;
}

function cardFor(m, curated) {
  const st = stagesOf(m, curated);
  const STAGES = stages();
  const missing = STAGES.filter(([k]) => !st[k] && k !== 'sinapi').map(([, label]) => label.toLowerCase());
  const dates = Object.values(st).map(s => s.date).filter(Boolean).sort();
  const latest = dates[dates.length - 1];
  const withDelta = Object.values(st).find(s => s.delta);
  const evals = [];
  if (ii(m) !== null) evals.push(t('índice {num}{src} en Artificial Analysis{cfg}', { num: num(ii(m)), src: src(m.aa.intelligence), cfg: aaConfig(m) ? ` (${quote(esc(aaConfig(m)))})` : '' }));
  if (eci(m) !== null) evals.push(t('ECI {num}{src} en Epoch AI', { num: num(eci(m)), src: src(m.epoch.eci) }));
  const evalTxt = evals.length ? t('sí: {p1}', { p1: evals.join(' · ') }) : t('no consta todavía en Artificial Analysis ni en Epoch AI');
  const relSrc = m.aa?.release?.v ? ['AA', m.aa.release] : m.epoch?.release?.v ? ['Epoch', m.epoch.release] : null;
  const aaRel = relSrc ? ` ${t('· fecha del modelo según {p1}: {fmtDate}{src}', { p1: relSrc[0], fmtDate: esc(fmtDate(relSrc[1].v)), src: src(relSrc[1]) })}` : '';
  const identity = m.identity === 'confirmada' ? '' : ` <span class="tag">${t('Identidad sin confirmar')}</span>`;
  return {
    date: latest, weights: m.weights.v,
    html: `<article class="rel">
      <div class="rel-date">${esc(fmtDate(latest))}</div>
      <div>
        <h3><a class="m-open" href="#modelos/${esc(m.id)}" title="${t('Abrir su ficha en Modelos')}">${esc(m.name)}</a> ${weightsTag(m)}${identity}</h3>
        <div class="m-lab">${esc(m.lab.name)}</div>
        <div class="stages">${STAGES.filter(([k]) => st[k]).sort((a, b) => st[a[0]].date.localeCompare(st[b[0]].date)).map(([k, label]) =>
          `<div class="stage yes"><span class="lbl">${label}</span>${esc(fmtDate(st[k].date))}${st[k].html}${st[k].note ? `<span class="m-sub">${esc(st[k].note)}</span>` : ''}</div>`).join('')}</div>
        ${missing.length ? `<div class="stages-no">${t('No constan: {p1}.', { p1: esc(missing.join(', ')) })}</div>` : ''}
        <div class="extra"><b>${t('Evaluación independiente:')}</b> ${evalTxt}${aaRel}</div>
        <div class="extra"><b>${t('Qué aporta frente a la versión anterior:')}</b> ${withDelta ? `${esc(tr(withDelta.delta))}${/según/i.test(withDelta.delta) ? '' : ` ${t('(según el laboratorio)')}`}${withDelta.html}` : nd()}</div>
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
      <div><span class="tag k-${esc(e.kind || e.type)}">${esc(evt(e.kind || e.type))}</span>
        <div class="extra">${esc(tr(e.what || e.title || ''))}</div>
        ${provLine(e.src || { name: t('Fuente'), url: e.url, date: e.date })}</div>
    </article>`
  };
}

function render() {
  const curated = D.catalog.curatedEvents || [];
  const cutoff = state.days ? new Date(Date.now() - state.days * 86400e3).toISOString().slice(0, 10) : '';
  // Sólo lanzamientos: los cambios de precio están en «Hoy» y las retiradas van aparte, al final.
  let cards = D.catalog.models.map(m => cardFor(m, curated));
  cards = cards.concat(curated.filter(e => !e.model || !D.byId.has(e.model)).map(e => eventCard({ ...e, kind: e.type, what: e.title, src: { name: e.source || t('Fuente'), url: e.url, date: e.date } })));
  cards = cards.filter(c => c.date && c.date >= cutoff && (state.w === 'all' || c.weights === state.w))
    .sort((a, b) => b.date.localeCompare(a.date));
  const gone = (D.evLog.events || []).filter(e => e.kind === 'retirada' && e.date >= cutoff);
  if (!cards.length && !gone.length) { $('#ln-list').innerHTML = `<div class="empty">${t('Ningún lanzamiento en este periodo.')}</div>`; return; }
  let html = '', month = '';
  for (const c of cards) {
    const mo = dateFmt({ month: 'long', year: 'numeric' }).format(new Date(c.date + 'T00:00:00Z'));
    if (mo !== month) { html += `<div class="month">${esc(mo)}</div>`; month = mo; }
    html += c.html;
  }
  if (gone.length) html += `<h2 class="sec">${t('Retirados de OpenRouter en el periodo')}</h2><ul class="changes">${gone.map(e => `<li><span>${esc(fmtDate(e.date))}</span><span>${esc(L(e, 'what'))}</span>${provLine(e.src)}</li>`).join('')}</ul>`;
  html += `<p class="note">${t('«API pública» es la fecha de alta en OpenRouter, que puede ser posterior a la API del laboratorio. «Puntuado por AA, sin API pública» es el día en que el observatorio vio por primera vez su puntuación en Artificial Analysis sin que estuviera en OpenRouter. «Pesos descargables» es la fecha de creación del repositorio en Hugging Face. «Acceso restringido» es una fase en la que sólo podían usarlo organizaciones o personas seleccionadas; «Solo en productos del laboratorio», una fase en la que se podía usar en sus aplicaciones o suscripciones pero no por API. Anuncios y estas dos fases constan cuando se han registrado a mano con enlace a la fuente primaria (blog, documentación o repositorio del laboratorio); si no hay anuncio registrado, se toma la fecha de publicación de la base de modelos de Epoch AI. Las etapas sin dato se agrupan en «No constan».')}</p>`;
  $('#ln-list').innerHTML = html;
}

/* Los escuchadores se enlazan una vez; render() se repite al cambiar de idioma con el mismo estado (apertura y periodo). */
let bound = false;
export function renderLanzamientos(d) {
  D = d;
  if (!bound) { bound = true; init(); }
  render();
}
function init() {
  $('#ln-weights').addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    state.w = b.dataset.w; $$('#ln-weights [data-w]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render();
  });
  $('#ln-range').addEventListener('click', e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    state.days = Number(b.dataset.d); $$('#ln-range [data-d]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render();
  });
}
