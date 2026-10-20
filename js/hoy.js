/* Vista «Hoy»: qué ha cambiado, cuatro indicadores y capacidad frente a precio. */
import { esc, fact, src, provLine, usd, num, fmtDate, blended, ii, capFact, ND } from './fmt.js';
import { scatter } from './charts.js';

const $ = s => document.querySelector(s);
const KIND = { nuevo: 'Nuevo modelo', pesos: 'Pesos abiertos', precio: 'Cambio de precio', evaluacion: 'Evaluación independiente', retirada: 'Retirada' };
const GAPS = [5, 10, 15];
const blendSnap = s => (s && s.in !== null && s.out !== null && s.in !== undefined && s.out !== undefined) ? (3 * s.in + s.out) / 4 : null;

function scored(models) {
  return models.filter(m => ii(m) !== null && m.identity === 'confirmada');
}
function leader(models, w) {
  return scored(models).filter(m => m.weights.v === w).sort((a, b) => ii(b) - ii(a))[0] || null;
}

/* Relevancia: pesos y modelos evaluados primero; cambios de precio según su tamaño; retiradas al final. */
function relevance(item, byId) {
  const m = byId.get(item.model);
  switch (item.kind) {
    case 'pesos': return 50;
    case 'nuevo': return m?.identity !== 'confirmada' ? 20 : 30 + (item.data?.eci ? 15 : 0);
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
    if (lead) {
      const diff = Math.round((score - ii(lead)) * 10) / 10;
      parts.push(diff > 0
        ? `ECI ${num(score)}: supera en ${num(diff)} puntos al anterior mejor ${block === 'abiertos' ? 'abierto' : 'cerrado'} (${esc(lead.name)}).`
        : `ECI ${num(score)}: a ${num(-diff)} puntos del mejor ${block === 'abiertos' ? 'abierto' : 'cerrado'} (${esc(lead.name)}). Puesto ${rank} de ${scored(models).length} en el catálogo.`);
    } else parts.push(`ECI ${num(score)}. Puesto ${rank} de ${scored(models).length} en el catálogo.`);
  } else if (item.kind === 'nuevo') {
    parts.push('Sin puntuación de capacidad independiente todavía (Epoch AI).');
  }
  if (item.kind === 'precio') {
    const pct = item.data.pct;
    parts.push(`${pct < 0 ? 'Baja' : 'Sube'} un ${num(Math.abs(pct))} % desde la recogida del ${fmtDate(item.data.since)}.`);
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
  const items = (d.changes.items || []).slice().sort((a, b) => relevance(b, d.byId) - relevance(a, d.byId) || (b.date || '').localeCompare(a.date || ''));
  $('#hoy-period').innerHTML = d.changes.since
    ? `Cambios entre la recogida del ${esc(fmtDate(d.changes.since))} y la del ${esc(fmtDate(d.catalog.generated))}.`
    : `Primera recogida: se listan las altas de los últimos 14 días en OpenRouter. Los cambios de precio se detectan a partir de la siguiente.`;
  if (!items.length) {
    $('#hoy-news').innerHTML = `<div class="empty">Sin cambios relevantes${d.changes.since ? ` desde el ${esc(fmtDate(d.changes.since))}` : ''}. Ningún modelo nuevo, cambio de precio de al menos un 5 %, pesos nuevos ni retiradas en los laboratorios seguidos.</div>`;
    $('#hoy-all').hidden = true;
    return;
  }
  $('#hoy-news').innerHTML = items.slice(0, 3).map(it => `
    <article class="news-card">
      <span class="tag k-${esc(it.kind)}">${esc(KIND[it.kind] || it.kind)}</span>
      <h3>${esc(d.byId.get(it.model)?.name || it.data?.name || it.model)}</h3>
      <p><span class="lbl">Qué ocurrió</span>${esc(it.what)}</p>
      <p><span class="lbl">Qué cambia</span>${consequence(it, d)}</p>
      ${provLine({ ...it.src, date: it.date })}
    </article>`).join('');
  const all = $('#hoy-all');
  all.hidden = items.length <= 3;
  all.querySelector('summary').textContent = `Ver todos los cambios (${items.length})`;
  $('#hoy-all-list').innerHTML = items.map(it => `<li><span>${esc(fmtDate(it.date))}</span><span><b>${esc(KIND[it.kind] || it.kind)}.</b> ${esc(it.what)}</span>${provLine(it.src)}</li>`).join('');
}

function cheapestAbove(rows, T, getII, getPrice) {
  return rows.filter(r => getII(r) !== null && getII(r) >= T && getPrice(r) !== null && getPrice(r) > 0)
    .sort((a, b) => getPrice(a) - getPrice(b))[0] || null;
}

function renderKPIs(d, gapPts) {
  const models = d.catalog.models;
  const lo = leader(models, 'abiertos'), lc = leader(models, 'cerrados');
  const epOff = d.catalog.status?.epoch && !d.catalog.status.epoch.ok && !scored(models).length;
  const reason = epOff ? `Epoch AI no disponible: ${esc(d.catalog.status.epoch.reason)}.` : '';
  const prev = d.prevSnap;

  const leadCard = (m, cls, label, prevLead) => {
    if (!m) return `<div class="kpi ${cls}"><span class="k">${label}</span><span class="v">${ND}</span><span class="s">${reason || 'Ningún modelo de este bloque tiene índice.'}</span></div>`;
    let delta = '';
    if (prevLead && prevLead.id !== m.id && prevLead.eci !== undefined) delta = ` Antes: ${esc(prev.models[prevLead.id]?.n || prevLead.id)} (${num(prevLead.eci)}).`;
    return `<div class="kpi ${cls}"><span class="k">${label}</span><span class="v small">${esc(m.name)}</span>
      <span class="s">${esc(m.lab.name)} · ECI ${fact(capFact(m), v => num(v))}, intervalo ${num(capFact(m).ci?.[0])}–${num(capFact(m).ci?.[1])}.${delta}</span></div>`;
  };

  let gapCard;
  if (lo && lc) {
    const gap = Math.round((ii(lc) - ii(lo)) * 10) / 10;
    let delta = '';
    if (prev?.leaders?.open?.eci !== undefined && prev?.leaders?.closed?.eci !== undefined) {
      const pg = Math.round((prev.leaders.closed.eci - prev.leaders.open.eci) * 10) / 10;
      if (pg !== gap) delta = ` ${gap < pg ? 'Se reduce' : 'Se amplía'} desde ${num(pg)} el ${fmtDate(prev.date)}.`;
      else delta = ` Igual que el ${fmtDate(prev.date)}.`;
    }
    gapCard = `<div class="kpi"><span class="k">Diferencia cerrado − abierto</span><span class="v">${gap > 0 ? '' : gap < 0 ? '−' : ''}${num(Math.abs(gap))} pts${src(capFact(lc))}</span>
      <span class="s">Puntos del Epoch Capabilities Index entre ${esc(lc.name)} y ${esc(lo.name)}. No equivalen a meses de retraso.${overlap(lo, lc) ? ' Los intervalos de confianza se solapan: la diferencia no es concluyente.' : ''}${delta}</span></div>`;
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
    if (prev) {
      const rows = Object.entries(prev.models).map(([id, s]) => ({ id, ...s }));
      const pb = cheapestAbove(rows, T, r => r.eci ?? null, blendSnap);
      if (pb && best) {
        const ch = (blended(best) - blendSnap(pb)) / blendSnap(pb) * 100;
        delta = Math.abs(ch) < 0.5 ? ` Sin cambio desde el ${fmtDate(prev.date)}.` : ` ${ch < 0 ? 'Baja' : 'Sube'} un ${num(Math.abs(ch))} % desde el ${fmtDate(prev.date)} (${usd(blendSnap(pb))}).`;
      }
    }
    const sel = `<label>umbral <select id="kpi-pct">${GAPS.map(g => `<option value="${g}"${g === gapPts ? ' selected' : ''}>líder − ${g} pts</option>`).join('')}</select></label>`;
    costCard = `<div class="kpi"><span class="k">Coste con capacidad comparable</span>
      <span class="v">${best ? usd(blended(best)) + src(best.price.in) : ND}</span>
      <span class="s">${best ? `${esc(best.name)}: el más barato con ECI ≥ ${num(T)}, precio combinado por millón.` : `Ningún modelo con ECI ≥ ${num(T)} tiene precio.`}${bestOpen && bestOpen !== best ? ` Abierto más barato: ${esc(bestOpen.name)}, ${usd(blended(bestOpen))}.` : ''}${delta}</span>${sel}</div>`;
  } else {
    costCard = `<div class="kpi"><span class="k">Coste con capacidad comparable</span><span class="v">${ND}</span><span class="s">${reason || 'Sin modelos con índice.'}</span></div>`;
  }

  $('#hoy-kpis').innerHTML = leadCard(lo, 'open', 'Líder abierto', prev?.leaders?.open) + leadCard(lc, 'closed', 'Líder cerrado', prev?.leaders?.closed) + gapCard + costCard;
  $('#hoy-kpi-note').innerHTML = 'Líderes calculados entre los modelos que se pueden usar por API en OpenRouter y tienen puntuación en el <a href="https://epoch.ai/benchmarks/eci" target="_blank" rel="noopener">Epoch Capabilities Index</a> (Epoch AI, CC BY 4.0). Umbral de capacidad comparable: ECI del mejor modelo menos los puntos elegidos. Precio combinado: (3 × entrada + salida) / 4, con precios de OpenRouter.';
  $('#kpi-pct')?.addEventListener('change', e => { renderKPIs(d, Number(e.target.value)); renderScatter(d, Number(e.target.value)); });
}

function overlap(a, b) {
  const x = capFact(a)?.ci, y = capFact(b)?.ci;
  return x && y && x[0] !== null && y[0] !== null && x[0] <= y[1] && y[0] <= x[1];
}

function renderScatter(d, gapPts) {
  const models = scored(d.catalog.models);
  const el = $('#hoy-scatter');
  if (!models.length) {
    el.innerHTML = '<div class="chart-empty">Sin datos de capacidad: ningún modelo del catálogo tiene puntuación ECI de Epoch AI.</div>';
    $('#hoy-reading').innerHTML = '';
    return;
  }
  const pts = models.filter(m => blended(m) > 0).map(m => ({
    id: m.id, x: blended(m), y: ii(m), cls: m.weights.v === 'abiertos' ? 'open' : m.weights.v === 'cerrados' ? 'closed' : 'unknown',
    label: m.name, title: `${m.name} (${m.lab.name}) · ECI ${m.epoch.eci.v} · ${usd(blended(m))}/M combinado · ${m.weights.v || 'pesos sin datos'}`
  }));
  const excluded = models.length - pts.length;
  const lo = leader(models, 'abiertos'), lc = leader(models, 'cerrados');
  const top = lc ? ii(lc) : ii(lo);
  const T = Math.round((top - gapPts) * 10) / 10;
  const best = cheapestAbove(models, T, ii, blended);
  const labels = new Set([lo?.id, lc?.id, best?.id].filter(Boolean));
  scatter(el, pts, { threshold: T, labels, yLabel: 'Epoch Capabilities Index (ECI)' });

  const bits = [];
  if (lo && lc) {
    const gap = ii(lc) - ii(lo);
    const ratio = blended(lc) > 0 && blended(lo) > 0 ? blended(lc) / blended(lo) : null;
    bits.push(`El mejor modelo con pesos abiertos (${esc(lo.name)}, ${num(ii(lo))}) queda ${gap >= 0 ? `${num(gap)} puntos por debajo` : `${num(-gap)} puntos por encima`} del mejor cerrado (${esc(lc.name)}, ${num(ii(lc))})${ratio ? ` y su precio combinado es ${ratio >= 1 ? `${num(ratio)} veces menor` : `${num(1 / ratio)} veces mayor`}` : ''}.`);
  }
  if (best) bits.push(`Por encima del umbral de ${num(T)} puntos ECI, la opción más barata es ${esc(best.name)} (${best.weights.v === 'abiertos' ? 'abierto' : 'cerrado'}), a ${usd(blended(best))} por millón.`);
  if (excluded) bits.push(`${excluded} modelo${excluded > 1 ? 's' : ''} con ECI pero sin precio positivo no aparece${excluded > 1 ? 'n' : ''} en el gráfico.`);
  $('#hoy-reading').innerHTML = `<span class="lbl">Lectura automática a partir de las cifras</span>${bits.join(' ')}`;
}

export function renderHoy(d) {
  renderNews(d);
  renderKPIs(d, 10);
  renderScatter(d, 10);
}
