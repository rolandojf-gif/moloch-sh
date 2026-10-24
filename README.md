# MOLOCH.SH · Observatorio de la carrera por la IA

Sitio estático (HTML, CSS y JavaScript sin build) para entrar, entender qué ha cambiado y comprobar los datos: qué modelos han salido, cómo se comparan los abiertos con los cerrados, cuánto cuestan y dónde verificarlo.

## Vistas

| Vista | Pregunta | Estado |
| --- | --- | --- |
| Hoy | ¿Qué ha cambiado y por qué importa? | parte diario: hasta tres noticias de la última recogida, elegidas con una regla fija que la página publica, o «sin cambios significativos»; lo nuevo desde la última visita (guardado sólo en el navegador) y todo lo detectado en 7 días |
| Modelos | ¿Cómo se comparan abiertos y cerrados? | tabla ordenable, comparación de hasta tres y evolución de la frontera con el índice de AA y con el ECI de Epoch; la ficha de cada modelo dice su puesto en el índice de AA y la distancia, en índice, precio y tiempo hasta la respuesta, con el mejor abierto, el más barato de índice parecido (±2 puntos) y el que antes empieza a responder con ese índice. Describe su posición en la carrera, no recomienda |
| Lanzamientos | ¿Qué ha salido realmente? | fase 1 |
| La carrera | ¿Qué acelera o frena el avance? | distancias entre EE. UU. y China, cerrados y abiertos, y los dos primeros laboratorios, y avance de la frontera en 12 meses: primero con el índice de AA, al día, y debajo, como serie larga, con el ECI de Epoch, que llega con semanas de retraso; seis frentes que empiezan por qué sabemos, qué ha cambiado (lo que detecta el recolector en sus indicadores) y qué cambiaría la lectura, con datos, hechos con fuente y una «Lectura Moloch» marcada como interpretación |
| AI 2027 | ¿Cómo encaja la realidad con aquel escenario? | cinco líneas y 19 hitos con la predicción original intacta, revisiones fechadas de los autores y valoración propia en una escala fija; las predicciones que juntan varias afirmaciones se valoran también por partes, y se señalan las tres próximas que se podrán comprobar con datos |

Direcciones propias: `#modelos/<id de OpenRouter>` abre la ficha de un modelo (vale también la parte tras la barra, p. ej. `#modelos/kimi-k3`, si no es ambigua), `#modelos/comparar/<id>,<id>,<id>` abre una comparación, `#ai2027/<hito>` y `#carrera/<frente>` llevan a esa ficha.

## Datos y procedencia

Ninguna cifra está escrita a mano en el código. `scripts/collect.mjs` consulta las fuentes y genera:

| Archivo | Contenido |
| --- | --- |
| `data/catalog.json` | Catálogo actual. Cada cifra es `{ v, src, url, asOf, got }`: valor, fuente, enlace, fecha del dato y fecha de consulta. |
| `data/changes.json` | Lo que muestra «Hoy»: los cambios de los últimos 7 días (modelos nuevos, primeras puntuaciones, pesos abiertos, cambios de precio del propio laboratorio, retiradas, cambios de líder y de versión del índice de AA, indicadores de La carrera, valoraciones de AI 2027 y ranking de uso), y el parte del día (`parte`). `scripts/parte.mjs` decide qué cambios son noticia con una regla fija y redacta titular y consecuencia con plantillas a partir de las cifras, sin modelo de lenguaje. |
| `data/parte.xml` | Fuente RSS del parte: las noticias de los últimos 30 días, con titular, consecuencia, motivo, fechas y fuente. |
| `data/events-log.json` | Registro acumulado de esos cambios (salvo las altas). Cada uno lleva tipo, magnitud, fecha de publicación si la fuente la da, fecha de detección y enlace a la evidencia; los detecta `scripts/cambios.mjs` comparando cada recogida con la del día anterior. |
| `data/history/AAAA-MM-DD.json` | Instantánea diaria compacta para las series históricas (incluye los indicadores). |
| `data/indicadores.json` | Indicadores agregados de «La carrera» y «AI 2027» con la misma forma de hecho, el estado de cada fuente y el resultado de las reglas de valoración (`checks`). |
| `data/curated/*.json` | Lo único que se edita a mano: laboratorios seguidos (con país), emparejamientos con Epoch, Hugging Face y AA, ids de creador de AA, permisos de fuentes, anuncios con URL, los frentes de `carrera.json` y los hitos de `ai2027.json`. |

Fuentes:

- **OpenRouter** (`/api/v1/models` y `/endpoints`, sin clave): precios, contexto, proveedores, velocidad y espera por proveedor, enlace a pesos. Entran los modelos de los laboratorios de `data/curated/labs.json`, por su variante base; si OpenRouter sólo ofrece una variante (por ejemplo `:free`), ésa representa al modelo. El registro de cada recogida lista las altas recientes que se quedan fuera. El precio de cada modelo es el que cobra el propio laboratorio en OpenRouter (proveedores en `or_provider` de `labs.json`); si no lo sirve él, el del proveedor más barato, que se nombra. No se usa el precio de nivel de modelo de OpenRouter, porque cambia de proveedor de referencia de un día a otro.
- **Hugging Face** (`/api/models`, sin clave): existencia del repositorio de pesos, licencia y fecha.
- **Epoch AI** (`eci_scores.csv` y `benchmarks.csv`, sin clave, CC BY 4.0): capacidad con el Epoch Capabilities Index y su intervalo, programación con las ejecuciones propias de Epoch de SWE-bench Verified y de MirrorCode (reimplementar programas enteros a partir de su comportamiento, con tareas que a un ingeniero le llevarían semanas), fecha del modelo, clasificación de apertura y la frontera abierta/cerrada por fecha. Cita: Epoch AI, ‘Capabilities & benchmarking’, epoch.ai.
- **Epoch AI, otros conjuntos** (CSV, sin clave, CC BY 4.0): centros de datos y sus calendarios de potencia, ventas de chips de IA por fabricante y diseñador, e ingresos y uso declarados por las empresas. Son estimaciones de Epoch a partir de fuentes públicas; el recolector no las corrige.
- **METR** (`benchmark_results_1_1.yaml`): horizonte temporal al 50 % y al 80 % del mejor modelo medido. Todos los derechos reservados, así que sólo se cita el último punto con enlace. En octubre de 2026 la página llevaba sin actualizarse desde el 8 de septiembre, y el horizonte mide la duración de tareas que un humano tardaría en hacer, no horas de autonomía del modelo.
- **Hechos curados**: cada hecho de `carrera.json` y cada evidencia de `ai2027.json` lleva texto, fuente, URL, fecha del dato (día, mes o `null`) y fecha de consulta, y dice cómo se verificó: «lectura directa» o «buscador» cuando la web no admite lectura automática (por ejemplo, la AIE).
- **Artificial Analysis** (`/api/v2/language/models/free`, secreto `AA_API_KEY`): índice de inteligencia, índices de programación y agentes, y velocidad mediana del proveedor de referencia y tiempo hasta el primer token de la respuesta, que incluye el razonamiento. No se usa su «primer token», porque en los modelos que muestran el razonamiento es el primer token pensado y en los que lo ocultan, la respuesta. Es la medida de capacidad de las vistas de modelos porque puntúa los modelos nuevos a los pocos días; Epoch sigue siendo la base de las series históricas. Como Epoch tarda en puntuar los modelos nuevos y no mide algunos laboratorios (en octubre de 2026, Xiaomi, StepFun y Ant), la frontera de Modelos lleva encima una versión con el índice de AA y La carrera da sus distancias primero con AA (`ind.aa` en `data/indicadores.json`, calculado en cada recogida, y la serie mensual en el navegador, las dos con `aaRace` de `js/fmt.js`): cada modelo en su fecha según AA con su índice actual, y sólo los que siguen en OpenRouter, así que en los meses antiguos faltan los retirados. AA publica una fila por configuración de razonamiento y se toma la de mayor índice, nombrándola. El nivel gratuito no permite republicar datos, así que se publican con la autorización escrita que AA dio el 21 de octubre de 2026 para esta web personal y no comercial, registrada en `data/curated/permisos.json` con sus condiciones: citarlos con enlace a artificialanalysis.ai y respetar los límites de la API. Sin ese registro el recolector no usa AA y `scripts/validate.mjs` rechaza cualquier dato suyo. Cada recogida hace una consulta por página de 200 modelos (cuatro en octubre de 2026) de las 100 diarias que permite la clave. Los creadores se emparejan por id (`data/curated/aa-creadores.json`), porque el endpoint gratuito no trae su slug.

Velocidad: la de Artificial Analysis cuando existe; si no, la del proveedor más rápido de OpenRouter, cuya API pública devolvía vacíos esos campos en octubre de 2026.

Reglas: si una fuente no da un dato, el campo queda `null` y la interfaz muestra «sin datos». Si una consulta falla, se conserva el último valor válido marcado como antiguo. Si falla OpenRouter, no se escribe nada. `scripts/validate.mjs` rechaza un catálogo con cifras sin fuente o fechas.

La carrera y AI 2027 siguen reglas propias, comprobadas por `validate.mjs`:

- Toda «Lectura Moloch» es una hipótesis con estado (abierta, confirmada o debilitada) y un historial fechado que empieza en «abierta»: ninguna tesis nace confirmada. Dice quién gana acelerando, qué se pierde frenando, qué costes desplaza y qué la reforzaría o debilitaría.
- Las distancias se expresan en puntos del índice, nunca en meses.
- Lo extrapolado o previsto, que no está medido, lleva siempre el mismo rayado gris, sea una extrapolación propia o una previsión de la fuente.
- Una serie está detenida si su editor la cierra o si lleva más de tres meses sin medir un modelo publicado después (`PARADA` en `scripts/indicadores.mjs`). Se muestra con su último dato y la marca «serie detenida», pero ya no se compara entre recogidas, no se dibuja ni se usa para estimaciones. En octubre de 2026 lo están el horizonte de METR y el SWE-bench Verified de Epoch; MirrorCode sustituye a METR en el frente de agentes y en el hito del horizonte de tres semanas.
- AI 2027 se presenta como uno de varios futuros posibles, con sus dos desenlaces. La predicción original de cada hito no se borra: las revisiones de los autores van aparte, con fecha y enlace. El ritmo publicado por los autores (por ejemplo, 70–90 % en agosto de 2026) no es una probabilidad.
- Cada hito puede llevar valoraciones de los autores (con URL), traducidas a la escala común, y lleva exactamente una del observatorio, en la escala adelantado, compatible, retrasado, todavía no evaluable o sin evidencia suficiente. Seis de ellas (`swe85`, `openAgent0`, `openaiRev2025`, `rivales39`, `deepcent6` y `mirror80`, que contrasta con MirrorCode el horizonte de tres semanas porque METR ya no lo puede medir: «compatible» si al vencer el mejor resultado llega al 80 %) se recalculan en cada recogida con una regla explícita en `scripts/indicadores.mjs`, y también una de las partes en que se divide una predicción (`variosAgent0`). Las partes son lectura del observatorio: separan afirmaciones que el escenario dice juntas, sin tocar la predicción ni la cita originales.

País, licencia y disponibilidad de pesos son campos separados. «Abiertos» exige un repositorio público en Hugging Face (enlazado desde OpenRouter o añadido en `overrides.hf` y comprobado); si no lo hay, manda la clasificación de Epoch; si Epoch no lo clasifica y el laboratorio lo presenta como de pesos abiertos en su descripción de OpenRouter (por ejemplo «Kimi K3.1 Pro is Moonshot AI's flagship open-weight…»), cuenta como «abiertos · anunciados»: abierto a todos los efectos (líder abierto, distancias, frontera), con la cita guardada y la aclaración de que aún no se puede descargar, y el día que aparezca el repositorio se registra como pesos publicados. Sólo cuando nada de eso existe se infiere «cerrados» y se marca como inferido. Una descripción que se lea mal se corrige con `overrides.pesos`. Los modelos anónimos figuran como «identidad sin confirmar».

## Recogida

El flujo `.github/workflows/collect.yml` ejecuta el recolector, valida y confirma los JSON. Corre a diario a las 04:17 de Madrid, también con el cambio de hora, con un disparo de respaldo a las 06:47 que no hace nada si ya hay una recogida completa del día (`scripts/frescura.mjs`; GitHub retrasa los programados y sólo los ejecuta en la rama principal), a mano (Actions → Recogida de datos → Run workflow) o al subir cambios del recolector o de los datos curados a una rama de trabajo, para su vista previa. El registro de cada ejecución lista los modelos que no se han podido emparejar con Epoch, para completar `overrides.epoch`.

En local:

```bash
node scripts/collect.mjs && node scripts/validate.mjs
python3 -m http.server 8765   # los módulos ES no funcionan con file://
```

## Despliegue

`netlify.toml` publica la raíz y fija la CSP (sólo conexiones al propio dominio).
