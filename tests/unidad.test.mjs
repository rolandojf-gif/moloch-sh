/* Pruebas de las funciones de las que dependen las comparaciones, el parte y la recogida.
   Sin dependencias: node --test tests/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fmtDate, fmtDateTime, num, usd, aaRace } from '../js/fmt.js';
import { resolve } from '../js/valoracion.js';
import { importancia } from '../scripts/parte.mjs';
import { unzip } from '../scripts/indicadores.mjs';

const fixture = name => new URL(`./fixtures/${name}`, import.meta.url);

test('formato en español: fechas en UTC, decimales con coma, miles con punto', () => {
  assert.equal(fmtDate('2026-10-25'), '25 oct 2026');
  assert.equal(fmtDate('2026-01-01T00:30:00Z'), '1 ene 2026');
  assert.equal(fmtDate(null), '—');
  assert.equal(fmtDateTime('2026-10-25T11:20:15Z'), '25 oct 2026, 11:20 UTC');
  assert.equal(num(168.83, 1), '168,8');
  assert.equal(num(12345.6, 0), '12.346');
  assert.equal(usd(0.0525), '0,053 $');
  assert.equal(usd(2), '2,00 $');
  assert.equal(usd(0), '0 $');
  // El formateador se reutiliza: la segunda llamada con otras opciones no hereda las de la primera.
  assert.equal(num(1.25, 2), '1,25');
  assert.equal(num(1.25, 0), '1');
});

/* Catálogo mínimo con la forma que escribe scripts/collect.mjs. */
const model = (id, name, org, country, ii, date, weights = {}, version = '4.3') => ({
  id, name, lab: { name: org, country }, weights: { v: 'cerrados', ...weights },
  aa: { version, intelligence: { v: ii }, release: { v: date } }
});
const catalog = models => ({ generated: '2026-10-25T05:00:00Z', aaIndexVersion: '4.3', models });

test('aaRace: líderes, distancias y anunciados según el catálogo', () => {
  const r = aaRace(catalog([
    model('a/cerrado', 'Cerrado', 'LabA', 'US', 57.6, '2026-09-22'),
    model('b/anunciado', 'Anunciado', 'LabB', 'CN', 55.1, '2026-10-23', { v: 'abiertos', announced: true }),
    model('c/descargable', 'Descargable', 'LabC', 'CN', 46.3, '2026-09-21', { v: 'abiertos' }),
    model('d/viejo', 'Otra versión', 'LabD', 'US', 70, '2026-01-01', {}, '4.2'),
    model('e/futuro', 'Futuro', 'LabE', 'US', 80, '2026-12-01')
  ]));
  assert.equal(r.n, 3, 'fuera los de otra versión del índice y los de fecha futura');
  assert.equal(r.now.closed.n, 'Cerrado');
  assert.equal(r.now.open.n, 'Anunciado', 'los anunciados cuentan como abiertos');
  assert.equal(r.now.open.anun, true);
  assert.equal(r.series.at(-1).closedOpen, 2.5);
  assert.equal(r.now.first.org, 'LabA');
  assert.equal(r.now.second.org, 'LabB');
});

test('importancia: retirar una tarifa no es una subida de precio', () => {
  const precio = data => importancia({ kind: 'precio', data });
  assert.equal(precio({ sub: 'tarifa-retirada', pct: 120 }), null);
  assert.equal(precio({ sub: 'tarifa-nueva', pct: -60 }), null);
  assert.ok(precio({ sub: 'precio', pct: 60 }), '+60 % sí es noticia');
  assert.equal(precio({ sub: 'precio', pct: 20 }), null, '+20 % no llega al umbral');
  assert.ok(precio({ sub: 'gratis' }));
});

test('importancia: un cambio de líder sin margen no es noticia', () => {
  assert.equal(importancia({ kind: 'lider', data: { from: { iiNow: 55 }, margin: 0.2, block: 'abiertos' } }), null);
  assert.equal(importancia({ kind: 'lider', data: { from: { iiNow: 55 }, margin: 3, block: 'abiertos' } }).tier, 0);
});

test('valoración: la regla manda y, si no se calcula, se dice', () => {
  const v = { quien: 'observatorio', regla: 'swe85' };
  assert.equal(resolve(v, { swe85: { v: 'retrasado', texto: 't', fecha: '2026-10-25' } }).v, 'retrasado');
  assert.equal(resolve(v, {}).v, 'sin evidencia suficiente');
  const fija = { quien: 'observatorio', v: 'compatible' };
  assert.equal(resolve(fija, {}), fija);
});

test('lector de zip: entradas guardadas y comprimidas', () => {
  const files = unzip(readFileSync(fixture('mini.zip')));
  assert.equal(files.get('carpeta/plano.txt')().toString(), 'sin comprimir');
  const csv = files.get('carpeta/datos.csv')().toString();
  assert.ok(csv.startsWith('a,b\n1,2\n'));
  assert.equal(csv.split('\n').length, 202);
  assert.throws(() => unzip(Buffer.from('esto no es un zip, aunque tenga más de veintidós bytes')), /directorio central/);
});
