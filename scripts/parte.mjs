/* MOLOCH.SH · parte diario de «Hoy».

   Sobre los cambios que mide scripts/cambios.mjs decide, con una regla fija que la web publica, cuáles son
   noticia (importancia), y redacta para cada uno un titular y una consecuencia con plantillas: cada palabra
   sale de una cifra («duplica» sólo con el doble exacto), sin modelo de lenguaje ni opinión.
   El parte son hasta tres noticias de la última recogida; si no hay ninguna, se dice. También genera la
   fuente RSS (data/parte.xml) con las noticias de los últimos días. */

import { valOf, estimateCore } from '../js/valoracion.js';
import { F as globalF } from './textos.mjs';

export const SITE = 'https://moloch-sh.netlify.app/';
const LIDER_MIN = 1;     // puntos del índice de AA: un relevo por menos no es noticia
const TOP = 20;          // «top 20» del índice de AA
const SUBE = 50, BAJA = -33;   // % del precio combinado del propio laboratorio
const DIST = 1;          // puntos ECI: por debajo, Epoch habla de la misma capacidad
const CIFRA = 10;        // % de cambio en potencia, chips o ingresos
const PARECIDO = 2;      // ± puntos de AA para «índice parecido» (convención del observatorio)
const RSS_DIAS = 30;

/* La regla, en el orden en que se priorizan las noticias. La web la muestra tal cual. */
const reglas = F => [
  F.t(`Cambia el mejor modelo abierto o cerrado del índice de Artificial Analysis, con la misma versión del índice y al menos ${LIDER_MIN} punto de margen.`,
    `The best open-weight or closed model on the Artificial Analysis index changes, with the same index version and a margin of at least ${LIDER_MIN} point.`),
  F.t('Artificial Analysis cambia la versión de su índice.', 'Artificial Analysis changes the version of its index.'),
  F.t('Cambia la valoración del observatorio de un hito de AI 2027.', 'The observatory’s assessment of an AI 2027 milestone changes.'),
  F.t(`Un modelo nuevo, o uno que recibe su primera puntuación de AA, entra en el top ${TOP} del índice de AA.`,
    `A new model, or one that receives its first AA score, enters the top ${TOP} of the AA index.`),
  F.t(`Publica pesos abiertos un modelo del top ${TOP} del índice de AA.`, `A top-${TOP} model on the AA index publishes open weights.`),
  F.t(`El propio laboratorio cambia su precio en OpenRouter al menos un +${SUBE} % o un ${String(BAJA).replace('-', '−')} % (precio combinado), lo deja gratis o empieza a cobrarlo. No cuenta que retire o añada una tarifa.`,
    `The lab itself changes its price on OpenRouter by at least +${SUBE}% or ${String(BAJA).replace('-', '−')}% (blended price), makes it free or starts charging for it. Withdrawing or adding a rate does not count.`),
  F.t(`La carrera: nuevo mejor modelo según el ECI de Epoch, nuevo punto de METR, nuevo récord en MirrorCode, una distancia que cambia al menos ${DIST} punto ECI, o potencia, chips o ingresos que cambian al menos un ${CIFRA} %.`,
    `The AI Race: a new best model on Epoch’s ECI, a new METR data point, a new MirrorCode record, a gap that changes by at least ${DIST} ECI point, or power, chips or revenue that change by at least ${CIFRA}%.`),
  F.t('Cambia el modelo más usado en OpenRouter en los últimos 7 días.', 'The most used model on OpenRouter over the last 7 days changes.')
];
export const REGLAS = reglas(globalF.es), REGLAS_EN = reglas(globalF.en);

const es = (v, d = 2) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: d });
const at = (o, path) => path.split('.').reduce((x, k) => x?.[k], o);
const ii = m => m?.aa?.intelligence?.v ?? null;
const blend = p => p && p.in != null && p.out != null ? (3 * p.in + p.out) / 4 : null;
const blendM = m => blend({ in: m.price.in.v, out: m.price.out.v });
const PLAIN = { adelantado: 'va por delante del escenario', compatible: 'se cumple como preveía', retrasado: 'va por detrás del escenario', 'todavía no evaluable': 'aún no se puede evaluar', 'sin evidencia suficiente': 'se queda sin datos públicos para comprobarlo' };
const PLAIN_EN = { adelantado: 'is ahead of the scenario', compatible: 'is met as it foresaw', retrasado: 'is behind the scenario', 'todavía no evaluable': 'cannot be assessed yet', 'sin evidencia suficiente': 'is left without public data to check it' };
const GAP = { usCn: 'EE. UU. − China', closedOpen: 'cerrados − abiertos', labs: 'entre los dos primeros laboratorios' };
const GAP_EN = { usCn: 'US − China gap', closedOpen: 'closed − open gap', labs: 'gap between the top two labs' };
const CIFRAS = new Set(['dcMW', 'chipsH100e', 'revLeader']);   // potencia, chips e ingresos; el resto de indicadores vigilados sólo va a su frente
const adj = (F, block) => block === 'abiertos' ? F.t('abierto', 'open-weight') : F.t('cerrado', 'closed');

/* ── Importancia: { tier, w, porque } o null. tier ordena (menor primero) y w desempata dentro de cada tier. ── */
export function importancia(e, F = globalF.es) {
  const d = e.data || {};
  const pct = v => F.pct(v);
  switch (e.kind) {
    case 'lider':
      return d.from?.iiNow != null && d.margin >= LIDER_MIN
        ? { tier: 0, w: d.margin, porque: F.t(`cambia el mejor modelo ${d.block === 'abiertos' ? 'abierto' : 'cerrado'} con la misma versión del índice de AA y ${es(d.margin, 1)} puntos de margen (mínimo ${LIDER_MIN})`,
          `the best ${adj(F, d.block)} model changes with the same AA index version and a margin of ${F.n(d.margin, 1)} points (minimum ${LIDER_MIN})`) } : null;
    case 'version': return { tier: 1, w: 0, porque: F.t('Artificial Analysis cambia la versión de su índice', 'Artificial Analysis changes the version of its index') };
    case 'valoracion':
      return d.which === 'observatorio' ? { tier: 2, w: 0, porque: F.t('cambia la valoración del observatorio de un hito de AI 2027', 'the observatory’s assessment of an AI 2027 milestone changes') } : null;
    case 'nuevo': case 'evaluacion': {
      const r = e.kind === 'nuevo' || d.field === 'ii' ? d.rankAA : null;
      return r && r <= TOP ? { tier: 3, w: TOP + 1 - r, porque: F.t(`${e.kind === 'nuevo' ? 'es un modelo nuevo' : 'recibe su primera puntuación de AA'} y entra en el top ${TOP} del índice de AA (puesto ${r} de ${d.of})`,
        `${e.kind === 'nuevo' ? 'it is a new model' : 'it receives its first AA score'} and enters the top ${TOP} of the AA index (rank ${r} of ${d.of})`) } : null;
    }
    case 'pesos':
      return d.rankAA && d.rankAA <= TOP ? { tier: 4, w: TOP + 1 - d.rankAA, porque: F.t(`publica pesos abiertos un modelo del top ${TOP} del índice de AA (puesto ${d.rankAA})`, `a top-${TOP} model on the AA index publishes open weights (rank ${d.rankAA})`) } : null;
    case 'precio':
      if (d.sub === 'gratis') return { tier: 5, w: 100, porque: F.t('el propio laboratorio lo deja gratis en OpenRouter', 'the lab itself makes it free on OpenRouter') };
      if (d.sub === 'cobra') return { tier: 5, w: 100, porque: F.t('el propio laboratorio empieza a cobrarlo en OpenRouter, donde era gratis', 'the lab itself starts charging for it on OpenRouter, where it was free') };
      return (d.sub || 'precio') === 'precio' && d.pct != null && (d.pct >= SUBE || d.pct <= BAJA)
        ? { tier: 5, w: Math.abs(d.pct), porque: F.t(`el propio laboratorio ${d.pct > 0 ? 'sube' : 'baja'} su precio combinado un ${pct(d.pct)} (umbral: +${SUBE} % o ${String(BAJA).replace('-', '−')} %)`,
          `the lab itself ${d.pct > 0 ? 'raises' : 'cuts'} its blended price by ${pct(d.pct)} (threshold: +${SUBE}% or ${String(BAJA).replace('-', '−')}%)`) } : null;
    case 'indicador': {
      const rel = d.from ? Math.abs((d.to - d.from) / d.from * 100) : 100;
      if (d.ind === 'eci') return { tier: 6, w: 100, porque: F.t('cambia el mejor modelo según el ECI de Epoch', 'the best model on Epoch’s ECI changes') };
      if (d.ind === 'metrP80h') return { tier: 6, w: 90, porque: F.t('METR publica un nuevo punto del modelo puntero', 'METR publishes a new data point for the leading model') };
      if (d.ind === 'mirror') return d.to > d.from ? { tier: 6, w: 90, porque: F.t('nuevo récord en MirrorCode, la medida de tareas de semanas con la que el observatorio sustituye a METR', 'a new MirrorCode record, the measure of tasks lasting weeks with which the observatory replaces METR') } : null;
      if (GAP[d.ind]) return Math.abs(d.to - d.from) >= DIST ? { tier: 6, w: 50 + Math.abs(d.to - d.from), porque: F.t(`la distancia ${GAP[d.ind]} cambia al menos ${DIST} punto ECI, el margen con el que Epoch deja de hablar de la misma capacidad`,
        `the ${GAP_EN[d.ind]} changes by at least ${DIST} ECI point, the margin within which Epoch stops speaking of the same capability`) } : null;
      return CIFRAS.has(d.ind) && rel >= CIFRA ? { tier: 6, w: rel, porque: F.t(`la cifra cambia un ${pct(rel)} (umbral: ${CIFRA} %)`, `the figure changes by ${pct(rel)} (threshold: ${CIFRA}%)`) } : null;
    }
    case 'uso':
      return d.sub === 'primero' ? { tier: 7, w: 0, porque: F.t('cambia el modelo más usado en OpenRouter en los últimos 7 días', 'the most used model on OpenRouter over the last 7 days changes') } : null;
  }
  return null;
}

/* El texto del cambio en el idioma pedido: el campo `what` y, en inglés, su versión guardada (o la memoria si es un cambio antiguo). */
const whatOf = (e, F) => F.l === 'en' ? e.i18n?.en?.what ?? F.tm(e.what) : e.what;

/* ── Titular ── */
export function titular(e, C, F = globalF.es) {
  const d = e.data || {}, m = C.byId.get(e.model);
  const name = m?.name || d.name || d.to?.n || e.model || d.slug;
  const n = (v, k) => F.n(v, k);
  switch (e.kind) {
    case 'precio': {
      const who = d.provider || m?.lab?.name;
      if (d.sub === 'cobra') return F.t(`${who} empieza a cobrar ${name} en OpenRouter`, `${who} starts charging for ${name} on OpenRouter`);
      if (d.sub === 'gratis') return F.t(`${who} deja gratis ${name} en OpenRouter`, `${who} makes ${name} free on OpenRouter`);
      if (d.sub === 'tarifa-retirada') return F.t(`${who} retira la tarifa más barata de ${name} en OpenRouter`, `${who} withdraws the cheapest ${name} rate on OpenRouter`);
      if (d.sub === 'tarifa-nueva') return F.t(`${who} añade una tarifa más barata de ${name} en OpenRouter`, `${who} adds a cheaper ${name} rate on OpenRouter`);
      const r = blend(d.to) / blend(d.from);
      const verbo = Math.abs(r - 2) < 0.005 ? 'duplica' : Math.abs(r - 3) < 0.005 ? 'triplica' : Math.abs(r - 0.5) < 0.005 ? 'reduce a la mitad' : `${r > 1 ? 'sube' : 'baja'} un ${globalF.es.pct(d.pct)}`;
      const en = Math.abs(r - 2) < 0.005 ? `doubles the price of ${name}` : Math.abs(r - 3) < 0.005 ? `triples the price of ${name}` : Math.abs(r - 0.5) < 0.005 ? `halves the price of ${name}` : `${r > 1 ? 'raises' : 'cuts'} the price of ${name} by ${globalF.en.pct(d.pct)}`;
      return F.t(`${who} ${verbo} el precio de ${name}`, `${who} ${en}`);
    }
    case 'lider': return F.t(`${name} pasa a ser el mejor modelo ${d.block === 'abiertos' ? 'abierto' : 'cerrado'} del índice de AA`, `${name} becomes the best ${adj(F, d.block)} model on the AA index`);
    case 'version': return F.t(`Artificial Analysis estrena la versión ${d.to} de su índice de inteligencia`, `Artificial Analysis launches version ${d.to} of its Intelligence Index`);
    case 'nuevo': return F.t(`${name} (${m?.lab?.name || 'laboratorio sin confirmar'}) llega a OpenRouter${d.rankAA ? `: puesto ${d.rankAA} del índice de AA` : ''}`,
      `${name} (${m?.lab?.name || 'unconfirmed lab'}) arrives on OpenRouter${d.rankAA ? `: rank ${d.rankAA} on the AA index` : ''}`);
    case 'evaluacion': return d.field === 'ii' ? F.t(`${name} entra en el índice de AA en el puesto ${d.rankAA ?? '—'}`, `${name} enters the AA index at rank ${d.rankAA ?? '—'}`)
      : F.t(`Epoch AI puntúa por primera vez ${name} en el ECI`, `Epoch AI scores ${name} on the ECI for the first time`);
    case 'pesos': return F.t(`Pesos abiertos de ${name}${d.rankAA ? `, puesto ${d.rankAA} del índice de AA` : ''}`, `Open weights for ${name}${d.rankAA ? `, rank ${d.rankAA} on the AA index` : ''}`);
    case 'retirada': return F.t(`${name} deja de figurar en OpenRouter`, `${name} is no longer listed on OpenRouter`);
    case 'valoracion': {
      const h = C.hitos.get(d.hito);
      return d.which === 'observatorio'
        ? F.t(`AI 2027: «${h?.titulo || d.hito}» ${PLAIN[d.to] || `pasa a «${d.to}»`}`, `AI 2027: “${F.tm(h?.titulo || d.hito)}” ${PLAIN_EN[d.to] || `moves to “${F.tm(d.to)}”`}`)
        : F.t(`AI 2027: cambia la estimación de «${h?.titulo || d.hito}»`, `AI 2027: the estimate for “${F.tm(h?.titulo || d.hito)}” changes`);
    }
    case 'indicador': {
      const f = at(C.ind, d.path) || {}, up = d.to > d.from;
      if (d.ind === 'eci') return f.model ? F.t(`${f.model} pasa a ser el mejor modelo según el ECI de Epoch`, `${f.model} becomes the best model on Epoch’s ECI`) : F.t(`El mejor ECI de Epoch ${up ? 'sube' : 'baja'} a ${es(d.to)}`, `Epoch’s best ECI ${up ? 'rises' : 'falls'} to ${n(d.to)}`);
      if (GAP[d.ind]) return F.t(`La distancia ${GAP[d.ind]} en el ECI ${up ? 'sube' : 'baja'} de ${es(d.from, 1)} a ${es(d.to, 1)} puntos`, `The ${GAP_EN[d.ind]} on the ECI ${up ? 'rises' : 'falls'} from ${n(d.from, 1)} to ${n(d.to, 1)} points`);
      if (d.ind === 'dcMW') return F.t(`La potencia en servicio de los centros que sigue Epoch ${up ? 'sube' : 'baja'} a ${es(d.to, 0)} MW`, `The power in service at the data centres Epoch tracks ${up ? 'rises' : 'falls'} to ${n(d.to, 0)} MW`);
      if (d.ind === 'chipsH100e') return F.t(`Epoch ${up ? 'eleva' : 'rebaja'} a ${es(d.to / 1e6, 1)} millones de H100e los chips de IA entregados`, `Epoch ${up ? 'raises' : 'lowers'} AI chips delivered to ${n(d.to / 1e6, 1)} million H100e`);
      if (d.ind === 'revLeader') return F.t(`${f.company || 'El líder'}: ${es(d.to / 1e9, 1)} mil millones de $ de ingresos anualizados`, `${f.company || 'The leader'}: $${n(d.to / 1e9, 1)} billion in annualised revenue`);
      if (d.ind === 'metrP80h') return F.t(`METR: el modelo puntero ${up ? 'sube' : 'baja'} a ${es(d.to, 1)} h de horizonte al 80 %`, `METR: the leading model ${up ? 'rises' : 'falls'} to ${n(d.to, 1)} h of 80% horizon`);
      if (d.ind === 'mirror') return F.t(`${f.model || 'Un modelo'} marca un nuevo récord en MirrorCode: ${es(d.to, 1)} %`, `${f.model || 'A model'} sets a new MirrorCode record: ${n(d.to, 1)}%`);
      return whatOf(e, F);
    }
    case 'uso': return d.sub === 'primero' ? F.t(`${name} pasa a ser el modelo más usado en OpenRouter`, `${name} becomes the most used model on OpenRouter`) : F.t(`${name} entra en el top 10 de uso de OpenRouter`, `${name} enters OpenRouter’s top 10 by usage`);
  }
  return whatOf(e, F);
}

/* ── Consecuencia: hechos calculados con los datos de la recogida, nunca una opinión ── */
const scored = C => C.models.filter(m => ii(m) !== null && m.identity === 'confirmada');
function posicion(m, C, F) {
  const s = ii(m);
  if (s === null) return m.epoch?.eci?.v != null ? F.t(`Sin puntuación todavía en Artificial Analysis; ECI ${es(m.epoch.eci.v, 1)} en Epoch AI.`, `No score yet on Artificial Analysis; ECI ${F.n(m.epoch.eci.v, 1)} on Epoch AI.`)
    : F.t('Sin puntuación independiente todavía en Artificial Analysis ni en Epoch AI.', 'No independent score yet on Artificial Analysis or Epoch AI.');
  const block = m.weights.v, a = adj(F, block);
  const lead = scored(C).filter(x => x.id !== m.id && x.weights.v === block).sort((a, b) => ii(b) - ii(a))[0];
  const all = scored(C).sort((a, b) => ii(b) - ii(a)), rank = all.findIndex(x => x.id === m.id) + 1;
  const diff = lead ? Math.round((s - ii(lead)) * 10) / 10 : null;
  const head = F.t(`Índice de AA ${es(s, 1)}`, `AA index ${F.n(s, 1)}`);
  return lead
    ? F.t(`${head}: ${diff > 0 ? `supera en ${es(diff, 1)} puntos al mejor ${a} anterior (${lead.name})` : diff === 0 ? `empata con el mejor ${a} (${lead.name})` : `a ${es(-diff, 1)} puntos del mejor ${a} (${lead.name})`}. Puesto ${rank} de ${all.length}.`,
      `${head}: ${diff > 0 ? `${F.n(diff, 1)} points above the previous best ${a} model (${lead.name})` : diff === 0 ? `ties with the best ${a} model (${lead.name})` : `${F.n(-diff, 1)} points behind the best ${a} model (${lead.name})`}. Rank ${rank} of ${all.length}.`)
    : F.t(`${head}. Puesto ${rank} de ${all.length}.`, `${head}. Rank ${rank} of ${all.length}.`);
}
/* Precio frente a los modelos con un índice de AA parecido; con «conPrecio», empieza diciendo el precio. */
function precioRel(m, C, F, conPrecio = true) {
  const b = blendM(m);
  if (b === null) return '';
  if (b === 0) return conPrecio ? F.t('Gratis en OpenRouter en el momento de la consulta.', 'Free on OpenRouter at the time of the check.') : '';
  const head = conPrecio ? F.t(`Precio combinado ${F.usd(b)} por millón de tokens.`, `Blended price ${F.usd(b)} per million tokens.`) : '';
  const s = ii(m);
  const peers = s === null ? [] : scored(C).filter(x => x.id !== m.id && Math.abs(ii(x) - s) <= PARECIDO && blendM(x) > 0);
  if (peers.length < 3) return head;
  const cheaper = peers.filter(x => blendM(x) < b).length, low = peers.slice().sort((a, c) => blendM(a) - blendM(c))[0];
  return F.t(`${head} De los ${peers.length} modelos con un índice de AA parecido (±${PARECIDO} puntos de su ${F.n(s, 1)}), ${cheaper === 0 ? 'ninguno cuesta menos' : `${cheaper} cuesta${cheaper > 1 ? 'n' : ''} menos; el más barato es ${low.name}, a ${F.usd(blendM(low))}`}.`.trim(),
    `${head} Of the ${peers.length} models with a similar AA index (±${PARECIDO} points of its ${F.n(s, 1)}), ${cheaper === 0 ? 'none costs less' : `${cheaper} ${cheaper > 1 ? 'cost' : 'costs'} less; the cheapest is ${low.name}, at ${F.usd(blendM(low))}`}.`.trim());
}
export function consecuencia(e, C, F = globalF.es) {
  const d = e.data || {}, m = C.byId.get(e.model);
  switch (e.kind) {
    case 'precio': {
      if (!m) return null;
      const a = blend(d.from), b = blend(d.to), tier = /^tarifa/.test(d.sub || '');
      return F.t(`Su precio combinado${tier ? ' más barato' : ''} en OpenRouter pasa de ${a === 0 ? 'gratis' : F.usd(a)} a ${b === 0 ? 'gratis' : `${F.usd(b)} por millón de tokens`}. ${precioRel(m, C, F, false)}`.trim(),
        `Its${tier ? ' cheapest' : ''} blended price on OpenRouter goes from ${a === 0 ? 'free' : F.usd(a)} to ${b === 0 ? 'free' : `${F.usd(b)} per million tokens`}. ${precioRel(m, C, F, false)}`.trim());
    }
    case 'lider': {
      const now = C.leaders?.aa, then = C.base?.leaders?.aa;
      const gap = x => x?.closed && x?.open ? Math.round((x.closed.ii - x.open.ii) * 10) / 10 : null;
      return gap(now) !== null ? F.t(`La distancia entre el mejor cerrado y el mejor abierto en el índice de AA queda en ${es(gap(now), 1)} puntos${gap(then) !== null ? ` (${es(gap(then), 1)} el día anterior)` : ''}. No equivale a meses de retraso.`,
        `The gap between the best closed and the best open-weight model on the AA index stands at ${F.n(gap(now), 1)} points${gap(then) !== null ? ` (${F.n(gap(then), 1)} the day before)` : ''}. It does not equate to months of lag.`) : null;
    }
    case 'version': return F.t('Las puntuaciones de una versión y otra no se comparan: la evolución diaria de los líderes empieza de nuevo con esta versión.', 'Scores from one version and the other are not comparable: the daily evolution of the leaders starts over with this version.');
    case 'nuevo': case 'evaluacion': return m ? F.t(`${m.identity !== 'confirmada' ? 'Modelo anónimo: el laboratorio no está confirmado. ' : ''}${posicion(m, C, F)} ${precioRel(m, C, F)}`.trim(),
      `${m.identity !== 'confirmada' ? 'Anonymous model: the lab is not confirmed. ' : ''}${posicion(m, C, F)} ${precioRel(m, C, F)}`.trim()) : null;
    case 'pesos': return m ? F.t(`Se puede descargar y servir fuera de la API del laboratorio. Licencia: ${m.license.v || 'sin datos'}. ${posicion(m, C, F)}`, `It can be downloaded and served outside the lab’s API. Licence: ${m.license.v || 'no data'}. ${posicion(m, C, F)}`) : null;
    case 'retirada': return F.t('Deja de poder usarse a través de OpenRouter. Puede seguir disponible en la API del propio laboratorio.', 'It can no longer be used through OpenRouter. It may still be available through the lab’s own API.');
    case 'valoracion': {
      const h = C.hitos.get(d.hito);
      if (!h) return null;
      const v = d.which === 'observatorio' ? valOf(h, 'observatorio', C.checks) : estimateCore(h, C.checks, C.ai2027);
      const texto = F.l === 'en' ? v?.i18n?.en?.texto ?? F.tm(v?.texto) : v?.texto;
      return F.t(`${texto || ''} Antes: «${d.from ?? 'sin valoración'}». Plazo del escenario: ${h.plazo_texto}.`.trim(),
        `${texto || ''} Before: “${d.from ? F.tm(d.from) : 'no assessment'}”. Scenario deadline: ${F.tm(h.plazo_texto)}.`.trim());
    }
    case 'indicador': {
      const f = at(C.ind, d.path) || {};
      const who = x => x ? `${x.model} (${x.org}, ${F.n(x.eci, 1)})` : '';
      const vs = F.t('frente a', 'versus'), lag = F.t('Unos puntos ECI no equivalen a meses de retraso.', 'A few ECI points do not equate to months of lag.');
      const ctx = {
        eci: f.model ? F.t(`${f.model}${f.org ? `, de ${f.org}` : ''}, con ${es(f.v, 1)} puntos.`, `${f.model}${f.org ? `, from ${f.org}` : ''}, with ${F.n(f.v, 1)} points.`) : '',
        usCn: f.us && f.cn ? `${who(f.us)} ${vs} ${who(f.cn)}. ${lag}` : '',
        closedOpen: f.closed && f.open ? `${who(f.closed)} ${vs} ${who(f.open)}. ${lag}` : '',
        labs: f.first && f.second ? `${who(f.first)} ${vs} ${who(f.second)}${f.overlap ? F.t(', con intervalos de confianza solapados', ', with overlapping confidence intervals') : ''}.` : '',
        dcMW: F.t(`${f.n ? `${f.n} centros. ` : ''}Potencia de los equipos, sin refrigeración; no es el total mundial.`, `${f.n ? `${f.n} data centres. ` : ''}Power of the equipment, without cooling; it is not the world total.`),
        chipsH100e: F.t('Chips entregados según Epoch, no necesariamente instalados.', 'Chips delivered according to Epoch, not necessarily installed.'),
        revLeader: f.company ? F.t(`${f.company}, ${f.type || 'ingresos'}, confianza de Epoch: ${f.confidence || 'sin datos'}.`, `${f.company}, ${f.type ? F.tm(f.type) : 'revenue'}, Epoch confidence: ${f.confidence || 'no data'}.`) : '',
        metrP80h: F.t('Horas de trabajo de un experto humano en las tareas que completa, no horas de autonomía.', 'Hours of work by a human expert on the tasks it completes, not hours of autonomy.'),
        mirror: F.t(`Antes, ${es(d.from, 1)} %. Reimplementar programas enteros a partir de su comportamiento, tareas que a un ingeniero le llevarían semanas; ejecuciones de Epoch.`,
          `Before, ${F.n(d.from, 1)}%. Reimplementing whole programs from their behaviour, tasks that would take an engineer weeks; Epoch runs.`)
      }[d.ind] || '';
      const uses = [...C.hitos.values()].filter(h => (h.evidencia || []).some(x => x.indicador === d.path)).map(h => F.t(`«${h.titulo}»`, `“${F.tm(h.titulo)}”`));
      return `${ctx}${uses.length ? F.t(` En AI 2027 es evidencia de ${uses.join(' y ')}.`, ` In AI 2027 it is evidence for ${uses.join(' and ')}.`) : ''}`.trim() || null;
    }
    case 'uso': {
      const u = C.uso;
      return u ? F.t(`${es(d.share, 1)} % de los tokens de OpenRouter del ${u.from} al ${u.to}${d.sub === 'primero' ? `; antes el primero era ${d.prev}` : ''}. Es el uso en OpenRouter, no en todo el mercado.`,
        `${F.n(d.share, 1)}% of OpenRouter’s tokens from ${u.from} to ${u.to}${d.sub === 'primero' ? `; before, the first was ${d.prev}` : ''}. This is usage on OpenRouter, not across the whole market.`) : null;
    }
  }
  return null;
}

/* Dirección de la ficha en la propia web: modelo, hito o frente. */
export function ficha(e, C) {
  if (e.data?.ficha) return e.data.ficha;
  if (e.kind === 'indicador') { const f = (C.carrera?.frentes || []).find(x => (x.indicadores || []).includes(e.data.path)); return f ? `#carrera/${f.id}` : '#carrera'; }
  if (e.model && C.byId.has(e.model)) return `#modelos/${e.model}`;
  return null;
}

/* Completa cada cambio con titular, importancia y ficha; la consecuencia, sólo en lo detectado en esta recogida
   (la de días anteriores queda como se escribió entonces). El inglés va al lado, en i18n.en. */
export function enrich(items, C, TODAY) {
  for (const e of items) {
    e.titular = titular(e, C);
    e.importancia = importancia(e);
    e.ficha = ficha(e, C);
    const recalc = e.detected === TODAY || e.consecuencia === undefined;
    if (recalc) e.consecuencia = consecuencia(e, C);
    const en = ((e.i18n ??= {}).en ??= {});
    if (!en.what && e.what) { const w = globalF.en.tm(e.what); if (w !== e.what) en.what = w; }   // cambios anteriores a la versión bilingüe: de la memoria de traducción
    en.titular = titular(e, C, globalF.en);
    const imp = importancia(e, globalF.en);
    if (imp) en.porque = imp.porque; else delete en.porque;
    if (recalc) { const c = consecuencia(e, C, globalF.en); if (c) en.consecuencia = c; else delete en.consecuencia; }
  }
  return items;
}

const order = (a, b) => a.importancia.tier - b.importancia.tier || b.importancia.w - a.importancia.w;
const oneEach = list => { const seen = new Set(); return list.filter(e => { const k = e.model || e.data?.hito || e.key; return !seen.has(k) && seen.add(k); }); };

/* El parte: hasta tres noticias de la última recogida (claves de «items»); si no hay ninguna, la última noticia
   anterior, buscada en todo el registro («all») y copiada entera porque puede caer fuera de la ventana de Hoy. */
export function parte(items, TODAY, all = items) {
  const hoy = oneEach(items.filter(e => e.importancia && e.detected === TODAY).sort(order)).slice(0, 3);
  const prev = hoy.length ? null : all.filter(e => e.importancia && e.detected < TODAY).sort((a, b) => b.detected.localeCompare(a.detected) || order(a, b))[0] || null;
  const ultima = prev && { key: prev.key, fecha: prev.detected, titular: prev.titular, ficha: prev.ficha };
  if (ultima) ultima.i18n = { en: { titular: prev.i18n?.en?.titular ?? globalF.en.tm(prev.titular) } };
  return { fecha: TODAY, noticias: hoy.map(e => e.key), ultima, reglas: REGLAS, i18n: { en: { reglas: REGLAS_EN } } };
}

/* Fuente RSS 2.0 con las noticias de los últimos RSS_DIAS días, la más reciente primero; en español o en inglés. */
const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function rss(items, { NOW_ISO, TODAY }, lang = 'es') {
  const F = globalF[lang], en = lang === 'en';
  const from = new Date(Date.parse(TODAY) - RSS_DIAS * 86400e3).toISOString().slice(0, 10);
  const list = items.filter(e => e.importancia && e.detected >= from).sort((a, b) => b.detected.localeCompare(a.detected) || order(a, b));
  const when = e => new Date((e.src?.got || '').slice(0, 10) === e.detected ? e.src.got : `${e.detected}T05:00:00Z`).toUTCString();
  const home = en ? `${SITE}?lang=en` : SITE;
  // Los campos de cada noticia en el idioma de la fuente.
  const f = e => en
    ? { titular: e.i18n?.en?.titular ?? F.tm(e.titular), what: whatOf(e, F), consecuencia: e.consecuencia ? e.i18n?.en?.consecuencia ?? F.tm(e.consecuencia) : e.consecuencia, porque: e.i18n?.en?.porque ?? F.tm(e.importancia.porque) }
    : { titular: e.titular, what: e.what, consecuencia: e.consecuencia, porque: e.importancia.porque };
  // Las cifras de Artificial Analysis se publican con su permiso y siempre citadas con enlace.
  const aa = (e, t) => /\bAA\b|Artificial Analysis/.test([t.titular, t.what, t.consecuencia, t.porque].join(' '))
    ? F.t('Datos de Artificial Analysis (https://artificialanalysis.ai), publicados con su permiso.', 'Artificial Analysis data (https://artificialanalysis.ai), published with its permission.') : null;
  const body = list.map(e => { const t = f(e); return `  <item>
    <title>${x(t.titular)}</title>
    <link>${x(home + (e.ficha || '#hoy'))}</link>
    <guid isPermaLink="false">${x(e.key)}</guid>
    <pubDate>${when(e)}</pubDate>
    <description>${x([t.what, t.consecuencia, F.t(`Está en el parte porque ${t.porque}.`, `It is in the briefing because ${t.porque}.`),
      e.published ? F.t(`Publicado el ${e.published}; detectado el ${e.detected}.`, `Published on ${e.published}; detected on ${e.detected}.`) : F.t(`Detectado el ${e.detected}.`, `Detected on ${e.detected}.`),
      F.t(`Fuente: ${e.src?.name} (${/^#/.test(e.src?.url || '') ? SITE + e.src.url : e.src?.url}).`, `Source: ${e.src?.name} (${/^#/.test(e.src?.url || '') ? SITE + e.src.url : e.src?.url}).`), aa(e, t)].filter(Boolean).join(' '))}</description>
  </item>`; }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${F.t('MOLOCH.SH · parte diario', 'MOLOCH.SH · daily briefing')}</title>
  <link>${home}#hoy</link>
  <atom:link href="${SITE}data/${en ? 'parte.en.xml' : 'parte.xml'}" rel="self" type="application/rss+xml"/>
  <description>${F.t('Las noticias de la carrera por la IA que detecta cada día el observatorio, elegidas con una regla fija. Cifras de OpenRouter, Artificial Analysis, Epoch AI, Hugging Face y METR, con su fuente.', 'The AI-race news that the observatory detects every day, chosen with a fixed rule. Figures from OpenRouter, Artificial Analysis, Epoch AI, Hugging Face and METR, with their source.')}</description>
  <language>${en ? 'en' : 'es'}</language>
  <lastBuildDate>${new Date(NOW_ISO).toUTCString()}</lastBuildDate>
${body}
</channel>
</rss>
`;
}
