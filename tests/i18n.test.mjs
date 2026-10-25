/* Pruebas de la versión inglesa: node --test tests/
   Cobertura total de textos conocidos (interfaz, datos publicados, editorial), cifras idénticas en los dos idiomas,
   formatos, textos que genera el recolector (español idéntico al de antes e inglés revisado) y RSS inglés. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, claves, jsFiles, scan, cargarMemoria, cobertura, textosDeDatos, spanish } from '../scripts/i18n.mjs';
import { find, t, tn, tr, L, setLang, setDictionary, missing, clearMissing } from '../js/i18n.js';
import * as loc from '../js/locale.js';
import { AVISOS } from '../scripts/textos.mjs';
import { salida, salidaEn } from './fixtures/textos/salida.mjs';

const read = f => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
const text = f => readFileSync(path.join(ROOT, f), 'utf8');
const FILES = ['ui', 'hoy', 'carrera', 'ai2027', 'lanzamientos', 'notas'];
const dic = Object.fromEntries(FILES.map(f => [f, read(`data/i18n/en/${f}.json`)]));
const marks = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
/* Las cifras de un texto, sin separadores ni ceros finales (18.000 millones ↔ $18 billion), para compararlas entre idiomas. */
const nums = s => (String(s).match(/\d+(?:[.,]\d+)*/g) || []).map(x => x.replace(/[.,]/g, '').replace(/0+$/, '')).sort().join(' ');
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'i18n' ? undefined : v));

/* ── Interfaz ── */
test('interfaz: toda clave de t()/tn()/data-t tiene traducción y las marcas {x} coinciden', () => {
  const ex = dic.ui.exact, sin = [], marcas = [];
  for (const [k, v] of claves()) {
    const e = ex[k];
    if (e === undefined) { sin.push(`${v.file}:${v.line}  ${k}`); continue; }
    if (v.other !== undefined) {
      if (!Array.isArray(e) || e.length !== 2) sin.push(`${v.file}:${v.line}  plural sin [singular, plural]: ${k}`);
      else { if (marks(k) !== marks(e[0]) || marks(v.other) !== marks(e[1])) marcas.push(k); }
    } else if (marks(k) !== marks(e)) marcas.push(k);
  }
  assert.deepEqual(sin, [], `sin traducir:\n${sin.join('\n')}`);
  assert.deepEqual(marcas, [], `marcas distintas entre ES y EN:\n${marcas.join('\n')}`);
});

test('interfaz: no quedan entradas huérfanas en el diccionario', () => {
  const usadas = new Set([...claves().keys()]);
  const huerfanas = Object.keys(dic.ui.exact).filter(k => !usadas.has(k));
  assert.deepEqual(huerfanas, [], `entradas que ya no usa ningún texto:\n${huerfanas.join('\n')}`);
});

test('interfaz: ningún literal español nuevo fuera de t()/tn()/tr()/L() en js/', () => {
  const ok = read('tests/i18n-permitidos.json').archivos, nuevos = [];
  for (const f of jsFiles()) for (const l of scan(text(f)).lits) if (!(ok[f] || []).includes(l.text)) nuevos.push(`${f}:${l.line}  ${l.text.slice(0, 100)}`);
  assert.deepEqual(nuevos, [], `literales sin t(): envuélvelos en t() o, si son valores de datos que se traducen al mostrarlos, añádelos a tests/i18n-permitidos.json\n${nuevos.join('\n')}`);
});

test('interfaz: todo literal permitido tiene traducción (se traduce al mostrarlo)', () => {
  cargarMemoria();
  const sin = Object.entries(read('tests/i18n-permitidos.json').archivos).flatMap(([f, l]) => l.filter(x => !/^data\//.test(x) && find(x) === null).map(x => `${f}: ${x}`));
  assert.deepEqual(sin, []);
});

test('index.html: título y descripción en los dos idiomas, y sin hreflang engañoso', () => {
  const html = text('index.html'), ui = dic.ui.exact;
  const title = /<title[^>]*>([^<]*)<\/title>/.exec(html)[1], desc = /<meta name="description"[^>]*\scontent="([^"]*)"/.exec(html)[1];
  const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  for (const [k, v] of [[title, 'título'], [dec(desc), 'descripción']]) assert.ok(ui[k], `${v} sin traducción en ui.json`);
  assert.ok(!/<link[^>]*hreflang/.test(html), 'hreflang: las páginas inglesas no son indexables sin JavaScript');
  assert.match(html, /<html lang="es"/);
});

/* ── Memoria de traducción y datos publicados ── */
test('memoria: marcas {x} y cifras iguales entre español e inglés', () => {
  const marcas = [], cifras = [];
  for (const [f, d] of Object.entries(dic)) {
    for (const [es, en] of [...Object.entries(d.exact || {}), ...(d.patterns || [])]) for (const e of [en].flat()) {
      if (f !== 'ui' || !Array.isArray(en)) { if (marks(es) !== marks(e)) marcas.push(`${f}: ${es.slice(0, 80)}`); }
      if (nums(es) !== nums(e)) cifras.push(`${f}: ${es.slice(0, 80)} → ${e.slice(0, 80)}`);
    }
  }
  assert.deepEqual(marcas, []); assert.deepEqual(cifras, []);
});

test('memoria: ninguna traducción inglesa conserva rastros de español', () => {
  const sucias = [];
  for (const [f, d] of Object.entries(dic)) for (const [es, en] of [...Object.entries(d.exact || {}), ...(d.patterns || [])]) for (const e of [en].flat()) {
    const plain = e.replace(/\{\w+\}/g, ' ');
    if (/[áíóúñ¿¡]/i.test(plain) || /[ée]\b/.test(plain) && /[é]/.test(plain.replace(/communiqué/g, ''))) sucias.push(`${f}: ${e.slice(0, 100)}`);
  }
  assert.deepEqual(sucias, []);
});

test('cobertura: todo texto en español de los datos publicados tiene versión inglesa', () => {
  const { faltan } = cobertura();
  assert.deepEqual(faltan.map(f => `${f.origen}: ${f.texto.slice(0, 140)}`), [], 'textos conocidos sin traducir (añádelos a data/i18n/en/ o al recolector)');
  assert.ok(textosDeDatos().length > 3000, 'campos.json debe cubrir los datos publicados');
});

test('cobertura: los campos de campos.json existen en los datos', () => {
  const campos = read('data/i18n/campos.json').archivos, hoy = new Set(textosDeDatos().map(x => x.origen));
  const vacios = [];
  for (const [file, spec] of Object.entries(campos)) for (const c of spec.campos) if (!hoy.has(`${file}:${c}`)) vacios.push(`${file}:${c}`);
  assert.deepEqual(vacios, [], 'campo declarado que no tiene ningún texto (¿cambió el esquema?)');
});

test('datos publicados: lo que el recolector traduce lleva las mismas cifras que el español', () => {
  const dif = [], faltan = [];
  const par = (donde, es, en) => { if (typeof es !== 'string') return; if (typeof en !== 'string') faltan.push(donde); else if (nums(es) !== nums(en)) dif.push(`${donde}: ${es.slice(0, 70)} ≠ ${en.slice(0, 70)}`); };
  const ev = read('data/events-log.json'), ch = read('data/changes.json'), ind = read('data/indicadores.json');
  for (const [w, list] of [['events-log', ev.events], ['changes', ch.items]]) for (const e of list) {
    const en = e.i18n?.en || {};
    par(`${w} ${e.key} what`, e.what, en.what); par(`${w} ${e.key} titular`, e.titular, en.titular);
    if (e.importancia) par(`${w} ${e.key} porque`, e.importancia.porque, en.porque);
    if (e.consecuencia) par(`${w} ${e.key} consecuencia`, e.consecuencia, en.consecuencia ?? find(e.consecuencia));
  }
  for (const [k, c] of Object.entries(ind.checks)) { par(`checks.${k}.texto`, c.texto, c.i18n?.en?.texto); if (c.sentido) par(`checks.${k}.sentido`, c.sentido, c.i18n?.en?.sentido); }
  for (const v of ev.vigilados) par(`vigilados ${v.path}`, v.label, v.i18n?.en?.label);
  assert.deepEqual(faltan, [], 'sin versión inglesa');
  assert.deepEqual(dif, [], 'las cifras difieren entre idiomas');
});

test('datos publicados: reglas del parte en inglés con el mismo número de reglas', () => {
  const p = read('data/changes.json').parte;
  assert.equal(p.i18n.en.reglas.length, p.reglas.length);
  assert.ok(p.i18n.en.reglas.every(r => !spanish(r)));
});

/* ── Mecanismo ── */
test('t(), tn(), tr() y L(): español intacto, inglés con la memoria y sin romper lo que falta', () => {
  setDictionary(dic); clearMissing();
  setLang('es');
  assert.equal(t('Hoy'), 'Hoy');
  assert.equal(tr('texto cualquiera'), 'texto cualquiera');
  setLang('en');
  assert.equal(t('Hoy'), 'Today');
  assert.equal(t('Modelos'), 'Models');
  assert.equal(t('Lanzamientos'), 'Releases');
  assert.equal(t('La carrera'), 'The AI Race');
  assert.equal(tn(1, ['un mes', '{n} meses']), 'one month');
  assert.equal(tn(3, ['un mes', '{n} meses']), '3 months');
  assert.equal(t('texto que no existe'), 'texto que no existe', 'lo que falta se muestra en español, sin romper');
  assert.deepEqual(missing().ui, ['texto que no existe']);
  assert.equal(tr('precio del propio laboratorio (OpenAI) en OpenRouter'), 'the lab’s own price (OpenAI) on OpenRouter');
  assert.equal(L({ x: 'Hola', i18n: { en: { x: 'Hello' } } }, 'x'), 'Hello');
  assert.equal(L({ x: 'Hola' }, 'x'), 'Hola');
  setLang('es');
});

test('glosario aprobado', () => {
  const ui = dic.ui.exact, en = k => [ui[k]].flat().join(' ');
  for (const [es, ing] of [['Hoy', 'Today'], ['Modelos', 'Models'], ['Lanzamientos', 'Releases'], ['La carrera', 'The AI Race']]) assert.equal(en(es), ing);
  // Un término del glosario aparece siempre con su traducción aprobada.
  const reglas = [[/Lectura Moloch/, /Moloch Analysis/], [/[Pp]arte diario/, /Daily Briefing/], [/\bHito\b/, /Milestone/], [/\bcompatible\b/i, /onsistent with the scenario/]];
  const mal = [];
  for (const [k, v] of Object.entries(ui)) for (const [rx, ok] of reglas) if (rx.test(k) && k.length < 90 && !ok.test([v].flat().join(' '))) mal.push(`${k} → ${[v].flat()[0]}`);
  assert.deepEqual(mal, [], 'términos del glosario con otra traducción');
});

/* ── Formatos ── */
test('formatos en inglés (en-GB): fechas, decimales, miles y dólares', () => {
  assert.equal(loc.date('en', '2026-10-25'), '25 Oct 2026');
  assert.equal(loc.date('es', '2026-10-25'), '25 oct 2026');
  assert.equal(loc.date('en', '2026-09-22'), '22 Sep 2026', 'sept → Sep');
  assert.equal(loc.num('en', 168.83, 1), '168.8');
  assert.equal(loc.num('es', 168.83, 1), '168,8');
  assert.equal(loc.num('en', 12345.6, 0), '12,346');
  assert.equal(loc.num('es', 12345.6, 0), '12.346');
  assert.equal(loc.usd('en', 0.0525), '$0.053');
  assert.equal(loc.usd('es', 0.0525), '0,053 $');
  assert.equal(loc.usd('en', 2), '$2.00');
  assert.equal(loc.usd('en', 0), '$0');
  assert.equal(loc.num('en', 1.25, 2), '1.25');
  assert.equal(loc.num('en', 1.25, 0), '1', 'el formateador cacheado no hereda opciones');
  assert.equal(loc.dateTime('en', '2026-10-25T11:20:15Z'), '25 Oct 2026, 11:20 UTC');
});

/* ── Textos que genera el recolector ── */
test('recolector: el español sigue siendo byte a byte el de antes', () => {
  assert.deepEqual(strip(salida()), read('tests/fixtures/textos/es.json'));
});

test('recolector: el inglés generado es el revisado y no deja nada sin traducir (salvo el texto sintético de la prueba)', () => {
  AVISOS.clear();
  const en = salidaEn();
  assert.deepEqual(en, read('tests/fixtures/textos/en.json'));
  const sintetico = new Set(['40 millones de H100e', 'Otro hito', 'Ningún modelo llega al 85 %.', 'Al ritmo actual, a fin de 2026.', 'fin de 2026', 'Se cumple.']);
  assert.deepEqual([...AVISOS].filter(a => !sintetico.has(a)), [], 'texto del recolector sin plantilla inglesa ni memoria');
  const sinNombres = v => v.replace(/Delta Líder|Zeta Anónimo|Ningún modelo llega al 85 %\./g, '');
  const sucios = en.items.flatMap(e => Object.entries(e).filter(([k, v]) => typeof v === 'string' && /[áéíóúñ¿¡]/.test(sinNombres(v))).map(([k, v]) => `${e.key}.${k}: ${v.slice(0, 80)}`));
  assert.deepEqual(sucios, []);
});

test('recolector: ES y EN llevan las mismas cifras en cada texto', () => {
  const es = salida(), en = salidaEn(), dif = [];
  es.items.forEach((e, i) => {
    const x = en.items[i];
    for (const [k, v] of [['what', e.what], ['titular', e.titular], ['consecuencia', e.consecuencia], ['porque', e.importancia?.porque]]) {
      if (typeof v === 'string' && typeof x[k] === 'string' && nums(v) !== nums(x[k])) dif.push(`${e.key}.${k}: ${v.slice(0, 60)} ≠ ${x[k].slice(0, 60)}`);
    }
  });
  assert.deepEqual(dif, []);
});

/* ── RSS ── */
test('RSS: parte.xml y parte.en.xml tienen las mismas noticias, uno en español y otro en inglés', () => {
  const es = text('data/parte.xml'), en = text('data/parte.en.xml');
  const guids = x => x.match(/<guid[^>]*>[^<]*<\/guid>/g) || [];
  assert.match(es, /<language>es/); assert.match(en, /<language>en/);
  assert.deepEqual(guids(en), guids(es));
  assert.ok(guids(en).length > 0);
  const titulos = x => [...x.matchAll(/<item>[\s\S]*?<title>([^<]*)<\/title>/g)].map(m => m[1]);
  assert.equal(titulos(en).length, titulos(es).length);
  assert.ok(titulos(en).every(s => !spanish(s)), 'títulos del RSS inglés en español');
  assert.ok(!/[áéíóúñ¿¡]/.test(en.replace(/<(?:guid|link|atom:link)[^>]*>[^<]*<\/(?:guid|link|atom:link)>/g, '')), 'tildes españolas en el RSS inglés');
  assert.match(en, /\?lang=en/);
});

test('RSS del caso sintético: inglés válido y mismos elementos', () => {
  const es = salida().rss, en = salidaEn().rss, n = x => (x.match(/<item>/g) || []).length;
  assert.equal(n(en), n(es)); assert.ok(n(en) > 0);
  assert.match(en, /<language>en/);
});

/* ── Memoria cargada como la carga la web ── */
test('cargarMemoria() deja el diccionario como lo carga el navegador', () => {
  const files = cargarMemoria();
  assert.deepEqual(Object.keys(files), FILES);
  assert.equal(find('Hoy'), 'Today');
  assert.equal(find('cadena que no existe en ningún diccionario'), null);
});
