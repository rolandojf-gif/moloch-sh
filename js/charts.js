/* Gráficos SVG sin dependencias. Todos comparten una ventana emergente que aparece al instante
   sobre el elemento más cercano al cursor (o al dedo) y etiquetas fijas para los puntos que importan. */
import { esc, usd, num, fmtDate } from './fmt.js';

/* ── Ventana emergente ──────────────────────────────────────────────────── */
let tipEl = null, hot = null;
function tipBox() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    // En pantallas táctiles la ventana se queda hasta tocar fuera de un gráfico o desplazar la página.
    document.addEventListener('pointerdown', e => { if (!e.target.closest?.('.chart svg')) hideTip(); });
    addEventListener('scroll', hideTip, { passive: true });
  }
  return tipEl;
}
function hideTip() { if (tipEl) tipEl.hidden = true; hot?.classList.remove('hot'); hot = null; }

/* Contenido al estilo de Epoch: título y filas «etiqueta · valor» en texto; las filas sin valor se omiten. */
export function tip(title, rows, foot = '') {
  const body = rows.filter(r => r && r[1] !== null && r[1] !== undefined && r[1] !== '')
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(String(v))}</td></tr>`).join('');
  return `<div class="tt-title">${esc(title)}</div>${body ? `<table>${body}</table>` : ''}${foot ? `<div class="tt-foot">${esc(foot)}</div>` : ''}`;
}

function placeTip(e) {
  const t = tipBox(), pad = 16, r = t.getBoundingClientRect();
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + r.width > innerWidth - 8) x = Math.max(8, e.clientX - pad - r.width);
  if (y + r.height > innerHeight - 8) y = Math.max(8, e.clientY - pad - r.height);
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

/* targets: [{ x, y, html, box?, go? }] en unidades del viewBox. box = [x0, y0, x1, y1] para barras y columnas;
   si no, gana el punto más cercano dentro de un radio. El nodo con data-k="i" se resalta; go() se ejecuta al pulsar. */
function interact(el, targets, radius = 28) {
  const svg = el.querySelector('svg');
  if (!svg || !targets.length) return;
  const pick = e => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const lim = (radius / (ctm.a || 1)) ** 2;
    let best = null, bd = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t.box) {
        if (p.x >= t.box[0] && p.x <= t.box[2] && p.y >= t.box[1] && p.y <= t.box[3]) return i;
        continue;
      }
      const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
      if (d < bd && d <= lim) { bd = d; best = i; }
    }
    return best;
  };
  const show = e => {
    const i = pick(e);
    if (i === null) { hideTip(); return; }
    const t = tipBox(), key = `${el.id}:${i}`;
    if (t.dataset.k !== key) { t.innerHTML = targets[i].html; t.dataset.k = key; }
    t.hidden = false;
    const node = svg.querySelector(`[data-k="${i}"]`);
    if (node !== hot) { hot?.classList.remove('hot'); hot = node; hot?.classList.add('hot'); }
    placeTip(e);
    svg.style.cursor = targets[i].go ? 'pointer' : '';
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hideTip(); });
  svg.addEventListener('click', e => { const i = pick(e); if (i !== null && targets[i].go) { hideTip(); targets[i].go(); } });
}

/* ── Etiquetas fijas sin solapes ────────────────────────────────────────── */
const CH = 6.9;   // ancho aproximado de un carácter de la etiqueta (JetBrains Mono 11,5 px) en unidades del viewBox
/* cands: [{ x, y, text, prefer?: 'up'|'down' }] por orden de prioridad. Devuelve las que caben sin pisarse. */
function placeLabels(cands, { W, T, H, B, L, R }, taken = []) {
  const out = [], boxes = taken.slice();
  const hit = b => boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  for (const c of cands) {
    const w = c.text.length * CH, h = 13;
    const near = c.prefer === 'down'
      ? [['start', 9, 16], ['end', -9, 16], ['start', 9, -8], ['end', -9, -8]]
      : [['start', 9, -8], ['end', -9, -8], ['start', 9, 16], ['end', -9, 16]];
    const tries = c.far ? near.concat([['middle', 0, 30], ['middle', 0, -20], ['start', 9, 30], ['end', -9, 30], ['start', 9, -22], ['end', -9, -22]]) : near;
    for (const [anchor, dx, dy] of tries) {
      const x = c.x + dx, y = c.y + dy;
      const box = anchor === 'start' ? [x, y - h + 2, x + w, y + 3] : anchor === 'end' ? [x - w, y - h + 2, x, y + 3] : [x - w / 2, y - h + 2, x + w / 2, y + 3];
      if (box[0] < L || box[2] > W - R + 4 || box[1] < T - 4 || box[3] > H - B) continue;
      if (c.minY != null && (box[1] < c.minY || box[3] > c.maxY)) continue;
      if (hit(box)) continue;
      boxes.push(box);
      out.push({ ...c, lx: x, ly: y, anchor });
      break;
    }
  }
  return out;
}
const labelSvg = ls => ls.map(l => `<text class="ptlabel" x="${l.lx.toFixed(1)}" y="${l.ly.toFixed(1)}" text-anchor="${l.anchor}">${esc(l.text)}</text>`).join('');

/* ── Ejes ───────────────────────────────────────────────────────────────── */
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
const ms = d => new Date(d + 'T00:00:00Z').getTime();
const monthLabel = tk => new Date(tk).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function timeAxis(X, tmin, tmax, { W, H, B, L, R }) {
  let s = '';
  for (const tk of monthTicks(tmin, tmax)) {
    const x = X(tk);
    const anchor = x < L + 30 ? 'start' : x > W - R - 30 ? 'end' : 'middle';
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${H - B}" y2="${H - B + 5}"/><text x="${x.toFixed(1)}" y="${H - B + 18}" text-anchor="${anchor}">${esc(monthLabel(tk))}</text>`;
  }
  return s;
}
function yAxis(ticks, Y, { W, L, R, T, H, B }, fmt = v => num(v, 0), label = '') {
  let s = '<g class="grid">';
  for (const v of ticks) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`;
  s += '</g><g class="axis">';
  for (const v of ticks) s += `<text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${esc(fmt(v))}</text>`;
  if (label) s += `<text class="lbl" x="12" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">${esc(label)}</text>`;
  return s;
}

/* ── Capacidad frente a precio (Hoy) ────────────────────────────────────── */
/* points: [{ id, x, y, cls, label, tip }]. Etiquetas fijas: las pedidas y los modelos que nadie mejora a la vez en índice y precio. */
export function scatter(el, points, { threshold = null, labels = new Set(), yLabel = 'Índice' } = {}) {
  if (!points.length) { el.innerHTML = '<div class="chart-empty">No hay modelos con índice y precio a la vez.</div>'; return; }
  const G = { W: 860, H: 400, L: 52, R: 16, T: 16, B: 44 };
  const { W, H, L, R, T, B } = G;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xmin = Math.min(...xs) / 1.4, xmax = Math.max(...xs) * 1.4;
  const ymin = Math.max(0, Math.floor((Math.min(...ys) - 5) / 5) * 5), ymax = Math.ceil((Math.max(...ys) + 3) / 5) * 5;
  const X = v => L + (Math.log10(v) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin)) * (W - L - R);
  const Y = v => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)} frente a precio combinado por millón de tokens">`;
  s += yAxis(niceTicks(ymin, ymax), Y, G, v => num(v, 0), yLabel);
  for (const t of niceLogTicks(xmin, xmax)) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${H - B}" y2="${H - B + 5}"/><text x="${X(t)}" y="${H - B + 18}" text-anchor="middle">${esc(usd(t))}</text>`;
  s += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">Precio combinado por millón de tokens (escala logarítmica)</text></g>`;
  const taken = [];
  if (threshold !== null && threshold > ymin && threshold < ymax) {
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(threshold)}" y2="${Y(threshold)}" stroke="currentColor" stroke-dasharray="5 4" opacity=".55"/>`;
    s += `<text class="lbl" x="${W - R}" y="${Y(threshold) - 6}" text-anchor="end">umbral ${num(threshold, 0)}</text>`;
    taken.push([W - R - 70, Y(threshold) - 18, W - R, Y(threshold) - 2]);
  }
  // Frontera de eficiencia: de más barato a más caro, cada modelo que supera el índice de todos los más baratos.
  const pareto = new Set();
  let best = -Infinity;
  for (const p of points.slice().sort((a, b) => a.x - b.x || b.y - a.y)) if (p.y > best) { pareto.add(p.id); best = p.y; }
  const ord = points.map((p, i) => [p, i]).sort((a, b) => (pareto.has(a[0].id) ? 1 : 0) - (pareto.has(b[0].id) ? 1 : 0));
  const targets = [];
  for (const [p, i] of ord) {
    s += `<circle data-k="${i}" class="pt-${p.cls}${pareto.has(p.id) || labels.has(p.id) ? ' key' : ' faint'}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="6"/>`;
  }
  points.forEach(p => targets.push({ x: X(p.x), y: Y(p.y), html: p.tip || tip(p.label, []) }));
  const cands = points.filter(p => labels.has(p.id)).sort((a, b) => b.y - a.y)
    .concat(points.filter(p => pareto.has(p.id) && !labels.has(p.id)).sort((a, b) => b.y - a.y))
    .map(p => ({ x: X(p.x), y: Y(p.y), text: p.label }));
  s += labelSvg(placeLabels(cands.slice(0, 12), G, taken));
  s += '</svg>';
  s += '<div class="legend"><span><i style="background:var(--open)"></i>Pesos abiertos</span><span><i style="background:var(--closed)"></i>Cerrado</span><span><i class="lg-key"></i>Con nombre: líderes y modelos que ninguno supera a la vez en índice y precio</span></div>';
  el.innerHTML = s;
  interact(el, targets);
}

/* ── Evolución de la frontera abierta y cerrada (Modelos) ───────────────── */
/* records: [{ date, open: {v, name} | null, closed: {v, name} | null }] con el máximo acumulado de cada grupo.
   models: todos los modelos puntuados [{ d, v, g: 'o'|'c', n, org, lo, hi, rec }]; sin ellos sólo se dibujan los récords. */
export function frontier(el, records, { models = null, yLabel = '' } = {}) {
  const G = { W: 860, H: 360, L: 52, R: 16, T: 16, B: 40 };
  const { W, H, L, R, T, B } = G;
  const rec = { open: [], closed: [] };
  for (const g of ['open', 'closed']) {
    let prev = null;
    for (const p of records) {
      const x = p[g];
      if (x && (!prev || x.v !== prev.v || x.name !== prev.name)) { rec[g].push({ d: p.date, v: x.v, n: x.name, jump: prev ? x.v - prev.v : 0 }); prev = x; }
    }
  }
  if (rec.open.length + rec.closed.length < 2) return false;
  const all = (models && models.length ? models : [...rec.open.map(r => ({ ...r, g: 'o', rec: true })), ...rec.closed.map(r => ({ ...r, g: 'c', rec: true }))]);
  const first = Math.min(...[...rec.open, ...rec.closed].map(r => ms(r.d)));
  const pts = all.filter(m => m.d && ms(m.d) >= first);
  const tmin = first, tmax = Math.max(...pts.map(m => ms(m.d)));
  const vals = pts.map(m => m.v);
  const ymin = Math.max(0, Math.floor((Math.min(...vals) - 3) / 5) * 5), ymax = Math.ceil((Math.max(...vals) + 3) / 5) * 5;
  const X = v => L + (v - tmin) / (tmax - tmin || 1) * (W - L - R);
  const Y = v => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del mejor modelo abierto y del mejor cerrado">`;
  s += yAxis(niceTicks(ymin, ymax), Y, G, v => num(v, 0), yLabel) + timeAxis(X, tmin, tmax, G) + '</g>';
  for (const g of ['open', 'closed']) {
    const r = rec[g];
    if (!r.length) continue;
    let d = `M${X(ms(r[0].d)).toFixed(1)},${Y(r[0].v).toFixed(1)}`;
    for (const p of r.slice(1)) d += ` H${X(ms(p.d)).toFixed(1)} V${Y(p.v).toFixed(1)}`;
    s += `<path class="ln-${g}" d="${d} H${X(tmax).toFixed(1)}"/>`;
  }
  const grp = g => g === 'o' ? 'open' : 'closed';
  const ordered = pts.map((m, i) => [m, i]).sort((a, b) => (a[0].rec ? 1 : 0) - (b[0].rec ? 1 : 0));
  for (const [m, i] of ordered) s += `<circle data-k="${i}" class="pt-${grp(m.g)} ${m.rec ? 'key' : 'faint'}" cx="${X(ms(m.d)).toFixed(1)}" cy="${Y(m.v).toFixed(1)}" r="${m.rec ? 5 : 4}"/>`;
  const targets = pts.map(m => ({
    x: X(ms(m.d)), y: Y(m.v),
    html: tip(m.n, [
      ['Fecha de lanzamiento', fmtDate(m.d)],
      ['ECI', m.lo != null && m.hi != null ? `${num(m.v, 1)} (intervalo ${num(m.lo, 1)}–${num(m.hi, 1)})` : num(m.v, 1)],
      ['Pesos', m.g === 'o' ? 'abiertos' : 'cerrados'],
      ['Organización', m.org || null],
      ['Nuevo récord', m.rec ? `sí, mejor ${m.g === 'o' ? 'abierto' : 'cerrado'} hasta esa fecha` : 'no']
    ])
  }));
  // Etiquetas fijas: el líder actual de cada grupo y los saltos más grandes, sin pisarse.
  const leaders = [], jumps = [];
  for (const g of ['closed', 'open']) {
    const r = rec[g], prefer = g === 'closed' ? 'up' : 'down';
    if (!r.length) continue;
    const lab = p => ({ x: X(ms(p.d)), y: Y(p.v), text: p.n, prefer, jump: p.jump });
    leaders.push(lab(r[r.length - 1]));
    jumps.push(...r.slice(0, -1).sort((a, b) => b.jump - a.jump).slice(0, 6).map(lab));
  }
  s += labelSvg(placeLabels([...leaders, ...jumps.sort((a, b) => b.jump - a.jump)], G));
  s += '</svg><div class="legend"><span><i style="background:var(--open)"></i>Mejor con pesos abiertos</span><span><i style="background:var(--closed)"></i>Mejor cerrado</span>';
  s += models ? '<span><i class="lg-faint"></i>Resto de modelos puntuados</span></div>' : '</div>';
  el.innerHTML = s;
  interact(el, targets, 22);
  return true;
}

/* ── Distancias en puntos ECI a lo largo del tiempo (La carrera) ────────── */
export function gaps(el, points) {
  const pts = (points || []).filter(p => p.usCn !== null || p.closedOpen !== null);
  if (pts.length < 2) { el.innerHTML = '<div class="chart-empty">Sin datos suficientes para la serie.</div>'; return false; }
  const G = { W: 860, H: 290, L: 52, R: 185, T: 16, B: 40 };
  const { W, H, L, R, T, B } = G;
  const tmin = ms(pts[0].d), tmax = ms(pts[pts.length - 1].d);
  const vals = pts.flatMap(p => [p.usCn, p.closedOpen]).filter(v => v !== null);
  const ymin = Math.min(0, Math.floor(Math.min(...vals) / 5) * 5), ymax = Math.ceil((Math.max(...vals) + 1) / 5) * 5;
  const X = v => L + (v - tmin) / (tmax - tmin || 1) * (W - L - R);
  const Y = v => T + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distancia en puntos ECI entre EE. UU. y China y entre modelos cerrados y abiertos">`;
  s += yAxis(niceTicks(ymin, ymax), Y, G, v => num(v, 0), 'puntos ECI') + timeAxis(X, tmin, tmax, G) + '</g>';
  if (ymin < 0) s += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor" opacity=".5"/>`;
  const SER = [['usCn', 'ln-uscn', 'EE. UU. − China'], ['closedOpen', 'ln-co', 'Cerrados − abiertos']];
  for (const [key, cls] of SER) {
    let d = '', pen = false;
    for (const p of pts) {
      if (p[key] === null) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${X(ms(p.d)).toFixed(1)},${Y(p[key]).toFixed(1)} `;
      pen = true;
    }
    s += `<path class="${cls}" d="${d}"/>`;
  }
  // Un grupo por mes con los dos puntos: se resaltan juntos y la ventana da las dos distancias.
  const step = (W - L - R) / Math.max(1, pts.length - 1);
  const targets = pts.map((p, i) => {
    const x = X(ms(p.d));
    s += `<g data-k="${i}">${SER.map(([key, cls]) => p[key] === null ? '' : `<circle class="pt-${cls}" cx="${x.toFixed(1)}" cy="${Y(p[key]).toFixed(1)}" r="3"/>`).join('')}</g>`;
    return { box: [x - step / 2, T, x + step / 2, H - B], html: tip(fmtDate(p.d), SER.map(([key, , name]) => [name, p[key] === null ? 'sin datos' : `${num(p[key], 1)} puntos`]), 'Mejor modelo de cada lado hasta esa fecha. No equivale a meses de retraso.') };
  });
  // Valor actual fijo al final de cada línea.
  const last = pts[pts.length - 1];
  const ends = SER.filter(([key]) => last[key] !== null).map(([key, , name]) => ({ x: X(tmax), y: Y(last[key]), text: `${name}: ${num(last[key], 1)}` }));
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 14) ends[ends[0].y < ends[1].y ? 0 : 1].y -= 7, ends[ends[0].y < ends[1].y ? 1 : 0].y += 7;
  s += ends.map(e => `<text class="ptlabel" x="${(e.x + 8).toFixed(1)}" y="${(e.y + 4).toFixed(1)}">${esc(e.text)}</text>`).join('');
  s += '</svg><div class="legend"><span><i style="background:var(--orange)"></i>EE. UU. − China</span><span><i style="background:var(--ink)"></i>Cerrados − abiertos</span></div>';
  el.innerHTML = s;
  interact(el, targets);
  return true;
}

/* Ancho del viewBox igual al del contenedor, para que el texto se vea a su tamaño real en columnas estrechas. */
const fitWidth = el => Math.round(Math.min(1200, Math.max(520, el.clientWidth || 860)));

/* ── Barras horizontales ────────────────────────────────────────────────── */
/* rows: [{ label, v, cls?, tip, value? }]; ref: { v, label } dibuja una línea de referencia (p. ej. saturación al 90 %). */
export function hbars(el, rows, { fmt = v => num(v, 0), max = null, ref = null, aria = '' } = {}) {
  if (!rows.length) { el.innerHTML = '<div class="chart-empty">Sin datos.</div>'; return false; }
  const W = fitWidth(el), rowH = 26, G = { W, L: Math.min(250, Math.round(W * 0.3)), R: Math.min(120, Math.round(W * 0.16)), T: ref ? 22 : 6, B: 8 };
  const H = G.T + rows.length * rowH + G.B;
  const top = max ?? Math.max(...rows.map(r => r.v), ref?.v ?? 0);
  const X = v => G.L + Math.max(0, v) / (top || 1) * (G.W - G.L - G.R);
  let s = `<svg viewBox="0 0 ${G.W} ${H}" role="img" aria-label="${esc(aria)}">`;
  const targets = rows.map((r, i) => {
    const y = G.T + i * rowH;
    const max = Math.floor((G.L - 14) / 7);
    const label = r.label.length > max ? r.label.slice(0, max - 1) + '…' : r.label;
    s += `<g data-k="${i}" class="bar ${r.cls || ''}"><rect class="bar-bg" x="0" y="${y}" width="${G.W}" height="${rowH}"/>`;
    s += `<text class="bar-l" x="${G.L - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(label)}</text>`;
    s += `<rect class="bar-v" x="${G.L}" y="${y + 5}" width="${Math.max(1.5, X(r.v) - G.L).toFixed(1)}" height="${rowH - 10}"/>`;
    s += `<text class="bar-n" x="${(X(r.v) + 8).toFixed(1)}" y="${y + rowH / 2 + 4}">${esc(r.value ?? fmt(r.v))}</text></g>`;
    return { box: [0, y, G.W, y + rowH], html: r.tip || tip(r.label, [['Valor', r.value ?? fmt(r.v)]]) };
  });
  if (ref) {
    s += `<line class="ref" x1="${X(ref.v)}" x2="${X(ref.v)}" y1="${G.T - 6}" y2="${H - G.B}"/>`;
    s += `<text class="lbl" x="${X(ref.v)}" y="${G.T - 10}" text-anchor="middle">${esc(ref.label)}</text>`;
  }
  s += '</svg>';
  el.innerHTML = s;
  interact(el, targets);
  return true;
}

/* ── Columnas por periodo ───────────────────────────────────────────────── */
/* rows: [{ label, v, tip, cls? }] en orden temporal; se rotula una de cada «every» columnas. */
export function columns(el, rows, { fmt = v => num(v, 0), yLabel = '', every = 1, aria = '' } = {}) {
  if (!rows.length) { el.innerHTML = '<div class="chart-empty">Sin datos.</div>'; return false; }
  const G = { W: fitWidth(el), H: 260, L: 64, R: 12, T: 14, B: 40 };
  const { W, H, L, R, T, B } = G;
  const top = Math.max(...rows.map(r => r.v));
  const tk = niceTicks(0, top * 1.05);
  const ymax = tk[tk.length - 1];
  const Y = v => T + (1 - v / (ymax || 1)) * (H - T - B);
  const bw = (W - L - R) / rows.length;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">`;
  s += yAxis(tk, Y, G, fmt, yLabel);
  rows.forEach((r, i) => {
    if (i % every === 0) s += `<text x="${(L + (i + 0.5) * bw).toFixed(1)}" y="${H - B + 18}" text-anchor="middle">${esc(r.label)}</text>`;
  });
  s += '</g>';
  const targets = rows.map((r, i) => {
    const x = L + i * bw;
    s += `<rect data-k="${i}" class="col ${r.cls || ''}" x="${(x + bw * 0.15).toFixed(1)}" y="${Y(r.v).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${(Y(0) - Y(r.v)).toFixed(1)}"/>`;
    return { box: [x, T, x + bw, H - B], html: r.tip || tip(r.label, [['Valor', fmt(r.v)]]) };
  });
  s += '</svg>';
  el.innerHTML = s;
  interact(el, targets);
  return true;
}

/* ── Puntos con intervalo (laboratorios) ────────────────────────────────── */
/* rows: [{ label, v, lo, hi, tip }]. Muestra si los intervalos se solapan. */
export function dotci(el, rows, { aria = '', unit = '' } = {}) {
  if (!rows.length) { el.innerHTML = '<div class="chart-empty">Sin datos.</div>'; return false; }
  const W = fitWidth(el), rowH = 30, G = { W, L: Math.min(250, Math.round(W * 0.3)), R: 40, T: 8, B: 34 };
  const H = G.T + rows.length * rowH + G.B;
  const lo = Math.floor(Math.min(...rows.map(r => r.lo ?? r.v)) - 1), hi = Math.ceil(Math.max(...rows.map(r => r.hi ?? r.v)) + 1);
  const X = v => G.L + (v - lo) / (hi - lo || 1) * (G.W - G.L - G.R);
  let s = `<svg viewBox="0 0 ${G.W} ${H}" role="img" aria-label="${esc(aria)}"><g class="grid">`;
  const tk = niceTicks(lo, hi, 6);
  for (const v of tk) s += `<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${G.T}" y2="${H - G.B}"/>`;
  s += '</g><g class="axis">';
  for (const v of tk) s += `<text x="${X(v).toFixed(1)}" y="${H - G.B + 16}" text-anchor="middle">${esc(num(v, 0))}</text>`;
  s += `<text x="${(G.L + G.W - G.R) / 2}" y="${H - 4}" text-anchor="middle">${esc(unit)}</text></g>`;
  const targets = rows.map((r, i) => {
    const y = G.T + i * rowH + rowH / 2;
    s += `<g data-k="${i}" class="ci-row"><rect class="bar-bg" x="0" y="${y - rowH / 2}" width="${G.W}" height="${rowH}"/>`;
    const max = Math.floor((G.L - 14) / 7);
    s += `<text class="bar-l" x="${G.L - 10}" y="${y + 4}" text-anchor="end">${esc(r.label.length > max ? r.label.slice(0, max - 1) + '…' : r.label)}</text>`;
    if (r.lo != null && r.hi != null) s += `<line class="ci" x1="${X(r.lo).toFixed(1)}" x2="${X(r.hi).toFixed(1)}" y1="${y}" y2="${y}"/>`;
    s += `<circle class="ci-dot" cx="${X(r.v).toFixed(1)}" cy="${y}" r="5.5"/></g>`;
    return { box: [0, y - rowH / 2, G.W, y + rowH / 2], html: r.tip };
  });
  s += '</svg>';
  el.innerHTML = s;
  interact(el, targets);
  return true;
}

/* ── Calendario de hitos (AI 2027) ──────────────────────────────────────── */
/* lanes: [{ id, title }]; items: [{ lane, date, cls, short, tip, go }]; today: 'AAAA-MM-DD'. */
export function hitoTimeline(el, lanes, items, { today, from, to } = {}) {
  const laneH = 86, G = { W: 860, L: 165, R: 16, T: 26, B: 34 };
  const H = G.T + lanes.length * laneH + G.B;
  const tmin = ms(from), tmax = ms(to);
  const X = v => G.L + (v - tmin) / (tmax - tmin) * (G.W - G.L - G.R);
  let s = `<svg viewBox="0 0 ${G.W} ${H}" role="img" aria-label="Calendario de los hitos de AI 2027 y fecha de hoy">`;
  s += `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-ln"/></pattern></defs>`;
  s += '<g class="axis">';
  for (const tk of monthTicks(tmin, tmax)) {
    const x = X(tk);
    s += `<line class="tl-grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${G.T}" y2="${H - G.B}"/><text x="${x.toFixed(1)}" y="${H - G.B + 18}" text-anchor="middle">${esc(monthLabel(tk))}</text>`;
  }
  s += '</g>';
  lanes.forEach((l, i) => {
    const y = G.T + i * laneH;
    s += `<rect class="lane ${i % 2 ? 'odd' : ''}" x="0" y="${y}" width="${G.W}" height="${laneH}"/>`;
    // Título del carril en dos líneas como mucho.
    const lines = [''];
    for (const w of l.title.split(' ')) {
      const cur = lines[lines.length - 1];
      if (cur && (cur + ' ' + w).length > 19) lines.push(w); else lines[lines.length - 1] = cur ? `${cur} ${w}` : w;
    }
    const shown = lines.slice(0, 2);
    if (lines.length > 2) shown[1] += '…';
    s += `<text class="lane-t" x="8" y="${y + laneH / 2 + 4 - (shown.length - 1) * 7}">${shown.map((t, k) => `<tspan x="8" dy="${k ? 14 : 0}">${esc(t)}</tspan>`).join('')}</text>`;
  });
  // Pasado sombreado y línea de hoy.
  const xt = X(ms(today));
  s += `<rect class="past" x="${G.L}" y="${G.T}" width="${(xt - G.L).toFixed(1)}" height="${lanes.length * laneH}"/>`;
  s += `<line class="today" x1="${xt.toFixed(1)}" x2="${xt.toFixed(1)}" y1="${G.T - 14}" y2="${H - G.B}"/><text class="today-t" x="${xt.toFixed(1)}" y="${G.T - 16}" text-anchor="middle">hoy, ${esc(fmtDate(today))}</text>`;
  // Hitos de una misma línea y fecha se reparten en horizontal alrededor de su fecha.
  const group = new Map(), seen = new Map();
  let dots = '';
  for (const it of items) { const key = `${it.lane}|${it.date}`; group.set(key, (group.get(key) || 0) + 1); }
  const targets = items.map((it, i) => {
    const li = lanes.findIndex(l => l.id === it.lane);
    const key = `${it.lane}|${it.date}`, k = seen.get(key) || 0, n = group.get(key);
    seen.set(key, k + 1);
    const x = X(ms(it.date)) + (k - (n - 1) / 2) * 20, y = G.T + li * laneH + laneH / 2;
    dots += `<g data-k="${i}" class="hito-pt ${it.cls}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"/></g>`;
    return { x, y, html: it.tip, go: it.go, short: it.short, li };
  });
  // Etiquetas: el nombre corto junto a cada punto, dentro de su carril, con una guía hasta su punto.
  const cands = targets.map(t => ({ x: t.x, y: t.y + 6, px: t.x, py: t.y, text: t.short, prefer: 'down', far: true, minY: G.T + t.li * laneH + 2, maxY: G.T + (t.li + 1) * laneH - 2 }));
  const placed = placeLabels(cands, { W: G.W, T: G.T, H, B: G.B, L: G.L, R: G.R }, targets.map(t => [t.x - 9, t.y - 9, t.x + 9, t.y + 9]));
  for (const l of placed) {
    const w = l.text.length * CH, x0 = l.anchor === 'start' ? l.lx : l.anchor === 'end' ? l.lx - w : l.lx - w / 2;
    const ex = Math.min(Math.max(l.px, x0), x0 + w), ey = l.ly < l.py ? l.ly + 3 : l.ly - 11;
    s += `<line class="leader" x1="${l.px.toFixed(1)}" y1="${l.py.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/>`;
  }
  s += dots + labelSvg(placed);
  s += '</svg>';
  el.innerHTML = s;
  interact(el, targets, 20);
  return true;
}

/* ── Récords a lo largo del tiempo (p. ej. SWE-bench Verified) ──────────── */
/* pts: [{ d, v, n, rec }] por fecha; ref: { v, label }. Línea escalonada de récords, resto de puntos en claro. */
export function recordChart(el, pts, { yLabel = '', fmt = v => num(v, 0), ref = null, unit = '' } = {}) {
  if (!pts || pts.length < 2) { el.innerHTML = '<div class="chart-empty">Sin datos suficientes para la serie.</div>'; return false; }
  const G = { W: 860, H: 320, L: 52, R: 16, T: 18, B: 40 };
  const { W, H, L, R, T, B } = G;
  const tmin = ms(pts[0].d), tmax = Math.max(ms(pts[pts.length - 1].d), Date.now());
  const vals = pts.map(p => p.v).concat(ref ? [ref.v] : []);
  const ymin = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10), ymax = Math.min(100, Math.ceil((Math.max(...vals) + 3) / 10) * 10);
  const X = v => L + (v - tmin) / (tmax - tmin || 1) * (W - L - R);
  const Y = v => T + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)} a lo largo del tiempo">`;
  s += yAxis(niceTicks(ymin, ymax), Y, G, fmt, yLabel) + timeAxis(X, tmin, tmax, G) + '</g>';
  const taken = [];
  if (ref) {
    s += `<line class="ref" x1="${L}" x2="${W - R}" y1="${Y(ref.v).toFixed(1)}" y2="${Y(ref.v).toFixed(1)}"/>`;
    s += `<text class="ref-t" x="${L + 6}" y="${(Y(ref.v) - 6).toFixed(1)}">${esc(ref.label)}</text>`;
    taken.push([L, Y(ref.v) - 18, L + 6 + ref.label.length * CH, Y(ref.v) - 2]);
  }
  const rec = pts.filter(p => p.rec);
  let d = `M${X(ms(rec[0].d)).toFixed(1)},${Y(rec[0].v).toFixed(1)}`;
  for (const p of rec.slice(1)) d += ` H${X(ms(p.d)).toFixed(1)} V${Y(p.v).toFixed(1)}`;
  s += `<path class="ln-closed" d="${d} H${X(tmax).toFixed(1)}"/>`;
  const ord = pts.map((p, i) => [p, i]).sort((a, b) => (a[0].rec ? 1 : 0) - (b[0].rec ? 1 : 0));
  for (const [p, i] of ord) s += `<circle data-k="${i}" class="pt-closed ${p.rec ? 'key' : 'faint'}" cx="${X(ms(p.d)).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${p.rec ? 5 : 4}"/>`;
  const targets = pts.map(p => ({ x: X(ms(p.d)), y: Y(p.v), html: tip(p.n, [['Fecha de publicación', fmtDate(p.d)], ['Resultado', `${fmt(p.v)}${unit}`], ['Nuevo récord', p.rec ? 'sí' : 'no']]) }));
  const jumps = rec.map((p, i) => ({ p, jump: i ? p.v - rec[i - 1].v : 0 }));
  const cands = [jumps[jumps.length - 1], ...jumps.slice(0, -1).sort((a, b) => b.jump - a.jump).slice(0, 5)]
    .map(({ p }) => ({ x: X(ms(p.d)), y: Y(p.v), text: `${p.n} · ${fmt(p.v)}${unit}`, prefer: 'up' }));
  s += labelSvg(placeLabels(cands, G, taken));
  s += '</svg><div class="legend"><span><i style="background:var(--closed)"></i>Mejor resultado hasta esa fecha</span><span><i class="lg-faint"></i>Resto de modelos</span></div>';
  el.innerHTML = s;
  interact(el, targets, 22);
  return true;
}
