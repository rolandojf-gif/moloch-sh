/* La recogida completa con respuestas grabadas (tests/fixtures/recogida) en una copia del repositorio, y después la
   validación. Sólo hay respuestas de OpenRouter, Hugging Face y una sintética de Artificial Analysis: el resto de fuentes
   falla a propósito, así que también se prueba que el recolector conserva los valores anteriores y sigue. No toca data/
   del repositorio. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('recogida con respuestas grabadas, validación y parte', { timeout: 300000 }, t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'moloch-recogida-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const d of ['scripts', 'js', 'data']) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  // Respuestas grabadas en una copia: el modelo de AA sin OpenRouter sale con fecha de ayer, para que caiga en la ventana de Hoy.
  const fx = path.join(dir, 'fixtures');
  cpSync(path.join(ROOT, 'tests/fixtures/recogida'), fx, { recursive: true });
  const aaFx = path.join(fx, 'artificialanalysis_ai_api_v2_language_models_free_page_1.json'), aa = JSON.parse(readFileSync(aaFx, 'utf8'));
  const ayer = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  for (const r of aa.data) if (/^gemini-4-carbon/.test(r.slug)) r.release_date = ayer;
  writeFileSync(aaFx, JSON.stringify(aa));
  const env = { ...process.env, FIXTURES: fx, WINDOW_DAYS: '100000', AA_API_KEY: '', OPENROUTER_API_KEY: '', GITHUB_REF: '' };
  const run = script => spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8' });

  const c = run('scripts/collect.mjs');
  assert.equal(c.status, 0, `el recolector termina bien\n${c.stdout}\n${c.stderr}`);
  const v = run('scripts/validate.mjs');
  assert.equal(v.status, 0, `la validación pasa\n${v.stdout}\n${v.stderr}`);

  const read = p => JSON.parse(readFileSync(path.join(dir, p), 'utf8'));
  const cat = read('data/catalog.json');
  assert.deepEqual(cat.models.map(m => m.id).sort(), ['anthropic/claude-opus-5.5', 'deepseek/deepseek-v4.1-flash', 'google/gemini-4-carbon', 'moonshotai/kimi-k3.1-pro']);
  assert.ok(cat.excluded.some(e => e.id === 'openai/gpt-image-3'), 'los generadores de imagen quedan fuera');
  const byId = new Map(cat.models.map(m => [m.id, m]));
  const kimi = byId.get('moonshotai/kimi-k3.1-pro').weights;
  assert.equal(kimi.v, 'abiertos');
  assert.equal(kimi.announced, true, 'sin repositorio y presentado como de pesos abiertos: anunciado');
  assert.equal(kimi.src, 'openrouter');
  assert.match(kimi.since, /^\d{4}-\d{2}-\d{2}$/, 'con la fecha desde la que consta como anunciado');
  assert.equal(byId.get('deepseek/deepseek-v4.1-flash').weights.src, 'hf', 'con repositorio en Hugging Face: descargable');
  assert.equal(byId.get('anthropic/claude-opus-5.5').price.in.v, 5, 'precio del propio laboratorio por millón');
  // Puntuado por AA sin estar en OpenRouter: entra marcado, con la configuración de mayor índice y sin precio.
  const carbon = byId.get('google/gemini-4-carbon');
  assert.equal(carbon.aaOnly?.v, true);
  assert.equal(carbon.aa.slug, 'gemini-4-carbon');
  assert.equal(carbon.aa.intelligence.v, 72.3);
  assert.equal(carbon.price.basis, 'sin-api');
  assert.equal(carbon.price.in.v, null);
  assert.equal(carbon.orCreated.v, null);
  assert.equal(byId.get('anthropic/claude-opus-5.5').aa?.slug, 'claude-opus-5-5', 'los de OpenRouter se siguen emparejando');
  assert.equal(byId.get('anthropic/claude-opus-5.5').aaOnly, undefined);
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
  assert.ok(ch.items.some(e => e.key === 'sinapi|google/gemini-4-carbon'), 'su aparición figura en Hoy');
  assert.equal(read(`data/history/${cat.generated.slice(0, 10)}.json`).models['google/gemini-4-carbon'].ao, 1, 'la instantánea lo marca para no darlo por retirado');
  assert.ok(Object.values(read('data/indicadores.json').checks || {}).every(k => k.i18n?.en?.texto), 'las comprobaciones de AI 2027 llevan su inglés');
});

test('reutilización de AA: conserva puntuaciones sin stale, limpia stale heredado y validate bloquea incoherencias', { timeout: 300000 }, t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'moloch-aa-reuse-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const d of ['scripts', 'js', 'data']) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  const fx = path.join(dir, 'fixtures');
  cpSync(path.join(ROOT, 'tests/fixtures/recogida'), fx, { recursive: true });
  const aaFx = path.join(fx, 'artificialanalysis_ai_api_v2_language_models_free_page_1.json'), aa = JSON.parse(readFileSync(aaFx, 'utf8'));
  const ayer = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  for (const r of aa.data) if (/^gemini-4-carbon/.test(r.slug)) r.release_date = ayer;
  writeFileSync(aaFx, JSON.stringify(aa));
  const baseEnv = { ...process.env, FIXTURES: fx, WINDOW_DAYS: '100000', AA_API_KEY: '', OPENROUTER_API_KEY: '', GITHUB_REF: 'refs/heads/main' };
  const run = (script, extra = {}) => spawnSync(process.execPath, [script], { cwd: dir, env: { ...baseEnv, ...extra }, encoding: 'utf8' });

  // 1. Primera recogida fresca para fijar el catálogo con status.aa.got reciente.
  assert.equal(run('scripts/collect.mjs').status, 0);
  // Sembrar stale heredado en modelos de OpenRouter y aaOnly (como ocurría en schema 2) y quitar el fixture de AA.
  const catPath = path.join(dir, 'data/catalog.json');
  const prev = JSON.parse(readFileSync(catPath, 'utf8'));
  for (const m of prev.models) {
    if (m.aa) { m.aa.stale = true; m.aa.intelligence.stale = true; }
    if (m.aaOnly) { m.aaOnly.stale = true; m.orCreated.stale = true; m.price.in.stale = true; }
  }
  writeFileSync(catPath, JSON.stringify(prev));
  rmSync(aaFx);

  // 2. Segunda recogida con AA_TEST_REUSE=1: reutiliza AA sin consultar el fixture borrado y limpia todo stale de AA.
  const c2 = run('scripts/collect.mjs', { AA_TEST_REUSE: '1' });
  assert.equal(c2.status, 0, `la recogida con reutilización termina bien\n${c2.stdout}\n${c2.stderr}`);
  const v2 = run('scripts/validate.mjs');
  assert.equal(v2.status, 0, `la validación tras reutilizar pasa\n${v2.stdout}\n${v2.stderr}`);

  const reused = JSON.parse(readFileSync(catPath, 'utf8'));
  assert.ok(reused.schema >= 3);
  assert.equal(reused.status.aa.ok, true);
  assert.equal(reused.status.aa.reused, true);
  for (const m of reused.models) {
    if (m.aa) {
      assert.equal(m.aa.stale, undefined, `${m.id}.aa sin stale`);
      assert.equal(m.aa.intelligence.stale, undefined, `${m.id}.aa.intelligence sin stale`);
    }
    if (m.aaOnly) {
      assert.equal(m.aaOnly.stale, undefined, `${m.id}.aaOnly sin stale`);
      assert.equal(m.orCreated.stale, undefined, `${m.id}.orCreated sin stale`);
      assert.equal(m.price.in.stale, undefined, `${m.id}.price.in sin stale`);
    }
  }

  // 3. Si un hecho de AA queda marcado stale estando status.aa.ok === true, validate.mjs falla.
  const broken = structuredClone(reused);
  broken.models.find(m => m.aa).aa.intelligence.stale = true;
  writeFileSync(catPath, JSON.stringify(broken));
  const vBad = run('scripts/validate.mjs');
  assert.notEqual(vBad.status, 0, 'validate rechaza hechos stale cuya fuente figura ok');
  assert.match(vBad.stderr, /marcado stale aunque su fuente \(aa\) figura ok/);
});

test('primera recogida tras corregir emparejamiento AA: cero eventos ni noticias espurias', { timeout: 300000 }, t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'moloch-aa-transicion-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const d of ['scripts', 'js', 'data']) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  // Limpiar history previo para aislar exactamente la comparación contra la víspera sembrada.
  rmSync(path.join(dir, 'data/history'), { recursive: true, force: true });
  cpSync(path.join(ROOT, 'data/history'), path.join(dir, 'data/history'), { recursive: true, filter: src => src.endsWith('history') });

  const fx = path.join(dir, 'fixtures');
  cpSync(path.join(ROOT, 'tests/fixtures/recogida'), fx, { recursive: true });
  const nowMs = Date.now();
  const day = n => new Date(nowMs - n * 86400e3).toISOString().slice(0, 10);
  const ayer = day(1), hace3 = day(3), hace4 = day(4);

  // Añadir a los fixtures: tencent/hy4 (reciente, dentro de Hoy), pareja en colisión gemini-3.1-flash-lite(-preview)
  // y una puntuación genuinamente nueva hoy (deepseek/deepseek-v4.1-flash).
  const orFx = path.join(fx, 'openrouter_ai_api_v1_models.json'), orData = JSON.parse(readFileSync(orFx, 'utf8'));
  const mkOr = (id, name, createdIso) => ({
    id, canonical_slug: id, name, created: Math.floor(Date.parse(`${createdIso}T12:00:00Z`) / 1000),
    description: name, context_length: 128000, architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    pricing: { prompt: '0.0000004', completion: '0.0000012' }, supported_parameters: ['reasoning'], hugging_face_id: null
  });
  orData.data.push(
    mkOr('tencent/hy4', 'Tencent: Hy4', hace3),
    mkOr('google/gemini-3.1-flash-lite', 'Google: Gemini 3.1 Flash Lite', '2026-05-07'),
    mkOr('google/gemini-3.1-flash-lite-preview', 'Google: Gemini 3.1 Flash Lite Preview', '2026-03-03')
  );
  writeFileSync(orFx, JSON.stringify(orData));

  const aaFx = path.join(fx, 'artificialanalysis_ai_api_v2_language_models_free_page_1.json'), aaData = JSON.parse(readFileSync(aaFx, 'utf8'));
  for (const r of aaData.data) if (/^gemini-4-carbon/.test(r.slug)) r.release_date = ayer;
  aaData.data.push(
    {
      id: 'fx-tencent-hy4', slug: 'tencent-hy4', name: 'Tencent Hy4',
      model_creator: { id: 'a4e5bd55-a6cd-4dcf-8d4a-1d9643cd3826', name: 'Tencent', slug: 'tencent' },
      release_date: hace4, evaluations: { artificial_analysis_intelligence_index: 34.6 }, pricing: {}
    },
    {
      id: 'fx-g31-lite', slug: 'gemini-3-1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite',
      model_creator: { id: 'faddc6d9-2c14-445f-9b28-56726f59c793', name: 'Google', slug: 'google' },
      release_date: '2026-03-03', evaluations: { artificial_analysis_intelligence_index: 6.2 }, pricing: {}
    },
    {
      id: 'fx-ds-flash', slug: 'deepseek-v4-1-flash', name: 'DeepSeek V4.1 Flash',
      model_creator: { id: '58b835bf-4c87-4f87-a846-df4b692c6e7d', name: 'DeepSeek', slug: 'deepseek' },
      release_date: '2026-09-15', evaluations: { artificial_analysis_intelligence_index: 68.5 }, pricing: {}
    }
  );
  writeFileSync(aaFx, JSON.stringify(aaData));

  // Sembrar catálogo previo (schema 3), instantánea de ayer y events-log con el estado contaminado previo al arreglo.
  const gotAyer = `${ayer}T20:00:00Z`;
  const aaFact = (v, url) => ({ v, src: 'aa', url, asOf: ayer, got: gotAyer });
  const prevCat = JSON.parse(readFileSync(path.join(dir, 'data/catalog.json'), 'utf8'));
  prevCat.schema = 3;
  prevCat.generated = gotAyer;
  prevCat.status.aa = { ok: true, got: gotAyer };
  prevCat.aaIndexVersion = '5';
  const baseModels = [
    {
      id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', identity: 'confirmada',
      lab: { id: 'anthropic', name: 'Anthropic', country: 'US', url: 'https://www.anthropic.com', src: 'curated' },
      weights: { v: 'cerrados', src: 'openrouter', url: 'https://openrouter.ai/anthropic/claude-opus-5.5', asOf: ayer, got: gotAyer },
      license: { v: 'propietaria', src: 'openrouter', url: 'https://openrouter.ai/anthropic/claude-opus-5.5', asOf: ayer, got: gotAyer },
      orCreated: { v: '2026-09-01', src: 'openrouter', url: 'https://openrouter.ai/anthropic/claude-opus-5.5', asOf: '2026-09-01', got: gotAyer },
      price: { basis: 'laboratorio', provider: 'Anthropic', in: { v: 5, src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer }, out: { v: 25, src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer }, cacheRead: { v: null, src: 'openrouter', url: null }, cacheWrite: { v: null, src: 'openrouter', url: null } },
      aa: { slug: 'claude-opus-5-5', name: 'Claude Opus 5.5 (Max)', how: 'nombre exacto', url: 'https://artificialanalysis.ai/models/claude-opus-5-5', version: '5', intelligence: aaFact(70.1, 'https://artificialanalysis.ai/models/claude-opus-5-5'), release: aaFact('2026-09-01', 'https://artificialanalysis.ai/models/claude-opus-5-5') }
    },
    {
      id: 'tencent/hy4', name: 'Hy4', identity: 'confirmada',
      lab: { id: 'tencent', name: 'Tencent', country: 'CN', url: 'https://hunyuan.tencent.com', src: 'curated' },
      weights: { v: 'cerrados', src: 'openrouter', url: 'https://openrouter.ai/tencent/hy4', asOf: ayer, got: gotAyer },
      license: { v: 'propietaria', src: 'openrouter', url: 'https://openrouter.ai/tencent/hy4', asOf: ayer, got: gotAyer },
      orCreated: { v: hace3, src: 'openrouter', url: 'https://openrouter.ai/tencent/hy4', asOf: hace3, got: gotAyer },
      price: { basis: 'referencia', provider: null, in: { v: 0.4, src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer }, out: { v: 1.2, src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer }, cacheRead: { v: null, src: 'openrouter', url: null }, cacheWrite: { v: null, src: 'openrouter', url: null } },
      aa: null
    },
    {
      id: 'tencent/tencent-hy4', name: 'Tencent Hy4', identity: 'confirmada',
      lab: { id: 'tencent', name: 'Tencent', country: 'CN', url: 'https://hunyuan.tencent.com', src: 'curated' },
      weights: { v: 'cerrados', src: 'aa', url: 'https://artificialanalysis.ai/models/tencent-hy4', asOf: ayer, got: gotAyer, inferred: true },
      license: { v: 'propietaria', src: 'aa', url: 'https://artificialanalysis.ai/models/tencent-hy4', asOf: ayer, got: gotAyer, inferred: true },
      orCreated: { v: null, src: 'openrouter', url: null },
      price: { basis: 'sin-api', provider: null, in: { v: null, src: 'openrouter', url: null }, out: { v: null, src: 'openrouter', url: null }, cacheRead: { v: null, src: 'openrouter', url: null }, cacheWrite: { v: null, src: 'openrouter', url: null } },
      aaOnly: { v: true, src: 'aa', url: 'https://artificialanalysis.ai/models/tencent-hy4', asOf: ayer, got: gotAyer, since: ayer },
      aa: { slug: 'tencent-hy4', name: 'Tencent Hy4', how: 'sin pareja en OpenRouter', url: 'https://artificialanalysis.ai/models/tencent-hy4', version: '5', intelligence: aaFact(34.6, 'https://artificialanalysis.ai/models/tencent-hy4'), release: aaFact(hace4, 'https://artificialanalysis.ai/models/tencent-hy4') }
    },
    {
      id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', identity: 'confirmada',
      lab: { id: 'google', name: 'Google', country: 'US', url: 'https://deepmind.google', src: 'curated' },
      weights: { v: 'cerrados', src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer },
      license: { v: 'propietaria', src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer },
      orCreated: { v: '2026-05-07', src: 'openrouter', url: 'https://openrouter.ai/x', asOf: '2026-05-07', got: gotAyer },
      price: { basis: 'referencia', provider: null, in: { v: 0.4, src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer }, out: { v: 1.2, src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer }, cacheRead: { v: null, src: 'openrouter', url: null }, cacheWrite: { v: null, src: 'openrouter', url: null } },
      aa: { slug: 'gemini-3-1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', how: 'nombre exacto', url: 'https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview', version: '5', intelligence: aaFact(6.2, 'https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview'), release: aaFact('2026-03-03', 'https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview') }
    },
    {
      id: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview', identity: 'confirmada',
      lab: { id: 'google', name: 'Google', country: 'US', url: 'https://deepmind.google', src: 'curated' },
      weights: { v: 'cerrados', src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer },
      license: { v: 'propietaria', src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer },
      orCreated: { v: '2026-03-03', src: 'openrouter', url: 'https://openrouter.ai/x', asOf: '2026-03-03', got: gotAyer },
      price: { basis: 'referencia', provider: null, in: { v: 0.4, src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer }, out: { v: 1.2, src: 'openrouter', url: 'https://openrouter.ai/x', asOf: ayer, got: gotAyer }, cacheRead: { v: null, src: 'openrouter', url: null }, cacheWrite: { v: null, src: 'openrouter', url: null } },
      aa: { slug: 'gemini-3-1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', how: 'nombre exacto', url: 'https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview', version: '5', intelligence: aaFact(6.2, 'https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview'), release: aaFact('2026-03-03', 'https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview') }
    }
  ];
  prevCat.models = baseModels;
  writeFileSync(path.join(dir, 'data/catalog.json'), JSON.stringify(prevCat));

  writeFileSync(path.join(dir, `data/history/${ayer}.json`), JSON.stringify({
    date: ayer, got: gotAyer, aaIndexVersion: '5',
    leaders: { open: null, closed: null, aa: { v: '5', open: null, closed: { id: 'anthropic/claude-opus-5.5', ii: 70.1 } } },
    ind: { aaUsCn: 35.5, aaClosedOpen: null, aaLabs: 35.5, aaRate12m: null },
    models: {
      'anthropic/claude-opus-5.5': { n: 'Claude Opus 5.5', w: 'c', in: 5, out: 25, pb: 'laboratorio', pp: 'Anthropic', ii: 70.1 },
      'deepseek/deepseek-v4.1-flash': { n: 'DeepSeek V4.1 Flash', w: 'o', in: 0.2, out: 0.8, pb: 'laboratorio', pp: 'DeepSeek', ii: null },
      'moonshotai/kimi-k3.1-pro': { n: 'Kimi K3.1 Pro', w: 'a', in: 1, out: 4, pb: 'laboratorio', pp: 'Moonshot AI', ii: null },
      'tencent/hy4': { n: 'Hy4', w: 'c', in: 0.4, out: 1.2, pb: 'referencia', pp: null, ii: null },
      'tencent/tencent-hy4': { n: 'Tencent Hy4', w: 'c', in: null, out: null, pb: 'sin-api', pp: null, ii: 34.6, ao: 1 },
      'google/gemini-3.1-flash-lite': { n: 'Gemini 3.1 Flash Lite', w: 'c', in: 0.4, out: 1.2, pb: 'referencia', pp: null, ii: 6.2 },
      'google/gemini-3.1-flash-lite-preview': { n: 'Gemini 3.1 Flash Lite Preview', w: 'c', in: 0.4, out: 1.2, pb: 'referencia', pp: null, ii: 6.2 }
    }
  }));
  writeFileSync(path.join(dir, 'data/events-log.json'), JSON.stringify({
    events: [{
      kind: 'evaluacion', key: 'evaluacion|google/gemini-3.1-flash-lite|ii', model: 'google/gemini-3.1-flash-lite',
      published: null, detected: ayer, date: ayer, mag: { v: 6.2, unit: 'puntos AA' },
      src: { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview', got: gotAyer },
      what: 'Gemini 3.1 Flash Lite: primera puntuación en el índice de inteligencia de Artificial Analysis (6.2, v5).',
      data: { field: 'ii', ii: 6.2 }
    }]
  }));

  const env = { ...process.env, FIXTURES: fx, WINDOW_DAYS: '100000', AA_API_KEY: '', OPENROUTER_API_KEY: '', GITHUB_REF: '' };
  const run = script => spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8' });
  const c = run('scripts/collect.mjs');
  assert.equal(c.status, 0, `collect termina bien\n${c.stdout}\n${c.stderr}`);
  const v = run('scripts/validate.mjs');
  assert.equal(v.status, 0, `validate pasa en schema 4\n${v.stdout}\n${v.stderr}`);

  const read = p => JSON.parse(readFileSync(path.join(dir, p), 'utf8'));
  const cat = read('data/catalog.json'), ch = read('data/changes.json'), evl = read('data/events-log.json');
  assert.equal(cat.schema, 4);
  const byId = new Map(cat.models.map(m => [m.id, m]));
  assert.equal(byId.has('tencent/tencent-hy4'), false, 'desaparece el duplicado aaOnly');
  assert.equal(byId.get('tencent/hy4')?.aa?.intelligence?.v, 34.6, 'Hy4 recibe su índice AA');
  assert.equal(byId.get('tencent/hy4')?.preApi, undefined, 'Hy4 no hereda un preApi falso');
  assert.equal(byId.get('google/gemini-3.1-flash-lite')?.aa, null, 'se deshace la colisión en Flash Lite');
  assert.equal(byId.get('google/gemini-3.1-flash-lite-preview')?.aa?.slug, 'gemini-3-1-flash-lite-preview');

  const keys = new Set(ch.items.map(e => e.key));
  assert.equal(keys.has('evaluacion|tencent/hy4|ii'), false, 'no publica primera puntuación falsa para Hy4');
  assert.ok(![...keys].some(k => k.startsWith('retirada|tencent/tencent-hy4')), 'no publica retirada del aaOnly absorbido');
  assert.equal(evl.events.some(e => e.key === 'evaluacion|google/gemini-3.1-flash-lite|ii'), false, 'limpia del log la evaluación duplicada por colisión');
  const altaHy4 = ch.items.find(e => e.key === 'nuevo|tencent/hy4');
  assert.equal(altaHy4?.importancia, null, 'el alta previa de Hy4 no se promociona retroactivamente a noticia');
  assert.equal(keys.has('evaluacion|deepseek/deepseek-v4.1-flash|ii'), true, 'una puntuación genuinamente nueva hoy sí se detecta');

  // También funciona cuando la primera recogida tras el cambio reutiliza AA (< 20 h en ramas, schema < 4 → 4).
  const gotReciente = new Date(nowMs - 2 * 3600e3).toISOString().replace(/\.\d{3}Z$/, 'Z');
  prevCat.status.aa = { ok: true, got: gotReciente };
  writeFileSync(path.join(dir, 'data/catalog.json'), JSON.stringify(prevCat));
  rmSync(path.join(dir, `data/history/${cat.generated.slice(0, 10)}.json`), { force: true });
  rmSync(aaFx);
  const cReuse = spawnSync(process.execPath, ['scripts/collect.mjs'], { cwd: dir, env: { ...env, AA_TEST_REUSE: '1' }, encoding: 'utf8' });
  assert.equal(cReuse.status, 0, `collect con reutilización y migración termina bien\n${cReuse.stdout}\n${cReuse.stderr}`);
  const vReuse = run('scripts/validate.mjs');
  assert.equal(vReuse.status, 0, `validate pasa en schema 4 tras reutilización\n${vReuse.stdout}\n${vReuse.stderr}`);
  const catReuse = read('data/catalog.json'), chReuse = read('data/changes.json');
  const byIdReuse = new Map(catReuse.models.map(m => [m.id, m]));
  assert.equal(byIdReuse.has('tencent/tencent-hy4'), false);
  assert.equal(byIdReuse.get('tencent/hy4')?.aa?.intelligence?.v, 34.6);
  assert.equal(byIdReuse.get('tencent/hy4')?.aa?.how, 'nombre exacto');
  assert.equal(byIdReuse.get('google/gemini-3.1-flash-lite')?.aa, null);
  assert.equal(chReuse.items.some(e => e.key === 'evaluacion|tencent/hy4|ii'), false);
});


