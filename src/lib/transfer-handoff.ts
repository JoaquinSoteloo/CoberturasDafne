import type { TransferData } from './transfer';

/**
 * Comprobante leído en otra pantalla (el botón "Cargar comprobante" del inicio) que espera a
 * que Pagos lo abra ya completo. Vive en memoria mientras se navega dentro de la app.
 */
let pending: { file: File; data: TransferData } | null = null;
export const handOffTransfer = (file: File, data: TransferData) => { pending = { file, data }; };
/** Lo devuelve y lo borra un instante después (si la pantalla se arma dos veces seguidas, las dos lo ven). */
export const takeTransfer = () => { const p = pending; if (p) setTimeout(() => { if (pending === p) pending = null; }, 1000); return p; };
