/* MOLOCH.SH · parte diario de «Hoy».

   Sobre los cambios que mide scripts/cambios.mjs decide, con una regla fija que la web publica, cuáles son
   noticia (importancia), y redacta para cada uno un titular y una consecuencia con plantillas: cada palabra
   sale de una cifra («duplica» sólo con el doble exacto), sin modelo de lenguaje ni opinión.
   El parte son hasta tres noticias de la última recogida; si no hay ninguna, se dice. También genera la
   fuente RSS (data/parte.xml) con las noticias de los últimos días. */

import { valOf, estimateCore } from '../js/valoracion.js';

export const SITE = 'https://moloch-sh.netlify.app/';
const LIDER_MIN = 1;     // puntos del índice de AA: un relevo por menos no es noticia
const TOP = 20;          // «top 20» del índice de AA
const SUBE = 50, BAJA = -33;   // % del precio combinado del propio laboratorio
const DIST = 1;          // puntos ECI: por debajo, Epoch habla de la misma capacidad
const CIFRA = 10;        // % de cambio en potencia, chips o ingresos
const PARECIDO = 2;      // ± puntos de AA para «índice parecido» (convención del observatorio)
const RSS_DIAS = 30;

/* La regla, en el orden en que se priorizan las noticias. La web la muestra tal cual. */
export const REGLAS = [
  `Cambia el mejor modelo abierto o cerrado del índice de Artificial Analysis, con la misma versión del índice y al menos ${LIDER_MIN} punto de margen.`,
  'Artificial Analysis cambia la versión de su índice.',
  'Cambia la valoración del observatorio de un hito de AI 2027.',
  `Un modelo nuevo, o uno que recibe su primera puntuación de AA, entra en el top ${TOP} del índice de AA.`,
  `Publica pesos abiertos un modelo del top ${TOP} del índice de AA.`,
  `El propio laboratorio cambia su precio en OpenRouter al menos un +${SUBE} % o un ${String(BAJA).replace('-', '−')} % (precio combinado), lo deja gratis o empieza a cobrarlo. No cuenta que retire o añada una tarifa.`,
  `La carrera: nuevo mejor modelo según el ECI de Epoch, nuevo punto de METR, una distancia que cambia al menos ${DIST} punto ECI, o potencia, chips o ingresos que cambian al menos un ${CIFRA} %.`,
  'Cambia el modelo más usado en OpenRouter en los últimos 7 días.'
];

const es = (v, d = 2) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: d });
const usd = v => `${es(v, v < 1 ? 3 : 2)} $`;
const pct = v => `${es(Math.abs(v), 0)} %`;
const at = (o, path) => path.split('.').reduce((x, k) => x?.[k], o);
const ii = m => m?.aa?.intelligence?.v ?? null;
const blend = p => p && p.in != null && p.out != null ? (3 * p.in + p.out) / 4 : null;
const blendM = m => blend({ in: m.price.in.v, out: m.price.out.v });
const PLAIN = { adelantado: 'va por delante del escenario', compatible: 'se cumple como preveía', retrasado: 'va por detrás del escenario', 'todavía no evaluable': 'aún no se puede evaluar', 'sin evidencia suficiente': 'se queda sin datos públicos para comprobarlo' };
const GAP = { usCn: 'EE. UU. − China', closedOpen: 'cerrados − abiertos', labs: 'entre los dos primeros laboratorios' };

/* ── Importancia: { tier, w, porque } o null. tier ordena (menor primero) y w desempata dentro de cada tier. ── */
export function importancia(e) {
  const d = e.data || {};
  switch (e.kind) {
    case 'lider':
      return d.from?.iiNow != null && d.margin >= LIDER_MIN
        ? { tier: 0, w: d.margin, porque: `cambia el mejor modelo ${d.block === 'abiertos' ? 'abierto' : 'cerrado'} con la misma versión del índice de AA y ${es(d.margin, 1)} puntos de margen (mínimo ${LIDER_MIN})` } : null;
    case 'version': return { tier: 1, w: 0, porque: 'Artificial Analysis cambia la versión de su índice' };
    case 'valoracion':
      return d.which === 'observatorio' ? { tier: 2, w: 0, porque: 'cambia la valoración del observatorio de un hito de AI 2027' } : null;
    case 'nuevo': case 'evaluacion': {
      const r = e.kind === 'nuevo' || d.field === 'ii' ? d.rankAA : null;
      return r && r <= TOP ? { tier: 3, w: TOP + 1 - r, porque: `${e.kind === 'nuevo' ? 'es un modelo nuevo' : 'recibe su primera puntuación de AA'} y entra en el top ${TOP} del índice de AA (puesto ${r} de ${d.of})` } : null;
    }
    case 'pesos':
      return d.rankAA && d.rankAA <= TOP ? { tier: 4, w: TOP + 1 - d.rankAA, porque: `publica pesos abiertos un modelo del top ${TOP} del índice de AA (puesto ${d.rankAA})` } : null;
    case 'precio':
      if (d.sub === 'gratis') return { tier: 5, w: 100, porque: 'el propio laboratorio lo deja gratis en OpenRouter' };
      if (d.sub === 'cobra') return { tier: 5, w: 100, porque: 'el propio laboratorio empieza a cobrarlo en OpenRouter, donde era gratis' };
      return (d.sub || 'precio') === 'precio' && d.pct != null && (d.pct >= SUBE || d.pct <= BAJA)
        ? { tier: 5, w: Math.abs(d.pct), porque: `el propio laboratorio ${d.pct > 0 ? 'sube' : 'baja'} su precio combinado un ${pct(d.pct)} (umbral: +${SUBE} % o ${String(BAJA).replace('-', '−')} %)` } : null;
    case 'indicador': {
      const rel = d.from ? Math.abs((d.to - d.from) / d.from * 100) : 100;
      if (d.ind === 'eci') return { tier: 6, w: 100, porque: 'cambia el mejor modelo según el ECI de Epoch' };
      if (d.ind === 'metrP80h') return { tier: 6, w: 90, porque: 'METR publica un nuevo punto del modelo puntero' };
      if (GAP[d.ind]) return Math.abs(d.to - d.from) >= DIST ? { tier: 6, w: 50 + Math.abs(d.to - d.from), porque: `la distancia ${GAP[d.ind]} cambia al menos ${DIST} punto ECI, el margen con el que Epoch deja de hablar de la misma capacidad` } : null;
      return rel >= CIFRA ? { tier: 6, w: rel, porque: `la cifra cambia un ${pct(rel)} (umbral: ${CIFRA} %)` } : null;
    }
    case 'uso':
      return d.sub === 'primero' ? { tier: 7, w: 0, porque: 'cambia el modelo más usado en OpenRouter en los últimos 7 días' } : null;
  }
  return null;
}

/* ── Titular ── */
export function titular(e, C) {
  const d = e.data || {}, m = C.byId.get(e.model);
  const name = m?.name || d.name || d.to?.n || e.model || d.slug;
  switch (e.kind) {
    case 'precio': {
      const who = d.provider || m?.lab?.name;
      if (d.sub === 'cobra') return `${who} empieza a cobrar ${name} en OpenRouter`;
      if (d.sub === 'gratis') return `${who} deja gratis ${name} en OpenRouter`;
      if (d.sub === 'tarifa-retirada') return `${who} retira la tarifa más barata de ${name} en OpenRouter`;
      if (d.sub === 'tarifa-nueva') return `${who} añade una tarifa más barata de ${name} en OpenRouter`;
      const r = blend(d.to) / blend(d.from);
      const verbo = Math.abs(r - 2) < 0.005 ? 'duplica' : Math.abs(r - 3) < 0.005 ? 'triplica' : Math.abs(r - 0.5) < 0.005 ? 'reduce a la mitad' : `${r > 1 ? 'sube' : 'baja'} un ${pct(d.pct)}`;
      return `${who} ${verbo} el precio de ${name}`;
    }
    case 'lider': return `${name} pasa a ser el mejor modelo ${d.block === 'abiertos' ? 'abierto' : 'cerrado'} del índice de AA`;
    case 'version': return `Artificial Analysis estrena la versión ${d.to} de su índice de inteligencia`;
    case 'nuevo': return `${name} (${m?.lab?.name || 'laboratorio sin confirmar'}) llega a OpenRouter${d.rankAA ? `: puesto ${d.rankAA} del índice de AA` : ''}`;
    case 'evaluacion': return d.field === 'ii' ? `${name} entra en el índice de AA en el puesto ${d.rankAA ?? '—'}` : `Epoch AI puntúa por primera vez ${name} en el ECI`;
    case 'pesos': return `Pesos abiertos de ${name}${d.rankAA ? `, puesto ${d.rankAA} del índice de AA` : ''}`;
    case 'retirada': return `${name} deja de figurar en OpenRouter`;
    case 'valoracion': {
      const h = C.hitos.get(d.hito);
      return d.which === 'observatorio' ? `AI 2027: «${h?.titulo || d.hito}» ${PLAIN[d.to] || `pasa a «${d.to}»`}` : `AI 2027: cambia la estimación de «${h?.titulo || d.hito}»`;
    }
    case 'indicador': {
      const f = at(C.ind, d.path) || {}, up = d.to > d.from;
      if (d.ind === 'eci') return f.model ? `${f.model} pasa a ser el mejor modelo según el ECI de Epoch` : `El mejor ECI de Epoch ${up ? 'sube' : 'baja'} a ${es(d.to)}`;
      if (GAP[d.ind]) return `La distancia ${GAP[d.ind]} en el ECI ${up ? 'sube' : 'baja'} de ${es(d.from, 1)} a ${es(d.to, 1)} puntos`;
      if (d.ind === 'dcMW') return `La potencia en servicio de los centros que sigue Epoch ${up ? 'sube' : 'baja'} a ${es(d.to, 0)} MW`;
      if (d.ind === 'chipsH100e') return `Epoch ${up ? 'eleva' : 'rebaja'} a ${es(d.to / 1e6, 1)} millones de H100e los chips de IA entregados`;
      if (d.ind === 'revLeader') return `${f.company || 'El líder'}: ${es(d.to / 1e9, 1)} mil millones de $ de ingresos anualizados`;
      if (d.ind === 'metrP80h') return `METR: el modelo puntero ${up ? 'sube' : 'baja'} a ${es(d.to, 1)} h de horizonte al 80 %`;
      return e.what;
    }
    case 'uso': return d.sub === 'primero' ? `${name} pasa a ser el modelo más usado en OpenRouter` : `${name} entra en el top 10 de uso de OpenRouter`;
  }
  return e.what;
}

/* ── Consecuencia: hechos calculados con los datos de la recogida, nunca una opinión ── */
const scored = C => C.models.filter(m => ii(m) !== null && m.identity === 'confirmada');
function posicion(m, C) {
  const s = ii(m);
  if (s === null) return m.epoch?.eci?.v != null ? `Sin puntuación todavía en Artificial Analysis; ECI ${es(m.epoch.eci.v, 1)} en Epoch AI.` : 'Sin puntuación independiente todavía en Artificial Analysis ni en Epoch AI.';
  const block = m.weights.v, adj = block === 'abiertos' ? 'abierto' : 'cerrado';
  const lead = scored(C).filter(x => x.id !== m.id && x.weights.v === block).sort((a, b) => ii(b) - ii(a))[0];
  const all = scored(C).sort((a, b) => ii(b) - ii(a)), rank = all.findIndex(x => x.id === m.id) + 1;
  const diff = lead ? Math.round((s - ii(lead)) * 10) / 10 : null;
  const head = `Índice de AA ${es(s, 1)}`;
  return lead
    ? `${head}: ${diff > 0 ? `supera en ${es(diff, 1)} puntos al mejor ${adj} anterior (${lead.name})` : diff === 0 ? `empata con el mejor ${adj} (${lead.name})` : `a ${es(-diff, 1)} puntos del mejor ${adj} (${lead.name})`}. Puesto ${rank} de ${all.length}.`
    : `${head}. Puesto ${rank} de ${all.length}.`;
}
/* Precio frente a los modelos con un índice de AA parecido; con «conPrecio», empieza diciendo el precio. */
function precioRel(m, C, conPrecio = true) {
  const b = blendM(m);
  if (b === null) return '';
  if (b === 0) return conPrecio ? 'Gratis en OpenRouter en el momento de la consulta.' : '';
  const head = conPrecio ? `Precio combinado ${usd(b)} por millón de tokens.` : '';
  const s = ii(m);
  const peers = s === null ? [] : scored(C).filter(x => x.id !== m.id && Math.abs(ii(x) - s) <= PARECIDO && blendM(x) > 0);
  if (peers.length < 3) return head;
  const cheaper = peers.filter(x => blendM(x) < b).length, low = peers.slice().sort((a, c) => blendM(a) - blendM(c))[0];
  return `${head} De los ${peers.length} modelos con un índice de AA parecido (±${PARECIDO} puntos de su ${es(s, 1)}), ${cheaper === 0 ? 'ninguno cuesta menos' : `${cheaper} cuesta${cheaper > 1 ? 'n' : ''} menos; el más barato es ${low.name}, a ${usd(blendM(low))}`}.`.trim();
}
export function consecuencia(e, C) {
  const d = e.data || {}, m = C.byId.get(e.model);
  switch (e.kind) {
    case 'precio': {
      if (!m) return null;
      const a = blend(d.from), b = blend(d.to), tier = /^tarifa/.test(d.sub || '');
      return `Su precio combinado${tier ? ' más barato' : ''} en OpenRouter pasa de ${a === 0 ? 'gratis' : usd(a)} a ${b === 0 ? 'gratis' : `${usd(b)} por millón de tokens`}. ${precioRel(m, C, false)}`.trim();
    }
    case 'lider': {
      const now = C.leaders?.aa, then = C.base?.leaders?.aa;
      const gap = x => x?.closed && x?.open ? Math.round((x.closed.ii - x.open.ii) * 10) / 10 : null;
      return gap(now) !== null ? `La distancia entre el mejor cerrado y el mejor abierto en el índice de AA queda en ${es(gap(now), 1)} puntos${gap(then) !== null ? ` (${es(gap(then), 1)} el día anterior)` : ''}. No equivale a meses de retraso.` : null;
    }
    case 'version': return 'Las puntuaciones de una versión y otra no se comparan: la evolución diaria de los líderes empieza de nuevo con esta versión.';
    case 'nuevo': case 'evaluacion': return m ? `${m.identity !== 'confirmada' ? 'Modelo anónimo: el laboratorio no está confirmado. ' : ''}${posicion(m, C)} ${precioRel(m, C)}`.trim() : null;
    case 'pesos': return m ? `Se puede descargar y servir fuera de la API del laboratorio. Licencia: ${m.license.v || 'sin datos'}. ${posicion(m, C)}` : null;
    case 'retirada': return 'Deja de poder usarse a través de OpenRouter. Puede seguir disponible en la API del propio laboratorio.';
    case 'valoracion': {
      const h = C.hitos.get(d.hito);
      if (!h) return null;
      const v = d.which === 'observatorio' ? valOf(h, 'observatorio', C.checks) : estimateCore(h, C.checks, C.ai2027);
      return `${v?.texto || ''} Antes: «${d.from ?? 'sin valoración'}». Plazo del escenario: ${h.plazo_texto}.`.trim();
    }
    case 'indicador': {
      const f = at(C.ind, d.path) || {};
      const who = x => x ? `${x.model} (${x.org}, ${es(x.eci, 1)})` : '';
      const ctx = {
        eci: f.model ? `${f.model}${f.org ? `, de ${f.org}` : ''}, con ${es(f.v, 1)} puntos.` : '',
        usCn: f.us && f.cn ? `${who(f.us)} frente a ${who(f.cn)}. Unos puntos ECI no equivalen a meses de retraso.` : '',
        closedOpen: f.closed && f.open ? `${who(f.closed)} frente a ${who(f.open)}. Unos puntos ECI no equivalen a meses de retraso.` : '',
        labs: f.first && f.second ? `${who(f.first)} frente a ${who(f.second)}${f.overlap ? ', con intervalos de confianza solapados' : ''}.` : '',
        dcMW: `${f.n ? `${f.n} centros. ` : ''}Potencia de los equipos, sin refrigeración; no es el total mundial.`,
        chipsH100e: 'Chips entregados según Epoch, no necesariamente instalados.',
        revLeader: f.company ? `${f.company}, ${f.type || 'ingresos'}, confianza de Epoch: ${f.confidence || 'sin datos'}.` : '',
        metrP80h: 'Horas de trabajo de un experto humano en las tareas que completa, no horas de autonomía.'
      }[d.ind] || '';
      const uses = [...C.hitos.values()].filter(h => (h.evidencia || []).some(x => x.indicador === d.path)).map(h => `«${h.titulo}»`);
      return `${ctx}${uses.length ? ` En AI 2027 es evidencia de ${uses.join(' y ')}.` : ''}`.trim() || null;
    }
    case 'uso': {
      const u = C.uso;
      return u ? `${es(d.share, 1)} % de los tokens de OpenRouter del ${u.from} al ${u.to}${d.sub === 'primero' ? `; antes el primero era ${d.prev}` : ''}. Es el uso en OpenRouter, no en todo el mercado.` : null;
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
   (la de días anteriores queda como se escribió entonces). */
export function enrich(items, C, TODAY) {
  for (const e of items) {
    e.titular = titular(e, C);
    e.importancia = importancia(e);
    e.ficha = ficha(e, C);
    if (e.detected === TODAY || e.consecuencia === undefined) e.consecuencia = consecuencia(e, C);
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
  return { fecha: TODAY, noticias: hoy.map(e => e.key), ultima: prev && { key: prev.key, fecha: prev.detected, titular: prev.titular, ficha: prev.ficha }, reglas: REGLAS };
}

/* Fuente RSS 2.0 con las noticias de los últimos RSS_DIAS días, la más reciente primero. */
const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function rss(items, { NOW_ISO, TODAY }) {
  const from = new Date(Date.parse(TODAY) - RSS_DIAS * 86400e3).toISOString().slice(0, 10);
  const list = items.filter(e => e.importancia && e.detected >= from).sort((a, b) => b.detected.localeCompare(a.detected) || order(a, b));
  const when = e => new Date((e.src?.got || '').slice(0, 10) === e.detected ? e.src.got : `${e.detected}T05:00:00Z`).toUTCString();
  // Las cifras de Artificial Analysis se publican con su permiso y siempre citadas con enlace.
  const aa = e => /\bAA\b|Artificial Analysis/.test([e.titular, e.what, e.consecuencia, e.importancia.porque].join(' ')) ? 'Datos de Artificial Analysis (https://artificialanalysis.ai), publicados con su permiso.' : null;
  const body = list.map(e => `  <item>
    <title>${x(e.titular)}</title>
    <link>${x(SITE + (e.ficha || '#hoy'))}</link>
    <guid isPermaLink="false">${x(e.key)}</guid>
    <pubDate>${when(e)}</pubDate>
    <description>${x([e.what, e.consecuencia, `Está en el parte porque ${e.importancia.porque}.`, e.published ? `Publicado el ${e.published}; detectado el ${e.detected}.` : `Detectado el ${e.detected}.`, `Fuente: ${e.src?.name} (${/^#/.test(e.src?.url || '') ? SITE + e.src.url : e.src?.url}).`, aa(e)].filter(Boolean).join(' '))}</description>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>MOLOCH.SH · parte diario</title>
  <link>${SITE}#hoy</link>
  <atom:link href="${SITE}data/parte.xml" rel="self" type="application/rss+xml"/>
  <description>Las noticias de la carrera por la IA que detecta cada día el observatorio, elegidas con una regla fija. Cifras de OpenRouter, Artificial Analysis, Epoch AI, Hugging Face y METR, con su fuente.</description>
  <language>es</language>
  <lastBuildDate>${new Date(NOW_ISO).toUTCString()}</lastBuildDate>
${body}
</channel>
</rss>
`;
}
