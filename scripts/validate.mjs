#!/usr/bin/env node
/* Comprueba que los datos generados y curados respetan las reglas de procedencia antes de publicarlos. */
import { readFile } from 'node:fs/promises';

const read = async p => JSON.parse(await readFile(new URL(`../${p}`, import.meta.url), 'utf8'));
const readOpt = p => read(p).catch(e => (e.code === 'ENOENT' ? null : Promise.reject(e)));
const c = await read('data/catalog.json');
const errors = [];
const isFact = f => f && typeof f === 'object' && 'v' in f;
function checkFact(f, where, sources = c.sources) {
  if (!isFact(f)) return errors.push(`${where}: no es un hecho con procedencia`);
  if (f.v === null) return;
  if (!f.src || !sources[f.src]) errors.push(`${where}: fuente desconocida (${f.src})`);
  if (!f.got || !/^\d{4}-\d{2}-\d{2}T/.test(f.got)) errors.push(`${where}: falta fecha de consulta`);
  if (!f.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(f.asOf)) errors.push(`${where}: falta fecha del dato`);
  if (typeof f.v === 'number' && (!Number.isFinite(f.v) || f.v < 0)) errors.push(`${where}: valor numérico inválido ${f.v}`);
}
if (!Array.isArray(c.models) || !c.models.length) errors.push('catálogo vacío');
const ids = new Set();
for (const m of c.models || []) {
  const w = m.id;
  if (ids.has(w)) errors.push(`${w}: duplicado`); ids.add(w);
  for (const k of ['weights', 'license', 'orCreated', 'ctx', 'reasoning', 'caching']) checkFact(m[k], `${w}.${k}`);
  for (const k of ['in', 'out', 'cacheRead', 'cacheWrite']) checkFact(m.price?.[k], `${w}.price.${k}`);
  if (![null, 'abiertos', 'cerrados'].includes(m.weights?.v)) errors.push(`${w}: pesos con valor no permitido ${m.weights?.v}`);
  if (m.identity !== 'confirmada' && m.lab?.country) errors.push(`${w}: identidad sin confirmar con país asignado`);
  if (m.epoch) for (const k of ['eci', 'release', 'access', 'swe']) checkFact(m.epoch[k], `${w}.epoch.${k}`);
  if (m.aa) for (const k of ['intelligence', 'coding', 'tps', 'ttft', 'release']) checkFact(m.aa[k], `${w}.aa.${k}`);
  if (m.price?.in?.v > 1000 || m.price?.out?.v > 1000) errors.push(`${w}: precio fuera de rango`);
}
for (const e of c.curatedEvents || []) if (!e.url) errors.push(`evento curado sin URL: ${e.title || e.model}`);

/* Indicadores: todo objeto con forma de hecho ({v, src}) debe llevar fuente conocida y fechas. */
const ind = await readOpt('data/indicadores.json');
if (ind) {
  const walk = (o, where) => {
    if (!o || typeof o !== 'object') return;
    if ('v' in o && 'src' in o) checkFact(o, where, ind.sources);
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') walk(v, `${where}.${k}`);
  };
  walk(ind.ind, 'indicadores');
}

/* Datos curados de «La carrera» y «AI 2027». */
const DAY = /^\d{4}-\d{2}-\d{2}$/, DAYMONTH = /^\d{4}-\d{2}(-\d{2})?$/, URL_RE = /^https:\/\/\S+$/;
const IND_KEY = /^(eci|bench|dc|chips|companies|metr)\.[A-Za-z0-9]+$/;
const ESTADOS = ['abierta', 'confirmada', 'debilitada'];
const ESCALA = ['adelantado', 'compatible', 'retrasado', 'todavía no evaluable', 'sin evidencia suficiente'];
const REGLAS = ['swe85', 'openAgent0', 'openaiRev2025'];
const EVID = ['medida', 'declarada', 'valoración de los autores', 'contexto'];
const need = (o, k, where, re) => { if (!o?.[k] || (re && !re.test(o[k]))) errors.push(`${where}: falta o no es válido «${k}»`); };

const car = await readOpt('data/curated/carrera.json');
if (!car) errors.push('falta data/curated/carrera.json');
for (const f of car?.frentes || []) {
  const w = `carrera.${f.id}`;
  for (const k of ['id', 'titulo', 'pregunta']) need(f, k, w);
  for (const k of f.indicadores || []) if (!IND_KEY.test(k)) errors.push(`${w}: clave de indicador no válida ${k}`);
  if (!f.hechos?.length) errors.push(`${w}: sin hechos`);
  f.hechos?.forEach((h, i) => {
    const wh = `${w}.hechos[${i}]`;
    need(h, 'texto', wh); need(h, 'fuente', wh); need(h, 'url', wh, URL_RE); need(h, 'consulta', wh, DAY);
    if (h.fecha !== null && !DAYMONTH.test(h.fecha || '')) errors.push(`${wh}: fecha del dato no válida (usa null si la fuente no la da)`);
    if (!['lectura directa', 'buscador'].includes(h.verificacion)) errors.push(`${wh}: verificación no válida`);
  });
  const l = f.lectura;
  if (!l) { errors.push(`${w}: sin lectura`); continue; }
  for (const k of ['hipotesis', 'gana', 'pierde', 'desplaza', 'reforzaria', 'debilitaria']) need(l, k, `${w}.lectura`);
  need(l, 'desde', `${w}.lectura`, DAY);
  if (!ESTADOS.includes(l.estado)) errors.push(`${w}: estado de la lectura no permitido ${l.estado}`);
  const hist = l.historial || [];
  if (!hist.length || hist[0].estado !== 'abierta') errors.push(`${w}: la lectura debe empezar abierta (ninguna tesis nace confirmada)`);
  if (hist.length && hist[hist.length - 1].estado !== l.estado) errors.push(`${w}: el estado no coincide con la última entrada del historial`);
  for (let i = 1; i < hist.length; i++) if (hist[i].fecha < hist[i - 1].fecha) errors.push(`${w}: historial desordenado`);
  for (const h of hist) if (!ESTADOS.includes(h.estado) || !DAY.test(h.fecha || '')) errors.push(`${w}: entrada de historial no válida`);
}

const a7 = await readOpt('data/curated/ai2027.json');
if (!a7) errors.push('falta data/curated/ai2027.json');
if (a7) {
  need(a7.escenario, 'url', 'ai2027.escenario', URL_RE); need(a7.escenario, 'publicado', 'ai2027.escenario', DAY);
  if ((a7.escenario?.desenlaces || []).length !== 2) errors.push('ai2027.escenario: deben constar los dos desenlaces');
  if (!/probabilidad/i.test(a7.ritmo?.nota || '')) errors.push('ai2027.ritmo: falta aclarar que el ritmo no es una probabilidad');
  for (const p of a7.ritmo?.puntos || []) { need(p, 'fecha', 'ai2027.ritmo', DAYMONTH); need(p, 'url', 'ai2027.ritmo', URL_RE); }
  for (const r of a7.revisiones || []) {
    need(r, 'fecha', 'ai2027.revisiones', DAYMONTH); need(r, 'url', 'ai2027.revisiones', URL_RE);
    if (!['texto', 'valoracion'].includes(r.tipo)) errors.push(`ai2027.revisiones: tipo no válido ${r.tipo}`);
  }
  for (const v of a7.vigencia || []) { need(v, 'url', 'ai2027.vigencia', URL_RE); need(v, 'fecha', 'ai2027.vigencia', DAYMONTH); }
  const seen = new Set();
  for (const l of a7.lineas || []) {
    need(l, 'comprobar', `ai2027.${l.id}`);
    for (const h of l.hitos || []) {
      const w = `ai2027.${l.id}.${h.id}`;
      if (seen.has(h.id)) errors.push(`${w}: id duplicado`); seen.add(h.id);
      // La predicción original no se borra nunca: las revisiones van aparte.
      for (const k of ['titulo', 'seccion', 'prediccion', 'plazo_texto']) need(h, k, w);
      need(h, 'url', w, URL_RE); need(h, 'plazo', w, DAY);
      for (const r of h.revisiones || []) { need(r, 'fecha', `${w}.revisiones`, DAYMONTH); need(r, 'url', `${w}.revisiones`, URL_RE); need(r, 'texto', `${w}.revisiones`); }
      for (const e of h.evidencia || []) {
        if (!EVID.includes(e.tipo)) errors.push(`${w}: tipo de evidencia no válido ${e.tipo}`);
        if (e.indicador) { if (!IND_KEY.test(e.indicador)) errors.push(`${w}: indicador no válido ${e.indicador}`); }
        else { need(e, 'texto', `${w}.evidencia`); need(e, 'url', `${w}.evidencia`, URL_RE); need(e, 'fecha', `${w}.evidencia`, DAYMONTH); }
      }
      const vals = h.valoraciones || [];
      if (vals.filter(v => v.quien === 'observatorio').length !== 1) errors.push(`${w}: debe tener exactamente una valoración del observatorio`);
      for (const v of vals) {
        if (!['autores', 'observatorio'].includes(v.quien)) errors.push(`${w}: valoración de quién ${v.quien}`);
        if (v.regla) { if (v.quien !== 'observatorio' || !REGLAS.includes(v.regla)) errors.push(`${w}: regla no válida ${v.regla}`); if (ind && !ind.checks?.[v.regla]) errors.push(`${w}: la regla ${v.regla} no tiene resultado en indicadores.json`); }
        else {
          if (!ESCALA.includes(v.v)) errors.push(`${w}: valoración fuera de la escala ${v.v}`);
          need(v, 'fecha', `${w}.valoraciones`, DAYMONTH);
          if (v.quien === 'autores') need(v, 'url', `${w}.valoraciones`, URL_RE);
        }
      }
    }
  }
}
if (ind) for (const [k, ch] of Object.entries(ind.checks || {})) if (!ESCALA.includes(ch.v)) errors.push(`indicadores.checks.${k}: valoración fuera de la escala ${ch.v}`);

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`validación correcta: ${c.models.length} modelos${ind ? ', indicadores' : ''}, ${car?.frentes?.length || 0} frentes, ${(a7?.lineas || []).reduce((n, l) => n + l.hitos.length, 0)} hitos`);
