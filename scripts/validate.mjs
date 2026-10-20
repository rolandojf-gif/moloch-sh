#!/usr/bin/env node
/* Comprueba que el catálogo generado respeta las reglas de procedencia antes de publicarlo. */
import { readFile } from 'node:fs/promises';

const c = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const errors = [];
const isFact = f => f && typeof f === 'object' && 'v' in f;
function checkFact(f, where) {
  if (!isFact(f)) return errors.push(`${where}: no es un hecho con procedencia`);
  if (f.v === null) return;
  if (!f.src || !c.sources[f.src]) errors.push(`${where}: fuente desconocida (${f.src})`);
  if (!f.got || !/^\d{4}-\d{2}-\d{2}T/.test(f.got)) errors.push(`${where}: falta fecha de consulta`);
  if (!f.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(f.asOf)) errors.push(`${where}: falta fecha del dato`);
  if (typeof f.v === 'number' && (!Number.isFinite(f.v) || f.v < 0)) errors.push(`${where}: valor numérico inválido ${f.v}`);
}
if (!Array.isArray(c.models) || !c.models.length) errors.push('catálogo vacío');
const ids = new Set();
for (const m of c.models || []) {
  const w = m.id;
  if (ids.has(w)) errors.push(`${w}: duplicado`); ids.add(w);
  for (const k of ['weights', 'license', 'orCreated', 'ctx', 'reasoning', 'caching']) checkFact(m[k], `${w}.${k}`);
  for (const k of ['in', 'out', 'cacheRead', 'cacheWrite']) checkFact(m.price?.[k], `${w}.price.${k}`);
  if (![null, 'abiertos', 'cerrados'].includes(m.weights?.v)) errors.push(`${w}: pesos con valor no permitido ${m.weights?.v}`);
  if (m.identity !== 'confirmada' && m.lab?.country) errors.push(`${w}: identidad sin confirmar con país asignado`);
  if (m.epoch) for (const k of ['eci', 'release', 'access', 'swe']) checkFact(m.epoch[k], `${w}.epoch.${k}`);
  if (m.aa) for (const k of ['intelligence', 'coding', 'tps', 'ttft', 'release']) checkFact(m.aa[k], `${w}.aa.${k}`);
  if (m.price?.in?.v > 1000 || m.price?.out?.v > 1000) errors.push(`${w}: precio fuera de rango`);
}
for (const e of c.curatedEvents || []) if (!e.url) errors.push(`evento curado sin URL: ${e.title || e.model}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`validación correcta: ${c.models.length} modelos`);
