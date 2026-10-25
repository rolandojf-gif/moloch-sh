/* Ejecuta el generador de textos del recolector sobre el caso sintético y devuelve todo lo que escribe, por idioma. */
import { detectChanges } from '../../../scripts/cambios.mjs';
import { enrich, parte, rss, REGLAS, REGLAS_EN } from '../../../scripts/parte.mjs';
import { TODAY, NOW_ISO, ctx, ctxVersion, P } from './caso.mjs';

export function salida() {
  const a = detectChanges(ctx), b = detectChanges(ctxVersion);
  // Los cambios que sólo existen en el segundo caso (cambio de versión) se añaden al primero.
  const items = [...a.items, ...b.items.filter(i => i.kind === 'version'), ...a.novedades];
  enrich(items, P, TODAY);
  const brief = parte(items, TODAY, items);
  return { items, brief, rss: rss(items, { NOW_ISO, TODAY }), reglas: REGLAS };
}

/* Lo mismo en inglés: sólo lo que el recolector escribe en «i18n.en» y el RSS inglés. */
export function salidaEn() {
  const a = detectChanges(ctx), b = detectChanges(ctxVersion);
  const items = [...a.items, ...b.items.filter(i => i.kind === 'version'), ...a.novedades];
  enrich(items, P, TODAY);
  const brief = parte(items, TODAY, items);
  return {
    items: items.map(e => ({ key: e.key, ...e.i18n.en })),
    brief: { ultima: brief.ultima?.i18n?.en ?? null, reglas: brief.i18n.en.reglas },
    rss: rss(items, { NOW_ISO, TODAY }, 'en'), reglas: REGLAS_EN
  };
}
