import type { CmPayment, Coverage, Db, Expense } from './types';

export type Concept = { id: string; cmId: string; coverageId: string; label: string; amountCents: number; paidCents: number; pendingCents: number };
export const active = (c: Coverage) => c.eventStatus !== 'cancelado';
export const expenseTotal = (c: Coverage) => c.expenses.reduce((sum, e) => sum + e.amountCents, 0);
export const additionalTotal = (c: Coverage) => c.expenses.filter(e => e.absorbedBy === 'salon').reduce((sum, e) => sum + e.amountCents, 0);
export const feeTotal = (c: Coverage) => c.assignments.reduce((sum, a) => sum + a.feeCents, 0);
export const expectedIncome = (c: Coverage) => active(c) ? c.agreedCents + additionalTotal(c) : 0;
export const expectedCosts = (c: Coverage) => active(c) ? feeTotal(c) + expenseTotal(c) : 0;
export const estimatedProfit = (c: Coverage) => expectedIncome(c) - expectedCosts(c);
export const collected = (db: Db, coverageId: string) => db.collections.filter(p => p.coverageId === coverageId).reduce((sum, p) => sum + p.amountCents, 0);
/** El último honorario que se le puso a la CM (para precargarlo al asignarla); 0 si nunca fue. */
export const lastFee = (db: Db, cmId: string) => db.coverages.filter(c => c.assignments.some(a => a.cmId === cmId && a.feeCents > 0)).sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]?.assignments.find(a => a.cmId === cmId && a.feeCents > 0)?.feeCents ?? 0;
export const collectionPending = (db: Db, c: Coverage) => Math.max(0, expectedIncome(c) - collected(db, c.id));
export const paymentTotal = (payment: CmPayment) => payment.allocations.reduce((sum, a) => sum + a.amountCents, 0);
export const paidToCm = (db: Db, cmId: string) => db.cmPayments.filter(p => p.cmId === cmId).reduce((sum, p) => sum + paymentTotal(p), 0);
export const conceptPaid = (db: Db, conceptId: string) => db.cmPayments.flatMap(p => p.allocations).filter(a => a.conceptId === conceptId).reduce((sum, a) => sum + a.amountCents, 0);
// Older CM advances remain linked to their original settlement history.
export const expenseIsPaid = (db: Db, e: Expense): boolean => e.advancedBy === 'cm'
  ? conceptPaid(db,`expense:${e.id}`) >= e.amountCents
  : e.paymentStatus ? e.paymentStatus === 'pagado' : e.advancedBy === 'coordinadora';
export const concepts = (db: Db): Concept[] => db.coverages.filter(active).flatMap(c => [
  ...c.assignments.map(a => ({ id: `fee:${a.id}`, cmId: a.cmId, coverageId: c.id, label: `Honorarios · ${c.name}`, amountCents: a.feeCents })),
  ...c.expenses.filter(e => e.advancedBy === 'cm' && e.advancedCmId).map(e => ({ id: `expense:${e.id}`, cmId: e.advancedCmId!, coverageId: c.id, label: `Reintegro ${e.label} · ${c.name}`, amountCents: e.amountCents }))
].map(item => { const paidCents = conceptPaid(db, item.id); return { ...item, paidCents, pendingCents: Math.max(0, item.amountCents - paidCents) }; }));
export const cmPending = (db: Db, cmId: string) => concepts(db).filter(c => c.cmId === cmId).reduce((sum, c) => sum + c.pendingCents, 0);
export const totalPendingCollections = (db: Db) => db.coverages.reduce((sum, c) => sum + collectionPending(db, c), 0);
export const totalPendingPayments = (db: Db) => concepts(db).reduce((sum, c) => sum + c.pendingCents, 0);
export const balanceStatus = (total: number, paid: number): 'sin saldo' | 'pendiente' | 'parcial' | 'saldado' => total <= 0 ? 'sin saldo' : paid <= 0 ? 'pendiente' : paid < total ? 'parcial' : 'saldado';
export const monthly = (db: Db, month: string) => {
  const rows = db.coverages.filter(c => c.startsAt.slice(0, 7) === month && active(c));
  return {
    income: rows.reduce((s, c) => s + expectedIncome(c), 0),
    costs: rows.reduce((s, c) => s + expectedCosts(c), 0),
    profit: rows.reduce((s, c) => s + estimatedProfit(c), 0),
    collected: rows.reduce((s, c) => s + collected(db, c.id), 0),
    paid: rows.reduce((s,c)=>s+c.expenses.filter(e=>e.kind==='uber'&&e.paymentStatus==='pagado'&&e.advancedBy!=='cm').reduce((n,e)=>n+e.amountCents,0),0) + db.cmPayments.reduce((s, p) => s + p.allocations.filter(a => rows.some(c => c.assignments.some(x => `fee:${x.id}` === a.conceptId) || c.expenses.some(x => `expense:${x.id}` === a.conceptId))).reduce((n, a) => n + a.amountCents, 0), 0)
  };
};
/** Lo cobrado por encima de lo acordado (por ejemplo, un cobro cargado antes de bajar el acordado). */
export const overCollected = (db: Db, c: Coverage) => Math.max(0, collected(db, c.id) - expectedIncome(c));
/** Corregir un cobro ya registrado: se puede bajar siempre; subirlo, solo hasta lo acordado. */
export const validateCollectionEdit = (db: Db, collectionId: string, cents: number) => {
  const current = db.collections.find(x => x.id === collectionId);
  const coverage = current && db.coverages.find(c => c.id === current.coverageId);
  if (!current || !coverage) return 'No encontramos ese cobro.';
  if (!Number.isInteger(cents) || cents <= 0) return 'Ingresá un importe mayor a cero. Para sacarlo, anulalo.';
  if (cents > current.amountCents && collected(db, coverage.id) - current.amountCents + cents > expectedIncome(coverage)) return 'Con ese importe se cobraría más de lo acordado con el salón.';
  return '';
};
export const validateCollection = (db: Db, coverageId: string, cents: number) => {
  const coverage = db.coverages.find(c => c.id === coverageId);
  if (!coverage || !active(coverage)) return 'Elegí una cobertura activa.';
  if (!Number.isInteger(cents) || cents <= 0) return 'Ingresá un importe mayor a cero.';
  if (cents > collectionPending(db, coverage)) return 'El importe supera el saldo pendiente.';
  return '';
};
export const allocatePayment = (db: Db, cmId: string, conceptIds: string[], amountCents: number) => {
  const selected = concepts(db).filter(c => c.cmId === cmId && conceptIds.includes(c.id) && c.pendingCents > 0);
  if (selected.length !== conceptIds.length || !selected.length) throw new Error('Seleccioná conceptos pendientes válidos.');
  const total = selected.reduce((s, c) => s + c.pendingCents, 0);
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > total) throw new Error('El importe debe ser mayor a cero y no superar el total seleccionado.');
  let left = amountCents;
  return selected.flatMap(c => { const amount = Math.min(left, c.pendingCents); left -= amount; return amount > 0 ? [{ conceptId: c.id, amountCents: amount }] : []; });
};

export const cmCoverageHistory = (db: Db, cmId: string) => db.coverages
  .filter(c => c.assignments.some(a => a.cmId === cmId) || c.expenses.some(e => e.advancedBy === 'cm' && e.advancedCmId === cmId))
  .sort((a,b) => b.startsAt.localeCompare(a.startsAt))
  .map(coverage => {
    const fees = coverage.assignments.filter(a => a.cmId === cmId);
    const expenses = coverage.expenses.filter(e => e.advancedBy === 'cm' && e.advancedCmId === cmId);
    const ids = new Set([...fees.map(a => `fee:${a.id}`), ...expenses.map(e => `expense:${e.id}`)]);
    const paidCents = db.cmPayments.filter(p => p.cmId === cmId).flatMap(p => p.allocations).filter(a => ids.has(a.conceptId)).reduce((sum,a) => sum+a.amountCents,0);
    const totalCents = active(coverage) ? fees.reduce((sum,a) => sum+a.feeCents,0)+expenses.reduce((sum,e) => sum+e.amountCents,0) : 0;
    const pendingCents = active(coverage) ? [...fees.map(a=>({id:`fee:${a.id}`,amount:a.feeCents})),...expenses.map(e=>({id:`expense:${e.id}`,amount:e.amountCents}))].reduce((sum,item)=>sum+Math.max(0,item.amount-conceptPaid(db,item.id)),0) : 0;
    return {coverage,totalCents,paidCents,pendingCents,hasReimbursements:expenses.length>0};
  });

/** Tipos de fiesta fijos, para elegir de una lista y poder sacar números por tipo. */
export const PARTY_TYPES = ['15 años', 'Boda', 'Cumpleaños', 'Egresados', 'Bautismo', 'Comunión', 'Corporativo'] as const;
const PARTY_ALIASES: [RegExp, string][] = [
  [/\b(15|xv|quince)/i, '15 años'], [/(boda|casamiento|civil)/i, 'Boda'], [/cumple/i, 'Cumpleaños'],
  [/egres/i, 'Egresados'], [/bautis/i, 'Bautismo'], [/comuni/i, 'Comunión'], [/(corporativ|empresa)/i, 'Corporativo'],
];
/** Lleva lo escrito a mano ("XV", "casamiento", "cumple de 18") al tipo de la lista. Si no coincide, queda como está. */
export const partyTypeOf = (text: string) => {
  const clean = text.trim();
  if (!clean) return '';
  return PARTY_TYPES.find(t => t.toLowerCase() === clean.toLowerCase()) ?? PARTY_ALIASES.find(([re]) => re.test(clean))?.[1] ?? clean;
};
/** Cuántas fiestas de cada tipo hubo en el año y cuánto dejaron (sin las canceladas). */
export function byPartyType(db: Db, year: string) {
  const groups = new Map<string, { type: string; count: number; incomeCents: number; profitCents: number }>();
  for (const c of db.coverages.filter(c => active(c) && c.startsAt.startsWith(year))) {
    const type = partyTypeOf(c.partyType) || 'Sin tipo';
    const g = groups.get(type) ?? { type, count: 0, incomeCents: 0, profitCents: 0 };
    g.count += 1; g.incomeCents += expectedIncome(c); g.profitCents += estimatedProfit(c);
    groups.set(type, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.profitCents - a.profitCents);
}

