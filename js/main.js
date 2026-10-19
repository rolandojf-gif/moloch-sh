/* MOLOCH.SH v2.6 — kernel orchestrator: state, rendering, interaction. */

import {
  KERNEL_VERSION, SEED_DATE, STALENESS_LIMIT_DAYS, AUDIT, ROTATION,
  SEED_MODELS, SEED_INCIDENTS, SEED_ALIASES, ROUTER_PRESETS, BANK_TOOLS, ROUTER_BANK, ROUTER_API,
  PROMPT_V2, SIMULATED_SIGNAL_19OCT,
  isValley, minutesToTariffSwitch, hasPrice, agenticCost, blendedNominal, burnPressure, subsidyStress
} from './seed-data.js';
import { AudioSynth } from './audio-synth.js';
import { ChaosOscilloscope, CohortRadar, AliasRadar, Seismograph } from './chaos-oscilloscope.js';
import { loadGeminiConfig, saveGeminiConfig, clearGeminiConfig, parseLocal, parseWithGemini, applyParsed, DEFAULT_GEMINI_MODEL } from './gemini-ingestor.js';

/* ── Utilities ────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'moloch.state.v26';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function usd(v) {
  if (!Number.isFinite(v)) return 'N/D';
  const a = Math.abs(v);
  return '$' + (a !== 0 && a < 0.01 ? v.toFixed(4) : a < 0.1 && a !== 0 ? v.toFixed(3) : v.toFixed(2));
}
function px(v) {
  if (!Number.isFinite(v)) return 'N/D';
  return '$' + (v !== 0 && v < 0.1 ? v.toFixed(3) : v.toFixed(2));
}
function kTok(v) { return v >= 1e6 ? (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : Math.round(v / 1000) + 'K'; }
function tv(v) { return Number.isInteger(v) ? v.toFixed(1) : String(v); }
function pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }
function hms(sec) { return `${pad2(sec / 3600)}:${pad2((sec % 3600) / 60)}:${pad2(sec % 60)}`; }
function fmtDur(min) { const m = Math.max(0, Math.round(min)); return `${Math.floor(m / 60)}h${pad2(m % 60)}m`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function seedAgeDays() { return Math.floor((Date.parse(todayISO()) - Date.parse(SEED_DATE)) / 864e5); }
let idCounter = 0;
function makeId(base) { return String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) + '-' + Date.now().toString(36) + (idCounter++).toString(36); }

/* ── State ────────────────────────────────────────────────────────────────── */

function freshMarket() {
  return { models: clone(SEED_MODELS), incidents: clone(SEED_INCIDENTS), aliases: clone(SEED_ALIASES), thesis: 'CONFIRMED' };
}

function freshState() {
  return {
    v: 1,
    ...freshMarket(),
    xray: false,
    sfx: true,
    achievements: [],
    faults: { cliff: false, bloat: false, subsidy: false, fp8: false },
    scopeSteps: AUDIT.steps,
    router: { preset: 'babel', ctx: 140000, steps: 14, text: ROUTER_PRESETS[0].label },
    bank: { active: 'codex', tools: { codex: { hours: 48, quota: 60 }, 'claude-code': { hours: 96, quota: 35 } } },
    matrix: { block: 'all', rot: 'all', q: '', sort: 'audited', dir: 1 },
    log: [],
    lastIngest: null,
    realDirty: false,
    selectedAlias: null
  };
}

function hydrate(raw) {
  const base = freshState();
  if (!raw || typeof raw !== 'object') return base;
  const seedById = new Map(SEED_MODELS.map(m => [m.id, m]));
  if (Array.isArray(raw.models) && raw.models.length) {
    base.models = raw.models.filter(m => m && m.id && m.name).map(m => ({ ...(seedById.get(m.id) ? clone(seedById.get(m.id)) : {}), ...m, price: { in: null, out: null, cache: null, ...(m.price || {}) } }));
  }
  if (Array.isArray(raw.incidents)) base.incidents = raw.incidents.filter(i => i && i.id && i.date && i.title);
  if (Array.isArray(raw.aliases)) base.aliases = raw.aliases.filter(a => a && a.id && a.alias);
  for (const k of ['thesis', 'xray', 'sfx', 'scopeSteps', 'lastIngest', 'selectedAlias', 'realDirty']) if (raw[k] !== undefined) base[k] = raw[k];
  if (Array.isArray(raw.achievements)) base.achievements = raw.achievements.filter(a => typeof a === 'string');
  if (raw.faults) Object.keys(base.faults).forEach(k => { base.faults[k] = !!raw.faults[k]; });
  if (raw.router) Object.assign(base.router, raw.router);
  if (raw.bank && raw.bank.tools) { base.bank.active = raw.bank.active in base.bank.tools ? raw.bank.active : 'codex'; Object.keys(base.bank.tools).forEach(k => Object.assign(base.bank.tools[k], raw.bank.tools[k] || {})); }
  if (raw.matrix) Object.assign(base.matrix, raw.matrix);
  if (Array.isArray(raw.log)) base.log = raw.log.slice(0, 120);
  return base;
}

function loadState() {
  try { return hydrate(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch { return freshState(); }
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable: session-only state */ }
  }, 120);
}

const state = loadState();
const synth = new AudioSynth(state.sfx);
const model = id => state.models.find(m => m.id === id);
const tariff = () => (isValley(new Date()) ? 'valley' : 'peak');

function scenario(extra = {}) {
  return { tariff: tariff(), cliff: state.faults.cliff || state.xray, bloat: state.faults.bloat, fp8: state.faults.fp8, ...extra };
}
function audited(m, extra = {}) {
  return agenticCost(m, { ctx: AUDIT.ctx, steps: AUDIT.steps, tariff: tariff(), cliff: true, ...extra });
}

/* ── Audit log ────────────────────────────────────────────────────────────── */

function log(lv, msg) {
  state.log.unshift({ t: new Date().toISOString(), lv, msg });
  state.log.length = Math.min(state.log.length, 120);
  if (conTab === 'log') renderAuditLog();
  save();
}

function renderAuditLog() {
  $('#audit-log').innerHTML = state.log.length
    ? state.log.map(e => `<li><time datetime="${esc(e.t)}">${esc(e.t.slice(11, 19))}Z</time><span class="lv ${esc(e.lv)}">${esc(e.lv.toUpperCase())}</span><span>${esc(e.msg)}</span></li>`).join('')
    : '<li><span></span><span class="lv sys">SYS</span><span>Sin eventos todavía. Inyecta un fallo o ingiere una señal.</span></li>';
}

/* ── Toasts & achievements ────────────────────────────────────────────────── */

function toast({ kicker, title, body, icon = '🏆', kind = '' , ttl = 6500 }) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="toast-ico" aria-hidden="true">${esc(icon)}</div><div><span class="toast-kicker">${esc(kicker)}</span><h4>${esc(title)}</h4>${body ? `<p>${esc(body)}</p>` : ''}</div><button class="x" aria-label="Cerrar">×</button>`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 240); };
  el.querySelector('.x').addEventListener('click', close);
  $('#toasts').appendChild(el);
  setTimeout(close, ttl);
  while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
}

const ACHIEVEMENTS = [
  { id: 'xray', title: 'X-Ray Auditor', desc: 'Activaste X-RAY: el precio nominal dejó paso al coste agéntico auditado.' },
  { id: 'cliff', title: 'Haiku Cliff Exposed', desc: 'Cruzaste 100,001 tokens: Haiku 5.5 paga 5× en cada call sobre el umbral.' },
  { id: 'bunny', title: 'Space Bunny Unmasked', desc: 'Desenmascaraste stealth/space-bunny-alpha: es MiniMax M3.1 Flash.' },
  { id: 'bank', title: 'Bank Burner', desc: 'Entraste en la zona USE-IT-OR-LOSE-IT: coste marginal 0 $.' },
  { id: 'mutator', title: 'Gemini Flash Mutator', desc: 'Ingeriste una señal diaria y el kernel mutó su estado.' },
  { id: 'chaos', title: 'Full Chaos Monkey', desc: 'Los cuatro fallos de facturación activos a la vez.' },
  { id: 'operator', title: 'Command Line Operator', desc: 'Abriste la paleta de comandos ⌘K.' }
];

function unlock(id) {
  if (state.achievements.includes(id)) return;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  state.achievements.push(id);
  const n = ACHIEVEMENTS.indexOf(a) + 1;
  toast({ kicker: `★ ACHIEVEMENT UNLOCKED // ACH-${pad2(n)}`, title: `${pad2(n)}. ${a.title}`, body: a.desc });
  synth.achievement();
  log('sys', `ACHIEVEMENT ${pad2(n)} · ${a.title}`);
  renderAchievements();
  save();
}

function renderAchievements() {
  $$('[data-k="ach-count"]').forEach(e => { e.textContent = `${state.achievements.length}/${ACHIEVEMENTS.length}`; });
  $('#ach-list').innerHTML = ACHIEVEMENTS.map((a, i) => {
    const on = state.achievements.includes(a.id);
    return `<li class="${on ? 'on' : ''}"><span>${on ? '★' : '☆'}</span><b>${pad2(i + 1)}. ${esc(a.title)}</b><small>${on ? esc(a.desc) : 'Bloqueado. Explora el kernel.'}</small></li>`;
  }).join('');
}

/* ── Ticker ───────────────────────────────────────────────────────────────── */

const TICKER = [
  ['ds', 'DEEPSEEK-1017 WINDOW:'],
  ['spread', 'OPEN VS CLOSED SPREAD:'],
  ['stealth', 'STEALTH LEADER:'],
  ['thesis', 'THESIS AUDIT:'],
  ['cliff', 'HAIKU 5.5 CLIFF:'],
  ['seed', 'SEED AGE:'],
  ['mode', 'MODE:']
];

function buildTicker() {
  const items = TICKER.map(([k, label]) => `<span class="tk-item"><span class="tk-k">${label}</span><span class="tk-v" data-tk="${k}"></span></span>`).join('');
  $('#ticker-track').innerHTML = items + items.replace(/class="tk-item"/g, 'class="tk-item" aria-hidden="true"');
}

function setTk(k, html, cls = '') {
  $$(`[data-tk="${k}"]`).forEach(e => { e.innerHTML = html; e.className = `tk-v ${cls}`; });
}

function updateTicker() {
  const now = new Date();
  $$('[data-k="utc"]').forEach(e => { e.textContent = now.toISOString().slice(11, 19); });
  const ds = model('deepseek-1017');
  const mins = minutesToTariffSwitch(now);
  if (ds) {
    if (isValley(now)) setTk('ds', `VALLEY -50% ACTIVE [${px(ds.valley?.in)}/${px(ds.valley?.out)}] · PEAK IN ${fmtDur(mins)}`, 'emerald');
    else setTk('ds', `PEAK TARIFF [${px(ds.price.in)}/${px(ds.price.out)}] · VALLEY IN ${fmtDur(mins)}`, 'amber');
    const r = $('[data-k="con-tariff"]');
    r.textContent = `DEEPSEEK: ${isValley(now) ? 'VALLEY -50%' : 'PEAK'} · ${fmtDur(mins)}`;
    r.classList.toggle('amber', !isValley(now));
  }
  const mimo = model('mimo-pro'), son = model('sonnet-55');
  if (mimo && son) {
    if (state.xray) {
      const a = audited(mimo), b = audited(son);
      if (a && b) setTk('spread', `AUDITED ${mimo.short} (${usd(a.total)}/task) vs ${son.name} (${usd(b.total)}/task) → <span class="tk-pill">${(b.total / a.total).toFixed(1)}x SPREAD</span>`, 'cyan');
    } else if (Number.isFinite(mimo.costTask) && Number.isFinite(son.costTask)) {
      setTk('spread', `${mimo.short} (${usd(mimo.costTask)}/task) vs ${son.name} (${usd(son.costTask)}/task) → <span class="tk-pill">${(son.costTask / mimo.costTask).toFixed(1)}x SPREAD</span>`, 'lime');
    }
  }
  const byVol = [...state.models].filter(m => Number.isFinite(m.volume)).sort((a, b) => b.volume - a.volume);
  const leader = byVol.find(m => m.alias && m.alias.startsWith('stealth/')) || byVol[0];
  if (leader) {
    const ex = leader.alias && leader.alias.startsWith('stealth/') ? ` (EX-${leader.alias.slice(8).replace(/-alpha$/, '').replace(/-/g, ' ').toUpperCase()})` : '';
    setTk('stealth', `${esc(leader.name.toUpperCase())}${esc(ex)} // ${tv(leader.volume)}T TOK/WK`, 'lime');
  }
  const th = { CONFIRMED: ['CONFIRMED [ASYMMETRIC REGIME]', 'emerald'], WEAKENED: ['WEAKENED [REGIME CONTESTED]', 'amber'], REJECTED: ['REJECTED [SYMMETRIC REGIME]', 'crimson'] }[state.thesis] || ['UNKNOWN', 'amber'];
  setTk('thesis', th[0], th[1]);
  const hk = model('haiku-55');
  if (hk && hk.cliff && hasPrice(hk)) setTk('cliff', `${px(hk.price.in)}/${px(hk.price.out)} → ${px(hk.price.in * hk.cliff.mult)}/${px(hk.price.out * hk.cliff.mult)} &gt;${kTok(hk.cliff.threshold)} (${hk.cliff.mult}×)`, 'crimson');
  const age = seedAgeDays();
  setTk('seed', `${age}D / ${STALENESS_LIMIT_DAYS}D`, age > STALENESS_LIMIT_DAYS ? 'crimson' : 'cyan');
  setTk('mode', state.xray ? `X-RAY // AUDITED ${kTok(AUDIT.ctx)} · ${AUDIT.steps} TOOL CALLS` : 'NOMINAL // MARKETING $/1M', state.xray ? 'cyan' : '');
}

/* ── KPI cards ────────────────────────────────────────────────────────────── */

function renderKPIs() {
  const x = state.xray;
  const mimo = model('mimo-pro'), ds = model('deepseek-1017'), mm = model('minimax-m31'), hk = model('haiku-55'), luna = model('gpt6-luna');
  const cards = [];
  if (mimo) {
    const a = audited(mimo);
    cards.push({ c: 'var(--lime)', label: 'OPEN WEIGHTS COST LEADER', model: mimo.short,
      value: x ? `${usd(a?.total)} / TASK` : `${usd(mimo.costTask)} / TASK`,
      sub: x ? `Auditado ${kTok(AUDIT.ctx)} · ${AUDIT.steps} calls · CoT ×${mimo.cot} · ${px(a?.effPerM)} eff/1M` : `AA Index: ${Number.isFinite(mimo.aa) ? mimo.aa.toFixed(1) : 'N/D'} | Native mxfp4 1.02T/42B` });
  }
  if (ds) {
    const a = audited(ds);
    cards.push({ c: 'var(--orange)', label: 'REASONING COMPRESSION KING', model: 'DeepSeek V4.1-Flash-1017',
      value: x ? `${usd(a?.total)} / TASK` : `${usd(ds.costTask)} / TASK`,
      sub: x ? `Auditado · tarifa ${tariff() === 'valley' ? 'VALLE -50%' : 'PICO'} · CoT comprimido ×${ds.cot}` : `AA Index: ${Number.isFinite(ds.aa) ? ds.aa.toFixed(1) : 'N/D'} | ${Number.isFinite(ds.volume) ? tv(ds.volume) : 'N/D'}T tok/wk #${ds.volRank ?? '—'} Nominal` });
  }
  if (mm) {
    const a = audited(mm);
    cards.push({ c: 'var(--cyan)', label: 'STEALTH UNMASKED TODAY', model: mm.short,
      value: x ? `${usd(a?.total)} / TASK` : `${Number.isFinite(mm.volume) ? tv(mm.volume) : 'N/D'}T TOK/WK`,
      sub: x ? `Auditado · cache read ${px(mm.price.cache)} × ${Math.round(AUDIT.cacheHit * 100)}% hit` : `ex-Space Bunny Alpha | ${px(mm.price.in)}/${px(mm.price.out)}${Number.isFinite(mm.aa) ? ` | AA ${mm.aa.toFixed(1)}` : ''}${Number.isFinite(mm.delta) ? ` | Δ ${mm.delta > 0 ? '+' : ''}${mm.delta}%` : ' | >200 TPS'}` });
  }
  if (hk) {
    const below = agenticCost(hk, { ctx: 100000, steps: AUDIT.steps, cliff: true });
    const above = audited(hk);
    const card = agenticCost(hk, { ctx: AUDIT.ctx, steps: AUDIT.steps, cliff: false });
    cards.push({ c: 'var(--crimson)', label: 'US PROPRIETARY FLOOR TRAP', model: `Haiku 5.5 & ${luna ? luna.short : 'GPT-6 Luna'}`,
      value: x ? `${usd(card?.total)} → ${usd(above?.total)}` : `${hk.cliff ? hk.cliff.mult : 5}x CLIFF RISK`,
      sub: x ? `Haiku @150K: tarjeta vs auditado (${above?.stepsOver}/${AUDIT.steps} calls >100K) · @100K ${usd(below?.total)}` : `${px(hk.price.in)}/${px(hk.price.out)} nominal → ${hk.cliff ? hk.cliff.mult : 5}x penalty >100K on Haiku` });
  }
  $('#kpis').innerHTML = cards.map(k => `
    <article class="kpi" style="--c:${k.c}">
      <div class="kpi-label">${esc(k.label)}<span class="xr-tag">X-RAY</span></div>
      <span class="kpi-led" aria-hidden="true"></span>
      <div class="kpi-model">${esc(k.model)}</div>
      <div class="kpi-value">${esc(k.value)}</div>
      <div class="kpi-sub">${esc(k.sub)}</div>
    </article>`).join('');
}

/* ── Cohort matrix ────────────────────────────────────────────────────────── */

function matrixRows() {
  const { block, rot, q, sort, dir } = state.matrix;
  const needle = q.trim().toLowerCase();
  let rows = state.models.map(m => ({ m, a: audited(m), card: hasPrice(m) ? agenticCost(m, { ctx: AUDIT.ctx, steps: AUDIT.steps, tariff: tariff(), cliff: false }) : null }));
  rows = rows.filter(({ m }) => (block === 'all' || m.block === block) && (rot === 'all' || m.rotation === rot) &&
    (!needle || [m.name, m.vendor, m.arch, m.quant, m.silicon, m.alias, m.note, m.volNote].join(' ').toLowerCase().includes(needle)));
  const key = {
    name: r => r.m.name.toLowerCase(),
    aa: r => r.m.aa,
    nominal: r => state.xray ? r.a?.effPerM : blendedNominal(r.m),
    costTask: r => r.m.costTask,
    audited: r => r.a?.total,
    volume: r => r.m.volume,
    rotation: r => ROTATION.indexOf(r.m.rotation)
  }[sort] || (r => r.a?.total);
  rows.sort((r1, r2) => {
    const a = key(r1), b = key(r2);
    const na = a === null || a === undefined || (typeof a === 'number' && !Number.isFinite(a));
    const nb = b === null || b === undefined || (typeof b === 'number' && !Number.isFinite(b));
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return (a < b ? -1 : a > b ? 1 : 0) * dir;
  });
  return rows;
}

function renderMatrix(flashIds = []) {
  const nd = '<span class="nd">N/D</span>';
  const rows = matrixRows();
  $('#th-nominal').innerHTML = state.xray ? 'X-RAY: EFFECTIVE $/1M<br><small>NOMINAL TACHADO</small>' : 'NOMINAL $/1M<br><small>IN / OUT / CACHE</small>';
  $$('#matrix thead th[data-sort]').forEach(th => {
    th.setAttribute('aria-sort', th.dataset.sort === state.matrix.sort ? (state.matrix.dir === 1 ? 'ascending' : 'descending') : 'none');
  });
  const isVal = tariff() === 'valley';
  $('#matrix tbody').innerHTML = rows.length ? rows.map(({ m, a, card }) => {
    const p = m.price;
    const nominal = hasPrice(m) ? `${px(p.in)} / ${px(p.out)} / ${Number.isFinite(p.cache) ? px(p.cache) : '—'}` : null;
    const valley = m.valley ? `<span class="aud-sub">valle ${px(m.valley.in)}/${px(m.valley.out)}${isVal ? ' · ACTIVO' : ''}</span>` : '';
    const nomCell = !nominal ? nd : state.xray
      ? `<span class="strike">${nominal}</span><span class="eff">${px(a.effPerM)} eff/1M</span>`
      : `${nominal}${valley}`;
    let audCell = nd;
    if (a) {
      const ratio = card && card.total > 0 ? a.total / card.total : 1;
      const hot = a.surcharge > 0;
      const sub = hot ? `+${usd(a.surcharge)} recargo · ${a.stepsOver}/${a.steps} calls &gt;${kTok(m.cliff.threshold)} · ×${ratio.toFixed(1)} vs tarjeta` : `CoT ×${m.cot}${m.compressed ? ' comprimido' : ''}${Number.isFinite(p.cache) ? ` · cache 70%${m.cacheWrite ? ` · write ×${m.cacheWrite}` : ''}` : ''}${m.valley ? (isVal ? ' · valle' : ' · pico') : ''}`;
      audCell = `<span class="aud ${hot ? 'hot' : m.block === 'open' ? 'cool' : ''}">${usd(a.total)}</span><span class="aud-sub">${sub}</span>`;
    }
    const dl = Number.isFinite(m.delta) ? ` <span class="${m.delta < 0 ? 'delta-neg' : 'delta-pos'}">${m.delta > 0 ? '+' : ''}${m.delta}%</span>` : '';
    const vol = Number.isFinite(m.volume) ? `${tv(m.volume)}T${m.volRank ? ` <span class="nd">#${m.volRank}</span>` : ''}${dl}` : nd;
    const volNote = m.volNote ? `<span class="vol-note">${esc(m.volNote)}</span>` : '';
    const ct = Number.isFinite(m.costTask) ? usd(m.costTask) + (m.id === 'gpt6-luna' ? '<span class="aud-sub">ctx corto</span>' : '') : nd;
    const trap = m.cliff ? `<span class="trap-badge">TRAP ${m.cliff.mult}× &gt;${kTok(m.cliff.threshold)}</span>` : '';
    const note = m.note ? `<div class="m-arch">${esc(m.note)}</div>` : '';
    const alias = m.alias ? `<div class="m-arch">alias: ${esc(m.alias)}</div>` : '';
    return `<tr data-id="${esc(m.id)}" class="${flashIds.includes(m.id) ? 'flash' : ''}">
      <td><div class="m-name"><i style="--c:${esc(m.color)}"></i>${esc(m.name)}</div><div class="m-arch">${esc(m.arch)}${m.license ? ' · ' + esc(m.license) : ''}</div>${alias}${note}<span class="m-block ${m.block}">${m.block === 'open' ? 'OPEN / CN MoE' : 'US PROPRIETARY'}</span></td>
      <td class="num">${Number.isFinite(m.aa) ? m.aa.toFixed(1) : nd}</td>
      <td class="num">${nomCell}</td>
      <td class="num">${ct}</td>
      <td class="num">${audCell}</td>
      <td class="num">${vol}${volNote}</td>
      <td class="q">${esc(m.quant)}${m.silicon && m.silicon !== '—' ? `<div class="m-arch">${esc(m.silicon)}</div>` : ''}${trap}</td>
      <td><span class="rot ${esc(m.rotation)}">${esc(m.rotation)}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8">Sin resultados para el filtro actual.</td></tr>';
}

function renderFormula() {
  $('#formula-text').textContent =
`AUDITED COST / RUN = R · Σ(i=0..N−1) m_i · [ (C_i − K_i)·p_in·W + K_i·p_cache + (V + T·κ·β)·p_out ] / 1e6

  C_i  = ctx · (${AUDIT.ctxRamp} + ${1 - AUDIT.ctxRamp} · i/(N−1))   contexto re-enviado en la call i
  K_i  = ${AUDIT.cacheHit} · C_i a precio cache-read desde la call 2 (todos los modelos con cache-read en la semilla)
  W    = cache-write sobre el miss (C_i − K_i): Anthropic 1.25× el input; resto 1×
  cache-read: Anthropic 0.10× · OpenAI 0.25× · DeepSeek / MiMo 0.10× · MiniMax $0.015 · Fable 5.1 −75%
  V    = ${AUDIT.visibleOutPerStep.toLocaleString('en-US')} tok de salida visible por call
  T    = 18,000 / 3.5 = ${Math.round(AUDIT.cotBasePerStep).toLocaleString('en-US')} tok de razonamiento base por call
  κ    = multiplicador de verbosidad CoT del modelo (DeepSeek-1017 = 0.55, comprimido)
  β    = ${AUDIT.bloatMult} con [3.5x REASONING BLOAT] salvo CoT comprimido; si no, 1
  m_i  = multiplicador de recargo si C_i > umbral (Haiku 5.5: 5× sobre 100K, también sobre cache-read y cache-write); si no, 1
  R    = ${AUDIT.fp8Retry} con [FP8 PROVIDER DEGRADATION] en endpoints de terceros; MiMo-V2.6-Pro nativo mxfp4 = 1

X-RAY: ctx = ${kTok(AUDIT.ctx)}, N = ${AUDIT.steps} tool calls. DeepSeek usa la tarifa UTC en vivo (valle 16:30–00:30 = -50%).
Burn pressure: P = (cuota % ÷ horas al reset) ÷ (100 ÷ 168). P ≥ 1 → USE-IT-OR-LOSE-IT; P < 1 → QUOTA DEFICIT.
Subsidy stress: elasticidad lineal GLM (precio blended ×2 → volumen −40%) aplicada al paso free → paid de MiniMax.

Procedencia: precios, AA, coste/tarea y volúmenes son la semilla del usuario (${SEED_DATE}).
V, T, κ, el 70 % de cache-hit, el ×2.4 de reintentos y la rampa de contexto son supuestos del kernel, no datos medidos.\nGLM-5.3-Flash, Gemini 3.8 Flash, Gemini 4 Argon y Qwen3.8-Flash-Next no tienen cache-read en la semilla: pagan input completo.`;
}

/* ── Router ───────────────────────────────────────────────────────────────── */

function bankEval(toolId) {
  const tool = BANK_TOOLS.find(t => t.id === toolId);
  const s = state.bank.tools[toolId];
  return { tool, s, bp: burnPressure(s.hours, s.quota, tool.cycleHours) };
}

function renderRouter() {
  const r = state.router;
  const preset = ROUTER_PRESETS.find(p => p.id === r.preset) || ROUTER_PRESETS[ROUTER_PRESETS.length - 1];
  const floor = r.preset === 'custom' ? (r.ctx > 150000 || r.steps > 15 ? 45 : 43) : preset.floor;
  const t = tariff();
  const opts = { ctx: r.ctx, steps: r.steps, tariff: t, cliff: true, bloat: state.faults.bloat, fp8: state.faults.fp8 };
  $$('[data-k="rt-ctx"]').forEach(e => { e.textContent = kTok(r.ctx); });
  $$('[data-k="rt-steps"]').forEach(e => { e.textContent = r.steps; });
  $$('[data-k="rt-tariff"]').forEach(e => { e.textContent = (t === 'valley' ? 'VALLEY' : 'PEAK') + (state.faults.bloat || state.faults.fp8 ? ' --faults ' + ['bloat', 'fp8'].filter(f => state.faults[f]).join(',') : ''); });
  $('#rt-ctx').value = r.ctx;
  $('#rt-steps').value = r.steps;
  $('#rt-preset').value = r.preset;
  if (document.activeElement !== $('#rt-text')) $('#rt-text').value = r.text;

  const api = ROUTER_API.map(model).filter(m => m && hasPrice(m)).map(m => {
    const c = agenticCost(m, opts);
    const card = agenticCost(m, { ...opts, cliff: false });
    return { m, c, card, ok: Number.isFinite(m.aa) ? m.aa >= floor : null };
  });
  const bank = ROUTER_BANK.map(model).filter(m => m && hasPrice(m)).map(m => ({ m, c: agenticCost(m, opts) }));
  const all = [...api.map(a => a.c.total), ...bank.map(b => b.c.total)];
  const lo = Math.log10(Math.min(...all)), hi = Math.log10(Math.max(...all));
  const bar = v => (hi - lo < 1e-9 ? 100 : 10 + (Math.log10(v) - lo) / (hi - lo) * 90).toFixed(1);

  const pool = api.filter(a => a.ok === true).sort((a, b) => a.c.total - b.c.total);
  const unknown = api.filter(a => a.ok === null).sort((a, b) => a.c.total - b.c.total);
  const best = pool[0] || unknown[0] || [...api].sort((a, b) => a.c.total - b.c.total)[0];

  $('#rt-api').innerHTML = api.map(a => {
    const trap = a.c.surcharge > 0;
    const notes = [];
    notes.push(a.ok === null ? `AA N/D · sin auditar vs floor ${floor}` : `AA ${a.m.aa.toFixed(1)} ${a.ok ? '✓' : '✗'} floor ${floor}`);
    if (trap) notes.push(`TRAP: ${a.c.stepsOver}/${a.c.steps} calls &gt;${kTok(a.m.cliff.threshold)} · tarjeta ${usd(a.card.total)} → +${usd(a.c.surcharge)}`);
    if (a.m.valley) notes.push(t === 'valley' ? 'VALLE -50% activo' : 'tarifa PICO');
    if (a.c.retry > 1) notes.push(`×${a.c.retry} reintentos fp8`);
    if (Number.isFinite(a.m.price.cache)) notes.push(`cache ${px(a.m.price.cache)}`);
    const cls = [a === best ? 'best' : '', trap ? 'trap' : '', a.ok === false ? 'fail' : ''].join(' ');
    return `<div class="rt-row ${cls}" style="--c:${esc(a.m.color)}"><span class="nm">${esc(a.m.short)}</span><span class="cost">${usd(a.c.total)}</span><span class="bar"><i style="width:${bar(a.c.total)}%"></i></span><span class="note">${notes.join(' · ')}</span></div>`;
  }).join('');

  const banks = BANK_TOOLS.map(tl => ({ ...bankEval(tl.id), eq: bank.find(b => b.m.id === tl.model) }));
  $('#rt-bank').innerHTML = banks.map(b => {
    const eq = b.eq ? b.eq.c.total : NaN;
    const use = b.bp.zone === 'USE';
    return `<div class="rt-row ${use ? 'best' : ''}" style="--c:${use ? 'var(--lime)' : 'var(--amber)'}"><span class="nm">${esc(b.tool.label)}</span><span class="cost">$0.00</span><span class="bar"><i style="width:${Number.isFinite(eq) ? bar(eq) : 0}%"></i></span><span class="note">marginal · consume ${usd(eq)} API-equiv (${esc(b.eq ? b.eq.m.short : 'N/D')}) · T-${b.s.hours}h · ${b.s.quota}% · P=${b.bp.pressure.toFixed(2)} → ${use ? 'USE-IT-OR-LOSE-IT' : 'DEFICIT'}</span></div>`;
  }).join('');

  const burn = banks.filter(b => b.bp.zone === 'USE').sort((a, b) => b.bp.pressure - a.bp.pressure)[0];
  const hk = api.find(a => a.m.id === 'haiku-55');
  const hkWarn = hk && hk.c.surcharge > 0 ? `<small>⚠ Haiku 5.5 aparenta ${usd(hk.card.total)} en tarjeta nominal; auditado ${usd(hk.c.total)} (${hk.c.stepsOver} calls sobre ${kTok(hk.m.cliff.threshold)} pagan ${hk.m.cliff.mult}×).</small>` : '';
  let html;
  if (burn && best) {
    html = `► VERDICT: BURN ${esc(burn.tool.label)} BANK · coste marginal $0.00 frente a ${usd(best.c.total)}/run en ${esc(best.m.short)}.
      <small>P=${burn.bp.pressure.toFixed(2)} ≥ 1: la cuota caduca antes de consumirse al ritmo nominal. El run consume ${usd(burn.eq?.c.total)} API-equivalente del banco${burn.eq ? ` (${esc(burn.eq.m.short)})` : ''}.</small>${hkWarn}`;
  } else if (best) {
    const sol = bank.find(b => b.m.id === 'gpt61-sol'), opus = bank.find(b => b.m.id === 'opus-55');
    html = `► VERDICT: ROUTE → ${esc(best.m.short)} @ ${usd(best.c.total)}/run${best.ok === null ? ' (AA sin auditar)' : ''}.
      <small>Bancos en déficit: preserva la cuota. Spread vs ${sol ? `GPT-6.1 Sol ${usd(sol.c.total)} (×${(sol.c.total / best.c.total).toFixed(1)})` : ''}${opus ? ` · Opus 5.5 ${usd(opus.c.total)} (×${(opus.c.total / best.c.total).toFixed(1)})` : ''} API-equiv.</small>${hkWarn}`;
  } else {
    html = 'Sin modelos con precio en la semilla para enrutar.';
  }
  $('#rt-verdict').innerHTML = html;
}

/* ── Bank reset arbitrage ─────────────────────────────────────────────────── */

let bankInteracted = false;

function renderBank() {
  const { tool, s, bp } = bankEval(state.bank.active);
  $('#bk-tools').innerHTML = BANK_TOOLS.map(t => `<button class="seg-btn" data-bank-tool="${t.id}" aria-pressed="${t.id === state.bank.active}">${esc(t.label)}</button>`).join('');
  $('#bk-hours').value = s.hours;
  $('#bk-quota').value = s.quota;
  $$('[data-k="bk-tool"]').forEach(e => { e.textContent = tool.id; });
  $$('[data-k="bk-hours"]').forEach(e => { e.textContent = s.hours + 'h'; });
  $$('[data-k="bk-quota"]').forEach(e => { e.textContent = s.quota + '%'; });
  const use = bp.zone === 'USE';
  const g = $('#bk-gauge');
  g.style.width = bp.index.toFixed(1) + '%';
  g.classList.toggle('deficit', !use);
  const expiring = Math.max(0, s.quota - bp.nominalRate * s.hours);
  const runwayH = s.quota / bp.nominalRate;
  const shortfall = Math.max(0, s.hours - runwayH);
  $('#bk-stats').innerHTML = `
    <div><span>BURN PRESSURE P</span><b>${bp.pressure.toFixed(2)}×</b></div>
    <div><span>MOLOCH BPI</span><b>${bp.index.toFixed(0)}/100</b></div>
    <div><span>RITMO REQUERIDO</span><b>${bp.requiredRate.toFixed(2)}%/h</b></div>
    <div><span>${use ? 'CADUCA SIN USO' : 'DÉFICIT DE CUOTA'}</span><b>${use ? expiring.toFixed(0) + '%' : shortfall.toFixed(0) + 'h'}</b></div>`;
  const zone = $('#bk-zone');
  zone.classList.toggle('deficit', !use);
  const bm = model(tool.model);
  const run = bm ? audited(bm) : null;
  const mimo = model('mimo-pro'), ds = model('deepseek-1017');
  if (use) {
    zone.innerHTML = `[ZONE: USE-IT-OR-LOSE-IT // MARGINAL COST $0 -&gt; DUMP HEAVY ALGORITHMIC WORKLOADS NOW]
      <small>Al ritmo sostenible (${bp.nominalRate.toFixed(3)}%/h) caducaría ~${expiring.toFixed(0)}% de la cuota en ${s.hours}h. Cada run de ${kTok(AUDIT.ctx)}·${AUDIT.steps} calls que vuelques al banco ahorra ${usd(run?.total)} API-equivalente (${esc(bm?.short || 'N/D')}). Prioriza refactors de repo completo, property-based testing y el motor Babel Life.</small>`;
  } else {
    const mc = mimo ? audited(mimo) : null, dc = ds ? audited(ds) : null;
    zone.innerHTML = `[ZONE: QUOTA DEFICIT // OFF-LOAD &gt;100K CONTEXT TO MIMO-V2.6 / DEEPSEEK-1017 AT ${usd(mimo?.costTask)}/TASK]
      <small>La cuota (${s.quota}%) cubre ~${runwayH.toFixed(0)}h al ritmo nominal y faltan ${s.hours}h para el reset: déficit de ${shortfall.toFixed(0)}h. Un run auditado de ${kTok(AUDIT.ctx)}·${AUDIT.steps} calls cuesta ${usd(mc?.total)} en MiMo-V2.6-Pro y ${usd(dc?.total)} en DeepSeek-1017 (${tariff() === 'valley' ? 'valle' : 'pico'}) frente a ${usd(run?.total)} API-equiv en ${esc(bm?.short || 'N/D')}.</small>`;
  }
  if (use && bankInteracted) unlock('bank');
}

function bankPreset(h, q, tool) {
  if (tool) state.bank.active = tool;
  Object.assign(state.bank.tools[state.bank.active], { hours: h, quota: q });
  bankInteracted = true;
  synth.click();
  renderBank();
  renderRouter();
  const bp = bankEval(state.bank.active).bp;
  log('bank', `${state.bank.active} T-${h}h ${q}% → P=${bp.pressure.toFixed(2)} ${bp.zone === 'USE' ? 'USE-IT-OR-LOSE-IT' : 'DEFICIT'}`);
  save();
}

/* ── Prompt ───────────────────────────────────────────────────────────────── */

function renderPrompt() {
  $('#prompt-text').textContent = PROMPT_V2;
  const days = seedAgeDays();
  const el = $('#stale');
  el.classList.toggle('alert', days > STALENESS_LIMIT_DAYS || days < 0);
  el.textContent = days < 0
    ? `⚠ SEED STALENESS: reloj del navegador anterior a ${SEED_DATE} (${days}d)`
    : days > STALENESS_LIMIT_DAYS
      ? `⚠ SEED STALENESS: ${days} DÍAS DESDE ${SEED_DATE} > ${STALENESS_LIMIT_DAYS} · RE-SEED OBLIGATORIO`
      : `● SEED STALENESS: ${days} DÍA${days === 1 ? '' : 'S'} DESDE ${SEED_DATE} · LÍMITE ${STALENESS_LIMIT_DAYS}D · ${STALENESS_LIMIT_DAYS - days}D RESTANTES`;
}

async function copyPrompt() {
  let ok = false;
  try { await navigator.clipboard.writeText(PROMPT_V2); ok = true; } catch {
    const range = document.createRange();
    range.selectNodeContents($('#prompt-text'));
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try { ok = document.execCommand('copy'); } catch { ok = false; }
  }
  synth.click();
  toast(ok
    ? { kicker: 'CLIPBOARD // PROMPT v2.0', title: 'Prompt copiado', body: `${PROMPT_V2.length.toLocaleString('es-ES')} caracteres listos para tu tarea programada.`, icon: '⧉', kind: 'info', ttl: 3500 }
    : { kicker: 'CLIPBOARD // ERROR', title: 'Copia manual', body: 'El navegador bloqueó el portapapeles; el texto queda seleccionado.', icon: '!', kind: 'err', ttl: 4500 });
  if (ok) log('sys', 'PROMPT v2.0 copiado');
}

/* ── Aliases ──────────────────────────────────────────────────────────────── */

const ALIAS_COLOR = { UNMASKED: 'var(--lime)', 'SILENT SWAP': 'var(--amber)', 'BILLING TRAP': 'var(--crimson)', 'NATIVE QUANT': 'var(--cyan)', 'PINNED SNAPSHOT': 'var(--emerald)' };

function renderAliases() {
  $('#alias-list').innerHTML = state.aliases.map(a => `
    <div class="alias ${state.selectedAlias === a.id ? 'sel' : ''}" role="button" tabindex="0" data-alias="${esc(a.id)}" style="--c:${a.masked ? '#FFFFFF' : ALIAS_COLOR[a.status] || 'var(--lime)'}" aria-expanded="${state.selectedAlias === a.id}">
      <span class="led" aria-hidden="true"></span>
      <span><span class="slug">${esc(a.alias)}</span> <span class="arrow">→</span> <span class="res ${a.masked ? 'masked' : ''}">${a.masked ? 'CLASSIFIED·CLASSIFIED' : esc(a.resolved)}</span></span>
      <span class="st">${a.masked ? 'STEALTH' : esc(a.status)}</span>
      <span class="det">${a.masked ? 'Identidad sin confirmar en el radar. Pulsa UNMASK para resolver el alias con la señal del 19 OCT.' : esc(a.detail)}${a.date ? ` · ${esc(a.date)}` : ''}</span>
      ${a.masked ? `<button class="btn lime unmask" data-unmask="${esc(a.id)}">◉ UNMASK</button>` : ''}
    </div>`).join('');
}

function selectAlias(id, fromCanvas = false) {
  state.selectedAlias = state.selectedAlias === id && !fromCanvas ? null : id;
  synth.click();
  renderAliases();
  if (fromCanvas) $(`[data-alias="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  save();
}

function unmask(id) {
  const a = state.aliases.find(x => x.id === id);
  if (!a || !a.masked) return;
  a.masked = false;
  state.selectedAlias = id;
  synth.ping();
  log('mutate', `ALIAS RESOLVED ${a.alias} → ${a.resolved}`);
  renderAliases();
  if (id === 'space-bunny') unlock('bunny');
  save();
}

/* ── Timeline ─────────────────────────────────────────────────────────────── */

const SEV_COLOR = ['var(--emerald)', 'var(--emerald)', 'var(--cyan)', 'var(--amber)', 'var(--orange)', 'var(--crimson)'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function renderTimeline(flashId) {
  const items = [...state.incidents].sort((a, b) => b.date.localeCompare(a.date) || (b.sev - a.sev));
  $('#timeline').innerHTML = items.map(i => {
    const d = new Date(i.date + 'T00:00:00Z');
    const label = i.dateLabel || `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`;
    return `<li class="tl ${flashId === i.id ? 'flash' : ''}" id="tl-${esc(i.id)}" style="--c:${SEV_COLOR[i.sev] || 'var(--lime)'}">
      <div class="tl-date">${esc(label)} ${d.getUTCFullYear()}<small>${esc(i.date)}</small></div>
      <div class="tl-bar" aria-hidden="true"></div>
      <div><h3>${esc(i.title)}</h3>${i.detail ? `<p>${esc(i.detail)}</p>` : ''}
        <div class="tl-tags"><span class="tag sev">SEV ${i.sev}</span>${(i.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}<span class="tag src">${esc(i.source === 'seed' ? 'SEED' : String(i.source || 'manual').toUpperCase())}</span></div>
      </div>
    </li>`;
  }).join('');
}

function focusIncident(id) {
  const el = document.getElementById('tl-' + id);
  if (!el) return;
  synth.click();
  el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

/* ── Console: oscilloscope, trap matrix, radar, faults ───────────────────── */

const XS = Array.from({ length: 50 }, (_, i) => (i + 1) * 10000);
let measuredFps = 60;

function scopeCompute() {
  const f = state.faults;
  const sc = scenario();
  const series = state.models.filter(m => m.scope && hasPrice(m)).map(m => {
    const values = XS.map(ctx => agenticCost(m, { ...sc, ctx, steps: state.scopeSteps }).total);
    const ghost = f.subsidy && m.subsidy ? XS.map(ctx => agenticCost(m, { ...sc, ctx, steps: state.scopeSteps, subsidized: true }).total) : null;
    const hot = (sc.cliff && f.cliff && !!m.cliff) || (f.bloat && m.block === 'us' && !m.compressed) || (f.subsidy && !!m.subsidy) || (f.fp8 && m.thirdParty);
    return { id: m.id, label: m.short, color: m.color, values, ghost, hot };
  });
  return {
    xs: XS, series, cliffX: 100000, cliffActive: sc.cliff, auditX: AUDIT.ctx,
    footer: `${state.scopeSteps} CALLS · ${sc.tariff.toUpperCase()}${state.xray ? ' · X-RAY' : ''}`,
    get fps() { return measuredFps; }
  };
}

function radarCompute() {
  const sc = scenario();
  const pts = state.models.filter(m => Number.isFinite(m.aa) && hasPrice(m)).map(m => ({
    id: m.id, label: m.short, color: m.color, aa: m.aa, block: m.block,
    cost: agenticCost(m, { ...sc, ctx: AUDIT.ctx, steps: state.scopeSteps }).total
  }));
  let best = -Infinity;
  [...pts].sort((a, b) => a.cost - b.cost).forEach(p => { if (p.aa > best) { p.frontier = true; best = p.aa; } });
  return pts;
}

let osc, radar, aliasRadar, seismo;
let conTab = 'wave';
let lastFault = null;

const FAULTS = {
  cliff: '>100K CONTEXT CLIFF',
  bloat: '3.5x REASONING BLOAT',
  subsidy: 'SUBSIDY RUG-PULL',
  fp8: 'FP8 PROVIDER DEGRADATION'
};

function renderLegend() {
  const data = osc.data || scopeCompute();
  const idx = XS.indexOf(AUDIT.ctx);
  $('#scope-legend').innerHTML = data.series.map(s => `<button class="lg" data-lg="${esc(s.id)}" aria-pressed="${!osc.hidden.has(s.id)}" style="--c:${esc(s.color)}"><i></i>${esc(s.label)} <b>${usd(s.values[idx])}</b></button>`).join('');
}

function renderTrap() {
  const sc = scenario();
  const rows = state.models.filter(hasPrice).map(m => {
    const base = agenticCost(m, { ctx: AUDIT.ctx, steps: state.scopeSteps, tariff: sc.tariff, cliff: false });
    const cur = agenticCost(m, { ...sc, ctx: AUDIT.ctx, steps: state.scopeSteps });
    const drivers = [];
    if (cur.surcharge > 0) drivers.push(`CLIFF ${cur.stepsOver}/${cur.steps}`);
    if (sc.bloat && !m.compressed) drivers.push('COT ×3.5');
    if (sc.bloat && m.compressed) drivers.push('COT 1017 ✓');
    if (cur.retry > 1) drivers.push(`RETRY ×${cur.retry}`);
    if (state.faults.subsidy && m.subsidy) drivers.push(m.subsidy.label + ' → LIST');
    return { m, base, cur, d: cur.total / base.total - 1, drivers };
  }).sort((a, b) => b.d - a.d || b.cur.total - a.cur.total);
  $('#trap-matrix').innerHTML = `<table class="trap-tbl"><thead><tr><th>MODEL</th><th>BASELINE</th><th>SCENARIO</th><th>Δ</th><th>DRIVERS</th></tr></thead><tbody>${rows.map(r => `
    <tr><td><i style="--c:${esc(r.m.color)}"></i>${esc(r.m.short)}</td><td>${usd(r.base.total)}</td><td>${usd(r.cur.total)}</td>
    <td class="${r.d > 0.005 ? 'up' : 'flat'}">${r.d > 0.005 ? '+' + (r.d * 100).toFixed(0) + '%' : '±0%'}</td><td>${esc(r.drivers.join(' · ') || '—')}</td></tr>`).join('')}</tbody></table>`;
}

function updateFaultUI() {
  $$('.fault').forEach(b => b.setAttribute('aria-pressed', String(!!state.faults[b.dataset.fault])));
  const act = Object.keys(FAULTS).filter(k => state.faults[k]);
  const tag = $('#fault-tag');
  tag.classList.toggle('on', act.length > 0);
  tag.textContent = act.length ? `FAULT: ${act.map(k => FAULTS[k].split(' ')[0]).join(' + ')} (ACTIVE)` : state.xray ? 'X-RAY: CLIFF SURCHARGES ON' : 'NOMINAL BASELINE';
}

function narration() {
  const sc = scenario();
  const at = (m, extra = {}) => agenticCost(m, { ...sc, ctx: AUDIT.ctx, steps: state.scopeSteps, ...extra });
  const act = Object.keys(FAULTS).filter(k => state.faults[k]);
  const k = act.includes(lastFault) ? lastFault : act[act.length - 1];
  const more = act.length > 1 ? ` [+${act.length - 1} fallo${act.length > 2 ? 's' : ''} activo${act.length > 2 ? 's' : ''}]` : '';
  const hk = model('haiku-55'), mimo = model('mimo-pro'), son = model('sonnet-55'), ds = model('deepseek-1017'), glm = model('glm-53'), mm = model('minimax-m31');
  if (!k) {
    const n = state.models.filter(m => m.scope && hasPrice(m)).length;
    return `▸ BASELINE ${state.xray ? 'X-RAY (recargos >100K aplicados)' : 'NOMINAL'} · ${n} curvas · trayectoria ${state.scopeSteps} calls · DeepSeek en tarifa ${sc.tariff === 'valley' ? 'VALLE -50%' : 'PICO'}. Inyecta un fallo para auditar el régimen.`;
  }
  if (k === 'cliff' && hk && mimo) {
    const a = at(hk, { cliff: false }), b = at(hk, { cliff: true }), c = at(mimo);
    return `⚡ [CTX_CLIFF] 100,001 tokens cruzados → Haiku 5.5 reprecia ${px(hk.price.in)}/${px(hk.price.out)} → ${px(hk.price.in * hk.cliff.mult)}/${px(hk.price.out * hk.cliff.mult)}. Run @150K: ${usd(a.total)} → ${usd(b.total)} (×${(b.total / a.total).toFixed(1)}; ${b.stepsOver}/${b.steps} calls pagan ${hk.cliff.mult}×). MiMo-V2.6-Pro plano en ${usd(c.total)}.${more}`;
  }
  if (k === 'bloat' && son && ds) {
    const a = at(son, { bloat: false }), b = at(son, { bloat: true }), c = at(ds, { bloat: false }), d = at(ds, { bloat: true });
    return `⚡ [COT_BLOAT] 18,000 thinking tok/call sin restricción (×${AUDIT.bloatMult}) → Sonnet 5.5 ${usd(a.total)} → ${usd(b.total)} (+${((b.total / a.total - 1) * 100).toFixed(0)}%). DeepSeek V4.1-Flash 1017 comprimido: ${usd(c.total)} → ${usd(d.total)} (Δ 0%).${more}`;
  }
  if (k === 'subsidy' && glm && mm) {
    const s = subsidyStress(state.models);
    const g0 = at(glm, { subsidized: true }), g1 = at(glm), m0 = at(mm, { subsidized: true }), m1 = at(mm);
    return `⚡ [RUG_PULL] Replay 9 SEP: GLM-5.3-Flash ${usd(g0.total)} → ${usd(g1.total)}/run, volumen −${(s.glmDrop * 100).toFixed(0)}% (dato). MiniMax M3.1 Flash post-stealth ${usd(m0.total)} → ${usd(m1.total)}/run; elasticidad GLM proyecta retención ${(s.retention * 100).toFixed(0)}% ≈ ${s.projectedVolume === null ? 'N/D' : s.projectedVolume.toFixed(1) + 'T'} tok/sem (inferencia, no dato).${more}`;
  }
  if (k === 'fp8' && ds && mimo) {
    const a = at(ds, { fp8: false }), b = at(ds, { fp8: true }), c = at(mimo, { fp8: true });
    return `⚡ [FP8_DEGRADE] Endpoints cuantizados de terceros → bucles de reintento de tool-calling ×${AUDIT.fp8Retry}. DeepSeek-1017 ${usd(a.total)} → ${usd(b.total)}/tarea resuelta; MiniMax y GLM igual. MiMo-V2.6-Pro nativo mxfp4 single-node intacto en ${usd(c.total)}.${more}`;
  }
  return `⚡ ${FAULTS[k]} activo.${more}`;
}

let narrTimer = 0;
function narrate(text) {
  clearInterval(narrTimer);
  const el = $('#con-ticker');
  if (reduceMotion) { el.textContent = text; return; }
  let i = 0;
  narrTimer = setInterval(() => {
    i = Math.min(text.length, i + 3);
    el.innerHTML = esc(text.slice(0, i)) + '<span class="cur" aria-hidden="true"></span>';
    if (i >= text.length) clearInterval(narrTimer);
  }, 16);
}

function refreshScenario({ from = null, glitch = 0 } = {}) {
  osc.refresh(from);
  if (glitch) osc.inject(glitch);
  radar.refresh();
  renderLegend();
  renderTrap();
  updateFaultUI();
  narrate(narration());
}

function toggleFault(k, force) {
  const on = force === undefined ? !state.faults[k] : force;
  const was = state.faults[k];
  state.faults[k] = on;
  let from = null;
  if (on && !was && k === 'subsidy') {
    const sc = scenario();
    from = {};
    state.models.filter(m => m.scope && m.subsidy && hasPrice(m)).forEach(m => {
      from[m.id] = XS.map(ctx => agenticCost(m, { ...sc, ctx, steps: state.scopeSteps, subsidized: true }).total);
    });
  }
  if (on) lastFault = k;
  if (on !== was) {
    on ? synth.fault() : synth.click();
    log('fault', `${on ? 'INJECT' : 'CLEAR'} [${FAULTS[k]}]`);
  } else synth.click();
  refreshScenario({ from, glitch: on ? 1 : 0.3 });
  renderRouter();
  if (on && k === 'cliff') unlock('cliff');
  if (Object.values(state.faults).every(Boolean)) unlock('chaos');
  save();
}

function restoreBaseline() {
  Object.keys(state.faults).forEach(k => { state.faults[k] = false; });
  lastFault = null;
  synth.click();
  log('fault', 'RESTORE BASELINE');
  refreshScenario({ glitch: 0.4 });
  renderRouter();
  save();
}

function setConTab(id) {
  conTab = id;
  $$('.ctab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ct === id)));
  $$('.con-view').forEach(v => { v.hidden = v.dataset.cv !== id; });
  const titles = { wave: 'REAL COST PER RESOLVED TASK ($, LOG)', trap: `TRAP IMPACT MATRIX @${kTok(AUDIT.ctx)}`, radar: 'COHORT RADAR // AA vs AUDITED $/TASK', log: 'AUDIT LOG // SESSION EVENTS' };
  $$('[data-k="wave-title"]').forEach(e => { e.textContent = titles[id]; });
  if (id === 'log') renderAuditLog();
  if (id === 'trap') renderTrap();
  if (id === 'radar') radar.refresh();
  synth.click();
}

function setSteps(n) {
  state.scopeSteps = n;
  $$('#steps-chips .chip').forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.steps === n)));
  refreshScenario({ glitch: 0.25 });
  save();
}

/* ── X-RAY & SFX ──────────────────────────────────────────────────────────── */

function applyXrayClass() {
  document.body.classList.toggle('xray', state.xray);
  $('#btn-xray').setAttribute('aria-pressed', String(state.xray));
  $$('[data-k="xray-state"]').forEach(e => { e.textContent = state.xray ? 'ON' : 'OFF'; });
}

function toggleXray() {
  state.xray = !state.xray;
  applyXrayClass();
  if (!reduceMotion) {
    document.body.classList.remove('xray-flash');
    void document.body.offsetWidth;
    document.body.classList.add('xray-flash');
    setTimeout(() => document.body.classList.remove('xray-flash'), 500);
  }
  synth.xray(state.xray);
  log('xray', state.xray ? `X-RAY ON · auditado ${kTok(AUDIT.ctx)} · ${AUDIT.steps} calls · CoT κ por modelo` : 'X-RAY OFF · precios nominales');
  renderAllData();
  refreshScenario({ glitch: 0.8 });
  if (state.xray) unlock('xray');
  save();
}

function toggleSfx() {
  state.sfx = !state.sfx;
  synth.setEnabled(state.sfx);
  if (state.sfx) synth.click();
  $('#btn-sfx').setAttribute('aria-pressed', String(state.sfx));
  $('#btn-sfx').classList.toggle('lime', state.sfx);
  $$('[data-k="sfx-state"]').forEach(e => { e.textContent = state.sfx ? 'ON' : 'OFF'; });
  save();
}

/* ── Ingestion ────────────────────────────────────────────────────────────── */

function geminiUI() {
  const cfg = loadGeminiConfig();
  $$('[data-k="gemini-state"]').forEach(e => { e.textContent = cfg.key ? 'LINKED ✓' : 'LINK API'; });
  $$('[data-k="ing-engine"]').forEach(e => { e.textContent = cfg.key ? `GEMINI · ${cfg.model}` : 'LOCAL-DETERMINISTIC'; });
}

function out(lines) {
  $('#ing-out').innerHTML = lines.map(([cls, txt]) => `<span class="${cls}">${esc(txt)}</span>`).join('\n');
}

let ingesting = false;
async function runIngest(text, { forceLocal = false, label = 'manual' } = {}) {
  if (ingesting) return;
  if (!text.trim()) {
    out([['err', '✗ Sin señal: pega el informe diario o pulsa SIMULATE.']]);
    synth.error();
    return;
  }
  ingesting = true;
  const btns = [$('#ing-parse'), $('#ing-sim')];
  btns.forEach(b => { b.disabled = true; });
  const cfg = loadGeminiConfig();
  const useGemini = !!cfg.key && !forceLocal;
  const lines = [['dimc', `> ingest ${label} · ${text.length} chars · engine ${useGemini ? 'GEMINI · ' + cfg.model : 'LOCAL-DETERMINISTIC'}`]];
  out([...lines, ['warn', '… parsing']]);
  synth.teletype(10);
  let parsed;
  try {
    if (useGemini) {
      try {
        const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30000) : undefined;
        parsed = await parseWithGemini(text, state.models, cfg, todayISO(), { signal });
      } catch (e) {
        lines.push(['err', `✗ Gemini: ${e.message || e}`], ['warn', '↳ fallback al parser local determinista']);
        log('sys', `GEMINI ERROR ${String(e.message || e).slice(0, 80)} → fallback local`);
        parsed = parseLocal(text, state.models, todayISO());
      }
    } else {
      parsed = parseLocal(text, state.models, todayISO());
    }
    const report = applyParsed(state, parsed, makeId);
    lines.push(['dimc', `> ${parsed.engine} · ${parsed.summary || parsed.models.length + ' modelos'}`]);
    report.mutations.forEach(m => lines.push(['mut', `  MUTATED   ${m.name} · ${m.field}: ${m.from ?? 'N/D'} → ${m.to}`]));
    report.newModels.forEach(n => lines.push(['mut', `  NEW MODEL ${n} → cohorte (WATCHLIST)`]));
    report.incidents.forEach(i => lines.push(['mut', `  INCIDENT  ${i.date} SEV ${i.sev} · ${i.title}`]));
    report.banks.forEach(b => lines.push(['mut', `  BANK      ${b} actualizado`]));
    lines.push(['ok', `✓ ${report.confirmed} campos confirmados · ${report.mutations.length} mutaciones · ${report.newModels.length} modelos nuevos · ${report.incidents.length} incidentes (${report.duplicates} duplicados omitidos)${report.thesis ? ' · TESIS ' + report.thesis : ''}`]);
    if (!report.mutations.length && !report.incidents.length && !report.newModels.length) lines.push(['dimc', '  La señal coincide con el estado actual: pipeline verificado sin cambios.']);
    out(lines);
    state.lastIngest = { at: new Date().toISOString(), engine: parsed.engine, mutations: report.mutations.length, incidents: report.incidents.length };
    log('mutate', `INGEST ${parsed.engine} · ${report.mutations.length} mut · ${report.incidents.length} inc · ${report.confirmed} ok`);
    if (report.incidents.length) {
      report.incidents.forEach(i => log('mutate', `INCIDENT ${i.date} · ${i.title.slice(0, 70)}`));
    }
    synth.ping();
    const touched = report.mutations.map(m => m.id);
    renderAllData(touched);
    refreshScenario({ glitch: touched.length ? 0.9 : 0 });
    if (touched.length) osc.flash(touched);
    if (!label.startsWith('SIMULATED') && (touched.length || report.incidents.length || report.newModels.length)) state.realDirty = true;
    renderRouter();
    renderBank();
    renderTimeline(report.incidents[0]?.id);
    unlock('mutator');
    save();
  } catch (e) {
    lines.push(['err', `✗ ${e.message || e}`]);
    out(lines);
    synth.error();
  } finally {
    ingesting = false;
    btns.forEach(b => { b.disabled = false; });
  }
}

function exportState() {
  const payload = {
    kernel: 'MOLOCH.SH', version: KERNEL_VERSION, seed: SEED_DATE, exportedAt: new Date().toISOString(),
    state: { models: state.models, incidents: state.incidents, aliases: state.aliases, thesis: state.thesis, bank: state.bank, achievements: state.achievements, lastIngest: state.lastIngest, log: state.log.slice(0, 60) }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'moloch-state.json' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  synth.click();
  log('sys', 'EXPORT moloch-state.json');
}

async function importState(file) {
  try {
    const json = JSON.parse(await file.text());
    const src = json.state || json;
    if (!Array.isArray(src.models)) throw new Error('El JSON no contiene state.models');
    const next = hydrate({ ...state, ...src });
    Object.assign(state, next);
    state.realDirty = true;
    synth.ping();
    log('mutate', `IMPORT ${file.name} · ${state.models.length} modelos · ${state.incidents.length} incidentes`);
    out([['ok', `✓ Importado ${file.name}: ${state.models.length} modelos, ${state.incidents.length} incidentes.`]]);
    fullRender();
    save();
  } catch (e) {
    out([['err', `✗ Import fallido: ${e.message || e}`]]);
    synth.error();
  }
}

function resetSeed() {
  if (state.realDirty && !confirm('¿Restaurar modelos, incidentes, alias y tesis a la semilla del 2026-10-19? Se pierden las mutaciones locales (exporta antes si las quieres).')) return;
  Object.assign(state, freshMarket());
  state.lastIngest = null;
  state.realDirty = false;
  log('sys', 'RESET TO CLEAN SEED 2026-10-19');
  out([['ok', '✓ Estado de mercado restaurado a la semilla limpia 2026-10-19.']]);
  synth.click();
  fullRender();
  osc.inject(0.6);
  renderTimeline();
  save();
}

/* ── Navigation ───────────────────────────────────────────────────────────── */

const NAV_SECTIONS = ['control-plane', 'cohort-matrix', 'stealth-radar', 'incident-timeline'];
let navLock = 0;

function setNavActive(key) {
  $$('.navtab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.nav === key)));
}

function setTermTab(id) {
  $$('.ttab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tt === id)));
  $$('.term-panel').forEach(p => { p.hidden = p.dataset.tp !== id; });
}

function navTo(key) {
  synth.click();
  setNavActive(key);
  navLock = performance.now() + 900;
  const behavior = reduceMotion ? 'auto' : 'smooth';
  if (key === 'bank' || key === 'prompt') {
    setTermTab(key);
    $('#terminal').scrollIntoView({ behavior, block: 'start' });
    return;
  }
  if (key === 'stealth-radar') unlockBunnyHint();
  document.getElementById(key)?.scrollIntoView({ behavior, block: 'start' });
}

function unlockBunnyHint() {
  const sb = state.aliases.find(a => a.id === 'space-bunny');
  if (sb && sb.masked) state.selectedAlias = 'space-bunny';
  renderAliases();
}

function onScroll() {
  if (performance.now() < navLock) return;
  let cur = NAV_SECTIONS[0];
  for (const id of NAV_SECTIONS) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= 160) cur = id;
  }
  const tt = $('.ttab[aria-selected="true"]')?.dataset.tt;
  if (cur === 'control-plane' && (tt === 'bank' || tt === 'prompt')) {
    const r = $('#terminal').getBoundingClientRect();
    if (r.top < innerHeight * 0.6 && r.bottom > 160) cur = tt;
  }
  setNavActive(cur);
}

/* ── Command palette ──────────────────────────────────────────────────────── */

function commands() {
  return [
    ['01. Control Plane', 'nav', () => navTo('control-plane')],
    ['02. Cohort Matrix', 'nav', () => navTo('cohort-matrix')],
    ['03. Bank Reset Arbitrage', 'nav', () => navTo('bank')],
    ['04. Stealth & Alias Radar', 'nav', () => navTo('stealth-radar')],
    ['05. Incident Timeline', 'nav', () => navTo('incident-timeline')],
    ['06. Task Prompt v2.0', 'nav', () => navTo('prompt')],
    [`X-RAY: ${state.xray ? 'desactivar' : 'activar'}`, 'mode', toggleXray],
    [`SFX: ${state.sfx ? 'silenciar' : 'activar'}`, 'mode', toggleSfx],
    ['Inject [>100K CONTEXT CLIFF]', 'chaos', () => { toggleFault('cliff', true); $('#moloch-os').scrollIntoView({ block: 'nearest' }); }],
    ['Inject [3.5x REASONING BLOAT]', 'chaos', () => { toggleFault('bloat', true); $('#moloch-os').scrollIntoView({ block: 'nearest' }); }],
    ['Inject [SUBSIDY RUG-PULL]', 'chaos', () => { toggleFault('subsidy', true); $('#moloch-os').scrollIntoView({ block: 'nearest' }); }],
    ['Inject [FP8 PROVIDER DEGRADATION]', 'chaos', () => { toggleFault('fp8', true); $('#moloch-os').scrollIntoView({ block: 'nearest' }); }],
    ['Inject ALL faults (chaos monkey)', 'chaos', () => { Object.keys(FAULTS).forEach(k => toggleFault(k, true)); }],
    ['↺ Restore baseline', 'chaos', restoreBaseline],
    ['Bank: T-6h · 80% (use-it-or-lose-it)', 'bank', () => { bankPreset(6, 80); navTo('bank'); }],
    ['Bank: T-48h · 50%', 'bank', () => { bankPreset(48, 50); navTo('bank'); }],
    ['Bank: T-120h · 15% (quota deficit)', 'bank', () => { bankPreset(120, 15); navTo('bank'); }],
    ['Bank tool: Codex // GPT-6.1 Sol', 'bank', () => { state.bank.active = 'codex'; bankPreset(state.bank.tools.codex.hours, state.bank.tools.codex.quota); navTo('bank'); }],
    ['Bank tool: Claude Code // Opus 5.5 & Sonnet 5.5', 'bank', () => { state.bank.active = 'claude-code'; bankPreset(state.bank.tools['claude-code'].hours, state.bank.tools['claude-code'].quota); navTo('bank'); }],
    ...ROUTER_PRESETS.filter(p => p.id !== 'custom').map(p => [`Router: ${p.label}`, 'route', () => { applyPreset(p.id); setTermTab('router'); $('#terminal').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' }); }]),
    ['Console: 01. Cost waveform', 'console', () => setConTab('wave')],
    ['Console: 02. Trap injector matrix', 'console', () => setConTab('trap')],
    ['Console: 03. Cohort radar', 'console', () => setConTab('radar')],
    ['Console: 04. Audit log', 'console', () => setConTab('log')],
    ["Simulate today's 19-OCT signal (flash update 21:00 UTC)", 'ingest', simulate],
    ['↺ Reset to clean seed', 'ingest', resetSeed],
    ['Link Gemini Flash API', 'ingest', openGemini],
    ['+ Log new signal', 'ingest', openSignal],
    ['Export moloch-state.json', 'ingest', exportState],
    ['Copy Prompt v2.0', 'prompt', copyPrompt],
    ['Achievements', 'sys', () => $('#dlg-ach').showModal()]
  ];
}

let palItems = [], palSel = 0;
function renderPalette() {
  const q = $('#pal-input').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  palItems = commands().filter(([label, hint]) => q.every(t => (label + ' ' + hint).toLowerCase().includes(t)));
  palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
  $('#pal-list').innerHTML = palItems.length
    ? palItems.map(([label, hint], i) => `<li role="option" data-i="${i}" aria-selected="${i === palSel}"><span>${esc(label)}</span><small>${esc(hint)}</small></li>`).join('')
    : '<li class="empty">Sin coincidencias.</li>';
  $('#pal-list [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function openPalette() {
  const d = $('#dlg-palette');
  if (d.open) { d.close(); return; }
  [...document.querySelectorAll('dialog[open]')].forEach(x => x.close());
  $('#pal-input').value = '';
  palSel = 0;
  renderPalette();
  d.showModal();
  $('#pal-input').focus();
  synth.click();
  unlock('operator');
}

function runPalette(i) {
  const item = palItems[i];
  if (!item) return;
  $('#dlg-palette').close();
  log('sys', `⌘K → ${item[0]}`);
  item[2]();
}

/* ── Modals ───────────────────────────────────────────────────────────────── */

function openGemini() {
  const cfg = loadGeminiConfig();
  $('#gm-key').value = cfg.key;
  $('#gm-model').value = cfg.model || DEFAULT_GEMINI_MODEL;
  $('#dlg-gemini').showModal();
  synth.click();
}

function openSignal() {
  $('#sg-date').value = todayISO();
  $('#sg-title').value = '';
  $('#sg-detail').value = '';
  $('#sg-tags').value = '';
  $('#sg-sev').value = '2';
  $('#dlg-signal').showModal();
  synth.click();
}

function simulate() {
  setTermTab('ingest');
  $('#ing-text').value = SIMULATED_SIGNAL_19OCT;
  runIngest(SIMULATED_SIGNAL_19OCT, { forceLocal: true, label: 'SIMULATED FLASH UPDATE 19-OCT 21:00Z' });
}

function applyPreset(id) {
  const p = ROUTER_PRESETS.find(x => x.id === id);
  if (!p) return;
  state.router.preset = id;
  if (id !== 'custom') Object.assign(state.router, { ctx: p.ctx, steps: p.steps, text: p.label });
  synth.click();
  renderRouter();
  save();
}

/* ── Render orchestration ─────────────────────────────────────────────────── */

function renderAllData(flashIds = []) {
  updateTicker();
  renderKPIs();
  renderMatrix(flashIds);
}

function fullRender() {
  applyXrayClass();
  renderAllData();
  renderRouter();
  renderBank();
  renderPrompt();
  renderAliases();
  renderTimeline();
  renderAchievements();
  renderAuditLog();
  geminiUI();
  $$('#steps-chips .chip').forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.steps === state.scopeSteps)));
  $$('#mx-block .seg-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.block === state.matrix.block)));
  $$('#mx-rot .seg-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rot === state.matrix.rot)));
  $('#mx-search').value = state.matrix.q;
  if (osc) refreshScenario();
}

/* ── Wiring ───────────────────────────────────────────────────────────────── */

function wire() {
  document.addEventListener('pointerdown', () => synth.ensure(), { once: true, passive: true });

  $$('[data-nav]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); navTo(el.dataset.nav); }));
  addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });

  $('#btn-xray').addEventListener('click', toggleXray);
  $('#btn-sfx').addEventListener('click', toggleSfx);
  $('#btn-ach').addEventListener('click', () => { synth.click(); renderAchievements(); $('#dlg-ach').showModal(); });
  $('#btn-cmd').addEventListener('click', openPalette);
  $('#btn-gemini').addEventListener('click', openGemini);

  $$('.ttab').forEach(b => b.addEventListener('click', () => {
    setTermTab(b.dataset.tt);
    synth.click();
    if (b.dataset.tt === 'bank' || b.dataset.tt === 'prompt') setNavActive(b.dataset.tt);
  }));
  $('.term-tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = $$('.ttab');
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus();
    n.click();
  });

  $('#ing-parse').addEventListener('click', () => runIngest($('#ing-text').value, { label: 'manual' }));
  $('#ing-sim').addEventListener('click', simulate);
  $('#ing-export').addEventListener('click', exportState);
  $('#ing-import').addEventListener('change', e => { const f = e.target.files[0]; if (f) importState(f); e.target.value = ''; });
  $('#ing-reset').addEventListener('click', resetSeed);
  $('#ing-text').addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runIngest($('#ing-text').value, { label: 'manual' }); });

  $('#rt-preset').innerHTML = ROUTER_PRESETS.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  $('#rt-preset').addEventListener('change', e => applyPreset(e.target.value));
  $('#rt-text').addEventListener('input', e => {
    state.router.text = e.target.value;
    if (state.router.preset !== 'custom') { state.router.preset = 'custom'; $('#rt-preset').value = 'custom'; renderRouter(); }
    save();
  });
  const sliderInput = (key, el) => el.addEventListener('input', () => {
    state.router[key] = +el.value;
    state.router.preset = 'custom';
    renderRouter();
    save();
  });
  sliderInput('ctx', $('#rt-ctx'));
  sliderInput('steps', $('#rt-steps'));
  $('#rt-ctx').addEventListener('change', () => synth.click());
  $('#rt-steps').addEventListener('change', () => synth.click());

  $('#bk-tools').addEventListener('click', e => {
    const b = e.target.closest('[data-bank-tool]');
    if (!b) return;
    state.bank.active = b.dataset.bankTool;
    bankInteracted = true;
    synth.click();
    renderBank();
    save();
  });
  const bankInput = (key, el) => el.addEventListener('input', () => {
    state.bank.tools[state.bank.active][key] = +el.value;
    bankInteracted = true;
    renderBank();
    renderRouter();
    save();
  });
  bankInput('hours', $('#bk-hours'));
  bankInput('quota', $('#bk-quota'));
  $('#bk-hours').addEventListener('change', () => { synth.click(); const bp = bankEval(state.bank.active).bp; log('bank', `${state.bank.active} T-${state.bank.tools[state.bank.active].hours}h → P=${bp.pressure.toFixed(2)}`); });
  $('#bk-quota').addEventListener('change', () => { synth.click(); const bp = bankEval(state.bank.active).bp; log('bank', `${state.bank.active} ${state.bank.tools[state.bank.active].quota}% → P=${bp.pressure.toFixed(2)}`); });
  $$('[data-bank-preset]').forEach(b => b.addEventListener('click', () => { const [h, q] = b.dataset.bankPreset.split(',').map(Number); bankPreset(h, q); }));

  $('#copy-prompt').addEventListener('click', copyPrompt);

  $('#cta-route').addEventListener('click', () => { synth.click(); setTermTab('router'); $('#terminal').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); });
  $('#cta-cliff').addEventListener('click', () => {
    toggleFault('cliff', true);
    setConTab('wave');
    if (matchMedia('(max-width: 1180px)').matches) $('#moloch-os').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });

  $$('.ctab').forEach(b => b.addEventListener('click', () => setConTab(b.dataset.ct)));
  $$('#steps-chips .chip').forEach(c => c.addEventListener('click', () => { synth.click(); setSteps(+c.dataset.steps); }));
  $$('.fault').forEach(b => b.addEventListener('click', () => toggleFault(b.dataset.fault)));
  $('#restore').addEventListener('click', restoreBaseline);
  $('#scope-legend').addEventListener('click', e => {
    const b = e.target.closest('[data-lg]');
    if (!b) return;
    osc.toggle(b.dataset.lg);
    b.setAttribute('aria-pressed', String(!osc.hidden.has(b.dataset.lg)));
    synth.click();
  });

  $('#matrix thead').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const k = th.dataset.sort;
    state.matrix.dir = state.matrix.sort === k ? -state.matrix.dir : (k === 'aa' || k === 'volume' ? -1 : 1);
    state.matrix.sort = k;
    synth.click();
    renderMatrix();
    save();
  });
  $('#mx-block').addEventListener('click', e => {
    const b = e.target.closest('[data-block]');
    if (!b) return;
    state.matrix.block = b.dataset.block;
    $$('#mx-block .seg-btn').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    synth.click();
    renderMatrix();
    save();
  });
  $('#mx-rot').addEventListener('click', e => {
    const b = e.target.closest('[data-rot]');
    if (!b) return;
    state.matrix.rot = b.dataset.rot;
    $$('#mx-rot .seg-btn').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    synth.click();
    renderMatrix();
    save();
  });
  $('#mx-search').addEventListener('input', e => { state.matrix.q = e.target.value; renderMatrix(); save(); });

  $('#alias-list').addEventListener('click', e => {
    const um = e.target.closest('[data-unmask]');
    if (um) { e.stopPropagation(); unmask(um.dataset.unmask); return; }
    const a = e.target.closest('[data-alias]');
    if (a) selectAlias(a.dataset.alias);
  });
  $('#alias-list').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-alias]')) { e.preventDefault(); selectAlias(e.target.dataset.alias); }
  });

  $('#log-signal').addEventListener('click', openSignal);
  $('#goto-ingest').addEventListener('click', () => { synth.click(); setTermTab('ingest'); $('#terminal').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); $('#ing-text').focus({ preventScroll: true }); });

  $('#dlg-gemini').addEventListener('close', () => {
    if ($('#dlg-gemini').returnValue !== 'save') return;
    const key = $('#gm-key').value.trim();
    const mdl = $('#gm-model').value.trim() || DEFAULT_GEMINI_MODEL;
    const ok = saveGeminiConfig({ key, model: mdl });
    geminiUI();
    synth.ping();
    log('sys', key ? `GEMINI LINKED · ${mdl}` : 'GEMINI sin clave · motor local');
    toast(ok
      ? { kicker: 'GEMINI FLASH // LINK', title: key ? 'API enlazada' : 'Motor local', body: key ? `Modelo ${mdl}. La ingesta usará generateContent con salida JSON.` : 'Sin clave: la ingesta usa el parser determinista local.', icon: '⚡', kind: 'info', ttl: 4000 }
      : { kicker: 'GEMINI FLASH // ERROR', title: 'localStorage bloqueado', body: 'El navegador no permite guardar la clave en este origen.', icon: '!', kind: 'err' });
  });
  $('#gm-clear').addEventListener('click', () => {
    clearGeminiConfig();
    $('#gm-key').value = '';
    $('#gm-model').value = DEFAULT_GEMINI_MODEL;
    geminiUI();
    log('sys', 'GEMINI UNLINKED · clave eliminada de localStorage');
    synth.click();
    $('#dlg-gemini').close('cancel');
  });

  $('#dlg-signal').addEventListener('close', () => {
    if ($('#dlg-signal').returnValue !== 'save') return;
    const title = $('#sg-title').value.trim();
    const date = $('#sg-date').value;
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const inc = {
      id: makeId('inc-' + date), date, dateLabel: null, sev: +$('#sg-sev').value || 2, title,
      detail: $('#sg-detail').value.trim(),
      tags: $('#sg-tags').value.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 6),
      source: 'manual'
    };
    if (!inc.tags.length) inc.tags = ['SIGNAL'];
    state.incidents.push(inc);
    state.realDirty = true;
    synth.ping();
    log('mutate', `MANUAL SIGNAL ${date} SEV ${inc.sev} · ${title.slice(0, 70)}`);
    renderTimeline(inc.id);
    focusIncident(inc.id);
    save();
  });

  $('#pal-input').addEventListener('input', () => { palSel = 0; renderPalette(); });
  $('#pal-input').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(palSel); }
  });
  $('#pal-list').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) runPalette(+li.dataset.i); });
  $('#pal-list').addEventListener('mousemove', e => {
    const li = e.target.closest('li[data-i]');
    if (li && +li.dataset.i !== palSel) { palSel = +li.dataset.i; $$('#pal-list li').forEach(x => x.setAttribute('aria-selected', String(x === li))); }
  });
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close('cancel'); }));

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  });
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */

function boot() {
  buildTicker();
  wire();
  osc = new ChaosOscilloscope($('#scope'), { compute: scopeCompute });
  radar = new CohortRadar($('#radar'), { compute: radarCompute });
  aliasRadar = new AliasRadar($('#alias-radar'), { getAliases: () => state.aliases, onPick: id => selectAlias(id, true) });
  const first = state.incidents.reduce((m, i) => (i.date < m ? i.date : m), '2026-08-26');
  seismo = new Seismograph($('#seismo'), {
    getIncidents: () => state.incidents,
    start: new Date(Date.parse(first + 'T00:00:00Z') - 6 * 864e5),
    end: new Date(Math.max(Date.now(), Date.parse(SEED_DATE + 'T23:59:59Z'))),
    onPick: focusIncident
  });
  renderFormula();
  fullRender();
  $('#btn-sfx').setAttribute('aria-pressed', String(state.sfx));
  $('#btn-sfx').classList.toggle('lime', state.sfx);
  $$('[data-k="sfx-state"]').forEach(e => { e.textContent = state.sfx ? 'ON' : 'OFF'; });
  out([
    ['dimc', `> MOLOCH.SH v${KERNEL_VERSION} · seed ${SEED_DATE} · ${state.models.length} modelos · ${state.incidents.length} incidentes`],
    ['ok', state.lastIngest ? `✓ Última ingesta ${state.lastIngest.at.slice(0, 16).replace('T', ' ')}Z · ${state.lastIngest.engine} · ${state.lastIngest.mutations} mutaciones` : '✓ Estado semilla cargado. Pega la señal diaria o pulsa SIMULATE.']
  ]);
  if (!state.log.length) log('sys', `BOOT · kernel v${KERNEL_VERSION} · seed ${SEED_DATE}`);

  const visible = new Map();
  const io = new IntersectionObserver(entries => entries.forEach(en => visible.set(en.target, en.isIntersecting)), { rootMargin: '80px' });
  [$('#scope'), $('#radar'), $('#alias-radar'), $('#seismo')].forEach(c => { visible.set(c, true); io.observe(c); });

  const t0 = performance.now();
  let frames = 0, fpsT = t0, lastSec = -1, lastTariff = tariff();
  const fpsEl = $('#fps'), timerEl = $('#session-timer');
  const loop = now => {
    frames++;
    if (now - fpsT >= 1000) {
      measuredFps = frames * 1000 / (now - fpsT);
      fpsEl.textContent = Math.round(measuredFps);
      frames = 0;
      fpsT = now;
    }
    const sec = Math.floor((now - t0) / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      timerEl.textContent = hms(sec);
      updateTicker();
      const tf = tariff();
      if (tf !== lastTariff) {
        lastTariff = tf;
        log('sys', `DEEPSEEK TARIFF → ${tf === 'valley' ? 'VALLEY -50%' : 'PEAK'}`);
        renderAllData();
        renderRouter();
        renderBank();
        refreshScenario({ glitch: 0.5 });
      }
    }
    if (conTab === 'wave' && visible.get($('#scope'))) osc.frame(now);
    if (conTab === 'radar' && visible.get($('#radar'))) radar.frame(now);
    if (visible.get($('#alias-radar'))) aliasRadar.frame(now);
    if (visible.get($('#seismo'))) seismo.frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
