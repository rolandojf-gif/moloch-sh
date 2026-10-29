/* Caso sintético para probar los textos que genera el recolector (scripts/cambios.mjs y scripts/parte.mjs):
   una recogida «de hoy» frente a una base de ayer en la que cambia de todo un poco, de modo que salen todas las
   clases de cambio y todas las ramas de titular, consecuencia e importancia. No depende de los datos publicados. */
const price = (inn, out, o = {}) => ({ in: { v: inn }, out: { v: out }, basis: 'laboratorio', provider: 'Alfa Lab', ...o });
const mk = (id, name, o = {}) => ({
  id, name, lab: { name: 'Alfa Lab' }, identity: 'confirmada', orCreated: { v: '2026-10-01' }, price: price(1, 2), weights: { v: 'cerrados' },
  license: { v: null }, epoch: { eci: { v: null } }, aa: { intelligence: { v: null }, url: 'https://aa.test/m' }, ...o
});
const fact = (v, o = {}) => ({ v, src: 'epoch', url: 'https://epoch.ai/x', got: '2026-10-25T05:00:00Z', asOf: '2026-10-24', ...o });

export const TODAY = '2026-10-25', NOW_ISO = '2026-10-25T05:00:00Z';

export const models = [
  mk('alfa/duplica', 'Alfa Dup', { price: price(2, 4), aa: { intelligence: { v: 70 }, url: 'https://aa.test/dup' } }),
  mk('alfa/cobra', 'Alfa Cobra', { price: price(1, 3) }),
  mk('alfa/gratis', 'Alfa Gratis', { price: price(0, 0) }),
  mk('alfa/retira', 'Alfa Retira', { price: price(1, 1, { tiers: [[1, 1]] }) }),
  mk('alfa/nueva', 'Alfa Nueva', { price: price(0.5, 0.5, { tiers: [[0.5, 0.5], [1, 1]] }) }),
  mk('alfa/baja', 'Alfa Baja', { price: price(1, 1) }),
  mk('beta/abre', 'Beta Abre', { weights: { v: 'abiertos', src: 'hf', url: 'https://hf.test/beta' }, license: { v: 'apache-2.0' }, hfCreated: { v: '2026-10-20' }, aa: { intelligence: { v: 66 }, url: 'https://aa.test/beta' } }),
  mk('beta/epoch', 'Beta Epoch', { weights: { v: 'abiertos', src: 'epoch', url: 'https://epoch.ai/m' }, epoch: { eci: { v: 140 }, access: { v: 'Open weights (unrestricted)' } } }),
  mk('gamma/eci', 'Gamma ECI', { epoch: { eci: { v: 151.2 } } }),
  mk('gamma/aa', 'Gamma AA', { aa: { intelligence: { v: 64.2 }, version: '4.0', url: 'https://aa.test/g' } }),
  mk('delta/lider-abierto', 'Delta Líder', { weights: { v: 'abiertos', src: 'hf' }, aa: { intelligence: { v: 75.5 }, url: 'https://aa.test/d' } }),
  mk('eps/cerrado', 'Eps Cerrado', { aa: { intelligence: { v: 74.1 }, url: 'https://aa.test/e' } }),
  mk('old/closed', 'Old Closed', { aa: { intelligence: { v: 73 }, url: 'https://aa.test/o' } }),
  mk('zeta/anon', 'Zeta Anónimo', { identity: 'anónima', orCreated: { v: '2026-10-24' }, orVariant: 'zeta/anon:free', aa: { intelligence: { v: 60 } } }),
  mk('eta/peer1', 'Eta 1', { price: price(0.4, 1.2), aa: { intelligence: { v: 70.5 } } }),
  mk('eta/peer2', 'Eta 2', { price: price(0.8, 2.4), aa: { intelligence: { v: 69 } } }),
  mk('eta/peer3', 'Eta 3', { price: price(3, 9), aa: { intelligence: { v: 71 } } }),
  // Puntuado por AA sin estar en OpenRouter (aaOnly) y uno que llega hoy a OpenRouter tras constar así (preApi).
  mk('theta/sinapi', 'Theta Sin API', { aaOnly: { v: true, since: '2026-10-25' }, orCreated: { v: null }, price: { basis: 'sin-api', provider: null, in: { v: null }, out: { v: null } },
    aa: { intelligence: { v: 72.4 }, release: { v: '2026-10-24' }, url: 'https://aa.test/theta' } }),
  mk('theta/llega', 'Theta Llega', { orCreated: { v: '2026-10-23' }, preApi: { id: 'theta/llega', since: '2026-10-10' }, aa: { intelligence: { v: 68 }, url: 'https://aa.test/tl' } })
];
const byId = new Map(models.map(m => [m.id, m]));

const prevModels = {
  'alfa/duplica': { pb: 'laboratorio', in: 1, out: 2, w: 'c', ii: 70, n: 'Alfa Dup' },
  'alfa/cobra': { pb: 'laboratorio', in: 0, out: 0, w: 'c', n: 'Alfa Cobra' },
  'alfa/gratis': { pb: 'laboratorio', in: 1, out: 1, w: 'c', n: 'Alfa Gratis' },
  'alfa/retira': { pb: 'laboratorio', in: 0.5, out: 0.5, w: 'c', lp: [[0.5, 0.5], [1, 1]], n: 'Alfa Retira' },
  'alfa/nueva': { pb: 'laboratorio', in: 1, out: 1, w: 'c', lp: [[1, 1]], n: 'Alfa Nueva' },
  'alfa/baja': { pb: 'laboratorio', in: 3, out: 3, w: 'c', n: 'Alfa Baja' },
  'beta/abre': { pb: 'laboratorio', in: 1, out: 2, w: 'c', ii: 66 },
  'beta/epoch': { pb: 'laboratorio', in: 1, out: 2, w: 'c', eci: null },
  'gamma/eci': { pb: 'laboratorio', in: 1, out: 2, w: 'c', eci: null, ii: 1 },
  'gamma/aa': { pb: 'laboratorio', in: 1, out: 2, w: 'c', ii: null },
  'delta/lider-abierto': { pb: 'laboratorio', in: 1, out: 2, w: 'o', ii: 70 },
  'eps/cerrado': { pb: 'laboratorio', in: 1, out: 2, w: 'c', ii: 74.1 },
  'old/closed': { pb: 'laboratorio', in: 1, out: 2, w: 'c', ii: 73, n: 'Old Closed' },
  'omega/retirado': { pb: 'laboratorio', in: 1, out: 2, w: 'c', n: 'Omega Retirado' },
  'theta/llega': { pb: 'sin-api', in: null, out: null, w: 'c', ii: 68, ao: 1, n: 'Theta Llega' },
  'theta/otro-id': { pb: 'sin-api', in: null, out: null, w: 'c', ii: 61, ao: 1, n: 'Theta Otro' }   // sin API pública que desaparece: no es retirada
};
const prevTiers = id => prevModels[id]?.lp || null;
// Tarifas actuales: Retira ha perdido la barata (en `models` sólo queda [1,1]); Nueva ha ganado una (tiene [0.5,0.5] y [1,1]).
models.find(m => m.id === 'alfa/retira').price.tiers = [[1, 1]];

const ind = {
  eci: {
    frontier: fact(158.4, { model: 'Alfa Uno', org: 'Alfa Lab', url: 'https://epoch.ai/eci' }),
    gapUsCn: fact(5.5, { us: { model: 'Alfa Uno', org: 'Alfa Lab', eci: 158.4 }, cn: { model: 'Sino Dos', org: 'Sino Lab', eci: 152.9 } }),
    gapClosedOpen: fact(4.2, { closed: { model: 'Alfa Uno', org: 'Alfa Lab', eci: 158.4 }, open: { model: 'Sino Dos', org: 'Sino Lab', eci: 154.2 } }),
    gapLabs: fact(2.1, { first: { org: 'Alfa Lab', model: 'Alfa Uno', eci: 158.4 }, second: { org: 'Beta Lab', model: 'Beta Tres', eci: 156.3 }, overlap: true }),
    rate12m: fact(21.4)
  },
  dc: { now: fact(2100.4, { n: 31, capexB: 120.4 }), plan: fact(0, { end2026: { mw: 3200 } }) },
  chips: { cum: fact(13500000, { tdpGW: 17.4 }) },
  companies: { leader: fact(31.2e9, { company: 'Alfa Lab', type: 'ingresos anualizados', confidence: 'Medium' }) },
  metr: { sota: fact(14.5, { ratio: 3.2, src: 'metr', url: 'https://metr.org/x' }) },
  bench: { sweBest: fact(81.3, { model: 'Alfa Uno' }), mirror: fact(46.5, { model: 'Alfa Uno' }), saturated: fact(7, { of: 40 }) },
  aa: { gapUsCn: fact(4.4, { src: 'aa', version: '4.0', us: { model: 'Alfa Uno', org: 'Alfa Lab' }, cn: { model: 'Sino Dos', org: 'Sino Lab' } }) },
  edi: { open: fact(12, { of: 60 }) }
};
const baseInd = { eci: 157.1, usCn: 4.5, closedOpen: 4.2, labs: 2.1, dcMW: 1800, chipsH100e: 12000000, revLeader: 29e9, metrP80h: 12.5, rate12m: 20.4, dcPlan26: 3000, tdpGW: 15.4, capexB: 100, metrRatio: 3.2, sweBest: 80.1, mirror: 44.2, aaUsCn: 4.9, saturated: 5, ediOpen: 14 };

export const checks = {
  swe85: { v: 'retrasado', texto: 'Ningún modelo llega al 85 %.', fecha: TODAY },
  est: { v: 'compatible', sentido: 'Llegaría hacia fin de 2026', texto: 'Al ritmo actual, a fin de 2026.', fecha: TODAY }
};
export const ai2027 = {
  escenario: { publicado: '2025-04-03' },
  lineas: [{ hitos: [
    { id: 'swe85', titulo: '85 % en SWE-bench Verified', plazo: '2025-06-30', plazo_texto: 'mediados de 2025', valoraciones: [{ quien: 'observatorio', regla: 'swe85' }], evidencia: [{ tipo: 'medida', indicador: 'bench.sweBest' }] },
    { id: 'h40m', titulo: '40 millones de H100e', plazo: '2026-12-31', plazo_texto: 'fin de 2026', valoraciones: [{ quien: 'observatorio', v: 'todavía no evaluable', texto: 'El plazo no ha vencido.' }], estimacion: { metodo: 'regla', regla: 'est' }, evidencia: [{ tipo: 'medida', indicador: 'chips.cum' }] },
    { id: 'otro', titulo: 'Otro hito', plazo: '2026-12-31', plazo_texto: 'fin de 2026', valoraciones: [{ quien: 'observatorio', v: 'compatible', texto: 'Se cumple.' }] }
  ] }]
};
const baseA7 = { swe85: ['compatible', null], h40m: ['todavía no evaluable', 'retrasado'], otro: ['retrasado', null] };

const uso = { days: 7, from: '2026-10-18', to: '2026-10-25', top: [
  { slug: 'alfa/uno', id: 'alfa/duplica', name: 'Alfa Dup', rank: 1, share: 12.34, tokens: 1e12 },
  { slug: 'beta/dos', name: 'Beta Dos', rank: 2, share: 8.1, tokens: 8e11 },
  { slug: 'nuevo/tres', id: 'gamma/aa', name: 'Gamma AA', rank: 3, share: 6.05, tokens: 6e11 }
] };

export const ctx = {
  models, TODAY, NOW_ISO, hoyFrom: '2026-10-19', listed: new Set(models.map(m => m.id)), prevTiers,
  firstSeen: new Map(), ind, checks, ai2027, uso, usoPrev: ['beta/dos', 'x/y'],
  leaders: { aa: { v: '4.0', open: { id: 'delta/lider-abierto', ii: 75.5 }, closed: { id: 'eps/cerrado', ii: 74.1 } } },
  base: {
    date: '2026-10-24', models: prevModels, aaIndexVersion: '4.0', ind: baseInd, a7: baseA7, uso: ['beta/dos', 'x/y'],
    leaders: { aa: { v: '4.0', open: { id: 'old/open', ii: 70 }, closed: { id: 'old/closed', ii: 73 } } }
  }
};
// Un segundo caso: cambio de versión del índice de AA y primer líder sin puntuación vigente (rama «ya no figura»).
export const ctxVersion = { ...ctx, leaders: { aa: { v: '4.1', open: ctx.leaders.aa.open, closed: ctx.leaders.aa.closed } } };
ctxVersion.base = { ...ctx.base, models: { ...ctx.base.models, 'old/open': { w: 'o', ii: 70, n: 'Old Open' } } };

export const carrera = { frentes: [{ id: 'evaluacion', indicadores: ['eci.frontier', 'bench.sweBest'] }, { id: 'computo', indicadores: ['chips.cum', 'dc.now'] }] };
export const P = {
  byId, models, base: ctx.base, leaders: ctx.leaders, ind, checks, ai2027, carrera, uso,
  hitos: new Map(ai2027.lineas.flatMap(l => l.hitos.map(h => [h.id, h])))
};
