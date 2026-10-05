import { allocatePayment, collectionPending, concepts, expectedIncome, paymentTotal, validateCollection } from './domain';
import { ars } from './money';
import { classifyTransfer, decideTransfer, type TransferData, type TransferDecision, type TransferHint } from './transfer';
import type { CmPayment, Collection, Db } from './types';

/**
 * Comprobantes de transferencias que la IA registra sola. Lo usan la app (al cargarlos) y el
 * servidor (el Atajo de iPhone), así deciden y registran exactamente igual.
 */

/** Palabras del nombre de la dueña (de su email), para reconocer las transferencias que son para ella. */
export const ownerWordsOf = (email: string) => email.split('@')[0].split(/[^a-zA-Z]+/).filter(w => w.length >= 3);

export function decideFor(db: Db, t: TransferData, email: string, hint?: TransferHint): TransferDecision {
  const coverage = (id: string) => db.coverages.find(c => c.id === id);
  return decideTransfer({
    t, cms: db.cms, ownerWords: ownerWordsOf(email), hint,
    items: concepts(db).map(x => ({ id: x.id, cmId: x.cmId, coverageId: x.coverageId, pendingCents: x.pendingCents, startsAt: coverage(x.coverageId)?.startsAt ?? '' })),
    collections: db.coverages.map(c => ({ id: c.id, startsAt: c.startsAt, agreedCents: expectedIncome(c), pendingCents: collectionPending(db, c), client: c.client, salon: db.salons.find(s => s.id === c.salonId)?.name ?? '' })),
    movements: [
      ...db.collections.map(c => ({ id: c.id, kind: 'cobro' as const, amountCents: c.amountCents, date: c.date, hasReceipt: !!c.receiptPath })),
      ...db.cmPayments.map(p => ({ id: p.id, kind: 'pago' as const, cmId: p.cmId, amountCents: paymentTotal(p), date: p.date, hasReceipt: !!p.receiptPath })),
    ],
  });
}

export type NewMovement =
  | { kind: 'pago'; payment: CmPayment; message: string }
  | { kind: 'cobro'; collection: Collection; message: string };

/** El pago o el cobro que hay que agregar, con el mensaje para Dafne. null si al final no cierra (que lo revise). */
export function movementFor(db: Db, d: TransferDecision, t: TransferData, id: string, today: string, via = 'IA'): NewMovement | null {
  const date = t.date ?? today;
  const notes = `Cargado con ${via}${t.operation ? ` · Operación ${t.operation}` : ''}`;
  const coverage = (cid: string) => db.coverages.find(c => c.id === cid);
  if (d.action === 'pago') {
    let allocations;
    try { allocations = allocatePayment(db, d.cmId, d.conceptIds, d.amountCents); } catch { return null; }
    const all = concepts(db);
    const parties = [...new Set(d.conceptIds.map(c => all.find(x => x.id === c)?.coverageId))].map(c => coverage(c ?? '')?.name).filter(Boolean);
    const ubers = d.conceptIds.some(c => c.startsWith('expense:'));
    const first = db.cms.find(x => x.id === d.cmId)?.name.split(' ')[0] ?? 'la CM';
    return { kind: 'pago', payment: { id, cmId: d.cmId, date, allocations, notes }, message: `Registré el pago de ${ars(d.amountCents)} a ${first}: ${parties.join(', ')}${ubers ? ' (con Uber)' : ''}.` };
  }
  if (d.action === 'cobro') {
    if (validateCollection(db, d.coverageId, d.amountCents)) return null;
    return { kind: 'cobro', collection: { id, coverageId: d.coverageId, date, amountCents: d.amountCents, notes }, message: `Registré el cobro de ${ars(d.amountCents)} de ${coverage(d.coverageId)?.name ?? 'la fiesta'}.` };
  }
  return null;
}

/** El Db con el movimiento agregado. */
export const withMovement = (db: Db, m: NewMovement): Db => m.kind === 'pago'
  ? { ...db, cmPayments: [...db.cmPayments, m.payment] }
  : { ...db, collections: [...db.collections, m.collection] };

/** Por qué no se registró solo, en palabras de Dafne. */
export function reviewReason(db: Db, t: TransferData, email: string): string {
  if (!t.amountCents) return 'no pude leer el monto';
  const kind = classifyTransfer(db.cms, t, ownerWordsOf(email));
  if (!kind) return 'no supe si es un cobro o un pago';
  if (kind.kind === 'pago') return `${ars(t.amountCents)} no coincide justo con lo que se le debe a ${kind.cm.name.split(' ')[0]}`;
  return `no encontré una sola fiesta que deba justo ${ars(t.amountCents)}`;
}
