/* MOLOCH.SH v2.6 — canvas renderers.
   ChaosOscilloscope: 60 FPS cost waveform (log $ vs context) with scanlines, crosshair, jitter and glitch.
   CohortRadar: AA score vs audited cost scatter with Pareto frontier and radar sweep.
   AliasRadar: circular stealth/alias sweep.
   Seismograph: incident timeline as damped seismic spikes. */

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const BG = '#0A0A09';
const GRID = 'rgba(255,255,255,0.055)';
const GRID_MAJOR = 'rgba(255,255,255,0.11)';
const DIM = '#77766F';
const LIME = '#CCFF00';
const CRIMSON = '#FF2A55';
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth));
  const h = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

function scanlines(ctx, w, h, alpha = 0.16) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

function hash(i, salt = 0) {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function fmtUSD(v) {
  if (!Number.isFinite(v)) return 'N/D';
  if (v >= 100) return '$' + v.toFixed(0);
  if (v >= 10) return '$' + v.toFixed(1);
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.1) return '$' + v.toFixed(3);
  return '$' + v.toFixed(4);
}

function fmtK(v) {
  return v >= 1000000 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1000) + 'K';
}

function roundRectPath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
}

/* ── Oscilloscope ─────────────────────────────────────────────────────────── */

export class ChaosOscilloscope {
  constructor(canvas, { compute }) {
    this.canvas = canvas;
    this.compute = compute;
    this.cur = new Map();
    this.data = null;
    this.hidden = new Set();
    this.glitch = 0;
    this.jitterBoost = 0;
    this.mouse = null;
    this.yLo = -2;
    this.yHi = 1;
    this.lastT = 0;
    this.jitterPct = 0;
    this.flashUntil = new Map();
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    canvas.addEventListener('pointerleave', () => { this.mouse = null; });
  }

  /* Temporarily render the given series as hot (e.g. models mutated by an ingest). */
  flash(ids, ms = 4500) {
    const until = performance.now() + ms;
    ids.forEach(id => this.flashUntil.set(id, until));
  }

  static toLog(v) { return Math.log10(Math.max(v, 0.0005)); }

  /* from: optional map id → values[] to start the transition from (e.g. subsidized prices). */
  refresh(from = null) {
    this.data = this.compute();
    for (const s of this.data.series) {
      const tgt = s.values.map(ChaosOscilloscope.toLog);
      if (from && from[s.id]) this.cur.set(s.id, from[s.id].map(ChaosOscilloscope.toLog));
      else if (!this.cur.has(s.id) || this.cur.get(s.id).length !== tgt.length) this.cur.set(s.id, tgt.slice());
      s.logs = tgt;
    }
  }

  inject(strength = 1) {
    this.glitch = reduceMotion ? 0 : Math.max(this.glitch, strength);
    this.jitterBoost = Math.max(this.jitterBoost, strength);
  }

  toggle(id) {
    if (this.hidden.has(id)) this.hidden.delete(id); else this.hidden.add(id);
  }

  frame(now) {
    if (!this.data) this.refresh();
    const dt = Math.min(64, now - (this.lastT || now));
    this.lastT = now;
    const { ctx, w, h } = fit(this.canvas);
    const pad = { l: 46, r: 92, t: 22, b: 30 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const xs = this.data.xs;
    const x0 = xs[0], x1 = xs[xs.length - 1];
    const k = 1 - Math.exp(-dt / 150);

    let lo = Infinity, hi = -Infinity;
    for (const s of this.data.series) {
      if (this.hidden.has(s.id)) continue;
      const cur = this.cur.get(s.id);
      for (let i = 0; i < cur.length; i++) {
        cur[i] += (s.logs[i] - cur[i]) * k;
        lo = Math.min(lo, s.logs[i], cur[i]);
        hi = Math.max(hi, s.logs[i], cur[i]);
      }
    }
    if (!Number.isFinite(lo)) { lo = -2; hi = 1; }
    const tLo = Math.floor(lo - 0.05), tHi = Math.max(Math.ceil(hi + 0.05), tLo + 2);
    this.yLo += (tLo - this.yLo) * k;
    this.yHi += (tHi - this.yHi) * k;

    const X = v => pad.l + (v - x0) / (x1 - x0) * pw;
    const Y = lv => pad.t + (1 - (lv - this.yLo) / (this.yHi - this.yLo)) * ph;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const gx = pad.l + pw * i / 10;
      ctx.strokeStyle = i % 5 === 0 ? GRID_MAJOR : GRID;
      ctx.beginPath(); ctx.moveTo(Math.round(gx) + 0.5, pad.t); ctx.lineTo(Math.round(gx) + 0.5, pad.t + ph); ctx.stroke();
    }
    ctx.font = `10px ${MONO}`;
    ctx.textBaseline = 'middle';
    for (let d = Math.ceil(this.yLo); d <= Math.floor(this.yHi); d++) {
      const gy = Y(d);
      ctx.strokeStyle = GRID_MAJOR;
      ctx.beginPath(); ctx.moveTo(pad.l, Math.round(gy) + 0.5); ctx.lineTo(pad.l + pw, Math.round(gy) + 0.5); ctx.stroke();
      ctx.fillStyle = DIM;
      ctx.textAlign = 'right';
      ctx.fillText(d >= 0 ? '$' + Math.pow(10, d) : '$' + Math.pow(10, d).toFixed(-d), pad.l - 6, gy);
      for (let m = 2; m < 10; m++) {
        const my = Y(d + Math.log10(m));
        if (my < pad.t || my > pad.t + ph) continue;
        ctx.strokeStyle = GRID;
        ctx.beginPath(); ctx.moveTo(pad.l, Math.round(my) + 0.5); ctx.lineTo(pad.l + pw, Math.round(my) + 0.5); ctx.stroke();
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = DIM;
    [10000, 100000, 200000, 300000, 400000, 500000].forEach(v => ctx.fillText(fmtK(v), X(v), pad.t + ph + 8));

    if (this.data.cliffX) {
      const cx = X(this.data.cliffX);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = this.data.cliffActive ? CRIMSON : 'rgba(255,42,85,0.45)';
      ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, pad.t); ctx.lineTo(Math.round(cx) + 0.5, pad.t + ph); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = this.data.cliffActive ? CRIMSON : 'rgba(255,42,85,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText('>100K CLIFF', cx + 4, pad.t + 2);
    }
    if (this.data.auditX) {
      const ax = X(this.data.auditX);
      ctx.save();
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = 'rgba(204,255,0,0.35)';
      ctx.beginPath(); ctx.moveTo(Math.round(ax) + 0.5, pad.t + 14); ctx.lineTo(Math.round(ax) + 0.5, pad.t + ph); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(204,255,0,0.7)';
      ctx.textAlign = 'left';
      ctx.fillText('AUDIT 150K', ax + 4, pad.t + 16);
    }

    this.jitterBoost = Math.max(0, this.jitterBoost - dt / 1600);
    const amp = reduceMotion ? 0 : 0.0025 + this.jitterBoost * 0.045;
    this.jitterPct = (Math.pow(10, amp) - 1) * 100;
    const t = now / 1000;

    const ends = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, pw, ph);
    ctx.clip();
    for (const s of this.data.series) {
      if (this.hidden.has(s.id)) continue;
      const cur = this.cur.get(s.id);
      const hot = s.hot || (this.flashUntil.get(s.id) || 0) > now;
      const pts = cur.map((lv, i) => {
        const j = amp * (Math.sin(i * 1.7 + t * 9.3 + hash(i, s.id.length)) * 0.6 + Math.sin(i * 0.37 - t * 4.1) * 0.4);
        return [X(xs[i]), Y(lv + j)];
      });
      if (s.ghost) {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        s.ghost.forEach((v, i) => { const p = [X(xs[i]), Y(ChaosOscilloscope.toLog(v))]; i ? ctx.lineTo(...p) : ctx.moveTo(...p); });
        ctx.stroke();
        ctx.restore();
      }
      if (hot) {
        const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
        g.addColorStop(0, s.color + '55');
        g.addColorStop(1, s.color + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
        ctx.lineTo(pts[pts.length - 1][0], pad.t + ph);
        ctx.lineTo(pts[0][0], pad.t + ph);
        ctx.closePath();
        ctx.fill();
      }
      ctx.save();
      ctx.shadowColor = s.color;
      ctx.shadowBlur = hot ? 14 : 7;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = hot ? 2.6 : 1.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
      ctx.stroke();
      ctx.restore();
      ends.push({ y: pts[pts.length - 1][1], color: s.color, label: s.label, v: Math.pow(10, cur[cur.length - 1]) });
    }
    if (!reduceMotion) {
      const sx = pad.l + ((now / 2600) % 1) * pw;
      const bg = ctx.createLinearGradient(sx - 60, 0, sx, 0);
      bg.addColorStop(0, 'rgba(204,255,0,0)');
      bg.addColorStop(1, 'rgba(204,255,0,0.10)');
      ctx.fillStyle = bg;
      ctx.fillRect(sx - 60, pad.t, 60, ph);
      ctx.strokeStyle = 'rgba(204,255,0,0.35)';
      ctx.beginPath(); ctx.moveTo(Math.round(sx) + 0.5, pad.t); ctx.lineTo(Math.round(sx) + 0.5, pad.t + ph); ctx.stroke();
    }
    ctx.restore();

    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 11) ends[i].y = ends[i - 1].y + 11;
    const overflow = ends.length ? ends[ends.length - 1].y - (pad.t + ph) : 0;
    if (overflow > 0) ends.forEach(e => { e.y -= overflow; });
    ctx.font = `9.5px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const e of ends) {
      ctx.fillStyle = e.color;
      ctx.fillRect(pad.l + pw + 5, e.y - 3, 6, 6);
      ctx.fillText(e.label.slice(0, 13), pad.l + pw + 14, e.y);
    }

    ctx.strokeStyle = '#2C2C29';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, pw, ph);

    ctx.font = `10px ${MONO}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM;
    ctx.fillText(`JITTER: ±${this.jitterPct.toFixed(2)}% // ${this.data.footer || ''}`, pad.l + 6, pad.t + ph - 7);
    ctx.textAlign = 'right';
    ctx.fillStyle = LIME;
    ctx.fillText(`FRAME_SYNC: ${Math.round(this.data.fps || 60)}Hz`, pad.l + pw - 6, pad.t + ph - 7);

    if (this.mouse && this.mouse.x >= pad.l && this.mouse.x <= pad.l + pw && this.mouse.y >= pad.t && this.mouse.y <= pad.t + ph) {
      const v = x0 + (this.mouse.x - pad.l) / pw * (x1 - x0);
      let idx = 0, best = Infinity;
      xs.forEach((xv, i) => { const d = Math.abs(xv - v); if (d < best) { best = d; idx = i; } });
      const cx = X(xs[idx]);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(204,255,0,0.75)';
      ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, pad.t); ctx.lineTo(Math.round(cx) + 0.5, pad.t + ph); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.l, Math.round(this.mouse.y) + 0.5); ctx.lineTo(pad.l + pw, Math.round(this.mouse.y) + 0.5); ctx.stroke();
      ctx.restore();
      const rows = this.data.series.filter(s => !this.hidden.has(s.id))
        .map(s => ({ label: s.label, color: s.color, v: Math.pow(10, this.cur.get(s.id)[idx]) }))
        .sort((a, b) => b.v - a.v);
      const cursorUsd = Math.pow(10, this.yLo + (1 - (this.mouse.y - pad.t) / ph) * (this.yHi - this.yLo));
      const lh = 13, bw = 186, bh = 30 + rows.length * lh;
      let bx = cx + 12, by = Math.min(Math.max(pad.t + 4, this.mouse.y - bh / 2), pad.t + ph - bh - 4);
      if (bx + bw > pad.l + pw) bx = cx - bw - 12;
      ctx.fillStyle = 'rgba(10,10,9,0.94)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = LIME;
      roundRectPath(ctx, bx, by, bw, bh);
      ctx.stroke();
      ctx.font = `bold 10px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = LIME;
      ctx.fillText(`CTX ${fmtK(xs[idx])} · CURSOR ${fmtUSD(cursorUsd)}`, bx + 8, by + 7);
      ctx.font = `10px ${MONO}`;
      rows.forEach((r, i) => {
        const ry = by + 24 + i * lh;
        ctx.fillStyle = r.color;
        ctx.fillRect(bx + 8, ry + 2, 6, 6);
        ctx.fillStyle = '#E8E7E1';
        ctx.fillText(r.label.slice(0, 16), bx + 20, ry);
        ctx.textAlign = 'right';
        ctx.fillText(fmtUSD(r.v), bx + bw - 8, ry);
        ctx.textAlign = 'left';
      });
    }

    if (this.glitch > 0) {
      const dpr = this.canvas.width / w;
      const bands = 5;
      for (let i = 0; i < bands; i++) {
        const by = Math.floor(hash(i, Math.floor(now / 40)) * h);
        const bh = 4 + Math.floor(hash(i + 9, Math.floor(now / 40)) * 18);
        const off = (hash(i + 3, Math.floor(now / 40)) - 0.5) * 40 * this.glitch;
        ctx.drawImage(this.canvas, 0, by * dpr, this.canvas.width, bh * dpr, off, by, w, bh);
      }
      ctx.fillStyle = `rgba(255,42,85,${0.12 * this.glitch})`;
      ctx.fillRect(0, 0, w, h);
      this.glitch = Math.max(0, this.glitch - dt / 650);
    }
    scanlines(ctx, w, h);
  }
}

/* ── Cohort radar: AA vs audited cost ─────────────────────────────────────── */

export class CohortRadar {
  constructor(canvas, { compute }) {
    this.canvas = canvas;
    this.compute = compute;
    this.points = [];
    this.mouse = null;
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    canvas.addEventListener('pointerleave', () => { this.mouse = null; });
  }

  refresh() { this.points = this.compute(); }

  frame(now) {
    if (!this.points.length) this.refresh();
    const { ctx, w, h } = fit(this.canvas);
    const pad = { l: 46, r: 18, t: 22, b: 34 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const pts = this.points;
    const costs = pts.map(p => Math.log10(p.cost));
    const lo = Math.floor(Math.min(...costs) - 0.1), hi = Math.ceil(Math.max(...costs) + 0.1);
    const aaLo = Math.floor((Math.min(...pts.map(p => p.aa)) - 2) / 2) * 2, aaHi = Math.ceil((Math.max(...pts.map(p => p.aa)) + 2) / 2) * 2;
    const X = c => pad.l + (Math.log10(c) - lo) / (hi - lo) * pw;
    const Y = a => pad.t + (1 - (a - aaLo) / (aaHi - aaLo)) * ph;

    ctx.font = `10px ${MONO}`;
    ctx.lineWidth = 1;
    for (let d = lo; d <= hi; d++) {
      const gx = X(Math.pow(10, d));
      ctx.strokeStyle = GRID_MAJOR;
      ctx.beginPath(); ctx.moveTo(Math.round(gx) + 0.5, pad.t); ctx.lineTo(Math.round(gx) + 0.5, pad.t + ph); ctx.stroke();
      ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(fmtUSD(Math.pow(10, d)), gx, pad.t + ph + 6);
    }
    for (let a = aaLo; a <= aaHi; a += 2) {
      const gy = Y(a);
      ctx.strokeStyle = a % 10 === 0 ? GRID_MAJOR : GRID;
      ctx.beginPath(); ctx.moveTo(pad.l, Math.round(gy) + 0.5); ctx.lineTo(pad.l + pw, Math.round(gy) + 0.5); ctx.stroke();
      ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(a), pad.l - 6, gy);
    }
    ctx.fillStyle = DIM; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('AA v4.3.2 ↑', 6, 6);
    ctx.textAlign = 'right';
    ctx.fillText('AUDITED $/TASK (LOG) →', pad.l + pw, pad.t + ph + 20);

    const sorted = [...pts].sort((a, b) => a.cost - b.cost);
    const frontier = [];
    let best = -Infinity;
    for (const p of sorted) if (p.aa > best) { frontier.push(p); best = p.aa; }
    ctx.save();
    ctx.strokeStyle = LIME;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    frontier.forEach((p, i) => { const q = [X(p.cost), Y(p.aa)]; i ? ctx.lineTo(...q) : ctx.moveTo(...q); });
    ctx.stroke();
    ctx.restore();

    const ox = pad.l, oy = pad.t + ph;
    const ang = reduceMotion ? -Math.PI / 4 : -((now / 3200) % 1) * Math.PI / 2;
    const R = Math.hypot(pw, ph);
    if (!reduceMotion) {
      ctx.save();
      ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();
      const sweep = ctx.createRadialGradient(ox, oy, 0, ox, oy, R);
      sweep.addColorStop(0, 'rgba(0,229,255,0.16)');
      sweep.addColorStop(1, 'rgba(0,229,255,0.02)');
      ctx.fillStyle = sweep;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, R, ang, ang + 0.22); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    let hover = null;
    ctx.font = `10px ${MONO}`;
    for (const p of pts) {
      const px = X(p.cost), py = Y(p.aa);
      const pa = Math.atan2(py - oy, px - ox);
      const lit = reduceMotion ? 1 : Math.max(0, 1 - (((ang - pa) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / 1.2);
      const size = p.frontier ? 9 : 7;
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6 + lit * 16;
      ctx.fillStyle = p.color;
      p.block === 'open' ? ctx.fillRect(px - size / 2, py - size / 2, size, size) : (ctx.beginPath(), ctx.moveTo(px, py - size / 1.6), ctx.lineTo(px + size / 1.6, py), ctx.lineTo(px, py + size / 1.6), ctx.lineTo(px - size / 1.6, py), ctx.closePath(), ctx.fill());
      ctx.restore();
      ctx.fillStyle = `rgba(232,231,225,${0.55 + lit * 0.45})`;
      ctx.textAlign = px > pad.l + pw - 110 ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, px + (ctx.textAlign === 'right' ? -9 : 9), py);
      if (this.mouse && Math.hypot(this.mouse.x - px, this.mouse.y - py) < 10) hover = { p, px, py };
    }
    if (hover) {
      const lines = [hover.p.label, `AA ${hover.p.aa.toFixed(1)} · ${fmtUSD(hover.p.cost)}/task`, hover.p.block === 'open' ? 'OPEN / CHINESE MoE' : 'US PROPRIETARY'];
      const bw = 200, bh = 50;
      let bx = hover.px + 12, by = hover.py - bh - 6;
      if (bx + bw > w) bx = hover.px - bw - 12;
      if (by < 0) by = hover.py + 10;
      ctx.fillStyle = 'rgba(10,10,9,0.95)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = LIME; roundRectPath(ctx, bx, by, bw, bh); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => { ctx.fillStyle = i ? '#E8E7E1' : LIME; ctx.fillText(l, bx + 8, by + 6 + i * 13); });
    }
    ctx.fillStyle = LIME; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('— — PARETO FRONTIER', pad.l + pw - 4, pad.t + 4);
    scanlines(ctx, w, h, 0.12);
  }
}

/* ── Alias radar ──────────────────────────────────────────────────────────── */

const STATUS_COLOR = { UNMASKED: LIME, 'SILENT SWAP': '#FFB300', 'BILLING TRAP': CRIMSON, 'NATIVE QUANT': '#00E5FF', 'PINNED SNAPSHOT': '#00E676' };

export class AliasRadar {
  constructor(canvas, { getAliases, onPick }) {
    this.canvas = canvas;
    this.getAliases = getAliases;
    this.onPick = onPick;
    this.mouse = null;
    this.hits = [];
    this.lastSweep = new Map();
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      canvas.style.cursor = this.hitTest() ? 'pointer' : 'crosshair';
    });
    canvas.addEventListener('pointerleave', () => { this.mouse = null; });
    canvas.addEventListener('click', () => { const h = this.hitTest(); if (h) this.onPick(h.id); });
  }

  hitTest() {
    if (!this.mouse) return null;
    return this.hits.find(hh => Math.hypot(this.mouse.x - hh.x, this.mouse.y - hh.y) < 14) || null;
  }

  frame(now) {
    const { ctx, w, h } = fit(this.canvas);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 22;
    ctx.strokeStyle = 'rgba(0,230,118,0.22)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * i / 4, 0, Math.PI * 2); ctx.stroke(); }
    for (let a = 0; a < 360; a += 30) {
      const r = a * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(r) * R, cy + Math.sin(r) * R); ctx.stroke();
      ctx.fillStyle = DIM; ctx.font = `9px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(a).padStart(3, '0'), cx + Math.cos(r) * (R + 12), cy + Math.sin(r) * (R + 12));
    }
    const sweepDeg = reduceMotion ? 0 : (now / 16) % 360;
    const sweep = sweepDeg * Math.PI / 180;
    if (!reduceMotion) {
      for (let i = 0; i < 28; i++) {
        const a0 = sweep - i * 0.02;
        ctx.fillStyle = `rgba(0,230,118,${0.2 * (1 - i / 28)})`;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 - 0.02, a0); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,230,118,0.9)';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); ctx.stroke();
    }
    this.hits = [];
    const hov = this.hitTest();
    for (const a of this.getAliases()) {
      const r = a.angle * Math.PI / 180;
      const x = cx + Math.cos(r) * R * a.radius, y = cy + Math.sin(r) * R * a.radius;
      const diff = ((sweepDeg - a.angle) % 360 + 360) % 360;
      const lit = reduceMotion ? 1 : Math.max(0.25, 1 - diff / 300);
      const color = a.masked ? '#FFFFFF' : (STATUS_COLOR[a.status] || LIME);
      ctx.save();
      ctx.globalAlpha = lit;
      ctx.shadowColor = color; ctx.shadowBlur = 18 * lit;
      ctx.fillStyle = color;
      ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.restore();
      if (a.masked && !reduceMotion) {
        const pr = 10 + ((now / 30) % 26);
        ctx.strokeStyle = `rgba(255,255,255,${1 - (pr - 10) / 26})`;
        ctx.strokeRect(x - pr / 2, y - pr / 2, pr, pr);
      }
      if (hov && hov.id === a.id) { ctx.strokeStyle = LIME; ctx.lineWidth = 2; ctx.strokeRect(x - 9, y - 9, 18, 18); ctx.lineWidth = 1; }
      ctx.fillStyle = `rgba(232,231,225,${0.4 + lit * 0.6})`;
      ctx.font = `10px ${MONO}`;
      ctx.textAlign = x > cx ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.masked ? '██ ' + a.alias.split('/').pop() : a.alias.split('/').pop(), x + (x > cx ? 10 : -10), y);
      this.hits.push({ id: a.id, x, y });
    }
    ctx.fillStyle = LIME; ctx.font = `bold 10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('ALIAS SWEEP // OPENROUTER SLUG SPACE', 8, 8);
    ctx.fillStyle = DIM; ctx.textBaseline = 'bottom';
    ctx.fillText(`AZIMUTH ${sweepDeg.toFixed(0).padStart(3, '0')}°`, 8, h - 8);
    scanlines(ctx, w, h, 0.14);
  }
}

/* ── Thesis seismograph ───────────────────────────────────────────────────── */

const SEV_COLOR = ['#00E676', '#00E676', '#00E5FF', '#FFB300', '#FF5722', CRIMSON];

export class Seismograph {
  constructor(canvas, { getIncidents, start, end, onPick }) {
    this.canvas = canvas;
    this.getIncidents = getIncidents;
    this.start = start;
    this.end = end;
    this.onPick = onPick;
    this.mouse = null;
    this.hits = [];
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      canvas.style.cursor = this.hitTest() ? 'pointer' : 'default';
    });
    canvas.addEventListener('pointerleave', () => { this.mouse = null; });
    canvas.addEventListener('click', () => { const h = this.hitTest(); if (h) this.onPick(h.id); });
  }

  hitTest() {
    if (!this.mouse) return null;
    let best = null, bd = 16;
    for (const h of this.hits) { const d = Math.abs(this.mouse.x - h.x); if (d < bd) { bd = d; best = h; } }
    return best;
  }

  frame(now) {
    const { ctx, w, h } = fit(this.canvas);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const pad = { l: 16, r: 16, t: 18, b: 26 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const incidents = this.getIncidents();
    const t0 = this.start.getTime();
    const lastInc = incidents.reduce((m, i) => Math.max(m, Date.parse(i.date + 'T12:00:00Z')), 0);
    const t1 = Math.max(this.end.getTime(), lastInc + 3 * 864e5);
    const X = ms => pad.l + (ms - t0) / (t1 - t0) * pw;
    const mid = pad.t + ph / 2;

    ctx.strokeStyle = GRID;
    for (let d = t0; d <= t1; d += 864e5) {
      const day = new Date(d);
      const gx = Math.round(X(d)) + 0.5;
      const major = day.getUTCDate() === 1 || day.getUTCDay() === 1;
      ctx.strokeStyle = day.getUTCDate() === 1 ? GRID_MAJOR : GRID;
      if (major) { ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, pad.t + ph); ctx.stroke(); }
      if (day.getUTCDate() === 1 || day.getUTCDate() === 15) {
        ctx.fillStyle = DIM; ctx.font = `10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(day.toISOString().slice(5, 10), gx, pad.t + ph + 8);
      }
    }
    ctx.strokeStyle = GRID_MAJOR;
    ctx.beginPath(); ctx.moveTo(pad.l, mid + 0.5); ctx.lineTo(pad.l + pw, mid + 0.5); ctx.stroke();

    const evs = incidents.map(i => ({ ...i, x: X(Date.parse(i.date + 'T12:00:00Z')) }));
    const t = reduceMotion ? 0 : now / 1000;
    ctx.save();
    ctx.shadowColor = '#00E676';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#00E676';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let px = 0; px <= pw; px += 1.5) {
      const x = pad.l + px;
      let y = Math.sin(px * 0.21 + t * 6) * 1.2 + Math.sin(px * 0.057 - t * 2.3) * 1.6 + (hash(Math.floor(px), Math.floor(t * 12)) - 0.5) * 1.6;
      for (const e of evs) {
        const d = x - e.x;
        if (d < -4 || d > 90) continue;
        const env = d < 0 ? (d + 4) / 4 : Math.exp(-d / (10 + e.sev * 3));
        y += Math.sin(d * 0.9 - t * 3) * env * (ph * 0.09 * e.sev);
      }
      px ? ctx.lineTo(x, mid + y) : ctx.moveTo(x, mid + y);
    }
    ctx.stroke();
    ctx.restore();

    this.hits = [];
    const hov = this.hitTest();
    ctx.font = `bold 10px ${MONO}`;
    for (const e of evs) {
      const c = SEV_COLOR[e.sev] || LIME;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(e.x) - 4, pad.t - 2, 8, 8);
      ctx.strokeStyle = c + '66';
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(Math.round(e.x) + 0.5, pad.t + 6); ctx.lineTo(Math.round(e.x) + 0.5, pad.t + ph); ctx.stroke();
      ctx.setLineDash([]);
      this.hits.push({ id: e.id, x: e.x });
    }
    if (hov) {
      const e = evs.find(x => x.id === hov.id);
      const label = `${e.date} · SEV ${e.sev} · ${e.title}`;
      ctx.font = `10px ${MONO}`;
      const tw = Math.min(ctx.measureText(label).width + 16, w - 20);
      let bx = e.x + 10;
      if (bx + tw > w - 6) bx = e.x - tw - 10;
      ctx.fillStyle = 'rgba(10,10,9,0.95)'; ctx.fillRect(bx, pad.t + 10, tw, 22);
      ctx.strokeStyle = LIME; roundRectPath(ctx, bx, pad.t + 10, tw, 22); ctx.stroke();
      ctx.fillStyle = '#E8E7E1'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.beginPath(); ctx.rect(bx, pad.t + 10, tw - 6, 22); ctx.clip();
      ctx.fillText(label, bx + 8, pad.t + 21);
      ctx.restore();
    }
    const nowX = X(this.end.getTime());
    ctx.fillStyle = LIME; ctx.fillRect(Math.round(nowX) - 1, pad.t, 2, ph);
    ctx.font = `bold 10px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('NOW', nowX - 4, pad.t + ph);
    scanlines(ctx, w, h, 0.12);
  }
}

export { fmtUSD, fmtK };
