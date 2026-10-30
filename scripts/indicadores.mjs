/* MOLOCH.SH · indicadores de «La carrera» y «AI 2027».

   Calcula, a partir de datos públicos, las cifras que las dos vistas citan como evidencia:
     Epoch AI  eci_scores.csv            brechas de capacidad en puntos ECI (EE. UU.–China, abiertos–cerrados, laboratorios)
               benchmarks.csv            saturación de evaluaciones y SWE-bench Verified
               benchmark_data.zip        dificultad de cada evaluación en la escala del ECI (EDI) y réplicas bootstrap
                                         del ajuste: mapa de evaluaciones y probabilidad de que el líder vaya delante
               data_centers.csv          potencia, H100e y capital de los centros seguidos
               data_center_timelines.csv calendario estimado de entrada en servicio
               ai_chip_sales_*.csv       entregas estimadas de chips de IA
               ai_companies_*_reports.csv ingresos anualizados y usuarios
     METR      benchmark_results_1_1.yaml horizonte temporal del modelo puntero (sólo el último punto; © METR)

   Las brechas se expresan en puntos ECI, nunca en meses. Cada cifra es un hecho {v, src, url, asOf, got}.
   Si un bloque falla se conserva el anterior marcado stale: true.

   «checks»: valoraciones del observatorio que se derivan de una regla explícita sobre estos datos.
   Las usa data/curated/ai2027.json (valoraciones con "regla"). */

import { inflateRawSync } from 'node:zlib';
import { F, failedStatus } from './textos.mjs';

const URLS = {
  dc: 'https://epoch.ai/data/data_centers/data_centers.csv',
  dcTimelines: 'https://epoch.ai/data/data_centers/data_center_timelines.csv',
  chips: 'https://epoch.ai/data/ai_chip_sales_timelines_by_chip.csv',
  chipOrgs: 'https://epoch.ai/data/ai_chip_sales_organizations.csv',
  revenue: 'https://epoch.ai/data/ai_companies_revenue_reports.csv',
  usage: 'https://epoch.ai/data/ai_companies_usage_reports.csv',
  metr: 'https://metr.org/assets/benchmark_results_1_1.yaml',
  // Datos del ajuste del ECI (el mismo que reproduce github.com/epoch-research/eci-public): EDI, réplicas y resultados.
  benchZip: 'https://epoch.ai/data/benchmark_data.zip',
  // Base de modelos de Epoch: cómputo de entrenamiento estimado. Se prueba en este orden.
  models: ['https://epoch.ai/data/large_scale_ai_models.csv', 'https://epoch.ai/data/notable_ai_models.csv', 'https://epoch.ai/data/all_ai_models.csv']
};
const PAGES = {
  eci: 'https://epoch.ai/benchmarks/eci',
  bench: 'https://epoch.ai/benchmarks',
  swe: 'https://epoch.ai/benchmarks/swe-bench-verified',
  mirror: 'https://epoch.ai/benchmarks/mirrorcode',
  dc: 'https://epoch.ai/data/data-centers',
  chips: 'https://epoch.ai/data/ai-chip-sales',
  companies: 'https://epoch.ai/data/ai-companies',
  metr: 'https://metr.org/time-horizons',
  models: 'https://epoch.ai/data/ai-models'
};

const SAME_ECI = 1;            // Epoch trata como «misma capacidad» dos modelos a menos de 1 punto ECI
const VARIOS = 3;              // «several competing AIs»: en inglés, más de dos; al menos tres laboratorios (lectura del observatorio)
const REV_TOLERANCE = 0.10;    // margen para dar por «compatible» una cifra de ingresos prevista
const PARADA = 92;             // serie detenida: más de tres meses sin medir un modelo publicado después (o su editor la cierra)
const MIRROR_UMBRAL = 80;      // hito «horizonte de tres semanas»: el mejor resultado en MirrorCode llega al 80 % (lectura del observatorio)

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

/* Carrera por laboratorio: para cada organización, los modelos con los que superó su propio mejor ECI, por fecha de
   publicación. Entran las que estuvieron entre las `top` primeras a fin de algún mes desde `from`; de cada una se guarda
   también el último récord anterior a `from`, que es su punto de partida. Sin interpolar: entre dos récords, la barra
   no se mueve. */
const RACE_FROM = '2023-01';
export function raceOf(rows, today, { from = RACE_FROM, top = 10 } = {}) {
  const dated = rows.filter(r => r.date && firstOrg(r.org)).sort((a, b) => a.date.localeCompare(b.date) || b.eci - a.eci);
  const labs = new Map();
  for (const r of dated) {
    const o = firstOrg(r.org);
    const lab = labs.get(o) || { org: o, c: null, steps: [] };
    const last = lab.steps[lab.steps.length - 1];
    if (!last || r.eci > last.v) lab.steps.push({ d: r.date, v: r.eci, lo: r.lo, hi: r.hi, m: r.name, w: r.group === 'Open weights' ? 'o' : r.group === 'Closed weights' ? 'c' : null });
    lab.c = countryCode(r.country) || lab.c;
    labs.set(o, lab);
  }
  const at = (lab, d) => { let s = null; for (const x of lab.steps) { if (x.d > d) break; s = x; } return s; };
  const keep = new Set();
  for (const d of monthEnds(from, today)) {
    [...labs.values()].map(l => [l, at(l, d)]).filter(([, s]) => s).sort((a, b) => b[1].v - a[1].v).slice(0, top).forEach(([l]) => keep.add(l));
  }
  const start = `${from}-01`;
  return [...keep].map(l => {
    const i = l.steps.findIndex(s => s.d >= start);
    const steps = i < 0 ? l.steps.slice(-1) : l.steps.slice(Math.max(0, i - 1));
    return { org: l.org, c: l.c, steps: steps.map(s => ({ ...s, v: r2(s.v), lo: s.lo === null ? null : r2(s.lo), hi: s.hi === null ? null : r2(s.hi) })) };
  }).sort((a, b) => b.steps[b.steps.length - 1].v - a.steps[a.steps.length - 1].v);
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
    series: { points: series, src: 'epoch', url, got: ctx.NOW_ISO },
    race: (race => fact(race.length ? race : null, 'epoch', url, TODAY, { from: RACE_FROM, note: 'récords de cada laboratorio en el ECI por fecha de publicación del modelo; entran los que estuvieron entre los diez primeros a fin de algún mes' }))(raceOf(rows, TODAY, { from: RACE_FROM }))
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

  const runs = re => ok.filter(r => re.test(r.task || ''))
    .map(r => ({ v: n(r['Best score (across scorers)']), model: r['Display name'] || r.Model, release: r['Version release date'] || (r.started_at || '').slice(0, 10) }));
  // Serie para el gráfico: mejor resultado de cada modelo por fecha de publicación, marcando los récords.
  const series = rs => {
    const perModel = new Map();
    for (const r of rs) if (r.release && (!perModel.has(r.model) || r.v > perModel.get(r.model).v)) perModel.set(r.model, r);
    let top = -1;
    return [...perModel.values()].sort((a, b) => a.release.localeCompare(b.release) || b.v - a.v)
      .map(r => { const rec = r.v > top; if (rec) top = r.v; return { d: r.release, v: r1(r.v * 100), n: r.model, rec }; });
  };
  // Serie detenida: el modelo más reciente que ha medido se publicó hace más de PARADA días.
  const stop = rs => { const last = rs.map(r => r.release).filter(Boolean).sort().pop() || null; return { ultimo: last, detenida: last ? daysBetween(last, TODAY) > PARADA : null }; };
  const swe = runs(/^swe-bench verified$/i), sweStop = stop(swe);
  const sweBest = swe.slice().sort((a, b) => b.v - a.v)[0] || null;
  const sweSeries = series(swe);
  const first85 = swe.filter(s => s.v >= 0.85 && s.release).sort((a, b) => a.release.localeCompare(b.release))[0] || null;
  const byMid2025 = swe.filter(s => s.release && s.release <= '2025-06-30').sort((a, b) => b.v - a.v)[0] || null;
  const mc = runs(/^mirrorcode$/i), mcStop = stop(mc);
  const mcBest = mc.slice().sort((a, b) => b.v - a.v)[0] || null;
  const mcNote = 'MirrorCode ejecutado por Epoch: reimplementar programas enteros a partir de su comportamiento; a un ingeniero, algunas tareas le llevarían semanas';

  return {
    tasks: fact(list.length ? list : null, 'epoch', PAGES.bench, TODAY, { note: 'mejor resultado de cada evaluación ejecutada por Epoch (tareas con al menos 5 modelos)' }),
    saturated: fact(list.length ? saturated : null, 'epoch', PAGES.bench, TODAY, { of: list.length, note: 'evaluaciones cuyo mejor resultado alcanza el 90 %' }),
    sweBest: fact(sweBest ? r1(sweBest.v * 100) : null, 'epoch', PAGES.swe, sweBest?.release || TODAY, { model: sweBest?.model || null, ...sweStop, note: 'SWE-bench Verified ejecutado por Epoch' }),
    swe85: fact(first85 ? first85.release : null, 'epoch', PAGES.swe, TODAY, { model: first85?.model || null, score: first85 ? r1(first85.v * 100) : null, note: 'fecha de publicación del primer modelo que llega al 85 % en las ejecuciones de Epoch' }),
    sweSeries: fact(sweSeries.length ? sweSeries : null, 'epoch', PAGES.swe, TODAY, { ...sweStop, note: 'mejor resultado de cada modelo en las ejecuciones de Epoch, por fecha de publicación del modelo' }),
    mirror: fact(mcBest ? r1(mcBest.v * 100) : null, 'epoch', PAGES.mirror, mcBest?.release || TODAY, { model: mcBest?.model || null, models: new Set(mc.map(r => r.model)).size, ...mcStop, note: mcNote }),
    mirrorSeries: fact(mc.length ? series(mc) : null, 'epoch', PAGES.mirror, TODAY, { ...mcStop, note: `${mcNote}; mejor resultado de cada modelo, por fecha de publicación del modelo` }),
    sweMid2025: fact(byMid2025 ? r1(byMid2025.v * 100) : null, 'epoch', PAGES.swe, '2025-06-30', { model: byMid2025?.model || null, note: 'mejor resultado de un modelo publicado antes del 30 jun 2025' })
  };
}

/* ── Dificultad de las evaluaciones y probabilidad de liderazgo (benchmark_data.zip) ───────────── */
/* Lector mínimo de .zip (sin ZIP64, que el fichero de Epoch no necesita): nombre → función que devuelve su contenido. */
export function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip sin directorio central');
  const files = new Map();
  for (let i = 0, p = buf.readUInt32LE(e + 16), count = buf.readUInt16LE(e + 10); i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: directorio central dañado');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), off = buf.readUInt32LE(p + 42);
    const nl = buf.readUInt16LE(p + 28), name = buf.toString('utf8', p + 46, p + 46 + nl);
    files.set(name, () => {
      const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.subarray(start, start + size);
      if (method === 0) return raw;
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`zip: compresión ${method} no admitida (${name})`);
    });
    p += 46 + nl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return files;
}
/* Cuantil con interpolación lineal (el de numpy, que usa Epoch). */
function quant(xs, q) {
  const a = xs.slice().sort((x, y) => x - y), i = (a.length - 1) * q, lo = Math.floor(i);
  return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo);
}

/* Todo sale ya calculado por Epoch en el zip de datos de su ajuste (el código está en github.com/epoch-research/eci-public).
   Mapa: cada evaluación tiene una dificultad (EDI) en la escala del ECI, el ECI al que se prevé recorrer la mitad del camino
   entre el azar y el techo de la prueba, y una pendiente; la nota prevista de un modelo es sigmoide(pendiente × (ECI − EDI)).
   Probabilidad de liderazgo: proporción de las réplicas bootstrap de Epoch (cada una repite el ajuste entero) en las que el
   primero sigue por delante. Las agrupaciones son las de eciBlock: país de la organización y pesos según Epoch. */
function ediBlock(buf, ctx) {
  const { parseCSV, fact, TODAY } = ctx;
  const z = unzip(buf), D = 'epoch_capabilities_index/';
  const read = name => { const f = z.get(name); if (!f) throw new Error(`falta ${name} en benchmark_data.zip`); return f().toString('utf8'); };
  const rows = parseCSV(read(D + 'eci_scores.csv')).map(r => ({
    model: r.Model, name: r['Display name'] || r.Model, eci: n(r.eci), lo: n(r.eci_ci_low), hi: n(r.eci_ci_high), date: r.date || null,
    org: r.Organization || null, country: r['Country (of organization)'] || null, group: r['Accessibility group'] || null
  })).filter(r => r.model && r.eci !== null);
  const boot = JSON.parse(read(D + 'eci_bootstraps.json'));
  const S = boot.model?.capability_samples, names = boot.model?.names || [];
  if (!boot.eci_scaled || !S?.length || S.some(s => s.length !== names.length)) throw new Error('réplicas del ECI con una forma inesperada');
  const idx = new Map(names.map((m, i) => [m, i]));
  // Comprobación: los cuantiles de las réplicas tienen que dar los intervalos que publica Epoch.
  const tail = (1 - (boot.ci_level ?? 0.9)) / 2;
  let dev = 0;
  for (const r of rows) {
    const i = idx.get(r.model);
    if (i === undefined || r.lo === null || r.hi === null) continue;
    const xs = S.map(s => s[i]);
    dev = Math.max(dev, Math.abs(quant(xs, tail) - r.lo), Math.abs(quant(xs, 1 - tail) - r.hi));
  }
  ctx.log(`Epoch, réplicas del ECI: ${S.length} × ${names.length} modelos; desviación máxima frente a los intervalos publicados: ${r2(dev)} puntos`);
  if (dev > 0.5) throw new Error(`las réplicas no reproducen los intervalos publicados (desviación de ${r2(dev)} puntos)`);

  // Líderes de hoy y probabilidad de que sigan por delante en las réplicas.
  const best = pred => rows.filter(pred).sort((a, b) => b.eci - a.eci)[0] || null;
  const isUS = r => countryCode(r.country) === 'US', isCN = r => countryCode(r.country) === 'CN';
  const isClosed = r => r.group === 'Closed weights', isOpen = r => r.group === 'Open weights';
  const top = best(() => true), us = best(isUS), cn = best(isCN), closed = best(isClosed), open = best(isOpen);
  const ids = pred => rows.filter(pred).map(r => idx.get(r.model)).filter(i => i !== undefined);
  const maxOf = (s, xs) => { let m = -Infinity; for (const i of xs) if (s[i] > m) m = s[i]; return m; };
  const share = k => r1(k / S.length * 100);
  const ahead = (A, B) => A.length && B.length ? share(S.filter(s => maxOf(s, A) > maxOf(s, B)).length) : null;
  const orgOf = new Map(rows.map(r => [r.model, firstOrg(r.org)]));
  const firstIn = new Map();
  for (const s of S) {
    let bi = 0;
    for (let i = 1; i < s.length; i++) if (s[i] > s[bi]) bi = i;
    const o = orgOf.get(names[bi]);
    if (o) firstIn.set(o, (firstIn.get(o) || 0) + 1);
  }
  const bestOrg = new Map();
  for (const r of rows) { const o = firstOrg(r.org); if (o && (!bestOrg.has(o) || r.eci > bestOrg.get(o).eci)) bestOrg.set(o, r); }
  const labs = [...bestOrg.values()].sort((a, b) => b.eci - a.eci);
  const lead = m => m ? { model: m.name, org: firstOrg(m.org), eci: m.eci } : null;
  const pf = (v, extra) => fact(v, 'epoch', PAGES.eci, TODAY, { samples: S.length, ...extra });
  const prob = {
    usCn: pf(ahead(ids(isUS), ids(isCN)), { lead: lead(us), rival: lead(cn), note: 'porcentaje de las réplicas de Epoch en las que el mejor modelo de EE. UU. supera al mejor chino' }),
    closedOpen: pf(ahead(ids(isClosed), ids(isOpen)), { lead: lead(closed), rival: lead(open), note: 'porcentaje de las réplicas de Epoch en las que el mejor modelo cerrado supera al mejor abierto' }),
    labs: pf(labs.length ? share(firstIn.get(firstOrg(labs[0].org)) || 0) : null, { lead: lead(labs[0]), note: 'porcentaje de las réplicas de Epoch en las que el mejor modelo de todos es de este laboratorio' }),
    labsFirst: labs.slice(0, 8).map(r => ({ org: firstOrg(r.org), p: share(firstIn.get(firstOrg(r.org)) || 0) }))
  };

  // Mapa de dificultad. Mejor resultado medido de cada evaluación, en la escala normalizada de Epoch (0 = azar, 1 = techo).
  const obs = new Map();
  for (const r of parseCSV(read(D + 'processed_data_for_eci.csv'))) {
    const v = n(r.performance);
    if (v === null || !r.benchmark) continue;
    const e = obs.get(r.benchmark) || { v: -1, model: null, models: new Set() };
    e.models.add(r.Model);
    if (v > e.v) Object.assign(e, { v, model: r.Model });
    obs.set(r.benchmark, e);
  }
  const bn = boot.benchmark?.names || [], DS = boot.benchmark?.difficulty_samples || [];
  const bidx = new Map(bn.map((b, i) => [b, i]));
  const shown = new Map(rows.map(r => [r.model, r.name]));
  const sig = x => 1 / (1 + Math.exp(-x));
  const pred = (b, m) => m ? r1(sig(b.slope * (m.eci - b.edi)) * 100) : null;
  let devEdi = 0;
  const map = parseCSV(read(D + 'edi_scores.csv'))
    .map(r => ({ name: r.benchmark_name, d: r.benchmark_release_date || null, edi: n(r.edi), slope: n(r.estimated_slope_scaled) }))
    .filter(b => b.name && b.edi !== null && b.slope !== null)
    .map(b => {
      const i = bidx.get(b.name), xs = i === undefined || !DS.length ? null : DS.map(s => s[i]), o = obs.get(b.name);
      if (xs) devEdi = Math.max(devEdi, Math.abs(quant(xs, 0.5) - b.edi));
      return {
        name: b.name, d: b.d, edi: r2(b.edi), lo: xs ? r2(quant(xs, tail)) : null, hi: xs ? r2(quant(xs, 1 - tail)) : null, slope: Math.round(b.slope * 1e4) / 1e4,
        pred: { top: pred(b, top), cn: pred(b, cn), open: pred(b, open) },
        best: o ? { v: r1(o.v * 100), model: shown.get(o.model) || o.model, models: o.models.size } : null
      };
    })
    .sort((a, b) => b.edi - a.edi);
  ctx.log(`Epoch, dificultad de ${map.length} evaluaciones; mediana de las réplicas frente a la EDI publicada: hasta ${r2(devEdi)} puntos`);
  // Frontera a lo largo del tiempo: cada vez que un modelo supera el mejor ECI publicado hasta su fecha.
  const line = [];
  let top0 = -Infinity;
  for (const r of rows.filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date) || b.eci - a.eci)) if (r.eci > top0) { top0 = r.eci; line.push({ d: r.date, v: r.eci, n: r.name }); }
  const above = top ? map.filter(b => b.edi > top.eci) : [];
  return {
    map: fact(map.length ? map : null, 'epoch', PAGES.eci, TODAY, { top: lead(top), cn: lead(cn), open: lead(open), line, samples: S.length, note: 'dificultad (EDI) de cada evaluación del ECI con su intervalo del 90 %, nota prevista por el modelo de Epoch para el mejor modelo, el mejor chino y el mejor abierto, y mejor resultado medido; porcentajes entre el azar (0) y el techo de la prueba (100)' }),
    open: fact(map.length && top ? above.length : null, 'epoch', PAGES.eci, TODAY, { of: map.length, names: above.map(b => b.name), top: lead(top), note: 'evaluaciones cuya dificultad supera el ECI del mejor modelo: el modelo de Epoch le prevé menos de la mitad del camino entre el azar y el techo' }),
    prob
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
    // Sin entradas nuevas al final, la serie sólo repite el último valor: se corta en el último trimestre con cambios.
    while (series.length > 1 && series[series.length - 1].mw === series[series.length - 2].mw) series.pop();
    plan = { today: at(TODAY), end2026: at('2026-12-31'), end2027: at('2027-12-31'), futureRows: future.length, centres: byDc.size, lastDate, series, seriesEnd: series[series.length - 1]?.d };
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
      models: rows.length, latestRelease, ultimo: latestRelease, detenida: latestRelease ? daysBetween(latestRelease, TODAY) > PARADA : null,
      note: 'horas de trabajo humano experto de las tareas que el agente completa con un 80 % de éxito; no son horas de autonomía'
    })
  };
}

/* ── Valoraciones del observatorio derivadas de reglas ─────────────────── */
const MONTH_DAYS = 30.44;
const addDays = (d, k) => new Date(Date.parse(d) + k * 86400e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400e3;
/* Una fecha prevista frente al plazo: ±90 días cuenta como a tiempo. */
const byDate = (reach, plazo) => { const k = daysBetween(plazo, reach); return k < -90 ? 'adelantado' : k > 90 ? 'retrasado' : 'compatible'; };
/* NVIDIA, ficha del DGX H100: 10,2 kW como máximo para 8 GPU de 700 W (5,6 kW). Resto del servidor sobre el TDP de las GPU. */
const SERVER_OVER_GPU = 10.2 / 5.6;
/* Desfase del rival más cercano en la fecha del plazo: días desde que el líder publicó por primera vez un modelo
   de su nivel. Rango previsto en meses [lo, hi]; un mes son 30,44 días. */
function monthsRule(F, st, lo, hi, { names = {}, sentido, pide, extra = '' }) {
  const es = F.dec, dia = F.day;
  if (!st?.lead || !st.rivals?.length) return { v: 'sin evidencia suficiente', texto: F.t('Faltan datos de ECI hasta la fecha del plazo.', 'ECI data is missing up to the deadline date.') };
  const name = k => names[k] || k, start = k => names[k] ? names[k].charAt(0).toUpperCase() + names[k].slice(1) : k;   // al empezar frase: «The US»
  const r = st.rivals[0], lr = r.leaderReached;
  const lag = lr ? Math.round((Date.parse(st.date) - Date.parse(lr.date)) / 86400e3) : null;
  const v = lag === null ? 'sin evidencia suficiente' : lag < lo * MONTH_DAYS ? 'adelantado' : lag > hi * MONTH_DAYS ? 'retrasado' : 'compatible';
  const L = name(st.lead.key), R = name(r.key), L0 = start(st.lead.key), R0 = start(r.key);
  const reach = !lr ? '' : lr.date > r.date
    ? F.t(` ${R} llegó a ese nivel el ${dia(r.date)}; ${L}, el ${dia(lr.date)}.`, ` ${R0} reached that level on ${dia(r.date)}; ${L}, on ${dia(lr.date)}.`)
    : F.t(` ${L} había llegado a ese nivel el ${dia(lr.date)}; ${R}, el ${dia(r.date)}.`, ` ${L0} had reached that level on ${dia(lr.date)}; ${R}, on ${dia(r.date)}.`);
  const cmp = { adelantado: F.t(`menos de ${lo} meses`, `less than ${lo} months`), retrasado: F.t(`más de ${hi} meses`, `more than ${hi} months`), compatible: F.t(`entre ${lo} y ${hi} meses`, `between ${lo} and ${hi} months`) }[v];
  return {
    v, sentido: sentido[v] || null,
    texto: F.t(`${L} iba primero (${st.lead.model}, ${es(st.lead.eci)} puntos ECI) y ${R} segundo (${r.model}, ${es(r.eci)}), a ${es(r.gap)} puntos${r.overlap ? ' con intervalos de confianza solapados' : ''}.${reach}${cmp ? ` Al vencer el plazo, ${R} tenía el nivel que ${L} había alcanzado ${cmp} antes; ${pide}.` : ''}${extra}`,
      `${L0} was first (${st.lead.model}, ${es(st.lead.eci)} ECI points) and ${R} second (${r.model}, ${es(r.eci)}), ${es(r.gap)} points behind${r.overlap ? ', with overlapping confidence intervals' : ''}.${reach}${cmp ? ` At the deadline, ${R} had the level that ${L} had reached ${cmp} earlier; ${pide}.` : ''}${extra}`)
  };
}
/* Valoraciones y estimaciones derivadas de reglas, escritas en el idioma del juego F (F.es o F.en). */
function checksIn(ind, TODAY, F) {
  const es = F.dec, dia = F.day, mes = F.month, T = F.t;
  const mill = v => T(`${es(Math.round(v / 1e5) / 10)} millones`, `${es(Math.round(v / 1e5) / 10)} million`);
  const sci = v => { const e = Math.floor(Math.log10(v)); return `${es((v / 10 ** e).toFixed(1))} × 10^${e}`; };
  const pc = x => T(`${x} %`, `${x}%`);
  const c = {};
  const swe = ind.bench?.swe85, mid = ind.bench?.sweMid2025;
  if (swe && mid) {
    const hit = swe.v && swe.v <= '2025-06-30';
    c.swe85 = mid.v === null && !swe.v
      ? { v: 'sin evidencia suficiente', texto: T('Epoch no tiene ejecuciones de SWE-bench Verified para modelos de esa época.', 'Epoch has no SWE-bench Verified runs for models of that period.') }
      : { v: hit ? 'compatible' : 'retrasado', texto: hit
        ? T(`Un modelo publicado antes del plazo (${swe.model}) llega al 85 % en las ejecuciones de Epoch.`, `A model published before the deadline (${swe.model}) reaches 85% in Epoch’s runs.`)
        : T(`Ningún modelo publicado antes del 30 jun 2025 llega al 85 % en las ejecuciones de Epoch (mejor: ${mid.v != null ? es(mid.v) : 'sin datos'} %). ${swe.v ? `El primero que lo alcanza se publicó el ${swe.v}.` : 'Ninguno lo alcanza todavía.'}`,
          `No model published before 30 Jun 2025 reaches 85% in Epoch’s runs (best: ${mid.v != null ? `${es(mid.v)}%` : 'no data'}). ${swe.v ? `The first to reach it was published on ${swe.v}.` : 'None reaches it yet.'}`) };
  }
  const s = ind.eci?.series?.points;
  if (s) {
    const closed = ind.eci.agent0?.closed, open = ind.eci.agent0?.open;
    if (closed && open) {
      const ok = open.eci >= closed.eci - SAME_ECI;
      c.openAgent0 = { v: ok ? 'compatible' : 'retrasado', texto: T(`Mejor modelo cerrado a 31 dic 2025: ${closed.model} (${es(closed.eci)}). Mejor de pesos abiertos a 30 abr 2026: ${open.model} (${es(open.eci)}). Regla: «iguala» si queda a menos de ${SAME_ECI} punto ECI, el criterio de Epoch.`,
        `Best closed model at 31 Dec 2025: ${closed.model} (${es(closed.eci)}). Best open-weight model at 30 Apr 2026: ${open.model} (${es(open.eci)}). Rule: “matches” if it is within ${SAME_ECI} ECI point, Epoch’s criterion.`) };
    } else c.openAgent0 = { v: 'sin evidencia suficiente', texto: T('Faltan datos de ECI para alguna de las dos fechas.', 'ECI data is missing for one of the two dates.') };
    const rv = ind.eci.agent0?.rivals;
    if (closed && rv) {
      const list = rv.map(r => T(`${firstOrg(r.org)} (${r.model}, ${es(r.eci)}, publicado el ${dia(r.date)})`, `${firstOrg(r.org)} (${r.model}, ${es(r.eci)}, published on ${dia(r.date)})`)).join('; ');
      c.variosAgent0 = { v: rv.length >= VARIOS ? 'compatible' : 'retrasado', texto: T(`Hasta el 30 abr 2026, ${rv.length ? `${rv.length} laboratorio${rv.length > 1 ? 's' : ''} distinto${rv.length > 1 ? 's' : ''} de ${firstOrg(closed.org)} publicaron un modelo a menos de ${SAME_ECI} punto ECI de ${closed.model} (${es(closed.eci)}) o por encima: ${list}` : `ningún laboratorio distinto de ${firstOrg(closed.org)} publicó un modelo a menos de ${SAME_ECI} punto ECI de ${closed.model} (${es(closed.eci)})`}. Regla: «varios» son al menos ${VARIOS}.`,
        `Up to 30 Apr 2026, ${rv.length ? `${rv.length} lab${rv.length > 1 ? 's' : ''} other than ${firstOrg(closed.org)} published a model within ${SAME_ECI} ECI point of ${closed.model} (${es(closed.eci)}) or above it: ${list}` : `no lab other than ${firstOrg(closed.org)} published a model within ${SAME_ECI} ECI point of ${closed.model} (${es(closed.eci)})`}. Rule: “several” means at least ${VARIOS}.`) };
    } else c.variosAgent0 = { v: 'sin evidencia suficiente', texto: T('Faltan datos de ECI hasta el 30 abr 2026.', 'ECI data is missing up to 30 Apr 2026.') };
  }
  const oa = ind.companies?.openai2025;
  if (oa) {
    if (oa.v === null) c.openaiRev2025 = { v: 'sin evidencia suficiente', texto: T('Epoch no recoge ingresos de OpenAI hasta esa fecha.', 'Epoch has no OpenAI revenue up to that date.') };
    else {
      const rel = oa.v / 18e9 - 1;
      const v = rel > REV_TOLERANCE ? 'adelantado' : rel < -REV_TOLERANCE ? 'retrasado' : 'compatible';
      c.openaiRev2025 = { v, texto: T(`Último dato de Epoch hasta el 31 dic 2025: ${es(Math.round(oa.v / 1e8) / 10)} mil millones de $ anualizados (${oa.asOf}), frente a 18 previstos (${rel >= 0 ? '+' : ''}${Math.round(rel * 100)} %; margen de «compatible»: ±${REV_TOLERANCE * 100} %).`,
        `Latest Epoch figure up to 31 Dec 2025: $${es(Math.round(oa.v / 1e8) / 10)} billion annualised (${oa.asOf}), against 18 predicted (${rel >= 0 ? '+' : ''}${Math.round(rel * 100)}%; margin for “consistent”: ±${REV_TOLERANCE * 100}%).`) };
    }
  }
  // Predicciones escritas en meses: se comparan fechas observadas, nunca una conversión de puntos en meses.
  const rv = ind.eci?.rivals2025;
  if (rv) c.rivales39 = monthsRule(F, rv, 3, 9, {
    pide: T('la predicción pedía entre 3 y 9 meses', 'the prediction called for between 3 and 9 months'),
    sentido: { adelantado: T('Los rivales iban más cerca de lo previsto', 'The rivals were closer than predicted'), retrasado: T('El líder iba más destacado de lo previsto', 'The leader was further ahead than predicted'), compatible: T('Distancia dentro de lo previsto', 'Gap within what was predicted') }
  });
  const uc = ind.eci?.usCn2026;
  if (uc) c.deepcent6 = monthsRule(F, uc, 4, 8, {
    names: { US: T('EE. UU.', 'the US'), CN: 'China' }, pide: T('«unos seis meses» se da por cumplido entre 4 y 8', '“about six months” is taken as met between 4 and 8'),
    sentido: { adelantado: T('China iba más cerca de lo previsto', 'China was closer than predicted'), retrasado: T('China iba más lejos de lo previsto', 'China was further behind than predicted'), compatible: T('Distancia como la prevista', 'Gap as predicted') },
    extra: T(' El 12 % del cómputo no se valora: no hay una estimación propia del cómputo chino.', ' The 12% of compute is not assessed: there is no estimate of its own for Chinese compute.')
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
      sentido: { adelantado: T('Llegaría antes de fin de 2026', 'Would arrive before the end of 2026'), compatible: T('Llegaría hacia fin de 2026', 'Would arrive around the end of 2026'), retrasado: T('Llegaría después de 2026', 'Would arrive after 2026') }[v],
      texto: T(`Entregados hasta el ${dia(lastEnd)}, último trimestre completo: ${mill(base)} de H100e${ch.cum.incomplete ? ` (${mill(ch.cum.v)} con lo que va del trimestre en curso)` : ''}. Al ritmo medio de los cuatro últimos trimestres completos (${mill(rate)} por trimestre), a fin de 2026 habría unos ${mill(proj)}, y los 40 millones se alcanzarían hacia ${mes(reach)}.`,
        `Delivered up to ${dia(lastEnd)}, the last complete quarter: ${mill(base)} H100e${ch.cum.incomplete ? ` (${mill(ch.cum.v)} with the current quarter so far)` : ''}. At the average pace of the last four complete quarters (${mill(rate)} per quarter), there would be about ${mill(proj)} by the end of 2026, and the 40 million would be reached around ${mes(reach)}.`)
    };
  }
  const plan = ind.dc?.plan, tdp = c.est_h100e40m?.tdpGW;
  if (plan?.end2026?.mw || tdp) {
    const lo = plan?.end2026?.mw ? plan.end2026.mw / 1000 : null, hi = tdp ? tdp * SERVER_OVER_GPU : null;
    const v = hi !== null && hi < 29 ? 'retrasado' : lo !== null && lo > 38 ? 'adelantado' : 'compatible';
    const gw = x => `${es(r1(x))} GW`;
    c.est_potencia2026 = {
      v, sentido: { retrasado: T('Por debajo de lo previsto', 'Below what was predicted'), adelantado: T('Por encima de lo previsto', 'Above what was predicted'), compatible: T('Dentro del rango estimado', 'Within the estimated range') }[v],
      texto: T(`${lo !== null ? `Cota inferior: según el calendario de Epoch, los ${plan.centres} centros que sigue tendrían ${gw(lo)} a fin de 2026.` : ''}${hi !== null ? ` Cota superior: los chips entregados sumarían unos ${gw(tdp)} de consumo nominal; con el resto del servidor (un DGX H100 consume 10,2 kW para 5,6 kW de GPU), unos ${gw(hi)} si funcionaran todos a la vez, sin contar la refrigeración.` : ''} La predicción, entre 29 y 38 GW, ${v === 'compatible' ? 'cae dentro de ese rango' : v === 'retrasado' ? 'queda por encima del máximo' : 'queda por debajo del mínimo'}.`.trim(),
        `${lo !== null ? `Lower bound: according to Epoch’s schedule, the ${plan.centres} data centres it tracks would have ${gw(lo)} by the end of 2026.` : ''}${hi !== null ? ` Upper bound: the delivered chips would add up to about ${gw(tdp)} of nominal consumption; with the rest of the server (a DGX H100 draws 10.2 kW for 5.6 kW of GPU), about ${gw(hi)} if they all ran at once, not counting cooling.` : ''} The prediction, between 29 and 38 GW, ${v === 'compatible' ? 'falls within that range' : v === 'retrasado' ? 'lies above the maximum' : 'lies below the minimum'}.`.trim())
    };
  }
  const y = ind.companies?.y2026;
  if (y?.v) {
    const rel = y.v / 35e9 - 1;
    const v = rel > REV_TOLERANCE ? 'adelantado' : rel < -REV_TOLERANCE ? 'retrasado' : 'compatible';
    c.est_ingresos2026 = {
      v, sentido: { adelantado: T('Superaría lo previsto', 'Would exceed what was predicted'), compatible: T('Como lo previsto', 'As predicted'), retrasado: T('Por debajo de lo previsto', 'Below what was predicted') }[v],
      texto: T(`Interpolando los ingresos anualizados que recoge Epoch y manteniendo el último (${es(Math.round(y.last.v / 1e8) / 10)} mil millones, ${dia(y.last.date)}) hasta fin de año, ${y.company} ingresaría unos ${es(Math.round(y.v / 1e8) / 10)} mil millones de $ en 2026, frente a 35 previstos (${rel >= 0 ? '+' : ''}${Math.round(rel * 100)} %). Si sigue creciendo, sería más.`,
        `Interpolating the annualised revenue that Epoch collects and holding the last figure ($${es(Math.round(y.last.v / 1e8) / 10)} billion, ${dia(y.last.date)}) until the end of the year, ${y.company} would earn about $${es(Math.round(y.v / 1e8) / 10)} billion in 2026, against 35 predicted (${rel >= 0 ? '+' : ''}${Math.round(rel * 100)}%). If it keeps growing, it would be more.`)
    };
  }
  // «Horizonte de tres semanas» (fin de 2026): los autores lo plantean con el horizonte al 80 % de METR, que ya no mide
  // por encima de 16 horas. Se contrasta con MirrorCode: «compatible» si el mejor resultado llega al MIRROR_UMBRAL.
  const ms = ind.bench?.mirrorSeries, mt = ind.metr?.sota, PLAZO3S = '2026-12-31';
  if (ms?.v?.length) {
    const upto = ms.v.filter(p => p.d <= PLAZO3S), best = upto.slice().sort((a, b) => b.v - a.v)[0];
    const reach = upto.find(p => p.v >= MIRROR_UMBRAL) || null, over = TODAY > PLAZO3S;
    const v = reach ? byDate(reach.d, PLAZO3S) : over ? 'retrasado' : 'todavía no evaluable';
    const metr = mt?.v != null ? `${mt.detenida ? T(`, y el último modelo que ha medido se publicó el ${dia(mt.ultimo)}`, `, and the last model it has measured was published on ${dia(mt.ultimo)}`) : ''}` : '';
    c.mirror80 = {
      v, sentido: { adelantado: T('Llegó al 80 % mucho antes del plazo', 'Reached 80% well before the deadline'), compatible: T('Llegó al 80 % a tiempo', 'Reached 80% on time'), retrasado: T('No llegó al 80 % a tiempo', 'Did not reach 80% on time') }[v] || null,
      texto: T(`Los autores lo plantean con el horizonte al 80 % de METR, que no mide con fiabilidad por encima de 16 horas${metr}. El observatorio lo contrasta con MirrorCode, de Epoch y METR: reimplementar programas enteros a partir de su comportamiento, con tareas que a un ingeniero le llevarían semanas. ${reach ? `El primer modelo que llega al ${MIRROR_UMBRAL} % es ${reach.n}, con un ${es(reach.v)} %, publicado el ${dia(reach.d)}.` : `Mejor resultado ${over ? 'hasta el plazo' : 'hasta hoy'}: ${es(best.v)} %, de ${best.n}, publicado el ${dia(best.d)}.`} Regla (lectura del observatorio): «compatible» si al vencer el plazo el mejor resultado llega al ${MIRROR_UMBRAL} %. MirrorCode sólo cubre programación y su puntuación no es el porcentaje de éxito en tareas de tres semanas.`,
        `The authors frame it with METR’s 80% horizon, which does not measure reliably above 16 hours${metr}. The observatory checks it against MirrorCode, from Epoch and METR: reimplementing whole programs from their behaviour, with tasks that would take an engineer weeks. ${reach ? `The first model to reach ${MIRROR_UMBRAL}% is ${reach.n}, with ${es(reach.v)}%, published on ${dia(reach.d)}.` : `Best result ${over ? 'up to the deadline' : 'to date'}: ${es(best.v)}%, from ${best.n}, published on ${dia(best.d)}.`} Rule (the observatory’s reading): “consistent” if, when the deadline expires, the best result reaches ${MIRROR_UMBRAL}%. MirrorCode only covers programming and its score is not the success rate on three-week tasks.`)
    };
    // Estimación: desde el récord actual, al ritmo de la recta que mejor se ajusta a los récords de los últimos 12 meses
    // (o a todos, si hay menos de dos).
    const recs = ms.v.filter(p => p.rec), yr = recs.filter(p => daysBetween(p.d, TODAY) <= 365), pts = yr.length >= 2 ? yr : recs;
    if (!reach && pts.length >= 2) {
      const t = pts.map(p => daysBetween(pts[0].d, p.d)), y = pts.map(p => p.v), k = pts.length;
      const mt_ = t.reduce((a, b) => a + b, 0) / k, my = y.reduce((a, b) => a + b, 0) / k;
      const slope = t.reduce((a, ti, i) => a + (ti - mt_) * (y[i] - my), 0) / t.reduce((a, ti) => a + (ti - mt_) ** 2, 0);
      if (slope > 0) {
        const first = pts[0], last = pts[pts.length - 1];
        const due = addDays(last.d, (MIRROR_UMBRAL - last.v) / slope), late = due <= TODAY;
        const atPlazo = Math.min(100, last.v + slope * daysBetween(last.d, PLAZO3S));
        const ev = byDate(late ? TODAY : due, PLAZO3S);
        c.est_mirror80 = {
          v: ev, sentido: { adelantado: T('Llegaría antes de lo previsto', 'Would arrive earlier than predicted'), compatible: T('Llegaría a tiempo', 'Would arrive on time'), retrasado: T('Llegaría tarde', 'Would arrive late') }[ev],
          texto: T(`El récord de MirrorCode ha pasado del ${es(first.v)} % (${dia(first.d)}) al ${es(last.v)} % (${dia(last.d)}) en ${k} récords, unos ${es(r1(slope * MONTH_DAYS))} puntos al mes. A ese ritmo desde el récord actual, ${late ? `el ${MIRROR_UMBRAL} % ya tocaría: bastaría con el próximo modelo puntero que mida Epoch` : `el ${MIRROR_UMBRAL} % llegaría hacia ${mes(due)}`}${atPlazo >= 100 ? ', y antes de fin de 2026 llegaría al techo de la prueba' : `, y a fin de 2026 estaría en un ${es(Math.round(atPlazo))} %`}.`,
            `The MirrorCode record has gone from ${es(first.v)}% (${dia(first.d)}) to ${es(last.v)}% (${dia(last.d)}) in ${k} records, about ${es(r1(slope * MONTH_DAYS))} points a month. At that pace from the current record, ${late ? `${MIRROR_UMBRAL}% would already be due: the next leading model that Epoch measures would be enough` : `${MIRROR_UMBRAL}% would be reached around ${mes(due)}`}${atPlazo >= 100 ? ', and before the end of 2026 it would hit the ceiling of the test' : `, and by the end of 2026 it would stand at ${es(Math.round(atPlazo))}%`}.`)
        };
      }
    }
  }
  const tr = ind.training;
  if (tr?.largest2025?.v) {
    const b = tr.largest2025, f = tr.first1e27;
    const v = b.v >= 1e27 ? 'compatible' : 'retrasado';
    c.est_flop27 = {
      v, sentido: v === 'compatible' ? T('Alcanzado según Epoch', 'Reached according to Epoch') : T('Por debajo según Epoch', 'Below according to Epoch'),
      texto: T(`De los modelos publicados hasta el 31 dic 2025 con cómputo estimado por Epoch, el mayor es ${b.model}${b.org ? ` (${b.org})` : ''}: unos ${sci(b.v)} FLOP${b.confidence ? ` (confianza de Epoch: ${b.confidence})` : ''}, el ${es(Math.round(b.v / 1e25))} % de 10^27.${tr.largest?.v && tr.largest.model !== b.model ? ` Hoy el mayor es ${tr.largest.model}${tr.largest.org ? ` (${tr.largest.org}, ${dia(tr.largest.date)})` : ''}, con unos ${sci(tr.largest.v)}.` : ''} ${f?.v ? `El primero que llega a 10^27 es ${f.model}, publicado el ${dia(f.v)}.` : 'Ninguno llega todavía a 10^27.'}`,
        `Of the models published up to 31 Dec 2025 with compute estimated by Epoch, the largest is ${b.model}${b.org ? ` (${b.org})` : ''}: about ${sci(b.v)} FLOP${b.confidence ? ` (Epoch confidence: ${b.confidence})` : ''}, ${es(Math.round(b.v / 1e25))}% of 10^27.${tr.largest?.v && tr.largest.model !== b.model ? ` Today the largest is ${tr.largest.model}${tr.largest.org ? ` (${tr.largest.org}, ${dia(tr.largest.date)})` : ''}, with about ${sci(tr.largest.v)}.` : ''} ${f?.v ? `The first to reach 10^27 is ${f.model}, published on ${dia(f.v)}.` : 'None reaches 10^27 yet.'}`)
    };
  }
  for (const k of Object.keys(c)) c[k].fecha = TODAY;
  return c;
}
/* Las valoraciones derivadas de reglas: el español en los campos y el inglés al lado, en i18n.en. */
export function checks(ind, TODAY) {
  const c = checksIn(ind, TODAY, F.es), e = checksIn(ind, TODAY, F.en);
  for (const k of Object.keys(c)) {
    const en = {};
    if (e[k]?.texto) en.texto = e[k].texto;
    if (e[k]?.sentido) en.sentido = e[k].sentido;
    c[k].i18n = { en };
  }
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

/* Probabilidades de las réplicas junto a cada distancia del ECI, sólo si las dos recogidas hablan de los mismos modelos
   (el zip y eci_scores.csv se publican por separado y podrían no estar a la par un día). */
function attachProb(ind, ctx) {
  const e = ind.eci, p = ind.edi?.prob;
  if (!e || !p || e.gapUsCn?.stale || ind.edi.map?.stale) return;
  const same = (a, b) => a && b && a.model === b.model;
  const put = (f, pr, pairs) => { if (f && pr?.v != null && pairs.every(([a, b]) => same(a, b))) f.prob = pr; else if (f) ctx.log(`probabilidad sin adjuntar a una distancia del ECI: los modelos no coinciden`); };
  put(e.gapUsCn, p.usCn, [[e.gapUsCn?.us, p.usCn.lead], [e.gapUsCn?.cn, p.usCn.rival]]);
  put(e.gapClosedOpen, p.closedOpen, [[e.gapClosedOpen?.closed, p.closedOpen.lead], [e.gapClosedOpen?.open, p.closedOpen.rival]]);
  put(e.gapLabs, p.labs, [[e.gapLabs?.first, p.labs.lead]]);
  const pFirst = new Map(p.labsFirst.map(r => [r.org, r.p]));
  for (const l of e.labs || []) if (pFirst.has(l.org)) l.pFirst = pFirst.get(l.org);
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
      status[srcKey] = failedStatus('la consulta falló; se conservan los valores anteriores', 'the check failed; previous values have been retained');
    }
  };
  if (ep && ep !== 'keep') {
    await run('eci', 'epoch', () => {
      const b = eciBlock(ep.rows, ctx);
      const byGroup = bestBy(ep.rows, r => r.group === 'Open weights' ? 'open' : r.group === 'Closed weights' ? 'closed' : null);
      b.agent0 = { closed: brief(byGroup('closed', '2025-12-31')), open: brief(byGroup('open', '2026-04-30')) };
      // «Varios modelos públicos de la competencia igualan o superan a Agent-0»: laboratorios distintos del de Agent-0 con
      // un modelo publicado hasta el 30 abr 2026 a menos de SAME_ECI puntos (o por encima); de cada uno, el primero en llegar.
      const a0 = b.agent0.closed;
      if (a0) {
        const firsts = new Map();
        for (const r of ep.rows.filter(r => r.date && r.date <= '2026-04-30' && r.eci >= a0.eci - SAME_ECI && firstOrg(r.org) !== firstOrg(a0.org)).sort((x, y) => x.date.localeCompare(y.date)))
          if (!firsts.has(firstOrg(r.org))) firsts.set(firstOrg(r.org), brief(r));
        b.agent0.rivals = [...firsts.values()];
      }
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
  await run('edi', 'epoch_eci', async () => ediBlock(await ctx.getBuf(URLS.benchZip), ctx));
  attachProb(ind, ctx);
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
export const IND_URLS = URLS;
