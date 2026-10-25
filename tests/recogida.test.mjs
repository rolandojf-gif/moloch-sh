/* La recogida completa con respuestas grabadas (tests/fixtures/recogida) en una copia del repositorio, y después la
   validación. Sólo hay respuestas de OpenRouter y de Hugging Face: el resto de fuentes falla a propósito, así que también
   se prueba que el recolector conserva los valores anteriores y sigue. No toca data/ del repositorio. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('recogida con respuestas grabadas, validación y parte', { timeout: 300000 }, t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'moloch-recogida-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const d of ['scripts', 'js', 'data']) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  const env = { ...process.env, FIXTURES: path.join(ROOT, 'tests/fixtures/recogida'), WINDOW_DAYS: '100000', AA_API_KEY: '', OPENROUTER_API_KEY: '', GITHUB_REF: '' };
  const run = script => spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8' });

  const c = run('scripts/collect.mjs');
  assert.equal(c.status, 0, `el recolector termina bien\n${c.stdout}\n${c.stderr}`);
  const v = run('scripts/validate.mjs');
  assert.equal(v.status, 0, `la validación pasa\n${v.stdout}\n${v.stderr}`);

  const read = p => JSON.parse(readFileSync(path.join(dir, p), 'utf8'));
  const cat = read('data/catalog.json');
  assert.deepEqual(cat.models.map(m => m.id).sort(), ['anthropic/claude-opus-5.5', 'deepseek/deepseek-v4.1-flash', 'moonshotai/kimi-k3.1-pro']);
  assert.ok(cat.excluded.some(e => e.id === 'openai/gpt-image-3'), 'los generadores de imagen quedan fuera');
  const byId = new Map(cat.models.map(m => [m.id, m]));
  const kimi = byId.get('moonshotai/kimi-k3.1-pro').weights;
  assert.equal(kimi.v, 'abiertos');
  assert.equal(kimi.announced, true, 'sin repositorio y presentado como de pesos abiertos: anunciado');
  assert.equal(kimi.src, 'openrouter');
  assert.match(kimi.since, /^\d{4}-\d{2}-\d{2}$/, 'con la fecha desde la que consta como anunciado');
  assert.equal(byId.get('deepseek/deepseek-v4.1-flash').weights.src, 'hf', 'con repositorio en Hugging Face: descargable');
  assert.equal(byId.get('anthropic/claude-opus-5.5').price.in.v, 5, 'precio del propio laboratorio por millón');
  assert.equal(cat.status.openrouter.ok, true);
  assert.equal(cat.status.epoch.ok, false, 'una fuente sin respuesta queda marcada como fallida');

  const ch = read('data/changes.json');
  assert.ok(ch.parte && Array.isArray(ch.parte.noticias) && ch.parte.noticias.length <= 3, 'hay parte, con tres noticias como mucho');
  assert.ok(readFileSync(path.join(dir, 'data/parte.xml'), 'utf8').startsWith('<?xml'), 'se escribe el RSS');
  // Versión inglesa: segundo RSS con las mismas noticias, inglés en cada cambio y en el parte, y la recogida no depende de las traducciones.
  const en = readFileSync(path.join(dir, 'data/parte.en.xml'), 'utf8');
  assert.ok(en.startsWith('<?xml') && /<language>en/.test(en), 'se escribe el RSS inglés');
  assert.equal(ch.parte.i18n.en.reglas.length, ch.parte.reglas.length, 'las reglas del parte llevan su inglés');
  for (const e of ch.items) assert.ok(e.i18n?.en?.what, `${e.key}: el cambio lleva su inglés`);
  assert.ok(Object.values(read('data/indicadores.json').checks || {}).every(k => k.i18n?.en?.texto), 'las comprobaciones de AI 2027 llevan su inglés');
});
