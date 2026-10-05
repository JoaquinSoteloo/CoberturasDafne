import type { TransferData, TransferHint } from './transfer';

/**
 * Comprobante leído en otra pantalla que la IA no pudo registrar sola: espera a que Pagos lo
 * abra ya completo, para revisarlo. Vive en memoria mientras se navega dentro de la app.
 */
let pending: { file: File; data: TransferData; hint?: TransferHint } | null = null;
export const handOffTransfer = (file: File, data: TransferData, hint?: TransferHint) => { pending = { file, data, hint }; };
/** Lo devuelve y lo borra un instante después (si la pantalla se arma dos veces seguidas, las dos lo ven). */
export const takeTransfer = () => { const p = pending; if (p) setTimeout(() => { if (pending === p) pending = null; }, 1000); return p; };
