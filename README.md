# MOLOCH.SH // Arbitrage & Telemetry Kernel v2.6

Dashboard estático (sin build ni dependencias) que audita el coste real por tarea agéntica de la cohorte abierta/china MoE frente al suelo y la frontera propietarios de EE. UU.: precipicios de contexto >100K, inflación de razonamiento, swaps silenciosos de alias y presión de quema de bancos de suscripción.

## Ejecutar en local

Los módulos ES necesitan servirse por http (no funciona con `file://`):

```bash
python3 -m http.server 8765
# o: npx http-server -p 8765 -c-1 .
```

Abre http://localhost:8765.

## Desplegar en Netlify

```bash
netlify deploy --prod
```

`netlify.toml` publica la raíz (`publish = "."`) y fija CSP y cabeceras de seguridad. También puedes arrastrar la carpeta a Netlify Drop.

## Estructura

| Archivo | Rol |
| --- | --- |
| `index.html` | Marcado de todas las vistas y modales |
| `css/anvil.css` | Neo-brutalismo industrial (tokens, X-RAY, responsive) |
| `js/seed-data.js` | Semilla 2026-10-19, kernel de coste auditado, Prompt v2.0 |
| `js/chaos-oscilloscope.js` | Osciloscopio 60 FPS, radar de cohorte, radar de alias, sismógrafo |
| `js/gemini-ingestor.js` | Ingesta vía Gemini (JSON schema) + parser local determinista |
| `js/audio-synth.js` | Sintetizador Web Audio procedural |
| `js/main.js` | Estado, render, router, banco, ⌘K, logros |

## Datos

Precios, AA, coste/tarea y volúmenes son la semilla aportada a 2026-10-19 y no se verifican. Los supuestos del kernel (verbosidad CoT por modelo, 70 % de cache-hit, cache-write 1.25× de Anthropic, ×2.4 de reintentos fp8, rampa de contexto) están documentados en el bloque **AUDIT FORMULA** de la propia app.

La clave de Gemini se guarda sólo en `localStorage` del navegador.
