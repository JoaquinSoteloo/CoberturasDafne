/** Lo que se pudo leer de un comprobante de transferencia (Mercado Pago, banco). Cualquier dato puede faltar. */
export type TransferData = {
  isTransfer: boolean;
  amountCents: number | null;
  date: string | null;          // AAAA-MM-DD
  recipientName: string | null;
  recipientAlias: string | null;
  recipientAccount: string | null; // CVU o CBU, solo números
  operation: string | null;
  /** Si el comprobante es de plata que mandó (enviada) o que le llegó (recibida) a la dueña de la cuenta. */
  direction: 'sent' | 'received' | null;
  senderName: string | null;
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

/**
 * ¿Qué es la transferencia? Si va a una CM, un pago a esa CM. Si es para Dafne (la recibió, o
 * el destinatario tiene su nombre), un cobro de un salón. Si no se sabe, null: que elija ella.
 */
export function classifyTransfer<T extends { id: string; name: string; alias?: string }>(cms: T[], t: TransferData, ownerWords: string[]):
  { kind: 'pago'; cm: T } | { kind: 'cobro' } | null {
  const cm = matchCm(cms, t);
  if (cm && t.direction !== 'received') return { kind: 'pago', cm };
  const recipient = new Set(words(t.recipientName ?? ''));
  const toOwner = ownerWords.length > 0 && ownerWords.some(w => recipient.has(plain(w)));
  if (t.direction === 'received' || toOwner) return { kind: 'cobro' };
  return null;
}

type Pending = { id: string; startsAt: string; agreedCents: number; pendingCents: number; client: string; salon: string };

/**
 * ¿De qué fiesta es el cobro? Por el importe: primero las que deben exactamente eso, después
 * las que tienen ese monto acordado, después las que deben al menos eso. Entre varias, la que
 * tiene la fecha más cercana a la de la transferencia; si el remitente coincide con el cliente
 * o el salón, esa gana.
 */
export function matchCollection(list: Pending[], amountCents: number, date: string | null, senderName: string | null): Pending | null {
  const open = list.filter(c => c.pendingCents > 0);
  const sender = new Set(words(senderName ?? ''));
  const named = (c: Pending) => [...words(c.client), ...words(c.salon)].some(w => sender.has(w));
  const when = date ? new Date(`${date}T12:00`).getTime() : Date.now();
  const nearest = (xs: Pending[]) => xs.slice().sort((a, b) => (named(b) ? 1 : 0) - (named(a) ? 1 : 0)
    || Math.abs(new Date(a.startsAt).getTime() - when) - Math.abs(new Date(b.startsAt).getTime() - when))[0] ?? null;
  for (const pick of [(c: Pending) => c.pendingCents === amountCents, (c: Pending) => c.agreedCents === amountCents, (c: Pending) => c.pendingCents >= amountCents]) {
    const found = open.filter(pick);
    if (found.length) return nearest(found);
  }
  return null;
}

/**
 * ¿El comprobante es de un movimiento ya registrado que no tiene comprobante? Mismo importe y
 * fecha a menos de 15 días; entre varios, el de fecha más cercana. Si no hay, null (es nuevo).
 */
export function findUnreceipted<T extends { id: string; amountCents: number; date: string; hasReceipt: boolean }>(list: T[], amountCents: number, date: string | null): T | null {
  const when = date ? new Date(`${date}T12:00`).getTime() : null;
  const days = (d: string) => (when === null ? 0 : Math.abs(new Date(`${d}T12:00`).getTime() - when) / 86_400_000);
  return list.filter(m => !m.hasReceipt && m.amountCents === amountCents && days(m.date) <= 15)
    .sort((a, b) => days(a.date) - days(b.date))[0] ?? null;
}
