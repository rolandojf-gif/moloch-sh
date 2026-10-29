/* Imagen para compartir el enlace (og:image, 1200×630): el líder cerrado y el abierto del índice de Artificial Analysis, con
   sus logos y la distancia, a partir de data/catalog.json. La dibuja Chrome sin interfaz y queda en data/og.png.
   Uso: node scripts/imagen.mjs   (CHROME=/ruta/al/navegador si no está en el PATH como google-chrome o chromium)
   Si no hay Chrome o falla, avisa y deja la imagen anterior: la recogida no debe fallar por esto. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logoFor } from '../js/logos.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'og.png');
const W = 1200, H = 630;

const cat = JSON.parse(readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
const ii = m => m.aa?.intelligence?.v ?? null;
// Los mismos criterios que los líderes de Hoy (js/hoy.js): índice de AA e identidad confirmada.
const scored = cat.models.filter(m => ii(m) !== null && m.identity === 'confirmada');
const leader = w => scored.filter(m => m.weights.v === w).sort((a, b) => ii(b) - ii(a))[0] || null;
const lc = leader('cerrados'), lo = leader('abiertos');
if (!lc || !lo) { console.log('Imagen para compartir: sin líderes con índice de AA; se deja la anterior.'); process.exit(0); }

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const day = cat.generated.slice(0, 10), [y, mo, d] = day.split('-').map(Number);
const fecha = `${d} ${MESES[mo - 1]} ${y}`;
const ver = cat.aaIndexVersion ? ` v${cat.aaIndexVersion}` : '';
const gap = Math.round((ii(lc) - ii(lo)) * 10) / 10;
const logo = m => {
  const rel = logoFor({ id: m.id, name: m.name });
  return rel ? `data:image/svg+xml;base64,${readFileSync(path.join(ROOT, rel)).toString('base64')}` : null;
};

const card = (m, cls, label) => {
  const src = logo(m), size = m.name.length > 22 ? 34 : m.name.length > 16 ? 40 : 46;
  return `<div class="card ${cls}">
    <div class="lbl">${label}</div>
    <div class="row">${src ? `<div class="logo"><img src="${src}" alt=""></div>` : ''}
      <div class="who"><div class="nm" style="font-size:${size}px">${esc(m.name)}</div>
      <div class="lab">${esc(m.lab.name)}${m.aaOnly ? ' · sin API pública' : ''}</div></div></div>
    <div class="val">${num(ii(m))}<span>índice AA${ver}</span></div>
  </div>`;
};

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@600;700&family=Space+Grotesk:wght@500;700&display=block">
<style>
* { box-sizing: border-box; margin: 0; }
html { background-color: #F4F3EF; background-image: linear-gradient(rgba(18,18,17,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(18,18,17,.06) 1px, transparent 1px);
  background-size: 24px 24px; }
body { width: ${W}px; color: #121211; font-family: Inter, system-ui, sans-serif; padding: 40px 56px; display: flex; flex-direction: column; gap: 26px; }
.top { display: flex; align-items: center; gap: 18px; }
.mark { width: 64px; height: 64px; background: #FF5722; border: 3px solid #121211; box-shadow: 4px 4px 0 #121211; color: #121211; font: 700 26px 'JetBrains Mono', monospace; display: flex; align-items: center; justify-content: center; }
.brand { font: 700 40px/1 'Space Grotesk', Arial, sans-serif; letter-spacing: -.01em; }
.brand b { color: #FF5722; }
.sub { font: 600 15px 'JetBrains Mono', monospace; color: #5B5A55; margin-top: 6px; }
.date { margin-left: auto; font: 700 18px 'JetBrains Mono', monospace; background: #CCFF00; border: 3px solid #121211; padding: 8px 14px; text-transform: uppercase; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; height: 350px; }
.card { background: #fff; border: 3px solid #121211; box-shadow: 8px 8px 0 #121211; padding: 22px 26px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.card.closed { border-top: 12px solid #E14B1E; }
.card.open { border-top: 12px solid #0E9F6E; }
.lbl { font: 700 18px 'Space Grotesk', Arial, sans-serif; padding-left: 10px; border-left: 6px solid #FF5722; }
.row { display: flex; align-items: center; gap: 18px; min-width: 0; }
.logo { width: 84px; height: 84px; flex: none; border: 2px solid #D9D7CF; display: flex; align-items: center; justify-content: center; background: #fff; }
.logo img { width: 56px; height: 56px; }
.who { min-width: 0; }
.nm { font-weight: 700; font-family: 'Space Grotesk', Arial, sans-serif; line-height: 1.05; letter-spacing: -.02em; }
.lab { font: 600 16px 'JetBrains Mono', monospace; color: #5B5A55; margin-top: 6px; }
.val { margin-top: auto; font: 700 64px/1 'Space Grotesk', Arial, sans-serif; letter-spacing: -.03em; display: flex; align-items: baseline; gap: 12px; }
.val span { font: 600 15px 'JetBrains Mono', monospace; color: #5B5A55; letter-spacing: 0; }
.foot { flex: none; display: flex; align-items: center; gap: 18px; background: #121211; color: #F4F3EF; padding: 14px 20px; font: 600 17px 'JetBrains Mono', monospace; }
.foot .gap { color: #CCFF00; font-weight: 700; }
.foot .url { margin-left: auto; color: #9C9B95; }
</style></head><body>
<div class="top"><div class="mark">&gt;_</div><div><div class="brand">MOLOCH<b>.SH</b></div><div class="sub">Observatorio de la carrera por la IA</div></div>
  <div class="date">${fecha}</div></div>
<div class="cards">${card(lc, 'closed', 'Líder cerrado')}${card(lo, 'open', 'Líder abierto')}</div>
<div class="foot"><span>Distancia <span class="gap">${num(gap)} puntos</span> · datos de Artificial Analysis</span><span class="url">moloch-sh.netlify.app</span></div>
</body></html>`;

const chrome = process.env.CHROME || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
  .find(b => { try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; } });
if (!chrome) { console.log('Imagen para compartir: no hay Chrome; se deja la anterior.'); process.exit(0); }
const dir = mkdtempSync(path.join(tmpdir(), 'og-'));
const page = path.join(dir, 'og.html');
writeFileSync(page, html);

/* Chrome por el protocolo de depuración en una tubería (--remote-debugging-pipe), sin dependencias: así se fija el tamaño
   exacto de la página (con --window-size Chrome resta el marco de una ventana que no dibuja) y se espera a las fuentes. */
function capture() {
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-pipe',
    `--user-data-dir=${path.join(dir, 'perfil')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const [toChrome, fromChrome] = [proc.stdio[3], proc.stdio[4]];
  let id = 0, buf = '';
  const waiting = new Map();
  fromChrome.on('data', d => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      const w = waiting.get(msg.id);
      if (w) { waiting.delete(msg.id); msg.error ? w.reject(new Error(msg.error.message)) : w.resolve(msg.result); }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id; waiting.set(n, { resolve, reject });
    toChrome.write(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  const run = (async () => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await s('Page.enable');
    await s('Page.navigate', { url: `file://${page}` });
    // Carga, fuentes e imágenes; con un límite por si alguna fuente no llega (se usa la de reserva).
    await s('Runtime.evaluate', { expression: `new Promise(r => { const go = () => Promise.race([document.fonts.ready, new Promise(q => setTimeout(q, 8000))]).then(() => setTimeout(r, 300)); document.readyState === 'complete' ? go() : addEventListener('load', go); })`, awaitPromise: true });
    const { data } = await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
    return Buffer.from(data, 'base64');
  })();
  const limit = new Promise((_, reject) => setTimeout(() => reject(new Error('Chrome no respondió en 60 s')), 60000));
  // Se espera a que Chrome se cierre antes de borrar su perfil temporal.
  return Promise.race([run, limit]).finally(() => new Promise(r => { if (proc.exitCode !== null) return r(); proc.once('exit', r); proc.kill(); }));
}

try {
  const png = await capture();
  if (png.length < 5000) throw new Error('captura vacía');
  writeFileSync(OUT, png);
  console.log(`Imagen para compartir: ${lc.name} ${num(ii(lc))} · ${lo.name} ${num(ii(lo))} → data/og.png`);
} catch (e) {
  console.log(`Imagen para compartir: falló (${e.message}); se deja la anterior.`);
} finally {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* perfil temporal de Chrome: no importa si queda */ }
}
