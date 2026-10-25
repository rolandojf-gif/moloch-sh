#!/usr/bin/env node
/* Herramienta de desarrollo (no forma parte de `node --test`): vuelca el DOM de la web con Chrome sin ventana y lo
   guarda o lo compara con una captura anterior. Sirve para demostrar que una refactorización no cambia ni un byte
   del español: se captura antes, se compara después (con los mismos datos y el mismo día).
   Uso:  node tests/golden-dom.mjs capture <carpeta> [consulta]     p. ej. node tests/golden-dom.mjs capture /tmp/es-antes
         node tests/golden-dom.mjs compare <carpeta> [consulta]
   `consulta` se añade a la URL (p. ej. "i18n=1&lang=en"). CHROME=/ruta/al/navegador si no es el de macOS/Linux habitual. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml' };
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);

export async function serve() {
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

export async function dump(base, query, hash, w = 1300, h = 900) {
  const url = `${base}${query ? '?' + query : ''}#${hash}`;
  const { stdout } = await promisify(execFile)(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`,
    '--virtual-time-budget=20000', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 128 << 20, timeout: 120000 });
  return stdout;
}

// Quita lo que cambia sin que cambie el contenido: huecos, tiempos relativos y la hoja de QA.
export const normalize = dom => dom.replace(/<script id="qa"[\s\S]*?<\/script>/g, '').replace(/\s+/g, ' ').replace(/> </g, '><')
  .replace(/hace \d+ (min|h|d)\b/g, 'hace N $1').replace(/\b(\d+) (min|h|d) ago\b/g, 'N $2 ago');

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, dir, query = ''] = process.argv.slice(2);
  if (!CHROME || !['capture', 'compare'].includes(cmd) || !dir) { console.error('Uso: golden-dom.mjs capture|compare <carpeta> [consulta]'); process.exit(2); }
  await mkdir(dir, { recursive: true });
  const { server, base } = await serve();
  let diffs = 0;
  for (const [w, h] of [[1300, 900], [390, 844]]) {
    const dom = normalize(await dump(base, query, 'hoy', w, h));
    const file = path.join(dir, `dom-${w}.html`);
    if (cmd === 'capture') { await writeFile(file, dom); console.log(`capturado ${file} (${dom.length} caracteres)`); continue; }
    const before = readFileSync(file, 'utf8');
    if (before === dom) { console.log(`${w}px: idéntico`); continue; }
    diffs++;
    let i = 0; while (i < dom.length && before[i] === dom[i]) i++;
    console.log(`${w}px: DIFERENTE en el carácter ${i}\n  antes:   …${before.slice(Math.max(0, i - 120), i + 200)}\n  después: …${dom.slice(Math.max(0, i - 120), i + 200)}`);
  }
  server.close();
  process.exit(diffs ? 1 : 0);
}
