/** Lo que se pudo leer de un comprobante de transferencia (Mercado Pago, banco). Cualquier dato puede faltar. */
export type TransferData = {
  isTransfer: boolean;
  amountCents: number | null;
  date: string | null;          // AAAA-MM-DD
  recipientName: string | null;
  recipientAlias: string | null;
  recipientAccount: string | null; // CVU o CBU, solo números
  operation: string | null;
};

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const words = (s: string) => plain(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3);

/**
 * ¿A qué CM le transfirió? Primero por el alias o CBU/CVU cargado en su ficha; si no, por el
 * nombre (todas las palabras del nombre de la ficha, o nombre y apellido, tienen que estar).
 */
export function matchCm<T extends { id: string; name: string; alias?: string }>(cms: T[], t: TransferData): T | null {
  const alias = t.recipientAlias ? plain(t.recipientAlias) : '';
  const account = (t.recipientAccount ?? '').replace(/\D/g, '');
  const byKey = cms.find(cm => {
    const key = plain(cm.alias ?? '');
    if (!key) return false;
    if (alias && key === alias) return true;
    const digits = key.replace(/\D/g, '');
    return digits.length >= 20 && !!account && digits === account;
  });
  if (byKey) return byKey;
  if (!t.recipientName) return null;
  const read = new Set(words(t.recipientName));
  const matches = cms.filter(cm => { const w = words(cm.name); return w.length > 0 && (w.every(x => read.has(x)) || (w.length >= 2 && read.has(w[0]) && read.has(w[w.length - 1]))); });
  return matches.length === 1 ? matches[0] : null;
}

/** Conceptos que cubre el monto, en el orden en que se muestran (los primeros hasta completar). */
export function conceptsFor<T extends { id: string; pendingCents: number }>(items: T[], amountCents: number): string[] {
  const ids: string[] = []; let covered = 0;
  for (const item of items) {
    if (covered >= amountCents) break;
    ids.push(item.id); covered += item.pendingCents;
  }
  return ids;
}
