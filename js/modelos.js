/* Vista «Modelos»: comparador, ficha desplegable (con su posición frente a otros modelos), comparación de hasta tres y
   evolución de la frontera. */
import { t, tn, tr, L } from './i18n.js';
import { esc, fact, src, weightsTag, usd, num, tokens, fmtDate, country, ord, weightsWord, blended, ii, coding, agentic, eci, swe, aaConfig, aaConfigShort, aaIndexName, aaRace, aaCoverage, coverageText, speed, priceBasis, nd, AA_LINK } from './fmt.js';
import { frontier, hbars, tip } from './charts.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { w: 'all', sort: 'ii', dir: -1, q: '', open: new Set(), cmp: [], all: false };
/* Sentido por defecto de cada criterio: el precio, de más barato a más caro; el resto, de mayor a menor. */
const DIR0 = { ii: -1, eci: -1, tps: -1, price: 1, date: -1 };
const PAGE = 40;
let D;

const yesNo = v => v === true ? t('sí') : v === false ? t('no') : null;
const weightsBadge = m => `${weightsTag(m)}${src(m.weights)}`;

function sortKey(m) {
  switch (state.sort) {
    case 'ii': return ii(m);
    case 'eci': return eci(m);
    case 'price': return freeOnly(m) ? null : blended(m);
    case 'tps': return speed(m)?.tps ?? null;
    case 'date': return m.orCreated.v ? new Date(m.orCreated.v).getTime() : null;
  }
  return null;
}

function rows() {
  const q = state.q.trim().toLowerCase();
  return D.catalog.models
    .filter(m => state.w === 'all' || m.weights.v === state.w)
    .filter(m => !q || `${m.name} ${m.lab.name} ${m.id}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const ka = sortKey(a), kb = sortKey(b);
      if (ka === null && kb === null) return a.name.localeCompare(b.name);
      if (ka === null) return 1;
      if (kb === null) return -1;
      return state.dir * (ka - kb);
    });
}

/* Modelos que OpenRouter sólo ofrece como variante gratuita: su «0 $» no es un precio. */
const freeOnly = m => !!m.orVariant && /:free$/.test(m.orVariant) && !m.price.in.v && !m.price.out.v;

function speedCell(m) {
  const s = speed(m);
  if (!s) return nd();
  const lat = s.lat !== null && s.lat !== undefined ? `${num(s.lat, 2)} s` : t('sin datos');
  return `<span class="big">${num(s.tps, 0)}</span> ${t('tok/s{src}', { src: src(s.f) })}<span class="m-sub">${s.aa ? t('respuesta en') : t('primer token en')} ${lat}</span><span class="m-sub" title="${esc(s.provider)}">${esc(s.short)}</span>`;
}

/* «Frente a otros modelos»: dónde queda el modelo en la carrera frente a tres referencias del catálogo. Describe su
   posición, no recomienda. Índice parecido: ±PARECIDO puntos de AA, el mismo criterio que el parte de Hoy. */
const PARECIDO = 2;
const signed = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), d)}`;
/* Latencia: la de speed(), hasta la respuesta según AA o, sin AA, hasta el primer token del proveedor más rápido. */
function latOf(m) {
  const s = speed(m);
  if (!s || s.lat === null || s.lat === undefined) return null;
  return { v: s.lat, aa: s.aa, how: s.aa ? (s.cfg ? ` ${t('con la configuración {cfg}', { cfg: s.cfg })}` : '') : ` ${t('(primer token, en {provider})', { provider: s.provider })}` };
}
function race(m) {
  const me = ii(m);
  if (me === null) return `<div class="race"><h4>${t('Frente a otros modelos del catálogo')}</h4><p class="note">${t('Sin índice de Artificial Analysis: no se puede situar frente a los demás en la misma escala.')}</p></div>`;
  const scored = D.catalog.models.filter(x => ii(x) !== null && x.identity === 'confirmada');
  const all = scored.slice().sort((a, b) => ii(b) - ii(a));
  const block = m.weights.v === 'abiertos' || m.weights.v === 'cerrados' ? all.filter(x => x.weights.v === m.weights.v) : [];
  const rank = all.findIndex(x => x.id === m.id) + 1, rankB = block.findIndex(x => x.id === m.id) + 1;
  const near = scored.filter(x => x.id !== m.id && Math.abs(ii(x) - me) <= PARECIDO);
  const price = x => !freeOnly(x) && blended(x) > 0 ? blended(x) : null;
  const myLat = latOf(m);
  // Cada referencia es otro modelo o, si este mismo ya es el mejor en ese criterio, una frase que lo dice.
  const refs = [];
  const bestOpen = all.find(x => x.weights.v === 'abiertos');
  if (bestOpen) refs.push(bestOpen.id === m.id ? { k: t('Mejor modelo abierto'), t: t('Es este: el de mayor índice de AA entre los abiertos.') } : { k: t('Mejor modelo abierto'), x: bestOpen });
  const kCheap = t('El más barato con un índice parecido (±{PARECIDO})', { PARECIDO }), kFast = t('El que antes empieza a responder con un índice parecido (±{PARECIDO})', { PARECIDO });
  const priced = near.filter(x => price(x) !== null);
  const cheap = priced.sort((a, b) => price(a) - price(b))[0];
  if (cheap) refs.push(price(m) !== null && price(m) <= price(cheap) ? { k: kCheap, t: t('Es este: ninguno de los {length} con un índice parecido y precio cuesta menos.', { length: priced.length }) } : { k: kCheap, x: cheap });
  const timed = myLat ? near.filter(x => latOf(x) && latOf(x).aa === myLat.aa) : [];
  const fast = timed.sort((a, b) => latOf(a).v - latOf(b).v)[0];
  if (fast) refs.push(myLat.v <= latOf(fast).v ? { k: kFast, t: t('Es este: ninguno de los {length} con un índice parecido y latencia de la misma fuente responde antes.', { length: timed.length }) } : { k: kFast, x: fast });
  const rel = (pa, pb) => pb === pa ? t('el mismo') : pb < pa ? t('un {num} % más barato', { num: num((1 - pb / pa) * 100, 0) }) : pb / pa < 2 ? t('un {num} % más caro', { num: num((pb / pa - 1) * 100, 0) }) : t('{num} veces su precio', { num: num(pb / pa, 1) });
  const dist = x => {
    const bits = [t('índice AA {num} ({signed} puntos)', { num: num(ii(x)), signed: signed(Math.round((ii(x) - me) * 10) / 10) })];
    const pa = price(m), pb = price(x);
    if (pb !== null) bits.push(t('precio combinado {usd} / M{rel}', { usd: usd(pb), rel: pa !== null ? ` (${rel(pa, pb)})` : '' }));
    const lx = latOf(x);
    if (lx && myLat && lx.aa === myLat.aa) bits.push(t('hasta la respuesta {num} s{how} ({signed} s)', { num: num(lx.v, 2), how: esc(lx.how), signed: signed(lx.v - myLat.v, 2) }));
    return bits.join(' · ');
  };
  const cmp = [m, ...new Map(refs.filter(r => r.x).map(r => [r.x.id, r.x])).values()].slice(0, 3);
  return `<div class="race"><h4>${t('Frente a otros modelos del catálogo')}</h4>
    <p>${t('Puesto')} <b>${rank}</b> ${t('de {length} en el {aaIndexName}{p3}. {p4}', { length: all.length, aaIndexName: esc(aaIndexName(D.catalog.aaIndexVersion)), p3: rankB ? (m.weights.v === 'abiertos' ? t('; {rank} de {length} entre los abiertos', { rank: ord(rankB), length: block.length }) : t('; {rank} de {length} entre los cerrados', { rank: ord(rankB), length: block.length })) : '', p4: myLat ? t('Tarda {num} s en empezar a responder{how}.', { num: num(myLat.v, 2), how: esc(myLat.how) }) : t('Sin dato de latencia.') })}</p>
    ${refs.length ? `<ul>${refs.map(r => `<li><span class="k">${esc(r.k)}</span>${r.x ? `<a href="#modelos/${esc(r.x.id)}">${esc(r.x.name)}</a> <span class="m-lab">${esc(r.x.lab.name)} · ${esc(weightsWord(r.x.weights.v))}</span><span class="d">${dist(r.x)}</span>` : esc(r.t)}</li>`).join('')}</ul>` : ''}
    ${cmp.length > 1 ? `<p class="m-link"><a href="#modelos/comparar/${cmp.map(x => esc(x.id)).join(',')}">${cmp.length > 2 ? t('Comparar con ellos') : t('Comparar con él')}</a></p>` : ''}
    <p class="note">${t('Describe dónde queda este modelo en la carrera, no es una recomendación. Entre paréntesis, la diferencia con este modelo. Latencia: segundos hasta el primer token de la respuesta según AA, con la configuración que obtiene el índice e incluido el tiempo de pensar; por eso unos modelos tardan minutos y otros segundos en llegar a un índice parecido. Si AA no la mide, el primer token del proveedor más rápido de OpenRouter; sólo se comparan latencias de la misma fuente.')}</p>
  </div>`;
}

function detail(m) {
  const eps = (m.endpoints || []);
  const aa = m.aa;
  const lic = m.license.v ? esc(tr(m.license.v)) + src(m.license) : nd() + src(m.license);
  const dl = [
    [t('Laboratorio'), `${esc(m.lab.name)} · ${esc(country(m.lab.country))} <a class="src" href="${esc(m.lab.url)}" target="_blank" rel="noopener" title="${t('Sede del laboratorio, dato curado')}">CUR</a>`],
    [t('Identidad'), m.identity === 'confirmada' ? t('confirmada') : t('sin confirmar: modelo anónimo')],
    [t('Pesos'), weightsBadge(m) + (m.weights.note ? `<span class="m-sub">${esc(tr(m.weights.note))}</span>` : '') + (m.hfId ? `<span class="m-sub"><a href="https://huggingface.co/${esc(m.hfId)}" target="_blank" rel="noopener">${esc(m.hfId)}</a></span>` : '')],
    [t('Licencia'), lic],
    [t('Contexto'), fact(m.ctx, v => tokens(v) + ' tokens')],
    [t('Razonamiento'), fact(m.reasoning, yesNo)],
    [t('Caché (lectura)'), m.price.cacheRead.v !== null ? usd(m.price.cacheRead.v) + ' / M' + src(m.price.cacheRead) : nd() + src(m.price.cacheRead)],
    [t('Precio combinado 3:1'), freeOnly(m) ? t('gratis: solo variante {p1}, sin precio de pago todavía', { p1: esc(m.orVariant.slice(m.orVariant.lastIndexOf(':'))) }) : blended(m) !== null ? usd(blended(m)) + ' / M' + src(m.price.in) + (priceBasis(m) ? `<span class="m-sub">${esc(priceBasis(m))}</span>` : '') : nd()],
    [t('Alta en OpenRouter'), fact(m.orCreated, v => fmtDate(v))],
    [t('Repositorio de pesos'), m.hfCreated ? fact(m.hfCreated, v => fmtDate(v)) : nd()],
    [t('Inteligencia (Artificial Analysis)'), aa ? `${fact(aa.intelligence, v => num(v))}<span class="m-sub">${t('{aaIndexName} · como', { aaIndexName: esc(aaIndexName(aa.version)) })} <a href="${esc(aa.url)}" target="_blank" rel="noopener">«${esc(aa.name)}»</a> ${t('en AA{how}', { how: aa.how && aa.how !== 'nombre exacto' ? ` (${esc(tr(aa.how))})` : '' })}</span>` : t('sin puntuación en Artificial Analysis todavía')],
    [t('Programación (AA)'), aa ? fact(aa.coding, v => num(v)) + '<span class="m-sub">Artificial Analysis Coding Index</span>' : nd()],
    [t('Agentes (AA)'), aa ? fact(aa.agentic, v => num(v)) + '<span class="m-sub">Artificial Analysis Agentic Index</span>' : nd()],
    [t('Fecha del modelo (AA)'), aa ? fact(aa.release, v => fmtDate(v)) : nd()],
    [t('Capacidad (ECI)'), m.epoch ? `${fact(m.epoch.eci, v => num(v))}<span class="m-sub">${t('intervalo {lo}–{hi} · como «{name}» en Epoch{how}', { lo: num(m.epoch.eci.ci?.[0]), hi: num(m.epoch.eci.ci?.[1]), name: esc(m.epoch.name), how: m.epoch.how && m.epoch.how !== 'nombre' ? ` (${esc(tr(m.epoch.how))})` : '' })}</span>` : t('sin puntuación en Epoch AI todavía')],
    [t('Fecha del modelo (Epoch)'), m.epoch ? fact(m.epoch.release, v => fmtDate(v)) : nd()],
    [t('Acceso según Epoch'), m.epoch ? fact(m.epoch.access) : nd()],
    [t('SWE-bench Verified'), m.epoch ? fact(m.epoch.swe, v => num(v) + ' %') + (m.epoch.swe.note ? `<span class="m-sub">${esc(tr(m.epoch.swe.note))}</span>` : '') : nd()]
  ];
  const sd = t('sin datos');
  const provTable = eps.length ? `
    <table class="subt"><caption class="sr-only">${t('Proveedores en OpenRouter')}</caption>
      <thead><tr><th>${t('Proveedor (OpenRouter)')}</th><th>${t('Cuantización')}</th><th class="num">${t('Entrada')}</th><th class="num">${t('Salida')}</th><th class="num">${t('Contexto')}</th><th class="num">${t('tok/s p50')}</th><th class="num">${t('Primer token p50')}</th><th class="num">${t('Disponibilidad 30 min')}</th></tr></thead>
      <tbody>${eps.map(e => `<tr>
        <td>${esc(e.provider || '—')}</td><td>${esc(e.quant || sd)}</td>
        <td class="num">${e.in !== null ? usd(e.in) : sd}</td><td class="num">${e.out !== null ? usd(e.out) : sd}</td>
        <td class="num">${e.ctx ? tokens(e.ctx) : sd}</td>
        <td class="num">${e.tps ? num(e.tps, 0) : sd}</td><td class="num">${e.ttft !== null && e.ttft !== undefined ? num(e.ttft, 2) + ' s' : sd}</td>
        <td class="num">${e.uptime !== null && e.uptime !== undefined ? num(e.uptime, 1) + ' %' : sd}</td></tr>`).join('')}</tbody>
    </table>
    <div class="prov">${t('Proveedores: {src} {consulta}. Velocidad y espera dependen de quién sirve el modelo.', { src: src(m.endpointsMeta), consulta: m.endpointsMeta ? t('consulta {fecha}', { fecha: esc(m.endpointsMeta.got.slice(0, 10)) }) : '' })}</div>` : `<p class="note">${t('Sin datos de proveedores.')}</p>`;
  return `<p class="m-link"><a href="#modelos/${esc(m.id)}" title="${t('Dirección propia de esta ficha, para volver a ella o compartirla')}">${t('Enlace a esta ficha')}</a></p><dl class="dgrid">${dl.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${race(m)}${provTable}`;
}

function syncHeads() {
  for (const b of $$('[data-sort]')) {
    const on = b.dataset.sort === state.sort;
    b.setAttribute('aria-sort', on ? (state.dir < 0 ? 'descending' : 'ascending') : 'none');
    b.querySelector('.arr').textContent = on ? (state.dir < 0 ? '▼' : '▲') : '↕';
    b.title = on ? (state.dir < 0 ? t('De mayor a menor; pulsa para invertir') : t('De menor a mayor; pulsa para invertir')) : t('Ordenar por esta columna');
  }
}

function renderTable() {
  syncHeads();
  const list = rows();
  $('#mx-caption').innerHTML = t('{n} modelos{page} · precios en USD por millón de tokens (OpenRouter) · inteligencia: {idx}, configuración de mayor índice, datos de {AA_LINK} · ECI: Epoch Capabilities Index (Epoch AI, CC BY 4.0); las dos escalas no son comparables · pulsa una fila para ver contexto, licencia, caché, programación, agentes y proveedores.',
    { n: list.length, page: !state.all && !state.q && list.length > PAGE ? ` ${t('(se muestran {PAGE})', { PAGE })}` : '', idx: esc(aaIndexName(D.catalog.aaIndexVersion)), AA_LINK });
  const ex = D.catalog.excluded || [];
  const TIPO = { imagen: t('de imagen'), audio: t('de audio'), enrutador: t('enrutadores'), seguridad: t('clasificadores de seguridad') };
  const TIPO_H = { imagen: t('Genera imágenes'), audio: t('Genera audio'), enrutador: t('Enrutadores'), seguridad: t('Clasificadores de seguridad') };
  if (ex.length) {
    const by = Object.keys(TIPO).map(k => [k, ex.filter(e => e.tipo === k)]).filter(([, l]) => l.length);
    $('#mx-caption').innerHTML += `<details class="excl"><summary>${t('Fuera de la tabla: {length} entradas de OpenRouter que no son modelos de lenguaje de uso general ({p2})', { length: ex.length, p2: by.map(([k, l]) => `${l.length} ${TIPO[k]}`).join(', ') })}</summary>
      <ul>${by.map(([k, l]) => `<li><b>${esc(TIPO_H[k])}:</b> ${l.map(e => `<a href="https://openrouter.ai/${esc(e.id)}" target="_blank" rel="noopener">${esc(e.name)}</a>`).join(', ')}</li>`).join('')}</ul></details>`;
  }
  if (!list.length) { $('#mx-body').innerHTML = `<tr><td colspan="7"><div class="empty">${t('Ningún modelo coincide con el filtro.')}</div></td></tr>`; return; }
  const shown = state.all || state.q ? list : list.slice(0, PAGE);
  $('#mx-more')?.remove();
  if (shown.length < list.length) $('.table-wrap').insertAdjacentHTML('afterend', `<button type="button" class="show-all" id="mx-more">${t('Mostrar los {length} modelos', { length: list.length })}</button>`);
  $('#mx-more')?.addEventListener('click', () => { state.all = true; renderTable(); });
  $('#mx-body').innerHTML = shown.map(m => {
    const open = state.open.has(m.id);
    const checked = state.cmp.includes(m.id);
    const dis = !checked && state.cmp.length >= 3;
    return `<tr class="row" data-id="${esc(m.id)}" aria-expanded="${open}" tabindex="0">
      <td class="c-sel" data-label="${t('Comparar')}"><input type="checkbox" aria-label="${t('Comparar {name}', { name: esc(m.name) })}" data-cmp="${esc(m.id)}"${checked ? ' checked' : ''}${dis ? ' disabled' : ''}></td>
      <td class="c-name"><div class="m-name">${esc(m.name)}</div><div class="m-lab">${esc(m.lab.name)} · ${esc(country(m.lab.country))}</div></td>
      <td data-label="${t('Pesos')}">${weightsBadge(m)}${m.license.v && m.weights.v === 'abiertos' ? `<span class="m-sub">${esc(tr(m.license.v))}</span>` : ''}</td>
      <td class="num" data-label="${t('Inteligencia (AA)')}">${m.aa ? `<span class="big">${fact(m.aa.intelligence, v => num(v))}</span>${aaConfigShort(m) ? `<span class="m-sub" title="${t('Configuración de AA con mayor índice: {aaConfig}', { aaConfig: esc(aaConfig(m)) })}">${esc(aaConfigShort(m))}</span>` : ''}` : nd()}</td>
      <td class="num" data-label="${t('ECI (Epoch)')}">${m.epoch ? `<span class="big">${fact(m.epoch.eci, v => num(v))}</span>` : nd()}</td>
      <td class="num" data-label="${t('Velocidad')}">${speedCell(m)}</td>
      <td class="num" data-label="${t('Entrada / salida')}">${freeOnly(m) ? `<span class="big">${t('gratis')}</span>${src(m.price.in)}<span class="m-sub">${t('solo variante {p1}; sin precio de pago todavía', { p1: esc(m.orVariant.slice(m.orVariant.lastIndexOf(':'))) })}</span>` : `<span class="big">${fact(m.price.in, usd)}</span><span class="m-sub">${t('salida {fact}', { fact: fact(m.price.out, usd) })}</span>`}${m.price.provider ? `<span class="m-sub" title="${esc(priceBasis(m))}">${esc(m.price.provider)}${m.price.basis === 'proveedor' ? `${m.price.quant ? ` (${esc(m.price.quant)})` : ''}${t(', el más barato')}` : ''}</span>` : ''}</td>
    </tr>${open ? `<tr class="detail"><td colspan="7">${detail(m)}</td></tr>` : ''}`;
  }).join('');
}

function renderCompare() {
  const el = $('#mx-compare');
  const ms = state.cmp.map(id => D.byId.get(id)).filter(Boolean);
  if (!ms.length) { el.hidden = true; return; }
  el.hidden = false;
  const sp = ms.map(speed);
  const rowsDef = [
    [t('Pesos'), m => weightsBadge(m)],
    [t('Licencia'), m => fact(m.license)],
    [t('País del laboratorio'), m => esc(country(m.lab.country))],
    [t('Inteligencia (AA)'), m => m.aa ? fact(m.aa.intelligence, v => num(v)) : nd(), m => ii(m), 'max'],
    [t('Programación (AA)'), m => m.aa ? fact(m.aa.coding, v => num(v)) : nd(), m => coding(m), 'max'],
    [t('Agentes (AA)'), m => m.aa ? fact(m.aa.agentic, v => num(v)) : nd(), m => agentic(m), 'max'],
    [t('Capacidad (ECI)'), m => m.epoch ? fact(m.epoch.eci, v => num(v)) : nd(), m => eci(m), 'max'],
    [t('SWE-bench Verified'), m => m.epoch ? fact(m.epoch.swe, v => num(v) + ' %') : nd(), m => swe(m), 'max'],
    [t('Velocidad (tok/s)'), (m, i) => sp[i] ? `${num(sp[i].tps, 0)}${src(sp[i].f)} <span class="m-sub">${esc(sp[i].provider)}</span>` : nd(), (m, i) => sp[i]?.tps ?? null, 'max'],
    // Sólo compiten las latencias de AA (hasta la respuesta); la del proveedor mide otra cosa.
    [t('Latencia (hasta la respuesta)'), (m, i) => sp[i] && sp[i].lat !== null && sp[i].lat !== undefined ? `${num(sp[i].lat, 2)} s${src(sp[i].fl)}${sp[i].aa ? '' : ` <span class="m-sub">${t('primer token, proveedor')}</span>`}` : nd(), (m, i) => sp[i]?.aa ? sp[i].lat ?? null : null, 'min'],
    [t('Entrada / M'), m => fact(m.price.in, usd), m => m.price.in.v, 'min', true],
    [t('Salida / M'), m => fact(m.price.out, usd), m => m.price.out.v, 'min', true],
    [t('Combinado 3:1'), m => blended(m) !== null ? usd(blended(m)) : nd(), m => blended(m), 'min'],
    [t('Contexto'), m => fact(m.ctx, v => tokens(v)), m => m.ctx.v, 'max'],
    [t('Razonamiento'), m => fact(m.reasoning, yesNo)]
  ];
  const cols = ms.length;
  let html = `<div class="compare-head"><span>${t('Comparación ({cols} de 3)', { cols })}</span><a href="#modelos/comparar/${ms.map(m => esc(m.id)).join(',')}" title="${t('Dirección propia de esta comparación, para compartirla')}">${t('Enlace a esta comparación')}</a><button type="button" id="cmp-clear">${t('Vaciar')}</button></div>`;
  html += `<div class="cmp-grid" style="grid-template-columns: minmax(110px, .8fr) repeat(${cols}, minmax(140px, 1fr))"><div class="rh ch"></div>${ms.map(m => `<div class="ch">${esc(m.name)}<span class="m-sub">${esc(m.lab.name)}</span></div>`).join('')}`;
  for (const [label, show, val, better, free] of rowsDef) {
    let bestIdx = -1;
    if (val && cols > 1) {
      const vs = ms.map((m, i) => val(m, i));
      const valid = vs.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined && !(better === 'min' && v === 0 && free));
      if (valid.length > 1) bestIdx = valid.sort((a, b) => better === 'max' ? b[0] - a[0] : a[0] - b[0])[0][1];
    }
    html += `<div class="rh">${label}</div>${ms.map((m, i) => `<div class="${i === bestIdx ? 'best' : ''}">${show(m, i)}</div>`).join('')}`;
  }
  html += '</div>';
  el.innerHTML = html;
  $('#cmp-clear').addEventListener('click', () => { state.cmp = []; renderCompare(); renderTable(); });
}

/* La misma frontera con el índice de AA: recoge los modelos nuevos en cuanto AA los puntúa, también los que Epoch no mide. */
function renderFrontierAA() {
  const el = $('#mx-frontier-aa'), r = aaRace(D.catalog), cov = D.catalog.epochFrontier?.points?.length ? aaCoverage(D.catalog, r.from) : null;
  // Con etiqueta fija, además de líderes y saltos: lo publicado en los últimos 14 días que está entre los diez primeros.
  const since = new Date(Date.parse(`${r.today}T00:00:00Z`) - 14 * 86400e3).toISOString().slice(0, 10);
  const top10 = [...r.models].sort((a, b) => b.v - a.v).slice(0, 10);
  const nuevos = top10.filter(m => m.d >= since);
  if (!frontier(el, r.points, { models: r.models, yLabel: aaIndexName(r.ver), yShort: t('índice AA{v}', { v: r.ver ? ` v${r.ver}` : '' }), metric: t('Índice AA'), highlight: new Set(nuevos.map(m => m.n)), bands: cov?.gaps })) {
    el.innerHTML = `<div class="chart-empty">${t('{ND}: no hay puntuaciones de Artificial Analysis en esta recogida.', { ND: nd() })}</div>`;
  }
  const last = r.points[r.points.length - 1];
  const gap = last && last.open && last.closed ? Math.round((last.closed.v - last.open.v) * 10) / 10 : null;
  const anun = r.models.filter(m => m.anun && top10.includes(m)).map(m => m.n);
  $('#mx-frontier-aa-note').innerHTML = `<span class="lbl">${t('Cómo leerlo')}</span>${t('Cada línea es el mejor {idx} de un modelo con pesos abiertos y de uno cerrado publicado hasta esa fecha; los puntos claros son el resto. Con nombre, el líder de cada grupo y los mayores saltos.', { idx: esc(aaIndexName(r.ver)) })}${nuevos.length ? ` ${t('En punto lleno y con nombre si cabe, lo publicado en los últimos 14 días que está entre los diez primeros ({p1}).', { p1: esc(nuevos.map(m => m.n).join(', ')) })}` : ''} ${t('Cada modelo va en su fecha según AA, con su índice de hoy. Es una reconstrucción hecha hoy, no una serie medida en cada fecha: sólo cuentan los {n} modelos puntuados que siguen en OpenRouter, así que los retirados faltan y los meses antiguos pueden quedar por debajo de lo que hubo.', { n: r.n })}${esc(coverageText(cov))} ${t('«Abiertos» incluye los que su descripción en OpenRouter presenta como de pesos abiertos aunque aún no se puedan descargar')}${anun.length ? ` ${t('(entre los diez primeros: {p1})', { p1: esc(anun.join(', ')) })}` : ''}.${gap !== null ? ` ${t('Distancia actual: {num} puntos ({name} frente a {p3}).', { num: num(gap), name: esc(last.closed.name), p3: esc(last.open.name) })}` : ''} ${t('Datos de {AA_LINK}, publicados con su permiso.', { AA_LINK })}`;
}

function renderFrontier() {
  const el = $('#mx-frontier');
  const f = D.catalog.epochFrontier;
  const series = (f?.points || []).map(p => ({
    date: p.date, open: p.open, closed: p.closed, openName: p.open?.name, closedName: p.closed?.name
  }));
  if (!frontier(el, series, { models: f?.models || null, yLabel: 'Epoch Capabilities Index (ECI)' })) {
    el.innerHTML = `<div class="chart-empty">${t('Sin datos: Epoch AI no estaba disponible en la recogida.')}</div>`;
  }
  const last = series[series.length - 1];
  const gap = last && last.open && last.closed ? Math.round((last.closed.v - last.open.v) * 10) / 10 : null;
  $('#mx-frontier-note').innerHTML = `<span class="lbl">${t('Cómo leerlo')}</span>${t('Cada línea es el mejor ECI alcanzado hasta esa fecha por un modelo con pesos abiertos y por uno cerrado; los puntos claros son el resto de modelos. Con nombre, el líder actual de cada grupo y los mayores saltos. Al pasar el cursor por un punto aparece su ficha. Datos de los {p1} modelos que puntúa Epoch AI (incluidos los que no están en OpenRouter); Epoch tarda en puntuar los modelos nuevos y no mide todos los laboratorios, por eso el gráfico con el índice AA, arriba, los recoge antes. Fuente:', { p1: f?.n ?? t('sin datos') })} <a href="${esc(f?.url || 'https://epoch.ai/benchmarks/eci')}" target="_blank" rel="noopener">${t('Epoch AI')}</a>${t(', CC BY 4.0, consulta {fecha}.', { fecha: esc((f?.got || '').slice(0, 10)) })}${gap !== null ? ` ${t('Distancia actual: {num} puntos ECI ({closedName} frente a {openName}).', { num: num(gap), closedName: esc(last.closedName), openName: esc(last.openName) })}` : ''} ${t('Unos puntos de diferencia no equivalen a meses de retraso.')}`;
}

/* Ranking de uso de OpenRouter (conjunto de datos «rankings-daily», CC BY 4.0): diez primeros por tokens en los últimos 7 días. */
const tokB = v => `${num(v / 1e12, v < 1e12 ? 2 : 1)} ${t('B')}`;
const tokES = v => v >= 1e12 ? t('{n} billones', { n: num(v / 1e12, 1) }) : v >= 1e9 ? t('{n} mil millones', { n: num(v / 1e9, 0) }) : t('{n} millones', { n: num(v / 1e6, 0) });
/* Nombre para el ranking: el de OpenRouter; si ya no lo lista (p. ej. un modelo anónimo retirado), el del identificador. */
const usoName = r => r.name || r.slug.split('/').pop().replace(/-\d{8}$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + (/^stealth\//.test(r.slug) ? ` ${t('(anón.)')}` : '');
function renderUso(u, el, note, dias) {
  if (!u?.top?.length) {
    el.innerHTML = `<div class="chart-empty">${t('{ND}: el ranking de uso necesita la clave de OpenRouter en la recogida.', { ND: nd() })}</div>`;
    note.innerHTML = `<span class="lbl">${t('Fuente')}</span><a href="https://openrouter.ai/rankings" target="_blank" rel="noopener">${t('OpenRouter, rankings')}</a> (CC BY 4.0).`;
    return;
  }
  const inCat = new Set(D.catalog.models.map(m => m.id));
  hbars(el, u.top.map(r => ({
    label: `${r.rank}. ${usoName(r)}${/:free$/.test(r.slug) ? ' :free' : ''}`, v: r.tokens, value: `${tokB(r.tokens)}${r.share != null ? ` (${num(r.share, 0)} %)` : ''}`,
    tip: tip(usoName(r), [[t('Tokens en {dias} días', { dias }), t('{tokens} (entrada + salida)', { tokens: tokES(r.tokens) })], [t('Cuota del total de OpenRouter'), r.share != null ? `${num(r.share, 1)} %` : null], [t('Identificador'), r.slug], [t('Variante'), /:free$/.test(r.slug) ? t('gratuita: OpenRouter la cuenta aparte de la de pago') : null], [t('En la tabla de arriba'), r.id && inCat.has(r.id) ? t('sí') : r.id ? t('no (laboratorio no seguido o fuera de la ventana)') : t('no: OpenRouter ya no lo lista')]])
  })), { aria: t('Modelos más usados en OpenRouter en los últimos {dias} días', { dias }), right: 130 });
  note.innerHTML = `<span class="lbl">${t('Cómo leerlo')}</span>${t('B = billones de tokens (un billón es un millón de millones); entre paréntesis, la cuota. Tokens de entrada más salida procesados en OpenRouter del {fmtDate} al {p2} (días UTC completos), sumando el ranking diario. Es el uso en OpenRouter, no en todo el mercado: no cuenta lo que se consume en la API propia de cada laboratorio ni en sus aplicaciones, y los modelos gratuitos o en promoción suben mucho. La cuota es sobre todo el tráfico de OpenRouter esos días. Puede diferir un poco de las páginas de OpenRouter, que usan su propia ventana. Fuente: OpenRouter (', { fmtDate: esc(fmtDate(u.from)), p2: esc(fmtDate(u.to)) })}<a href="${esc(u.url)}" target="_blank" rel="noopener">${t('openrouter.ai/rankings')}</a>${t('), datos hasta el {fmtDate}, CC BY 4.0; consulta {p2}{p3}.', { fmtDate: esc(fmtDate(u.asOf)), p2: esc((u.got || '').slice(0, 10)), p3: u.stale ? t(' (la última consulta falló: se muestra el ranking anterior)') : '' })}`;
}

/* Dirección propia de cada modelo: #modelos/<id de OpenRouter> (también vale sólo la parte tras «/» si no es ambigua)
   y #modelos/comparar/<id>,<id>,<id>. Muestra la ficha abierta aunque un filtro o la paginación la ocultaran. */
function findModel(s) {
  if (D.byId.has(s)) return s;
  const hits = D.catalog.models.filter(m => m.id.split('/').slice(1).join('/') === s);
  return hits.length === 1 ? hits[0].id : null;
}
/* Aviso de una dirección que no corresponde a ningún modelo; se vuelve a escribir al cambiar de idioma. */
function drawNotFound() {
  $('#mx-notfound')?.remove();
  if (!state.missing) return;
  const sub = state.missing;
  $('.table-wrap').insertAdjacentHTML('beforebegin', `<p class="note" id="mx-notfound">${t('«{sub}» no está en el catálogo: puede que OpenRouter ya no lo liste, que sea de un laboratorio que no se sigue o que tenga más de {dias} días.', { sub: esc(sub), dias: esc(String(D.catalog.method?.window?.match(/\d+/)?.[0] || 540)) })}</p>`);
}
export function showModelPath(sub) {
  if (!D) return;
  $('#mx-notfound')?.remove(); state.missing = null;
  if (sub.startsWith('comparar/')) {
    const ids = [...new Set(sub.slice(9).split(',').map(findModel).filter(Boolean))].slice(0, 3);
    if (ids.length) { state.cmp = ids; renderCompare(); renderTable(); $('#mx-compare').scrollIntoView({ block: 'start' }); return; }
  }
  const id = sub.startsWith('comparar/') ? null : findModel(sub);
  if (!id) {
    state.missing = sub;
    drawNotFound();
    $('#mx-notfound').scrollIntoView({ block: 'center' });
    return;
  }
  const m = D.byId.get(id);
  if (state.w !== 'all' && m.weights.v !== state.w) { state.w = 'all'; $$('#mx-weights [data-w]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.w === 'all'))); }
  if (state.q && !`${m.name} ${m.lab.name} ${m.id}`.toLowerCase().includes(state.q.trim().toLowerCase())) { state.q = ''; $('#mx-q').value = ''; }
  if (rows().findIndex(x => x.id === id) >= PAGE) state.all = true;
  state.open.add(id);
  renderTable();
  const row = $(`tr.row[data-id="${CSS.escape(id)}"]`);
  row?.scrollIntoView({ block: 'start' });
  row?.classList.add('flash');
  row?.focus({ preventScroll: true });
}

/* Los escuchadores se enlazan una sola vez; renderModelos() puede volver a llamarse al cambiar de idioma y vuelve a dibujar
   todo desde el mismo estado (filtros, orden, comparación y fichas abiertas). */
let bound = false;
export function renderModelos(d) {
  D = d;
  if (!bound) { bound = true; initModelos(d); }
  renderTable();
  renderCompare();
  drawNotFound();
  renderFrontierAA();
  renderFrontier();
  renderUso(d.catalog.uso, $('#mx-uso'), $('#mx-uso-note'), 7);
  renderUso(d.catalog.usoMes, $('#mx-uso-mes'), $('#mx-uso-mes-note'), 30);
}
function initModelos(d) {
  if (!d.catalog.models.some(m => ii(m) !== null)) {
    state.sort = d.catalog.models.some(m => eci(m) !== null) ? 'eci' : 'date'; state.dir = -1;
    $('#mx-sort').value = state.sort;
  }
  $('#mx-weights').addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    state.w = b.dataset.w;
    $$('#mx-weights [data-w]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderTable();
  });
  $('#mx-sort').addEventListener('change', e => { state.sort = e.target.value; state.dir = DIR0[state.sort]; renderTable(); });
  // Flechas en las cabeceras: pulsar la columna activa invierte el orden; otra columna empieza en su sentido por defecto.
  $('#mx-table thead')?.addEventListener('click', e => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    const k = b.dataset.sort;
    state.dir = state.sort === k ? -state.dir : DIR0[k];
    state.sort = k; $('#mx-sort').value = k;
    renderTable();
  });
  $('#mx-q').addEventListener('input', e => { state.q = e.target.value; renderTable(); });
  const body = $('#mx-body');
  body.addEventListener('change', e => {
    const id = e.target.dataset?.cmp; if (!id) return;
    state.cmp = e.target.checked ? [...state.cmp, id].slice(0, 3) : state.cmp.filter(x => x !== id);
    renderCompare(); renderTable();
  });
  // Abrir una ficha le da su dirección (#modelos/<id>) sin recargar ni mover la página; cerrarla la quita.
  const toggle = row => {
    const id = row.dataset.id;
    if (state.open.has(id)) { state.open.delete(id); if (location.hash === `#modelos/${id}`) history.replaceState(null, '', '#modelos'); }
    else { state.open.add(id); history.replaceState(null, '', `#modelos/${id}`); }
    renderTable();
  };
  body.addEventListener('click', e => {
    if (e.target.closest('a, input, label')) return;
    const row = e.target.closest('tr.row'); if (row) toggle(row);
  });
  body.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.row')) { e.preventDefault(); toggle(e.target); $(`tr.row[data-id="${CSS.escape(e.target.dataset.id)}"]`)?.focus(); }
  });
}
