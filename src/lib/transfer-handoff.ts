import type { TransferData } from './transfer';

/**
 * Comprobante leído en otra pantalla (el botón "Cargar comprobante" del inicio) que espera a
 * que Pagos lo abra ya completo. Vive en memoria mientras se navega dentro de la app.
 */
let pending: { file: File; data: TransferData } | null = null;
export const handOffTransfer = (file: File, data: TransferData) => { pending = { file, data }; };
export const takeTransfer = () => { const p = pending; pending = null; return p; };
