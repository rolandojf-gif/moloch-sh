// Sonda temporal (fase 2): descarga páginas y datos de fuentes primarias para revisarlas. Se elimina antes de fusionar.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
const all = (await readFile(new URL('./urls.txt', import.meta.url), 'utf8')).split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const only = process.argv[2] ? Number(process.argv[2]) : null;
const urls = only ? [all[only - 1]] : all;
await mkdir('probe-out', { recursive: true });
const UA = 'Mozilla/5.0 (compatible; moloch-sh-probe/1.0; +https://github.com/rolandojf-gif/moloch-sh)';
const text = html => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<(h[1-6])[^>]*>/gi, '\n\n## ').replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, '\n')
  .replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, ' [$1] ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
let i = only ? only - 1 : 0;
for (const u of urls) {
  i++;
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow' });
    const ct = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    const name = String(i).padStart(2, '0') + '_' + u.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 90);
    let body;
    if (/zip/.test(ct) || u.endsWith('.zip')) { await writeFile(`probe-out/${name}.zip`, buf); body = `[zip ${buf.length} bytes]`; }
    else if (/html/.test(ct)) { body = text(buf.toString('utf8')); await writeFile(`probe-out/${name}.txt`, `URL: ${u}\nSTATUS: ${r.status}\nFINAL: ${r.url}\n\n${body}`); }
    else { body = buf.toString('utf8'); await writeFile(`probe-out/${name}.${/json/.test(ct) ? 'json' : /csv/.test(ct) || u.endsWith('.csv') ? 'csv' : 'txt'}`, body); }
    console.log(`PROBE ${r.status} ${ct} ${buf.length}B ${u} -> ${name}`);
    if (only && !/zip/.test(ct)) { console.log('=====BEGIN'); for (const line of body.split('\n')) if (line.trim()) console.log(line.slice(0, 3000)); console.log('=====END'); }
  } catch (e) { console.log(`PROBE ERR ${u}: ${e.message}`); }
}
