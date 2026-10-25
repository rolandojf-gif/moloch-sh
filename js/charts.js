/* Gráficos SVG sin dependencias. Todos comparten una ventana emergente que aparece al instante
   sobre el elemento más cercano al cursor (o al dedo) y etiquetas fijas para los puntos que importan. */
import { t, tn, tr } from './i18n.js';
import { esc, usd, num, fmtDate, dateFmt } from './fmt.js';

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
export function hideTip() { if (tipEl) tipEl.hidden = true; hot?.classList.remove('hot'); hot = null; }

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
const labelSvg = ls => ls.map(l => `<text class="ptlabel${l.faint ? ' faint' : ''}" x="${l.lx.toFixed(1)}" y="${l.ly.toFixed(1)}" text-anchor="${l.anchor}">${esc(l.text)}</text>`).join('');

/* ── Ejes ───────────────────────────────────────────────────────────────── */
/* Marcas de una escala logarítmica: 1 y 3 por década; si quedan menos de tres, más finas. */
function logTicks(min, max) {
  for (const ms of [[1, 3], [1, 2, 5], [1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9]]) {
    const out = [];
    for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
      for (const m of ms) { const v = m * 10 ** e; if (v >= min * 0.999 && v <= max * 1.001) out.push(v); }
    }
    if (out.length >= 3) return out;
  }
  return [min, max];
}

function niceTicks(min, max, n = 5) {
  const step = 10 ** Math.floor(Math.log10((max - min) / n || 1));
  const s = [1, 2, 5, 10].map(k => k * step).find(k => (max - min) / k <= n) || step * 10;
  const out = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) out.push(Math.round(v * 1000) / 1000);
  return out;
}
/* Marcas de tiempo en inicios de mes (paso de 1, 3, 6 o 12 meses), como mucho n + 1. */
function monthTicks(tmin, tmax, n = 6) {
  const a = new Date(tmin), months = (tmax - tmin) / (30.44 * 86400e3);
  const stepM = [1, 3, 6, 12, 24, 48].find(k => months / k <= n) || 48;
  let y = a.getUTCFullYear(), m = Math.ceil(a.getUTCMonth() / stepM) * stepM;
  if (a.getUTCDate() > 1 && m === a.getUTCMonth()) m += stepM;
  const out = [];
  for (let d = Date.UTC(y, m, 1); d <= tmax; m += stepM, d = Date.UTC(y, m, 1)) if (d >= tmin) out.push(d);
  return out;
}
const ms = d => new Date(d + 'T00:00:00Z').getTime();
const monthLabel = tk => dateFmt({ month: 'short', year: 'numeric' }).format(new Date(tk));

const tickCount = G => G.narrow ? Math.max(2, Math.floor((G.W - G.L - G.R) / 80)) : 6;
function timeAxis(X, tmin, tmax, G) {
  const { W, H, B, L, R } = G;
  let s = '';
  for (const tk of monthTicks(tmin, tmax, tickCount(G))) {
    const x = X(tk);
    const anchor = x < L + 30 ? 'start' : x > W - R - 30 ? 'end' : 'middle';
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${H - B}" y2="${H - B + 5}"/><text x="${x.toFixed(1)}" y="${H - B + 18}" text-anchor="${anchor}">${esc(monthLabel(tk))}</text>`;
  }
  return s;
}
function yAxis(ticks, Y, G, fmt = v => num(v, 0), label = '') {
  const { W, L, R, T, H, B } = G;
  let s = '<g class="grid">';
  for (const v of ticks) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`;
  s += '</g><g class="axis">';
  for (const v of ticks) s += `<text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${esc(fmt(v))}</text>`;
  // En estrecho, el rótulo va en horizontal encima del eje (sin el paréntesis y recortado si no cabe).
  if (label && G.narrow) s += `<text class="lbl" x="2" y="${T - 12}">${esc(fitText(G.yShort || label.replace(/\s*\([^)]*\)\s*$/, ''), Math.floor((W - 4) / 6.7)))}</text>`;
  else if (label) s += `<text class="lbl" x="12" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">${esc(label)}</text>`;
  return s;
}
const fitText = (t, n) => t.length > n ? t.slice(0, Math.max(1, n - 1)).trimEnd() + '…' : t;
/* Parte un texto en líneas de como mucho n caracteres, por los espacios. */
function wrap(t, n) {
  const out = [''];
  for (const w of t.split(' ')) { const c = out[out.length - 1]; if (c && (c + ' ' + w).length > n) out.push(w); else out[out.length - 1] = c ? `${c} ${w}` : w; }
  return out;
}

/* ── Zoom con la rueda y arrastre, como en los gráficos de Epoch ────────── */
/* full = { x0, x1, y0, y1 }: la ventana completa en unidades de datos (x en log10 si el eje es logarítmico).
   draw(view, zoomed) vuelve a pintar el gráfico entero para esa ventana. Con la vista completa, girar la rueda
   hacia abajo desplaza la página; doble clic o «Ver todo» vuelven a la vista completa. */
function zoomable(el, G, full, draw, { minX, minY }) {
  el._zoom?.abort();
  const ac = new AbortController(), on = { signal: ac.signal };
  el._zoom = ac;
  el.classList.add('zoomable');
  const { W, H, L, R, T, B } = G;
  let v = { ...full }, drag = null, queued = false;
  const isFull = () => v.x1 - v.x0 >= full.x1 - full.x0 - 1e-9 && v.y1 - v.y0 >= full.y1 - full.y0 - 1e-9;
  const render = () => { queued = false; hideTip(); draw(v, !isFull()); el.classList.toggle('zoomed', !isFull()); };
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };
  // Encaja un tramo [a, b] dentro de [lo, hi] sin cambiar su anchura (o lo deja completo si no cabe).
  const fit = (a, b, lo, hi) => b - a >= hi - lo ? [lo, hi] : a < lo ? [lo, lo + b - a] : b > hi ? [hi - (b - a), hi] : [a, b];
  const at = e => {
    const ctm = el.querySelector('svg')?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { fx: (p.x - L) / (W - L - R), fy: (p.y - T) / (H - T - B), k: ctm.a || 1 };
  };
  el.addEventListener('wheel', e => {
    const p = e.target.closest('svg') && at(e);
    if (!p || p.fx < 0 || p.fx > 1 || p.fy < 0 || p.fy > 1) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    if (dy > 0 && isFull()) return;
    e.preventDefault();
    const k = Math.exp(Math.max(-0.5, Math.min(0.5, dy * 0.0015)));
    const cx = v.x0 + p.fx * (v.x1 - v.x0), cy = v.y1 - p.fy * (v.y1 - v.y0);
    const sx = Math.min(full.x1 - full.x0, Math.max(minX, (v.x1 - v.x0) * k));
    const sy = Math.min(full.y1 - full.y0, Math.max(minY, (v.y1 - v.y0) * k));
    [v.x0, v.x1] = fit(cx - p.fx * sx, cx - p.fx * sx + sx, full.x0, full.x1);
    [v.y0, v.y1] = fit(cy - (1 - p.fy) * sy, cy - (1 - p.fy) * sy + sy, full.y0, full.y1);
    later();
  }, { ...on, passive: false });
  // Arrastrar mueve la ventana; sólo con ratón o lápiz, para no bloquear el desplazamiento táctil.
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.pointerType === 'touch' || isFull() || !e.target.closest('svg')) return;
    drag = { x: e.clientX, y: e.clientY, v: { ...v }, moved: false, id: e.pointerId };
  }, on);
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; el.setPointerCapture(e.pointerId); el.classList.add('panning'); }
    const p = at(e);
    if (!p) return;
    const ux = dx / p.k / (W - L - R) * (drag.v.x1 - drag.v.x0), uy = dy / p.k / (H - T - B) * (drag.v.y1 - drag.v.y0);
    [v.x0, v.x1] = fit(drag.v.x0 - ux, drag.v.x1 - ux, full.x0, full.x1);
    [v.y0, v.y1] = fit(drag.v.y0 + uy, drag.v.y1 + uy, full.y0, full.y1);
    later();
  }, on);
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) { el.classList.remove('panning'); el.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true }); }
    drag = null;
  };
  el.addEventListener('pointerup', end, on);
  el.addEventListener('pointercancel', end, on);
  const reset = () => { v = { ...full }; later(); };
  el.addEventListener('dblclick', e => { if (e.target.closest('svg') && !isFull()) { e.preventDefault(); reset(); } }, on);
  el.addEventListener('click', e => { if (e.target.closest('.zoom-reset')) reset(); }, on);
  render();
}
const zoomUi = zoomed => (zoomed ? `<button type="button" class="zoom-reset">${t('Ver todo')}</button>` : '')
  + `<span class="zoom-hint">${t('Rueda del ratón: acercar o alejar · arrastrar: mover · doble clic: ver todo')}</span>`;
const clip = (id, { W, H, L, R, T, B }) => `<clipPath id="clip-${id}"><rect x="${L}" y="${T - 8}" width="${W - L - R}" height="${H - T - B + 8}"/></clipPath>`;

/* ── Pantallas estrechas ────────────────────────────────────────────────── */
/* Con menos de 640 px de gráfico (el móvil, o una columna estrecha), el viewBox mide lo mismo que el gráfico en pantalla:
   el texto se lee a su tamaño real y nada queda fuera por la derecha. Se recortan los márgenes, el rótulo del eje Y pasa
   arriba y los valores finales de las series van a la leyenda. Los gráficos que ya se dibujan a su ancho real (barras,
   columnas) sólo cambian de disposición por debajo de 480 px, el teléfono. */
const isNarrow = (el, max = 640) => el.clientWidth > 0 && el.clientWidth < max;
function frame(el, wide, narrowH = wide.H, max = 640) {
  if (!isNarrow(el, max)) return wide;
  return { ...wide, W: Math.max(280, el.clientWidth), H: narrowH, L: Math.max(34, wide.L - 18), R: 12, T: wide.T + 16, narrow: true };
}

/* ── Capacidad frente a precio (Hoy) ────────────────────────────────────── */
/* points: [{ id, x, y, cls, label, tip }]. Etiquetas fijas: las pedidas y los modelos que nadie mejora a la vez en índice y precio;
   al acercarse, también el resto de modelos visibles que quepan. */
export function scatter(el, points, { threshold = null, labels = new Set(), yLabel = t('Índice') } = {}) {
  if (!points.length) { el.innerHTML = `<div class="chart-empty">${t('No hay modelos con índice y precio a la vez.')}</div>`; return; }
  watchWidth(el, () => scatter(el, points, { threshold, labels, yLabel }));
  const G = frame(el, { W: 860, H: 400, L: 52, R: 16, T: 16, B: 44 }, 340);
  const { W, H, L, R, T, B } = G;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const full = {
    x0: Math.log10(Math.min(...xs) / 1.4), x1: Math.log10(Math.max(...xs) * 1.4),
    y0: Math.max(0, Math.floor((Math.min(...ys) - 5) / 5) * 5), y1: Math.ceil((Math.max(...ys) + 3) / 5) * 5
  };
  // Frontera de eficiencia: de más barato a más caro, cada modelo que supera el índice de todos los más baratos.
  const pareto = new Set();
  let best = -Infinity;
  for (const p of points.slice().sort((a, b) => a.x - b.x || b.y - a.y)) if (p.y > best) { pareto.add(p.id); best = p.y; }
  const key = p => pareto.has(p.id) || labels.has(p.id);
  const draw = (v, zoomed) => {
    const X = val => L + (Math.log10(val) - v.x0) / (v.x1 - v.x0) * (W - L - R);
    const Y = val => T + (1 - (val - v.y0) / (v.y1 - v.y0)) * (H - T - B);
    const shown = points.filter(p => X(p.x) >= L - 3 && X(p.x) <= W - R + 3 && Y(p.y) >= T - 3 && Y(p.y) <= H - B + 3);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('{yLabel} frente a precio combinado por millón de tokens', { yLabel: esc(yLabel) })}">${clip(el.id, G)}`;
    s += yAxis(niceTicks(v.y0, v.y1), Y, G, val => num(val, 0), yLabel);
    // Marcas del precio separadas lo bastante para que no se pisen sus rótulos.
    let lastX = -Infinity;
    for (const t of logTicks(10 ** v.x0, 10 ** v.x1)) {
      if (X(t) - lastX < (G.narrow ? 50 : 0)) continue;
      lastX = X(t);
      s += `<line x1="${X(t)}" x2="${X(t)}" y1="${H - B}" y2="${H - B + 5}"/><text x="${X(t)}" y="${H - B + 18}" text-anchor="middle">${esc(usd(t))}</text>`;
    }
    s += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${G.narrow ? t('Precio por millón (escala log.)') : t('Precio combinado por millón de tokens (escala logarítmica)')}</text></g>`;
    const taken = [];
    if (threshold !== null && threshold > v.y0 && threshold < v.y1) {
      s += `<line x1="${L}" x2="${W - R}" y1="${Y(threshold)}" y2="${Y(threshold)}" stroke="currentColor" stroke-dasharray="5 4" opacity=".55"/>`;
      s += `<text class="lbl" x="${W - R}" y="${Y(threshold) - 6}" text-anchor="end">${t('umbral {num}', { num: num(threshold, 0) })}</text>`;
      taken.push([W - R - 70, Y(threshold) - 18, W - R, Y(threshold) - 2]);
    }
    s += `<g clip-path="url(#clip-${el.id})">`;
    const ord = shown.map((p, i) => [p, i]).sort((a, b) => (key(a[0]) ? 1 : 0) - (key(b[0]) ? 1 : 0));
    for (const [p, i] of ord) s += `<circle data-k="${i}" class="pt-${p.cls}${key(p) ? ' key' : ' faint'}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="6"/>`;
    s += '</g>';
    const targets = shown.map(p => ({ x: X(p.x), y: Y(p.y), html: p.tip || tip(p.label, []) }));
    const cands = shown.filter(p => labels.has(p.id)).sort((a, b) => b.y - a.y)
      .concat(shown.filter(p => pareto.has(p.id) && !labels.has(p.id)).sort((a, b) => b.y - a.y))
      .concat(zoomed ? shown.filter(p => !key(p)).sort((a, b) => b.y - a.y) : [])
      .map(p => ({ x: X(p.x), y: Y(p.y), text: p.label, faint: !key(p) }));
    s += labelSvg(placeLabels(cands.slice(0, zoomed ? 30 : 12), G, taken));
    s += '</svg>';
    s += `<div class="legend"><span><i style="background:var(--open)"></i>${t('Pesos abiertos')}</span><span><i style="background:var(--closed)"></i>${t('Cerrado')}</span><span><i class="lg-key"></i>${t('Con nombre: líderes y modelos que ninguno supera a la vez en índice y precio{p1}', { p1: zoomed ? t('; al acercar, también los demás que caben') : '' })}</span>${zoomUi(zoomed)}</div>`;
    el.innerHTML = s;
    interact(el, targets);
  };
  zoomable(el, G, full, draw, { minX: 0.3, minY: 4 });
}

/* ── Evolución de la frontera abierta y cerrada (Modelos) ───────────────── */
/* Tramos de cobertura incompleta (aaCoverage): rayado tenue detrás de las líneas, entre dos fechas, dentro del área del gráfico. */
const covPattern = id => `<defs><pattern id="cov-${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" class="cov-ln"/></pattern></defs>`;
function covBands(id, bands, X, G, t0, t1) {
  let s = '';
  for (const b of bands || []) {
    const a = Math.max(ms(b.from), t0), z = Math.min(ms(b.to), t1);
    if (z <= a) continue;
    s += `<rect class="cov-band" fill="url(#cov-${id})" x="${X(a).toFixed(1)}" y="${G.T}" width="${(X(z) - X(a)).toFixed(1)}" height="${G.H - G.T - G.B}"/>`;
  }
  return s;
}
const covLegend = () => `<span><i class="lg-cov"></i>${t('Cobertura incompleta: falta el mejor modelo según Epoch')}</span>`;
/* records: [{ date, open: {v, name} | null, closed: {v, name} | null }] con el máximo acumulado de cada grupo.
   models: todos los modelos puntuados [{ d, v, g: 'o'|'c', n, org, lo, hi, rec }]; sin ellos sólo se dibujan los récords. */
/* metric: rótulo de la cifra en la ficha (ECI por defecto); highlight: nombres que llevan etiqueta fija aunque no sean récord
   (p. ej. las novedades); fmtV: cómo se escribe la cifra; bands: tramos con cobertura incompleta [{ from, to }]. */
export function frontier(el, records, opts = {}) {
  const { models = null, yLabel = '', yShort = '', metric = 'ECI', highlight = null, fmtV = v => num(v, 1), bands = null } = opts;
  const G = { ...frame(el, { W: 860, H: 360, L: 52, R: 16, T: 16, B: 40 }, 320), yShort };
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
  watchWidth(el, () => frontier(el, records, opts));
  const all = (models && models.length ? models : [...rec.open.map(r => ({ ...r, g: 'o', rec: true })), ...rec.closed.map(r => ({ ...r, g: 'c', rec: true }))]);
  const first = Math.min(...[...rec.open, ...rec.closed].map(r => ms(r.d)));
  const pts = all.filter(m => m.d && ms(m.d) >= first);
  const tmax = Math.max(...pts.map(m => ms(m.d)));
  const vals = pts.map(m => m.v);
  const full = { x0: first, x1: tmax, y0: Math.max(0, Math.floor((Math.min(...vals) - 3) / 5) * 5), y1: Math.ceil((Math.max(...vals) + 3) / 5) * 5 };
  const grp = g => g === 'o' ? 'open' : 'closed';
  const draw = (v, zoomed) => {
    const X = val => L + (val - v.x0) / (v.x1 - v.x0 || 1) * (W - L - R);
    const Y = val => T + (1 - (val - v.y0) / (v.y1 - v.y0)) * (H - T - B);
    const inside = (x, y) => x >= L - 3 && x <= W - R + 3 && y >= T - 3 && y <= H - B + 3;
    const shown = pts.filter(m => inside(X(ms(m.d)), Y(m.v)));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Evolución del mejor modelo abierto y del mejor cerrado')}">${clip(el.id, G)}`;
    s += yAxis(niceTicks(v.y0, v.y1), Y, G, val => num(val, 0), yLabel) + timeAxis(X, v.x0, v.x1, G) + '</g>';
    s += `<g clip-path="url(#clip-${el.id})">`;
    const cov = covBands(el.id, bands, X, G, v.x0, v.x1);
    if (cov) s += covPattern(el.id) + cov;
    for (const g of ['open', 'closed']) {
      const r = rec[g];
      if (!r.length) continue;
      let d = `M${X(ms(r[0].d)).toFixed(1)},${Y(r[0].v).toFixed(1)}`;
      for (const p of r.slice(1)) d += ` H${X(ms(p.d)).toFixed(1)} V${Y(p.v).toFixed(1)}`;
      s += `<path class="ln-${g}" d="${d} H${X(tmax).toFixed(1)}"/>`;
    }
    const strong = m => m.rec || (highlight && highlight.has(m.n));
    const ordered = shown.map((m, i) => [m, i]).sort((a, b) => (strong(a[0]) ? 1 : 0) - (strong(b[0]) ? 1 : 0));
    for (const [m, i] of ordered) s += `<circle data-k="${i}" class="pt-${grp(m.g)} ${strong(m) ? 'key' : 'faint'}${m.anun ? ' anun' : ''}" cx="${X(ms(m.d)).toFixed(1)}" cy="${Y(m.v).toFixed(1)}" r="${strong(m) ? 5 : 4}"/>`;
    s += '</g>';
    const targets = shown.map(m => ({
      x: X(ms(m.d)), y: Y(m.v),
      html: tip(m.n, [
        [t('Fecha de lanzamiento'), fmtDate(m.d)],
        [metric, m.lo != null && m.hi != null ? `${fmtV(m.v)} ${t('(intervalo {lo}–{hi})', { lo: num(m.lo, 1), hi: num(m.hi, 1) })}` : fmtV(m.v)],
        [t('Pesos'), m.g === 'o' ? (m.anun ? t('abiertos (anunciados en su descripción de OpenRouter; aún no descargables)') : t('abiertos')) : m.inf ? t('cerrados (inferido: no hay pesos publicados)') : t('cerrados')],
        [t('Organización'), m.org || null],
        [t('Nuevo récord'), m.rec ? t('sí, mejor {g} hasta esa fecha', { g: m.g === 'o' ? t('abierto') : t('cerrado') }) : t('no')]
      ])
    }));
    // Etiquetas fijas: el líder actual de cada grupo y los saltos más grandes, sin pisarse; al acercar, también el resto visible.
    const leaders = [], jumps = [], rest = [];
    for (const g of ['closed', 'open']) {
      const r = rec[g], prefer = g === 'closed' ? 'up' : 'down';
      if (!r.length) continue;
      const lab = p => ({ x: X(ms(p.d)), y: Y(p.v), text: p.n, prefer, jump: p.jump });
      const vis = p => inside(X(ms(p.d)), Y(p.v));
      if (vis(r[r.length - 1])) leaders.push(lab(r[r.length - 1]));
      const big = r.slice(0, -1).sort((a, b) => b.jump - a.jump);
      jumps.push(...big.filter(vis).slice(0, 6).map(lab));
      if (zoomed) rest.push(...big.filter(vis).slice(6).map(lab));
    }
    const marked = highlight ? shown.filter(m => !m.rec && highlight.has(m.n)).sort((a, b) => b.v - a.v).map(m => ({ x: X(ms(m.d)), y: Y(m.v), text: m.n, prefer: m.g === 'c' ? 'up' : 'down' })) : [];
    if (zoomed) rest.push(...shown.filter(m => !m.rec && !(highlight && highlight.has(m.n))).sort((a, b) => b.v - a.v).map(m => ({ x: X(ms(m.d)), y: Y(m.v), text: m.n, prefer: m.g === 'c' ? 'up' : 'down', faint: true })));
    s += labelSvg(placeLabels([...leaders, ...marked, ...jumps.sort((a, b) => b.jump - a.jump), ...rest].slice(0, zoomed ? 40 : 14), G));
    s += `</svg><div class="legend"><span><i style="background:var(--open)"></i>${t('Mejor con pesos abiertos')}</span><span><i style="background:var(--closed)"></i>${t('Mejor cerrado')}</span>`;
    s += (shown.some(m => m.anun) ? `<span><i class="lg-anun"></i>${t('Pesos anunciados, aún sin descargar')}</span>` : '')
      + (models ? `<span><i class="lg-faint"></i>${t('Resto de modelos puntuados')}</span>` : '') + (cov ? covLegend() : '') + zoomUi(zoomed) + '</div>';
    el.innerHTML = s;
    interact(el, targets, 22);
  };
  zoomable(el, G, full, draw, { minX: 60 * 86400e3, minY: 4 });
  return true;
}

/* ── Distancias en puntos ECI a lo largo del tiempo (La carrera) ────────── */
/* unit: escala de la distancia («puntos ECI» o «puntos del índice AA»); si un punto trae who, la ficha nombra los modelos.
   bands: tramos con cobertura incompleta [{ from, to }]. */
export function gaps(el, points, { unit = t('puntos ECI'), short = unit, bands = null } = {}) {
  const pts = (points || []).filter(p => p.usCn !== null || p.closedOpen !== null);
  if (pts.length < 2) { el.innerHTML = `<div class="chart-empty">${t('Sin datos suficientes para la serie.')}</div>`; return false; }
  watchWidth(el, () => gaps(el, points, { unit, short, bands }));
  const G = frame(el, { W: 860, H: 290, L: 52, R: 185, T: 16, B: 40 }, 250);
  const { W, H, L, R, T, B } = G;
  const tmin = ms(pts[0].d), tmax = ms(pts[pts.length - 1].d);
  const vals = pts.flatMap(p => [p.usCn, p.closedOpen]).filter(v => v !== null);
  const ymin = Math.min(0, Math.floor(Math.min(...vals) / 5) * 5), ymax = Math.ceil((Math.max(...vals) + 1) / 5) * 5;
  const X = v => L + (v - tmin) / (tmax - tmin || 1) * (W - L - R);
  const Y = v => T + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Distancia en {unit} entre EE. UU. y China y entre modelos cerrados y abiertos', { unit: esc(unit) })}">`;
  s += yAxis(niceTicks(ymin, ymax), Y, G, v => num(v, 0), short) + timeAxis(X, tmin, tmax, G) + '</g>';
  const cov = covBands(el.id, bands, X, G, tmin, tmax);
  if (cov) s += covPattern(el.id) + cov;
  if (ymin < 0) s += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor" opacity=".5"/>`;
  const SER = [['usCn', 'ln-uscn', t('EE. UU. − China')], ['closedOpen', 'ln-co', t('Cerrados − abiertos')]];
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
    const who = { usCn: p.who ? t('{us} frente a {cn}', { us: p.who.us, cn: p.who.cn }) : '', closedOpen: p.who ? t('{closed} frente a {open}', { closed: p.who.closed, open: p.who.open }) : '' };
    return { box: [x - step / 2, T, x + step / 2, H - B], html: tip(fmtDate(p.d), SER.map(([key, , name]) => [name, p[key] === null ? t('sin datos') : `${t('{n} puntos', { n: num(p[key], 1) })}${who[key] ? ` (${who[key]})` : ''}`]), t('Mejor modelo de cada lado hasta esa fecha. No equivale a meses de retraso.')) };
  });
  // Valor actual fijo al final de cada línea.
  const last = pts[pts.length - 1];
  const ends = SER.filter(([key]) => last[key] !== null).map(([key, , name]) => ({ x: X(tmax), y: Y(last[key]), text: `${name}: ${num(last[key], 1)}` }));
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 14) ends[ends[0].y < ends[1].y ? 0 : 1].y -= 7, ends[ends[0].y < ends[1].y ? 1 : 0].y += 7;
  if (!G.narrow) s += ends.map(e => `<text class="ptlabel" x="${(e.x + 8).toFixed(1)}" y="${(e.y + 4).toFixed(1)}">${esc(e.text)}</text>`).join('');
  // En estrecho no hay sitio a la derecha: el último valor de cada serie va en la leyenda.
  const lg = (key, name) => G.narrow && last[key] !== null ? `${name}: ${num(last[key], 1)}` : name;
  s += `</svg><div class="legend"><span><i style="background:var(--orange)"></i>${esc(lg('usCn', t('EE. UU. − China')))}</span><span><i style="background:var(--ink)"></i>${esc(lg('closedOpen', t('Cerrados − abiertos')))}</span>${cov ? covLegend() : ''}</div>`;
  el.innerHTML = s;
  interact(el, targets);
  return true;
}

/* ── Serie diaria ─────────────────────────────────────────────────────── */
/* pts: [{ d: 'AAAA-MM-DD', ... }]; series: [{ key, cls, name, get(p) → número|null, who(p) → texto }]. Ejes por días. */
export function daily(el, pts, opts = {}) {
  const { series = [], yLabel = '', unit = '', foot = '', aria = '' } = opts;
  const ok = pts.filter(p => series.some(sr => sr.get(p) !== null));
  if (ok.length < 2) { el.innerHTML = `<div class="chart-empty">${t('La serie necesita al menos dos recogidas diarias.')}</div>`; return false; }
  watchWidth(el, () => daily(el, pts, opts));
  const G = frame(el, { W: fitWidth(el), H: 280, L: 52, R: 170, T: 16, B: 40 }, 250);
  const { W, H, L, R, T, B } = G;
  const tmin = ms(ok[0].d), tmax = ms(ok[ok.length - 1].d);
  const vals = ok.flatMap(p => series.map(sr => sr.get(p))).filter(v => v !== null);
  const lo = Math.floor(Math.min(...vals) / 5) * 5 - 5, hi = Math.ceil(Math.max(...vals) / 5) * 5 + 5;
  const X = t => L + (t - tmin) / (tmax - tmin || 1) * (W - L - R);
  const Y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">`;
  s += yAxis(niceTicks(lo, hi), Y, G, v => num(v, 0), yLabel);
  const days = Math.round((tmax - tmin) / 864e5), every = Math.max(1, Math.ceil(days / tickCount(G)));
  for (let i = 0; i <= days; i += every) {
    const t = tmin + i * 864e5, x = X(t);
    const anchor = x < L + 24 ? 'start' : x > W - R - 24 ? 'end' : 'middle';
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${H - B}" y2="${H - B + 5}"/><text x="${x.toFixed(1)}" y="${H - B + 18}" text-anchor="${anchor}">${esc(fmtDate(new Date(t).toISOString().slice(0, 10)).replace(/ \d{4}$/, ''))}</text>`;
  }
  s += '</g>';
  for (const sr of series) {
    let d = '', pen = false;
    for (const p of ok) { const v = sr.get(p); if (v === null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${X(ms(p.d)).toFixed(1)},${Y(v).toFixed(1)} `; pen = true; }
    s += `<path class="${sr.cls}" d="${d}"/>`;
  }
  const step = (W - L - R) / Math.max(1, ok.length - 1);
  const targets = ok.map((p, i) => {
    const x = X(ms(p.d));
    s += `<g data-k="${i}">${series.map(sr => sr.get(p) === null ? '' : `<circle class="pt-${sr.cls}" cx="${x.toFixed(1)}" cy="${Y(sr.get(p)).toFixed(1)}" r="3.5"/>`).join('')}</g>`;
    return { box: [x - step / 2, T, x + step / 2, H - B], html: tip(fmtDate(p.d), series.map(sr => [sr.name, sr.get(p) === null ? t('sin datos') : `${num(sr.get(p), 1)}${unit}${sr.who?.(p) ? ` · ${sr.who(p)}` : ''}`]), foot) };
  });
  const last = ok[ok.length - 1];
  const ends = series.filter(sr => sr.get(last) !== null).map(sr => ({ y: Y(sr.get(last)), text: `${sr.name}: ${num(sr.get(last), 1)}` }));
  for (let i = 1; i < ends.length; i++) if (Math.abs(ends[i].y - ends[i - 1].y) < 14) ends[i].y = ends[i - 1].y + 14;
  if (!G.narrow) s += ends.map(e => `<text class="ptlabel" x="${(X(tmax) + 8).toFixed(1)}" y="${(e.y + 4).toFixed(1)}">${esc(e.text)}</text>`).join('');
  s += `</svg><div class="legend">${series.map(sr => `<span><i class="sw-${sr.cls}"></i>${esc(G.narrow && sr.get(last) !== null ? `${sr.name}: ${num(sr.get(last), 1)}` : sr.name)}</span>`).join('')}</div>`;
  el.innerHTML = s;
  interact(el, targets);
  return true;
}

/* Ancho del viewBox igual al del contenedor, para que el texto se vea a su tamaño real en columnas estrechas. */
const fitWidth = el => Math.round(Math.min(1200, Math.max(isNarrow(el) ? 280 : 520, el.clientWidth || 860)));
/* Los gráficos de vistas ocultas se dibujan sin ancho y luego se escalan: se redibujan cuando cambia el ancho real. */
function watchWidth(el, redraw) {
  if (typeof ResizeObserver === 'undefined') return;
  el._ro?.disconnect();
  let w = el.clientWidth;
  const ro = new ResizeObserver(() => { const n = el.clientWidth; if (n && Math.abs(n - w) > 24) { w = n; ro.disconnect(); redraw(); } });
  ro.observe(el); el._ro = ro;
}

/* ── Barras horizontales ────────────────────────────────────────────────── */
/* rows: [{ label, v, cls?, tip, value? }]; ref: { v, label } dibuja una línea de referencia (p. ej. saturación al 90 %). */
export function hbars(el, rows, opts = {}) {
  const { fmt = v => num(v, 0), max = null, ref = null, aria = '', right = null } = opts;
  if (!rows.length) { el.innerHTML = `<div class="chart-empty">${t('Sin datos.')}</div>`; return false; }
  watchWidth(el, () => hbars(el, rows, opts));
  const W = fitWidth(el), nw = isNarrow(el, 480), rowH = nw ? 46 : 30;
  // En estrecho, cada etiqueta va encima de su barra, a todo lo ancho, y el margen derecho se ajusta al valor más largo.
  const longest = Math.max(...rows.map(r => String(r.value ?? fmt(r.v)).length));
  const G = nw ? { W, L: 4, R: Math.min(Math.round(W * 0.4), Math.round(longest * 7.6 + 14)), T: ref ? 22 : 6, B: 8, cw: 7.2 }
    : { W, L: Math.min(250, Math.round(W * 0.3)), R: right ?? Math.min(120, Math.round(W * 0.16)), T: ref ? 22 : 6, B: 8, cw: 8 };
  const H = G.T + rows.length * rowH + G.B;
  const top = max ?? Math.max(...rows.map(r => r.v), ref?.v ?? 0);
  const X = v => G.L + Math.max(0, v) / (top || 1) * (G.W - G.L - G.R);
  let s = `<svg viewBox="0 0 ${G.W} ${H}" role="img" aria-label="${esc(aria)}">`;
  // La línea de referencia va debajo de las barras y de sus cifras, para no tacharlas.
  if (ref) {
    s += `<line class="ref" x1="${X(ref.v)}" x2="${X(ref.v)}" y1="${G.T - 6}" y2="${H - G.B}"/>`;
    s += `<text class="lbl" x="${X(ref.v)}" y="${G.T - 10}" text-anchor="middle">${esc(ref.label)}</text>`;
  }
  const targets = rows.map((r, i) => {
    const y = G.T + i * rowH, by = nw ? y + 21 : y + 5, bh = nw ? 18 : rowH - 10;
    s += `<g data-k="${i}" class="bar ${r.cls || ''}"><rect class="bar-bg" x="0" y="${y}" width="${G.W}" height="${rowH}"/>`;
    if (nw) s += `<text class="bar-l" x="${G.L}" y="${y + 15}">${esc(fitText(r.label, Math.floor((G.W - G.L) / G.cw)))}</text>`;
    else s += `<text class="bar-l" x="${G.L - 10}" y="${y + rowH / 2 + 5}" text-anchor="end">${esc(fitText(r.label, Math.floor((G.L - 14) / G.cw)))}</text>`;
    s += `<rect class="bar-v" x="${G.L}" y="${by}" width="${Math.max(1.5, X(r.v) - G.L).toFixed(1)}" height="${bh}"/>`;
    s += `<text class="bar-n" x="${(X(r.v) + 8).toFixed(1)}" y="${by + bh / 2 + 5}">${esc(r.value ?? fmt(r.v))}</text></g>`;
    return { box: [0, y, G.W, y + rowH], html: r.tip || tip(r.label, [[t('Valor'), r.value ?? fmt(r.v)]]) };
  });
  s += '</svg>';
  el.innerHTML = s;
  interact(el, targets);
  return true;
}

/* ── Columnas por periodo ───────────────────────────────────────────────── */
/* rows: [{ label, v, tip, cls? }] en orden temporal; se rotula una de cada «every» columnas. */
export function columns(el, rows, opts = {}) {
  const { fmt = v => num(v, 0), yLabel = '', every = 1, aria = '', log = false, left = 64 } = opts;
  if (!rows.length) { el.innerHTML = `<div class="chart-empty">${t('Sin datos.')}</div>`; return false; }
  watchWidth(el, () => columns(el, rows, opts));
  const G = frame(el, { W: fitWidth(el), H: 260, L: left, R: 12, T: 14, B: 40 }, 240, 480);
  const { W, H, L, R, T, B } = G;
  const top = Math.max(...rows.map(r => r.hi ?? r.v));
  let tk, Y;
  if (log) {
    // Escala logarítmica: marcas en potencias de diez; las barras arrancan en la marca inferior.
    const lo = 10 ** Math.floor(Math.log10(Math.min(...rows.map(r => r.lo ?? r.v)))), hi = 10 ** Math.ceil(Math.log10(top));
    tk = []; for (let v = lo; v <= hi * 1.0001; v *= 10) tk.push(v);
    Y = v => T + (1 - (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo) || 1)) * (H - T - B);
  } else {
    tk = niceTicks(0, top * 1.05);
    const ymax = tk[tk.length - 1];
    Y = v => T + (1 - v / (ymax || 1)) * (H - T - B);
  }
  const y0 = log ? tk[0] : 0;
  const bw = (W - L - R) / rows.length;
  // Rótulos del eje X: uno de cada «every» columnas, o más espaciados si no caben.
  const step = Math.max(every, Math.ceil((Math.max(...rows.map(r => String(r.label).length)) * 6.7 + 10) / bw));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">`;
  s += yAxis(tk, Y, G, fmt, yLabel);
  rows.forEach((r, i) => {
    if (i % step) return;
    // Los rótulos de los extremos se alinean hacia dentro para no salirse del gráfico.
    const x = L + (i + 0.5) * bw, half = String(r.label).length * 3.4;
    s += `<text x="${(x - half < 0 ? 0 : x + half > W ? W : x).toFixed(1)}" y="${H - B + 18}" text-anchor="${x - half < 0 ? 'start' : x + half > W ? 'end' : 'middle'}">${esc(r.label)}</text>`;
  });
  s += '</g>';
  const targets = rows.map((r, i) => {
    const x = L + i * bw;
    // Con «real», la barra es medida hasta ese valor (sólida) y extrapolada encima (rayada).
    const bx = (x + bw * 0.15).toFixed(1), bwid = (bw * 0.7).toFixed(1);
    if (r.real > 0 && r.real < r.v) s += `<rect class="col" x="${bx}" y="${Y(r.real).toFixed(1)}" width="${bwid}" height="${(Y(y0) - Y(r.real)).toFixed(1)}"/><rect data-k="${i}" class="col ${r.cls || ''}" x="${bx}" y="${Y(r.v).toFixed(1)}" width="${bwid}" height="${(Y(r.real) - Y(r.v)).toFixed(1)}"/>`;
    else s += `<rect data-k="${i}" class="col ${r.cls || ''}" x="${bx}" y="${Y(r.v).toFixed(1)}" width="${bwid}" height="${(Y(y0) - Y(r.v)).toFixed(1)}"/>`;
    if (r.lo != null && r.hi != null) {
      const cx = (x + bw / 2).toFixed(1), w = Math.min(10, bw * 0.25);
      s += `<g class="whisk"><line x1="${cx}" x2="${cx}" y1="${Y(r.hi).toFixed(1)}" y2="${Y(r.lo).toFixed(1)}"/><line x1="${(x + bw / 2 - w).toFixed(1)}" x2="${(x + bw / 2 + w).toFixed(1)}" y1="${Y(r.hi).toFixed(1)}" y2="${Y(r.hi).toFixed(1)}"/><line x1="${(x + bw / 2 - w).toFixed(1)}" x2="${(x + bw / 2 + w).toFixed(1)}" y1="${Y(r.lo).toFixed(1)}" y2="${Y(r.lo).toFixed(1)}"/></g>`;
    }
    return { box: [x, T, x + bw, H - B], html: r.tip || tip(r.label, [[t('Valor'), fmt(r.v)]]) };
  });
  s += '</svg>';
  el.innerHTML = s;
  interact(el, targets);
  return true;
}

/* ── Puntos con intervalo (laboratorios) ────────────────────────────────── */
/* rows: [{ label, v, lo, hi, tip }]. Muestra si los intervalos se solapan. */
export function dotci(el, rows, opts = {}) {
  const { aria = '', unit = '' } = opts;
  if (!rows.length) { el.innerHTML = `<div class="chart-empty">${t('Sin datos.')}</div>`; return false; }
  watchWidth(el, () => dotci(el, rows, opts));
  const W = fitWidth(el), rowH = 30, nw = isNarrow(el, 480);
  const G = nw ? { W, L: Math.round(W * 0.38), R: 16, T: 8, B: 34, cw: 7.2 } : { W, L: Math.min(250, Math.round(W * 0.3)), R: 40, T: 8, B: 34, cw: 8 };
  const H = G.T + rows.length * rowH + G.B;
  const lo = Math.floor(Math.min(...rows.map(r => r.lo ?? r.v)) - 1), hi = Math.ceil(Math.max(...rows.map(r => r.hi ?? r.v)) + 1);
  const X = v => G.L + (v - lo) / (hi - lo || 1) * (G.W - G.L - G.R);
  let s = `<svg viewBox="0 0 ${G.W} ${H}" role="img" aria-label="${esc(aria)}"><g class="grid">`;
  const tk = niceTicks(lo, hi, nw ? 4 : 6);
  for (const v of tk) s += `<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${G.T}" y2="${H - G.B}"/>`;
  s += '</g><g class="axis">';
  for (const v of tk) s += `<text x="${X(v).toFixed(1)}" y="${H - G.B + 16}" text-anchor="middle">${esc(num(v, 0))}</text>`;
  s += `<text x="${(G.L + G.W - G.R) / 2}" y="${H - 4}" text-anchor="middle">${esc(unit)}</text></g>`;
  const targets = rows.map((r, i) => {
    const y = G.T + i * rowH + rowH / 2;
    s += `<g data-k="${i}" class="ci-row"><rect class="bar-bg" x="0" y="${y - rowH / 2}" width="${G.W}" height="${rowH}"/>`;
    const max = Math.floor((G.L - 14) / G.cw);
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
export function hitoTimeline(el, lanes, items, opts = {}) {
  const { today, from, to } = opts;
  watchWidth(el, () => hitoTimeline(el, lanes, items, opts));
  // En estrecho, el título de cada carril va encima de sus puntos, a todo lo ancho, en vez de en una columna a la izquierda.
  const nw = isNarrow(el), laneH = nw ? 96 : 86;
  const G = nw ? { W: Math.max(280, el.clientWidth), L: 10, R: 10, T: 26, B: 34, narrow: true, top: 18 } : { W: 860, L: 165, R: 16, T: 26, B: 34, top: 0 };
  const H = G.T + lanes.length * laneH + G.B;
  const tmin = ms(from), tmax = ms(to);
  const X = v => G.L + (v - tmin) / (tmax - tmin) * (G.W - G.L - G.R);
  let s = `<svg viewBox="0 0 ${G.W} ${H}" role="img" aria-label="${t('Calendario de los hitos de AI 2027 y fecha de hoy')}">`;
  s += `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-ln"/></pattern></defs>`;
  s += '<g class="axis">';
  for (const tk of monthTicks(tmin, tmax, tickCount(G))) {
    const x = X(tk);
    s += `<line class="tl-grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${G.T}" y2="${H - G.B}"/><text x="${x.toFixed(1)}" y="${H - G.B + 18}" text-anchor="middle">${esc(monthLabel(tk))}</text>`;
  }
  s += '</g>';
  lanes.forEach((l, i) => {
    const y = G.T + i * laneH;
    s += `<rect class="lane ${i % 2 ? 'odd' : ''}" x="0" y="${y}" width="${G.W}" height="${laneH}"/>`;
    if (G.narrow) { s += `<text class="lane-t" x="8" y="${y + 14}">${esc(fitText(l.title, Math.floor((G.W - 16) / 7.2)))}</text>`; return; }
    // Título del carril en dos líneas como mucho.
    const lines = wrap(l.title, 19), shown = lines.slice(0, 2);
    if (lines.length > 2) shown[1] += '…';
    s += `<text class="lane-t" x="8" y="${y + laneH / 2 + 4 - (shown.length - 1) * 7}">${shown.map((t, k) => `<tspan x="8" dy="${k ? 14 : 0}">${esc(t)}</tspan>`).join('')}</text>`;
  });
  // Pasado sombreado y línea de hoy.
  const xt = X(ms(today));
  s += `<rect class="past" x="${G.L}" y="${G.T}" width="${(xt - G.L).toFixed(1)}" height="${lanes.length * laneH}"/>`;
  const ta = xt < G.L + 60 ? 'start' : xt > G.W - G.R - 60 ? 'end' : 'middle';
  s += `<line class="today" x1="${xt.toFixed(1)}" x2="${xt.toFixed(1)}" y1="${G.T - 14}" y2="${H - G.B}"/><text class="today-t" x="${xt.toFixed(1)}" y="${G.T - 16}" text-anchor="${ta}">${t('hoy, {fmtDate}', { fmtDate: esc(fmtDate(today)) })}</text>`;
  // Hitos de una misma línea y fecha se reparten en horizontal alrededor de su fecha.
  const group = new Map(), seen = new Map();
  let dots = '';
  for (const it of items) { const key = `${it.lane}|${it.date}`; group.set(key, (group.get(key) || 0) + 1); }
  const targets = items.map((it, i) => {
    const li = lanes.findIndex(l => l.id === it.lane);
    const key = `${it.lane}|${it.date}`, k = seen.get(key) || 0, n = group.get(key);
    seen.set(key, k + 1);
    const x = X(ms(it.date)) + (k - (n - 1) / 2) * (G.narrow ? 14 : 20), y = G.T + li * laneH + (laneH + G.top) / 2;
    dots += `<g data-k="${i}" class="hito-pt ${it.cls}">${it.est ? `<circle class="est-ring ${it.est}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12.5"/>` : ''}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"/></g>`;
    return { x, y, html: it.tip, go: it.go, short: it.short, li };
  });
  // Etiquetas: el nombre corto junto a cada punto, dentro de su carril, con una guía hasta su punto.
  const cands = targets.map(t => ({ x: t.x, y: t.y + 6, px: t.x, py: t.y, text: t.short, prefer: 'down', far: true, minY: G.T + t.li * laneH + G.top + 2, maxY: G.T + (t.li + 1) * laneH - 2 }));
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
  if (!pts || pts.length < 2) { el.innerHTML = `<div class="chart-empty">${t('Sin datos suficientes para la serie.')}</div>`; return false; }
  watchWidth(el, () => recordChart(el, pts, { yLabel, fmt, ref, unit }));
  const G = frame(el, { W: 860, H: 320, L: 52, R: 16, T: 18, B: 40 }, 280);
  const { W, H, L, R, T, B } = G;
  const tmin = ms(pts[0].d), tmax = Math.max(ms(pts[pts.length - 1].d), Date.now());
  const vals = pts.map(p => p.v).concat(ref ? [ref.v] : []);
  const full = { x0: tmin, x1: tmax, y0: Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10), y1: Math.min(100, Math.ceil((Math.max(...vals) + 3) / 10) * 10) };
  const rec = pts.filter(p => p.rec);
  const draw = (v, zoomed) => {
    const X = val => L + (val - v.x0) / (v.x1 - v.x0 || 1) * (W - L - R);
    const Y = val => T + (1 - (val - v.y0) / (v.y1 - v.y0 || 1)) * (H - T - B);
    const inside = (x, y) => x >= L - 3 && x <= W - R + 3 && y >= T - 3 && y <= H - B + 3;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('{yLabel} a lo largo del tiempo', { yLabel: esc(yLabel) })}">${clip(el.id, G)}`;
    s += yAxis(niceTicks(v.y0, v.y1), Y, G, fmt, yLabel) + timeAxis(X, v.x0, v.x1, G) + '</g>';
    const taken = [];
    s += `<g clip-path="url(#clip-${el.id})">`;
    if (ref && ref.v >= v.y0 && ref.v <= v.y1) {
      s += `<line class="ref" x1="${L}" x2="${W - R}" y1="${Y(ref.v).toFixed(1)}" y2="${Y(ref.v).toFixed(1)}"/>`;
      // Rótulo de la referencia en una o dos líneas, según quepa.
      const ln = wrap(ref.label, Math.floor((W - L - R - 8) / CH)).slice(0, 2), y0 = Y(ref.v) - 6 - (ln.length - 1) * 13;
      s += `<text class="ref-t" x="${L + 6}" y="${y0.toFixed(1)}">${ln.map((t, k) => `<tspan x="${L + 6}" dy="${k ? 13 : 0}">${esc(t)}</tspan>`).join('')}</text>`;
      taken.push([L, y0 - 12, L + 6 + Math.max(...ln.map(t => t.length)) * CH, Y(ref.v) - 2]);
    }
    let d = `M${X(ms(rec[0].d)).toFixed(1)},${Y(rec[0].v).toFixed(1)}`;
    for (const p of rec.slice(1)) d += ` H${X(ms(p.d)).toFixed(1)} V${Y(p.v).toFixed(1)}`;
    s += `<path class="ln-closed" d="${d} H${X(tmax).toFixed(1)}"/>`;
    const shown = pts.filter(p => inside(X(ms(p.d)), Y(p.v)));
    const ord = shown.map((p, i) => [p, i]).sort((a, b) => (a[0].rec ? 1 : 0) - (b[0].rec ? 1 : 0));
    for (const [p, i] of ord) s += `<circle data-k="${i}" class="pt-closed ${p.rec ? 'key' : 'faint'}" cx="${X(ms(p.d)).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${p.rec ? 5 : 4}"/>`;
    s += '</g>';
    const targets = shown.map(p => ({ x: X(ms(p.d)), y: Y(p.v), html: tip(p.n, [[t('Fecha de publicación'), fmtDate(p.d)], [t('Resultado'), `${fmt(p.v)}${unit}`], [t('Nuevo récord'), p.rec ? t('sí') : t('no')]]) }));
    // Etiquetas: el último récord y los mayores saltos; al acercar, también el resto de puntos visibles que quepan.
    const vis = p => inside(X(ms(p.d)), Y(p.v));
    const lab = (p, faint) => ({ x: X(ms(p.d)), y: Y(p.v), text: `${p.n} · ${fmt(p.v)}${unit}`, prefer: 'up', faint });
    const jumps = rec.map((p, i) => ({ p, jump: i ? p.v - rec[i - 1].v : 0 }));
    const cands = [jumps[jumps.length - 1], ...jumps.slice(0, -1).sort((a, b) => b.jump - a.jump).slice(0, zoomed ? 40 : 5)].filter(j => vis(j.p)).map(({ p }) => lab(p));
    if (zoomed) cands.push(...shown.filter(p => !p.rec).sort((a, b) => b.v - a.v).map(p => lab(p, true)));
    s += labelSvg(placeLabels(cands.slice(0, zoomed ? 40 : 6), G, taken));
    s += `</svg><div class="legend"><span><i style="background:var(--closed)"></i>${t('Mejor resultado hasta esa fecha')}</span><span><i class="lg-faint"></i>${t('Resto de modelos')}</span>` + zoomUi(zoomed) + '</div>';
    el.innerHTML = s;
    interact(el, targets, 22);
  };
  zoomable(el, G, full, draw, { minX: 30 * 86400e3, minY: 4 });
  return true;
}

/* ── Dificultad de las evaluaciones frente a la frontera (La carrera) ────── */
/* items: [{ n, d, v, lo, hi, up, tip }]: cada evaluación en su fecha de publicación y a la altura de su dificultad (EDI),
   en puntos ECI; up = por encima del mejor modelo de hoy. line: [{ d, v, n }], récords del mejor ECI publicado. */
export function ediMap(el, items, line, opts = {}) {
  const { yShort = t('puntos ECI'), today = new Date().toISOString().slice(0, 10) } = opts;
  if (!items.length || !line.length) { el.innerHTML = `<div class="chart-empty">${t('Sin datos suficientes.')}</div>`; return false; }
  watchWidth(el, () => ediMap(el, items, line, opts));
  const G = { ...frame(el, { W: 860, H: 400, L: 52, R: 16, T: 16, B: 40 }, 360), yShort };
  const { W, H, L, R, T, B } = G;
  const t1 = ms(today), t0 = Math.min(ms(line[0].d), ...items.map(b => ms(b.d)));
  // La escala sigue a las dificultades y a la frontera; los intervalos más anchos se recortan en el borde.
  const vals = items.map(b => b.v).concat(line.map(p => p.v));
  const full = { x0: t0 - 30 * 864e5, x1: t1 + 30 * 864e5, y0: Math.floor((Math.min(...vals) - 4) / 5) * 5, y1: Math.ceil((Math.max(...vals) + 4) / 5) * 5 };
  const draw = (v, zoomed) => {
    const X = val => L + (val - v.x0) / (v.x1 - v.x0 || 1) * (W - L - R);
    const Y = val => T + (1 - (val - v.y0) / (v.y1 - v.y0)) * (H - T - B);
    const inside = (x, y) => x >= L - 3 && x <= W - R + 3 && y >= T - 3 && y <= H - B + 3;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Dificultad de cada evaluación frente al mejor ECI publicado')}">${clip(el.id, G)}`;
    s += yAxis(niceTicks(v.y0, v.y1), Y, G, val => num(val, 0), t('Puntos ECI (dificultad de la evaluación)')) + timeAxis(X, v.x0, v.x1, G) + '</g>';
    s += `<g clip-path="url(#clip-${el.id})">`;
    let d = `M${X(ms(line[0].d)).toFixed(1)},${Y(line[0].v).toFixed(1)}`;
    for (const p of line.slice(1)) d += ` H${X(ms(p.d)).toFixed(1)} V${Y(p.v).toFixed(1)}`;
    s += `<path class="ln-front" d="${d} H${X(t1).toFixed(1)}"/>`;
    const pts = items.map(b => ({ ...b, x: X(ms(b.d)), y: Y(b.v) })).filter(b => inside(b.x, b.y));
    for (const b of pts) if (b.lo != null && b.hi != null) s += `<line class="edi-ci${b.up ? ' up' : ''}" x1="${b.x.toFixed(1)}" x2="${b.x.toFixed(1)}" y1="${Y(b.hi).toFixed(1)}" y2="${Y(b.lo).toFixed(1)}"/>`;
    const recs = line.map(p => ({ ...p, x: X(ms(p.d)), y: Y(p.v) })).filter(p => inside(p.x, p.y));
    for (const [i, p] of recs.entries()) s += `<circle data-k="${pts.length + i}" class="pt-front" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3"/>`;
    for (const [i, b] of pts.entries()) s += `<circle data-k="${i}" class="pt-edi${b.up ? ' up' : ''}" cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="5.5"/>`;
    s += '</g>';
    const targets = pts.map(b => ({ x: b.x, y: b.y, html: b.tip }))
      .concat(recs.map(p => ({ x: p.x, y: p.y, html: tip(p.n, [[t('Publicado'), fmtDate(p.d)], ['ECI', num(p.v, 1)], [t('Nuevo récord'), t('sí, mejor ECI publicado hasta esa fecha')]]) })));
    // Etiquetas: el mejor modelo de hoy, las evaluaciones que siguen por encima y, al acercar, el resto que quepa.
    const last = line[line.length - 1];
    const cands = pts.filter(b => b.up).sort((a, b) => b.v - a.v).map(b => ({ x: b.x, y: b.y, text: b.n, prefer: 'up', far: true }))
      .concat(zoomed ? pts.filter(b => !b.up).sort((a, b) => b.v - a.v).map(b => ({ x: b.x, y: b.y, text: b.n, faint: true })) : []);
    s += labelSvg(placeLabels(cands.slice(0, zoomed ? 40 : 12), G, pts.map(b => [b.x - 6, b.y - 6, b.x + 6, b.y + 6])));
    s += `</svg><div class="legend"><span><i class="sw-front"></i>${t('Mejor ECI publicado hasta cada fecha (hoy, {n}: {num})', { n: esc(last.n), num: num(last.v, 1) })}</span><span><i class="lg-edi"></i>${t('Evaluación, a la altura de su dificultad')}</span><span><i class="lg-edi up"></i>${t('Por encima del mejor modelo de hoy')}</span>` + zoomUi(zoomed) + '</div>';
    el.innerHTML = s;
    interact(el, targets, 22);
  };
  zoomable(el, G, full, draw, { minX: 60 * 86400e3, minY: 5 });
  return true;
}
