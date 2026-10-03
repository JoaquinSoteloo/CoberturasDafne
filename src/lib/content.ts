/** En qué paso está un contenido: primero se manda por WhatsApp y después se sube al Drive. */
export type Stage = 'pendiente' | 'whatsapp' | 'drive';

/** El paso de un ítem. Los viejos solo tenían el tilde: tildado es "en Drive". */
export const stageOf = (item: { done: boolean; stage?: Stage | null }): Stage => item.stage ?? (item.done ? 'drive' : 'pendiente');

/** Un toque avanza un paso; desde Drive vuelve a pendiente. */
export const nextStage = (s: Stage): Stage => (s === 'pendiente' ? 'whatsapp' : s === 'whatsapp' ? 'drive' : 'pendiente');

export const STAGE_LABEL: Record<Stage, string> = { pendiente: 'Pendiente', whatsapp: 'Enviado por WhatsApp', drive: 'Subido al Drive' };

export function stageCounts(items: { done: boolean; stage?: Stage | null }[]) {
  const stages = items.map(stageOf);
  // "Por WhatsApp" cuenta todo lo que ya se mandó (lo que está en Drive también pasó por WhatsApp).
  return { total: items.length, whatsapp: stages.filter(s => s !== 'pendiente').length, drive: stages.filter(s => s === 'drive').length };
}

/** Texto corto del avance: "3 de 6 en Drive · 5 por WhatsApp". */
export function stageSummary(items: { done: boolean; stage?: Stage | null }[]) {
  const c = stageCounts(items);
  if (!c.total) return '';
  return c.whatsapp > c.drive ? `${c.drive} de ${c.total} en Drive · ${c.whatsapp} por WhatsApp` : `${c.drive} de ${c.total} en Drive`;
}
