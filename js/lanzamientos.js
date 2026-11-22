/* Hitos fechados de disponibilidad, con el historial y la evidencia de cada modelo. */
import { t, tn, tr, L } from './i18n.js';
import { esc, fact, src, weightsTag, provLine, fmtDate, dateFmt, num, usd, blended, ii, eci, aaConfig, aaIndexName, priceBasis } from './fmt.js';
import { logo } from './logos.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { kind: 'all', weights: 'all', days: 30 };
const opened = new Set();
const DAY_MS = 86400e3;
const asDate = d => new Date(`${d}T00:00:00Z`);
const day = d => d.toISOString().slice(0, 10);
const shift = (d, n) => day(new Date(asDate(d).getTime() + n * DAY_MS));
const weekOf = d => shift(d, -((asDate(d).getUTCDay() + 6) % 7));
const byDate = (a, b) => b.date.localeCompare(a.date);
const time = (d, short = false) => `<time datetime="${esc(d)}">${short ? dateFmt({ day: 'numeric', month: 'short' }).format(asDate(d)) : fmtDate(d)}</time>`;

const TYPES = {
  anuncio: { group: 'news', label: () => t('Anuncio') },
  publicacion: { group: 'news', label: () => t('Publicación según Epoch AI') },
  preview: { group: 'other', label: () => t('Acceso restringido') },
  producto: { group: 'other', label: () => t('Solo en productos del laboratorio') },
  sinapi: { group: 'other', label: () => t('Puntuado por AA fuera de OpenRouter') },
  openrouter: { group: 'api', label: () => t('Alta en OpenRouter'), action: () => t('Usar en OpenRouter') },
  api: { group: 'api', label: () => t('API del laboratorio'), action: () => t('Ver API del laboratorio') },
  pesos: { group: 'weights', label: () => t('Pesos descargables'), action: () => t('Descargar pesos') }
};

function curatedStage(e) {
  return { date: e.date, type: e.type, source: { name: e.fuente || 'Fuente', url: e.url, asOf: e.date, got: e.consulta },
    note: e.nota, delta: e.delta, search: e.verificacion === 'buscador' };
}

function stagesOf(m, curated) {
  const stages = new Map();
  for (const e of curated) {
    const prior = stages.get(e.type);
    if (!prior || e.date < prior.date) stages.set(e.type, e);
  }
  const fromFact = (type, f) => {
    if (f?.v && !stages.has(type)) stages.set(type, { type, date: f.v.slice(0, 10), source: f });
  };
  if (!stages.has('anuncio')) fromFact('publicacion', m.epochPub);
  fromFact('openrouter', m.orCreated);
  if (m.weights.v === 'abiertos' && !m.weights.announced) fromFact('pesos', m.hfCreated);
  const seen = m.aaOnly || m.preApi;
  if (seen?.since) stages.set('sinapi', { type: 'sinapi', date: seen.since, source: m.aaOnly || { url: m.aa?.url, name: 'Artificial Analysis' } });
  return [...stages.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function collectMilestones(catalog, date) {
  const byModel = new Map();
  const milestones = [];
  const ids = new Set(catalog.models.map(m => m.id));
  for (const e of catalog.curatedEvents || []) {
    if (!Object.hasOwn(TYPES, e.type) || e.date > date) continue;
    if (!ids.has(e.model)) {
      const name = e.title || e.model?.split('/').pop();
      if (name) milestones.push({ ...curatedStage(e), key: `event/${e.model || name}/${e.type}/${e.date}`, name });
    } else {
      if (!byModel.has(e.model)) byModel.set(e.model, []);
      byModel.get(e.model).push(curatedStage(e));
    }
  }
  for (const model of catalog.models) {
    const stages = stagesOf(model, byModel.get(model.id) || []).filter(s => s.date <= date);
    for (const s of stages) {
      // La fecha de Epoch sigue en la ficha si coincide con un hito de acceso documentado.
      if (s.type === 'publicacion' && stages.some(other => other.date === s.date && TYPES[other.type].action)) continue;
      milestones.push({ ...s, key: `${model.id}/${s.type}`, model, stages, name: model.name });
    }
  }
  return milestones.sort(byDate);
}

function stageLink(s, context = '') {
  const action = TYPES[s.type].action;
  return action && s.source.url
    ? `<a href="${esc(s.source.url)}" target="_blank" rel="noopener"><span>${action()} <span class="ln-external" aria-hidden="true"></span></span>${context}</a>`
    : '';
}

function renderFeature(milestones, date) {
  const block = $('#ln-feature');
  const recent = milestones.filter(s => s.date >= shift(date, -29) && s.model?.identity === 'confirmada' && TYPES[s.type].action && s.source.url && !s.source.stale);
  const featured = recent.find(s => s.type === 'pesos' && s.date >= shift(date, -6)) || recent[0];
  block.hidden = !featured;
  if (!featured) { block.replaceChildren(); return; }
  const { model, stages, type } = featured;
  const access = stages.filter(s => TYPES[s.type].action && s.source.url && !s.source.stale);
  const copy = type === 'pesos'
    ? access.some(s => TYPES[s.type].group === 'api')
      ? t('Puedes probarlo por API o ejecutarlo en tu propia infraestructura.')
      : t('Ya puedes descargar los pesos y ejecutar el modelo en tu propia infraestructura, según su licencia.')
    : type === 'api' ? t('El laboratorio documenta el acceso por su propia API.')
      : t('Ya puedes usar el modelo por API a través de OpenRouter.');
  block.innerHTML = `<div class="ln-feature ln-feature-${TYPES[type].group}">
    <div class="ln-intro">
      <span class="ln-eyebrow">${t('Disponibilidad destacada')}</span>
      <div class="ln-feature-model">${logo(model, true)}<div><span class="ln-lab">${esc(model.lab.name)}</span>
        <h2 id="ln-feature-title">${esc(model.name)}</h2></div></div>
      <p>${copy}</p>
      <a class="ln-model-link" href="#modelos/${esc(model.id)}">${t('Ver ficha del modelo')} →</a>
    </div>
    <ul class="ln-access">${access.map(s => {
      const source = s.source.name ? tr(s.source.name) : s.type === 'pesos' ? 'Hugging Face' : 'OpenRouter';
      return `<li>${stageLink(s, `<span class="ln-access-source">${time(s.date)} · ${esc(source)}</span>`)}</li>`;
    }).join('')}</ul>
  </div>`;
}

function previousScoredModel(model, models) {
  const dated = m => m.orCreated?.v || m.aa?.release?.v || '';
  const effort = m => /\(([^)]*)\)\s*$/.exec(m.aa?.name || '')?.[1]?.toLowerCase();
  const date = dated(model);
  const aa = model.aa;
  if (!date || ii(model) === null || !aa.version || model.identity !== 'confirmada') return null;
  return models.filter(m => m.lab.name === model.lab.name && m.identity === 'confirmada'
    && ii(m) !== null && m.aa.version === aa.version && effort(m) === effort(model) && dated(m) && dated(m) < date)
    .sort((a, b) => dated(b).localeCompare(dated(a)) || ii(b) - ii(a))[0];
}

function scoreComparison(model, prev) {
  const delta = Math.round((ii(model) - ii(prev)) * 10) / 10;
  const diff = `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${num(Math.abs(delta))}`;
  return `<p>${t('Frente a {name}, del mismo laboratorio', { name: `<a href="#modelos/${esc(prev.id)}">${esc(prev.name)}</a>` })} ·
    <strong>${t('{diff} puntos AA', { diff })}</strong>${src(prev.aa.intelligence)}</p>`;
}

function priceText(model, prev) {
  const price = m => {
    const value = blended(m);
    const basis = priceBasis(m);
    return value === null ? null : `${usd(value)}${src(m.price.in)}${basis ? ` (${esc(basis)})` : ''}`;
  };
  const actual = price(model);
  if (actual === null) return '';
  const anterior = prev && price(prev);
  return anterior
    ? t('Precio combinado por millón de tokens (3:1): {actual} frente a {anterior}.', { actual, anterior })
    : t('Precio combinado por millón de tokens (3:1): {actual}.', { actual });
}

function assessment(model, models) {
  const scores = [];
  if (ii(model) !== null) scores.push(`${fact(model.aa.intelligence, num)} · ${aaIndexName(model.aa.version)}${aaConfig(model) ? ` (${esc(aaConfig(model))})` : ''}`);
  if (eci(model) !== null) scores.push(t('ECI {num}{src} en Epoch AI', { num: num(eci(model)), src: src(model.epoch.eci) }));
  const prev = previousScoredModel(model, models);
  const price = priceText(model, prev);
  const release = model.aa?.release?.v ? model.aa.release : model.epoch?.release;
  return `<div class="ln-assessment">
    <h4>${t('Evaluación independiente')}</h4>
    ${scores.length ? scores.map(score => `<p>${score}</p>`).join('') : `<p>${t('Sin evaluación registrada en Artificial Analysis ni en Epoch AI.')}</p>`}
    ${release?.v ? `<p class="note">${t('Fecha del modelo según {fuente}: {fecha}', {
      fuente: release.src === 'aa' ? 'Artificial Analysis' : 'Epoch AI', fecha: fact(release, fmtDate)
    })}</p>` : ''}
    ${prev ? scoreComparison(model, prev) : ''}
    ${price ? `<p>${price}</p>` : ''}
  </div>`;
}

function stageDetails(s) {
  return `<li>
    <div class="ln-stage-line">${time(s.date)} <strong>${TYPES[s.type].label()}</strong> ${stageLink(s)}</div>
    ${provLine(s.source)}${s.source.stale ? src(s.source) : ''}
    ${s.search ? `<p class="note">${t('fecha comprobada con buscador')}</p>` : ''}
    ${s.note ? `<p>${esc(tr(s.note))}</p>` : ''}
  </li>`;
}

function releaseRow(s, assessments) {
  const { model, stages, type } = s;
  const notes = (stages || [s]).filter(x => x.delta);
  const kind = TYPES[type];
  const weights = stages?.find(x => x.type === 'pesos');
  const licence = weights ? `<p>${t('Licencia de los pesos: {licencia}', { licencia: fact(model.license, v => esc(tr(v))) })}</p>` : '';
  return `<details class="ln-row" data-milestone="${esc(s.key)}" data-group="${kind.group}"${opened.has(s.key) ? ' open' : ''}>
    <summary>
      <span class="ln-date">${time(s.date, true)}</span>
      <span class="ln-model">${logo(model)}<span><strong>${esc(s.name)}</strong>${model ? `<small>${esc(model.lab.name)}</small>` : ''}</span></span>
      <span class="ln-stage">${kind.label()}</span>
      <span class="ln-toggle" aria-hidden="true"></span>
    </summary>
    <div class="ln-detail">
      <div class="ln-evidence">
        <h4>${model ? t('Historial de disponibilidad') : t('Detalle del hito')}</h4>
        <ul class="ln-stages">${(stages || [s]).map(stageDetails).join('')}</ul>
        ${licence}
        ${model?.weights.announced && !weights ? `<p>${t('Pesos anunciados, pendientes de descarga.')}${src(model.weights)}</p>` : ''}
        ${model ? `<div class="ln-model-meta">${weightsTag(model)}${model.identity !== 'confirmada' ? `<span class="tag">${t('Identidad sin confirmar')}</span>` : ''}</div>` : ''}
      </div>
      <div class="ln-reading">
        ${model ? assessments.get(model.id) : ''}
        ${notes.map(n => `<div><h4>${t('Según el laboratorio')}</h4><p>${esc(tr(n.delta))}</p>${provLine(n.source)}</div>`).join('')}
        ${model ? `<a class="ln-model-link" href="#modelos/${esc(model.id)}">${t('Ver ficha del modelo')} →</a>` : ''}
      </div>
    </div>
  </details>`;
}

let D, snapshot, milestones;
function renderTimeline() {
  for (const row of $$('#ln-list .ln-row')) {
    if (row.open) opened.add(row.dataset.milestone);
    else opened.delete(row.dataset.milestone);
  }
  const cutoff = state.days ? shift(snapshot, 1 - state.days) : '';
  const period = milestones.filter(s => s.date >= cutoff && (state.weights === 'all' || s.model?.weights.v === state.weights));
  const counts = { all: period.length, api: 0, weights: 0, news: 0, other: 0 };
  for (const s of period) counts[TYPES[s.type].group]++;
  $$('#ln-kinds [data-kind]').forEach(b => {
    const selected = b.dataset.kind === state.kind, count = counts[b.dataset.kind];
    b.querySelector('.ln-count').textContent = num(count, 0);
    b.setAttribute('aria-pressed', String(selected));
  });
  const rows = period.filter(s => state.kind === 'all' || TYPES[s.type].group === state.kind);
  const count = tn(rows.length, ['{n} hito', '{n} hitos'], { n: num(rows.length, 0) });
  $('#ln-status').textContent = t('{count} · Datos hasta el {fecha}', { count, fecha: fmtDate(snapshot) });
  const groups = new Map(), assessments = new Map();
  for (const s of rows) {
    const week = weekOf(s.date);
    if (!groups.has(week)) groups.set(week, []);
    groups.get(week).push(s);
    if (s.model && !assessments.has(s.model.id)) assessments.set(s.model.id, assessment(s.model, D.catalog.models));
  }
  $('#ln-list').innerHTML = groups.size ? [...groups].map(([week, items]) => `<section class="ln-week">
    <h3>${t('Semana del {fecha}', { fecha: time(week) })}</h3>
    <div class="ln-week-rows">${items.map(s => releaseRow(s, assessments)).join('')}</div>
  </section>`).join('') : `<div class="empty">${t('Ningún hito con estos filtros.')}</div>`;

  const gone = (D.evLog.events || []).filter(e => e.kind === 'retirada' && e.date >= cutoff && e.date <= snapshot).sort(byDate);
  const retired = $('#ln-retired');
  const wasOpen = retired.querySelector('details')?.open;
  retired.hidden = !gone.length;
  retired.innerHTML = gone.length ? `<details class="more"${wasOpen ? ' open' : ''}>
    <summary>${t('Retirados de OpenRouter en el periodo')} · ${num(gone.length, 0)}</summary>
    <ul class="changes">${gone.map(e => `<li>${time(e.date)}<span>${esc(L(e, 'what'))}</span>${provLine(e.src)}</li>`).join('')}</ul></details>` : '';
}

export function renderLanzamientos(d) {
  const first = !D;
  if (D !== d) {
    D = d;
    snapshot = d.catalog.generated.slice(0, 10);
    milestones = collectMilestones(d.catalog, snapshot);
  }
  if (first) init();
  renderFeature(milestones, snapshot);
  renderTimeline();
}

function init() {
  $('#ln-weights').addEventListener('change', e => { state.weights = e.target.value; renderTimeline(); });
  $('#ln-range').addEventListener('click', e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    state.days = Number(b.dataset.d);
    $$('#ln-range [data-d]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderTimeline();
  });
  $('#ln-kinds').addEventListener('click', e => {
    const b = e.target.closest('[data-kind]'); if (!b) return;
    state.kind = b.dataset.kind;
    renderTimeline();
  });
}
