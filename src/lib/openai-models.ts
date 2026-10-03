import OpenAI from 'openai';

/**
 * Modelos para leer comprobantes y textos, en orden. Si OpenAI rechaza uno (no existe o no está
 * habilitado para la cuenta), se prueba el siguiente. Se puede forzar uno con OPENAI_RECEIPT_MODEL.
 */
export const models = (preferred?: string) =>
  [...new Set([preferred, 'gpt-6-luna', 'gpt-5-mini', 'gpt-4.1-mini'].filter((m): m is string => !!m))];

const modelProblem = (e: unknown) =>
  (e instanceof OpenAI.NotFoundError || e instanceof OpenAI.BadRequestError || e instanceof OpenAI.PermissionDeniedError)
  && /model/i.test(e.message);

/** Corre el pedido con el primer modelo que OpenAI acepte. */
export async function withModel<T>(preferred: string | undefined, run: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const model of models(preferred)) {
    try { return await run(model); }
    catch (e) { if (!modelProblem(e)) throw e; last = e; }
  }
  throw last;
}

/** El motivo real de un error de OpenAI, para mostrarlo (sin datos sensibles). */
export function openAiReason(e: unknown): string {
  if (e instanceof OpenAI.AuthenticationError) return 'La clave de OpenAI no es válida.';
  if (e instanceof OpenAI.RateLimitError) return 'OpenAI rechazó el pedido por límite o falta de saldo. Revisá la cuenta.';
  if (e instanceof OpenAI.APIError) return `OpenAI respondió con un error (${e.status ?? 'sin código'}): ${e.message.slice(0, 160)}`;
  return 'No se pudo conectar con OpenAI.';
}
