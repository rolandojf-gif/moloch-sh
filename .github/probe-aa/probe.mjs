/* Sonda temporal: ¿existen las fichas de modelo de AA para los slugs de variante? Sólo códigos HTTP. */
const urls = ['gpt-6-sol', 'gpt-6-sol-xhigh', 'claude-haiku-5-5', 'claude-haiku-5-5-high', 'minimax-m3-1-flash', 'muse-wonder-full', 'deepseek-v4-1-flash-1017']
  .map(s => `https://artificialanalysis.ai/models/${s}`).concat(['https://artificialanalysis.ai', 'https://artificialanalysis.ai/leaderboards/models']);
for (const u of urls) {
  const r = await fetch(u, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'moloch-sh link check' } });
  console.log(r.status, u, r.headers.get('location') || '');
}
