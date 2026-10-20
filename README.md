# MOLOCH.SH · Observatorio de la carrera por la IA

Sitio estático (HTML, CSS y JavaScript sin build) para entrar, entender qué ha cambiado y comprobar los datos: qué modelos han salido, cómo se comparan los abiertos con los cerrados, cuánto cuestan y dónde verificarlo.

## Vistas

| Vista | Pregunta | Estado |
| --- | --- | --- |
| Hoy | ¿Qué ha cambiado y por qué importa? | fase 1 |
| Modelos | ¿Cómo se comparan abiertos y cerrados? | fase 1 |
| Lanzamientos | ¿Qué ha salido realmente? | fase 1 |
| La carrera | ¿Qué acelera o frena el avance? | fase 2: distancias en índice entre EE. UU. y China, cerrados y abiertos, y los dos primeros laboratorios; seis frentes con datos, hechos con fuente y una «Lectura Moloch» marcada como interpretación |
| AI 2027 | ¿Cómo encaja la realidad con aquel escenario? | fase 2: cinco líneas y 19 hitos con la predicción original intacta, revisiones fechadas de los autores y valoración propia en una escala fija |

## Datos y procedencia

Ninguna cifra está escrita a mano en el código. `scripts/collect.mjs` consulta las fuentes y genera:

| Archivo | Contenido |
| --- | --- |
| `data/catalog.json` | Catálogo actual. Cada cifra es `{ v, src, url, asOf, got }`: valor, fuente, enlace, fecha del dato y fecha de consulta. |
| `data/changes.json` | Diferencias con la última recogida de un día anterior. |
| `data/events-log.json` | Registro acumulado de cambios de precio, pesos nuevos, retiradas y primeras evaluaciones. |
| `data/history/AAAA-MM-DD.json` | Instantánea diaria compacta para las series históricas (incluye los indicadores). |
| `data/indicadores.json` | Indicadores agregados de «La carrera» y «AI 2027» con la misma forma de hecho, el estado de cada fuente y el resultado de las reglas de valoración (`checks`). |
| `data/curated/*.json` | Lo único que se edita a mano: laboratorios seguidos (con país), emparejamientos con Epoch, Hugging Face y AA, anuncios con URL, los frentes de `carrera.json` y los hitos de `ai2027.json`. |

Fuentes:

- **OpenRouter** (`/api/v1/models` y `/endpoints`, sin clave): precios, contexto, proveedores, velocidad y espera por proveedor, enlace a pesos. Entran los modelos de los laboratorios de `data/curated/labs.json`, por su variante base; si OpenRouter sólo ofrece una variante (por ejemplo `:free`), ésa representa al modelo. El registro de cada recogida lista las altas recientes que se quedan fuera.
- **Hugging Face** (`/api/models`, sin clave): existencia del repositorio de pesos, licencia y fecha.
- **Epoch AI** (`eci_scores.csv` y `benchmarks.csv`, sin clave, CC BY 4.0): capacidad con el Epoch Capabilities Index y su intervalo, programación con las ejecuciones propias de Epoch de SWE-bench Verified, fecha del modelo, clasificación de apertura y la frontera abierta/cerrada por fecha. Cita: Epoch AI, ‘Capabilities & benchmarking’, epoch.ai.
- **Epoch AI, otros conjuntos** (CSV, sin clave, CC BY 4.0): centros de datos y sus calendarios de potencia, ventas de chips de IA por fabricante y diseñador, e ingresos y uso declarados por las empresas. Son estimaciones de Epoch a partir de fuentes públicas; el recolector no las corrige.
- **METR** (`benchmark_results_1_1.yaml`): horizonte temporal al 50 % y al 80 % del mejor modelo medido. Todos los derechos reservados, así que sólo se cita el último punto con enlace. En octubre de 2026 la página llevaba sin actualizarse desde el 8 de septiembre, y el horizonte mide la duración de tareas que un humano tardaría en hacer, no horas de autonomía del modelo.
- **Hechos curados**: cada hecho de `carrera.json` y cada evidencia de `ai2027.json` lleva texto, fuente, URL, fecha del dato (día, mes o `null`) y fecha de consulta, y dice cómo se verificó: «lectura directa» o «buscador» cuando la web no admite lectura automática (por ejemplo, la AIE).
- **Artificial Analysis** (opcional): el nivel gratuito de su API sólo permite uso interno, gráficos con atribución y citas breves; no permite republicar sus datos en tablas o JSON (Data Platform Terms, §2.3). El recolector sólo lo usa si existen el secreto `AA_API_KEY` y la variable `AA_REDISTRIBUTION=permitida`, que debe fijarse únicamente con autorización escrita de Artificial Analysis.

Velocidad: en octubre de 2026 la API pública de OpenRouter devolvía vacíos los campos de latencia y rendimiento por proveedor, y AA no es redistribuible sin permiso, así que la velocidad aparece como «sin datos» salvo que OpenRouter vuelva a darlos.

Reglas: si una fuente no da un dato, el campo queda `null` y la interfaz muestra «sin datos». Si una consulta falla, se conserva el último valor válido marcado como antiguo. Si falla OpenRouter, no se escribe nada. `scripts/validate.mjs` rechaza un catálogo con cifras sin fuente o fechas.

La carrera y AI 2027 siguen reglas propias, comprobadas por `validate.mjs`:

- Toda «Lectura Moloch» es una hipótesis con estado (abierta, confirmada o debilitada) y un historial fechado que empieza en «abierta»: ninguna tesis nace confirmada. Dice quién gana acelerando, qué se pierde frenando, qué costes desplaza y qué la reforzaría o debilitaría.
- Las distancias se expresan en puntos del índice, nunca en meses.
- AI 2027 se presenta como uno de varios futuros posibles, con sus dos desenlaces. La predicción original de cada hito no se borra: las revisiones de los autores van aparte, con fecha y enlace. El ritmo publicado por los autores (por ejemplo, 70–90 % en agosto de 2026) no es una probabilidad.
- Cada hito puede llevar valoraciones de los autores (con URL), traducidas a la escala común, y lleva exactamente una del observatorio, en la escala adelantado, compatible, retrasado, todavía no evaluable o sin evidencia suficiente. Tres de ellas (`swe85`, `openAgent0`, `openaiRev2025`) se recalculan en cada recogida con una regla explícita en `scripts/indicadores.mjs`.

País, licencia y disponibilidad de pesos son campos separados. «Abiertos» exige un repositorio público en Hugging Face (enlazado desde OpenRouter o añadido en `overrides.hf` y comprobado); si no lo hay, manda la clasificación de Epoch, y en último término se infiere «cerrados» y se marca como inferido. Los modelos anónimos figuran como «identidad sin confirmar».

## Recogida

El flujo `.github/workflows/collect.yml` ejecuta el recolector, valida y confirma los JSON. Corre a diario a las 05:17 UTC (GitHub sólo programa el cron en la rama principal), a mano (Actions → Recogida de datos → Run workflow) o al subir cambios del recolector o de los datos curados a una rama de trabajo, para su vista previa. El registro de cada ejecución lista los modelos que no se han podido emparejar con Epoch, para completar `overrides.epoch`.

En local:

```bash
node scripts/collect.mjs && node scripts/validate.mjs
python3 -m http.server 8765   # los módulos ES no funcionan con file://
```

## Despliegue

`netlify.toml` publica la raíz y fija la CSP (sólo conexiones al propio dominio).
