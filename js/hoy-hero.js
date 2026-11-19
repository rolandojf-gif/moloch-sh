/* La noticia principal del parte, a todo el ancho: titular grande, logo y cuatro cifras (puesto, índice AA, distancia, precio).
   Todas las cifras salen del catálogo y del propio cambio (changes.json); el nivel de relevancia sigue una regla fija. */
import { t, L } from './i18n.js';
import { esc, num, usd, ii, priceBasis, fmtDate, AA_LINK } from './fmt.js';
import { logo } from './logos.js';

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
    const pi = inCat.price?.in?.v, po = inCat.price?.out?.v;
    out.price = pi !== null && pi !== undefined && po !== null && po !== undefined ? { in: pi, out: po, basis: priceBasis(inCat) } : null;
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
    h.price ? [t('Precio por millón de tokens'), `<span>${usd(h.price.in)}</span><span class="sep">/</span><span>${usd(h.price.out)}</span>`, `${t('entrada / salida')}${h.price.basis ? ` · ${esc(h.price.basis)}` : ''}`, 'price'] : [t('Precio por millón de tokens'), '—', t('sin API pública')]
  ].filter(Boolean);
  return `<dl class="hero-figs">${cells.map(([k, v, s, cls]) => `<div${cls ? ` class="${cls}"` : ''}><dt>${k}</dt><dd><b>${v}</b>${s ? `<small>${s}</small>` : ''}</dd></div>`).join('')}</dl>`;
}

const lvlWhy = h => h.rank ? t('Puesto {r} de {n}{gap}.', { r: h.rank, n: h.of, gap: h.ref?.kind === 'detras' ? t(', a {g} pts del líder de su bloque', { g: num(h.ref.gap) }) : h.ref ? t(', líder de su bloque') : '' }) : '';

export function renderHero(d, it, { kind, toFicha, foot, cap, fichaModel }) {
  const h = heroData(d, it, fichaModel);
  const tit = L(it, 'titular') || L(it, 'what');
  const texts = [L(it, 'titular'), L(it, 'what'), L(it, 'consecuencia'), L(it, 'porque', it.importancia?.porque)];
  const top = `<div class="hero-top"><span class="tag k-${esc(it.kind)}">${esc(kind(it.kind))}</span><span class="hero-lvl lvl-${h.level}" title="${esc(lvlWhy(h))}">${levelWord(h.level)}</span><span class="hero-date">${esc(fmtDate(it.detected || it.date))}</span></div>`;
  const head = `<div class="hero-main">${h.m ? `<span class="hero-logo">${logo(h.m, true)}</span>` : ''}<h2>${toFicha(it.ficha, tit)}</h2></div>`;
  const ocurrio = `<p><span class="lbl">${t('Qué ocurrió')}</span>${esc(L(it, 'what'))}</p>`;
  const cambia = it.consecuencia ? `<p><span class="lbl">${t('Qué cambia')}</span>${esc(L(it, 'consecuencia'))}</p>` : '';
  const porque = `<p><span class="lbl">${t('Por qué es noticia')}</span>${esc(cap(L(it, 'porque', it.importancia?.porque)))}.</p>`;
  const credit = h.rank ? `<p class="hero-cred">${t('Puesto, índice y distancia: {AA_LINK}, publicado con su permiso. Precio: OpenRouter.', { AA_LINK })}</p>` : '';
  return `<article class="hero lvl-${h.level}">${top}${head}${figs(h)}<div class="hero-txt">${ocurrio}${cambia}${porque}</div>${credit}${foot(it, texts)}</article>`;
}

