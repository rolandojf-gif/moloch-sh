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
/* Para gráficos cuyos puntos no llevan el id de OpenRouter (Epoch, AA por laboratorio, ingresos por empresa): el logo
   según el nombre de la organización o, si falta, el del modelo. */
const ORG = [[/openai/i, 'openai'], [/anthropic/i, 'claude'], [/google|deepmind/i, 'google'], [/\bxai\b|x\.ai/i, 'grok'], [/\bmeta\b/i, 'meta'],
  [/amazon|aws/i, 'nova'], [/microsoft/i, 'microsoft'], [/nvidia/i, 'nvidia'], [/\bai2\b|allen/i, 'ai2'], [/arcee/i, 'arcee'], [/deepseek/i, 'deepseek'],
  [/alibaba|qwen/i, 'qwen'], [/moonshot|kimi/i, 'kimi'], [/zhipu|z\.ai/i, 'zhipu'], [/minimax/i, 'minimax'], [/xiaomi/i, 'xiaomimimo'], [/baidu/i, 'wenxin'],
  [/tencent/i, 'hunyuan'], [/bytedance/i, 'bytedance'], [/stepfun/i, 'stepfun'], [/meituan|longcat/i, 'longcat'], [/inclusion|ant group/i, 'ling'],
  [/mistral/i, 'mistral'], [/cohere/i, 'cohere'], [/ai21/i, 'ai21']];
const NAME = [[/^gemini\b/i, 'gemini'], [/^gemma\b/i, 'gemma'], [/^claude\b/i, 'claude'], [/^(gpt|chatgpt|o\d)\b|^gpt-/i, 'openai'], [/^grok\b/i, 'grok'],
  [/^(llama|muse)\b/i, 'meta'], [/^(deepseek|r1)\b/i, 'deepseek'], [/^(qwen|qwq)/i, 'qwen'], [/^kimi\b/i, 'kimi'], [/^glm\b|^glm-/i, 'zhipu'],
  [/^minimax\b/i, 'minimax'], [/^mimo\b|^mimo-/i, 'xiaomimimo'], [/^ernie\b/i, 'wenxin'], [/^(hunyuan|hy\d)/i, 'hunyuan'], [/^(seed|doubao)\b/i, 'bytedance'],
  [/^step\b/i, 'stepfun'], [/^longcat\b/i, 'longcat'], [/^(ling|ring)\b/i, 'ling'], [/^(mistral|magistral|devstral|codestral|ministral|pixtral|voxtral)\b/i, 'mistral'],
  [/^command\b/i, 'cohere'], [/^jamba\b/i, 'ai21'], [/^nova\b/i, 'nova'], [/^phi\b/i, 'microsoft'], [/^nemotron\b/i, 'nvidia'], [/^(olmo|tülu|tulu)\b/i, 'ai2']];
export function logoFor({ id, name = '', org = '' } = {}) {
  if (id && id.includes('/')) { const u = logoUrl(id.split('/')[0], name); if (u) return u; }
  const k = (NAME.find(([re]) => re.test(String(name).trim())) || ORG.find(([re]) => re.test(org)) || [])[1];
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
