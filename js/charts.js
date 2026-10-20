/* Gráficos SVG sin dependencias. */
import { esc, usd, num, fmtDate } from './fmt.js';

const NS = 'http://www.w3.org/2000/svg';

function niceLogTicks(min, max) {
  const out = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    for (const m of [1, 3]) { const v = m * 10 ** e; if (v >= min * 0.999 && v <= max * 1.001) out.push(v); }
  }
  return out;
}
function niceTicks(min, max, n = 5) {
  const step = 10 ** Math.floor(Math.log10((max - min) / n || 1));
  const s = [1, 2, 5, 10].map(k => k * step).find(k => (max - min) / k <= n) || step * 10;
  const out = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/* Capacidad (eje Y) frente a precio combinado (eje X logarítmico). */
export function scatter(el, points, { threshold = null, labels = new Set(), yLabel = 'Índice' } = {}) {
  if (!points.length) { el.innerHTML = '<div class="chart-empty">No hay modelos con índice y precio a la vez.</div>'; return; }
  const W = 860, H = 380, L = 48, R = 16, T = 14, B = 44;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xmin = Math.min(...xs) / 1.4, xmax = Math.max(...xs) * 1.4;
  const ymin = Math.max(0, Math.floor((Math.min(...ys) - 5) / 5) * 5), ymax = Math.ceil((Math.max(...ys) + 3) / 5) * 5;
  const X = v => L + (Math.log10(v) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin)) * (W - L - R);
  const Y = v => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Índice de inteligencia frente a precio combinado por millón de tokens">`;
  s += '<g class="grid">';
  for (const t of niceTicks(ymin, ymax)) s += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/>`;
  s += '</g><g class="axis">';
  for (const t of niceTicks(ymin, ymax)) s += `<text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end">${num(t, 0)}</text>`;
  for (const t of niceLogTicks(xmin, xmax)) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${H - B}" y2="${H - B + 5}"/><text x="${X(t)}" y="${H - B + 18}" text-anchor="middle">${esc(usd(t))}</text>`;
  s += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">Precio combinado por millón de tokens (escala logarítmica)</text>`;
  s += `<text x="12" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">${esc(yLabel)}</text>`;
  s += '</g>';
  if (threshold !== null && threshold > ymin && threshold < ymax) {
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(threshold)}" y2="${Y(threshold)}" stroke="currentColor" stroke-dasharray="5 4" opacity=".55"/>`;
    s += `<text class="lbl" x="${W - R}" y="${Y(threshold) - 6}" text-anchor="end">umbral ${num(threshold, 0)}</text>`;
  }
  for (const p of points) {
    s += `<circle class="pt-${p.cls}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="6"><title>${esc(p.title)}</title></circle>`;
  }
  for (const p of points.filter(p => labels.has(p.id))) {
    const x = X(p.x), anchor = x > W * 0.72 ? 'end' : 'start';
    s += `<text class="ptlabel" x="${x + (anchor === 'end' ? -9 : 9)}" y="${Y(p.y) - 8}" text-anchor="${anchor}">${esc(p.label)}</text>`;
  }
  s += '</svg>';
  s += '<div class="legend"><span><i style="background:var(--open)"></i>Pesos abiertos</span><span><i style="background:var(--closed)"></i>Cerrado</span></div>';
  el.innerHTML = s;
}

/* Líneas de líder abierto y cerrado a lo largo del tiempo, cortadas por versión del índice. */
/* Marcas de tiempo en inicios de mes (paso de 1, 3, 6 o 12 meses), como mucho 7. */
function monthTicks(tmin, tmax) {
  const a = new Date(tmin), months = (tmax - tmin) / (30.44 * 86400e3);
  const stepM = [1, 3, 6, 12, 24].find(k => months / k <= 6) || 24;
  let y = a.getUTCFullYear(), m = Math.ceil(a.getUTCMonth() / stepM) * stepM;
  if (a.getUTCDate() > 1 && m === a.getUTCMonth()) m += stepM;
  const out = [];
  for (let d = Date.UTC(y, m, 1); d <= tmax; m += stepM, d = Date.UTC(y, m, 1)) if (d >= tmin) out.push(d);
  return out;
}

export function frontier(el, series, { step = false, yLabel = '' } = {}) {
  const pts = series.filter(p => p.open !== null || p.closed !== null);
  if (pts.length < 2) return false;
  const W = 860, H = 300, L = 48, R = 16, T = 14, B = 40;
  const t = p => new Date(p.date + 'T00:00:00Z').getTime();
  const tmin = t(pts[0]), tmax = t(pts[pts.length - 1]);
  const vals = pts.flatMap(p => [p.open, p.closed]).filter(v => v !== null);
  const ymin = Math.max(0, Math.floor((Math.min(...vals) - 5) / 5) * 5), ymax = Math.ceil((Math.max(...vals) + 3) / 5) * 5;
  const X = v => L + (v - tmin) / (tmax - tmin || 1) * (W - L - R);
  const Y = v => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del mejor modelo abierto y del mejor cerrado">`;
  s += '<g class="grid">';
  for (const v of niceTicks(ymin, ymax)) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/>`;
  s += '</g><g class="axis">';
  for (const v of niceTicks(ymin, ymax)) s += `<text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${num(v, 0)}</text>`;
  for (const tk of monthTicks(tmin, tmax)) {
    const x = X(tk);
    const anchor = x < L + 30 ? 'start' : x > W - R - 30 ? 'end' : 'middle';
    s += `<text x="${x.toFixed(1)}" y="${H - B + 18}" text-anchor="${anchor}">${esc(new Date(tk).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' }))}</text>`;
  }
  if (yLabel) s += `<text class="lbl" x="12" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">${esc(yLabel)}</text>`;
  s += '</g>';
  for (const key of ['open', 'closed']) {
    let d = '', prevV;
    for (const p of pts) {
      if (p[key] === null) { prevV = undefined; continue; }
      const newSeg = prevV === undefined || p.version !== prevV;   // nueva versión del índice = nuevo tramo
      d += newSeg ? `M${X(t(p)).toFixed(1)},${Y(p[key]).toFixed(1)} `
        : step ? `H${X(t(p)).toFixed(1)} V${Y(p[key]).toFixed(1)} ` : `L${X(t(p)).toFixed(1)},${Y(p[key]).toFixed(1)} `;
      prevV = p.version;
    }
    if (step && d) d += `H${X(tmax).toFixed(1)}`;
    s += `<path class="ln-${key}" d="${d}"/>`;
    for (const p of pts) if (p[key] !== null) s += `<circle class="pt-${key}" cx="${X(t(p)).toFixed(1)}" cy="${Y(p[key]).toFixed(1)}" r="4"><title>${esc(`${fmtDate(p.date)} · ${key === 'open' ? 'abierto' : 'cerrado'}: ${p[key]} (${p[key + 'Name'] || ''})`)}</title></circle>`;
  }
  s += '</svg><div class="legend"><span><i style="background:var(--open)"></i>Mejor con pesos abiertos</span><span><i style="background:var(--closed)"></i>Mejor cerrado</span></div>';
  el.innerHTML = s;
  return true;
}

/* Distancias en puntos ECI a lo largo del tiempo (EE. UU. − China y cerrados − abiertos). Sin conversión a meses. */
export function gaps(el, points) {
  const pts = (points || []).filter(p => p.usCn !== null || p.closedOpen !== null);
  if (pts.length < 2) { el.innerHTML = '<div class="chart-empty">Sin datos suficientes para la serie.</div>'; return false; }
  const W = 860, H = 280, L = 48, R = 16, T = 14, B = 40;
  const t = p => new Date(p.d + 'T00:00:00Z').getTime();
  const tmin = t(pts[0]), tmax = t(pts[pts.length - 1]);
  const vals = pts.flatMap(p => [p.usCn, p.closedOpen]).filter(v => v !== null);
  const ymin = Math.min(0, Math.floor(Math.min(...vals) / 5) * 5), ymax = Math.ceil((Math.max(...vals) + 1) / 5) * 5;
  const X = v => L + (v - tmin) / (tmax - tmin || 1) * (W - L - R);
  const Y = v => T + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distancia en puntos ECI entre EE. UU. y China y entre modelos cerrados y abiertos">`;
  s += '<g class="grid">';
  for (const v of niceTicks(ymin, ymax)) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/>`;
  s += '</g><g class="axis">';
  for (const v of niceTicks(ymin, ymax)) s += `<text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${num(v, 0)}</text>`;
  for (const tk of monthTicks(tmin, tmax)) {
    const x = X(tk);
    const anchor = x < L + 30 ? 'start' : x > W - R - 30 ? 'end' : 'middle';
    s += `<text x="${x.toFixed(1)}" y="${H - B + 18}" text-anchor="${anchor}">${esc(new Date(tk).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' }))}</text>`;
  }
  s += `<text class="lbl" x="12" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">puntos ECI</text>`;
  s += '</g>';
  if (ymin < 0) s += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor" opacity=".5"/>`;
  for (const [key, cls, name] of [['usCn', 'ln-uscn', 'EE. UU. − China'], ['closedOpen', 'ln-co', 'Cerrados − abiertos']]) {
    let d = '', pen = false;
    for (const p of pts) {
      if (p[key] === null) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${X(t(p)).toFixed(1)},${Y(p[key]).toFixed(1)} `;
      pen = true;
    }
    s += `<path class="${cls}" d="${d}"/>`;
    for (const p of pts) if (p[key] !== null) s += `<circle class="pt-${cls}" cx="${X(t(p)).toFixed(1)}" cy="${Y(p[key]).toFixed(1)}" r="3"><title>${esc(`${fmtDate(p.d)} · ${name}: ${num(p[key], 1)} puntos`)}</title></circle>`;
  }
  s += '</svg><div class="legend"><span><i style="background:var(--orange)"></i>EE. UU. − China</span><span><i style="background:var(--ink)"></i>Cerrados − abiertos</span></div>';
  el.innerHTML = s;
  return true;
}
