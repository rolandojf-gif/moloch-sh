#!/usr/bin/env node
/* MOLOCH.SH · herramientas de internacionalización, sin dependencias.

   Como biblioteca (las usan tests/i18n.test.mjs y scripts/validate.mjs):
     scan(src)            claves de t()/tn() de un fuente de js/ y literales en español que quedan FUERA de t()/tn()/tr()
     claves()             todas las claves de la interfaz usadas en js/*.js
     cargarMemoria()      la memoria de traducción (data/i18n/en/*.json) ya cargada en js/i18n.js
     cobertura()          textos de los datos publicados sin traducción inglesa (y entradas huérfanas de la memoria)
   Como orden:
     node scripts/i18n.mjs --faltan     lista lo que falta traducir (interfaz y datos)
     node scripts/i18n.mjs --literales  lista los literales en español que quedan en js/ fuera de t()
     node scripts/i18n.mjs --claves     lista las claves de la interfaz */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { setDictionary, find, FILES } from '../js/i18n.js';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));

/* ── Fuentes de js/: claves y literales ── */
const ES_WORDS = /\b(de|la|el|en|con|por|para|que|los|las|un|una|del|al|se|es|no|sin|más|su|sus|hoy|hace|desde|hasta|entre|sobre|frente|como|según|puntos?|modelos?|datos?|fechas?|precios?|índices?|mejor|mejores|abiertos?|cerrados?|pesos|días?|mes|meses|años?|semanas?|millones|laboratorios?|ingresos|gasto|cifras?|fuentes?|primer[oa]?|segundo|desde|sobre|tiene|llega|usuarios|potencia|evaluaci[oó]n(es)?|resultado|nota)\b/i;
export const spanish = s => /[áéíóúüñ¿¡]/i.test(s) || (s.trim().split(/\s+/).length >= 2 && ES_WORDS.test(s));
const wordy = s => /[a-záéíóúüñ]{3,}/.test(s.replace(/&\w+;/g, ' '));
const unesc = s => s.replace(/\\(.)/g, '$1');

function skipString(s, i) { const q = s[i]; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } return i + 1; }
function skipTemplate(s, i, onText) {
  i++; let buf = '';
  while (i < s.length && s[i] !== '`') {
    if (s[i] === '\\') { buf += s.slice(i, i + 2); i += 2; continue; }
    if (s[i] === '$' && s[i + 1] === '{') { buf += '\uE000'; i = skipExpr(s, i + 2, onText) + 1; continue; }
    buf += s[i]; i++;
  }
  onText?.(buf);
  return i + 1;
}
function regexOk(s, i) { let j = i - 1; while (j >= 0 && /\s/.test(s[j])) j--; if (j < 0) return true; if ('(,=:[!&|?{};+-*%<>~^'.includes(s[j])) return true; const w = /[A-Za-z]+$/.exec(s.slice(Math.max(0, j - 10), j + 1))?.[0]; return ['return', 'typeof', 'case', 'in', 'of'].includes(w); }
function skipRegex(s, i) { i++; let cls = false; while (i < s.length) { const c = s[i]; if (c === '\\') { i += 2; continue; } if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) { i++; break; } i++; } while (/[a-z]/.test(s[i] || '')) i++; return i; }
/* Recorre el fuente (y las expresiones de las plantillas) llamando a on(tipo, texto, inicio). */
function walk(s, i, end, on) {
  while (i < end) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { while (i < end && s[i] !== '\n') i++; }
    else if (c === '/' && n === '*') i = s.indexOf('*/', i) + 2;
    else if (c === "'" || c === '"') { const e = skipString(s, i); on('str', s.slice(i + 1, e - 1), i); i = e; }
    else if (c === '`') { const st = i; i = skipTemplate(s, i, txt => on('tpl', txt, st)); }
    else if (c === '/' && regexOk(s, i)) i = skipRegex(s, i);
    else i++;
  }
}
function skipExpr(s, i, onText) { // devuelve el «}» de cierre; recorre los literales anidados
  let depth = 1; const st = i;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') { i = skipString(s, i); continue; }
    if (c === '`') { i = skipTemplate(s, i, onText); continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 2; continue; }
    if (c === '/' && regexOk(s, i)) { i = skipRegex(s, i); continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (!depth) return i; }
    i++;
  }
  throw new Error('expresión sin cerrar');
}
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

export function scan(src) {
  const keys = [], starts = new Set();
  for (const m of src.matchAll(/(?<![\w$.])t\(\s*'((?:[^'\\]|\\.)*)'/g)) { keys.push({ key: unesc(m[1]), line: lineOf(src, m.index) }); starts.add(m.index + m[0].indexOf("'")); }
  for (const m of src.matchAll(/(?<![\w$.])tn\([^\n]*?,\s*\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/g)) {
    keys.push({ key: unesc(m[1]), other: unesc(m[2]), line: lineOf(src, m.index) });
    const a = src.indexOf("'", m.index + m[0].indexOf('[')); starts.add(a); starts.add(src.indexOf("'", a + m[1].length + 2 + 1));
  }
  for (const m of src.matchAll(/(?<![\w$.])(?:tr|L)\(\s*'((?:[^'\\]|\\.)*)'/g)) starts.add(m.index + m[0].indexOf("'"));
  const lits = [];
  const strip = s => s.replace(/\uE000/g, ' ');
  walk(src, 0, src.length, (kind, text, at) => {
    if (starts.has(at) || kind === 'str' && /^[\w./#:?&=%${}()[\]*+\-,^|~@!\s]*$/.test(text) && !spanish(text)) return;
    // En las plantillas HTML sólo cuenta el texto y el de los atributos que se leen (title, aria-label, alt, placeholder).
    const plain = strip(text).replace(/<[^>]*>/g, tag => ' ' + [...tag.matchAll(/\b(?:title|aria-label|alt|placeholder)="([^"]*)"/g)].map(m => m[1]).join(' ') + ' ');
    if (!wordy(plain) || !spanish(plain)) return;
    if (/^\s*<\//.test(plain) || /^[\s<>/\w=" .:;#-]+$/.test(plain) && !/[áéíóúñ]/.test(plain) && !ES_WORDS.test(plain)) return;
    lits.push({ line: lineOf(src, at), text: plain.replace(/\s+/g, ' ').trim() });
  });
  return { keys, lits };
}
export const jsFiles = () => readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'theme-init.js').map(f => `js/${f}`);
/* Textos fijos de index.html: data-t (texto), data-t-html (HTML) y data-t-attr (atributos). La clave es lo que lee la web:
   textContent / innerHTML / valor del atributo, en español. */
const decode = x => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export function estaticas() {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  for (const m of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)) {
    const [open, tag, attrs] = m, line = lineOf(html, m.index);
    const attr = n => new RegExp(`\\s${n}="([^"]*)"`).exec(attrs)?.[1];
    for (const n of (/\sdata-t-attr="([^"]*)"/.exec(attrs)?.[1] || '').split(',').map(x => x.trim()).filter(Boolean)) out.push({ key: decode(attr(n) ?? ''), line, tipo: n });
    const hasText = /\sdata-t(\s|>|$)/.test(open), hasHtml = /\sdata-t-html(\s|>|$)/.test(open);
    if (hasText || hasHtml) {
      const from = m.index + open.length, to = html.indexOf(`</${tag}>`, from), inner = html.slice(from, to);
      out.push({ key: hasHtml ? inner : decode(inner), line, tipo: hasHtml ? 'html' : 'texto' });
    }
  }
  return out;
}
export function claves() {
  const out = new Map();
  for (const k of estaticas()) if (k.key && !out.has(k.key)) out.set(k.key, { ...k, file: 'index.html' });
  for (const f of jsFiles()) for (const k of scan(readFileSync(path.join(ROOT, f), 'utf8')).keys) if (!out.has(k.key)) out.set(k.key, { ...k, file: f });
  return out;
}

/* ── Memoria de traducción ── */
export function cargarMemoria() {
  const files = {};
  for (const f of FILES) files[f] = read(`data/i18n/en/${f}.json`);
  setDictionary(files);
  return files;
}

/* ── Datos publicados: qué textos hay que traducir ──
   data/i18n/campos.json dice, por archivo, qué campos son texto en español que se muestra (y cuáles no). */
/* Recorre «o» siguiendo «partes» y devuelve cada texto con su clave y el objeto del que cuelga su traducción:
   el ancestro más próximo con «i18n.en» (lo escribe el recolector). «**» baja a cualquier profundidad. */
function* recorre(o, partes, anc = [], clave = '') {
  if (o === null || o === undefined) return;
  const [k, ...resto] = partes;
  const hijos = x => Array.isArray(x) ? x.map(v => [clave, v]) : Object.entries(x || {}).filter(([n]) => n !== 'i18n');
  const dueno = () => anc.findLast(a => a?.i18n?.en);
  if (k === undefined) { for (const v of [o].flat()) if (typeof v === 'string') yield { texto: v, clave, dueno: dueno(), lista: Array.isArray(o) }; return; }
  const con = x => (x && typeof x === 'object' ? [...anc, x] : anc);
  if (k === '*') { for (const [n, v] of hijos(o)) yield* recorre(v, resto, con(o), Array.isArray(o) ? clave : n); return; }
  if (k === '**') {
    yield* recorre(o, resto, anc, clave);
    if (o && typeof o === 'object') for (const [n, v] of hijos(o)) yield* recorre(v, partes, con(o), Array.isArray(o) ? clave : n);
    return;
  }
  yield* recorre(o[k], resto, con(o), k);
}
export function textosDeDatos() {
  const campos = read('data/i18n/campos.json');
  const out = [];   // { origen, texto, enOk }: enOk = el recolector ya escribió su inglés
  for (const [file, spec] of Object.entries(campos.archivos)) {
    const p = path.join(ROOT, file);
    if (!existsSync(p)) continue;
    const data = JSON.parse(readFileSync(p, 'utf8'));
    for (const campo of spec.campos) for (const r of recorre(data, campo.split('.'))) {
      if (!r.texto.trim()) continue;
      const en = r.dueno?.i18n?.en?.[r.clave];
      out.push({ origen: `${file}:${campo}`, texto: r.texto, enOk: typeof en === 'string' ? en.trim() !== '' : Array.isArray(en) });
    }
  }
  return out;
}
export function cobertura() {
  cargarMemoria();
  const faltan = new Map();
  for (const { origen, texto, enOk } of textosDeDatos()) if (!enOk && find(texto) === null && !faltan.has(texto)) faltan.set(texto, origen);
  return { faltan: [...faltan].map(([texto, origen]) => ({ texto, origen })) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv[2];
  if (a === '--claves') { for (const [k, v] of claves()) console.log(`${v.file}:${v.line}\t${k}`); }
  else if (a === '--literales') {
    let n = 0;
    for (const f of jsFiles()) for (const l of scan(readFileSync(path.join(ROOT, f), 'utf8')).lits) { console.log(`${f}:${l.line}\t${l.text.slice(0, 110)}`); n++; }
    console.log(`${n} literales en español fuera de t()`);
  } else if (a === '--faltan') {
    const ui = (() => { cargarMemoria(); return [...claves()].filter(([k]) => find(k) === null && !(k in (read('data/i18n/en/ui.json').exact || {}))); })();
    const ex = read('data/i18n/en/ui.json').exact || {};
    const uiFalta = [...claves()].filter(([k]) => !(k in ex));
    console.log(`Interfaz sin traducir: ${uiFalta.length}`); for (const [k, v] of uiFalta.slice(0, 400)) console.log(`  ${v.file}:${v.line}\t${k}`);
    const { faltan } = cobertura();
    console.log(`Datos sin traducir: ${faltan.length}`); for (const f of faltan.slice(0, 400)) console.log(`  ${f.origen}\t${f.texto.slice(0, 160)}`);
  } else console.log('Uso: node scripts/i18n.mjs --faltan | --literales | --claves');
}
