/* MOLOCH.SH v2.6 — seed dataset + deterministic cost kernel.
   Every market figure below is the user-supplied seed anchored to 2026-10-19.
   Fields with no seed value are null and render as "N/D"; the kernel never fills them in. */

export const KERNEL_VERSION = '2.6';
export const SEED_DATE = '2026-10-19';
export const STALENESS_LIMIT_DAYS = 90;

/* Audited agentic trajectory used by X-RAY mode and every "audited" figure.
   Context ramps linearly from ctxRamp·ctx (first call) to ctx (last call); each call
   re-sends the live context, emits visible output plus model-specific CoT tokens. */
export const AUDIT = Object.freeze({
  ctx: 150000,
  steps: 12,
  ctxRamp: 0.35,
  visibleOutPerStep: 1200,
  cotBasePerStep: 18000 / 3.5,
  bloatMult: 3.5,
  cacheHit: 0.7,
  fp8Retry: 2.4
});

/* DeepSeek off-peak discount: 16:30–00:30 UTC. */
export const DEEPSEEK_WINDOW = Object.freeze({ valleyStartMin: 16 * 60 + 30, valleyEndMin: 30 });

export function minutesUTC(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
}

export function isValley(date = new Date()) {
  const m = minutesUTC(date);
  return m >= DEEPSEEK_WINDOW.valleyStartMin || m < DEEPSEEK_WINDOW.valleyEndMin;
}

export function minutesToTariffSwitch(date = new Date()) {
  const m = minutesUTC(date);
  if (isValley(date)) {
    const end = DEEPSEEK_WINDOW.valleyEndMin + (m >= DEEPSEEK_WINDOW.valleyStartMin ? 1440 : 0);
    return end - m;
  }
  return DEEPSEEK_WINDOW.valleyStartMin - m;
}

export const BLOCKS = Object.freeze({
  open: 'OPEN / CHINESE MoE',
  us: 'US PROPRIETARY FLOOR & FRONTIER'
});

export const ROTATION = Object.freeze(['PROMOTED', 'ACTIVE', 'WATCHLIST']);

export const SEED_MODELS = [
  {
    id: 'mimo-pro', name: 'Xiaomi MiMo-V2.6-Pro', short: 'MiMo-V2.6-Pro', vendor: 'Xiaomi', block: 'open',
    license: 'MIT', arch: '1.02T total / 42B active MoE', ctxMax: null,
    aa: 46.0, price: { in: 0.18, out: 0.54, cache: 0.018 }, costTask: 0.13,
    volume: null, volRank: null, delta: null,
    quant: 'Native mxfp4 checkpoint (566GB) · 1× nodo 8×H200/B200', silicon: 'Single-node · servido nativo',
    rotation: 'ACTIVE', cot: 0.85, compressed: false, thirdParty: false, nativeServing: true,
    scope: true, color: '#00E5FF', alias: null,
    match: ['mimo[-\\s]?v?2\\.6[-\\s]?pro', 'mimo.{0,8}pro']
  },
  {
    id: 'mimo-flash', name: 'Xiaomi MiMo-V2.6-Flash', short: 'MiMo-V2.6-Flash', vendor: 'Xiaomi', block: 'open',
    license: 'MIT', arch: '309B / 15B active MoE', ctxMax: null,
    aa: 43.2, price: { in: 0.10, out: 0.28, cache: 0.010 }, costTask: 0.09,
    volume: 9.63, volRank: 4, delta: null,
    quant: 'Endpoints de terceros', silicon: '—',
    rotation: 'ACTIVE', cot: 0.75, compressed: false, thirdParty: true,
    scope: false, color: '#7FF3FF', alias: null,
    match: ['mimo[-\\s]?v?2\\.6[-\\s]?flash', 'mimo.{0,8}flash']
  },
  {
    id: 'deepseek-1017', name: 'DeepSeek V4.1-Flash (build 1017)', short: 'DeepSeek V4.1-Flash-1017', vendor: 'DeepSeek', block: 'open',
    license: 'MIT', arch: '552B MoE · 1M ctx', ctxMax: 1000000,
    aa: 45.0, price: { in: 0.30, out: 1.20, cache: 0.030 }, valley: { in: 0.15, out: 0.60, cache: 0.015 }, costTask: 0.26,
    volume: 25.6, volRank: 1, delta: null,
    quant: 'Swap silencioso → build 1017 (17 OCT): CoT comprimido', silicon: 'Verificación Ascend: N/D',
    rotation: 'ACTIVE', cot: 0.55, compressed: true, thirdParty: true,
    scope: true, color: '#00E676', alias: 'deepseek/deepseek-v4.1-flash',
    match: ['deepseek']
  },
  {
    id: 'minimax-m31', name: 'MiniMax M3.1 Flash', short: 'MiniMax M3.1 Flash', vendor: 'MiniMax', block: 'open',
    license: null, arch: 'N/D · ex-stealth/space-bunny-alpha · >200 TPS', ctxMax: null,
    aa: null, price: { in: 0.15, out: 0.60, cache: 0.015 }, costTask: null,
    volume: 38.7, volRank: null, delta: null,
    volNote: '28.5% del Top 20 durante la fase stealth gratuita (OpenCode)',
    quant: 'Desenmascarado 19 OCT 2026', silicon: '>200 TPS',
    rotation: 'PROMOTED', cot: 0.8, compressed: false, thirdParty: true,
    subsidy: { factor: 0, label: 'FREE (stealth)' },
    scope: true, color: '#CCFF00', alias: 'stealth/space-bunny-alpha',
    match: ['minimax', 'space[-\\s]?bunny']
  },
  {
    id: 'glm-53', name: 'Z.ai GLM-5.3-Flash', short: 'GLM-5.3-Flash', vendor: 'Z.ai', block: 'open',
    license: 'MIT', arch: '320B-A18B · 1M ctx multimodal', ctxMax: 1000000,
    aa: 41.8, price: { in: 0.20, out: 0.60, cache: null }, costTask: null,
    volume: 9.7, volRank: 3, delta: -40,
    volNote: 'cayó -40% tras el fin de la promo 50% (9 SEP)',
    quant: 'Endpoints de terceros', silicon: 'Verificación Ascend: N/D',
    rotation: 'WATCHLIST', cot: 0.95, compressed: false, thirdParty: true,
    subsidy: { factor: 0.5, label: 'PROMO -50%' },
    scope: true, color: '#B388FF', alias: null,
    match: ['glm[-\\s]?5\\.3', 'glm']
  },
  {
    id: 'qwen-flash-next', name: 'Qwen3.8-Flash-Next', short: 'Qwen3.8-Flash-Next', vendor: 'Alibaba', block: 'open',
    license: null, arch: '125B + 51B n-gram (6B active)', ctxMax: 262000,
    aa: null, price: { in: 0.08, out: 0.24, cache: null }, costTask: null,
    volume: null, volRank: null, delta: null,
    quant: '262K nativo + fricción YaRN', silicon: 'Verificación Ascend: N/D',
    rotation: 'WATCHLIST', cot: 1.0, compressed: false, thirdParty: true,
    volNote: 'eclipsado en volumen API por Qwen3.8 Max (0902)',
    scope: false, color: '#FF80AB', alias: null,
    match: ['qwen3?\\.?8[-\\s]?flash', 'flash[-\\s]?next']
  },
  {
    id: 'qwen-max', name: 'Qwen3.8 Max (0902)', short: 'Qwen3.8 Max', vendor: 'Alibaba', block: 'open',
    license: null, arch: 'N/D · snapshot 0902', ctxMax: null,
    aa: null, price: { in: null, out: null, cache: null }, costTask: null,
    volume: null, volRank: null, delta: null,
    quant: 'Snapshot fijado 0902', silicon: '—',
    rotation: 'ACTIVE', cot: 1.1, compressed: false, thirdParty: false,
    scope: false, color: '#F48FB1', alias: 'qwen/qwen3.8-max',
    match: ['qwen3?\\.?8[-\\s]?max', 'qwen.{0,6}max']
  },
  {
    id: 'opus-55', name: 'Claude Opus 5.5', short: 'Opus 5.5', vendor: 'Anthropic', block: 'us',
    license: 'Propietario', arch: 'Frontier · banco Claude Code', ctxMax: null,
    aa: 58.0, price: { in: 5.00, out: 25.00, cache: 0.50 }, cacheWrite: 1.25, costTask: 2.45,
    volume: null, volRank: null, delta: null, note: '-40% coste/tarea vs Opus 5',
    quant: 'First-party', silicon: '—',
    rotation: 'ACTIVE', cot: 1.15, compressed: false, thirdParty: false,
    scope: false, color: '#FF8A65', alias: null,
    match: ['opus[-\\s]?5\\.5', 'opus']
  },
  {
    id: 'sonnet-55', name: 'Claude Sonnet 5.5', short: 'Sonnet 5.5', vendor: 'Anthropic', block: 'us',
    license: 'Propietario', arch: 'Frontier mid-tier · banco Claude Code', ctxMax: null,
    aa: 56.0, price: { in: 2.00, out: 10.00, cache: 0.20 }, cacheWrite: 1.25, costTask: 1.08,
    volume: null, volRank: null, delta: null,
    quant: 'First-party', silicon: '—',
    rotation: 'ACTIVE', cot: 1.0, compressed: false, thirdParty: false,
    scope: true, color: '#FF5722', alias: null,
    match: ['sonnet[-\\s]?5\\.5', 'sonnet']
  },
  {
    id: 'fable-51', name: 'Claude Fable 5.1', short: 'Fable 5.1', vendor: 'Anthropic', block: 'us',
    license: 'Propietario', arch: 'Tier de síntesis/narrativa de alto contexto', ctxMax: null,
    aa: null, price: { in: 3.00, out: 15.00, cache: 0.75 }, cacheWrite: 1.25, costTask: null,
    volume: null, volRank: null, delta: null, note: 'Cached read -75%',
    quant: 'First-party · cached read -75% ($0.75)', silicon: '—',
    rotation: 'WATCHLIST', cot: 1.0, compressed: false, thirdParty: false,
    scope: false, color: '#FFAB91', alias: null,
    match: ['fable']
  },
  {
    id: 'haiku-55', name: 'Claude Haiku 5.5', short: 'Haiku 5.5', vendor: 'Anthropic', block: 'us',
    license: 'Propietario', arch: 'Floor tier', ctxMax: null,
    aa: 44.5, price: { in: 0.10, out: 0.50, cache: 0.010 }, cacheWrite: 1.25, costTask: null,
    cliff: { threshold: 100000, mult: 5 },
    volume: null, volRank: null, delta: null,
    quant: 'TRAP: $0.50/$2.50 >100K ctx (5×)', silicon: 'First-party',
    rotation: 'WATCHLIST', cot: 0.8, compressed: false, thirdParty: false,
    scope: true, color: '#FF2A55', alias: null,
    match: ['haiku']
  },
  {
    id: 'gpt6-astra', name: 'GPT-6 Astra', short: 'GPT-6 Astra', vendor: 'OpenAI', block: 'us',
    license: 'Propietario', arch: 'Frontier', ctxMax: null,
    aa: 53.0, price: { in: 4.00, out: 16.00, cache: 1.00 }, costTask: null,
    volume: null, volRank: null, delta: null,
    quant: 'First-party', silicon: '—',
    rotation: 'ACTIVE', cot: 1.1, compressed: false, thirdParty: false,
    scope: false, color: '#FFE082', alias: null,
    match: ['astra']
  },
  {
    id: 'gpt61-sol', name: 'GPT-6.1 Sol', short: 'GPT-6.1 Sol', vendor: 'OpenAI', block: 'us',
    license: 'Propietario', arch: 'Codex flagship · banco Codex', ctxMax: null,
    aa: 52.0, price: { in: 1.50, out: 6.00, cache: 0.375 }, costTask: 0.72,
    volume: null, volRank: null, delta: null,
    quant: 'First-party', silicon: '—',
    rotation: 'ACTIVE', cot: 1.0, compressed: false, thirdParty: false,
    scope: true, color: '#FFB300', alias: null,
    match: ['gpt[-\\s]?6\\.1', '\\bsol\\b']
  },
  {
    id: 'gpt6-luna', name: 'GPT-6 Luna', short: 'GPT-6 Luna', vendor: 'OpenAI', block: 'us',
    license: 'Propietario', arch: 'Floor tier · contexto corto', ctxMax: null,
    aa: 43.8, price: { in: 0.10, out: 0.50, cache: 0.025 }, costTask: 0.068,
    volume: null, volRank: null, delta: null,
    quant: 'First-party · coste/tarea medido en ctx corto', silicon: '—',
    rotation: 'WATCHLIST', cot: 0.7, compressed: false, thirdParty: false,
    scope: false, color: '#B0BEC5', alias: null,
    match: ['luna']
  },
  {
    id: 'gemini-38-flash', name: 'Gemini 3.8 Flash', short: 'Gemini 3.8 Flash', vendor: 'Google', block: 'us',
    license: 'Propietario', arch: 'Floor tier', ctxMax: null,
    aa: null, price: { in: 0.12, out: 0.48, cache: null }, costTask: null,
    volume: null, volRank: null, delta: null,
    quant: 'First-party', silicon: '—',
    rotation: 'ACTIVE', cot: 0.8, compressed: false, thirdParty: false,
    scope: false, color: '#80D8FF', alias: null,
    match: ['gemini[-\\s]?3\\.8']
  },
  {
    id: 'gemini-4-argon', name: 'Gemini 4 Argon', short: 'Gemini 4 Argon', vendor: 'Google', block: 'us',
    license: 'Propietario', arch: 'Frontier · preview restringida', ctxMax: null,
    aa: null, price: { in: 2.50, out: 10.00, cache: null }, costTask: null,
    volume: null, volRank: null, delta: null,
    quant: 'Gated preview · precio de referencia', silicon: '—',
    rotation: 'WATCHLIST', cot: 1.1, compressed: false, thirdParty: false,
    scope: false, color: '#90CAF9', alias: null,
    match: ['argon', 'gemini[-\\s]?4']
  }
];

export const SEED_INCIDENTS = [
  {
    id: 'inc-0826', date: '2026-08-26', dateLabel: '26 AUG', sev: 2,
    title: 'Lanzamiento GLM-5.3-Flash y Qwen3.8-Flash-Next',
    detail: 'Z.ai abre GLM-5.3-Flash (MIT, 320B-A18B, 1M ctx multimodal) con promo -50%. Alibaba lanza Qwen3.8-Flash-Next (125B+51B n-gram, 6B activos, 262K nativo).',
    tags: ['LAUNCH', 'OPEN'], source: 'seed'
  },
  {
    id: 'inc-0909', date: '2026-09-09', dateLabel: '09 SEP', sev: 4,
    title: 'Fin de la promo GLM-5.3-Flash: volumen OpenRouter -40%',
    detail: 'Expira el descuento del 50%. El precio vuelve a $0.20/$0.60 y el volumen cae a 9.7T tok/sem (#3). Primer dato empírico de elasticidad post-subsidio.',
    tags: ['SUBSIDY', 'RUG-PULL'], source: 'seed'
  },
  {
    id: 'inc-0921', date: '2026-09-21', dateLabel: '21–22 SEP', sev: 3,
    title: 'Xiaomi MiMo-V2.6 Pro/Flash con checkpoint nativo mxfp4 · GPT-6 Luna',
    detail: 'MiMo-V2.6-Pro (1.02T/42B, 566GB mxfp4) cabe en un único nodo 8×H200/B200; MiMo-V2.6-Flash 309B/15B. OpenAI lanza GPT-6 Luna a $0.10/$0.50.',
    tags: ['LAUNCH', 'QUANT', 'FLOOR'], source: 'seed'
  },
  {
    id: 'inc-1007', date: '2026-10-07', dateLabel: '07 OCT', sev: 5,
    title: 'Claude Haiku 5.5: precipicio de contexto >100K (5×)',
    detail: 'Haiku 5.5 sale a $0.10/$0.50 hasta 100K de contexto; por encima pasa a $0.50/$2.50. Trampa de facturación para cargas agénticas de repositorio completo.',
    tags: ['BILLING TRAP', 'CLIFF'], source: 'seed'
  },
  {
    id: 'inc-1017', date: '2026-10-17', dateLabel: '17 OCT', sev: 4,
    title: 'DeepSeek V4.1-Flash: swap silencioso al build 1017',
    detail: 'Mismo slug, nuevo build. Verbosidad CoT reducida: coste/tarea $0.26 con AA 45.0. Sin changelog público en el momento del swap.',
    tags: ['SILENT SWAP', 'COT'], source: 'seed'
  },
  {
    id: 'inc-1019', date: '2026-10-19', dateLabel: '19 OCT', sev: 5,
    title: 'stealth/space-bunny-alpha desenmascarado como MiniMax M3.1 Flash',
    detail: 'Tras la fase gratuita en OpenCode (38.7T tok/sem, 28.5% del Top 20), el modelo se publica a $0.15/$0.60 con cache read $0.015 y >200 TPS.',
    tags: ['STEALTH', 'UNMASKED'], source: 'seed'
  }
];

export const SEED_ALIASES = [
  {
    id: 'space-bunny', alias: 'stealth/space-bunny-alpha', resolved: 'MiniMax M3.1 Flash', model: 'minimax-m31',
    date: '2026-10-19', status: 'UNMASKED', masked: true, angle: 38, radius: 0.72,
    detail: 'Fase stealth gratuita en OpenCode con 38.7T tok/sem (28.5% del Top 20). Tarifa post-reveal $0.15/$0.60, cache read $0.015, >200 TPS.'
  },
  {
    id: 'ds-1017', alias: 'deepseek/deepseek-v4.1-flash', resolved: 'build 1017 (swap silencioso)', model: 'deepseek-1017',
    date: '2026-10-17', status: 'SILENT SWAP', masked: false, angle: 132, radius: 0.55,
    detail: 'Mismo slug, build nuevo con CoT comprimido: coste/tarea $0.26, AA 45.0. Valle -50% de 16:30 a 00:30 UTC.'
  },
  {
    id: 'haiku-cliff', alias: 'anthropic/claude-haiku-5.5', resolved: 'tarifa escalonada >100K (5×)', model: 'haiku-55',
    date: '2026-10-07', status: 'BILLING TRAP', masked: false, angle: 214, radius: 0.84,
    detail: '$0.10/$0.50 hasta 100K de contexto; $0.50/$2.50 por encima. Invisible en la tarjeta de precio nominal.'
  },
  {
    id: 'mimo-mxfp4', alias: 'xiaomi/mimo-v2.6-pro', resolved: 'checkpoint nativo mxfp4 (566GB)', model: 'mimo-pro',
    date: '2026-09-21', status: 'NATIVE QUANT', masked: false, angle: 286, radius: 0.4,
    detail: 'Cabe en 1× nodo 8×H200/B200. Servido nativo: inmune a la degradación fp8 de endpoints de terceros.'
  },
  {
    id: 'qwen-0902', alias: 'qwen/qwen3.8-max', resolved: 'snapshot 0902', model: 'qwen-max',
    date: null, status: 'PINNED SNAPSHOT', masked: false, angle: 336, radius: 0.62,
    detail: 'Qwen3.8 Max (0902) eclipsa en volumen API a Qwen3.8-Flash-Next (262K nativo + fricción YaRN).'
  }
];

export const ROUTER_PRESETS = [
  { id: 'babel', label: 'Babel Life: Feistel Cipher & Hex Canvas Engine (140K repo)', ctx: 140000, steps: 14, floor: 45 },
  { id: 'refactor', label: 'Full-Repo Refactor + Property-Based Testing (220K repo)', ctx: 220000, steps: 22, floor: 45 },
  { id: 'bugfix', label: 'Quick Bugfix / Boilerplate (25K context)', ctx: 25000, steps: 4, floor: 40 },
  { id: 'custom', label: 'Custom workload…', ctx: 120000, steps: 12, floor: 43 }
];

export const BANK_TOOLS = [
  { id: 'codex', label: 'CODEX // GPT-6.1 SOL', model: 'gpt61-sol', cycleHours: 168 },
  { id: 'claude-code', label: 'CLAUDE CODE // OPUS 5.5 & SONNET 5.5', model: 'opus-55', alt: 'sonnet-55', cycleHours: 168 }
];

export const ROUTER_BANK = ['gpt61-sol', 'opus-55'];
export const ROUTER_API = ['mimo-pro', 'deepseek-1017', 'minimax-m31', 'haiku-55'];

/* ── Deterministic cost kernel ─────────────────────────────────────────────── */

export function hasPrice(model) {
  return !!model && !!model.price && Number.isFinite(model.price.in) && Number.isFinite(model.price.out);
}

export function priceFor(model, { tariff = 'peak', subsidized = false } = {}) {
  if (!hasPrice(model)) return null;
  let p = { in: model.price.in, out: model.price.out, cache: Number.isFinite(model.price.cache) ? model.price.cache : null };
  if (tariff === 'valley' && model.valley) {
    p = { in: model.valley.in, out: model.valley.out, cache: Number.isFinite(model.valley.cache) ? model.valley.cache : p.cache };
  }
  if (subsidized && model.subsidy) {
    const f = model.subsidy.factor;
    p = { in: p.in * f, out: p.out * f, cache: p.cache === null ? null : p.cache * f };
  }
  return p;
}

export function blendedNominal(model) {
  if (!hasPrice(model)) return null;
  return 0.75 * model.price.in + 0.25 * model.price.out;
}

/* Audited agentic cost of one run.
   Cache: from call 2 onward AUDIT.cacheHit of the re-sent context is billed at cache-read; the miss share
   (and the whole first call) is billed at input × cacheWrite where the provider charges cache writes (Anthropic 1.25×).
   A context surcharge multiplies input, cache-read, cache-write and output alike.
   opts: ctx, steps, tariff ('peak'|'valley'), cliff (apply context surcharges), bloat (3.5× CoT),
         fp8 (third-party retry loops), subsidized (promo/free prices). */
export function agenticCost(model, opts = {}) {
  const o = { ctx: AUDIT.ctx, steps: AUDIT.steps, tariff: 'peak', cliff: true, bloat: false, fp8: false, subsidized: false, ...opts };
  const p = priceFor(model, o);
  if (!p) return null;
  const steps = Math.max(1, Math.round(o.steps));
  const cotPerStep = AUDIT.cotBasePerStep * (model.cot || 1) * (o.bloat && !model.compressed ? AUDIT.bloatMult : 1);
  let input = 0, visible = 0, cot = 0, surcharge = 0, stepsOver = 0, tokIn = 0, tokOut = 0;
  for (let i = 0; i < steps; i++) {
    const r = steps === 1 ? 1 : AUDIT.ctxRamp + (1 - AUDIT.ctxRamp) * i / (steps - 1);
    const stepCtx = o.ctx * r;
    const mult = o.cliff && model.cliff && stepCtx > model.cliff.threshold ? model.cliff.mult : 1;
    if (mult > 1) stepsOver++;
    const cached = p.cache !== null && i > 0 ? stepCtx * AUDIT.cacheHit : 0;
    const fresh = stepCtx - cached;
    const write = p.cache !== null && model.cacheWrite ? model.cacheWrite : 1;
    const cIn = (fresh * p.in * write + (cached ? cached * p.cache : 0)) / 1e6;
    const cVis = AUDIT.visibleOutPerStep * p.out / 1e6;
    const cCot = cotPerStep * p.out / 1e6;
    input += cIn * mult;
    visible += cVis * mult;
    cot += cCot * mult;
    surcharge += (cIn + cVis + cCot) * (mult - 1);
    tokIn += stepCtx;
    tokOut += AUDIT.visibleOutPerStep + cotPerStep;
  }
  const retry = o.fp8 && model.thirdParty ? AUDIT.fp8Retry : 1;
  const total = (input + visible + cot) * retry;
  return {
    total, input: input * retry, visible: visible * retry, cot: cot * retry,
    surcharge: surcharge * retry, retry, stepsOver, steps,
    tokIn: tokIn * retry, tokOut: tokOut * retry, cotPerStep,
    effPerM: total / ((tokIn + tokOut) * retry) * 1e6
  };
}

/* Moloch Burn Pressure: quota/time ratio against the sustainable burn of the bank cycle. */
export function burnPressure(hours, quotaPct, cycleHours = 168) {
  const h = Math.max(1, hours);
  const requiredRate = quotaPct / h;
  const nominalRate = 100 / cycleHours;
  const pressure = requiredRate / nominalRate;
  const index = 100 * pressure / (1 + pressure);
  return { requiredRate, nominalRate, pressure, index, zone: pressure >= 1 ? 'USE' : 'DEFICIT' };
}

/* GLM empirical elasticity: blended price ×2 (promo end) → volume -40%. Linear per $/1M blended. */
export function subsidyStress(models) {
  const glm = models.find(m => m.id === 'glm-53');
  const mm = models.find(m => m.id === 'minimax-m31');
  if (!glm || !mm || !hasPrice(glm) || !hasPrice(mm)) return null;
  const glmFull = blendedNominal(glm);
  const glmPromo = glmFull * glm.subsidy.factor;
  const glmDrop = Math.abs(glm.delta ?? -40) / 100;
  const perDollar = glmDrop / (glmFull - glmPromo);
  const mmFull = blendedNominal(mm);
  const mmFree = mmFull * (mm.subsidy ? mm.subsidy.factor : 0);
  const projectedDrop = Math.min(0.95, perDollar * (mmFull - mmFree));
  return {
    glmPromo, glmFull, glmDrop, perDollar, mmFull, mmFree, projectedDrop,
    retention: 1 - projectedDrop,
    projectedVolume: mm.volume === null ? null : mm.volume * (1 - projectedDrop)
  };
}

export const PROMPT_V2 = `PROMPT PERSISTENTE v2.0 — MOLOCH.SH // VIGILANCIA DIARIA DE ARBITRAJE LLM
Semilla de referencia: 2026-10-19 · Kernel v2.6

ROL
Actúas como auditor cuantitativo de infraestructura LLM. Cada día mides el diferencial
de coste real por tarea entre la cohorte abierta/china MoE y el suelo/frontera propietario
de EE. UU. No resumes marketing: mides coste por tarea resuelta, trampas de facturación,
cambios silenciosos de build y estrangulamiento de bancos de suscripción.

COHORTES (estado de la semilla)
A · Open/Chinese MoE: Xiaomi MiMo-V2.6-Pro, MiMo-V2.6-Flash, DeepSeek V4.1-Flash (build 1017),
    MiniMax M3.1 Flash (ex-stealth/space-bunny-alpha), Z.ai GLM-5.3-Flash,
    Qwen3.8-Flash-Next, Qwen3.8 Max (0902).
B · US Proprietary Floor & Frontier: Claude Opus 5.5, Sonnet 5.5, Fable 5.1, Haiku 5.5,
    GPT-6 Astra, GPT-6.1 Sol, GPT-6 Luna, Gemini 3.8 Flash, Gemini 4 Argon.

FUENTES (por orden de autoridad)
1. Páginas oficiales de precios y changelogs de cada proveedor.
2. Artificial Analysis (índice v4.3.2 o la versión vigente; indica siempre la versión).
3. OpenRouter: ranking semanal de tokens, endpoints y cuantización declarada por proveedor.
4. Repos oficiales (Hugging Face / GitHub) para pesos, licencias y checkpoints.
Las redes sociales sólo sirven como pista, nunca como confirmación.

MÉTRICAS OBLIGATORIAS POR MODELO
- Precio nominal $/1M (input / output / cache-read) y todo umbral de contexto con recargo.
- Coste por tarea (AA) y coste agéntico auditado: trayectoria de 150K de contexto,
  12 tool calls y multiplicador de verbosidad CoT propio del modelo.
- Volumen OpenRouter (T tok/semana), posición y delta % semana contra semana.
- Cuantización y silicio (mxfp4 nativo, fp8 de terceros, verificación Ascend) y cambios
  de build o de alias.

REGLAS DE AUTO-ROTACIÓN DE COHORTE
R1 · PROMOTED: un modelo nuevo o desenmascarado entra si alcanza el Top 10 de OpenRouter
     en volumen semanal, o si su AA ≥ mediana de su cohorte con coste/tarea ≤ mediana.
R2 · ACTIVE: se mantiene mientras conserve el Top 15 de volumen o un AA a ≤ 3 puntos
     del líder de su cohorte.
R3 · WATCHLIST: pasa a vigilancia si su volumen cae ≥ 30 % semana contra semana, si su
     precio efectivo sube > 25 %, si aparece un recargo de contexto no documentado o si
     hay un swap de build sin changelog.
R4 · SALIDA: tras 3 informes consecutivos en WATCHLIST sin recuperación, sale de la
     cohorte y se archiva con su último estado conocido.
R5 · Un alias stealth no se promueve hasta que el proveedor u OpenRouter confirmen su
     identidad.

CLÁUSULAS
1 · Separa siempre HECHO VERIFICADO (con fuente y fecha) de INFERENCIA y de ESPECULACIÓN.
2 · Si un dato no se puede verificar hoy, escribe "N/D". Nunca lo estimes en silencio.
3 · Trampas de facturación: reporta todo umbral de contexto (p. ej. >100K) que multiplique
    el precio, con el multiplicador exacto y los precios por encima del umbral.
4 · Cambios silenciosos: compara el build o fingerprint del endpoint con el informe
    anterior; cualquier cambio sin changelog es un INCIDENTE.
5 · Subsidios: marca promociones y fases gratuitas con su fecha de caducidad; tras el fin,
    mide la retención de volumen y repórtala como delta %.
6 · Reset de bancos de suscripción (Codex / GPT-6.1 Sol y Claude Code / Opus 5.5 y
    Sonnet 5.5): reporta las horas hasta el próximo reset y el % de cuota restante.
    Calcula la presión de quema P = (cuota restante % ÷ horas al reset) ÷ (100 ÷ 168).
    · P ≥ 1 → ZONA USE-IT-OR-LOSE-IT: coste marginal 0 $; vuelca ya las cargas
      algorítmicas pesadas sobre el banco.
    · P < 1 → ZONA DÉFICIT DE CUOTA: descarga todo trabajo de >100K de contexto a
      MiMo-V2.6-Pro o DeepSeek V4.1-Flash-1017 (≈ $0.13/tarea).

FORMATO DE SALIDA (parseable por MOLOCH.SH; una línea por hecho, sin adornos)
MODELO: <nombre> | PRECIO: $<in>/$<out> | CACHE: $<x> | AA: <score> | COSTE/TAREA: $<x> | VOL: <n>T tok/sem (<±delta>%) | ESTADO: <ACTIVE|PROMOTED|WATCHLIST>
RECARGO: <modelo> | UMBRAL: <n>K | PRECIO: $<in>/$<out>
INCIDENTE: <AAAA-MM-DD> | SEV <1-5> | <título> | <detalle>
BANCO: <Codex|Claude Code> | RESET: <h>h | CUOTA: <n>%
TESIS: <CONFIRMED|WEAKENED|REJECTED> · <una frase de justificación>
Omite los campos que no hayas verificado hoy en lugar de repetirlos.`;

export const SIMULATED_SIGNAL_19OCT = `FLASH UPDATE · 19-OCT-2026 21:00 UTC · VIGILANCIA ARBITRAJE LLM
MODELO: MiniMax M3.1 Flash | AA: 44.4 | COSTE/TAREA: $0.14 | VOL: 24.0T tok/sem (-38%) | ESTADO: WATCHLIST
INCIDENTE: 2026-10-19 | SEV 4 | MiniMax M3.1 Flash: primer AA v4.3.2 (44.4) y tráfico OpenRouter -38% tras cerrar el acceso gratuito | Primera puntuación independiente: 44.4 pts a $0.14/tarea. En las primeras 12 h sin el acceso gratuito de Space Bunny Alpha el volumen cae de 38.7T a 24.0T tok/sem. R3 (caída ≥ 30 %) lo pasa de PROMOTED a WATCHLIST.
TESIS: CONFIRMED · el subsidio explicaba parte del volumen, pero a $0.14/tarea sigue siendo un orden de magnitud más barato que el suelo propietario.`;
