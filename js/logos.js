/* Logos de cada modelo (LobeHub Icons, MIT; assets/logos/LICENSE). Sólo identifican el modelo; las marcas son de sus dueños.
   Uno por laboratorio (autor de OpenRouter), salvo Google, que tiene dos familias con logo propio (Gemini y Gemma). La
   identidad sin confirmar (modelos anónimos) y cualquier laboratorio nuevo sin logo llevan sus iniciales. */
import { esc } from './i18n.js';

const LAB = {
  openai: 'openai', anthropic: 'claude', google: 'google', 'x-ai': 'grok', 'meta-llama': 'meta', meta: 'meta', amazon: 'nova',
  microsoft: 'microsoft', nvidia: 'nvidia', allenai: 'ai2', 'arcee-ai': 'arcee', deepseek: 'deepseek', qwen: 'qwen', moonshotai: 'kimi',
  'z-ai': 'zhipu', minimax: 'minimax', xiaomi: 'xiaomimimo', baidu: 'wenxin', tencent: 'hunyuan', 'bytedance-seed': 'bytedance',
  'stepfun-ai': 'stepfun', stepfun: 'stepfun', meituan: 'longcat', inclusionai: 'ling', mistralai: 'mistral', cohere: 'cohere', ai21: 'ai21'
};
const FAMILY = { google: [[/^gemini\b/i, 'gemini'], [/^gemma\b/i, 'gemma']] };

/* Ruta del logo para un autor de OpenRouter y un nombre de modelo, o null si no hay. */
export function logoUrl(author, name = '') {
  const fam = (FAMILY[author] || []).find(([re]) => re.test(name));
  const k = fam ? fam[1] : LAB[author];
  return k ? `assets/logos/${k}.svg` : null;
}
const initials = s => String(s || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

/* Recuadro con el logo del modelo m (del catálogo). big: el tamaño de las tarjetas de Hoy y de las noticias. */
export function logo(m, big = false) {
  if (!m) return '';
  const anon = m.lab?.id === 'openrouter';
  const url = anon ? null : logoUrl(m.id.split('/')[0], m.name);
  const cls = `logo${big ? ' big' : ''}`;
  return url
    ? `<span class="${cls}" title="${esc(m.lab.name)}"><img src="${url}" alt="" width="20" height="20" loading="lazy" decoding="async"></span>`
    : `<span class="${cls} ini" title="${esc(m.lab?.name || '')}" aria-hidden="true">${anon ? '?' : esc(initials(m.lab?.name))}</span>`;
}
