#!/usr/bin/env node
/* Comprueba que los datos generados y curados respetan las reglas de procedencia antes de publicarlos. */
import { readFile } from 'node:fs/promises';

const read = async p => JSON.parse(await readFile(new URL(`../${p}`, import.meta.url), 'utf8'));
const readOpt = p => read(p).catch(e => (e.code === 'ENOENT' ? null : Promise.reject(e)));
const c = await read('data/catalog.json');
const errors = [], warnings = [];
const isFact = f => f && typeof f === 'object' && 'v' in f;
function checkFact(f, where, sources = c.sources) {
  if (!isFact(f)) return errors.push(`${where}: no es un hecho con procedencia`);
  if (f.v === null) return;
  if (!f.src || !sources[f.src]) errors.push(`${where}: fuente desconocida (${f.src})`);
  if (!f.got || !/^\d{4}-\d{2}-\d{2}T/.test(f.got)) errors.push(`${where}: falta fecha de consulta`);
  if (!f.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(f.asOf)) errors.push(`${where}: falta fecha del dato`);
  if (typeof f.v === 'number' && (!Number.isFinite(f.v) || (f.v < 0 && !f.signed))) errors.push(`${where}: valor numérico inválido ${f.v}`);
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
  if (m.epochPub) checkFact(m.epochPub, `${w}.epochPub`);
  if (m.aa) for (const k of ['intelligence', 'coding', 'agentic', 'tps', 'ttft', 'release']) if (m.aa[k] !== undefined) checkFact(m.aa[k], `${w}.aa.${k}`);
  if (m.aa && !c.sources?.aa?.permiso) errors.push(`${w}: datos de Artificial Analysis sin permiso registrado en data/curated/permisos.json`);
  if (m.price?.in?.v > 1000 || m.price?.out?.v > 1000) errors.push(`${w}: precio fuera de rango`);
  if (!['laboratorio', 'proveedor', 'referencia'].includes(m.price?.basis)) errors.push(`${w}: criterio de precio no permitido ${m.price?.basis}`);
  if (m.price?.basis !== 'referencia' && !m.price?.provider) errors.push(`${w}: precio sin proveedor indicado`);
}
// Lo que queda fuera del catálogo: tipo conocido y nunca a la vez dentro y fuera.
for (const e of c.excluded || []) {
  if (!['imagen', 'audio', 'enrutador', 'seguridad'].includes(e.tipo)) errors.push(`excluido ${e.id}: tipo no válido ${e.tipo}`);
  if (ids.has(e.id)) errors.push(`excluido ${e.id}: también está en el catálogo`);
}
// Acontecimientos curados: fuente primaria con enlace, fecha, tipo conocido y modelo del catálogo.
const TIPOS_EV = ['anuncio', 'preview', 'producto', 'api', 'pesos', 'precio', 'retirada'];
for (const e of c.curatedEvents || []) {
  const w = `evento curado ${e.model || e.title}`;
  if (!/^https:\/\/\S+$/.test(e.url || '')) errors.push(`${w}: sin URL de la fuente primaria`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) errors.push(`${w}: fecha no válida ${e.date}`);
  if (!TIPOS_EV.includes(e.type)) errors.push(`${w}: tipo no válido ${e.type}`);
  if (e.model && !ids.has(e.model)) warnings.push(`${w}: el modelo no está en el catálogo`);
  if (!['lectura directa', 'buscador'].includes(e.verificacion)) errors.push(`${w}: verificación no válida`);
}

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
const IND_KEY = /^(aa|eci|edi|bench|dc|chips|companies|metr)\.[A-Za-z0-9]+$/;
const ESTADOS = ['abierta', 'confirmada', 'debilitada'];
const ESCALA = ['adelantado', 'compatible', 'retrasado', 'todavía no evaluable', 'sin evidencia suficiente'];
const REGLAS = ['swe85', 'openAgent0', 'variosAgent0', 'openaiRev2025', 'rivales39', 'deepcent6', 'mirror80'];
const EVID = ['medida', 'declarada', 'valoración de los autores', 'contexto'];
const need = (o, k, where, re) => { if (!o?.[k] || (re && !re.test(o[k]))) errors.push(`${where}: falta o no es válido «${k}»`); };

const car = await readOpt('data/curated/carrera.json');
if (!car) errors.push('falta data/curated/carrera.json');
for (const f of car?.frentes || []) {
  const w = `carrera.${f.id}`;
  for (const k of ['id', 'titulo', 'pregunta']) need(f, k, w);
  for (const k of f.indicadores || []) if (!IND_KEY.test(k)) errors.push(`${w}: clave de indicador no válida ${k}`);
  for (const k of f.sabemos || []) if (!(f.indicadores || []).includes(k)) errors.push(`${w}: «sabemos» usa ${k}, que no está entre sus indicadores`);
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
        if (e.momento && !['plazo', 'hoy'].includes(e.momento)) errors.push(`${w}: momento no válido ${e.momento}`);
        if (e.indicador) { if (!IND_KEY.test(e.indicador)) errors.push(`${w}: indicador no válido ${e.indicador}`); }
        else { need(e, 'texto', `${w}.evidencia`); need(e, 'url', `${w}.evidencia`, URL_RE); need(e, 'fecha', `${w}.evidencia`, DAYMONTH); }
      }
      const est = h.estimacion;
      if (est) {
        if (!['regla', 'autores', 'ritmo', 'fuente'].includes(est.metodo)) errors.push(`${w}: método de estimación no válido ${est.metodo}`);
        // Una estimación sin resultado (fuente caída) no bloquea la publicación: la ficha dice «sin estimación».
        if (est.metodo === 'regla' && !/^est_/.test(est.regla || '')) errors.push(`${w}: regla de estimación no válida ${est.regla}`);
        else if (est.metodo === 'regla' && ind && !ind.checks?.[est.regla]) warnings.push(`${w}: la estimación ${est.regla} no tiene resultado en indicadores.json`);
        if (est.metodo === 'fuente') { if (!ESCALA.includes(est.v)) errors.push(`${w}: estimación fuera de la escala ${est.v}`); need(est, 'texto', `${w}.estimacion`); need(est, 'fecha', `${w}.estimacion`, DAYMONTH); }
        if (est.metodo === 'ritmo' && !a7.ritmo?.puntos?.at(-1)?.rango) errors.push(`${w}: la estimación por ritmo necesita «rango» en la última estimación de ritmo`);
        for (const f of est.fuentes || []) need(f, 'url', `${w}.estimacion.fuentes`, URL_RE);
      }
      // Partes: lectura del observatorio que separa afirmaciones de una misma predicción; cada una con su valoración.
      const pids = new Set();
      for (const pt of h.partes || []) {
        const wp = `${w}.partes.${pt.id}`;
        need(pt, 'id', wp); need(pt, 'texto', wp);
        if (pids.has(pt.id)) errors.push(`${wp}: id duplicado`); pids.add(pt.id);
        if (pt.plazo) { need(pt, 'plazo', wp, DAY); need(pt, 'plazo_texto', wp); }
        const v = pt.valoracion;
        if (!v) errors.push(`${wp}: sin valoración`);
        else if (v.regla) { if (!REGLAS.includes(v.regla)) errors.push(`${wp}: regla no válida ${v.regla}`); else if (ind && !ind.checks?.[v.regla]) warnings.push(`${wp}: la regla ${v.regla} no tiene resultado en indicadores.json`); }
        else { if (!ESCALA.includes(v.v)) errors.push(`${wp}: valoración fuera de la escala ${v.v}`); need(v, 'fecha', wp, DAYMONTH); need(v, 'texto', wp); for (const f of v.fuentes || []) need(f, 'url', `${wp}.fuentes`, URL_RE); }
      }
      if ((h.partes || []).length === 1) errors.push(`${w}: una sola parte no divide nada`);
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

/* Cambios detectados (scripts/cambios.mjs): tipo conocido, clave, fechas de detección y, si la hay, de publicación, y evidencia enlazada. */
const KINDS = ['nuevo', 'precio', 'pesos', 'evaluacion', 'retirada', 'lider', 'version', 'indicador', 'valoracion', 'uso'];
const chg = await readOpt('data/changes.json'), evl = await readOpt('data/events-log.json');
for (const [where, list] of [['changes', chg?.items], ['events-log', evl?.events]]) for (const e of list || []) {
  const w = `${where} ${e.key || e.kind}`;
  if (!KINDS.includes(e.kind)) errors.push(`${w}: tipo de cambio desconocido ${e.kind}`);
  if (!e.key) errors.push(`${w}: sin clave`);
  if (!DAY.test(e.detected || '')) errors.push(`${w}: falta la fecha de detección`);
  if (e.published !== null && !DAY.test(e.published || '')) errors.push(`${w}: fecha de publicación no válida ${e.published}`);
  if (!/^(https:\/\/|#)\S+$/.test(e.src?.url || '')) errors.push(`${w}: sin enlace a la evidencia`);
  if (!e.what) errors.push(`${w}: sin descripción`);
  if (e.importancia && !e.importancia.porque) errors.push(`${w}: noticia sin motivo`);
}
/* El parte: hasta tres noticias de ese día, todas en la lista de cambios, que cumplen la regla y no repiten modelo ni hito. */
if (chg?.parte) {
  const p = chg.parte, byKey = new Map((chg.items || []).map(e => [e.key, e]));
  if (!DAY.test(p.fecha || '')) errors.push('parte: sin fecha');
  if (!Array.isArray(p.noticias) || p.noticias.length > 3) errors.push('parte: más de tres noticias');
  if (!p.reglas?.length) errors.push('parte: sin la regla publicada');
  const quien = new Set();
  for (const k of p.noticias || []) {
    const e = byKey.get(k);
    if (!e) { errors.push(`parte: ${k} no está en la lista de cambios`); continue; }
    if (!e.importancia || e.detected !== p.fecha || !e.titular) errors.push(`parte: ${k} no cumple la regla, no es de ese día o no tiene titular`);
    const q = e.model || e.data?.hito || e.key;
    if (quien.has(q)) errors.push(`parte: ${q} sale dos veces`);
    quien.add(q);
  }
  if (p.noticias?.length && p.ultima) errors.push('parte: con noticias no lleva «la última anterior»');
}

/* Versión inglesa: sólo avisos (nunca bloquea la recogida diaria); las pruebas (tests/i18n.test.mjs) sí exigen cobertura total. */
{
  const { cobertura } = await import('./i18n.mjs');
  const { faltan } = cobertura();
  for (const f of faltan) warnings.push(`::warning title=Traducción pendiente::${f.origen}: ${f.texto.length > 160 ? f.texto.slice(0, 160) + '…' : f.texto}`);
  const guids = x => (x || '').match(/<guid[^>]*>[^<]*<\/guid>/g) || [];
  const es = await readFile(new URL('../data/parte.xml', import.meta.url), 'utf8').catch(() => null);
  const en = await readFile(new URL('../data/parte.en.xml', import.meta.url), 'utf8').catch(() => null);
  if (es && !en) warnings.push('::warning title=RSS en inglés::falta data/parte.en.xml');
  else if (es && (!/<language>en/.test(en) || guids(es).join() !== guids(en).join())) warnings.push('::warning title=RSS en inglés::data/parte.en.xml no es inglés o no tiene las mismas noticias que data/parte.xml');
}
if (warnings.length) console.warn(`avisos:\n${warnings.join('\n')}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`validación correcta: ${c.models.length} modelos${ind ? ', indicadores' : ''}, ${car?.frentes?.length || 0} frentes, ${(a7?.lineas || []).reduce((n, l) => n + l.hitos.length, 0)} hitos`);
