# MOLOCH.SH · Observatorio de la carrera por la IA

Sitio estático (HTML, CSS y JavaScript sin build) para entrar, entender qué ha cambiado y comprobar los datos: qué modelos han salido, cómo se comparan los abiertos con los cerrados, cuánto cuestan y dónde verificarlo.

## Vistas

| Vista | Pregunta | Estado |
| --- | --- | --- |
| Hoy | ¿Qué ha cambiado y por qué importa? | fase 1 |
| Modelos | ¿Cómo se comparan abiertos y cerrados? | fase 1 |
| Lanzamientos | ¿Qué ha salido realmente? | fase 1 |
| La carrera | ¿Qué acelera o frena el avance? | fase 2 (la pestaña describe el contenido previsto, sin datos) |
| AI 2027 | ¿Cómo encaja la realidad con aquel escenario? | fase 2 (la pestaña describe el contenido previsto, sin datos) |

## Datos y procedencia

Ninguna cifra está escrita a mano en el código. `scripts/collect.mjs` consulta las fuentes y genera:

| Archivo | Contenido |
| --- | --- |
| `data/catalog.json` | Catálogo actual. Cada cifra es `{ v, src, url, asOf, got }`: valor, fuente, enlace, fecha del dato y fecha de consulta. |
| `data/changes.json` | Diferencias con la última recogida de un día anterior. |
| `data/events-log.json` | Registro acumulado de cambios de precio, pesos nuevos, retiradas y primeras evaluaciones. |
| `data/history/AAAA-MM-DD.json` | Instantánea diaria compacta para las series históricas. |
| `data/curated/*.json` | Lo único que se edita a mano: laboratorios seguidos (con país), emparejamientos con Epoch, Hugging Face y AA, y anuncios con URL. |

Fuentes:

- **OpenRouter** (`/api/v1/models` y `/endpoints`, sin clave): precios, contexto, proveedores, velocidad y espera por proveedor, enlace a pesos.
- **Hugging Face** (`/api/models`, sin clave): existencia del repositorio de pesos, licencia y fecha.
- **Epoch AI** (`eci_scores.csv` y `benchmarks.csv`, sin clave, CC BY 4.0): capacidad con el Epoch Capabilities Index y su intervalo, programación con las ejecuciones propias de Epoch de SWE-bench Verified, fecha del modelo, clasificación de apertura y la frontera abierta/cerrada por fecha. Cita: Epoch AI, ‘Capabilities & benchmarking’, epoch.ai.
- **Artificial Analysis** (opcional): el nivel gratuito de su API sólo permite uso interno, gráficos con atribución y citas breves; no permite republicar sus datos en tablas o JSON (Data Platform Terms, §2.3). El recolector sólo lo usa si existen el secreto `AA_API_KEY` y la variable `AA_REDISTRIBUTION=permitida`, que debe fijarse únicamente con autorización escrita de Artificial Analysis.

Velocidad: en octubre de 2026 la API pública de OpenRouter devolvía vacíos los campos de latencia y rendimiento por proveedor, y AA no es redistribuible sin permiso, así que la velocidad aparece como «sin datos» salvo que OpenRouter vuelva a darlos.

Reglas: si una fuente no da un dato, el campo queda `null` y la interfaz muestra «sin datos». Si una consulta falla, se conserva el último valor válido marcado como antiguo. Si falla OpenRouter, no se escribe nada. `scripts/validate.mjs` rechaza un catálogo con cifras sin fuente o fechas.

País, licencia y disponibilidad de pesos son campos separados. «Abiertos» exige un repositorio público en Hugging Face (enlazado desde OpenRouter o añadido en `overrides.hf` y comprobado); si no lo hay, manda la clasificación de Epoch, y en último término se infiere «cerrados» y se marca como inferido. Los modelos anónimos figuran como «identidad sin confirmar».

## Recogida

El flujo `.github/workflows/collect.yml` ejecuta el recolector, valida y confirma los JSON. En esta fase se lanza a mano (Actions → Recogida de datos → Run workflow) o al cambiar el recolector o los datos curados. El registro de cada ejecución lista los modelos que no se han podido emparejar con Epoch, para completar `overrides.epoch`.

En local:

```bash
node scripts/collect.mjs && node scripts/validate.mjs
python3 -m http.server 8765   # los módulos ES no funcionan con file://
```

## Despliegue

`netlify.toml` publica la raíz y fija la CSP (sólo conexiones al propio dominio).
