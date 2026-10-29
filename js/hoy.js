/* Vista «Hoy»: el parte del día, lo detectado en la semana, cuatro indicadores y capacidad frente a precio. */
import { t, tn, tr, L } from './i18n.js';
import { esc, fact, src, usd, num, fmtDate, rssUrl, weightsWord, blended, ii, capFact, eci, aaConfig, aaConfigShort, aaIndexName, priceBasis, nd, AA_LINK, quote, sinApiTag } from './fmt.js';
import { logo } from './logos.js';
import { scatter, daily, tip } from './charts.js';

const $ = s => document.querySelector(s);
const kind = k => ({ nuevo: t('Nuevo modelo'), pesos: t('Pesos abiertos'), precio: t('Precio del laboratorio'), evaluacion: t('Evaluación independiente'), retirada: t('Retirada'),
  lider: t('Cambio de líder'), version: t('Versión del índice AA'), indicador: t('La carrera'), valoracion: t('Seguimiento de AI 2027'), uso: t('Uso en OpenRouter') }[k] || k);
const modelLink = (d, id, name) => d.byId.has(id) ? `<a class="m-open" href="#modelos/${esc(id)}" title="${t('Abrir su ficha en Modelos')}">${esc(name)}</a>` : esc(name);
const GAPS = [5, 10, 15];
const blendSnap = s => (s && s.in !== null && s.out !== null && s.in !== undefined && s.out !== undefined) ? (3 * s.in + s.out) / 4 : null;

function scored(models) {
  return models.filter(m => ii(m) !== null && m.identity === 'confirmada');
}
function leader(models, w) {
  return scored(models).filter(m => m.weights.v === w).sort((a, b) => ii(b) - ii(a))[0] || null;
}
/* Si el líder abierto sólo tiene pesos anunciados, el mejor que ya se puede descargar; si no, null. */
function downloadable(models, lo) {
  return lo?.weights.announced ? scored(models).filter(m => m.weights.v === 'abiertos' && !m.weights.announced).sort((a, b) => ii(b) - ii(a))[0] || null : null;
}

/* Titular, consecuencia y motivo vienen ya redactados por el recolector (scripts/parte.mjs), con plantillas y cifras de la misma recogida. */
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
/* Modelo al que apunta una ficha «#modelos/<id>», para su logo; si ya no está en el catálogo, sólo su autor. */
const fichaModel = (d, href) => {
  const id = /^#modelos\/(.+)$/.exec(href || '')?.[1];
  return id ? d.byId.get(id) || { id, name: id.split('/').pop(), lab: { id: id.split('/')[0], name: '' } } : null;
};
const toFicha = (href, text) => href ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text);
const srcLink = s => s?.url ? `<a href="${esc(s.url)}"${/^#/.test(s.url) ? '' : ' target="_blank" rel="noopener"'}>${esc(s.name ? tr(s.name) : t('fuente'))}</a>` : esc(s?.name ? tr(s.name) : t('sin fuente'));
/* Pie de cada cambio: fuente, fecha de publicación si la fuente la da y fecha en que lo detectó el observatorio.
   Si el texto mostrado cita el índice de AA y la fuente es otra, se añade el crédito a AA. */
const foot = (it, shown) => `<div class="prov">${t('Fuente: {src}', { src: srcLink(it.src) })}${it.published ? ` · ${t('publicado: {fecha}', { fecha: esc(fmtDate(it.published)) })}` : ''} · ${t('detectado: {fecha}', { fecha: esc(fmtDate(it.detected || it.date)) })}${/\bAA\b|Artificial Analysis/.test(shown.join(' ')) && !/artificialanalysis\.ai/.test(it.src?.url || '') ? ` ${t('· índice de {AA_LINK}, publicado con su permiso', { AA_LINK })}` : ''}</div>`;

/* Fecha del último parte visto en este navegador. La de la visita anterior se guarda en la sesión, para que recargar no la pierda. */
function lastVisit(fecha) {
  try {
    let ref = sessionStorage.getItem('moloch.ref');
    if (ref === null) { ref = localStorage.getItem('moloch.visto') || ''; sessionStorage.setItem('moloch.ref', ref); }
    localStorage.setItem('moloch.visto', fecha);
    return ref || null;
  } catch { return null; }
}

function renderVisit(d, items, p) {
  const el = $('#hoy-visit');
  const ref = p ? lastVisit(p.fecha) : null;
  el.hidden = !ref;
  if (!ref) return;
  const nuevos = items.filter(it => (it.detected || it.date) > ref);
  const sig = nuevos.filter(it => it.importancia && !p.noticias.includes(it.key));
  const since = d.changes.since;
  if (!nuevos.length) { el.innerHTML = `<b>${t('Desde tu última visita')}</b> ${t('(parte del {fmtDate}): nada nuevo.', { fmtDate: esc(fmtDate(ref)) })}`; return; }
  const n = nuevos.filter(it => it.importancia).length;
  const head = tn(nuevos.length, ['(parte del {fecha}): {n} cambio detectado, {noticias}.', '(parte del {fecha}): {n} cambios detectados, {noticias}.'], { fecha: esc(fmtDate(ref)), noticias: n ? t('{n} de ellos noticia', { n }) : t('ninguno noticia') });
  el.innerHTML = `<b>${t('Desde tu última visita')}</b> ${head}${since && ref < since ? ` ${t('Sólo cuentan los de los últimos {p1} días, desde el {fmtDate}.', { p1: d.changes.window || 7, fmtDate: esc(fmtDate(since)) })}` : ''}${sig.length ? ` ${p.noticias.length ? t('Además de las de arriba') : t('Las noticias')}:<ul>${sig.slice(0, 5).map(it => `<li><span>${esc(fmtDate(it.detected))}</span> ${logo(fichaModel(d, it.ficha))}${toFicha(it.ficha, L(it, 'titular') || L(it, 'what'))}</li>`).join('')}</ul>${sig.length > 5 ? t('Y {p1} más en la lista de abajo.', { p1: sig.length - 5 }) : ''}` : ''}`;
}

function renderNews(d) {
  const days = d.changes.window || 7;
  const p = d.changes.parte;
  // Lista completa: por fecha de detección, la más reciente primero; dentro de cada día, las noticias delante.
  const items = (d.changes.items || []).slice().sort((a, b) => (b.detected || b.date || '').localeCompare(a.detected || a.date || '') || !!b.importancia - !!a.importancia);
  const byKey = new Map(items.map(it => [it.key, it]));
  $('#hoy-period').innerHTML = p
    ? `${t('Parte del {fmtDate}: hasta tres noticias de la última recogida, con una regla fija.', { fmtDate: esc(fmtDate(p.fecha)) })} <a href="${rssUrl()}">RSS</a>`
    : t('Últimos {days} días, desde el {fmtDate}. El parte diario empieza con la próxima recogida.', { days, fmtDate: esc(fmtDate(d.changes.since)) });
  renderVisit(d, items, p);
  const top = p ? p.noticias.map(k => byKey.get(k)).filter(Boolean) : [];
  const today = p ? items.filter(it => it.detected === p.fecha).length : 0;
  $('#hoy-news').innerHTML = top.length ? top.map(it => `
    <article class="news-card">
      <span class="tag k-${esc(it.kind)}">${esc(kind(it.kind))}</span>
      <div class="news-h">${logo(fichaModel(d, it.ficha), true)}<h3>${toFicha(it.ficha, L(it, 'titular') || L(it, 'what'))}</h3></div>
      <p><span class="lbl">${t('Qué ocurrió')}</span>${esc(L(it, 'what'))}</p>
      ${it.consecuencia ? `<p><span class="lbl">${t('Qué cambia')}</span>${esc(L(it, 'consecuencia'))}</p>` : ''}
      <p><span class="lbl">${t('Por qué es noticia')}</span>${esc(cap(L(it, 'porque', it.importancia?.porque)))}.</p>
      ${foot(it, [L(it, 'titular'), L(it, 'what'), L(it, 'consecuencia'), L(it, 'porque', it.importancia?.porque)])}
    </article>`).join('')
    : p ? `<div class="empty"><b>${t('Sin cambios significativos en la recogida del {fmtDate}.', { fmtDate: esc(fmtDate(p.fecha)) })}</b> ${today ? tn(today, ['{n} cambio menor, en la lista de abajo.', '{n} cambios menores, en la lista de abajo.']) : t('Ningún cambio detectado.')}${p.ultima ? ` ${t('La última noticia fue del {fmtDate}: {toFicha}.', { fmtDate: esc(fmtDate(p.ultima.fecha)), toFicha: toFicha(p.ultima.ficha, L(p.ultima, 'titular')) })}` : ''}</div>`
    : '';
  const rules = $('#hoy-reglas');
  rules.hidden = !p;
  if (p) $('#hoy-reglas-body').innerHTML = `<ol class="reglas">${L(p, 'reglas').map(r => `<li>${esc(r)}</li>`).join('')}</ol>
    <p class="note">${t('Entran hasta tres cambios de la última recogida, uno por modelo o hito, en el orden de la lista; dentro de una misma regla, primero el de mayor magnitud. Nunca se rellena: si ninguno cumple la regla, el parte lo dice. Debajo, en «Ver todo lo detectado», están todos los cambios de los últimos {days} días, también los que no son noticia. El parte se publica además como', { days })} <a href="${rssUrl()}">${t('fuente RSS')}</a>${t('. Los titulares salen de plantillas con las cifras («duplica» sólo si el precio es exactamente el doble) y la consecuencia, de los datos de la misma recogida, sin modelo de lenguaje ni opinión.')}</p>`;
  const more = $('#hoy-all');
  more.hidden = !items.length;
  if (!items.length) return;
  const sig = items.filter(it => it.importancia).length;
  more.querySelector('summary').textContent = t('Ver todo lo detectado en {days} días ({n}{noticias})', { days, n: items.length, noticias: sig ? ', ' + tn(sig, ['{n} noticia', '{n} noticias']) : '' });
  const link = it => it.ficha ? ` <a href="${esc(it.ficha)}">${/^#modelos/.test(it.ficha) ? t('Abrir el modelo') : t('Ver la ficha')}</a>` : '';
  $('#hoy-all-list').innerHTML = items.map(it => `<li><span>${esc(fmtDate(it.detected || it.date))}</span><span>${logo(fichaModel(d, it.ficha))}${it.importancia ? `<span class="tag k-noticia">${t('Noticia')}</span> ` : ''}<b>${esc(kind(it.kind))}.</b> ${esc(L(it, 'what'))}${link(it)}</span>${foot(it, [L(it, 'what')])}</li>`).join('');
}

const priceBy = m => priceBasis(m) ? `, ${esc(priceBasis(m))}` : '';

function cheapestAbove(rows, T, getII, getPrice) {
  return rows.filter(r => getII(r) !== null && getII(r) >= T && getPrice(r) !== null && getPrice(r) > 0)
    .sort((a, b) => getPrice(a) - getPrice(b))[0] || null;
}

function renderKPIs(d, gapPts) {
  const models = d.catalog.models;
  const lo = leader(models, 'abiertos'), lc = leader(models, 'cerrados'), dl = downloadable(models, lo);
  const aaSt = d.catalog.status?.aa;
  const reason = aaSt && !aaSt.ok && !scored(models).length ? t('Artificial Analysis no disponible: {p1}.', { p1: esc(aaSt.reason ? tr(aaSt.reason) : t('sin datos')) }) : '';
  const ver = d.catalog.aaIndexVersion;
  // Las comparaciones con la recogida anterior sólo valen con la misma versión del índice de AA.
  const prev = d.prevSnap && d.prevSnap.leaders?.aa && (d.prevSnap.leaders.aa.v ?? null) === (ver ?? null) ? d.prevSnap : null;
  const prevAA = prev?.leaders?.aa;

  const leadCard = (m, cls, label, prevLead) => {
    if (!m) return `<div class="kpi ${cls}"><span class="k">${label}</span><span class="v">${nd()}</span><span class="s">${reason || t('Ningún modelo de este bloque tiene índice.')}</span></div>`;
    let delta = '';
    if (prevLead && prevLead.id !== m.id && prevLead.ii !== undefined) delta = ` ${t('Antes: {name} ({num}).', { name: esc(prev.models[prevLead.id]?.n || prevLead.id), num: num(prevLead.ii) })}`;
    const ep = eci(m) !== null ? ` ${t('ECI en Epoch AI: {fact}.', { fact: fact(m.epoch.eci, v => num(v)) })}` : '';
    return `<div class="kpi ${cls}"><span class="k">${label}</span><span class="v small lead">${logo(m, true)}<span>${modelLink(d, m.id, m.name)}${sinApiTag(m)}</span></span>
      <span class="s">${t('{lab} · índice AA {fact}{cfg}.', { lab: esc(m.lab.name), fact: fact(capFact(m), v => num(v)), cfg: aaConfig(m) ? ` (${quote(esc(aaConfig(m)))})` : '' })}${m.weights.announced ? ` ${t('Pesos anunciados en su descripción de OpenRouter{since}; aún no se pueden descargar.', { since: m.weights.since ? ` ${t('desde el {fmtDate}', { fmtDate: esc(fmtDate(m.weights.since)) })}` : '' })}` : ''}${ep}${delta}${dl && m === lo ? ` ${t('Con pesos ya descargables, el mejor es {modelLink} ({name}), índice AA {fact}.', { modelLink: modelLink(d, dl.id, dl.name), name: esc(dl.lab.name), fact: fact(capFact(dl), v => num(v)) })}` : ''}</span></div>`;
  };

  let gapCard;
  if (lo && lc) {
    const gap = Math.round((ii(lc) - ii(lo)) * 10) / 10;
    let delta = '';
    if (prevAA?.open?.ii !== undefined && prevAA?.closed?.ii !== undefined) {
      const pg = Math.round((prevAA.closed.ii - prevAA.open.ii) * 10) / 10;
      if (pg !== gap) delta = ` ${t('{p1} desde {num} el {fmtDate}.', { p1: gap < pg ? t('Se reduce') : t('Se amplía'), num: num(pg), fmtDate: fmtDate(prev.date) })}`;
      else delta = ` ${t('Igual que el {fmtDate}.', { fmtDate: fmtDate(prev.date) })}`;
    }
    gapCard = `<div class="kpi"><span class="k">${t('Diferencia cerrado − abierto')}</span><span class="v">${gap > 0 ? '' : gap < 0 ? '−' : ''}${num(Math.abs(gap))} pts${src(capFact(lc))}</span>
      <span class="s">${t('Puntos del {idx} entre {a} y {b}.', { idx: esc(aaIndexName(ver)), a: esc(lc.name), b: esc(lo.name) })}${dl ? ` ${t('Con el mejor de pesos ya descargables, {name}, {num} pts.', { name: esc(dl.name), num: num(Math.round((ii(lc) - ii(dl)) * 10) / 10) })}` : ''} ${t('No equivalen a meses de retraso. AA no publica intervalo de confianza para este índice.')}${delta}</span></div>`;
  } else {
    gapCard = `<div class="kpi"><span class="k">${t('Diferencia cerrado − abierto')}</span><span class="v">${nd()}</span><span class="s">${reason || t('Falta un líder con índice en algún bloque.')}</span></div>`;
  }

  let costCard;
  const top = lc ? ii(lc) : (lo ? ii(lo) : null);
  if (top !== null) {
    const T = Math.round((top - gapPts) * 10) / 10;
    const best = cheapestAbove(scored(models), T, ii, blended);
    const bestOpen = cheapestAbove(scored(models).filter(m => m.weights.v === 'abiertos'), T, ii, blended);
    let delta = '';
    // Sólo se compara con recogidas que ya usaban el mismo criterio de precio (propio laboratorio o proveedor más barato).
    const prevRows = prev ? Object.entries(prev.models).map(([id, s]) => ({ id, ...s })) : [];
    if (prevRows.some(r => r.pb)) {
      const rows = prevRows.filter(r => r.pb);
      const pb = cheapestAbove(rows, T, r => r.ii ?? null, blendSnap);
      if (pb && best) {
        const ch = (blended(best) - blendSnap(pb)) / blendSnap(pb) * 100;
        delta = Math.abs(ch) < 0.5 ? ` ${t('Sin cambio desde el {fmtDate}.', { fmtDate: fmtDate(prev.date) })}` : ` ${t('{p1} un {num} % desde el {fmtDate} ({usd}).', { p1: ch < 0 ? t('Baja') : t('Sube'), num: num(Math.abs(ch)), fmtDate: fmtDate(prev.date), usd: usd(blendSnap(pb)) })}`;
      }
    }
    const sel = `<label>${t('umbral')} <select id="kpi-pct">${GAPS.map(g => `<option value="${g}"${g === gapPts ? ' selected' : ''}>${t('líder − {g} pts', { g })}</option>`).join('')}</select></label>`;
    costCard = `<div class="kpi"><span class="k">${t('Coste con capacidad comparable')}</span>
      <span class="v">${best ? usd(blended(best)) + src(best.price.in) : nd()}</span>
      <span class="s">${best ? t('{name}: el más barato con índice AA ≥ {num}, precio combinado por millón{priceBy}.', { name: esc(best.name), num: num(T), priceBy: priceBy(best) }) : t('Ningún modelo con índice AA ≥ {num} tiene precio.', { num: num(T) })}${bestOpen && bestOpen !== best ? ` ${t('Abierto más barato: {name}, {usd}.', { name: esc(bestOpen.name), usd: usd(blended(bestOpen)) })}` : ''}${delta}</span>${sel}</div>`;
  } else {
    costCard = `<div class="kpi"><span class="k">${t('Coste con capacidad comparable')}</span><span class="v">${nd()}</span><span class="s">${reason || t('Sin modelos con índice.')}</span></div>`;
  }

  $('#hoy-kpis').innerHTML = leadCard(lc, 'closed', t('Líder cerrado'), prevAA?.closed) + leadCard(lo, 'open', t('Líder abierto'), prevAA?.open) + gapCard + costCard;
  $('#hoy-kpi-note').innerHTML = t('Líderes calculados entre los modelos del catálogo con puntuación en el {aaIndexName}: los que se pueden usar por API en OpenRouter y los que AA ya puntúa aunque aún no tengan API pública, marcados «sin API pública». Datos de {AA_LINK}, publicados con su permiso. De cada modelo se toma la configuración de razonamiento de mayor índice. Umbral de capacidad comparable: índice del mejor modelo menos los puntos elegidos. Precio combinado: (3 × entrada + salida) / 4, con el precio que cobra el propio laboratorio en OpenRouter o, si no lo sirve él, el del proveedor más barato, que se indica.', { aaIndexName: esc(aaIndexName(ver)), AA_LINK });
  $('#kpi-pct')?.addEventListener('change', e => { GAP_PTS = Number(e.target.value); renderKPIs(d, GAP_PTS); renderScatter(d, GAP_PTS); });
}

function renderScatter(d, gapPts) {
  const models = scored(d.catalog.models);
  const el = $('#hoy-scatter');
  if (!models.length) {
    el.innerHTML = `<div class="chart-empty">${t('Sin datos de capacidad: ningún modelo del catálogo tiene puntuación de Artificial Analysis.')}</div>`;
    $('#hoy-reading').innerHTML = '';
    return;
  }
  const pts = models.filter(m => blended(m) > 0).map(m => ({
    id: m.id, x: blended(m), y: ii(m), cls: m.weights.v === 'abiertos' ? 'open' : m.weights.v === 'cerrados' ? 'closed' : 'unknown',
    label: m.name,
    tip: tip(m.name, [
      [t('Laboratorio'), m.lab.name],
      [t('Índice AA'), `${num(ii(m))}${aaConfigShort(m) ? ` (${aaConfigShort(m)})` : ''}`],
      [t('ECI (Epoch)'), eci(m) !== null ? num(eci(m)) : null],
      [t('Precio combinado'), t('{usd} por millón', { usd: usd(blended(m)) })],
      [t('Entrada / salida'), `${usd(m.price.in.v)} / ${usd(m.price.out.v)}`],
      [t('Precio de'), priceBasis(m)],
      [t('Pesos'), m.weights.v ? weightsWord(m.weights.v) : t('sin datos')]
    ])
  }));
  const sinApi = models.filter(m => m.aaOnly).length, excluded = models.length - pts.length - sinApi;
  const lo = leader(models, 'abiertos'), lc = leader(models, 'cerrados');
  const top = lc ? ii(lc) : ii(lo);
  const T = Math.round((top - gapPts) * 10) / 10;
  const best = cheapestAbove(models, T, ii, blended);
  const labels = new Set([lo?.id, lc?.id, best?.id].filter(Boolean));
  scatter(el, pts, { threshold: T, labels, yLabel: t('Índice de inteligencia (Artificial Analysis)') });

  const bits = [];
  if (lo && lc) {
    const gap = ii(lc) - ii(lo);
    const ratio = blended(lc) > 0 && blended(lo) > 0 ? blended(lc) / blended(lo) : null;
    bits.push(t('El mejor modelo con pesos abiertos ({open}, {oi}) queda {dist} del mejor cerrado ({closed}, {ci}){ratio}.', {
      open: esc(lo.name), oi: num(ii(lo)), closed: esc(lc.name), ci: num(ii(lc)),
      dist: gap >= 0 ? t('{num} puntos por debajo', { num: num(gap) }) : t('{num} puntos por encima', { num: num(-gap) }),
      ratio: ratio ? ` ${t('y su precio combinado es {x}', { x: ratio >= 1 ? t('{num} veces menor', { num: num(ratio) }) : t('{num} veces mayor', { num: num(1 / ratio) }) })}` : ''
    }));
    const dl = downloadable(models, lo);
    if (dl) bits.push(t('Sus pesos sólo están anunciados; con pesos ya descargables, el mejor es {name} ({num}), {p3} puntos por debajo del mejor cerrado.', { name: esc(dl.name), num: num(ii(dl)), p3: num(Math.round((ii(lc) - ii(dl)) * 10) / 10) }));
  }
  if (best) bits.push(t('Por encima del umbral de {T} puntos del índice AA, la opción más barata es {name} ({tipo}), a {usd} por millón.', { T: num(T), name: esc(best.name), tipo: best.weights.v === 'abiertos' ? t('abierto') : t('cerrado'), usd: usd(blended(best)) }));
  if (excluded) bits.push(tn(excluded, ['{n} modelo con índice pero sin precio positivo no aparece en el gráfico.', '{n} modelos con índice pero sin precio positivo no aparecen en el gráfico.']));
  if (sinApi) bits.push(tn(sinApi, ['{n} modelo puntuado por AA que aún no tiene API pública, y por tanto precio, tampoco aparece.', '{n} modelos puntuados por AA que aún no tienen API pública, y por tanto precio, tampoco aparecen.']));
  $('#hoy-reading').innerHTML = `<span class="lbl">${t('Lectura automática a partir de las cifras')}</span>${bits.join(' ')}<span class="m-sub">${t('Capacidad: {aaIndexName}, datos de {AA_LINK}. Precio:', { aaIndexName: esc(aaIndexName(d.catalog.aaIndexVersion)), AA_LINK })} <a href="https://openrouter.ai/models" target="_blank" rel="noopener">${t('OpenRouter')}</a>${t(', el del propio laboratorio o, si no lo sirve, el del proveedor más barato.')}</span>`;
}

/* Líderes por índice de AA, un punto por recogida diaria. Sólo la versión vigente del índice: entre versiones no son comparables. */
function renderDaily(d) {
  const serie = d.historia?.serie || [];
  const ver = d.catalog.aaIndexVersion;
  const pts = serie.filter(p => p.aaV === ver && (p.open || p.closed));
  const first = pts[0]?.d;
  daily($('#hoy-daily'), pts, {
    aria: t('Índice de Artificial Analysis del mejor modelo cerrado y del mejor abierto, por día'),
    yLabel: t('Índice AA'), foot: t('Mejor modelo de cada bloque ese día, entre los del catálogo con índice.'),
    series: [
      { cls: 'ln-closed', name: t('Mejor cerrado'), get: p => p.closed?.ii ?? null, who: p => p.closed?.n },
      { cls: 'ln-open', name: t('Mejor abierto'), get: p => p.open?.ii ?? null, who: p => p.open?.n }
    ]
  });
  $('#hoy-daily-note').innerHTML = t('Un punto por recogida diaria{p1}: el mejor modelo cerrado y el mejor abierto del catálogo según el {aaIndexName} de {AA_LINK}. Cada día queda guardado en el repositorio (data/history), así que la serie crece con cada recogida; los días con otra versión del índice no se mezclan. Es la única serie del observatorio medida día a día con el índice de AA; las de Modelos y La carrera se reconstruyen hoy hacia atrás con las puntuaciones actuales.', { p1: first ? t(', desde el {fmtDate}', { fmtDate: esc(fmtDate(first)) }) : '', aaIndexName: esc(aaIndexName(ver)), AA_LINK });
}

let GAP_PTS = 10;   // umbral elegido en «Coste con capacidad comparable»: se conserva al cambiar de idioma
export function renderHoy(d) {
  renderNews(d);
  renderKPIs(d, GAP_PTS);
  renderScatter(d, GAP_PTS);
  renderDaily(d);
}
