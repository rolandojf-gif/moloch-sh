/* MOLOCH.SH · indicadores de «La carrera» y «AI 2027».

   Calcula, a partir de datos públicos, las cifras que las dos vistas citan como evidencia:
     Epoch AI  eci_scores.csv            brechas de capacidad en puntos ECI (EE. UU.–China, abiertos–cerrados, laboratorios)
               benchmarks.csv            saturación de evaluaciones y SWE-bench Verified
               data_centers.csv          potencia, H100e y capital de los centros seguidos
               data_center_timelines.csv calendario estimado de entrada en servicio
               ai_chip_sales_*.csv       entregas estimadas de chips de IA
               ai_companies_*_reports.csv ingresos anualizados y usuarios
     METR      benchmark_results_1_1.yaml horizonte temporal del modelo puntero (sólo el último punto; © METR)

   Las brechas se expresan en puntos ECI, nunca en meses. Cada cifra es un hecho {v, src, url, asOf, got}.
   Si un bloque falla se conserva el anterior marcado stale: true.

   «checks»: valoraciones del observatorio que se derivan de una regla explícita sobre estos datos.
   Las usa data/curated/ai2027.json (valoraciones con "regla"). */

const URLS = {
  dc: 'https://epoch.ai/data/data_centers/data_centers.csv',
  dcTimelines: 'https://epoch.ai/data/data_centers/data_center_timelines.csv',
  chips: 'https://epoch.ai/data/ai_chip_sales_timelines_by_chip.csv',
  chipOrgs: 'https://epoch.ai/data/ai_chip_sales_organizations.csv',
  revenue: 'https://epoch.ai/data/ai_companies_revenue_reports.csv',
  usage: 'https://epoch.ai/data/ai_companies_usage_reports.csv',
  metr: 'https://metr.org/assets/benchmark_results_1_1.yaml',
  // Base de modelos de Epoch: cómputo de entrenamiento estimado. Se prueba en este orden.
  models: ['https://epoch.ai/data/large_scale_ai_models.csv', 'https://epoch.ai/data/notable_ai_models.csv', 'https://epoch.ai/data/all_ai_models.csv']
};
const PAGES = {
  eci: 'https://epoch.ai/benchmarks/eci',
  bench: 'https://epoch.ai/benchmarks',
  swe: 'https://epoch.ai/benchmarks/swe-bench-verified',
  dc: 'https://epoch.ai/data/data-centers',
  chips: 'https://epoch.ai/data/ai-chip-sales',
  companies: 'https://epoch.ai/data/ai-companies',
  metr: 'https://metr.org/time-horizons',
  models: 'https://epoch.ai/data/ai-models'
};

const SAME_ECI = 1;            // Epoch trata como «misma capacidad» dos modelos a menos de 1 punto ECI
const REV_TOLERANCE = 0.10;    // margen para dar por «compatible» una cifra de ingresos prevista

const n = s => { const v = Number(String(s ?? '').replace(/,/g, '')); return s !== '' && s !== undefined && s !== null && Number.isFinite(v) ? v : null; };
const r1 = v => v === null ? null : Math.round(v * 10) / 10;
const r2 = v => v === null ? null : Math.round(v * 100) / 100;
/* Columna por nombre exacto o, si no existe, por prefijo (Epoch añade a veces unidades al encabezado). */
function col(row, name) {
  if (name in row) return row[name];
  const k = Object.keys(row).find(h => h.toLowerCase().startsWith(name.toLowerCase()));
  return k ? row[k] : undefined;
}
const countryCode = s => {
  const t = String(s || '');
  const us = /United States/i.test(t), cn = /China/i.test(t);
  return us && !cn ? 'US' : cn && !us ? 'CN' : null;
};
const firstOrg = s => String(s || '').split(',')[0].trim() || null;

/* Máximo acumulado del ECI por grupo: el mejor modelo de cada grupo publicado hasta la fecha d. */
function bestBy(rows, groupOf) {
  const sorted = rows.filter(r => r.date && groupOf(r)).sort((a, b) => a.date.localeCompare(b.date));
  return (g, d) => {
    let best = null;
    for (const r of sorted) {
      if (r.date > d) break;
      if (groupOf(r) === g && (!best || r.eci > best.eci)) best = r;
    }
    return best;
  };
}
const brief = r => r ? { model: r.name, org: r.org, eci: r.eci, date: r.date, ci: [r.lo, r.hi] } : null;
function monthEnds(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  for (;;) {
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (end > to) { out.push(to); break; }
    out.push(end);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/* Situación en la fecha d de un plazo de AI 2027: el mejor modelo de cada grupo publicado hasta d y, para cada rival,
   el día en que el grupo líder publicó por primera vez un modelo de su nivel. Son fechas observadas: la distancia en
   puntos no se convierte en meses. */
function standingAt(rows, keyOf, d, k = 4) {
  const best = new Map();
  for (const r of rows) {
    if (!r.date || r.date > d) continue;
    const g = keyOf(r);
    if (g && (!best.has(g) || r.eci > best.get(g).eci)) best.set(g, r);
  }
  const top = [...best.entries()].sort((a, b) => b[1].eci - a[1].eci).slice(0, k);
  if (top.length < 2) return null;
  const [leadKey, lead] = top[0];
  const reached = level => rows.filter(r => r.date && r.date <= d && keyOf(r) === leadKey && r.eci >= level).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  return {
    date: d, lead: { key: leadKey, ...brief(lead) },
    rivals: top.slice(1).map(([key, r]) => ({ key, ...brief(r), gap: r2(lead.eci - r.eci), overlap: lead.lo !== null && r.hi !== null ? lead.lo <= r.hi : null, leaderReached: brief(reached(r.eci)) }))
  };
}

/* ── ECI: brechas en puntos ─────────────────────────────────────────────── */
function eciBlock(rows, ctx) {
  const { fact, TODAY } = ctx;
  const all = bestBy(rows, () => 'all');
  const byCountry = bestBy(rows, r => countryCode(r.country));
  const byGroup = bestBy(rows, r => r.group === 'Open weights' ? 'open' : r.group === 'Closed weights' ? 'closed' : null);
  const yearAgo = new Date(Date.parse(TODAY) - 365 * 86400e3).toISOString().slice(0, 10);
  const top = all('all', TODAY), prev = all('all', yearAgo);

  const pair = (get, a, b, d) => { const x = get(a, d), y = get(b, d); return x && y ? { gap: r2(x.eci - y.eci), a: brief(x), b: brief(y) } : null; };
  const series = monthEnds('2023-06', TODAY).map(d => {
    const c = pair(byCountry, 'US', 'CN', d), g = pair(byGroup, 'closed', 'open', d);
    return { d, usCn: c ? c.gap : null, closedOpen: g ? g.gap : null };
  });
  const usCn = pair(byCountry, 'US', 'CN', TODAY), co = pair(byGroup, 'closed', 'open', TODAY);

  // Laboratorios: mejor modelo de cada organización; distancia entre el primero y el segundo.
  const bestOrg = new Map();
  for (const r of rows) { const o = firstOrg(r.org); if (o && (!bestOrg.has(o) || r.eci > bestOrg.get(o).eci)) bestOrg.set(o, r); }
  const labs = [...bestOrg.values()].sort((a, b) => b.eci - a.eci);
  const [l1, l2] = labs;
  const labsGap = l1 && l2 ? r2(l1.eci - l2.eci) : null;

  const url = PAGES.eci;
  return {
    frontier: fact(top ? top.eci : null, 'epoch', url, top?.date || TODAY, { model: top?.name || null, org: top?.org || null, note: 'mejor ECI publicado por Epoch' }),
    rate12m: fact(top && prev ? r1(top.eci - prev.eci) : null, 'epoch', url, TODAY, { from: brief(prev), to: brief(top), note: `puntos ganados por la frontera desde ${yearAgo}` }),
    gapUsCn: fact(usCn ? usCn.gap : null, 'epoch', url, TODAY, { us: usCn?.a || null, cn: usCn?.b || null, note: 'mejor modelo de una organización estadounidense menos el mejor de una china; país de la organización según Epoch' }),
    gapClosedOpen: fact(co ? co.gap : null, 'epoch', url, TODAY, { closed: co?.a || null, open: co?.b || null, note: 'mejor modelo de pesos cerrados menos el mejor de pesos abiertos, según la clasificación de Epoch' }),
    gapLabs: fact(labsGap, 'epoch', url, TODAY, {
      first: brief(l1), second: brief(l2),
      overlap: l1 && l2 && l1.lo !== null && l2.hi !== null ? l1.lo <= l2.hi : null,
      note: 'mejor modelo del primer laboratorio menos el del segundo'
    }),
    labs: labs.slice(0, 8).map(r => ({ org: firstOrg(r.org), model: r.name, eci: r.eci, date: r.date, ci: [r.lo, r.hi] })),
    series: { points: series, src: 'epoch', url, got: ctx.NOW_ISO }
  };
}

/* ── Benchmarks: saturación y SWE-bench Verified ───────────────────────── */
function benchBlock(bench, ctx) {
  const { fact, TODAY } = ctx;
  const ok = bench.filter(r => (!r.Status || r.Status === 'Success') && n(r['Best score (across scorers)']) !== null);
  const tasks = new Map();
  for (const r of ok) {
    const t = r.task; const v = n(r['Best score (across scorers)']);
    const e = tasks.get(t) || { task: t, best: -1, models: new Set() };
    e.models.add(r.Model);
    if (v > e.best) Object.assign(e, { best: v, model: r['Display name'] || r.Model, release: r['Version release date'] || null, run: (r.started_at || '').slice(0, 10) || null });
    tasks.set(t, e);
  }
  const list = [...tasks.values()].filter(e => e.models.size >= 5)
    .map(e => ({ task: e.task, best: r1(e.best * 100), model: e.model, release: e.release, models: e.models.size }))
    .sort((a, b) => b.models - a.models);
  const saturated = list.filter(t => t.best >= 90).length;

  const swe = ok.filter(r => /^swe-bench verified$/i.test(r.task || ''))
    .map(r => ({ v: n(r['Best score (across scorers)']), model: r['Display name'] || r.Model, release: r['Version release date'] || (r.started_at || '').slice(0, 10) }));
  const sweBest = swe.slice().sort((a, b) => b.v - a.v)[0] || null;
  // Serie para el gráfico: mejor resultado de cada modelo por fecha de publicación, marcando los récords.
  const perModel = new Map();
  for (const r of swe) if (r.release && (!perModel.has(r.model) || r.v > perModel.get(r.model).v)) perModel.set(r.model, r);
  let top = -1;
  const sweSeries = [...perModel.values()].sort((a, b) => a.release.localeCompare(b.release) || b.v - a.v)
    .map(r => { const rec = r.v > top; if (rec) top = r.v; return { d: r.release, v: r1(r.v * 100), n: r.model, rec }; });
  const first85 = swe.filter(s => s.v >= 0.85 && s.release).sort((a, b) => a.release.localeCompare(b.release))[0] || null;
  const byMid2025 = swe.filter(s => s.release && s.release <= '2025-06-30').sort((a, b) => b.v - a.v)[0] || null;

  return {
    tasks: fact(list.length ? list : null, 'epoch', PAGES.bench, TODAY, { note: 'mejor resultado de cada evaluación ejecutada por Epoch (tareas con al menos 5 modelos)' }),
    saturated: fact(list.length ? saturated : null, 'epoch', PAGES.bench, TODAY, { of: list.length, note: 'evaluaciones cuyo mejor resultado alcanza el 90 %' }),
    sweBest: fact(sweBest ? r1(sweBest.v * 100) : null, 'epoch', PAGES.swe, sweBest?.release || TODAY, { model: sweBest?.model || null, note: 'SWE-bench Verified ejecutado por Epoch' }),
    swe85: fact(first85 ? first85.release : null, 'epoch', PAGES.swe, TODAY, { model: first85?.model || null, score: first85 ? r1(first85.v * 100) : null, note: 'fecha de publicación del primer modelo que llega al 85 % en las ejecuciones de Epoch' }),
    sweSeries: fact(sweSeries.length ? sweSeries : null, 'epoch', PAGES.swe, TODAY, { note: 'mejor resultado de cada modelo en las ejecuciones de Epoch, por fecha de publicación del modelo' }),
    sweMid2025: fact(byMid2025 ? r1(byMid2025.v * 100) : null, 'epoch', PAGES.swe, '2025-06-30', { model: byMid2025?.model || null, note: 'mejor resultado de un modelo publicado antes del 30 jun 2025' })
  };
}

/* ── Centros de datos (seguimiento por satélite y permisos) ────────────── */
async function dcBlock(ctx) {
  const { getText, parseCSV, fact, TODAY } = ctx;
  const dcs = parseCSV(await getText(URLS.dc));
  // Epoch anota la confianza de cada nombre con etiquetas («Amazon #confident»): se traducen y se quita la de «seguro».
  const TAG = { confident: '', likely: ' (probable)', speculative: ' (especulativo)' };
  const who = s => (s || '').replace(/\s*#(\w+)/g, (_, t) => TAG[t.toLowerCase()] ?? ` (${t})`).trim() || null;
  const rows = dcs.map(r => ({
    name: col(r, 'Name'), owner: who(col(r, 'Owner')), users: who(col(r, 'Users')), country: col(r, 'Country') || null,
    mw: n(col(r, 'Current power')), h100e: n(col(r, 'Current H100 equivalents')), capex: n(col(r, 'Current total capital cost'))
  })).filter(r => r.name);
  const sum = (xs, k) => xs.reduce((a, x) => a + (x[k] || 0), 0);
  const countries = new Map();
  for (const r of rows) {
    const c = countryCode(r.country) || (r.country ? 'otros' : 'sin país');
    const e = countries.get(c) || { country: c, n: 0, mw: 0, h100e: 0 };
    e.n++; e.mw += r.mw || 0; e.h100e += r.h100e || 0; countries.set(c, e);
  }
  const top = rows.filter(r => r.mw).sort((a, b) => b.mw - a.mw).slice(0, 5)
    .map(r => ({ name: r.name, owner: r.owner, users: r.users, country: r.country, mw: Math.round(r.mw), h100e: r.h100e ? Math.round(r.h100e) : null }));

  // Calendario: valor de cada centro en la fecha T = último registro con Date ≤ T.
  let plan = null;
  try {
    const tl = parseCSV(await getText(URLS.dcTimelines)).map(r => ({ dc: r['Data center'], date: r.Date, mw: n(r['Power (MW)']), h100e: n(r['H100 equivalents']) })).filter(r => r.dc && r.date);
    const byDc = new Map();
    for (const r of tl) { const a = byDc.get(r.dc) || []; a.push(r); byDc.set(r.dc, a); }
    for (const a of byDc.values()) a.sort((x, y) => x.date.localeCompare(y.date));
    const at = T => { let mw = 0, h = 0; for (const a of byDc.values()) { const last = a.filter(r => r.date <= T).pop(); if (last) { mw += last.mw || 0; h += last.h100e || 0; } } return { mw: Math.round(mw), h100e: Math.round(h) }; };
    const future = tl.filter(r => r.date > TODAY);
    const lastDate = tl.map(r => r.date).sort().pop();
    // Serie trimestral (fin de cada trimestre) hasta la última fecha del calendario, con el reparto por país
    // tomado de la ficha de cada centro.
    const ctry = new Map(rows.map(r => [r.name, countryCode(r.country) || 'otros']));
    const series = [];
    for (let y = 2024; `${y}` <= lastDate.slice(0, 4); y++) for (const md of ['03-31', '06-30', '09-30', '12-31']) {
      const T = `${y}-${md}`; if (T > lastDate && series.length && series[series.length - 1].d >= lastDate) break;
      const p = { d: T, mw: 0, US: 0, CN: 0, otros: 0, centres: 0 };
      for (const [dc, a] of byDc) { const last = a.filter(r => r.date <= T).pop(); if (last?.mw) { p.mw += last.mw; p[ctry.get(dc) === 'US' ? 'US' : ctry.get(dc) === 'CN' ? 'CN' : 'otros'] += last.mw; p.centres++; } }
      for (const k of ['mw', 'US', 'CN', 'otros']) p[k] = Math.round(p[k]);
      series.push(p);
      if (T >= lastDate) break;
    }
    plan = { today: at(TODAY), end2026: at('2026-12-31'), end2027: at('2027-12-31'), futureRows: future.length, centres: byDc.size, lastDate, series };
  } catch (e) { ctx.log(`calendario de centros falló: ${e.message}`); }

  return {
    now: fact(rows.length ? Math.round(sum(rows, 'mw')) : null, 'epoch', PAGES.dc, TODAY, {
      n: rows.length, h100e: Math.round(sum(rows, 'h100e')), capexB: r1(sum(rows, 'capex')),
      note: 'potencia de TI actual (MW) de los centros que sigue Epoch; no es el total mundial'
    }),
    countries: [...countries.values()].map(c => ({ ...c, mw: Math.round(c.mw), h100e: Math.round(c.h100e) })).sort((a, b) => b.mw - a.mw),
    top,
    plan: fact(plan ? plan.end2027.mw : null, 'epoch', URLS.dcTimelines, TODAY, { ...(plan || {}), note: 'estimación de Epoch a partir de obras, permisos y anuncios; incluye fechas futuras; columna «Power (MW)» del calendario' })
  };
}

/* ── Ventas de chips de IA (estimaciones trimestrales de Epoch) ────────── */
async function chipsBlock(ctx) {
  const { getText, parseCSV, fact, TODAY } = ctx;
  const rows = parseCSV(await getText(URLS.chips)).map(r => ({
    maker: r['Chip manufacturer'] || null, chip: r['Chip type'] || r.Name, start: r['Start date'], end: r['End date'],
    incomplete: /true/i.test(r.Incomplete || ''), h100e: n(r['Compute estimate in H100e (median)']), tdp: n(r['Total TDP (W)']), cost: n(r['Cost Estimate (USD)'])
  })).filter(r => r.end && r.h100e !== null);
  let orgs = new Map();
  try { orgs = new Map(parseCSV(await getText(URLS.chipOrgs)).map(r => [r.Name, r.Country])); } catch (e) { ctx.log(`organizaciones de chips falló: ${e.message}`); }
  const total = rows.reduce((a, r) => a + r.h100e, 0);
  const makers = new Map();
  for (const r of rows) makers.set(r.maker, (makers.get(r.maker) || 0) + r.h100e);
  const byCountry = { US: 0, CN: 0, otros: 0 };
  for (const [m, v] of makers) byCountry[countryCode(orgs.get(m)) || 'otros'] += v;
  const quarters = new Map();
  for (const r of rows) quarters.set(r.end, (quarters.get(r.end) || 0) + r.h100e);
  const qs = [...quarters.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lastQ = qs.length ? qs[qs.length - 1][0] : null;
  const last4 = qs.slice(-4).reduce((a, [, v]) => a + v, 0);
  const tdpGW = rows.reduce((a, r) => a + (r.tdp || 0), 0) / 1e9;
  return {
    cum: fact(Math.round(total), 'epoch', PAGES.chips, lastQ || TODAY, {
      since: rows.map(r => r.start).sort()[0] || null, last4: Math.round(last4),
      tdpGW: r1(tdpGW), costB: r1(rows.reduce((a, r) => a + (r.cost || 0), 0) / 1e9),
      incomplete: rows.some(r => r.incomplete && r.end === lastQ),
      note: 'suma de medianas trimestrales de H100e entregados (Nvidia desde 2022, Google desde 2023, el resto desde 2024); los intervalos no se suman'
    }),
    makers: [...makers.entries()].map(([maker, v]) => ({ maker, h100e: Math.round(v), country: countryCode(orgs.get(maker)) })).sort((a, b) => b.h100e - a.h100e),
    byDesignerCountry: { ...Object.fromEntries(Object.entries(byCountry).map(([k, v]) => [k, Math.round(v)])), note: 'por país del diseñador del chip, no por país donde se usa' },
    quarters: qs.map(([d, v]) => ({ d, h100e: Math.round(v) }))
  };
}

/* ── Ingresos y uso (informes recopilados por Epoch) ───────────────────── */
async function companiesBlock(ctx) {
  const { getText, parseCSV, fact, TODAY } = ctx;
  const rev = parseCSV(await getText(URLS.revenue)).map(r => ({
    company: r.Company, date: r.Date, v: n(r['Annualized revenue (USD)']) ?? n(r['Revenue amount (normalize to annual)']),
    type: r['Annualized revenue type'] || null, confidence: r.Confidence || null, url: r['Source 1'] || null, report: r['Report date'] || null
  })).filter(r => r.company && r.date && r.v !== null);
  const latest = new Map();
  for (const r of rev) if (!latest.has(r.company) || r.date > latest.get(r.company).date) latest.set(r.company, r);
  const asFact = r => fact(r.v, 'epoch', r.url || PAGES.companies, r.date, { company: r.company, type: r.type, confidence: r.confidence, report: r.report, note: `${r.type || 'ingresos anualizados'} · confianza de Epoch: ${r.confidence || 'sin datos'}` });
  const list = [...latest.values()].sort((a, b) => b.v - a.v);
  const at = (company, d) => rev.filter(r => r.company === company && r.date <= d).sort((a, b) => a.date.localeCompare(b.date)).pop() || null;
  const oa2025 = at('OpenAI', '2025-12-31');
  // Ingresos de un año natural: suma mensual del dato anualizado, interpolado entre informes (escala logarítmica)
  // y mantenido plano fuera de ellos. Plano tras el último informe: estimación prudente si el crecimiento sigue.
  const calendarYear = (company, year) => {
    const pts = rev.filter(r => r.company === company).sort((a, b) => a.date.localeCompare(b.date));
    if (!pts.length) return null;
    const t = d => Date.parse(d);
    const rr = d => {
      const x = t(d);
      if (x <= t(pts[0].date)) return pts[0].v;
      for (let i = 1; i < pts.length; i++) if (x <= t(pts[i].date)) {
        const a = pts[i - 1], b = pts[i], f = (x - t(a.date)) / ((t(b.date) - t(a.date)) || 1);
        return Math.exp(Math.log(a.v) + f * (Math.log(b.v) - Math.log(a.v)));
      }
      return pts[pts.length - 1].v;
    };
    let sum = 0;
    for (let m = 0; m < 12; m++) sum += rr(new Date(Date.UTC(year, m, 15)).toISOString().slice(0, 10)) / 12;
    const last = pts[pts.length - 1];
    return { company, est: Math.round(sum), last: { v: last.v, date: last.date, url: last.url }, reports: pts.filter(r => r.date.startsWith(String(year))).length };
  };
  const y2026 = [...latest.keys()].map(c => calendarYear(c, 2026)).filter(Boolean).sort((a, b) => b.est - a.est)[0] || null;

  let usage = [];
  try {
    const u = parseCSV(await getText(URLS.usage)).map(r => ({
      company: r.Company, product: r.Product || null, date: r.Date, users: n(r['Active users']), period: r['Active users time period'] || null,
      tokens: n(r['Daily tokens']), url: r['Source 1'] || null, confidence: r.Confidence || null
    })).filter(r => r.company && r.date && r.users !== null);
    const last = new Map();
    for (const r of u) { const k = `${r.company}|${r.product}|${r.period}`; if (!last.has(k) || r.date > last.get(k).date) last.set(k, r); }
    usage = [...last.values()].sort((a, b) => b.users - a.users).slice(0, 6)
      .map(r => fact(r.users, 'epoch', r.url || PAGES.companies, r.date, { company: r.company, product: r.product, period: r.period, note: `usuarios activos (${r.period || 'periodo sin datos'}) · confianza de Epoch: ${r.confidence || 'sin datos'}` }));
  } catch (e) { ctx.log(`informes de uso fallaron: ${e.message}`); }

  return {
    revenue: list.slice(0, 8).map(asFact),
    leader: list.length ? asFact(list[0]) : fact(null, 'epoch', PAGES.companies, TODAY),
    openai2025: oa2025 ? asFact(oa2025) : fact(null, 'epoch', PAGES.companies, '2025-12-31'),
    y2026: fact(y2026 ? y2026.est : null, 'epoch', PAGES.companies, TODAY, { ...(y2026 || {}), note: 'ingresos del año 2026 estimados con los informes anualizados que recoge Epoch: interpolación entre informes y último dato mantenido hasta fin de año' }),
    usage
  };
}

/* ── METR: horizonte temporal del modelo puntero ───────────────────────── */
/* YAML mínimo: sólo el bloque results con la forma que publica METR (mapas anidados por sangría). */
function parseMetr(text) {
  const out = []; let cur = null, sub = null, inResults = false;
  for (const line of text.split('\n')) {
    if (/^results:\s*$/.test(line)) { inResults = true; continue; }
    if (!inResults) continue;
    if (/^\S/.test(line)) break;
    let m;
    if ((m = line.match(/^ {2}([^\s:][^:]*):\s*$/))) { cur = { key: m[1] }; out.push(cur); sub = null; continue; }
    if (!cur) continue;
    if ((m = line.match(/^ {4}release_date:\s*'?([\d-]+)'?/))) cur.release = m[1];
    else if ((m = line.match(/^ {6}is_sota:\s*(\w+)/))) cur.sota = m[1] === 'true';
    else if ((m = line.match(/^ {6}(p50|p80)_horizon_length:\s*$/))) { sub = m[1]; cur[sub] = {}; }
    else if (sub && (m = line.match(/^ {8}(estimate|ci_low|ci_high):\s*([\d.eE+-]+)/))) cur[sub][m[1]] = Number(m[2]);
    else if (/^ {6}\S/.test(line)) sub = null;
  }
  return out.filter(r => r.release && r.p50 && Number.isFinite(r.p50.estimate));
}
async function metrBlock(ctx) {
  const { getText, fact, TODAY } = ctx;
  const rows = parseMetr(await getText(URLS.metr));
  const sota = rows.filter(r => r.sota).sort((a, b) => a.release.localeCompare(b.release));
  const last = sota[sota.length - 1] || null;
  const latestRelease = rows.map(r => r.release).sort().pop() || null;
  const h = x => x ? { est: r2(x.estimate / 60), lo: r2(x.ci_low / 60), hi: r2(x.ci_high / 60) } : null;   // minutos → horas
  return {
    sota: fact(last ? h(last.p80)?.est ?? null : null, 'metr', PAGES.metr, last?.release || TODAY, {
      key: last?.key || null, p50: h(last?.p50), p80: h(last?.p80),
      ratio: last && last.p80 && last.p50 ? r2(last.p80.estimate / last.p50.estimate) : null,
      models: rows.length, latestRelease,
      note: 'horas de trabajo humano experto de las tareas que el agente completa con un 80 % de éxito; no son horas de autonomía'
    })
  };
}

/* ── Valoraciones del observatorio derivadas de reglas ─────────────────── */
const es = v => String(v).replace('.', ',');
const dia = d => new Date(d + 'T00:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const MONTH_DAYS = 30.44;
const mes = d => new Date(d + 'T00:00:00Z').toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const addDays = (d, k) => new Date(Date.parse(d) + k * 86400e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400e3;
const mill = v => `${es(Math.round(v / 1e5) / 10)} millones`;
const sci = v => { const e = Math.floor(Math.log10(v)); return `${es((v / 10 ** e).toFixed(1))} × 10^${e}`; };
/* Una fecha prevista frente al plazo: ±90 días cuenta como a tiempo. */
const byDate = (reach, plazo) => { const k = daysBetween(plazo, reach); return k < -90 ? 'adelantado' : k > 90 ? 'retrasado' : 'compatible'; };
/* METR, «Time Horizon 1.1» (29 ene 2026): tiempo de duplicación del horizonte al 50 %, en días. */
const METR_DOUBLING = { reciente: 88.6, largo: 196.5 };
/* NVIDIA, ficha del DGX H100: 10,2 kW como máximo para 8 GPU de 700 W (5,6 kW). Resto del servidor sobre el TDP de las GPU. */
const SERVER_OVER_GPU = 10.2 / 5.6;
/* Desfase del rival más cercano en la fecha del plazo: días desde que el líder publicó por primera vez un modelo
   de su nivel. Rango previsto en meses [lo, hi]; un mes son 30,44 días. */
function monthsRule(st, lo, hi, { names = {}, sentido, pide, extra = '' }) {
  if (!st?.lead || !st.rivals?.length) return { v: 'sin evidencia suficiente', texto: 'Faltan datos de ECI hasta la fecha del plazo.' };
  const name = k => names[k] || k;
  const r = st.rivals[0], lr = r.leaderReached;
  const lag = lr ? Math.round((Date.parse(st.date) - Date.parse(lr.date)) / 86400e3) : null;
  const v = lag === null ? 'sin evidencia suficiente' : lag < lo * MONTH_DAYS ? 'adelantado' : lag > hi * MONTH_DAYS ? 'retrasado' : 'compatible';
  const L = name(st.lead.key), R = name(r.key);
  const reach = !lr ? '' : lr.date > r.date
    ? ` ${R} llegó a ese nivel el ${dia(r.date)}; ${L}, el ${dia(lr.date)}.`
    : ` ${L} había llegado a ese nivel el ${dia(lr.date)}; ${R}, el ${dia(r.date)}.`;
  const cmp = { adelantado: `menos de ${lo} meses`, retrasado: `más de ${hi} meses`, compatible: `entre ${lo} y ${hi} meses` }[v];
  return {
    v, sentido: sentido[v] || null,
    texto: `${L} iba primero (${st.lead.model}, ${es(st.lead.eci)} puntos ECI) y ${R} segundo (${r.model}, ${es(r.eci)}), a ${es(r.gap)} puntos${r.overlap ? ' con intervalos de confianza solapados' : ''}.${reach}${cmp ? ` Al vencer el plazo, ${R} tenía el nivel que ${L} había alcanzado ${cmp} antes; ${pide}.` : ''}${extra}`
  };
}
function checks(ind, TODAY) {
  const c = {};
  const swe = ind.bench?.swe85, mid = ind.bench?.sweMid2025;
  if (swe && mid) {
    const hit = swe.v && swe.v <= '2025-06-30';
    c.swe85 = mid.v === null && !swe.v
      ? { v: 'sin evidencia suficiente', texto: 'Epoch no tiene ejecuciones de SWE-bench Verified para modelos de esa época.' }
      : { v: hit ? 'compatible' : 'retrasado', texto: hit ? `Un modelo publicado antes del plazo (${swe.model}) llega al 85 % en las ejecuciones de Epoch.` : `Ningún modelo publicado antes del 30 jun 2025 llega al 85 % en las ejecuciones de Epoch (mejor: ${mid.v != null ? es(mid.v) : 'sin datos'} %). ${swe.v ? `El primero que lo alcanza se publicó el ${swe.v}.` : 'Ninguno lo alcanza todavía.'}` };
  }
  const s = ind.eci?.series?.points;
  if (s) {
    const closed = ind.eci.agent0?.closed, open = ind.eci.agent0?.open;
    if (closed && open) {
      const ok = open.eci >= closed.eci - SAME_ECI;
      c.openAgent0 = { v: ok ? 'compatible' : 'retrasado', texto: `Mejor modelo cerrado a 31 dic 2025: ${closed.model} (${es(closed.eci)}). Mejor de pesos abiertos a 30 abr 2026: ${open.model} (${es(open.eci)}). Regla: «iguala» si queda a menos de ${SAME_ECI} punto ECI, el criterio de Epoch.` };
    } else c.openAgent0 = { v: 'sin evidencia suficiente', texto: 'Faltan datos de ECI para alguna de las dos fechas.' };
  }
  const oa = ind.companies?.openai2025;
  if (oa) {
    if (oa.v === null) c.openaiRev2025 = { v: 'sin evidencia suficiente', texto: 'Epoch no recoge ingresos de OpenAI hasta esa fecha.' };
    else {
      const rel = oa.v / 18e9 - 1;
      const v = rel > REV_TOLERANCE ? 'adelantado' : rel < -REV_TOLERANCE ? 'retrasado' : 'compatible';
      c.openaiRev2025 = { v, texto: `Último dato de Epoch hasta el 31 dic 2025: ${es(Math.round(oa.v / 1e8) / 10)} mil millones de $ anualizados (${oa.asOf}), frente a 18 previstos (${rel >= 0 ? '+' : ''}${Math.round(rel * 100)} %; margen de «compatible»: ±${REV_TOLERANCE * 100} %).` };
    }
  }
  // Predicciones escritas en meses: se comparan fechas observadas, nunca una conversión de puntos en meses.
  const rv = ind.eci?.rivals2025;
  if (rv) c.rivales39 = monthsRule(rv, 3, 9, {
    pide: 'la predicción pedía entre 3 y 9 meses',
    sentido: { adelantado: 'Los rivales iban más cerca de lo previsto', retrasado: 'El líder iba más destacado de lo previsto', compatible: 'Distancia dentro de lo previsto' }
  });
  const uc = ind.eci?.usCn2026;
  if (uc) c.deepcent6 = monthsRule(uc, 4, 8, {
    names: { US: 'EE. UU.', CN: 'China' }, pide: '«unos seis meses» se da por cumplido entre 4 y 8',
    sentido: { adelantado: 'China iba más cerca de lo previsto', retrasado: 'China iba más lejos de lo previsto', compatible: 'Distancia como la prevista' },
    extra: ' El 12 % del cómputo no se valora: no hay una estimación propia del cómputo chino.'
  });
  // ── Estimaciones («est_»): extrapolaciones con su método para hitos sin plazo vencido o sin medida directa.
  //    No son valoraciones del observatorio; la ficha las muestra aparte y con lo que podría romperlas.
  const ch = ind.chips;
  if (ch?.quarters?.length && ch.cum?.v) {
    const qs = ch.cum.incomplete ? ch.quarters.slice(0, -1) : ch.quarters;
    const last4 = qs.slice(-4), rate = last4.reduce((a, q) => a + q.h100e, 0) / last4.length;
    const base = qs.reduce((a, q) => a + q.h100e, 0), lastEnd = qs[qs.length - 1].d, QD = 365.25 / 4;
    const proj = base + rate * daysBetween(lastEnd, '2026-12-31') / QD;
    const reach = addDays(lastEnd, (40e6 - base) / rate * QD);
    const v = byDate(reach, '2026-12-31');
    c.est_h100e40m = {
      v, proj: Math.round(proj), reach, tdpGW: ch.cum.tdpGW ? r1(ch.cum.tdpGW * proj / ch.cum.v) : null,
      sentido: { adelantado: 'Llegaría antes de fin de 2026', compatible: 'Llegaría hacia fin de 2026', retrasado: 'Llegaría después de 2026' }[v],
      texto: `Entregados hasta el ${dia(lastEnd)}, último trimestre completo: ${mill(base)} de H100e${ch.cum.incomplete ? ` (${mill(ch.cum.v)} con lo que va del trimestre en curso)` : ''}. Al ritmo medio de los cuatro últimos trimestres completos (${mill(rate)} por trimestre), a fin de 2026 habría unos ${mill(proj)}, y los 40 millones se alcanzarían hacia ${mes(reach)}.`
    };
  }
  const plan = ind.dc?.plan, tdp = c.est_h100e40m?.tdpGW;
  if (plan?.end2026?.mw || tdp) {
    const lo = plan?.end2026?.mw ? plan.end2026.mw / 1000 : null, hi = tdp ? tdp * SERVER_OVER_GPU : null;
    const v = hi !== null && hi < 29 ? 'retrasado' : lo !== null && lo > 38 ? 'adelantado' : 'compatible';
    const gw = x => `${es(r1(x))} GW`;
    c.est_potencia2026 = {
      v, sentido: { retrasado: 'Por debajo de lo previsto', adelantado: 'Por encima de lo previsto', compatible: 'Dentro del rango estimado' }[v],
      texto: `${lo !== null ? `Cota inferior: según el calendario de Epoch, los ${plan.centres} centros que sigue tendrían ${gw(lo)} a fin de 2026.` : ''}${hi !== null ? ` Cota superior: los chips entregados sumarían unos ${gw(tdp)} de consumo nominal; con el resto del servidor (un DGX H100 consume 10,2 kW para 5,6 kW de GPU), unos ${gw(hi)} si funcionaran todos a la vez, sin contar la refrigeración.` : ''} La predicción, entre 29 y 38 GW, ${v === 'compatible' ? 'cae dentro de ese rango' : v === 'retrasado' ? 'queda por encima del máximo' : 'queda por debajo del mínimo'}.`.trim()
    };
  }
  const y = ind.companies?.y2026;
  if (y?.v) {
    const rel = y.v / 35e9 - 1;
    const v = rel > REV_TOLERANCE ? 'adelantado' : rel < -REV_TOLERANCE ? 'retrasado' : 'compatible';
    c.est_ingresos2026 = {
      v, sentido: { adelantado: 'Superaría lo previsto', compatible: 'Como lo previsto', retrasado: 'Por debajo de lo previsto' }[v],
      texto: `Interpolando los ingresos anualizados que recoge Epoch y manteniendo el último (${es(Math.round(y.last.v / 1e8) / 10)} mil millones, ${dia(y.last.date)}) hasta fin de año, ${y.company} ingresaría unos ${es(Math.round(y.v / 1e8) / 10)} mil millones de $ en 2026, frente a 35 previstos (${rel >= 0 ? '+' : ''}${Math.round(rel * 100)} %). Si sigue creciendo, sería más.`
    };
  }
  const m = ind.metr?.sota;
  if (m?.p80?.est) {
    const h0 = m.p80.est, from = m.asOf, need = Math.log2(120 / h0);
    const at = dd => h0 * 2 ** (daysBetween(from, '2026-12-31') / dd);
    const reachFast = addDays(from, need * METR_DOUBLING.reciente), reachSlow = addDays(from, need * METR_DOUBLING.largo);
    const v = byDate(reachFast, '2026-12-31');
    c.est_horizonte3s = {
      v, sentido: { adelantado: 'Llegaría antes de lo previsto', compatible: 'Llegaría a tiempo', retrasado: 'Llegaría tarde' }[v],
      texto: `El modelo puntero que mide METR (${dia(from)}) completa con un 80 % de éxito tareas de unas ${es(h0)} horas. Si el horizonte se duplica cada ${es(METR_DOUBLING.reciente)} días, como en los modelos desde 2024, a fin de 2026 serían unas ${es(Math.round(at(METR_DOUBLING.reciente)))} horas y las 120 llegarían hacia ${mes(reachFast)}. Al ritmo de toda la serie (cada ${es(METR_DOUBLING.largo)} días), unas ${es(Math.round(at(METR_DOUBLING.largo)))} horas, y las 120 no antes de ${mes(reachSlow)}.`
    };
  }
  const tr = ind.training;
  if (tr?.largest2025?.v) {
    const b = tr.largest2025, f = tr.first1e27;
    const v = b.v >= 1e27 ? 'compatible' : 'retrasado';
    c.est_flop27 = {
      v, sentido: v === 'compatible' ? 'Alcanzado según Epoch' : 'Por debajo según Epoch',
      texto: `De los modelos publicados hasta el 31 dic 2025 con cómputo estimado por Epoch, el mayor es ${b.model}${b.org ? ` (${b.org})` : ''}: unos ${sci(b.v)} FLOP${b.confidence ? ` (confianza de Epoch: ${b.confidence})` : ''}, el ${es(Math.round(b.v / 1e25))} % de 10^27.${tr.largest?.v && tr.largest.model !== b.model ? ` Hoy el mayor es ${tr.largest.model}${tr.largest.org ? ` (${tr.largest.org}, ${dia(tr.largest.date)})` : ''}, con unos ${sci(tr.largest.v)}.` : ''} ${f?.v ? `El primero que llega a 10^27 es ${f.model}, publicado el ${dia(f.v)}.` : 'Ninguno llega todavía a 10^27.'}`
    };
  }
  for (const k of Object.keys(c)) c[k].fecha = TODAY;
  return c;
}

/* ── Cómputo de entrenamiento estimado por Epoch ───────────────────────── */
async function trainingBlock(ctx) {
  const { getText, parseCSV, fact, TODAY } = ctx;
  let rows = null, used = null;
  const errs = [];
  for (const u of URLS.models) { try { rows = parseCSV(await getText(u)); used = u; break; } catch (e) { errs.push(`${u}: ${e.message}`); } }
  if (!rows) throw new Error(errs.join(' | '));
  ctx.log(`Epoch, modelos: ${used} · ${rows.length} filas · columnas: ${Object.keys(rows[0] || {}).slice(0, 30).join(' | ')}`);
  const ms = rows.map(r => ({ name: col(r, 'Model'), org: col(r, 'Organization'), date: String(col(r, 'Publication date') || '').slice(0, 10), flop: n(col(r, 'Training compute (FLOP)')), conf: col(r, 'Confidence') || null }))
    .filter(m => m.name && /^\d{4}-\d{2}-\d{2}$/.test(m.date) && m.flop);
  const largest = d => ms.filter(m => m.date <= d).sort((a, b) => b.flop - a.flop)[0] || null;
  const firstAbove = v => ms.filter(m => m.flop >= v).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const b = m => m ? { model: m.name, org: firstOrg(m.org), date: m.date, flop: m.flop, confidence: m.conf } : {};
  const top2025 = largest('2025-12-31'), top = largest(TODAY), f27 = firstAbove(1e27);
  ctx.log(`cómputo de entrenamiento: mayor hasta 2025 ${top2025?.name ?? '—'} ${top2025?.flop ?? '—'}; mayor hoy ${top?.name ?? '—'} ${top?.flop ?? '—'}; primero ≥1e27 ${f27?.name ?? '—'} ${f27?.date ?? ''}`);
  const note = 'estimación de Epoch del cómputo de entrenamiento; los laboratorios no lo publican';
  return {
    largest2025: fact(top2025?.flop ?? null, 'epoch', PAGES.models, '2025-12-31', { ...b(top2025), note }),
    largest: fact(top?.flop ?? null, 'epoch', PAGES.models, TODAY, { ...b(top), note }),
    first1e27: fact(f27?.date ?? null, 'epoch', PAGES.models, TODAY, { ...b(f27), note: 'primer modelo con un cómputo de entrenamiento estimado de al menos 10^27 FLOP' })
  };
}

/* Marca como stale todos los hechos de un bloque conservado de la recogida anterior. */
const staleCopy = o => JSON.parse(JSON.stringify(o), (k, v) => (v && typeof v === 'object' && 'v' in v && 'src' in v) ? { ...v, stale: true } : v);

export async function collectIndicators(ctx, ep, prev) {
  const ind = {}, status = {};
  const prevInd = prev?.ind || {};
  const run = async (key, srcKey, fn) => {
    try { ind[key] = await fn(); status[srcKey] = status[srcKey]?.ok === false ? status[srcKey] : { ok: true, got: ctx.NOW_ISO }; }
    catch (e) {
      ctx.log(`indicadores ${key} falló: ${e.message}`);
      ind[key] = prevInd[key] ? staleCopy(prevInd[key]) : null;
      status[srcKey] = { ok: false, reason: 'la consulta falló; se conservan los valores anteriores' };
    }
  };
  if (ep && ep !== 'keep') {
    await run('eci', 'epoch', () => {
      const b = eciBlock(ep.rows, ctx);
      const byGroup = bestBy(ep.rows, r => r.group === 'Open weights' ? 'open' : r.group === 'Closed weights' ? 'closed' : null);
      b.agent0 = { closed: brief(byGroup('closed', '2025-12-31')), open: brief(byGroup('open', '2026-04-30')) };
      // Plazos de AI 2027 sobre distancias: «rivales a 3–9 meses» (fin de 2025) y «China a unos 6 meses» (mediados de 2026).
      const at = (keyOf, d, note) => { const st = standingAt(ep.rows, keyOf, d); return ctx.fact(st ? st.rivals[0].gap : null, 'epoch', PAGES.eci, d, { ...st, note }); };
      b.rivals2025 = at(r => firstOrg(r.org), '2025-12-31', 'mejor modelo de cada laboratorio publicado hasta el 31 dic 2025; distancia del primero al segundo');
      b.usCn2026 = at(r => countryCode(r.country), '2026-08-31', 'mejor modelo de una organización de EE. UU. y de una china publicado hasta el 31 ago 2026');
      for (const f of [b.rivals2025, b.usCn2026]) if (f.lead) ctx.log(`ECI a ${f.date}: ${f.lead.org} ${f.lead.model} ${f.lead.eci} (${f.lead.date}) | ${f.rivals.map(r => `${r.key}: ${r.model} ${r.eci} (${r.date}), −${r.gap} pts, solapan ${r.overlap}, el líder llegó a ese nivel el ${r.leaderReached?.date ?? '—'} con ${r.leaderReached?.model ?? '—'}`).join(' | ')}`);
      return b;
    });
    await run('bench', 'epoch', () => benchBlock(ep.bench || [], ctx));
  } else {
    for (const k of ['eci', 'bench']) ind[k] = prevInd[k] ? staleCopy(prevInd[k]) : null;
  }
  await run('dc', 'epoch_dc', () => dcBlock(ctx));
  await run('chips', 'epoch_chips', () => chipsBlock(ctx));
  await run('companies', 'epoch_companies', () => companiesBlock(ctx));
  await run('metr', 'metr', () => metrBlock(ctx));
  await run('training', 'epoch_models', () => trainingBlock(ctx));
  const out = { ind, status, checks: checks(ind, ctx.TODAY) };
  ctx.log(`indicadores: brecha EE. UU.–China ${ind.eci?.gapUsCn?.v ?? '—'} pts, cerrados–abiertos ${ind.eci?.gapClosedOpen?.v ?? '—'} pts, centros ${ind.dc?.now?.v ?? '—'} MW, chips ${ind.chips?.cum?.v ?? '—'} H100e, METR p80 ${ind.metr?.sota?.v ?? '—'} h`);
  return out;
}

/* Valores compactos para la instantánea diaria (series históricas). */
export function indicatorSnapshot(ind) {
  return {
    eci: ind.eci?.frontier?.v ?? null, usCn: ind.eci?.gapUsCn?.v ?? null, closedOpen: ind.eci?.gapClosedOpen?.v ?? null, labs: ind.eci?.gapLabs?.v ?? null,
    dcMW: ind.dc?.now?.v ?? null, chipsH100e: ind.chips?.cum?.v ?? null,
    revLeader: ind.companies?.leader?.v ?? null, metrP80h: ind.metr?.sota?.v ?? null
  };
}

export const IND_URLS = URLS;
