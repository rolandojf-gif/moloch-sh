#!/usr/bin/env node
/* ¿Hace falta esta recogida programada? No, si ya hay una recogida completa del día (hora de Madrid):
   la del disparo principal o la de un disparo anterior que GitHub haya lanzado con retraso.
   «Completa» = ninguna fuente obligatoria falló; si alguna falló, el disparo de respaldo vuelve a intentarlo.
   Escribe «falta=true» o «falta=false» para $GITHUB_OUTPUT y explica el motivo en el registro. */
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8').then(JSON.parse).catch(() => null);
const madrid = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(d);
const [c, ind] = await Promise.all([read('data/catalog.json'), read('data/indicadores.json')]);
const out = (falta, why) => { console.error(`[frescura] ${why}`); console.log(`falta=${falta}`); };

if (!c?.generated) out(true, 'no hay catálogo: se recoge');
else if (madrid(new Date(c.generated)) !== madrid(new Date())) out(true, `la última recogida es del ${madrid(new Date(c.generated))} (hora de Madrid): se recoge`);
else {
  const bad = [...Object.entries(c.status || {}), ...Object.entries(ind?.status || {})].filter(([, s]) => !s.ok && !s.optional).map(([k]) => k);
  if (bad.length) out(true, `ya hay recogida de hoy (${c.generated}), pero fallaron ${bad.join(', ')}: se repite`);
  else out(false, `ya hay una recogida completa de hoy (${c.generated}): no hace falta otra`);
}
