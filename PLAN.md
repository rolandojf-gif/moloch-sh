# PLAN.md · Plan de ejecución de mejoras de MOLOCH.SH

Documento autónomo de ejecución para agentes de código: **una tarea atómica por sesión**.
Antes de empezar cualquier tarea, lee `CLAUDE.md` completo.

## Restricciones globales para todas las sesiones
- **Cero red en desarrollo**: nunca ejecutes `node scripts/collect.mjs` sin `FIXTURES=...` en un directorio temporal; hacerlo consume el cupo diario real de `AA_API_KEY`.
- **Cero edición manual de generados**: nunca edites ni hagas commit de `data/catalog.json`, `data/indicadores.json`, `data/changes.json`, `data/events-log.json`, `data/historia.json`, `data/history/*.json`, `data/parte.xml`, `data/parte.en.xml` ni `data/og.png`. Solo `data/curated/**` y `data/i18n/**` admiten edición manual cuando proceda.
- **Fuera de alcance de este plan**: optimizaciones de carga/renderizado en navegador (`js/app.js`), alertas nuevas de fallos parciales en `.github/workflows/collect.yml` y cambios en la política de cupo `AA_REUSE_H`.
- **Si algún punto de este plan chocara con el código real**: parar y preguntar antes de improvisar.

---

## Tarea 1 · Mejora 1: separar `'reuse'` de `'keep'` en Artificial Analysis y validar coherencia `status`/`stale`
- **Objetivo**: Evitar que reutilizar una consulta reciente de Artificial Analysis (`aaReuse`) marque `stale: true` en los hechos `aa` y en los candidatos `aaOnly`, y prohibir en validación cualquier hecho `stale` cuya fuente figure `ok: true`.
- **Modelo recomendado**: `Opus` (toca `scripts/collect.mjs` y las invariantes de estado del catálogo e indicadores).
- **Ficheros y funciones afectados**:
  - `scripts/collect.mjs`: `buildModel` (`aaMatch`, líns. `534–558`), `staleCopy` (lín. `622`), `main` (`aaReuse` en líns. `707–725`, paso de `aaMatch` en lín. `755`, rescate de `aaOnly` en líns. `761–777`, `catalog.schema` en lín. `891`).
  - `scripts/validate.mjs`: `checkFact` y bucle de `c.models` (líns. `10–41`), recorrido recursivo de `ind.ind` (líns. `59–67`).
  - `tests/recogida.test.mjs`: prueba principal y nuevo subtest de reutilización con `FIXTURES` (líns. `14–69`).
- **Qué cambiar**:
  - En `scripts/collect.mjs`:
    - En `main` (lín. `710`), permitir activar la rama de reutilización en pruebas aisladas cambiando `!FIXTURES` por `(!FIXTURES || process.env.AA_TEST_REUSE === '1')`.
    - Separar el centinela de reutilización (`aaReuse === true`) del de fallo de red (`loadAA` devuelve `undefined`): pasar `aaMatch = 'reuse'` a `buildModel` (lín. `755`).
    - En `buildModel` (líns. `534–538`), añadir la rama `aaMatch === 'reuse'` copiando `prev?.aa` y sus subobjetos de hecho **eliminando explícitamente** cualquier propiedad `stale` heredada (necesario porque el `data/catalog.json` actual ya tiene `stale: true` en sus 146 modelos con AA). Mantener `aaMatch === 'keep'` (con `stale: true`) solo cuando `loadAA` haya fallado.
    - En el rescate de `aaOnly` (líns. `774–776`), si `aaReuse` es `true`, clonar los modelos `p.aaOnly` previos limpiando `stale` (`freshCopy`); usar `staleCopy(p)` únicamente en fallo real (`!aaReuse && aaRows === undefined`), ajustando `staleCopy` (lín. `622`) para marcar `stale: true` solo en hechos con `v !== null` (evitando marcar `orCreated` o `price.*` vacíos).
    - Incrementar `catalog.schema` de `2` a `3` en `main` (lín. `891`).
  - En `scripts/validate.mjs`:
    - Validar coherencia entre `stale` y `status`: en `catalog.json`, si `c.status?.aa?.ok` es `true`, rechazar `m.aa?.stale` y cualquier hecho con `src === 'aa'` y `stale: true`; aplicar la misma regla a `openrouter` (excepto `endpoints`/`endpointsMeta`, consultados por modelo), `epoch` (excepto `swe` si `c.status.epoch?.note` indica fallo parcial) y `uso` (`c.uso`/`c.usoMes`), admitiendo `stale: true` en `hf` solo si `!c.status?.hf?.ok || c.status.hf.failed > 0`.
    - En `indicadores.json`, asociar cada subárbol de `ind.ind` a su clave real en `ind.status` (`eci` y `bench` → `epoch`, `edi` → `epoch_eci`, `dc` → `epoch_dc`, `chips` → `epoch_chips`, `companies` → `epoch_companies`, `metr` → `metr`, `training` → `epoch_models`, `aa` → `c.status?.aa`) y prohibir `stale: true` dentro de bloques cuyo estado sea `ok: true`.
    - Registrar incumplimientos en `errors` cuando `(c.schema || 0) >= 3` y en `warnings` cuando `c.schema < 3` (así `node scripts/validate.mjs` pasa en local sobre el snapshot previo de `main` y bloquea cualquier recogida nueva defectuosa).
- **Qué NO tocar**: `AA_REUSE_H`, `AA_PAGES`, `js/fmt.js` ni los ficheros generados de `data/`.
- **Criterio de aceptación verificable**: `node --test tests/*.test.mjs && node scripts/validate.mjs` sale con código `0`; en un catálogo generado con `schema >= 3` y `status.aa.ok === true` hay exactamente `0` ocurrencias de `"stale":true` en bloques `aa`.
- **Pruebas nuevas a escribir**:
  - En `tests/recogida.test.mjs`: `test('reutilización de AA: conserva puntuaciones sin stale, limpia stale heredado y validate bloquea incoherencias')`, sembrando `stale: true` en `aa` del catálogo temporal previo, borrando el fixture de AA y corriendo `collect.mjs` con `AA_TEST_REUSE=1`; comprueba `cat.status.aa.reused === true`, `0` banderas `stale` en `m.aa` y `aaOnly`, y fallo (`status !== 0`) de `validate.mjs` al forzar `stale: true` sobre un hecho `aa` con `schema >= 3`.
- **Dependencias**: Ninguna.

---

## Tarea 2 · Mejora 2 (parte A): eliminar duplicados con prefijo de laboratorio y colisiones de `aa.slug` en `emparejar.mjs`
- **Objetivo**: Reconocer prefijos de nombre de laboratorio en `scripts/emparejar.mjs` para no crear falsos modelos `aaOnly` (`tencent/tencent-hy4`) y deshacer las colisiones donde dos modelos de OpenRouter comparten el mismo `aa.slug`.
- **Modelo recomendado**: `Sonnet` (lógica pura y determinista acotada a `scripts/emparejar.mjs`, `scripts/validate.mjs` y `tests/unidad.test.mjs`).
- **Ficheros y funciones afectados**:
  - `scripts/emparejar.mjs`: `norm` (líns. `4–9`), `matchAA` (líns. `16–38`), `sameModelName` y `aaOnlyCandidates` (líns. `53–94`), más nueva función exportada `matchCatalogAA`.
  - `scripts/validate.mjs`: bucle de validación de `c.models` (líns. `20–41`).
  - `tests/unidad.test.mjs`: bloque de emparejamiento y candidatos `aaOnly` (líns. `111–142`).
- **Qué cambiar**:
  - En `scripts/emparejar.mjs`:
    - Añadir `stripLab(s, lab)` que retire al inicio palabra completa coincidente con `lab.id`, `lab.aa_creator` o `lab.name` sin paréntesis (p. ej. `Tencent Hy4` → `Hy4`) únicamente cuando queden tokens de modelo detrás.
    - Definir `strictNorm(s, lab = null)` (normaliza puntuación/espacios y aplica `stripLab`, **conservando** `preview|instruct|chat|latest|exp|experimental`) y actualizar `norm(s, lab = null)` para aplicar `stripLab` antes de quitar calificadores, manteniendo compatibilidad total cuando `lab` no se pasa.
    - Exportar `matchCatalogAA(orModels, labs, aaRows, overrides, creatorIds)` → `Map<modelId, match | null>`: obtiene candidatos de cada modelo y, cuando varios modelos del catálogo compitan por el mismo `row.slug` (o mismo grupo base de AA), adjudica el emparejamiento solo al ganador por orden de especificidad: (1) `overrides` manual; (2) concordancia de calificadores (`preview`, `exp`, `experimental`, `chat`, `instruct`, `latest`) entre `{m.name, m.id}` y `{aaBase(row), row.slug}` — esto asigna `hy3-preview` a `tencent/hy3-preview`, `gemini-3-1-flash-lite-preview` a `google/gemini-3.1-flash-lite-preview`, `gpt-5-2` a `openai/gpt-5.2`, `deepseek-v3-2-0925` (`DeepSeek V3.2 Exp`) a `deepseek/deepseek-v3.2-exp`, y `tencent-hy4` (`Tencent Hy4`) a `tencent/hy4` en vez de `tencent/hy4-preview`; (3) coincidencia `strictNorm` exacta y menor distancia entre `orCreated` y `row.release_date`. Los demás competidores reciben `null`. Conservar las cadenas `how` existentes (`'manual'`, `'nombre exacto'`, `'variante'`, `` `configuración de mayor índice entre ${pool.length}` ``) para no requerir entradas nuevas en `data/i18n/en/notas.json`.
    - Actualizar `sameModelName(aaName, catName, lab = null)` y `aaOnlyCandidates` (líns. `53–94`) pasando el `lab` correspondiente para descartar `Tencent Hy4` cuando `Hy4` ya está en el catálogo.
  - En `scripts/validate.mjs` (líns. `20–41`):
    - Detectar `m.aa?.slug` duplicados entre modelos de `c.models` y modelos `m.aaOnly` equivalentes (`sameModelName`) a otro modelo del mismo laboratorio en OpenRouter; registrar en `errors` si `(c.schema || 0) >= 4` y en `warnings` si `< 4`.
- **Qué NO tocar**: `scripts/collect.mjs` (se integra en Tarea 3), `data/curated/overrides.json` ni `data/`.
- **Criterio de aceptación verificable**: `node --test tests/*.test.mjs && node scripts/validate.mjs` sale con código `0`, superando la batería de colisiones y prefijos sin romper los tests existentes de `sameModelName` y `aaOnlyCandidates`.
- **Pruebas nuevas a escribir**:
  - En `tests/unidad.test.mjs`: `test('matchCatalogAA y aaOnlyCandidates: prefijo de laboratorio y unicidad de aa.slug sin colisiones')`, cubriendo las 5 parejas conflictivas reales (`Hy4`/`Hy4 preview`/`Tencent Hy4`, `Hy3`/`Hy3 preview`, `Gemini 3.1 Flash Lite`/`Preview`, `GPT-5.2`/`GPT-5.2 Chat`, `DeepSeek V3.2`/`DeepSeek V3.2 Exp`).
- **Dependencias**: Ejecutar después de Tarea 1 (ambas amplían `scripts/validate.mjs`).

---

## Tarea 3 · Mejora 2 (parte B): conectar `matchCatalogAA` y suprimir eventos/noticias falsas en la primera recogida
- **Objetivo**: Integrar `matchCatalogAA` en `scripts/collect.mjs` y normalizar en memoria la instantánea previa antes de `detectChanges` para que la primera recogida tras el cambio no publique noticias ni eventos que solo reflejan la corrección metodológica.
- **Modelo recomendado**: `Opus` (modifica `scripts/collect.mjs`, enlace `preApi`, cálculo de base previa de `scripts/cambios.mjs` y limpieza de `events-log.json`).
- **Ficheros y funciones afectados**:
  - `scripts/collect.mjs`: importación (lín. `37`), emparejamiento en `main` y rama `aaReuse` (líns. `710–777`), enlace `preApi` (líns. `780–788`), carga de `base` y llamada a `detectChanges` (líns. `841–888`), `catalog.schema: 4` (lín. `891`), filtrado de `evLog.events` (líns. `925–938`).
  - `scripts/cambios.mjs`: `novedades` (líns. `302–332`, parámetro opcional `repairedAA` para no promocionar a top 20 retroactivo un alta de días previos).
  - `tests/recogida.test.mjs`: nueva prueba de extremo a extremo de transición silenciosa.
- **Qué cambiar**:
  - En `scripts/collect.mjs`:
    1. Reemplazar `matchAA` individual (lín. `755`) por el mapa devuelto por `matchCatalogAA(orModels, labs, aaRows, overrides, aaCreators)`. Si `aaReuse` es `true` y `(prevCatalog?.schema || 0) < 4`, reconstruir filas AA a partir de `prevCatalog.models.filter(p => p.aa)` y aplicar `matchCatalogAA` + `aaOnlyCandidates` conservando los hechos `p.aa` previos, de modo que también una recogida en rama con reutilización elimine `tencent/tencent-hy4` y las 4 colisiones. Subir `catalog.schema` a `4` (lín. `891`).
    2. Blindar `preApi` (líns. `780–788`): enlazar `was` de `prevAO` únicamente si `(!prev || prev.aaOnly || prev.preApi)` **y** `!(m.orCreated.v && m.orCreated.v <= was.aaOnly.since)`. Evita que `tencent/hy4` (`orCreated: 2026-11-04`, ya presente en OpenRouter antes que `tencent/tencent-hy4` con `since: 2026-11-05`) reciba `preApi` falso o pase a `sub: 'llega-api'`.
    3. **Normalizar `base` en memoria (`normalizeBaseAA`, sin tocar `data/history/AAAA-MM-DD.json` en disco)** antes de `detectChanges` (líns. `843–888`): cuando existan `base` y `prevCatalog?.models?.length`, clonar `base` en `baseForDiff` reaplicando `matchCatalogAA` y `aaOnlyCandidates` sobre los modelos de `prevCatalog` con las puntuaciones AA ya conocidas en `base` (misma `base.aaIndexVersion`):
       - Actualizar `baseForDiff.models[id].ii` en los modelos reemparejados (`tencent/hy4` recibe `34.6` en `baseForDiff`; los hermanos que pierden colisión quedan con `ii: null`) y suprimir de `baseForDiff.models` los duplicados `ao: 1` absorbidos (`tencent/tencent-hy4`).
       - Recalcular `baseForDiff.leaders.aa` con `leaders()` y `baseForDiff.ind` (`aaUsCn`, `aaClosedOpen`, `aaLabs`, `aaRate12m`) con `aaIndicators()` + `indSnapshot()` sobre ese catálogo previo normalizado, pasando `base: baseForDiff` tanto a `detectChanges` como a `P`.
       - Pasar a `detectChanges` el conjunto `repairedAA` (ids que tenían `base.models[id]?.ii == null` y pasaron a `baseForDiff.models[id]?.ii != null`) para omitir `rk(m.id)` en `novedades()` si su alta cae aún dentro de los 7 días de `hoyFrom`, evitando que entren retroactivamente al RSS como noticia top 20.
    4. En la limpieza de `evLog.events` (líns. `926–938`), descartar entradas `kind === 'evaluacion' && e.data?.field === 'ii'` cuyo `e.model` siga en el catálogo actual con `m.aa === null` (limpia la evaluación duplicada por colisión del `2026-11-05`).
- **Qué NO tocar**: ningún archivo bajo `data/` en git ni las reglas de precios/pesos/ECI de `detectChanges`.
- **Criterio de aceptación verificable**: `node --test tests/*.test.mjs && node scripts/validate.mjs` pasa con código `0`; en la prueba de transición con fixtures, `changes.json`, `events-log.json` y `parte.noticias` registran `0` eventos derivados del reemparejamiento (`evaluacion|...|ii`, `lider`, `retirada`, `preApi`, `indicador|aa*`) y `validate.mjs` confirma `schema === 4` sin duplicados.
- **Pruebas nuevas a escribir**:
  - En `tests/recogida.test.mjs`: `test('primera recogida tras corregir emparejamiento AA: cero eventos ni noticias espurias')`, sembrando en el directorio temporal un `catalog.json` (`schema: 3`) y `history/<ayer>.json` con duplicado `aaOnly` top 20 (`tencent/tencent-hy4`, `ii: 34.6`), `tencent/hy4` (`ii: null`, `orCreated` anterior) y pareja en colisión (`hy3`/`hy3-preview`), verificando tras `collect.mjs` + `validate.mjs` que `tencent/hy4` tiene `ii === 34.6` y `preApi === undefined`, que `tencent/tencent-hy4` no existe ni genera `retirada`, que no aparece `evaluacion|tencent/hy4|ii` ni cambio de `lider`/`indicador|aa*`, y que una novedad real del fixture sí se detecta.
- **Dependencias**: Requiere Tarea 1 y Tarea 2.

---

## Tarea 4 · Diagnóstico con descarga manual por Rolando y corrección de `epoch_eci` / `ediBlock`
- **Objetivo**: Diagnosticar en local sobre `benchmark_data.zip` el fallo de `ediBlock` iniciado el `2026-11-05` y adaptar `scripts/indicadores.mjs` al formato vigente de Epoch manteniendo intacta la comprobación estadística.
- **Modelo recomendado**: `Opus` (toca `scripts/indicadores.mjs`, lector binario ZIP y validación de réplicas bootstrap).
- **Evidencia verificada sin red en el repositorio**:
  - Comparando `c12f139` (`2026-11-04`, último `epoch_eci.ok === true`) con `ec445ac` (`2026-11-05`, primer `ok: false`), **no hubo ningún commit de código** en el repositorio; ese día Epoch publicó una revisión mayor del ECI (`epochFrontier.n`: `271 → 253`, salieron `36` modelos, entraron `2` y las puntuaciones existentes cambiaron hasta `33,21` puntos).
  - `collectIndicators` (`scripts/indicadores.mjs`, líns. `768–772`) imprime `e.message` solo en stdout y guarda en `data/indicadores.json` un `failedStatus` genérico sin `lastOk`, mientras que `tests/fixtures/mini.zip` (`270` B) solo contiene dos entradas artificiales (`carpeta/plano.txt`, `carpeta/datos.csv`). **Confirmar la causa exacta exige que Rolando descargue manualmente `https://epoch.ai/data/benchmark_data.zip` (p. ej. en `/tmp/benchmark_data.zip`)** antes de ejecutar esta tarea.
- **Ficheros y funciones afectados**:
  - `scripts/indicadores.mjs`: `URLS.benchZip` (lín. `32`), `unzip` y `quant` (líns. `236–259`), `ediBlock` (líns. `266–359`), `collectIndicators` (líns. `766–805`).
  - `tests/unidad.test.mjs`: bloque de pruebas de `unzip` y nueva prueba de `ediBlock` (junto a lín. `76`).
- **Comandos exactos de inspección local sobre `/tmp/benchmark_data.zip` (sin red)**:

```bash
# 1. Listar entradas y verificar que unzip() abre el directorio central sin red
node --input-type=module -e "
import fs from 'node:fs';
import { unzip } from './scripts/indicadores.mjs';
const z = unzip(fs.readFileSync('/tmp/benchmark_data.zip'));
console.log([...z.keys()]);
"

# 2. Inspeccionar cabeceras CSV y claves/dimensiones de eci_bootstraps.json
node --input-type=module -e "
import fs from 'node:fs';
import { unzip } from './scripts/indicadores.mjs';
const z = unzip(fs.readFileSync('/tmp/benchmark_data.zip'));
for (const k of z.keys()) {
  const s = z.get(k)().toString('utf8');
  console.log('===', k, s.length);
  console.log(k.endsWith('.json') ? Object.keys(JSON.parse(s)) : s.split(/\r?\n/).slice(0, 2));
}
"

# 3. Reproducir exactamente collectIndicators / ediBlock en local con parseCSV real
node --input-type=module -e "
import fs from 'node:fs';
import { collectIndicators } from './scripts/indicadores.mjs';
const parseCSV = t => {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '\"') { if (t[i + 1] === '\"') { cell += '\"'; i++; } else q = false; } else cell += c; }
    else if (c === '\"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
};
const r = await collectIndicators({
  getText: async () => { throw new Error('sin red'); },
  getBuf: async () => fs.readFileSync('/tmp/benchmark_data.zip'),
  parseCSV,
  fact: (v, src, url, asOf, ex) => ({ v, src, url, asOf, got: '2026-11-10T00:00:00Z', ...ex }),
  log: console.log, NOW_ISO: '2026-11-10T00:00:00Z', TODAY: '2026-11-10'
}, 'keep', null);
console.log('status.epoch_eci:', r.status.epoch_eci, 'open:', r.ind.edi?.open);
"
```
- **Árbol de decisión según el fallo detectado (qué cambiar)**:
  - **Caso 1 (fallo en `unzip` o URL movida)**: si `unzip` falla por cabeceras ZIP64 (`0xffff` / `0xffffffff` en entradas, tamaños u offsets), leer el localizador ZIP64 (`0x07064b50` / `0x06064b50`) y el campo extra `0x0001` en `unzip` (`líns. 236–254`); si Rolando confirma que la URL `benchmark_data.zip` cambió en Epoch, actualizar `URLS.benchZip` (`lín. 32`).
  - **Caso 2 (`falta epoch_capabilities_index/...`)**: localizar `eci_scores.csv`, `eci_bootstraps.json`, `processed_data_for_eci.csv` y `edi_scores.csv` por nombre de archivo final dentro de `z.keys()` en vez del prefijo fijo `D = 'epoch_capabilities_index/'` (`líns. 268–275`), lanzando error si hay duplicados ambiguos.
  - **Caso 3 (`réplicas del ECI con una forma inesperada`, `líns. 275–277`)**: adaptar la lectura de `eci_bootstraps.json` al nuevo esquema (ausencia de `boot.eci_scaled`, renombrado de `model.capability_samples` / `benchmark.difficulty_samples` o matriz transpuesta), manteniendo comprobación estricta de longitudes y números finitos.
  - **Caso 4 (columnas CSV renombradas en `edi_scores.csv`, `processed_data_for_eci.csv` o `eci_scores.csv`, `líns. 270–273, 321–337`)**: usar `col(r, ...)` aceptando tanto el nombre nuevo como el anterior y exigir `map.length > 0`.
  - **Caso 5 (`desviación de X puntos > 0.5`, `lín. 288`)**: verificar si el desajuste proviene de cruzar por `Model` cuando existen variantes homónimas (`Mistral Large 4` vs `id_model_version`) o de cambio en `ci_level` / cuantiles de Epoch, ajustando la clave de unión o el cálculo exacto de Epoch sin suprimir la guarda de consistencia.
  - En todos los casos, en `collectIndicators` (`líns. 768–772`), incluir `lastOk: prevInd[key]?.map?.got || prev?.status?.[srcKey]?.got || prev?.status?.[srcKey]?.lastOk || null` dentro de `failedStatus`.
- **Qué NO tocar**: `.github/workflows/collect.yml`, `AA_REUSE_H`, ni `data/indicadores.json`.
- **Criterio de aceptación verificable**: la prueba offline contra `/tmp/benchmark_data.zip` produce `status.epoch_eci.ok === true`, `edi.map.v.length > 0` y `edi.prob.usCn.v !== null`, y `node --test tests/*.test.mjs && node scripts/validate.mjs` termina con código `0`.
- **Pruebas nuevas a escribir**:
  - En `tests/unidad.test.mjs`: `test('ediBlock: lee benchmark_data.zip con el esquema vigente de Epoch y preserva lastOk si falla')`, generando en memoria un ZIP mínimo con la estructura real hallada y verificando `edi.open.v`, `edi.map.v`, `edi.prob` y `status.epoch_eci.lastOk`.
- **Dependencias**: Requiere `/tmp/benchmark_data.zip` descargado manualmente por Rolando; independiente en código de Tareas 1–3 y 5.

---

## Tarea 5 · Mejora 3: deduplicación causal de noticias en `parte.mjs` y RSS
- **Objetivo**: Evitar que múltiples indicadores derivados de un mismo hecho del día (en particular el récord y las brechas del ECI) copen las tres plazas del parte diario y se multipliquen en el RSS, resumiendo las brechas afectadas en `consecuencia`.
- **Modelo recomendado**: `Opus` (toca `scripts/parte.mjs`, plantillas bilingües ES/EN, RSS y `scripts/validate.mjs`).
- **Ficheros y funciones afectados**:
  - `scripts/parte.mjs`: `reglas` / `REGLAS` / `REGLAS_EN` (líns. `22–36`), `consecuencia` (`case 'indicador'`, líns. `200–218`), `oneEach` y `parte` (líns. `255–266`), `rss` (líns. `270–305`), nueva función exportada `causa(e)`.
  - `scripts/collect.mjs`: escritura de `data/changes.json` añadiendo `schema: 2` (lín. `952`).
  - `scripts/validate.mjs`: validación de `chg?.parte` (líns. `185–200`).
  - `tests/unidad.test.mjs`, `tests/fixtures/textos/es.json` y `tests/fixtures/textos/en.json`.
- **Qué cambiar**:
  - En `scripts/parte.mjs`:
    - Exportar `causa(e)`: devuelve `e.model` si existe; si no, `e.kind === 'uso' && e.data?.slug ? 'uso|' + e.data.slug : null`; si no, `e.data?.hito ? 'hito|' + e.data.hito : null`; si `e.kind === 'indicador' && ['eci', 'usCn', 'closedOpen', 'labs'].includes(e.data?.ind)`, devuelve `'indicador|eci'`; en el resto de casos, `e.key`.
    - Actualizar `oneEach` (lín. `256`) para filtrar por `causa(e)` en `parte()` (de modo que de toda la familia ECI de un día solo entre la noticia de mayor peso `w`, p. ej. `indicador|eci` con `w = 100` o la mayor variación de brecha si el líder absoluto no cambió), y aplicar `oneEach` agrupando por `e.detected` en `rss()` (lín. `273`) para que `parte.xml` y `parte.en.xml` tampoco repitan el mismo modelo o vuelco del ECI en la misma fecha.
    - En `consecuencia` (`case 'indicador'`, lín. `205`), cuando `d.ind === 'eci'` y en `C.ind?.eci` frente a `C.base?.ind` alguna distancia (`usCn`, `closedOpen`, `labs`) haya cambiado al menos `DIST` (`1` punto ECI), añadir una frase factual con `F.t(es, en)` indicando los nuevos valores de esas distancias (cuidando que todas las cifras aparezcan idénticas en español e inglés para pasar `nums(es, 'es') === nums(en, 'en')` en `tests/i18n.test.mjs`). Precisar en la regla del ECI de `reglas(F)` (lín. `32`) que el récord y las distancias del ECI de una misma recogida cuentan como una sola noticia.
  - En `scripts/collect.mjs` (lín. `952`): añadir `schema: 2` al objeto escrito en `data/changes.json`.
  - En `scripts/validate.mjs` (líns. `190–198`): importar `causa` de `./parte.mjs` y comprobar que `p.noticias` no repite `causa(e)` (en `errors` si `(chg.schema || 0) >= 2`, en `warnings` si `< 2` para no fallar en local sobre el `data/changes.json` previo).
  - Actualizar `tests/fixtures/textos/es.json` y `tests/fixtures/textos/en.json` ejecutando `salida()` y `salidaEn()` (`tests/fixtures/textos/salida.mjs`), revisando que no haya tildes en inglés ni entradas nuevas en `AVISOS`.
- **Qué NO tocar**: los arrays completos `items` de `changes.json` ni `events` de `events-log.json` (las secciones «Ver todo lo detectado» de `js/hoy.js` y «Qué ha cambiado» de `js/carrera.js` consumen cada indicador por separado).
- **Criterio de aceptación verificable**: `node --test tests/*.test.mjs && node scripts/validate.mjs` sale con código `0`, superando la paridad exacta ES/EN de `tests/i18n.test.mjs` y dejando como máximo 1 noticia de la familia ECI por fecha en `parte` y en `rss`.
- **Pruebas nuevas a escribir**:
  - En `tests/unidad.test.mjs`: `test('parte y rss: deduplicación causal agrupa récord y distancias del ECI en una única noticia')`, con cuatro eventos ECI simultáneos (`eci`, `labs`, `usCn`, `closedOpen`) y dos noticias de otros frentes en la misma fecha, comprobando que `parte().noticias` selecciona `['indicador|eci|...', ...otrasDos]` y que `rss()` incluye un solo `<item>` de la familia ECI para ese día.
- **Dependencias**: Ejecutar tras Tarea 1 (comparte `scripts/validate.mjs` y `scripts/collect.mjs`).

---

## Orden de ramas y PRs propuesto
Abrir una rama por mejora desde `main` actualizado. **Aviso crítico sobre `collect.yml`**: cada `git push` a una rama que modifique `scripts/**` dispara automáticamente una recogida real en GitHub Actions (reutilizando AA si la última consulta tiene `< 20 h`); agrupa commits localmente y haz **un único push final por rama** cuando todas las pruebas locales estén en verde:
1. **PR 1 (`fix/aa-reuse-stale`)** — **Tarea 1** (Mejora 1). Limpia los 146 falsos `stale` y sube `catalog.schema` a `3`.
2. **PR 2 (`fix/aa-matching-dedup`)** — **Tarea 2 + Tarea 3** juntas (Mejora 2 completa). **Prohibido hacer push de Tarea 2 sin Tarea 3**: si `collect.yml` se ejecutara con el nuevo `emparejar.mjs` sin la normalización en memoria de `base` (Tarea 3), contaminaría `events-log.json` y `parte.xml` en la rama.
3. **PR 3 (`fix/epoch-edi-zip`)** — **Tarea 4** (`epoch_eci` / `ediBlock`), en cuanto Rolando facilite `/tmp/benchmark_data.zip`. Puede fusionarse en paralelo o antes/después de PR 2 y PR 4.
4. **PR 4 (`feat/parte-causal-dedup`)** — **Tarea 5** (Mejora 3). Regenera `changes.json` (`schema: 2`) y ambos RSS sin duplicados causales.

## Riesgos residuales que el modelo ejecutor debe vigilar
- **Transición silenciosa en ambos modos de AA (Tarea 3)**: probar la normalización de `base` tanto cuando `loadAA` trae filas frescas como cuando opera `aaReuse === true` (`< 20 h` en ramas), y vigilar que `tencent/hy4` no reciba `preApi` ni `rankAA` retroactivo dentro de la ventana `hoyFrom` de 7 días.
- **Compatibilidad de `validate.mjs` con `data/` sin regenerar en local (Tareas 1, 2 y 5)**: dado que está prohibido editar `data/` a mano, toda nueva restricción sobre datos generados debe emitir `warnings` para el `schema` legado de `main` y `errors` (salida `1`) para el `schema` nuevo que escribe `collect.mjs`.
- **Paridad numérica y léxica ES/EN (Tarea 5)**: `tests/i18n.test.mjs` exige igualdad exacta de cifras (`nums(es, 'es') === nums(en, 'en')`), cero caracteres españoles (`[áéíóúñ¿¡]`) en inglés y `AVISOS` vacío; verificar siempre con `node --test tests/i18n.test.mjs` antes de cerrar la sesión.
- **Integridad estadística de Epoch (Tarea 4)**: no desactivar la comprobación de cuantiles de `ediBlock` ni el cruce de líderes de `attachProb` (`scripts/indicadores.mjs`, líns. `748–758`); si Epoch cambió su cálculo de intervalos, reproducir exactamente su nueva definición antes de dar por bueno el ajuste.
