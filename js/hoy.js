/* Vista «Hoy»: qué ha cambiado, cuatro indicadores y capacidad frente a precio. */
import { esc, fact, src, provLine, usd, num, fmtDate, blended, ii, capFact, eci, aaConfig, aaConfigShort, aaIndexName, priceBasis, ND, AA_LINK } from './fmt.js';
import { scatter, daily, tip } from './charts.js';

const $ = s => document.querySelector(s);
const KIND = { nuevo: 'Nuevo modelo', pesos: 'Pesos abiertos', precio: 'Precio del laboratorio', evaluacion: 'Evaluación independiente', retirada: 'Retirada' };
/* Orden de las tarjetas: modelos nuevos, evaluaciones y pesos antes que precios y retiradas. */
const TIER = { nuevo: 0, evaluacion: 0, pesos: 0, precio: 1, retirada: 2 };
const GAPS = [5, 10, 15];
const blendSnap = s => (s && s.in !== null && s.out !== null && s.in !== undefined && s.out !== undefined) ? (3 * s.in + s.out) / 4 : null;

function scored(models) {
  return models.filter(m => ii(m) !== null && m.identity === 'confirmada');
}
function leader(models, w) {
  return scored(models).filter(m => m.weights.v === w).sort((a, b) => ii(b) - ii(a))[0] || null;
}

/* Relevancia, para desempatar acontecimientos de un mismo grupo y fecha: pesos y modelos evaluados primero; precios según su tamaño. */
function relevance(item, byId) {
  const m = byId.get(item.model);
  switch (item.kind) {
    case 'pesos': return 50;
    case 'nuevo': return m?.identity !== 'confirmada' ? 20 : 30 + (item.data?.ii || item.data?.eci ? 15 : 0);
    case 'precio': return 25 + Math.min(20, Math.abs(item.data?.pct || 0) / 2);
    case 'evaluacion': return 35;
    case 'retirada': return 10;
    default: return 0;
  }
}

/* «Qué cambia»: consecuencia factual calculada a partir del catálogo, nunca redactada a partir de suposiciones. */
function consequence(item, d) {
  const m = d.byId.get(item.model);
  const models = d.catalog.models;
  if (item.kind === 'retirada') return 'Deja de poder usarse a través de OpenRouter. Puede seguir disponible en la API del propio laboratorio.';
  if (!m) return 'Sin datos adicionales.';
  if (m.identity !== 'confirmada') return 'Modelo anónimo: el laboratorio no está confirmado y no se atribuye a ninguno.';
  const parts = [];
  const score = ii(m);
  if (item.kind === 'pesos') parts.push(`Se puede descargar y servir fuera de la API del laboratorio. Licencia: ${esc(m.license.v || 'sin datos')}.`);
  if (score !== null && (item.kind === 'nuevo' || item.kind === 'evaluacion' || item.kind === 'pesos')) {
    const block = m.weights.v;
    const lead = leader(models.filter(x => x.id !== m.id), block);
    const rank = scored(models).sort((a, b) => ii(b) - ii(a)).findIndex(x => x.id === m.id) + 1;
    const head = `Índice AA ${num(score)}${src(capFact(m))}${aaConfig(m) ? ` («${esc(aaConfig(m))}»)` : ''}`;
    if (lead) {
      const diff = Math.round((score - ii(lead)) * 10) / 10;
      parts.push(diff > 0
        ? `${head}: supera en ${num(diff)} puntos al anterior mejor ${block === 'abiertos' ? 'abierto' : 'cerrado'} (${esc(lead.name)}).`
        : `${head}: a ${num(-diff)} puntos del mejor ${block === 'abiertos' ? 'abierto' : 'cerrado'} (${esc(lead.name)}). Puesto ${rank} de ${scored(models).length} en el catálogo.`);
    } else parts.push(`${head}. Puesto ${rank} de ${scored(models).length} en el catálogo.`);
    if (eci(m) === null) parts.push('Epoch AI todavía no lo ha puntuado.');
  } else if (item.kind === 'nuevo') {
    parts.push(eci(m) !== null
      ? `Sin puntuación todavía en Artificial Analysis. ECI ${num(eci(m))}${src(m.epoch.eci)} en Epoch AI.`
      : 'Sin puntuación independiente todavía en Artificial Analysis ni en Epoch AI.');
  }
  if (item.kind === 'precio') {
    const pct = item.data.pct;
    parts.push(`El precio combinado ${pct < 0 ? 'baja' : 'sube'} un ${num(Math.abs(pct))} % respecto a la recogida del ${fmtDate(item.data.since)}.`);
  }
  if (item.kind === 'nuevo' || item.kind === 'precio') {
    const b = blended(m);
    const peers = models.filter(x => x.weights.v === m.weights.v && x.id !== m.id && blended(x) !== null && blended(x) > 0);
    if (b !== null && b > 0 && peers.length >= 4) {
      const cheaper = peers.filter(x => blended(x) > b).length;
      parts.push(`Precio combinado ${usd(b)} por millón: más barato que ${Math.round(cheaper / peers.length * 100)} % de los modelos ${m.weights.v === 'abiertos' ? 'abiertos' : 'cerrados'} del catálogo.`);
    } else if (b === 0) parts.push('Gratuito en OpenRouter en el momento de la consulta.');
  }
  return parts.join(' ') || 'Sin datos adicionales.';
}

function renderNews(d) {
  // Tarjetas: primero modelos nuevos, evaluaciones y pesos, del más reciente al más antiguo; después precios y retiradas.
  // Lista completa: cronológica, lo más reciente primero.
  const byDate = (a, b) => (b.date || '').localeCompare(a.date || '');
  const all = (d.changes.items || []).slice();
  const cards = all.slice().sort((a, b) => (TIER[a.kind] ?? 3) - (TIER[b.kind] ?? 3) || byDate(a, b) || relevance(b, d.byId) - relevance(a, d.byId));
  const items = all.sort((a, b) => byDate(a, b) || (TIER[a.kind] ?? 3) - (TIER[b.kind] ?? 3) || relevance(b, d.byId) - relevance(a, d.byId));
  const days = d.changes.window || 7;
  $('#hoy-period').innerHTML = `Últimos ${days} días, desde el ${esc(fmtDate(d.changes.since))}: modelos nuevos en OpenRouter, primeras puntuaciones, pesos abiertos, cambios de precio del propio laboratorio y retiradas.`;
  if (!items.length) {
    $('#hoy-news').innerHTML = `<div class="empty">Nada en los últimos ${days} días: ningún modelo nuevo, primera puntuación, pesos nuevos, cambio de precio del laboratorio de al menos un 5 % ni retirada en los laboratorios seguidos.</div>`;
    $('#hoy-all').hidden = true;
    return;
  }
  // Una tarjeta por modelo: un modelo nuevo con su primera puntuación no ocupa dos.
  const seen = new Set();
  const top = cards.filter(it => !seen.has(it.model) && seen.add(it.model)).slice(0, 3);
  $('#hoy-news').innerHTML = top.map(it => `
    <article class="news-card">
      <span class="tag k-${esc(it.kind)}">${esc(KIND[it.kind] || it.kind)}</span>
      <h3>${esc(d.byId.get(it.model)?.name || it.data?.name || it.model)}</h3>
      <p><span class="lbl">Qué ocurrió</span>${esc(it.what)}</p>
      <p><span class="lbl">Qué cambia</span>${consequence(it, d)}</p>
      ${provLine({ ...it.src, date: it.date })}
    </article>`).join('');
  const more = $('#hoy-all');
  more.hidden = items.length <= top.length;
  more.querySelector('summary').textContent = `Ver todo lo ocurrido en ${days} días (${items.length})`;
  $('#hoy-all-list').innerHTML = items.map(it => `<li><span>${esc(fmtDate(it.date))}</span><span><b>${esc(KIND[it.kind] || it.kind)}.</b> ${esc(it.what)}</span>${provLine(it.src)}</li>`).join('');
}

const priceBy = m => priceBasis(m) ? `, ${esc(priceBasis(m))}` : '';

function cheapestAbove(rows, T, getII, getPrice) {
  return rows.filter(r => getII(r) !== null && getII(r) >= T && getPrice(r) !== null && getPrice(r) > 0)
    .sort((a, b) => getPrice(a) - getPrice(b))[0] || null;
}

function renderKPIs(d, gapPts) {
  const models = d.catalog.models;
  const lo = leader(models, 'abiertos'), lc = leader(models, 'cerrados');
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
    return `<div class="kpi ${cls}"><span class="k">${label}</span><span class="v small">${esc(m.name)}</span>
      <span class="s">${esc(m.lab.name)} · índice AA ${fact(capFact(m), v => num(v))}${aaConfig(m) ? ` («${esc(aaConfig(m))}»)` : ''}.${ep}${delta}</span></div>`;
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
      <span class="s">Puntos del ${esc(aaIndexName(ver))} entre ${esc(lc.name)} y ${esc(lo.name)}. No equivalen a meses de retraso. AA no publica intervalo de confianza para este índice.${delta}</span></div>`;
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
  $('#hoy-daily-note').innerHTML = `Un punto por recogida diaria${first ? `, desde el ${esc(fmtDate(first))}` : ''}: el mejor modelo cerrado y el mejor abierto del catálogo según el ${esc(aaIndexName(ver))} de ${AA_LINK}. Cada día queda guardado en el repositorio (data/history), así que la serie crece con cada recogida; los días con otra versión del índice no se mezclan.`;
}

export function renderHoy(d) {
  renderNews(d);
  renderKPIs(d, 10);
  renderScatter(d, 10);
  renderDaily(d);
}
