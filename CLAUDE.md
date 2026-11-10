# CLAUDE.md · Contexto de arquitectura de MOLOCH.SH

Observatorio estático de la carrera por la IA (`moloch-sh`): compara modelos abiertos y cerrados, precios, velocidades, frentes estratégicos («La carrera») y predicciones de «AI 2027», con fuente y fecha en cada cifra.

## Arquitectura (sin build ni dependencias)
- **Cero `package.json`, `node_modules` ni bundler**: HTML, CSS y ES Modules nativos servidos directamente desde la raíz (`netlify.toml`, `publish = "."`, cabeceras `max-age=0, must-revalidate` y CSP estricta con hash SHA-256 exacto para el bloque JSON-LD de `index.html`).
- **Node 22 nativo en scripts y CI**: usa solo APIs estándar (`node:fs`, `node:test`, `node:zlib`, `node:http`, `fetch`) y Chrome headless por CLI o tubería CDP (`--remote-debugging-pipe` / WebSocket).
- **Módulos isomórficos**: `js/locale.js` y `js/valoracion.js` no dependen del DOM; los importan tanto la web como `scripts/*.mjs` para garantizar idéntico formato numérico/fechas y resolución de veredictos.

## Mapa de ficheros y carpetas
- `index.html`, `css/observatorio.css`, `assets/logos/*.svg`: documento único con las 5 vistas (`#hoy`, `#modelos`, `#lanzamientos`, `#carrera`, `#ai2027`), estilos neo-brutalistas (`light`/`dark`/`auto`) y logos SVG propios (LobeHub, MIT).
- `js/`: `app.js` (carga, rutas `#vista/<subruta>`, franja `#freshness`, cambio ES⇄EN, aislamiento `safe()`), vistas (`hoy.js`, `modelos.js`, `lanzamientos.js`, `carrera.js`, `carrera-anim.js`, `ai2027.js`), `indicadores.js`, `charts.js` (SVG con zoom/arrastre/pellizco y `placeLabels`), `fmt.js` (`fact()`, `src()`, `aaRace()`, `aaCoverage()`), `i18n.js`, `locale.js`, `valoracion.js`, `logos.js`, `theme-init.js`.
- `scripts/` (`.mjs`): `collect.mjs` (recolector principal), `indicadores.mjs` (ECI, EDI con `unzip` propio sobre `benchmark_data.zip`, centros, chips, empresas, METR y reglas `checks`), `emparejar.mjs` (cruce OpenRouter↔AA y `aaOnly`), `cambios.mjs` (dif diario y filtro horario `vaiven`), `parte.mjs` (hasta 3 noticias con regla fija + RSS), `textos.mjs` (`F.es`/`F.en`), `validate.mjs`, `frescura.mjs`, `imagen.mjs` (`data/og.png`), `i18n.mjs`, `i18n-backfill.mjs`.
- `data/curated/*.json` (**únicos datos de negocio editables a mano**): `labs.json`, `aa-creadores.json`, `overrides.json`, `excluidos.json`, `permisos.json`, `sources.json`, `events.json`, `carrera.json`, `ai2027.json`.
- `data/i18n/`: `campos.json` (rutas de campos traducibles) y `en/{ui,hoy,carrera,ai2027,lanzamientos,notas}.json` (diccionarios `exact`, `patterns`, `same`).
- `data/` (**generado, NO editar a mano**): `catalog.json`, `indicadores.json`, `changes.json`, `events-log.json`, `historia.json`, `history/AAAA-MM-DD.json`, `parte.xml`, `parte.en.xml`, `og.png`.
- `tests/` y `.github/workflows/`: `unidad.test.mjs`, `recogida.test.mjs`, `i18n.test.mjs`, `humo.mjs`, `paridad.mjs`, `idioma.mjs`, `golden-dom.mjs`, `i18n-permitidos.json`, `fixtures/`; flujos `collect.yml` y `pruebas.yml`.

## Reglas inquebrantables
- **Ninguna cifra escrita a mano en código**: todo valor publicado sale de `scripts/collect.mjs` como hecho `{ v, src, url, asOf, got }` y se pinta con `fact()` / `src()`. Sin dato queda `v: null` («sin datos»); si una fuente falla se conserva el último valor válido con `stale: true`; si falla OpenRouter, se aborta sin escribir (`exit 2`).
- **Solo `data/curated/` (y las traducciones `data/i18n/`) se editan a mano**: el resto de `data/` lo genera y publica en `main` la recogida diaria (`collect.yml`).
- **NO ejecutar `scripts/collect.mjs` con red en sesiones de desarrollo**: consume el cupo diario de APIs (`AA_API_KEY`). Para probar el recolector se usa exclusivamente `FIXTURES=...` sobre una copia temporal (como `tests/recogida.test.mjs`).
- **Paridad obligatoria español/inglés (`es-ES` / `en-GB`)**: todo texto visible (UI, datos curados, plantillas del recolector y RSS) debe existir en ambos idiomas con idénticas cifras, marcas `{x}`, enlaces y estructura, sin LLM ni traducción automática en cliente.
- **Rigor metodológico (`scripts/validate.mjs`)**: distancias siempre en puntos del índice (nunca en meses); toda «Lectura Moloch» lleva historial fechado que nace `abierta`; lo extrapolado/previsto usa el rayado gris `#proj-hatch`; publicar datos de Artificial Analysis exige permiso vigente en `data/curated/permisos.json` y cita enlazada; los precios y cambios de precio usan la tarifa del propio laboratorio en OpenRouter (`or_provider`), filtrando vaivenes horarios de 14 días (`vaiven`).

## Comandos de prueba y verificación local
```bash
node --test tests/*.test.mjs               # unidad, i18n y recogida aislada con FIXTURES
node scripts/validate.mjs                  # procedencia de hechos, esquemas curados y parte
node scripts/i18n.mjs --faltan             # audita traducciones pendientes (--literales revisa js/)
node scripts/i18n-backfill.mjs --comprobar # comprueba i18n.en de datos publicados sin red
node tests/humo.mjs                        # 5 vistas + rutas directas en Chrome (ES/EN, 1300 y 390 px)
node tests/paridad.mjs                     # paridad de cifras, enlaces, etiquetas y SVG (ES vs EN)
node tests/idioma.mjs                      # cambio ES⇄EN conservando filtros, fichas y scroll
python3 -m http.server 8765                # servidor local (ES Modules no funcionan con file://)
```
Si Chrome no está en `PATH`, definir `CHROME=/ruta/al/binario`. Para comprobar refactorizaciones byte a byte en el DOM español: `node tests/golden-dom.mjs capture|compare <carpeta>`.

## Convenciones reales de código y diseño
- **Extensiones y estilo**: `.js` en `js/`, `.mjs` en `scripts/` y `tests/`. Identificadores de dominio y comentarios en español; estilo conciso y funcional sin comentarios redundantes.
- **Internacionalización en tres capas** (español como clave única, sin duplicar el catálogo; selector activo con `RELEASED = true` en `js/i18n.js`):
  - Interfaz (`js/*.js`, `index.html`): `t('texto {x}', { x })`, `tn(n, [uno, otros])`, y `data-t` / `data-t-html` / `data-t-attr` → `data/i18n/en/ui.json`. Cualquier literal español fuera de `t()` rompe `tests/i18n.test.mjs` salvo registro justificado en `tests/i18n-permitidos.json`.
  - Datos curados y notas: `tr(es)` contra `data/i18n/en/*.json`, respetando el glosario aprobado (*Moloch Analysis*, *Daily Briefing*, *Milestone*, *bootstrap replicates*).
  - Recolector (`cambios.mjs`, `parte.mjs`, `indicadores.mjs`): plantilla única con `F.t(es, en)` / `both()` (`scripts/textos.mjs`), guardada en `obj.i18n.en.<campo>` y leída con `L(obj, campo)`. Si cambia la salida del recolector, actualizar `tests/fixtures/textos/{es,en}.json` tras verificar paridad.
- **Escape HTML y CSP**: `t()` no escapa parámetros para admitir HTML de `src()` o enlaces; escapar siempre valores de datos con `esc()`. Cualquier cambio en el bloque JSON-LD de `index.html` obliga a recalcular su hash SHA-256 en `netlify.toml`.
- **Renderizado, rutas y gráficos**: cada vista mantiene su `state` de módulo y enlaza escuchadores una sola vez (`let bound = false`) para que `switchLang()` repinte en bloque síncrono conservando filtros, comparaciones, `<details>` y desplazamiento. Cada sección se protege con `safe(view, fn, D)` (`data-render-error`). Los gráficos SVG redibujan con `watchWidth()` (`ResizeObserver`) y adaptan márgenes/rótulos en móvil con `frame()`.

## Git y flujo de trabajo
- Trabajar siempre en una rama; nunca commit directo a main.
- Nunca hacer commit de ficheros generados de data/ (solo data/curated/ y data/i18n/).
- Los errores visibles en data/ se corrigen en el código que los genera; el dato se regenera en la siguiente recogida.
- Ojo: un push a una rama que toque scripts/** o data/curated/** dispara collect.yml (recogida real; en ramas reutiliza AA si hay consulta de < 20 h).
- Cambios en emparejamiento, ranking o reglas: comprobar con fixtures que la primera recogida tras el cambio no publique noticias que solo son la corrección (cambios.mjs compara con el día anterior).
- Tras cada cambio: node --test tests/*.test.mjs && node scripts/validate.mjs. Si se tocan vistas, también tests/humo.mjs.
- Si PLAN.md choca con el código real, parar y preguntar; no improvisar.
