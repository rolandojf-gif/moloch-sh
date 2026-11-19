/* Prototipo: la noticia principal del parte en grande. Tres variantes (?hero=a|b|c) para elegir; «actual» deja las tarjetas de siempre.
   Todas las cifras salen del catálogo y del propio cambio (changes.json); el nivel de relevancia sigue una regla fija y publicada. */
import { t, L } from './i18n.js';
import { esc, num, usd, ii, blended, weightsWord, fmtDate, AA_LINK } from './fmt.js';
import { logo } from './logos.js';

export const VARIANTS = ['a', 'b', 'c', 'actual'];
export function variant() {
  try { const v = new URLSearchParams(location.search).get('hero'); return VARIANTS.includes(v) ? v : 'a'; } catch { return 'a'; }
}

const scoredSorted = d => d.catalog.models.filter(m => ii(m) !== null && m.identity === 'confirmada').sort((a, b) => ii(b) - ii(a));
const r1 = x => Math.round(x * 10) / 10;

/* Datos de la noticia: el modelo, su puesto, la referencia (líder de su bloque o, si es él, el segundo) y el nivel. */
export function heroData(d, it, fichaModel) {
  const m = fichaModel(d, it.ficha);
  const inCat = m && d.byId.has(m.id) ? d.byId.get(m.id) : null;
  const rows = scoredSorted(d);
  const out = { m, model: inCat, rows, tier: it.importancia?.tier ?? 9 };
  if (inCat && ii(inCat) !== null) {
    const rank = rows.findIndex(r => r.id === inCat.id) + 1;
    const block = rows.filter(r => r.weights.v === inCat.weights.v);
    const lead = block[0];
    out.rank = rank; out.of = rows.length; out.ii = ii(inCat);
    out.price = blended(inCat);
    if (lead && lead.id !== inCat.id) out.ref = { kind: 'detras', m: lead, gap: r1(ii(lead) - ii(inCat)) };
    else if (block[1]) out.ref = { kind: 'delante', m: block[1], gap: r1(ii(inCat) - ii(block[1])) };
  }
  // Regla del nivel: alta si cambia un líder o la versión del índice, o si el modelo entra entre los tres primeros o a ≤ 5 puntos del líder de su bloque; media si entra en el top 10.
  const near = out.ref && (out.ref.kind === 'delante' || out.ref.gap <= 5);
  out.level = out.tier <= 1 || (out.rank && (out.rank <= 3 || near)) ? 'alta' : out.rank && out.rank <= 10 ? 'media' : 'normal';
  return out;
}

const levelWord = l => ({ alta: t('Relevancia alta'), media: t('Relevancia media'), normal: t('Relevancia normal') }[l]);
const blockWord = m => m.weights.v === 'abiertos' ? t('del mejor abierto') : t('del mejor cerrado');

function figs(h) {
  if (!h.rank) return '';
  const cells = [
    [t('Puesto en el índice AA'), `#${h.rank}`, t('de {n}', { n: h.of })],
    [t('Índice AA'), num(h.ii), ''],
    h.ref ? (h.ref.kind === 'detras'
      ? [t('Distancia al líder'), `−${num(h.ref.gap)}`, t('pts {block} ({name})', { block: blockWord(h.model), name: esc(h.ref.m.name) })]
      : [t('Ventaja'), `+${num(h.ref.gap)}`, t('pts sobre {name}', { name: esc(h.ref.m.name) })]) : null,
    h.price !== null && h.price !== undefined ? [t('Precio combinado'), usd(h.price), t('por millón de tokens')] : [t('Precio combinado'), '—', t('sin API pública')]
  ].filter(Boolean);
  return `<dl class="hero-figs">${cells.map(([k, v, s]) => `<div><dt>${k}</dt><dd><b>${v}</b>${s ? `<small>${s}</small>` : ''}</dd></div>`).join('')}</dl>`;
}

const lvlWhy = h => h.rank ? t('Puesto {r} de {n}{gap}.', { r: h.rank, n: h.of, gap: h.ref?.kind === 'detras' ? t(', a {g} pts del líder de su bloque', { g: num(h.ref.gap) }) : h.ref ? t(', líder de su bloque') : '' }) : '';

/* Regla: todos los modelos con índice en una línea; el de la noticia, grande; el líder de su bloque, rotulado. */
function regla(h) {
  if (!h.rank) return '';
  const vals = h.rows.map(ii), max = vals[0], min = vals[vals.length - 1];
  const x = v => ((v - min) / ((max - min) || 1) * 100).toFixed(2);
  const ticks = h.rows.filter(r => r.id !== h.model.id).map(r => `<span class="rg-t ${r.weights.v === 'abiertos' ? 'open' : 'closed'}" style="left:${x(ii(r))}%" title="${esc(`${r.name}: ${num(ii(r))}`)}"></span>`).join('');
  const lead = h.ref?.kind === 'detras' ? h.ref.m : null;
  const gap = lead ? `<span class="rg-gap" style="left:${x(h.ii)}%;width:${(x(ii(lead)) - x(h.ii)).toFixed(2)}%"><i>${num(h.ref.gap)} pts</i></span>` : '';
  return `<div class="regla" role="img" aria-label="${esc(t('{name}: puesto {r} de {n} en el índice AA', { name: h.model.name, r: h.rank, n: h.of }))}">
    <div class="rg-track">${ticks}${gap}<span class="rg-m" style="left:${x(h.ii)}%">${logo(h.model, true)}<b>${num(h.ii)}</b></span></div>
    <div class="rg-axis"><span>${num(min)}</span><span>${t('Índice AA de los {n} modelos con puntuación · verde abiertos, naranja cerrados', { n: h.of })}</span><span>${num(max)} · ${esc(h.rows[0].name)}</span></div>
  </div>`;
}

/* Clasificación alrededor del puesto: los cinco primeros o, si entra más abajo, el primero y dos por encima y por debajo. */
function clasif(h) {
  if (!h.rank) return '';
  const i = h.rank - 1;
  const idx = h.rank <= 4 ? [0, 1, 2, 3, 4] : [0, null, i - 2, i - 1, i, i + 1, i + 2];
  const max = ii(h.rows[0]), min = Math.min(...idx.filter(j => j !== null && h.rows[j]).map(j => ii(h.rows[j]))) - 3;
  return `<div class="clasif"><div class="cl-h">${t('Dónde entra en el índice AA')}</div><ol>${idx.map(j => j === null ? '<li class="gap" aria-hidden="true">⋯</li>' : h.rows[j] ? (() => {
    const r = h.rows[j], me = r.id === h.model.id;
    return `<li class="${me ? 'me' : ''} ${r.weights.v === 'abiertos' ? 'open' : 'closed'}"><span class="cl-p">${j + 1}</span>${logo(r)}<span class="cl-n">${esc(r.name)}${me ? ` <span class="tag k-nuevo">${t('Noticia')}</span>` : ''}</span><span class="cl-b"><i style="width:${((ii(r) - min) / (max - min) * 100).toFixed(1)}%"></i></span><span class="cl-v">${num(ii(r))}</span></li>`;
  })() : '').join('')}</ol></div>`;
}

export function renderHero(d, it, { kind, toFicha, foot, cap, fichaModel }) {
  const v = variant();
  const h = heroData(d, it, fichaModel);
  const tit = L(it, 'titular') || L(it, 'what');
  const texts = [L(it, 'titular'), L(it, 'what'), L(it, 'consecuencia'), L(it, 'porque', it.importancia?.porque)];
  const top = `<div class="hero-top"><span class="tag k-${esc(it.kind)}">${esc(kind(it.kind))}</span><span class="hero-lvl lvl-${h.level}" title="${esc(lvlWhy(h))}">${levelWord(h.level)}</span><span class="hero-date">${esc(fmtDate(it.detected || it.date))}</span></div>`;
  const head = `<div class="hero-main">${h.m ? `<span class="hero-logo">${logo(h.m, true)}</span>` : ''}<h2>${toFicha(it.ficha, tit)}</h2></div>`;
  const ocurrio = `<p><span class="lbl">${t('Qué ocurrió')}</span>${esc(L(it, 'what'))}</p>`;
  const cambia = it.consecuencia ? `<p><span class="lbl">${t('Qué cambia')}</span>${esc(L(it, 'consecuencia'))}</p>` : '';
  const porque = `<p><span class="lbl">${t('Por qué es noticia')}</span>${esc(cap(L(it, 'porque', it.importancia?.porque)))}.</p>`;
  const credit = h.rank ? `<p class="hero-cred">${t('Puesto, índice y distancia: {AA_LINK}, publicado con su permiso. Precio: OpenRouter.', { AA_LINK })}</p>` : '';
  if (v === 'b') return `<article class="hero hero-b lvl-${h.level}">${top}${head}${regla(h)}${figs(h)}<div class="hero-txt">${cambia || ocurrio}${porque}</div>${credit}${foot(it, texts)}</article>`;
  if (v === 'c') return `<article class="hero hero-c lvl-${h.level}"><div class="hc-l">${top}${head}<div class="hero-txt">${ocurrio}${cambia}${porque}</div>${foot(it, texts)}</div><div class="hc-r">${clasif(h)}${credit}</div></article>`;
  return `<article class="hero hero-a lvl-${h.level}">${top}${head}${figs(h)}<div class="hero-txt">${ocurrio}${cambia}${porque}</div>${credit}${foot(it, texts)}</article>`;
}

/* Barra del prototipo para cambiar de variante sin tocar la URL a mano. Se quita al elegir. */
export function switcher() {
  const v = variant();
  const names = { a: t('A · Portada'), b: t('B · Banda con regla'), c: t('C · Clasificación'), actual: t('Actual') };
  return `<nav class="hero-proto" aria-label="${t('Variantes del prototipo')}"><span>${t('Prototipo')}</span>${VARIANTS.map(k => `<a href="?hero=${k}#hoy"${k === v ? ' aria-current="true"' : ''}>${names[k]}</a>`).join('')}</nav>`;
}
