/* Ejecuta el generador de textos del recolector sobre el caso sintético y devuelve todo lo que escribe, por idioma. */
import { detectChanges } from '../../../scripts/cambios.mjs';
import { enrich, parte, rss, REGLAS } from '../../../scripts/parte.mjs';
import { TODAY, NOW_ISO, ctx, ctxVersion, P } from './caso.mjs';

export function salida() {
  const a = detectChanges(ctx), b = detectChanges(ctxVersion);
  // Los cambios que sólo existen en el segundo caso (cambio de versión) se añaden al primero.
  const items = [...a.items, ...b.items.filter(i => i.kind === 'version'), ...a.novedades];
  enrich(items, P, TODAY);
  const brief = parte(items, TODAY, items);
  return { items, brief, rss: rss(items, { NOW_ISO, TODAY }), reglas: REGLAS };
}
