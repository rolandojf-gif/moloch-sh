/* MOLOCH.SH · detector de cambios, común a «Hoy» y a «La carrera» / «AI 2027».

   Compara la recogida actual con la última instantánea de un día anterior (data/history/<fecha>.json) y devuelve
   cada cambio con:
     kind       nuevo, precio, pesos, evaluacion, retirada (modelos); lider, version (índice de AA);
                indicador (cifras de La carrera); valoracion (hitos de AI 2027); uso (ranking de OpenRouter)
     key        identificador estable, para no repetirlo en el registro acumulado
     published  fecha en que ocurrió según la fuente, si la da; null si la fuente no fecha el cambio
     detected   fecha en que lo detectó el recolector
     date       published o, si no hay, detected (orden cronológico)
     mag        magnitud { v, unit } cuando la hay: porcentaje, puntos, puesto…
     src        evidencia { name, url, got }
     what       frase factual, con las cifras
     data       cifras para las plantillas de las vistas
   La importancia de cada cambio (qué llega a portada) no se decide aquí: aquí sólo se mide. */

import { valoraciones } from '../js/valoracion.js';

const PRICE_CHANGE_MIN = 0.05;   // cambios de precio por debajo del 5 % no se registran
const es = (v, d = 2) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: d });
const money = n => `${n.toLocaleString('es-ES', { maximumFractionDigits: 4 })} $`;
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const delta = (a, b) => a > 0 ? (b - a) / a : (b > 0 ? 1 : 0);
const at = (o, path) => path.split('.').reduce((x, k) => x?.[k], o);

/* Indicadores de La carrera que se vigilan: clave de la instantánea diaria, indicador de la web (path, el de
   js/indicadores.js), hecho de data/indicadores.json que lo contiene (fact, si no es el mismo), cómo se lee su valor
   (get) y cómo se cuenta. «desde»: primera instantánea que lo guarda. */
const es0 = v => es(v, 0), es1 = v => es(v, 1);
const IND = [
  { k: 'eci', path: 'eci.frontier', label: 'Mejor modelo en el ECI de Epoch', unit: 'puntos ECI', n: v => es(v), u: 'puntos', ctx: f => f.model },
  { k: 'usCn', path: 'eci.gapUsCn', label: 'Distancia EE. UU. − China en el ECI', unit: 'puntos ECI', n: v => es(v), u: 'puntos', ctx: f => f.us && f.cn ? `${f.us.model} frente a ${f.cn.model}` : null },
  { k: 'closedOpen', path: 'eci.gapClosedOpen', label: 'Distancia cerrados − abiertos en el ECI', unit: 'puntos ECI', n: v => es(v), u: 'puntos', ctx: f => f.closed && f.open ? `${f.closed.model} frente a ${f.open.model}` : null },
  { k: 'labs', path: 'eci.gapLabs', label: 'Distancia entre los dos primeros laboratorios en el ECI', unit: 'puntos ECI', n: v => es(v), u: 'puntos', ctx: f => f.first && f.second ? `${f.first.org} frente a ${f.second.org}` : null },
  { k: 'dcMW', path: 'dc.now', label: 'Potencia de TI en servicio en los centros que sigue Epoch', unit: 'MW', n: es0, u: 'MW' },
  { k: 'chipsH100e', path: 'chips.cum', label: 'Chips de IA entregados, acumulado', unit: 'H100e', n: v => es(v / 1e6, 1), u: 'millones de H100e' },
  { k: 'revLeader', path: 'companies.leader', label: 'Mayores ingresos anualizados', unit: '$', n: v => es(v / 1e9, 1), u: 'mil millones de $', ctx: f => f.company },
  { k: 'metrP80h', path: 'metr.sota', label: 'Horizonte al 80 % del modelo puntero (METR)', unit: 'h', n: es1, u: 'h' },
  { k: 'rate12m', path: 'eci.rate12m', label: 'Avance de la frontera del ECI en 12 meses', unit: 'puntos ECI', n: es1, u: 'puntos', desde: '2026-10-23' },
  { k: 'dcPlan26', path: 'dc.plan', get: f => f.end2026?.mw, label: 'Potencia prevista para fin de 2026 en el calendario de Epoch', unit: 'MW', n: es0, u: 'MW', desde: '2026-10-23' },
  { k: 'tdpGW', path: 'chips.tdp', fact: 'chips.cum', get: f => f.tdpGW, label: 'Consumo nominal (TDP) de los chips entregados', unit: 'GW', n: es1, u: 'GW', desde: '2026-10-23' },
  { k: 'capexB', path: 'dc.capex', fact: 'dc.now', get: f => f.capexB, label: 'Coste de capital de los centros que sigue Epoch', unit: 'mil millones de $', n: es0, u: 'mil millones de $', desde: '2026-10-23' },
  { k: 'metrRatio', path: 'metr.ratio', fact: 'metr.sota', get: f => f.ratio, label: 'Relación entre los horizontes al 80 % y al 50 % de METR', unit: '', n: v => es(v, 2), u: '', desde: '2026-10-23' },
  { k: 'sweBest', path: 'bench.sweBest', label: 'Mejor SWE-bench Verified en las ejecuciones de Epoch', unit: '%', n: es1, u: '%', ctx: f => f.model, desde: '2026-10-23' },
  { k: 'mirror', path: 'bench.mirror', label: 'Mejor resultado en MirrorCode (ejecuciones de Epoch)', unit: '%', n: es1, u: '%', ctx: f => f.model, desde: '2026-10-23' },
  // Las mismas distancias con el índice de AA, al día. Con un cambio de versión del índice no se comparan (aa: true).
  { k: 'aaUsCn', path: 'aa.gapUsCn', aa: true, label: 'Distancia EE. UU. − China en el índice de AA', unit: 'puntos AA', n: es1, u: 'puntos', ctx: f => f.us && f.cn ? `${f.us.model} frente a ${f.cn.model}` : null, desde: '2026-10-24' },
  { k: 'aaClosedOpen', path: 'aa.gapClosedOpen', aa: true, label: 'Distancia cerrados − abiertos en el índice de AA', unit: 'puntos AA', n: es1, u: 'puntos', ctx: f => f.closed && f.open ? `${f.closed.model} frente a ${f.open.model}` : null, desde: '2026-10-24' },
  { k: 'aaLabs', path: 'aa.gapLabs', aa: true, label: 'Distancia entre los dos primeros laboratorios en el índice de AA', unit: 'puntos AA', n: es1, u: 'puntos', ctx: f => f.first && f.second ? `${f.first.org} frente a ${f.second.org}` : null, desde: '2026-10-24' },
  { k: 'aaRate12m', path: 'aa.rate12m', aa: true, label: 'Avance de la frontera del índice de AA en 12 meses', unit: 'puntos AA', n: es1, u: 'puntos', desde: '2026-10-24' },
  { k: 'saturated', path: 'bench.saturated', label: 'Evaluaciones de Epoch saturadas (mejor resultado de al menos un 90 %)', unit: 'evaluaciones', n: es0, u: 'evaluaciones', ctx: f => f.of ? `de ${f.of}` : null, desde: '2026-10-23' },
  { k: 'ediOpen', path: 'edi.open', label: 'Evaluaciones del ECI que el mejor modelo aún no resuelve a medias', unit: 'evaluaciones', n: es0, u: 'evaluaciones', ctx: f => f.of ? `de ${f.of}` : null, desde: '2026-10-25' }
];
const factOf = (ind, d) => at(ind, d.fact || d.path);
const valueOf = (ind, d) => { const f = factOf(ind, d); return f ? (d.get ? d.get(f) : f.v) ?? null : null; };
/* Valores de la instantánea diaria (clave k de cada indicador vigilado). */
export const indSnapshot = ind => Object.fromEntries(IND.map(d => [d.k, ind ? valueOf(ind, d) : null]));
/* Lista para la web: qué se vigila y desde cuándo. Una serie detenida (scripts/indicadores.mjs) deja de compararse. */
export const vigilados = ind => IND.map(d => ({ path: d.path, label: d.label, desde: d.desde || '2026-10-20', ...(factOf(ind || {}, d)?.detenida ? { detenida: factOf(ind, d).ultimo } : {}) }));
const SRC_NAME = { epoch: 'Epoch AI', metr: 'METR', aa: 'Artificial Analysis' };

/* Puesto de cada modelo por índice de AA entre los de identidad confirmada: sirve para «un modelo del top 20». */
function rankAA(models) {
  const scored = models.filter(m => m.aa?.intelligence?.v != null && m.identity === 'confirmada').sort((a, b) => b.aa.intelligence.v - a.aa.intelligence.v);
  const r = new Map(scored.map((m, i) => [m.id, i + 1]));
  r.of = scored.length;
  return r;
}

/* Instantánea de lo que el detector necesita mañana además de los modelos: valoraciones de AI 2027 y ranking de uso. */
export function snapshotExtras({ ai2027, checks, uso }) {
  return {
    a7: ai2027 ? valoraciones(ai2027, checks) : null,
    uso: uso && !uso.stale ? uso.top.map(r => r.slug) : null
  };
}

export function detectChanges(ctx) {
  const { models, base, TODAY, NOW_ISO } = ctx;
  const item = (kind, key, { published = null, mag = null, ...o }) => ({ kind, key, published, detected: TODAY, date: published || TODAY, mag, ...o });
  const rank = rankAA(models);
  const rk = id => rank.has(id) ? { rankAA: rank.get(id), of: rank.of } : {};
  const out = [];
  if (!base) return { items: out, novedades: novedades(models, ctx, rk) };

  /* ── Modelos: precio del laboratorio, pesos, primeras puntuaciones y retiradas ── */
  const prev = base.models || {};
  const baseHasAA = Object.values(prev).some(p => p.ii !== null && p.ii !== undefined);
  for (const m of models) {
    const p = prev[m.id];
    if (!p) continue;   // las altas salen de la fecha de OpenRouter (novedades), no de la comparación
    // Precio: sólo el del propio laboratorio, comparado con su precio de la recogida anterior; uno por modelo y día.
    // Con las tarifas del laboratorio de ambos días se distingue un cambio de precio de la retirada (o el alta) de una tarifa.
    if (p.pb === 'laboratorio' && m.price.basis === 'laboratorio' && p.in !== null && p.out !== null && m.price.in.v !== null && m.price.out.v !== null) {
      const ci = delta(p.in, m.price.in.v), co = delta(p.out, m.price.out.v);
      if (Math.max(Math.abs(ci), Math.abs(co)) >= PRICE_CHANGE_MIN) {
        const a = { in: p.in, out: p.out }, b = { in: m.price.in.v, out: m.price.out.v };
        const ba = (3 * a.in + a.out) / 4, bb = (3 * b.in + b.out) / 4;
        const had = ctx.prevTiers?.(m.id) || null, has = m.price.tiers || null;
        const inT = (t, x) => !!t && t.some(([i, o]) => i === x.in && o === x.out);
        const sub = ba === 0 ? 'cobra' : bb === 0 ? 'gratis' : had && has && inT(had, b) && !inT(has, a) ? 'tarifa-retirada' : had && has && inT(has, a) && !inT(had, b) ? 'tarifa-nueva' : 'precio';
        const pct = ba === 0 ? null : Math.round(delta(ba, bb) * 1000) / 10;
        const pair = x => `${money(x.in)} de entrada y ${money(x.out)} de salida`;
        const part = (k, x, y) => x === y ? `${k} sin cambio (${money(x)})` : `${k} de ${money(x)} a ${money(y)}`;
        const who = m.price.provider, verb = bb > ba ? 'sube' : bb < ba ? 'baja' : 'cambia';
        const what = {
          cobra: `${who} empieza a cobrar ${m.name} en OpenRouter: ${pair(b)} por millón de tokens. Hasta ahora era gratis.`,
          gratis: `${who} ofrece ${m.name} gratis en OpenRouter. Antes costaba ${pair(a)} por millón de tokens.`,
          'tarifa-retirada': `${who} deja de ofrecer en OpenRouter su tarifa más barata de ${m.name} (${pair(a)} por millón de tokens). La más barata que le queda, que ya existía, es de ${pair(b)}.`,
          'tarifa-nueva': `${who} añade en OpenRouter una tarifa más barata de ${m.name}: ${pair(b)} por millón de tokens. La anterior (${pair(a)}) sigue disponible.`,
          precio: `${who} ${verb} el precio de ${m.name} en OpenRouter: ${part('entrada', a.in, b.in)} y ${part('salida', a.out, b.out)} por millón de tokens.`
        }[sub];
        out.push(item('precio', `precio|${m.id}|${TODAY}`, {
          model: m.id, mag: pct === null ? null : { v: pct, unit: '%' },
          src: { name: 'OpenRouter', url: `https://openrouter.ai/${m.orVariant || m.id}/providers`, got: NOW_ISO },
          what, data: { basis: 'laboratorio', sub, provider: who, from: a, to: b, pct, tiersFrom: had, tiersTo: has, since: base.date, ...rk(m.id) }
        }));
      }
    }
    // Pesos descargables (no los anunciados: «a» en la instantánea pasa a «o» cuando aparece el repositorio).
    if (p.w !== 'o' && m.weights.v === 'abiertos' && !m.weights.announced) {
      const hf = m.weights.src === 'hf';
      out.push(item('pesos', `pesos|${m.id}`, {
        model: m.id, published: hf ? m.hfCreated?.v || null : null,
        src: { name: hf ? 'Hugging Face' : 'Epoch AI', url: m.weights.url, got: NOW_ISO },
        what: hf ? `${m.name}: pesos descargables en Hugging Face (licencia ${m.license.v || 'sin datos'}).` : `${m.name}: Epoch AI lo clasifica como modelo de pesos abiertos (${m.epoch?.access?.v || 'sin datos'}).`,
        data: { license: m.license.v, weightsSrc: m.weights.src, ...rk(m.id) }
      }));
    }
    const pb = m.epoch?.eci?.v;
    if ((p.eci === null || p.eci === undefined) && pb !== null && pb !== undefined) {
      out.push(item('evaluacion', `evaluacion|${m.id}|eci`, {
        model: m.id, mag: { v: pb, unit: 'puntos ECI' },
        src: { name: 'Epoch AI', url: 'https://epoch.ai/benchmarks/eci', got: NOW_ISO },
        what: `${m.name}: primera puntuación en el índice ECI de Epoch AI (${pb}).`, data: { field: 'eci', eci: pb, ...rk(m.id) }
      }));
    }
    // Primera puntuación de AA, sólo si la recogida anterior ya traía datos de AA (si no, todos los modelos serían «nuevos» en AA).
    const qa = m.aa?.intelligence?.v;
    if (baseHasAA && (p.ii === null || p.ii === undefined) && qa !== null && qa !== undefined) {
      out.push(item('evaluacion', `evaluacion|${m.id}|ii`, {
        model: m.id, mag: { v: qa, unit: 'puntos AA' },
        src: { name: 'Artificial Analysis', url: m.aa.url, got: NOW_ISO },
        what: `${m.name}: primera puntuación en el índice de inteligencia de Artificial Analysis (${qa}${m.aa.version ? `, v${m.aa.version}` : ''}).`, data: { field: 'ii', ii: qa, ...rk(m.id) }
      }));
    }
  }
  const now = new Set(models.map(m => m.id));
  for (const [id, p] of Object.entries(prev)) {
    if (!now.has(id) && !ctx.listed.has(id)) out.push(item('retirada', `retirada|${id}|${TODAY}`, {
      model: id, src: { name: 'OpenRouter', url: 'https://openrouter.ai/models', got: NOW_ISO },
      what: `${p.n || id} deja de figurar en el catálogo de OpenRouter.`, data: { name: p.n || null }
    }));
  }

  /* ── Líderes por índice de AA: sólo con la misma versión del índice; si cambia la versión, se registra eso ── */
  const vPrev = base.leaders?.aa?.v ?? base.aaIndexVersion ?? null, vNow = ctx.leaders?.aa?.v ?? null;
  if (vPrev && vNow && vPrev !== vNow) {
    out.push(item('version', `version|${vNow}`, {
      src: { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/leaderboards/models', got: NOW_ISO },
      what: `Artificial Analysis pasa su índice de inteligencia de la versión ${vPrev} a la ${vNow}: las puntuaciones de una y otra versión no se comparan.`,
      data: { from: vPrev, to: vNow }
    }));
  } else if (vPrev && vPrev === vNow) {
    const byId = new Map(models.map(m => [m.id, m]));
    for (const [blk, w, adj] of [['open', 'abiertos', 'abierto'], ['closed', 'cerrados', 'cerrado']]) {
      const a = base.leaders.aa[blk], b = ctx.leaders.aa[blk];
      if (!a || !b || a.id === b.id) continue;
      const nb = byId.get(b.id), na = byId.get(a.id);
      const aNow = na && na.weights.v === w && na.identity === 'confirmada' ? na.aa?.intelligence?.v ?? null : null;
      const ref = aNow ?? a.ii, margin = r1(b.ii - ref);
      const aName = prev[a.id]?.n || na?.name || a.id;
      out.push(item('lider', `lider|${blk}|${b.id}|${TODAY}`, {
        model: b.id, mag: { v: margin, unit: 'puntos AA' },
        src: { name: 'Artificial Analysis', url: nb?.aa?.url || 'https://artificialanalysis.ai/leaderboards/models', got: NOW_ISO },
        what: (aNow !== null
          ? `${nb?.name || b.id} pasa a ser el mejor modelo ${adj} del catálogo en el índice de inteligencia de Artificial Analysis v${vNow}: ${es(b.ii, 1)} puntos, ${margin >= 0 ? `${es(margin, 1)} más` : `${es(-margin, 1)} menos`} que ${aName} (${es(aNow, 1)}).`
          : `${nb?.name || b.id} pasa a ser el mejor modelo ${adj} del catálogo en el índice de inteligencia de Artificial Analysis v${vNow}, con ${es(b.ii, 1)} puntos: ${aName}, que tenía ${es(a.ii, 1)}, ya no figura como ${adj} con puntuación.`)
          + (nb?.weights?.announced ? ' Su descripción en OpenRouter lo presenta como de pesos abiertos, pero aún no se pueden descargar.' : ''),
        data: { block: w, version: vNow, from: { id: a.id, n: aName, ii: a.ii, iiNow: aNow }, to: { id: b.id, n: nb?.name || null, ii: b.ii }, margin }
      }));
    }
  }

  /* ── Indicadores de La carrera ── */
  if (base.ind && ctx.ind) for (const d of IND) {
    const f = factOf(ctx.ind, d), a = base.ind[d.k], b = valueOf(ctx.ind, d);
    if (a == null || b == null || f.stale || f.detenida || r2(a) === r2(b)) continue;
    if (d.aa && (base.aaIndexVersion ?? null) !== (f.version ?? null)) continue;
    const c = d.ctx?.(f);
    out.push(item('indicador', `indicador|${d.k}|${TODAY}`, {
      published: f.asOf && f.asOf !== (f.got || '').slice(0, 10) ? f.asOf : null,
      mag: { v: r2(b - a), pct: a ? r1((b - a) / a * 100) : null, unit: d.unit },
      src: { name: SRC_NAME[f.src] || f.src, url: f.url, got: f.got || NOW_ISO },
      what: `${d.label}: de ${d.n(a)} a ${d.n(b)}${d.u ? ` ${d.u}` : ''}${c ? ` (${c})` : ''}.`,
      data: { ind: d.k, path: d.path, from: a, to: b }
    }));
  }

  /* ── Valoraciones de AI 2027: la del observatorio y, mientras no hay valoración posible, la estimación ── */
  const vNowA7 = ctx.ai2027 ? valoraciones(ctx.ai2027, ctx.checks) : null;
  if (base.a7 && vNowA7) {
    const hitos = new Map((ctx.ai2027.lineas || []).flatMap(l => (l.hitos || []).map(h => [h.id, h])));
    for (const [id, [o, e]] of Object.entries(vNowA7)) {
      const old = base.a7[id];
      if (!old) continue;
      const h = hitos.get(id);
      const ev = (h.evidencia || []).find(x => x.indicador && at(ctx.ind, x.indicador)?.url);
      const f = ev ? at(ctx.ind, ev.indicador) : null;
      const src = f ? { name: SRC_NAME[f.src] || f.src, url: f.url, got: f.got || NOW_ISO } : { name: 'AI 2027', url: h.url, got: NOW_ISO };
      const push = (which, from, to) => out.push(item('valoracion', `valoracion|${id}|${which}|${TODAY}`, {
        src, what: `«${h.titulo}»: ${which === 'observatorio' ? 'la valoración del observatorio' : 'la estimación'} pasa de «${from ?? 'sin valoración'}» a «${to ?? 'sin estimación'}».`,
        data: { hito: id, which, from, to, plazo: h.plazo, ficha: `#ai2027/${id}` }
      }));
      if (old[0] !== o) push('observatorio', old[0], o);
      else if (old[1] !== e) push('estimacion', old[1], e);
    }
  }

  /* ── Ranking de uso de OpenRouter (7 días): nuevo primero y entradas en el top 10 ── */
  const u = ctx.uso, up = ctx.usoPrev;
  if (u && !u.stale && up?.length) {
    const name = r => r.name || r.slug;
    const src = { name: 'OpenRouter · uso', url: 'https://openrouter.ai/rankings', got: u.got || NOW_ISO };
    const published = u.asOf && u.asOf !== (u.got || '').slice(0, 10) ? u.asOf : null;
    const first = u.top[0];
    if (first && first.slug !== up[0]) {
      const before = u.top.find(r => r.slug === up[0]);
      out.push(item('uso', `uso|primero|${first.slug}|${TODAY}`, {
        model: first.id || undefined, published, mag: { v: 1, unit: 'puesto' }, src,
        what: `${name(first)} pasa a ser el modelo más usado en OpenRouter en los últimos ${u.days} días (${es(first.share, 1)} % de los tokens), por delante de ${before ? name(before) : up[0]}.`,
        data: { sub: 'primero', slug: first.slug, rank: 1, prevRank: up.indexOf(first.slug) + 1 || null, share: first.share, tokens: first.tokens, prev: up[0], window: u.days }
      }));
    }
    for (const r of u.top) {
      if (r.rank === 1 || up.includes(r.slug)) continue;
      out.push(item('uso', `uso|entra|${r.slug}|${TODAY}`, {
        model: r.id || undefined, published, mag: { v: r.rank, unit: 'puesto' }, src,
        what: `${name(r)} entra en los diez modelos más usados en OpenRouter en los últimos ${u.days} días: puesto ${r.rank}, ${es(r.share, 1)} % de los tokens.`,
        data: { sub: 'entra', slug: r.slug, rank: r.rank, share: r.share, tokens: r.tokens, window: u.days }
      }));
    }
  }
  return { items: out, novedades: novedades(models, ctx, rk) };
}

/* Modelos dados de alta en OpenRouter en la ventana de «Hoy»: publicados el día del alta, detectados en la primera recogida que los vio. */
function novedades(models, ctx, rk) {
  return models.filter(m => m.orCreated.v && m.orCreated.v >= ctx.hoyFrom).map(m => ({
    kind: 'nuevo', key: `nuevo|${m.id}`, model: m.id,
    published: m.orCreated.v, detected: ctx.firstSeen?.get(m.id) || ctx.TODAY, date: m.orCreated.v, mag: null,
    src: { name: 'OpenRouter', url: `https://openrouter.ai/${m.orVariant || m.id}`, got: ctx.NOW_ISO },
    what: `${m.name} (${m.lab.name}) aparece en el catálogo de OpenRouter${m.orVariant ? `, de momento sólo como variante ${m.orVariant.slice(m.orVariant.lastIndexOf(':'))}` : ''}.`,
    data: { weights: m.weights.v, in: m.price.in.v, out: m.price.out.v, ii: m.aa?.intelligence?.v ?? null, eci: m.epoch?.eci?.v ?? null, identity: m.identity, ...rk(m.id) }
  }));
}

/* Clave y fechas de los acontecimientos registrados antes de que existiera este módulo. */
function migrate(e) {
  if (e.key) return e;
  const detected = (e.src?.got || '').slice(0, 10) || e.date;
  const key = e.kind === 'pesos' ? `pesos|${e.model}` : e.kind === 'evaluacion' ? `evaluacion|${e.model}|${e.data?.field || ''}` : `${e.kind}|${e.model}|${e.date}`;
  return { ...e, key, published: e.kind === 'pesos' && e.date !== detected ? e.date : null, detected, mag: e.kind === 'precio' && e.data?.pct != null ? { v: e.data.pct, unit: '%' } : null };
}

/* Registro acumulado: lo detectado hoy se recalcula entero en cada recogida del día (siempre contra la misma base),
   así que sustituye a lo registrado antes hoy; lo de días anteriores no se toca. */
export function mergeLog(events, items, TODAY) {
  const kept = events.map(migrate).filter(e => e.detected !== TODAY);
  const known = new Set(kept.map(e => e.key));
  for (const e of items) if (!known.has(e.key)) { kept.push(e); known.add(e.key); }
  return kept.sort((a, b) => b.date.localeCompare(a.date) || b.detected.localeCompare(a.detected));
}
