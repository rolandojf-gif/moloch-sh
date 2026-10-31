/* «La carrera, en movimiento»: el mejor ECI de cada laboratorio desde 2023, con los récords que publica Epoch.
   Una barra sólo cambia en la fecha de publicación de un modelo que supera el récord de su laboratorio: no se interpola
   ningún dato y la cifra que se ve es siempre la de un modelo real; lo único animado es el paso de una posición a otra.
   Va en canvas para poder descargar el fotograma como imagen. */
import { t, tn } from './i18n.js';
import { esc, fmtDate, dateFmt, num } from './fmt.js';
import { tip, showTip, hideTip } from './charts.js';
import { logoFor } from './logos.js';

const DAY = 864e5, TOP = 10, DUR = 26000, TAU = 130, SAME = 1, FLASH = 60 * DAY;
const ECI_URL = 'https://epoch.ai/benchmarks/eci';
const ms = d => Date.parse(`${d}T00:00:00Z`);
const iso = x => new Date(x).toISOString().slice(0, 10);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let S = null;

/* ── Datos ──────────────────────────────────────────────────────────────── */
function standing(T) {
  const out = [];
  for (const l of S.labs) {
    let s = null;
    for (const x of l.steps) { if (x.t > T) break; s = x; }
    if (s) out.push({ l, s });
  }
  return out.sort((a, b) => b.s.v - a.s.v || a.s.t - b.s.t);
}
/* Cambios de primer puesto: en cada fecha con un récord nuevo, si el primero ya no es el mismo laboratorio. */
function leaders() {
  const times = [...new Set(S.labs.flatMap(l => l.steps.map(s => s.t)))].filter(x => x > S.t0 && x <= S.t1).sort((a, b) => a - b);
  const first = standing(S.t0)[0] || null, changes = [];
  let cur = first?.l.org;
  for (const T of times) {
    const st = standing(T);
    if (st[0] && st[0].l.org !== cur) { changes.push({ t: T, l: st[0].l, s: st[0].s, prev: st[1] || null, margin: st[1] ? st[0].s.v - st[1].s.v : null }); cur = st[0].l.org; }
  }
  return { first, changes };
}
/* Eje fijo: del más bajo de los diez primeros en todo el periodo (con margen, para que se vea la barra) al techo del
   intervalo más alto. No empieza en cero, y la nota lo dice. */
function axis() {
  let lo = Infinity, hi = -Infinity;
  for (let T = S.t0; T < S.t1 + 15 * DAY; T += 15 * DAY) for (const x of standing(Math.min(T, S.t1)).slice(0, TOP)) { lo = Math.min(lo, x.s.v); hi = Math.max(hi, x.s.hi ?? x.s.v); }
  return { a0: Math.floor((lo - 6) / 10) * 10, a1: Math.ceil((hi + 1) / 5) * 5 };
}
function init(root, fact) {
  S = { root, key: `${fact.got}|${fact.asOf}`, cur: 0, playing: false, raf: 0, last: 0, disp: new Map(), autoplayed: false, imgs: new Map() };
  S.labs = fact.v.map(l => ({ org: l.org, c: l.c, icon: logoFor({ org: l.org }) || logoFor({ name: l.steps.at(-1)?.m }), steps: l.steps.map(s => ({ ...s, t: ms(s.d) })) }));
  // Empieza en el primer modelo puntuado si es posterior al inicio pedido: antes no habría barras.
  S.t0 = Math.max(ms(`${fact.from || '2023-01'}-01`), Math.min(...S.labs.map(l => l.steps[0]?.t ?? Infinity)));
  S.t1 = Math.max(ms(fact.asOf), ...S.labs.flatMap(l => l.steps.map(s => s.t)));
  S.cur = S.t1;
  S.ax = axis();
  S.lead = leaders();
  S.listT = S.t1;
  for (const l of S.labs) loadLogo(l.icon);
}

/* Los logos son SVG sin tamaño propio: se les pone uno y se cargan como data: (la CSP admite img-src data:) para que
   todos los navegadores los pinten en el canvas sin marcarlo como de otro origen. */
function loadLogo(url) {
  if (!url || S.imgs.has(url)) return;
  S.imgs.set(url, null);
  fetch(url).then(r => r.ok ? r.text() : Promise.reject(new Error(r.status))).then(svg => {
    const img = new Image();
    img.onload = () => { S.imgs.set(url, img); kick(); };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/<svg\b/, '<svg width="64" height="64"'))}`;
  }).catch(() => {});
}

/* ── Dibujo ─────────────────────────────────────────────────────────────── */
function palette() {
  const cs = getComputedStyle(document.documentElement), v = k => cs.getPropertyValue(k).trim();
  return { card: v('--card'), paper: v('--paper'), ink: v('--ink'), text: v('--text'), muted: v('--muted'), line: v('--line'), us: v('--orange'), cn: v('--open'), other: v('--unknown'),
    lime: v('--lime'), logoBg: v('--logo-bg'), head: v('--f-head'), mono: v('--f-mono'), body: v('--f-body') };
}
function hatch(ctx, k) {
  const n = Math.round(7 * k), c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2.2 * k;
  g.beginPath(); g.moveTo(-1, n + 1); g.lineTo(n + 1, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(n - 1, n + 1); g.lineTo(n + 1, n - 1); g.stroke();
  const p = ctx.createPattern(c, 'repeat');
  p.setTransform?.(new DOMMatrix().scale(1 / k));
  return p;
}
function layout(W, exp = false) {
  const nw = !exp && W < 560;
  const head = exp ? 78 : nw ? 34 : 0, foot = exp ? 44 : 0, axisH = 22;
  const rowH = exp ? 37 : nw ? 27 : 34;
  const LW = nw ? Math.round(Math.min(124, W * 0.34)) : exp ? 210 : Math.min(220, Math.round(W * 0.21));
  const T = head + 6, bottom = T + TOP * rowH;
  return { W, H: exp ? 540 : bottom + axisH + 4, nw, exp, rowH, T, bottom, IS: nw ? 16 : 20, LW, L: LW + 10, R: nw ? 50 : exp ? 150 : 160, foot };
}
const fit = (ctx, s, max) => {
  if (ctx.measureText(s).width <= max) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
};
const fill = (P, l) => l.c === 'US' ? P.us : l.c === 'CN' ? P.cn : P.other;
const monthYear = x => dateFmt({ month: 'short', year: 'numeric' }).format(new Date(x)).replace('.', '');

function drawFrame(ctx, G, P, k, opts = {}) {
  const { logos = true } = opts;
  const X = v => G.L + (v - S.ax.a0) / (S.ax.a1 - S.ax.a0) * (G.W - G.L - G.R);
  ctx.fillStyle = G.exp ? P.paper : P.card;
  ctx.fillRect(0, 0, G.W, G.H);
  // Rejilla y eje.
  ctx.lineWidth = 1; ctx.strokeStyle = P.line; ctx.fillStyle = P.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `500 11px ${P.mono}`;
  const px = (G.W - G.L - G.R) / (S.ax.a1 - S.ax.a0), step = [10, 20, 25, 50].find(n => n * px >= 34) || 50;
  for (let v = Math.ceil(S.ax.a0 / step) * step; v <= S.ax.a1; v += step) {
    const x = Math.round(X(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, G.T - 4); ctx.lineTo(x, G.bottom); ctx.stroke();
    ctx.fillText(num(v, 0), x, G.bottom + 15);
  }
  ctx.textAlign = 'right';
  ctx.fillText(t('puntos ECI'), G.L - 12, G.bottom + 15);
  // Fecha grande: abajo a la derecha, detrás de las barras más cortas; en móvil, encima de las barras, para no tapar cifras.
  ctx.fillStyle = P.muted; ctx.globalAlpha = G.nw ? 0.8 : 0.42;
  ctx.font = `700 ${G.nw ? 24 : G.exp ? 50 : 46}px ${P.head}`;
  ctx.textAlign = G.nw ? 'left' : 'right';
  if (G.nw) ctx.fillText(monthYear(S.cur).toUpperCase(), 4, 26);
  else if (!G.exp) ctx.fillText(monthYear(S.cur).toUpperCase(), G.W - 12, G.bottom - 14);   // en la imagen, la fecha va en el título
  ctx.globalAlpha = 1;
  // Números de puesto, fijos.
  ctx.font = `600 ${G.nw ? 10.5 : 11.5}px ${P.mono}`; ctx.textAlign = 'left'; ctx.fillStyle = P.muted;
  const X0 = G.exp ? 16 : 4;
  for (let i = 0; i < TOP; i++) ctx.fillText(String(i + 1), X0, G.T + i * G.rowH + G.rowH / 2 + 4);

  const flash = S.lead.changes.filter(c => c.t <= S.cur && S.cur - c.t < FLASH).at(-1);
  const hp = opts.hatch || hatch(ctx, k);
  const rows = [...S.disp.entries()].filter(([, d]) => d.a > 0.01 && d.y < TOP + 0.2 && d.s).sort((a, b) => b[1].y - a[1].y);
  const RX = X0 + (G.nw ? 14 : 18);
  for (const [org, d] of rows) {
    const { s, l } = d, y = G.T + d.y * G.rowH, bh = G.rowH - (G.nw ? 9 : 11), by = y + (G.rowH - bh) / 2, cy = by + bh / 2;
    ctx.globalAlpha = Math.max(0, Math.min(1, d.a));
    if (flash && flash.l.org === org) {
      const f = 1 - (S.cur - flash.t) / FLASH;
      ctx.save(); ctx.globalAlpha *= 0.2 + 0.5 * f; ctx.fillStyle = P.lime; ctx.fillRect(RX - 4, y + 1, G.W - RX + 4, G.rowH - 2); ctx.restore();
    }
    // Logo y laboratorio.
    const ix = RX, iy = cy - G.IS / 2;
    ctx.fillStyle = P.logoBg; ctx.fillRect(ix, iy, G.IS, G.IS);
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.strokeRect(ix + 0.5, iy + 0.5, G.IS - 1, G.IS - 1);
    const img = logos && S.imgs.get(l.icon);
    if (img) { const p = 3; ctx.drawImage(img, ix + p, iy + p, G.IS - 2 * p, G.IS - 2 * p); }
    else { ctx.fillStyle = '#121211'; ctx.font = `700 ${G.IS * 0.45}px ${P.mono}`; ctx.textAlign = 'center'; ctx.fillText(l.org.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(), ix + G.IS / 2, cy + G.IS * 0.17); }
    ctx.textAlign = 'left'; ctx.fillStyle = P.text;
    ctx.font = `600 ${G.nw ? 11.5 : 13.5}px ${P.body}`;
    ctx.fillText(fit(ctx, l.org, G.L - ix - G.IS - 16), ix + G.IS + 7, cy + 4.5);
    // Barra: sombra, color del país, rayado si los pesos son abiertos, borde.
    const w = Math.max(2, X(d.v) - G.L);
    ctx.fillStyle = P.ink; ctx.fillRect(G.L + 2, by + 2, w, bh);
    ctx.fillStyle = fill(P, l); ctx.fillRect(G.L, by, w, bh);
    if (s.w === 'o') { ctx.fillStyle = hp; ctx.fillRect(G.L, by, w, bh); }
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.strokeRect(G.L + 0.75, by + 0.75, w - 1.5, bh - 1.5);
    // Intervalo del 90 %, desplazado con la barra mientras se mueve.
    let end = X(d.v);
    if (s.lo != null && s.hi != null) {
      const a = Math.max(G.L, X(d.v - (s.v - s.lo))), b = X(d.v + (s.hi - s.v));
      ctx.strokeStyle = P.ink; ctx.globalAlpha *= 0.6; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a, cy); ctx.lineTo(b, cy); ctx.moveTo(a, cy - 4); ctx.lineTo(a, cy + 4); ctx.moveTo(b, cy - 4); ctx.lineTo(b, cy + 4); ctx.stroke();
      ctx.globalAlpha = Math.max(0, Math.min(1, d.a));
      end = Math.max(end, b);
    }
    // Cifra real del modelo y su nombre: dentro de la barra si cabe (antes del intervalo); si no, detrás de la cifra.
    const val = num(s.v, 1);
    ctx.font = `700 ${G.nw ? 11.5 : 13}px ${P.mono}`; ctx.fillStyle = P.text; ctx.textAlign = 'left';
    ctx.fillText(val, end + 7, cy + 4.5);
    let after = end + 7 + ctx.measureText(val).width + 10;
    ctx.font = `500 ${G.nw ? 10.5 : 12}px ${P.body}`;
    const inner = (s.lo != null ? X(d.v - (s.v - s.lo)) : X(d.v)) - 8, mw = ctx.measureText(s.m).width;
    if (inner - G.L > mw + 10) {
      // Con halo del color de la barra, para que el rayado no se coma las letras.
      ctx.textAlign = 'right'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = fill(P, l);
      ctx.strokeText(s.m, inner, cy + 4); ctx.fillStyle = '#121211'; ctx.fillText(s.m, inner, cy + 4); ctx.textAlign = 'left';
    }
    else if (!G.nw && after + 40 < G.W) { const m = fit(ctx, s.m, G.W - after - 6); ctx.fillStyle = P.muted; ctx.fillText(m, after, cy + 4); after += ctx.measureText(m).width + 10; }
    // Primer puesto: «nuevo» durante unas semanas tras un cambio; «empate técnico» mientras saque menos de 1 punto al segundo.
    if (d.r === 0) {
      const second = S.st?.[1], tie = second && s.v - second.s.v < SAME, fresh = flash && flash.l.org === org;
      const tag = (fresh && tie ? t('Nuevo nº 1 · empate técnico') : fresh ? t('Nuevo nº 1') : tie ? t('Empate técnico con el nº 2') : '').toUpperCase();
      ctx.font = `700 ${G.nw ? 9.5 : 11}px ${P.mono}`;
      const tw = ctx.measureText(tag).width + 10, tx = Math.min(after, G.W - tw - 4);
      if (tag && tx >= end + 7 + ctx.measureText(val).width) {
        ctx.fillStyle = fresh ? P.lime : P.card; ctx.fillRect(tx, cy - 9, tw, 18);
        ctx.strokeStyle = fresh ? '#121211' : P.ink; ctx.lineWidth = 1.5; ctx.strokeRect(tx + 0.75, cy - 8.25, tw - 1.5, 16.5);
        ctx.fillStyle = fresh ? '#121211' : P.text; ctx.fillText(tag, tx + 5, cy + 4);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/* Fotograma para descargar: 1920 × 1080, con título, fecha y fuente dentro de la imagen. */
function drawExport(ctx, P, k, opts) {
  const G = layout(960, true);
  opts = { ...opts, hatch: hatch(ctx, k) };
  drawFrame(ctx, G, P, k, opts);
  ctx.textAlign = 'left'; ctx.fillStyle = P.text;
  ctx.font = `700 28px ${P.head}`;
  ctx.fillText(t('La carrera del ECI').toUpperCase(), 22, 42);
  ctx.font = `500 14px ${P.body}`; ctx.fillStyle = P.muted;
  ctx.fillText(t('Mejor modelo de cada laboratorio hasta el {fecha}', { fecha: fmtDate(iso(S.cur)) }), 22, 64);
  ctx.textAlign = 'right'; ctx.font = `700 16px ${P.mono}`; ctx.fillStyle = P.text;
  const brand = 'MOLOCH.SH', bw = ctx.measureText(brand).width;
  ctx.fillText(brand, 960 - 22, 40);
  ctx.fillStyle = P.us; ctx.fillRect(960 - 22 - bw - 22, 27, 14, 14); ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.strokeRect(960 - 22 - bw - 22, 27, 14, 14);
  // Leyenda y fuente.
  let x = 22;
  ctx.textAlign = 'left'; ctx.font = `600 11.5px ${P.mono}`;
  const key = (draw, label) => { draw(x, 488); x += 18; ctx.fillStyle = P.muted; ctx.fillText(label, x, 498); x += ctx.measureText(label).width + 20; };
  const sw = c => (x0, y0) => { ctx.fillStyle = c; ctx.fillRect(x0, y0, 12, 12); ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, 11, 11); };
  key(sw(P.us), t('EE. UU.')); key(sw(P.cn), t('China')); key(sw(P.other), t('Otros países'));
  key((x0, y0) => { sw(P.other)(x0, y0); ctx.fillStyle = opts.hatch; ctx.fillRect(x0, y0, 12, 12); }, t('Rayado: pesos abiertos'));
  key((x0, y0) => { ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0 + 6); ctx.lineTo(x0 + 12, y0 + 6); ctx.stroke(); }, t('Intervalo del 90 %'));
  ctx.font = `500 11.5px ${P.body}`; ctx.fillStyle = P.muted;
  ctx.fillText(t('Datos: Epoch AI, Epoch Capabilities Index (CC BY 4.0), con las puntuaciones de hoy.'), 22, 522);
  ctx.textAlign = 'right'; ctx.fillText('moloch-sh.netlify.app', 960 - 22, 522);
  ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, 957, 537);
}

/* ── Estado y animación ─────────────────────────────────────────────────── */
/* Lleva la imagen hacia el estado real en S.cur: posición, longitud y opacidad se acercan con un amortiguado
   exponencial (snap: de golpe). Devuelve si algo sigue moviéndose. */
function settle(dt, snap = false) {
  const st = standing(S.cur), kk = snap ? 1 : 1 - Math.exp(-dt / TAU), seen = new Set();
  let moving = false;
  st.forEach((x, i) => {
    seen.add(x.l.org);
    let d = S.disp.get(x.l.org);
    if (!d) { d = { y: Math.min(i, TOP), v: S.ax.a0, a: 0 }; S.disp.set(x.l.org, d); }
    d.s = x.s; d.l = x.l; d.r = i;
    const ty = Math.min(i, TOP), ta = i < TOP ? 1 : 0;
    d.y += (ty - d.y) * kk; d.v += (x.s.v - d.v) * kk; d.a += (ta - d.a) * kk;
    if (Math.abs(ty - d.y) > 0.002 || Math.abs(x.s.v - d.v) > 0.01 || Math.abs(ta - d.a) > 0.01) moving = true;
    else { d.y = ty; d.v = x.s.v; d.a = ta; }
  });
  for (const [org, d] of S.disp) if (!seen.has(org)) { d.a += (0 - d.a) * kk; d.r = Infinity; if (d.a < 0.01) S.disp.delete(org); else moving = true; }
  S.st = st;
  return moving;
}
function paint() {
  const cv = S.cv;
  if (!cv || !cv.isConnected) return;
  const W = Math.round(cv.parentElement.clientWidth) || 860, G = layout(W), k = devicePixelRatio || 1;
  if (cv.width !== Math.round(W * k) || cv.height !== Math.round(G.H * k)) { cv.width = Math.round(W * k); cv.height = Math.round(G.H * k); cv.style.height = `${G.H}px`; }
  S.G = G;
  const ctx = cv.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  S.P ||= palette();
  if (!S.hp || S.hp.k !== k || S.hp.P !== S.P) S.hp = { k, P: S.P, p: hatch(ctx, k) };
  drawFrame(ctx, G, S.P, k, { hatch: S.hp.p });
}
function loop(ts) {
  S.raf = 0;
  const dt = S.last ? Math.min(80, ts - S.last) : 16;
  S.last = ts;
  if (S.playing) {
    S.cur = Math.min(S.t1, S.cur + dt * (S.t1 - S.t0) / DUR);
    if (S.cur >= S.t1) stopPlay();
    syncRange();
  }
  const moving = settle(dt);
  paint();
  if (S.playing || moving) S.raf = requestAnimationFrame(loop);
  else S.last = 0;
}
function kick() { if (S && !S.raf) S.raf = requestAnimationFrame(loop); }

function play() {
  hideTip();
  if (S.cur >= S.t1) { S.cur = S.t0; S.disp.clear(); }
  S.playing = true; S.played = true; S.last = 0;
  syncButton(); kick();
}
function stopPlay() { S.playing = false; syncButton(); syncList(); }
function seek(T, list = false) {
  S.playing = false; S.cur = Math.max(S.t0, Math.min(S.t1, T));
  syncButton(); syncRange(); kick();
  if (list) syncList();
}

/* ── Interfaz ───────────────────────────────────────────────────────────── */
const $r = s => S.root.querySelector(s);
const pct = T => ((T - S.t0) / (S.t1 - S.t0) * 100).toFixed(2);
function syncButton() {
  const b = $r('.race-play');
  if (!b) return;
  const [ico, txt] = S.playing ? ['❚❚', t('Pausa')] : S.cur >= S.t1 && S.played ? ['↺', t('Repetir')] : ['▶', t('Reproducir')];
  b.innerHTML = `<span aria-hidden="true">${ico}</span> ${esc(txt)}`;
}
function syncRange() {
  const r = $r('.race-range');
  if (!r) return;
  r.value = String(Math.round((S.cur - S.t0) / DAY));
  r.setAttribute('aria-valuetext', fmtDate(iso(S.cur)));
}
/* Lista accesible del fotograma y descripción del canvas: sólo al parar, no en cada fotograma. */
function syncList(T = S.cur) {
  S.listT = T;
  const el = $r('.race-list');
  if (!el) return;
  const st = standing(S.listT).slice(0, TOP), fecha = fmtDate(iso(S.listT));
  $r('.race-data summary').textContent = t('Los datos de este fotograma ({fecha})', { fecha });
  el.innerHTML = `<table class="race-tb"><thead><tr><th>#</th><th>${t('Laboratorio')}</th><th>${t('Modelo')}</th><th>ECI</th><th>${t('Intervalo del 90 %')}</th><th>${t('Publicado')}</th></tr></thead><tbody>${st.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.l.org)}</td><td>${esc(x.s.m)}${x.s.w === 'o' ? ` <span class="w abiertos">${t('abiertos')}</span>` : ''}</td><td><b>${num(x.s.v, 1)}</b></td><td>${x.s.lo != null ? `${num(x.s.lo, 1)}–${num(x.s.hi, 1)}` : '—'}</td><td>${esc(fmtDate(x.s.d))}</td></tr>`).join('')}</tbody></table>`;
  S.cv?.setAttribute('aria-label', t('Carrera del ECI por laboratorio a {fecha}: {lista}.', { fecha, lista: st.map((x, i) => `${i + 1}. ${x.l.org}, ${num(x.s.v, 1)}`).join('; ') }));
}
function rowTip(e) {
  if (!S.G || !S.st) return;
  const rect = S.cv.getBoundingClientRect(), y = e.clientY - rect.top;
  const i = Math.floor((y - S.G.T) / S.G.rowH), x = S.st[i];
  if (i < 0 || i >= TOP || !x) { hideTip(); return; }
  const pais = x.l.c === 'US' ? t('EE. UU.') : x.l.c === 'CN' ? t('China') : t('Otro país');
  showTip(e, tip(x.l.org, [[t('Modelo'), x.s.m], ['ECI', num(x.s.v, 1)], [t('Intervalo del 90 %'), x.s.lo != null ? `${num(x.s.lo, 1)}–${num(x.s.hi, 1)}` : null],
    [t('Publicado'), fmtDate(x.s.d)], [t('Pesos'), x.s.w === 'o' ? t('abiertos') : x.s.w === 'c' ? t('cerrados') : null], [t('País'), pais], [t('Puesto'), `${i + 1}`]],
    t('Puntuación de hoy según Epoch AI.'), x.l.icon), `race:${x.l.org}:${x.s.d}:${i}`);
}
function download() {
  const k = 2, cv = document.createElement('canvas');
  cv.width = 960 * k; cv.height = 540 * k;
  const ctx = cv.getContext('2d'), P = palette();
  const snap = new Map(S.disp);
  S.disp = new Map(); settle(0, true);
  const save = logos => {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawExport(ctx, P, k, { logos });
    cv.toBlob(b => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `moloch-carrera-eci-${iso(S.cur)}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  };
  try { save(true); } catch { save(false); }   // si un navegador marca el canvas por los logos, sin ellos
  S.disp = snap;
}

function build() {
  const { first, changes } = S.lead, span = Math.round((S.t1 - S.t0) / DAY);
  // Logos de los cambios de nº 1 sobre la línea de tiempo; si dos no caben juntos, el segundo sube una fila.
  const rows = [];
  const ticks = changes.map(c => {
    const p = +pct(c.t);
    let row = rows.findIndex(last => p - last > 3.4);
    if (row < 0) row = rows.length < 3 ? rows.length : 0;
    rows[row] = p;
    const label = t('{fecha}: {org} pasa al primer puesto con {modelo} ({eci})', { fecha: fmtDate(iso(c.t)), org: c.l.org, modelo: c.s.m, eci: num(c.s.v, 1) });
    return `<button type="button" class="race-tick${c.margin !== null && c.margin < SAME ? ' tie' : ''}" style="left:${p}%;top:${row * 20}px" data-at="${c.t}" title="${esc(label)}" aria-label="${esc(label)}">${c.l.icon ? `<img src="${esc(c.l.icon)}" alt="" width="12" height="12">` : esc(c.l.org.slice(0, 1))}</button>`;
  }).join('');
  const years = [];
  for (let y = new Date(S.t0).getUTCFullYear(); y <= new Date(S.t1).getUTCFullYear(); y++) { const T = Date.UTC(y, 0, 1); if (T > S.t0 + 60 * DAY && T < S.t1 - 60 * DAY) years.push(`<span style="left:${pct(T)}%">${y}</span>`); }
  years.unshift(`<span class="end-l" style="left:0">${esc(monthYear(S.t0))}</span>`);
  years.push(`<span class="end-r" style="left:100%">${esc(monthYear(S.t1))}</span>`);
  const ties = changes.filter(c => c.margin !== null && c.margin < SAME).length;
  const desde = { modelo: esc(first?.s.m || '—'), org: esc(first?.l.org || '—'), fecha: fmtDate(iso(S.t0)) };
  const story = changes.length
    ? `${t('Desde el primer modelo de la serie ({modelo}, de {org}, {fecha}), el primer puesto ha cambiado de manos {veces}: son los logos sobre la línea de tiempo, y cada uno lleva a ese momento.', { ...desde, veces: tn(changes.length, ['una vez', '{n} veces']) })} ${ties
      ? tn(ties, ['Uno de esos cambios fue por menos de 1 punto, la distancia que Epoch trata como la misma capacidad.', '{n} de esos cambios fueron por menos de 1 punto, la distancia que Epoch trata como la misma capacidad.'])
      : t('Ninguno fue por menos de 1 punto, la distancia que Epoch trata como la misma capacidad.')}`
    : t('Desde el primer modelo de la serie ({modelo}, de {org}, {fecha}), nadie le ha quitado el primer puesto.', desde);
  S.root.innerHTML = `<div class="race-stage"><canvas class="race-cv" role="img"></canvas></div>
    <div class="race-ctl">
      <button type="button" class="race-play"></button>
      <div class="race-track" style="--rows:${Math.max(1, rows.length)}">
        <div class="race-ticks">${ticks}</div>
        <input type="range" class="race-range" min="0" max="${span}" step="1" aria-label="${t('Fecha de la carrera')}">
        <div class="race-years">${years.join('')}</div>
      </div>
      <button type="button" class="race-png">${t('Descargar imagen')}</button>
    </div>
    <div class="legend"><span><i style="background:var(--orange)"></i>${t('EE. UU.')}</span><span><i style="background:var(--open)"></i>${t('China')}</span><span><i style="background:var(--unknown)"></i>${t('Otros países')}</span><span><i class="lg-hatch"></i>${t('Rayado: pesos abiertos')}</span><span><i class="lg-ci"></i>${t('Intervalo del 90 %')}</span><span><i class="lg-lead"></i>${t('Cambio de nº 1')}</span></div>
    <div class="reading"><span class="lbl">${t('Cómo se lee')}</span>${t('Cada barra es el mejor modelo que un laboratorio había publicado en esa fecha, con la puntuación que le da hoy Epoch. Sólo cambia cuando el laboratorio publica un modelo que supera su récord: entre dos récords no se interpola nada, y la cifra es siempre la de un modelo real. Color: país del laboratorio; rayado: pesos abiertos, ambos según Epoch. La raya fina es el intervalo de confianza del 90 %: si dos se solapan, no puede afirmarse cuál va primero. El eje empieza en {a0} puntos, no en cero.', { a0: num(S.ax.a0, 0) })} ${t('Es una reconstrucción con las puntuaciones de hoy, no lo que se medía en cada fecha, y sólo cuentan los modelos que Epoch ha puntuado.')} ${story} ${t('Fuente:')} <a href="${ECI_URL}" target="_blank" rel="noopener">${t('Epoch AI, «Epoch Capabilities Index»')}</a>, CC BY 4.0.</div>
    <details class="race-data"><summary></summary><div class="race-list"></div>${changes.length ? `<h4>${t('Cambios de nº 1')}</h4><ol class="race-changes">${changes.map(c => `<li><b>${esc(fmtDate(iso(c.t)))}</b> · ${t('{org} adelanta a {prev} con {modelo}: ECI {eci}{dif}', { org: esc(c.l.org), prev: esc(c.prev?.l.org || '—'), modelo: esc(c.s.m), eci: num(c.s.v, 1), dif: c.margin !== null ? `, ${tn(Math.round(c.margin * 10) / 10, ['{n} punto más', '{n} puntos más'], { n: num(c.margin, 1) })}${c.margin < SAME ? ` (${t('empate técnico')})` : ''}` : '' })}</li>`).join('')}</ol>` : ''}</details>`;
  S.cv = $r('.race-cv');
  syncButton(); syncRange(); syncList(S.listT);
  $r('.race-play').addEventListener('click', () => { S.autoplayed = true; S.playing ? stopPlay() : play(); });
  const range = $r('.race-range');
  range.addEventListener('input', () => { S.autoplayed = true; seek(S.t0 + Number(range.value) * DAY); });
  range.addEventListener('change', () => syncList());
  $r('.race-ticks').addEventListener('click', e => { const b = e.target.closest('.race-tick'); if (b) { S.autoplayed = true; seek(Number(b.dataset.at) + DAY, true); } });
  $r('.race-png').addEventListener('click', download);
  S.cv.addEventListener('pointermove', rowTip);
  S.cv.addEventListener('pointerdown', rowTip);
  S.cv.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hideTip(); });
  // Arranca sola una vez, al verse. Con «reducir movimiento», queda en el último fotograma.
  S.io?.disconnect();
  if (typeof IntersectionObserver === 'function') {
    S.io = new IntersectionObserver(es => {
      for (const en of es) {
        if (en.intersectionRatio >= 0.45 && !S.autoplayed && !reduced()) { S.autoplayed = true; S.cur = S.t0; S.disp.clear(); play(); }
      }
    }, { threshold: 0.45 });
    S.io.observe(S.cv);
  }
  S.ro?.disconnect();
  if (typeof ResizeObserver === 'function') { S.ro = new ResizeObserver(() => kick()); S.ro.observe(S.root); }
}

let watching = false;
function watchTheme() {
  if (watching) return;
  watching = true;
  const redo = () => { if (S) { S.P = null; kick(); } };
  new MutationObserver(redo).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', redo);
  document.fonts?.ready.then(redo);
}

export function renderRace(root, fact) {
  if (!root) return;
  if (!fact?.v?.length) { root.innerHTML = `<div class="chart-empty">${t('Sin datos suficientes para la carrera.')}</div>`; return; }
  if (!S || S.root !== root || S.key !== `${fact.got}|${fact.asOf}`) { if (S?.raf) cancelAnimationFrame(S.raf); init(root, fact); }
  build();
  watchTheme();
  settle(0, !S.disp.size);
  paint();
  kick();
}
