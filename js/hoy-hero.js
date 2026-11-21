/* La noticia principal del parte, a todo el ancho: titular grande, logo y cifras clave (ECI, puesto, índice AA, distancia, precio).
   Todas las cifras salen del catálogo, indicadores y del propio cambio (changes.json); el nivel de relevancia sigue una regla fija. */
import { t, L } from './i18n.js';
import { esc, num, usd, ii, priceBasis, weightsWord, fmtDate, AA_LINK } from './fmt.js';
import { logo, logoFor } from './logos.js';

const scoredSorted = d => d.catalog.models.filter(m => ii(m) !== null && m.identity === 'confirmada').sort((a, b) => ii(b) - ii(a));
const r1 = x => Math.round(x * 10) / 10;
const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function findByName(d, name) {
  if (!name) return null;
  const k = normName(name);
  return d.catalog.models.find(m => normName(m.name) === k || (m.epoch?.name && normName(m.epoch.name) === k)) || null;
}

/* Resuelve el modelo protagonista de cualquier cambio: directo si apunta a #modelos/<id>, o por nombre en indicadores de frontera. */
export function eventModel(d, it, fichaModel) {
  const direct = fichaModel(d, it.ficha);
  if (direct) return direct;
  const ind = it.data?.ind;
  if (ind === 'eci') {
    const f = d.ind?.ind?.eci?.frontier;
    const nm = f?.model || /\(([^()]+)\)\.?$/.exec(it.what || '')?.[1] || null;
    const hit = findByName(d, nm);
    if (hit) return hit;
    if (nm) return { id: '', name: nm, lab: { id: '', name: f?.org || '' } };
  }
  if (ind === 'mirror') {
    const f = d.ind?.ind?.bench?.mirror;
    const hit = findByName(d, f?.model);
    if (hit) return hit;
    if (f?.model) return { id: '', name: f.model, lab: { id: '', name: f.org || '' } };
  }
  if (ind === 'labs' || ind === 'usCn' || ind === 'closedOpen') {
    const g = ind === 'labs' ? d.ind?.ind?.eci?.gapLabs : ind === 'usCn' ? d.ind?.ind?.eci?.gapUsCn : d.ind?.ind?.eci?.gapClosedOpen;
    const lead = g?.first || g?.a || g?.us || g?.closed;
    if (lead?.model) return findByName(d, lead.model) || { id: '', name: lead.model, lab: { id: '', name: lead.org || '' } };
  }
  if (ind === 'aaLabs' || ind === 'aaUsCn' || ind === 'aaClosedOpen') {
    const g = ind === 'aaLabs' ? d.ind?.ind?.aa?.gapLabs : ind === 'aaUsCn' ? d.ind?.ind?.aa?.gapUsCn : d.ind?.ind?.aa?.gapClosedOpen;
    const lead = g?.first || g?.a || g?.us || g?.closed;
    if (lead?.id && d.byId.has(lead.id)) return d.byId.get(lead.id);
    if (lead?.model) return findByName(d, lead.model) || { id: '', name: lead.model, lab: { id: '', name: lead.org || '' } };
  }
  return null;
}

export function modelLogo(m, big = false) {
  if (!m) return '';
  if (m.id) return logo(m, big);
  const url = logoFor({ name: m.name, org: m.lab?.name || '' });
  if (!url) return '';
  return `<span class="logo${big ? ' big' : ''}" title="${esc(m.lab?.name || m.name)}"><img src="${url}" alt="" width="20" height="20" loading="lazy" decoding="async"></span>`;
}

/* Datos de la noticia: el modelo, su puesto, la referencia (líder de su bloque o, si es él, el segundo), datos ECI y el nivel. */
export function heroData(d, it, fichaModel) {
  const m = eventModel(d, it, fichaModel);
  const inCat = m && m.id && d.byId.has(m.id) ? d.byId.get(m.id) : null;
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
  if (it.kind === 'indicador' && it.data?.ind === 'eci') {
    const ef = d.ind?.ind?.eci?.frontier;
    const gl = d.ind?.ind?.eci?.gapLabs, gco = d.ind?.ind?.eci?.gapClosedOpen;
    const v = it.data?.to ?? ef?.v ?? null;
    const ci = gl?.first?.ci || gco?.closed?.ci || null;
    let rival = null;
    const first = gl?.first || gl?.a, second = gl?.second || gl?.b;
    if (gl?.v != null && second?.model && (!ef?.model || normName(first?.model) === normName(ef.model))) {
      rival = { gap: r1(gl.v), name: second.model, org: second.org, overlap: !!gl.overlap };
    } else if (gco?.v != null && gco.open?.model) {
      rival = { gap: r1(gco.v), name: gco.open.model, org: gco.open.org, overlap: false };
    }
    if (v !== null) out.eci = { v: r1(v), ci: ci ? [r1(ci[0]), r1(ci[1])] : null, org: ef?.org || inCat?.lab?.name || '', rival };
  }
  // Regla del nivel: alta si cambia un líder (AA o ECI/frontera) o la versión del índice, o si el modelo entra en el top 3 o a ≤ 5 pts del líder de su bloque; media si entra en el top 10 o es indicador de La carrera.
  const isFrontierInd = it.kind === 'indicador' && ['eci', 'mirror', 'metr'].includes(it.data?.ind);
  const near = out.ref && (out.ref.kind === 'delante' || out.ref.gap <= 5);
  out.level = out.tier <= 1 || isFrontierInd || (out.rank && (out.rank <= 3 || near)) ? 'alta'
    : (out.rank && out.rank <= 10) || it.kind === 'indicador' ? 'media' : 'normal';
  return out;
}

const levelWord = l => ({ alta: t('Relevancia alta'), media: t('Relevancia media'), normal: t('Relevancia normal') }[l]);
const blockWord = m => m.weights.v === 'abiertos' ? t('del mejor abierto') : t('del mejor cerrado');

function figs(h, it) {
  if (h.eci) {
    const cells = [
      [t('ECI (Epoch AI)'), num(h.eci.v), h.eci.ci ? t('nº 1 · intervalo {lo}–{hi}', { lo: num(h.eci.ci[0]), hi: num(h.eci.ci[1]) }) : t('nº 1 en Epoch AI')],
      h.rank ? [t('Puesto en el índice AA'), `#${h.rank}`, t('{pts} pts · de {n}', { pts: num(h.ii), n: h.of })] : (h.eci.org ? [t('Laboratorio'), esc(h.eci.org), ''] : null),
      h.eci.rival ? [t('Ventaja en ECI'), `+${num(h.eci.rival.gap)}`, h.eci.rival.overlap ? t('pts sobre {name} (empate técnico)', { name: esc(h.eci.rival.name) }) : t('pts sobre {name}', { name: esc(h.eci.rival.name) })]
        : h.ref ? [t('Ventaja'), `+${num(h.ref.gap)}`, t('pts sobre {name}', { name: esc(h.ref.m.name) })] : null,
      h.price ? [t('Precio por millón de tokens'), `<span>${usd(h.price.in)}</span><span class="sep">/</span><span>${usd(h.price.out)}</span>`, `${t('entrada / salida')}${h.price.basis ? ` · ${esc(h.price.basis)}` : ''}`, 'price']
        : h.model ? [t('Precio por millón de tokens'), '—', t('sin API pública')] : null
    ].filter(Boolean);
    return `<dl class="hero-figs">${cells.map(([k, v, s, cls]) => `<div${cls ? ` class="${cls}"` : ''}><dt>${k}</dt><dd><b>${v}</b>${s ? `<small>${s}</small>` : ''}</dd></div>`).join('')}</dl>`;
  }
  if (h.rank) {
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
  if (it.kind === 'indicador' && it.data?.from != null && it.data?.to != null) {
    const diff = r1(it.data.to - it.data.from);
    const unit = it.mag?.unit ? ` ${esc(it.mag.unit)}` : '';
    const cells = [
      [t('Valor actual'), `${num(it.data.to)}${unit}`, ''],
      [t('Valor anterior'), `${num(it.data.from)}${unit}`, ''],
      [t('Cambio'), `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${num(Math.abs(diff))}${unit}`, it.mag?.pct != null ? `${it.mag.pct > 0 ? '+' : ''}${num(it.mag.pct)} %` : '']
    ];
    return `<dl class="hero-figs hero-figs-3">${cells.map(([k, v, s]) => `<div><dt>${k}</dt><dd><b>${v}</b>${s ? `<small>${s}</small>` : ''}</dd></div>`).join('')}</dl>`;
  }
  return '';
}

const lvlWhy = (h, it) => h.eci
  ? t('Cambia el mejor modelo del mundo en el ECI de Epoch AI.')
  : h.rank ? t('Puesto {r} de {n}{gap}.', { r: h.rank, n: h.of, gap: h.ref?.kind === 'detras' ? t(', a {g} pts del líder de su bloque', { g: num(h.ref.gap) }) : h.ref ? t(', líder de su bloque') : '' })
  : capStr(L(it, 'porque', it.importancia?.porque));
const capStr = s => s ? s[0].toUpperCase() + s.slice(1) : '';

export function renderHero(d, it, { kind, toFicha, foot, cap, fichaModel }) {
  const h = heroData(d, it, fichaModel);
  const tit = L(it, 'titular') || L(it, 'what');
  const texts = [L(it, 'titular'), L(it, 'what'), L(it, 'consecuencia'), L(it, 'porque', it.importancia?.porque)];
  const labPill = h.model?.lab?.name ? `<span class="hero-meta-pill">${esc(h.model.lab.name)}</span>` : h.m?.lab?.name ? `<span class="hero-meta-pill">${esc(h.m.lab.name)}</span>` : '';
  const wPill = h.model?.weights?.v ? `<span class="w ${esc(h.model.weights.v)}">${esc(weightsWord(h.model.weights.v))}</span>` : '';
  const top = `<div class="hero-top"><span class="tag k-${esc(it.kind)}">${esc(kind(it.kind))}</span><span class="hero-lvl lvl-${h.level}" title="${esc(lvlWhy(h, it))}">${levelWord(h.level)}</span>${labPill}${wPill}<span class="hero-date">${esc(fmtDate(it.detected || it.date))}</span></div>`;
  const logoHtml = modelLogo(h.m, true);
  const primaryHref = h.model && it.ficha === '#carrera' ? `#modelos/${h.model.id}` : it.ficha;
  const head = `<div class="hero-main">${logoHtml ? `<span class="hero-logo">${logoHtml}</span>` : ''}<h2>${toFicha(primaryHref, tit)}</h2></div>`;
  const ocurrio = `<p><span class="lbl">${t('Qué ocurrió')}</span>${esc(L(it, 'what'))}</p>`;
  const cambia = it.consecuencia ? `<p><span class="lbl">${t('Qué cambia')}</span>${esc(L(it, 'consecuencia'))}</p>` : '';
  const porque = `<p><span class="lbl">${t('Por qué es noticia')}</span>${esc(cap(L(it, 'porque', it.importancia?.porque)))}.</p>`;
  const acts = [];
  if (h.model) acts.push(`<a class="hero-cta primary" href="#modelos/${esc(h.model.id)}">${t('Abrir ficha de {name} →', { name: esc(h.model.name) })}</a>`);
  if (it.ficha && (!h.model || it.ficha !== `#modelos/${h.model.id}`)) {
    acts.push(`<a class="hero-cta" href="${esc(it.ficha)}">${/^#carrera/.test(it.ficha) ? t('Ver en La carrera →') : /^#ai2027/.test(it.ficha) ? t('Ver en AI 2027 →') : t('Ver detalle →')}</a>`);
  }
  const actsHtml = acts.length ? `<div class="hero-acts">${acts.join('')}</div>` : '';
  const credit = h.eci
    ? `<p class="hero-cred">${t('ECI: Epoch AI (CC BY 4.0).')}${h.rank ? ` ${t('Puesto, índice y distancia: {AA_LINK}, publicado con su permiso. Precio: OpenRouter.', { AA_LINK })}` : ''}</p>`
    : h.rank ? `<p class="hero-cred">${t('Puesto, índice y distancia: {AA_LINK}, publicado con su permiso. Precio: OpenRouter.', { AA_LINK })}</p>` : '';
  return `<article class="hero lvl-${h.level}">${top}${head}${figs(h, it)}<div class="hero-txt">${ocurrio}${cambia}${porque}</div>${actsHtml}${credit}${foot(it, texts)}</article>`;
}
