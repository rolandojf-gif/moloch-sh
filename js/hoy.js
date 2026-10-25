/* Vista «Hoy»: el parte del día, lo detectado en la semana, cuatro indicadores y capacidad frente a precio. */
import { esc, fact, src, usd, num, fmtDate, blended, ii, capFact, eci, aaConfig, aaConfigShort, aaIndexName, priceBasis, ND, AA_LINK } from './fmt.js';
import { scatter, daily, tip } from './charts.js';

const $ = s => document.querySelector(s);
const KIND = { nuevo: 'Nuevo modelo', pesos: 'Pesos abiertos', precio: 'Precio del laboratorio', evaluacion: 'Evaluación independiente', retirada: 'Retirada',
  lider: 'Cambio de líder', version: 'Versión del índice AA', indicador: 'La carrera', valoracion: 'Seguimiento de AI 2027', uso: 'Uso en OpenRouter' };
const modelLink = (d, id, name) => d.byId.has(id) ? `<a class="m-open" href="#modelos/${esc(id)}" title="Abrir su ficha en Modelos">${esc(name)}</a>` : esc(name);
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
const toFicha = (href, text) => href ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text);
const srcLink = s => s?.url ? `<a href="${esc(s.url)}"${/^#/.test(s.url) ? '' : ' target="_blank" rel="noopener"'}>${esc(s.name || 'fuente')}</a>` : esc(s?.name || 'sin fuente');
/* Pie de cada cambio: fuente, fecha de publicación si la fuente la da y fecha en que lo detectó el observatorio.
   Si el texto mostrado cita el índice de AA y la fuente es otra, se añade el crédito a AA. */
const foot = (it, shown) => `<div class="prov">Fuente: ${srcLink(it.src)}${it.published ? ` · publicado: ${esc(fmtDate(it.published))}` : ''} · detectado: ${esc(fmtDate(it.detected || it.date))}${/\bAA\b|Artificial Analysis/.test(shown.join(' ')) && !/artificialanalysis\.ai/.test(it.src?.url || '') ? ` · índice de ${AA_LINK}, publicado con su permiso` : ''}</div>`;

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
  if (!nuevos.length) { el.innerHTML = `<b>Desde tu última visita</b> (parte del ${esc(fmtDate(ref))}): nada nuevo.`; return; }
  const n = nuevos.filter(it => it.importancia).length;
  el.innerHTML = `<b>Desde tu última visita</b> (parte del ${esc(fmtDate(ref))}): ${nuevos.length} cambio${nuevos.length > 1 ? 's' : ''} detectado${nuevos.length > 1 ? 's' : ''}, ${n ? `${n} de ellos noticia` : 'ninguno noticia'}.${since && ref < since ? ` Sólo cuentan los de los últimos ${d.changes.window || 7} días, desde el ${esc(fmtDate(since))}.` : ''}${sig.length ? ` ${p.noticias.length ? 'Además de las de arriba' : 'Las noticias'}:<ul>${sig.slice(0, 5).map(it => `<li><span>${esc(fmtDate(it.detected))}</span> ${toFicha(it.ficha, it.titular || it.what)}</li>`).join('')}</ul>${sig.length > 5 ? `Y ${sig.length - 5} más en la lista de abajo.` : ''}` : ''}`;
}

function renderNews(d) {
  const days = d.changes.window || 7;
  const p = d.changes.parte;
  // Lista completa: por fecha de detección, la más reciente primero; dentro de cada día, las noticias delante.
  const items = (d.changes.items || []).slice().sort((a, b) => (b.detected || b.date || '').localeCompare(a.detected || a.date || '') || !!b.importancia - !!a.importancia);
  const byKey = new Map(items.map(it => [it.key, it]));
  $('#hoy-period').innerHTML = p
    ? `Parte del ${esc(fmtDate(p.fecha))}: hasta tres noticias de la última recogida, elegidas con una regla fija que se explica debajo; si ninguna la cumple, se dice. Más abajo, todo lo detectado en los últimos ${days} días. También como <a href="data/parte.xml">fuente RSS</a>.`
    : `Últimos ${days} días, desde el ${esc(fmtDate(d.changes.since))}. El parte diario empieza con la próxima recogida.`;
  renderVisit(d, items, p);
  const top = p ? p.noticias.map(k => byKey.get(k)).filter(Boolean) : [];
  const today = p ? items.filter(it => it.detected === p.fecha).length : 0;
  $('#hoy-news').innerHTML = top.length ? top.map(it => `
    <article class="news-card">
      <span class="tag k-${esc(it.kind)}">${esc(KIND[it.kind] || it.kind)}</span>
      <h3>${toFicha(it.ficha, it.titular || it.what)}</h3>
      <p><span class="lbl">Qué ocurrió</span>${esc(it.what)}</p>
      ${it.consecuencia ? `<p><span class="lbl">Qué cambia</span>${esc(it.consecuencia)}</p>` : ''}
      <p><span class="lbl">Por qué es noticia</span>${esc(cap(it.importancia?.porque))}.</p>
      ${foot(it, [it.titular, it.what, it.consecuencia, it.importancia?.porque])}
    </article>`).join('')
    : p ? `<div class="empty"><b>Sin cambios significativos en la recogida del ${esc(fmtDate(p.fecha))}.</b> ${today ? `${today} cambio${today > 1 ? 's' : ''} menor${today > 1 ? 'es' : ''}, en la lista de abajo.` : 'Ningún cambio detectado.'}${p.ultima ? ` La última noticia fue del ${esc(fmtDate(p.ultima.fecha))}: ${toFicha(p.ultima.ficha, p.ultima.titular)}.` : ''}</div>`
    : '';
  const rules = $('#hoy-reglas');
  rules.hidden = !p;
  if (p) $('#hoy-reglas-body').innerHTML = `<ol class="reglas">${p.reglas.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
    <p class="note">Entran hasta tres cambios de la última recogida, uno por modelo o hito, en el orden de la lista; dentro de una misma regla, primero el de mayor magnitud. Nunca se rellena: si ninguno cumple la regla, el parte lo dice. Los titulares salen de plantillas con las cifras («duplica» sólo si el precio es exactamente el doble) y la consecuencia, de los datos de la misma recogida, sin modelo de lenguaje ni opinión.</p>`;
  const more = $('#hoy-all');
  more.hidden = !items.length;
  if (!items.length) return;
  const sig = items.filter(it => it.importancia).length;
  more.querySelector('summary').textContent = `Ver todo lo detectado en ${days} días (${items.length}${sig ? `, ${sig} noticia${sig > 1 ? 's' : ''}` : ''})`;
  const link = it => it.ficha ? ` <a href="${esc(it.ficha)}">${/^#modelos/.test(it.ficha) ? 'Abrir el modelo' : 'Ver la ficha'}</a>` : '';
  $('#hoy-all-list').innerHTML = items.map(it => `<li><span>${esc(fmtDate(it.detected || it.date))}</span><span>${it.importancia ? '<span class="tag k-noticia">Noticia</span> ' : ''}<b>${esc(KIND[it.kind] || it.kind)}.</b> ${esc(it.what)}${link(it)}</span>${foot(it, [it.what])}</li>`).join('');
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
  const reason = aaSt && !aaSt.ok && !scored(models).length ? `Artificial Analysis no disponible: ${esc(aaSt.reason || 'sin datos')}.` : '';
  const ver = d.catalog.aaIndexVersion;
  // Las comparaciones con la recogida anterior sólo valen con la misma versión del índice de AA.
  const prev = d.prevSnap && d.prevSnap.leaders?.aa && (d.prevSnap.leaders.aa.v ?? null) === (ver ?? null) ? d.prevSnap : null;
  const prevAA = prev?.leaders?.aa;

  const leadCard = (m, cls, label, prevLead) => {
    if (!m) return `<div class="kpi ${cls}"><span class="k">${label}</span><span class="v">${ND}</span><span class="s">${reason || 'Ningún modelo de este bloque tiene índice.'}</span></div>`;
    let delta = '';
    if (prevLead && prevLead.id !== m.id && prevLead.ii !== undefined) delta = ` Antes: ${esc(prev.models[prevLead.id]?.n || prevLead.id)} (${num(prevLead.ii)}).`;
    const ep = eci(m) !== null ? ` ECI en Epoch AI: ${fact(m.epoch.eci, v => num(v))}.` : '';
    return `<div class="kpi ${cls}"><span class="k">${label}</span><span class="v small">${modelLink(d, m.id, m.name)}</span>
      <span class="s">${esc(m.lab.name)} · índice AA ${fact(capFact(m), v => num(v))}${aaConfig(m) ? ` («${esc(aaConfig(m))}»)` : ''}.${m.weights.announced ? ` Pesos anunciados en su descripción de OpenRouter${m.weights.since ? ` desde el ${esc(fmtDate(m.weights.since))}` : ''}; aún no se pueden descargar.` : ''}${ep}${delta}${dl && m === lo ? ` Con pesos ya descargables, el mejor es ${modelLink(d, dl.id, dl.name)} (${esc(dl.lab.name)}), índice AA ${fact(capFact(dl), v => num(v))}.` : ''}</span></div>`;
  };

  let gapCard;
  if (lo && lc) {
    const gap = Math.round((ii(lc) - ii(lo)) * 10) / 10;
    let delta = '';
    if (prevAA?.open?.ii !== undefined && prevAA?.closed?.ii !== undefined) {
      const pg = Math.round((prevAA.closed.ii - prevAA.open.ii) * 10) / 10;
      if (pg !== gap) delta = ` ${gap < pg ? 'Se reduce' : 'Se amplía'} desde ${num(pg)} el ${fmtDate(prev.date)}.`;
      else delta = ` Igual que el ${fmtDate(prev.date)}.`;
    }
    gapCard = `<div class="kpi"><span class="k">Diferencia cerrado − abierto</span><span class="v">${gap > 0 ? '' : gap < 0 ? '−' : ''}${num(Math.abs(gap))} pts${src(capFact(lc))}</span>
      <span class="s">Puntos del ${esc(aaIndexName(ver))} entre ${esc(lc.name)} y ${esc(lo.name)}.${dl ? ` Con el mejor de pesos ya descargables, ${esc(dl.name)}, ${num(Math.round((ii(lc) - ii(dl)) * 10) / 10)} pts.` : ''} No equivalen a meses de retraso. AA no publica intervalo de confianza para este índice.${delta}</span></div>`;
  } else {
    gapCard = `<div class="kpi"><span class="k">Diferencia cerrado − abierto</span><span class="v">${ND}</span><span class="s">${reason || 'Falta un líder con índice en algún bloque.'}</span></div>`;
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
        delta = Math.abs(ch) < 0.5 ? ` Sin cambio desde el ${fmtDate(prev.date)}.` : ` ${ch < 0 ? 'Baja' : 'Sube'} un ${num(Math.abs(ch))} % desde el ${fmtDate(prev.date)} (${usd(blendSnap(pb))}).`;
      }
    }
    const sel = `<label>umbral <select id="kpi-pct">${GAPS.map(g => `<option value="${g}"${g === gapPts ? ' selected' : ''}>líder − ${g} pts</option>`).join('')}</select></label>`;
    costCard = `<div class="kpi"><span class="k">Coste con capacidad comparable</span>
      <span class="v">${best ? usd(blended(best)) + src(best.price.in) : ND}</span>
      <span class="s">${best ? `${esc(best.name)}: el más barato con índice AA ≥ ${num(T)}, precio combinado por millón${priceBy(best)}.` : `Ningún modelo con índice AA ≥ ${num(T)} tiene precio.`}${bestOpen && bestOpen !== best ? ` Abierto más barato: ${esc(bestOpen.name)}, ${usd(blended(bestOpen))}.` : ''}${delta}</span>${sel}</div>`;
  } else {
    costCard = `<div class="kpi"><span class="k">Coste con capacidad comparable</span><span class="v">${ND}</span><span class="s">${reason || 'Sin modelos con índice.'}</span></div>`;
  }

  $('#hoy-kpis').innerHTML = leadCard(lo, 'open', 'Líder abierto', prevAA?.open) + leadCard(lc, 'closed', 'Líder cerrado', prevAA?.closed) + gapCard + costCard;
  $('#hoy-kpi-note').innerHTML = `Líderes calculados entre los modelos que se pueden usar por API en OpenRouter y tienen puntuación en el ${esc(aaIndexName(ver))}. Datos de ${AA_LINK}, publicados con su permiso. De cada modelo se toma la configuración de razonamiento de mayor índice. Umbral de capacidad comparable: índice del mejor modelo menos los puntos elegidos. Precio combinado: (3 × entrada + salida) / 4, con el precio que cobra el propio laboratorio en OpenRouter o, si no lo sirve él, el del proveedor más barato, que se indica.`;
  $('#kpi-pct')?.addEventListener('change', e => { renderKPIs(d, Number(e.target.value)); renderScatter(d, Number(e.target.value)); });
}

function renderScatter(d, gapPts) {
  const models = scored(d.catalog.models);
  const el = $('#hoy-scatter');
  if (!models.length) {
    el.innerHTML = '<div class="chart-empty">Sin datos de capacidad: ningún modelo del catálogo tiene puntuación de Artificial Analysis.</div>';
    $('#hoy-reading').innerHTML = '';
    return;
  }
  const pts = models.filter(m => blended(m) > 0).map(m => ({
    id: m.id, x: blended(m), y: ii(m), cls: m.weights.v === 'abiertos' ? 'open' : m.weights.v === 'cerrados' ? 'closed' : 'unknown',
    label: m.name,
    tip: tip(m.name, [
      ['Laboratorio', m.lab.name],
      ['Índice AA', `${num(ii(m))}${aaConfigShort(m) ? ` (${aaConfigShort(m)})` : ''}`],
      ['ECI (Epoch)', eci(m) !== null ? num(eci(m)) : null],
      ['Precio combinado', `${usd(blended(m))} por millón`],
      ['Entrada / salida', `${usd(m.price.in.v)} / ${usd(m.price.out.v)}`],
      ['Precio de', priceBasis(m)],
      ['Pesos', m.weights.v || 'sin datos']
    ])
  }));
  const excluded = models.length - pts.length;
  const lo = leader(models, 'abiertos'), lc = leader(models, 'cerrados');
  const top = lc ? ii(lc) : ii(lo);
  const T = Math.round((top - gapPts) * 10) / 10;
  const best = cheapestAbove(models, T, ii, blended);
  const labels = new Set([lo?.id, lc?.id, best?.id].filter(Boolean));
  scatter(el, pts, { threshold: T, labels, yLabel: 'Índice de inteligencia (Artificial Analysis)' });

  const bits = [];
  if (lo && lc) {
    const gap = ii(lc) - ii(lo);
    const ratio = blended(lc) > 0 && blended(lo) > 0 ? blended(lc) / blended(lo) : null;
    bits.push(`El mejor modelo con pesos abiertos (${esc(lo.name)}, ${num(ii(lo))}) queda ${gap >= 0 ? `${num(gap)} puntos por debajo` : `${num(-gap)} puntos por encima`} del mejor cerrado (${esc(lc.name)}, ${num(ii(lc))})${ratio ? ` y su precio combinado es ${ratio >= 1 ? `${num(ratio)} veces menor` : `${num(1 / ratio)} veces mayor`}` : ''}.`);
    const dl = downloadable(models, lo);
    if (dl) bits.push(`Sus pesos sólo están anunciados; con pesos ya descargables, el mejor es ${esc(dl.name)} (${num(ii(dl))}), ${num(Math.round((ii(lc) - ii(dl)) * 10) / 10)} puntos por debajo del mejor cerrado.`);
  }
  if (best) bits.push(`Por encima del umbral de ${num(T)} puntos del índice AA, la opción más barata es ${esc(best.name)} (${best.weights.v === 'abiertos' ? 'abierto' : 'cerrado'}), a ${usd(blended(best))} por millón.`);
  if (excluded) bits.push(`${excluded} modelo${excluded > 1 ? 's' : ''} con índice pero sin precio positivo no aparece${excluded > 1 ? 'n' : ''} en el gráfico.`);
  $('#hoy-reading').innerHTML = `<span class="lbl">Lectura automática a partir de las cifras</span>${bits.join(' ')}<span class="m-sub">Capacidad: ${esc(aaIndexName(d.catalog.aaIndexVersion))}, datos de ${AA_LINK}. Precio: <a href="https://openrouter.ai/models" target="_blank" rel="noopener">OpenRouter</a>, el del propio laboratorio o, si no lo sirve, el del proveedor más barato.</span>`;
}

/* Líderes por índice de AA, un punto por recogida diaria. Sólo la versión vigente del índice: entre versiones no son comparables. */
function renderDaily(d) {
  const serie = d.historia?.serie || [];
  const ver = d.catalog.aaIndexVersion;
  const pts = serie.filter(p => p.aaV === ver && (p.open || p.closed));
  const first = pts[0]?.d;
  daily($('#hoy-daily'), pts, {
    aria: 'Índice de Artificial Analysis del mejor modelo cerrado y del mejor abierto, por día',
    yLabel: 'Índice AA', foot: 'Mejor modelo de cada bloque ese día, entre los del catálogo con índice.',
    series: [
      { cls: 'ln-closed', name: 'Mejor cerrado', get: p => p.closed?.ii ?? null, who: p => p.closed?.n },
      { cls: 'ln-open', name: 'Mejor abierto', get: p => p.open?.ii ?? null, who: p => p.open?.n }
    ]
  });
  $('#hoy-daily-note').innerHTML = `Un punto por recogida diaria${first ? `, desde el ${esc(fmtDate(first))}` : ''}: el mejor modelo cerrado y el mejor abierto del catálogo según el ${esc(aaIndexName(ver))} de ${AA_LINK}. Cada día queda guardado en el repositorio (data/history), así que la serie crece con cada recogida; los días con otra versión del índice no se mezclan. Es la única serie del observatorio medida día a día con el índice de AA; las de Modelos y La carrera se reconstruyen hoy hacia atrás con las puntuaciones actuales.`;
}

export function renderHoy(d) {
  renderNews(d);
  renderKPIs(d, 10);
  renderScatter(d, 10);
  renderDaily(d);
}
