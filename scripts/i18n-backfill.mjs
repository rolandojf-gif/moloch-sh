/* MOLOCH.SH · rellena la versión inglesa («i18n.en») de los datos ya publicados, sin red y sin tocar el español.

   El recolector escribe cada texto generado en los dos idiomas desde que existe scripts/textos.mjs; esto sirve para
   los datos anteriores a esa versión (o cuando se fusiona con datos más recientes de main). Vuelve a calcular con las
   mismas plantillas y las mismas cifras guardadas, y SÓLO añade los campos «i18n»: si algún texto en español saliera
   distinto del guardado, aborta sin escribir nada.

   Uso: node scripts/i18n-backfill.mjs [--comprobar]    (--comprobar: no escribe; sale con 1 si hay algo que rellenar) */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checks } from './indicadores.mjs';
import { novedades, vigilados } from './cambios.mjs';
import { enrich, parte, rss } from './parte.mjs';
import { AVISOS } from './textos.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), DATA = path.join(ROOT, 'data');
const read = async f => JSON.parse(await readFile(path.join(DATA, f), 'utf8'));
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'i18n' ? undefined : v));
const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));
const CHECK = process.argv.includes('--comprobar');
const problemas = [], stale = [];
const igual = (what, a, b) => { if (!same(a, b)) problemas.push(what); };

const ind = await read('indicadores.json'), ev = await read('events-log.json'), ch = await read('changes.json'), cat = await read('catalog.json');
const ai2027 = await read('curated/ai2027.json'), carrera = await read('curated/carrera.json');
const TODAY = ch.parte.fecha;

// 1 · Indicadores: veredictos y reglas de cada comprobación
const nuevoChecks = checks(ind.ind, Object.values(ind.checks)[0].fecha);
igual('indicadores.checks (es)', nuevoChecks, ind.checks);
const indOut = { ...ind, checks: Object.fromEntries(Object.entries(ind.checks).map(([k, c]) => [k, nuevoChecks[k]?.i18n ? { ...c, i18n: nuevoChecks[k].i18n } : c])) };

// 2 · Registro de cambios y vigilados
const models = cat.models, P = {
  byId: new Map(models.map(m => [m.id, m])), models, base: ch.base ? await read(`history/${ch.base}.json`) : null, leaders: (await read(`history/${TODAY}.json`)).leaders,
  ind: ind.ind, checks: ind.checks, ai2027, carrera,
  hitos: new Map((ai2027.lineas || []).flatMap(l => (l.hitos || []).map(h => [h.id, h]))), uso: cat.uso
};
const vig = vigilados(ind.ind);
igual('events-log.vigilados (es)', vig, ev.vigilados);
// La consecuencia se calculó el día de la detección: se vuelve a calcular y sólo se acepta si el español sale idéntico
// (si el contexto ya cambió, se deja la guardada y su inglés pasa por la memoria de traducción, con aviso).
const events = structuredClone(ev.events);
for (const e of events) if (e.consecuencia) e.consecuencia = undefined;
enrich(events, P, TODAY);
events.forEach((e, i) => { const o = ev.events[i]; if (o.consecuencia && e.consecuencia !== o.consecuencia) { e.consecuencia = o.consecuencia; delete e.i18n.en.consecuencia; stale.push(e.key); } });
igual('events-log.events (es)', events, ev.events);

// 3 · Hoy: altas (plantilla del recolector) y cambios de la ventana
const firstSeen = new Map(ch.items.filter(e => e.kind === 'nuevo').map(e => [e.model, e.detected]));
const nov = novedades(models, { hoyFrom: ch.since, firstSeen, TODAY, NOW_ISO: ch.generated }, () => ({}));
const items = structuredClone(ch.items);
for (const e of items) {
  const f = e.kind === 'nuevo' ? nov.find(n => n.key === e.key) : events.find(n => n.key === e.key);
  if (!f) { problemas.push(`changes.items: ${e.key} sin origen`); continue; }
  if (e.what !== f.what) problemas.push(`changes.items: ${e.key} (what es)`);
  if (f.i18n) e.i18n = f.i18n;
}
// Las altas se enriquecen aparte, con las cifras que ya guardan (puesto, precio…); el resto es copia del registro.
const altas = items.filter(e => e.kind === 'nuevo'), altasOrig = structuredClone(altas);
for (const e of altas) e.consecuencia = undefined;
enrich(altas, P, TODAY);
altas.forEach((e, i) => { const o = altasOrig[i]; if (o.consecuencia && e.consecuencia !== o.consecuencia) { e.consecuencia = o.consecuencia; delete e.i18n.en.consecuencia; stale.push(e.key); } });
igual('changes.items altas (es)', altas, altasOrig);
const parteOut = parte(items, TODAY, items.concat(events));
igual('changes.parte (es)', parteOut, ch.parte);

if (problemas.length) { console.error('El español recalculado no coincide con el guardado; no se escribe nada:\n - ' + problemas.join('\n - ')); process.exit(2); }

const chOut = { ...ch, parte: parteOut, items };
const evOut = { _doc: ev._doc, vigilados: vig, events };
const outs = [['indicadores.json', indOut], ['events-log.json', evOut], ['changes.json', chOut]];
const pend = [];
for (const [f, o] of outs) {
  const nuevo = JSON.stringify(o, null, f === 'indicadores.json' ? 0 : 1) + '\n', viejo = await readFile(path.join(DATA, f), 'utf8');
  if (nuevo !== viejo) pend.push(f);
  if (!CHECK) await writeFile(path.join(DATA, f), nuevo);
}
// RSS en inglés; el español se vuelve a generar sólo para comprobar que no cambia
const all = items.filter(e => e.kind === 'nuevo').concat(events), ctx = { NOW_ISO: ch.generated, TODAY };
const es = await readFile(path.join(DATA, 'parte.xml'), 'utf8');
if (rss(all, ctx) !== es) console.warn('aviso: el parte.xml recalculado difiere del guardado (no se toca)');
if (!CHECK) await writeFile(path.join(DATA, 'parte.en.xml'), rss(all, ctx, 'en'));
console.log(CHECK ? `por rellenar: ${pend.join(', ') || 'nada'}` : `rellenado: ${pend.join(', ') || 'nada que cambiar'}; parte.en.xml escrito`);
if (stale.length) console.log(`consecuencia no reproducible (contexto cambiado): ${stale.length}`);
if (AVISOS.size) { console.log(`${AVISOS.size} texto(s) sin traducción:`); for (const a of AVISOS) console.log(' · ' + a); }
process.exit(CHECK && pend.length ? 1 : 0);
