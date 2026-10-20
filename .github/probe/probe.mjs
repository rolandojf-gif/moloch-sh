// Sonda temporal (fase 2): descarga páginas y datos de fuentes primarias para revisarlas. Se elimina antes de fusionar.
import { readFile } from 'node:fs/promises';
const all = (await readFile(new URL('./urls.txt', import.meta.url), 'utf8')).split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const only = Number(process.argv[2]);
const [mode, u] = all[only - 1].split(/\s+/);
const UA = 'Mozilla/5.0 (compatible; moloch-sh-probe/1.0; +https://github.com/rolandojf-gif/moloch-sh)';
const text = html => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<nav[\s\S]*?<\/nav>/gi, ' ').replace(/<header[\s\S]*?<\/header>/gi, ' ').replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
  .replace(/<(h[1-6])[^>]*>/gi, '\n\n## ').replace(/<\/(p|div|li|tr|h[1-6]|section|article|br|td|th)>/gi, '\n')
  .replace(/<a [^>]*href="(http[^"]+)"[^>]*>/gi, ' [$1] ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
function parseCSV(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const out = [];
try {
  const r = await fetch(u, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow' });
  const body = await r.text();
  out.push(`PROBE ${r.status} ${r.headers.get('content-type')} ${body.length}B ${u}`);
  if (mode === 'csv') {
    const rows = parseCSV(body).filter(x => x.length > 1);
    const head = rows[0];
    out.push(`COLUMNS (${head.length}): ${head.join(' | ')}`);
    out.push(`ROWS: ${rows.length - 1}`);
    for (const x of rows.slice(1, 6)) out.push('ROW: ' + head.map((h, i) => `${h}=${(x[i] || '').slice(0, 120)}`).filter(s => !s.endsWith('=')).join(' ; '));
    const env = process.env.COLS;
    if (env) for (const col of env.split(',')) { const i = head.indexOf(col); if (i >= 0) { const cnt = {}; for (const x of rows.slice(1)) cnt[x[i]] = (cnt[x[i]] || 0) + 1; out.push(`VALUES ${col}: ` + Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 80).map(([k, v]) => `${k}(${v})`).join(' | ')); } }
  } else if (mode === 'archive') {
    for (const p of JSON.parse(body)) out.push(`POST ${p.post_date?.slice(0, 10)} | ${p.title} | ${p.canonical_url} | ${(p.description || p.subtitle || '').slice(0, 200)}`);
  } else if (mode === 'head') {
    out.push(...body.split('\n').slice(0, 120));
  } else {
    const lines = text(body).split('\n').map(s => s.trim()).filter(s => s.length >= 50 || (/^## /.test(s) && s.length > 8) || /\d/.test(s) && s.length > 12);
    out.push(...lines.map(s => s.slice(0, 2500)));
  }
} catch (e) { out.push(`PROBE ERR ${u}: ${e.message}`); }
console.log('=====BEGIN\n' + out.join('\n') + '\n=====END');
