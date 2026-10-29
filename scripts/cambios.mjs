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
import { F, both } from './textos.mjs';

const PRICE_CHANGE_MIN = 0.05;   // cambios de precio por debajo del 5 % no se registran
const es = (v, d = 2) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: d });
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const delta = (a, b) => a > 0 ? (b - a) / a : (b > 0 ? 1 : 0);
const at = (o, path) => path.split('.').reduce((x, k) => x?.[k], o);

/* Indicadores de La carrera que se vigilan: clave de la instantánea diaria, indicador de la web (path, el de
   js/indicadores.js), hecho de data/indicadores.json que lo contiene (fact, si no es el mismo), cómo se lee su valor
   (get) y cómo se cuenta. «desde»: primera instantánea que lo guarda. */
const vs = (A, B, F) => `${A} ${F.t('frente a', 'versus')} ${B}`;
const de = (f, F) => f.of ? `${F.t('de', 'of')} ${f.of}` : null;
const IND = [
  { k: 'eci', path: 'eci.frontier', label: 'Mejor modelo en el ECI de Epoch', unit: 'puntos ECI', n: (v, F) => F.n(v), u: 'puntos', ctx: f => f.model,
    en: { label: 'Best model on Epoch’s ECI', u: 'points' } },
  { k: 'usCn', path: 'eci.gapUsCn', label: 'Distancia EE. UU. − China en el ECI', unit: 'puntos ECI', n: (v, F) => F.n(v), u: 'puntos', ctx: (f, F) => f.us && f.cn ? vs(f.us.model, f.cn.model, F) : null,
    en: { label: 'US − China gap on the ECI', u: 'points' } },
  { k: 'closedOpen', path: 'eci.gapClosedOpen', label: 'Distancia cerrados − abiertos en el ECI', unit: 'puntos ECI', n: (v, F) => F.n(v), u: 'puntos', ctx: (f, F) => f.closed && f.open ? vs(f.closed.model, f.open.model, F) : null,
    en: { label: 'Closed − open gap on the ECI', u: 'points' } },
  { k: 'labs', path: 'eci.gapLabs', label: 'Distancia entre los dos primeros laboratorios en el ECI', unit: 'puntos ECI', n: (v, F) => F.n(v), u: 'puntos', ctx: (f, F) => f.first && f.second ? vs(f.first.org, f.second.org, F) : null,
    en: { label: 'Gap between the top two labs on the ECI', u: 'points' } },
  { k: 'dcMW', path: 'dc.now', label: 'Potencia de TI en servicio en los centros que sigue Epoch', unit: 'MW', n: (v, F) => F.n(v, 0), u: 'MW',
    en: { label: 'IT power in service at the data centres Epoch tracks', u: 'MW' } },
  { k: 'chipsH100e', path: 'chips.cum', label: 'Chips de IA entregados, acumulado', unit: 'H100e', n: (v, F) => F.n(v / 1e6, 1), u: 'millones de H100e',
    en: { label: 'AI chips delivered, cumulative', u: 'million H100e' } },
  { k: 'revLeader', path: 'companies.leader', label: 'Mayores ingresos anualizados', unit: '$', n: (v, F) => F.n(v / 1e9, 1), u: 'mil millones de $', ctx: f => f.company,
    en: { label: 'Highest annualised revenue', u: 'billion dollars' } },
  { k: 'metrP80h', path: 'metr.sota', label: 'Horizonte al 80 % del modelo puntero (METR)', unit: 'h', n: (v, F) => F.n(v, 1), u: 'h',
    en: { label: 'METR 80% horizon of the leading model', u: 'h' } },
  { k: 'rate12m', path: 'eci.rate12m', label: 'Avance de la frontera del ECI en 12 meses', unit: 'puntos ECI', n: (v, F) => F.n(v, 1), u: 'puntos', desde: '2026-10-23',
    en: { label: 'Frontier gain on the ECI over 12 months', u: 'points' } },
  { k: 'dcPlan26', path: 'dc.plan', get: f => f.end2026?.mw, label: 'Potencia prevista para fin de 2026 en el calendario de Epoch', unit: 'MW', n: (v, F) => F.n(v, 0), u: 'MW', desde: '2026-10-23',
    en: { label: 'Power planned for the end of 2026 in Epoch’s schedule', u: 'MW' } },
  { k: 'tdpGW', path: 'chips.tdp', fact: 'chips.cum', get: f => f.tdpGW, label: 'Consumo nominal (TDP) de los chips entregados', unit: 'GW', n: (v, F) => F.n(v, 1), u: 'GW', desde: '2026-10-23',
    en: { label: 'Nominal consumption (TDP) of the chips delivered', u: 'GW' } },
  { k: 'capexB', path: 'dc.capex', fact: 'dc.now', get: f => f.capexB, label: 'Coste de capital de los centros que sigue Epoch', unit: 'mil millones de $', n: (v, F) => F.n(v, 0), u: 'mil millones de $', desde: '2026-10-23',
    en: { label: 'Capital cost of the data centres Epoch tracks', u: 'billion dollars' } },
  { k: 'metrRatio', path: 'metr.ratio', fact: 'metr.sota', get: f => f.ratio, label: 'Relación entre los horizontes al 80 % y al 50 % de METR', unit: '', n: (v, F) => F.n(v, 2), u: '', desde: '2026-10-23',
    en: { label: 'Ratio between METR’s 80% and 50% horizons', u: '' } },
  { k: 'sweBest', path: 'bench.sweBest', label: 'Mejor SWE-bench Verified en las ejecuciones de Epoch', unit: '%', n: (v, F) => F.n(v, 1), u: '%', ctx: f => f.model, desde: '2026-10-23',
    en: { label: 'Best SWE-bench Verified in Epoch’s runs', u: '%' } },
  { k: 'mirror', path: 'bench.mirror', label: 'Mejor resultado en MirrorCode (ejecuciones de Epoch)', unit: '%', n: (v, F) => F.n(v, 1), u: '%', ctx: f => f.model, desde: '2026-10-23',
    en: { label: 'Best MirrorCode result (Epoch runs)', u: '%' } },
  // Las mismas distancias con el índice de AA, al día. Con un cambio de versión del índice no se comparan (aa: true).
  { k: 'aaUsCn', path: 'aa.gapUsCn', aa: true, label: 'Distancia EE. UU. − China en el índice de AA', unit: 'puntos AA', n: (v, F) => F.n(v, 1), u: 'puntos', ctx: (f, F) => f.us && f.cn ? vs(f.us.model, f.cn.model, F) : null, desde: '2026-10-24',
    en: { label: 'US − China gap on the AA index', u: 'points' } },
  { k: 'aaClosedOpen', path: 'aa.gapClosedOpen', aa: true, label: 'Distancia cerrados − abiertos en el índice de AA', unit: 'puntos AA', n: (v, F) => F.n(v, 1), u: 'puntos', ctx: (f, F) => f.closed && f.open ? vs(f.closed.model, f.open.model, F) : null, desde: '2026-10-24',
    en: { label: 'Closed − open gap on the AA index', u: 'points' } },
  { k: 'aaLabs', path: 'aa.gapLabs', aa: true, label: 'Distancia entre los dos primeros laboratorios en el índice de AA', unit: 'puntos AA', n: (v, F) => F.n(v, 1), u: 'puntos', ctx: (f, F) => f.first && f.second ? vs(f.first.org, f.second.org, F) : null, desde: '2026-10-24',
    en: { label: 'Gap between the top two labs on the AA index', u: 'points' } },
  { k: 'aaRate12m', path: 'aa.rate12m', aa: true, label: 'Avance de la frontera del índice de AA en 12 meses', unit: 'puntos AA', n: (v, F) => F.n(v, 1), u: 'puntos', desde: '2026-10-24',
    en: { label: 'Frontier gain on the AA index over 12 months', u: 'points' } },
  { k: 'saturated', path: 'bench.saturated', label: 'Evaluaciones de Epoch saturadas (mejor resultado de al menos un 90 %)', unit: 'evaluaciones', n: (v, F) => F.n(v, 0), u: 'evaluaciones', ctx: de, desde: '2026-10-23',
    en: { label: 'Epoch evaluations saturated (best result of at least 90%)', u: 'evaluations' } },
  { k: 'ediOpen', path: 'edi.open', label: 'Evaluaciones del ECI que el mejor modelo aún no resuelve a medias', unit: 'evaluaciones', n: (v, F) => F.n(v, 0), u: 'evaluaciones', ctx: de, desde: '2026-10-25',
    en: { label: 'ECI evaluations the best model does not yet half-solve', u: 'evaluations' } }
];
const factOf = (ind, d) => at(ind, d.fact || d.path);
const valueOf = (ind, d) => { const f = factOf(ind, d); return f ? (d.get ? d.get(f) : f.v) ?? null : null; };
/* Valores de la instantánea diaria (clave k de cada indicador vigilado).
   Un indicador con cobertura incompleta (incompleto) se guarda vacío: el día que se complete no cuenta como cambio. */
export const indSnapshot = ind => Object.fromEntries(IND.map(d => [d.k, ind && !factOf(ind, d)?.incompleto ? valueOf(ind, d) : null]));
/* Lista para la web: qué se vigila y desde cuándo. Una serie detenida (scripts/indicadores.mjs) o con cobertura incompleta
   deja de compararse. */
export const vigilados = ind => IND.map(d => ({ path: d.path, label: d.label, desde: d.desde || '2026-10-20', ...(factOf(ind || {}, d)?.detenida ? { detenida: factOf(ind, d).ultimo } : {}), ...(factOf(ind || {}, d)?.incompleto ? { incompleto: true } : {}), i18n: { en: { label: d.en.label } } }));
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
  // `what` llega como { es, en }: el español queda en el campo y el inglés en i18n.en.what.
  const item = (kind, key, { published = null, mag = null, ...o }) => {
    const e = { kind, key, published, detected: TODAY, date: published || TODAY, mag }, en = {};
    for (const [k, v] of Object.entries(o)) { if (k === 'what') { e.what = v.es; en.what = v.en; } else e[k] = v; }
    e.i18n = { en };
    return e;
  };
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
        const who = m.price.provider;
        const what = both(F => {
          const money = F.money;
          const pair = x => F.t(`${money(x.in)} de entrada y ${money(x.out)} de salida`, `${money(x.in)} input and ${money(x.out)} output`);
          const part = (kEs, kEn, x, y) => x === y ? F.t(`${kEs} sin cambio (${money(x)})`, `${kEn} unchanged (${money(x)})`) : F.t(`${kEs} de ${money(x)} a ${money(y)}`, `${kEn} from ${money(x)} to ${money(y)}`);
          const verb = bb > ba ? F.t('sube', 'raises') : bb < ba ? F.t('baja', 'cuts') : F.t('cambia', 'changes');
          return {
            cobra: F.t(`${who} empieza a cobrar ${m.name} en OpenRouter: ${pair(b)} por millón de tokens. Hasta ahora era gratis.`, `${who} starts charging for ${m.name} on OpenRouter: ${pair(b)} per million tokens. Until now it was free.`),
            gratis: F.t(`${who} ofrece ${m.name} gratis en OpenRouter. Antes costaba ${pair(a)} por millón de tokens.`, `${who} now offers ${m.name} for free on OpenRouter. It used to cost ${pair(a)} per million tokens.`),
            'tarifa-retirada': F.t(`${who} deja de ofrecer en OpenRouter su tarifa más barata de ${m.name} (${pair(a)} por millón de tokens). La más barata que le queda, que ya existía, es de ${pair(b)}.`, `${who} stops offering its cheapest ${m.name} rate on OpenRouter (${pair(a)} per million tokens). The cheapest it has left, which already existed, is ${pair(b)}.`),
            'tarifa-nueva': F.t(`${who} añade en OpenRouter una tarifa más barata de ${m.name}: ${pair(b)} por millón de tokens. La anterior (${pair(a)}) sigue disponible.`, `${who} adds a cheaper ${m.name} rate on OpenRouter: ${pair(b)} per million tokens. The previous one (${pair(a)}) is still available.`),
            precio: F.t(`${who} ${verb} el precio de ${m.name} en OpenRouter: ${part('entrada', 'input', a.in, b.in)} y ${part('salida', 'output', a.out, b.out)} por millón de tokens.`, `${who} ${verb} the price of ${m.name} on OpenRouter: ${part('entrada', 'input', a.in, b.in)} and ${part('salida', 'output', a.out, b.out)} per million tokens.`)
          }[sub];
        });
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
        what: both(F => hf
          ? F.t(`${m.name}: pesos descargables en Hugging Face (licencia ${m.license.v || 'sin datos'}).`, `${m.name}: downloadable weights on Hugging Face (licence ${m.license.v || 'no data'}).`)
          : F.t(`${m.name}: Epoch AI lo clasifica como modelo de pesos abiertos (${m.epoch?.access?.v || 'sin datos'}).`, `${m.name}: Epoch AI classifies it as an open-weight model (${m.epoch?.access?.v || 'no data'}).`)),
        data: { license: m.license.v, weightsSrc: m.weights.src, ...rk(m.id) }
      }));
    }
    const pb = m.epoch?.eci?.v;
    if ((p.eci === null || p.eci === undefined) && pb !== null && pb !== undefined) {
      out.push(item('evaluacion', `evaluacion|${m.id}|eci`, {
        model: m.id, mag: { v: pb, unit: 'puntos ECI' },
        src: { name: 'Epoch AI', url: 'https://epoch.ai/benchmarks/eci', got: NOW_ISO },
        what: both(F => F.t(`${m.name}: primera puntuación en el índice ECI de Epoch AI (${pb}).`, `${m.name}: first score on Epoch AI’s ECI (${pb}).`)), data: { field: 'eci', eci: pb, ...rk(m.id) }
      }));
    }
    // Primera puntuación de AA, sólo si la recogida anterior ya traía datos de AA (si no, todos los modelos serían «nuevos» en AA).
    const qa = m.aa?.intelligence?.v;
    if (baseHasAA && (p.ii === null || p.ii === undefined) && qa !== null && qa !== undefined) {
      out.push(item('evaluacion', `evaluacion|${m.id}|ii`, {
        model: m.id, mag: { v: qa, unit: 'puntos AA' },
        src: { name: 'Artificial Analysis', url: m.aa.url, got: NOW_ISO },
        what: both(F => F.t(`${m.name}: primera puntuación en el índice de inteligencia de Artificial Analysis (${qa}${m.aa.version ? `, v${m.aa.version}` : ''}).`, `${m.name}: first score on the Artificial Analysis Intelligence Index (${qa}${m.aa.version ? `, v${m.aa.version}` : ''}).`)), data: { field: 'ii', ii: qa, ...rk(m.id) }
      }));
    }
  }
  const now = new Set(models.map(m => m.id));
  for (const [id, p] of Object.entries(prev)) {
    // Un modelo que sólo constaba por AA (sin API pública) no se retira de OpenRouter: o ha llegado con otro id o AA lo ha quitado.
    if (!now.has(id) && !ctx.listed.has(id) && !p.ao) out.push(item('retirada', `retirada|${id}|${TODAY}`, {
      model: id, src: { name: 'OpenRouter', url: 'https://openrouter.ai/models', got: NOW_ISO },
      what: both(F => F.t(`${p.n || id} deja de figurar en el catálogo de OpenRouter.`, `${p.n || id} is no longer listed in the OpenRouter catalogue.`)), data: { name: p.n || null }
    }));
  }

  /* ── Líderes por índice de AA: sólo con la misma versión del índice; si cambia la versión, se registra eso ── */
  const vPrev = base.leaders?.aa?.v ?? base.aaIndexVersion ?? null, vNow = ctx.leaders?.aa?.v ?? null;
  if (vPrev && vNow && vPrev !== vNow) {
    out.push(item('version', `version|${vNow}`, {
      src: { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/leaderboards/models', got: NOW_ISO },
      what: both(F => F.t(`Artificial Analysis pasa su índice de inteligencia de la versión ${vPrev} a la ${vNow}: las puntuaciones de una y otra versión no se comparan.`, `Artificial Analysis moves its Intelligence Index from version ${vPrev} to ${vNow}: scores from the two versions are not comparable.`)),
      data: { from: vPrev, to: vNow }
    }));
  } else if (vPrev && vPrev === vNow) {
    const byId = new Map(models.map(m => [m.id, m]));
    for (const [blk, w, adj, adjEn] of [['open', 'abiertos', 'abierto', 'open-weight'], ['closed', 'cerrados', 'cerrado', 'closed']]) {
      const a = base.leaders.aa[blk], b = ctx.leaders.aa[blk];
      if (!a || !b || a.id === b.id) continue;
      const nb = byId.get(b.id), na = byId.get(a.id);
      const aNow = na && na.weights.v === w && na.identity === 'confirmada' ? na.aa?.intelligence?.v ?? null : null;
      const ref = aNow ?? a.ii, margin = r1(b.ii - ref);
      const aName = prev[a.id]?.n || na?.name || a.id;
      out.push(item('lider', `lider|${blk}|${b.id}|${TODAY}`, {
        model: b.id, mag: { v: margin, unit: 'puntos AA' },
        src: { name: 'Artificial Analysis', url: nb?.aa?.url || 'https://artificialanalysis.ai/leaderboards/models', got: NOW_ISO },
        what: both(F => F.t(
          (aNow !== null
            ? `${nb?.name || b.id} pasa a ser el mejor modelo ${adj} del catálogo en el índice de inteligencia de Artificial Analysis v${vNow}: ${es(b.ii, 1)} puntos, ${margin >= 0 ? `${es(margin, 1)} más` : `${es(-margin, 1)} menos`} que ${aName} (${es(aNow, 1)}).`
            : `${nb?.name || b.id} pasa a ser el mejor modelo ${adj} del catálogo en el índice de inteligencia de Artificial Analysis v${vNow}, con ${es(b.ii, 1)} puntos: ${aName}, que tenía ${es(a.ii, 1)}, ya no figura como ${adj} con puntuación.`)
            + (nb?.weights?.announced ? ' Su descripción en OpenRouter lo presenta como de pesos abiertos, pero aún no se pueden descargar.' : '')
            + (nb?.aaOnly ? ' Aún no tiene API pública: no está en OpenRouter.' : ''),
          (aNow !== null
            ? `${nb?.name || b.id} becomes the best ${adjEn} model in the catalogue on the Artificial Analysis Intelligence Index v${vNow}: ${F.n(b.ii, 1)} points, ${margin >= 0 ? `${F.n(margin, 1)} more` : `${F.n(-margin, 1)} fewer`} than ${aName} (${F.n(aNow, 1)}).`
            : `${nb?.name || b.id} becomes the best ${adjEn} model in the catalogue on the Artificial Analysis Intelligence Index v${vNow}, with ${F.n(b.ii, 1)} points: ${aName}, which had ${F.n(a.ii, 1)}, is no longer listed as a scored ${adjEn} model.`)
            + (nb?.weights?.announced ? ' Its OpenRouter description presents it as open-weight, but it cannot be downloaded yet.' : '')
            + (nb?.aaOnly ? ' It has no public API yet: it is not on OpenRouter.' : ''))),
        data: { block: w, version: vNow, from: { id: a.id, n: aName, ii: a.ii, iiNow: aNow }, to: { id: b.id, n: nb?.name || null, ii: b.ii }, margin }
      }));
    }
  }

  /* ── Indicadores de La carrera ── */
  if (base.ind && ctx.ind) for (const d of IND) {
    const f = factOf(ctx.ind, d), a = base.ind[d.k], b = valueOf(ctx.ind, d);
    if (a == null || b == null || f.stale || f.detenida || f.incompleto || r2(a) === r2(b)) continue;
    if (d.aa && (base.aaIndexVersion ?? null) !== (f.version ?? null)) continue;
    out.push(item('indicador', `indicador|${d.k}|${TODAY}`, {
      published: f.asOf && f.asOf !== (f.got || '').slice(0, 10) ? f.asOf : null,
      mag: { v: r2(b - a), pct: a ? r1((b - a) / a * 100) : null, unit: d.unit },
      src: { name: SRC_NAME[f.src] || f.src, url: f.url, got: f.got || NOW_ISO },
      what: both(F => {
        const u = F.t(d.u, d.en.u), cx = d.ctx?.(f, F);
        return F.t(`${d.label}: de ${d.n(a, F)} a ${d.n(b, F)}${u ? ` ${u}` : ''}${cx ? ` (${cx})` : ''}.`,
          `${d.en.label}: from ${d.n(a, F)} to ${d.n(b, F)}${u ? (u === '%' ? u : ` ${u}`) : ''}${cx ? ` (${cx})` : ''}.`);
      }),
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
        src, what: both(F => F.t(`«${h.titulo}»: ${which === 'observatorio' ? 'la valoración del observatorio' : 'la estimación'} pasa de «${from ?? 'sin valoración'}» a «${to ?? 'sin estimación'}».`,
          `“${F.tm(h.titulo)}”: ${which === 'observatorio' ? 'the observatory’s assessment' : 'the estimate'} goes from “${from ? F.tm(from) : 'no assessment'}” to “${to ? F.tm(to) : 'no estimate'}”.`)),
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
        what: both(F => F.t(`${name(first)} pasa a ser el modelo más usado en OpenRouter en los últimos ${u.days} días (${es(first.share, 1)} % de los tokens), por delante de ${before ? name(before) : up[0]}.`,
          `${name(first)} becomes the most used model on OpenRouter over the last ${u.days} days (${F.n(first.share, 1)}% of tokens), ahead of ${before ? name(before) : up[0]}.`)),
        data: { sub: 'primero', slug: first.slug, rank: 1, prevRank: up.indexOf(first.slug) + 1 || null, share: first.share, tokens: first.tokens, prev: up[0], window: u.days }
      }));
    }
    for (const r of u.top) {
      if (r.rank === 1 || up.includes(r.slug)) continue;
      out.push(item('uso', `uso|entra|${r.slug}|${TODAY}`, {
        model: r.id || undefined, published, mag: { v: r.rank, unit: 'puesto' }, src,
        what: both(F => F.t(`${name(r)} entra en los diez modelos más usados en OpenRouter en los últimos ${u.days} días: puesto ${r.rank}, ${es(r.share, 1)} % de los tokens.`,
          `${name(r)} enters the ten most used models on OpenRouter over the last ${u.days} days: rank ${r.rank}, ${F.n(r.share, 1)}% of tokens.`)),
        data: { sub: 'entra', slug: r.slug, rank: r.rank, share: r.share, tokens: r.tokens, window: u.days }
      }));
    }
  }
  return { items: out, novedades: novedades(models, ctx, rk) };
}

/* Modelos dados de alta en OpenRouter en la ventana de «Hoy»: publicados el día del alta, detectados en la primera recogida que los vio.
   Si ya constaban puntuados por AA sin API pública (preApi), el alta es su llegada a una API pública (sub «llega-api»).
   Los que AA puntúa sin que estén en OpenRouter (aaOnly) entran por la fecha del modelo según AA (sub «sin-api»). */
export function novedades(models, ctx, rk) {
  const or = models.filter(m => !m.aaOnly && m.orCreated.v && m.orCreated.v >= ctx.hoyFrom).map(m => {
    const v = m.orVariant ? m.orVariant.slice(m.orVariant.lastIndexOf(':')) : null;
    const what = both(F => m.preApi
      ? F.t(`${m.name} (${m.lab.name}) llega a OpenRouter${v ? `, de momento sólo como variante ${v}` : ''}: ya tiene API pública. Hasta ahora sólo constaba su puntuación en Artificial Analysis.`,
        `${m.name} (${m.lab.name}) arrives on OpenRouter${v ? `, for now only as the ${v} variant` : ''}: it now has a public API. Until now only its Artificial Analysis score was known.`)
      : F.t(`${m.name} (${m.lab.name}) aparece en el catálogo de OpenRouter${v ? `, de momento sólo como variante ${v}` : ''}.`,
        `${m.name} (${m.lab.name}) appears in the OpenRouter catalogue${v ? `, for now only as the ${v} variant` : ''}.`));
    return {
      kind: 'nuevo', key: `nuevo|${m.id}`, model: m.id,
      published: m.orCreated.v, detected: ctx.firstSeen?.get(m.id) || ctx.TODAY, date: m.orCreated.v, mag: null,
      src: { name: 'OpenRouter', url: `https://openrouter.ai/${m.orVariant || m.id}`, got: ctx.NOW_ISO },
      what: what.es,
      data: { ...(m.preApi ? { sub: 'llega-api', sinApiDesde: m.preApi.since } : {}), weights: m.weights.v, in: m.price.in.v, out: m.price.out.v, ii: m.aa?.intelligence?.v ?? null, eci: m.epoch?.eci?.v ?? null, identity: m.identity, ...rk(m.id) },
      i18n: { en: { what: what.en } }
    };
  });
  const aaDate = m => m.aa?.release?.v || m.aaOnly.since;
  const aa = models.filter(m => m.aaOnly && aaDate(m) >= ctx.hoyFrom).map(m => {
    const s = m.aa.intelligence.v;
    const what = both(F => F.t(`${m.name} (${m.lab.name}) aparece puntuado en Artificial Analysis con ${es(s, 1)} puntos, aún sin API pública: no está en OpenRouter.`,
      `${m.name} (${m.lab.name}) appears scored on Artificial Analysis with ${F.n(s, 1)} points, still without a public API: it is not on OpenRouter.`));
    return {
      kind: 'nuevo', key: `sinapi|${m.id}`, model: m.id,
      published: m.aa.release?.v || null, detected: ctx.firstSeen?.get(m.id) || ctx.TODAY, date: aaDate(m), mag: null,
      src: { name: 'Artificial Analysis', url: m.aa.url, got: ctx.NOW_ISO },
      what: what.es,
      data: { sub: 'sin-api', weights: m.weights.v, in: null, out: null, ii: s, eci: m.epoch?.eci?.v ?? null, identity: m.identity, ...rk(m.id) },
      i18n: { en: { what: what.en } }
    };
  });
  return or.concat(aa);
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
/* Vaivén de precios: algunos laboratorios cobran en OpenRouter un precio u otro según la hora (DeepSeek alterna 0,15/0,6 $ y
   0,3/1,2 $ varias veces al día), y una recogida a otra hora lo leía como subida o bajada. Un cambio de precio no cuenta si
   el precio nuevo ya se vio en ese modelo en los PRICE_BACK_DAYS días anteriores, o si el anterior vuelve en los siguientes.
   labPrices reúne, de las instantáneas diarias, el precio del laboratorio y sus tarifas: id → [{ d, pairs }]. */
export const PRICE_BACK_DAYS = 14;
const pk = (i, o) => `${Math.round(i * 1e6)}|${Math.round(o * 1e6)}`;
export function labPrices(snaps) {
  const seen = new Map();
  for (const h of snaps) for (const [id, x] of Object.entries(h?.models || {})) {
    if (x.pb !== 'laboratorio') continue;
    const pairs = new Set((x.lp || []).map(([i, o]) => pk(i, o)));
    if (x.in != null && x.out != null) pairs.add(pk(x.in, x.out));
    if (!seen.has(id)) seen.set(id, []);
    seen.get(id).push({ d: h.date, pairs });
  }
  return seen;
}
export function vaiven(e, seen) {
  if (e.kind !== 'precio' || !e.data?.from || !e.data?.to) return false;
  const D = e.detected, ms = PRICE_BACK_DAYS * 86400e3;
  const from = new Date(Date.parse(D) - ms).toISOString().slice(0, 10), to = new Date(Date.parse(D) + ms).toISOString().slice(0, 10);
  const a = pk(e.data.from.in, e.data.from.out), b = pk(e.data.to.in, e.data.to.out);
  return (seen.get(e.model) || []).some(s => (s.d >= from && s.d < D && s.pairs.has(b)) || (s.d > D && s.d <= to && s.pairs.has(a)));
}

export function mergeLog(events, items, TODAY) {
  const kept = events.map(migrate).filter(e => e.detected !== TODAY);
  const known = new Set(kept.map(e => e.key));
  for (const e of items) if (!known.has(e.key)) { kept.push(e); known.add(e.key); }
  return kept.sort((a, b) => b.date.localeCompare(a.date) || b.detected.localeCompare(a.detected));
}
