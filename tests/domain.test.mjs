import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/lib/seed.ts';
import { allocatePayment, collectionPending, concepts, estimatedProfit, expectedIncome, monthly, validateCollection } from '../src/lib/domain.ts';

test('crear cobertura, asignar CM, cargar gasto y liquidar parcialmente', () => {
  const db = createSeed();
  const coverage = {
    ...db.coverages[0], id: 'flow-coverage', name: 'Evento de prueba',
    assignments: [{ id: 'flow-assignment', cmId: 'cm-luli', feeCents: 1000000, confirmation: 'confirmada' }],
    expenses: [{ id: 'flow-uber', label: 'Uber ida', kind: 'uber', amountCents: 300000, advancedBy: 'cm', advancedCmId: 'cm-luli', absorbedBy: 'salon' }],
    agreedCents: 2000000
  };
  db.coverages.push(coverage);
  assert.equal(expectedIncome(coverage), 2300000);
  assert.equal(estimatedProfit(coverage), 1000000);
  assert.equal(collectionPending(db, coverage), 2300000);
  const selected = ['fee:flow-assignment', 'expense:flow-uber'];
  const allocations = allocatePayment(db, 'cm-luli', selected, 1100000);
  assert.deepEqual(allocations, [{ conceptId: selected[0], amountCents: 1000000 }, { conceptId: selected[1], amountCents: 100000 }]);
  db.cmPayments.push({ id: 'flow-payment', cmId: 'cm-luli', date: '2026-09-30', allocations, notes: '' });
  assert.equal(concepts(db).find(c => c.id === 'fee:flow-assignment').pendingCents, 0);
  assert.equal(concepts(db).find(c => c.id === 'expense:flow-uber').pendingCents, 200000);
  assert.throws(() => allocatePayment(db, 'cm-luli', ['fee:flow-assignment'], 100000), /pendientes/);
  assert.equal(estimatedProfit(coverage), 1000000, 'un pago no modifica la ganancia');
  assert.equal(validateCollection(db, coverage.id, 2400000), 'El importe supera el saldo pendiente.');
  db.collections.push({ id: 'flow-collection', coverageId: coverage.id, date: '2026-09-30', amountCents: 500000, notes: '' });
  assert.equal(collectionPending(db, coverage), 1800000);
  assert.equal(estimatedProfit(coverage), 1000000, 'un cobro no modifica la ganancia');
});

test('Uber de coordinadora no se agrega a la deuda de CM; cancelados no inflan previsiones', () => {
  const db = createSeed();
  assert.equal(concepts(db).filter(c => c.id === 'expense:ex-2').length, 0);
  const c = db.coverages[1];
  const month = c.startsAt.slice(0, 7);
  const before = monthly(db, month).income;
  c.eventStatus = 'cancelado';
  assert.equal(expectedIncome(c), 0);
  assert.equal(estimatedProfit(c), 0);
  assert.equal(monthly(db, month).income, before - 29500000);
});

test('Uber con estado de pago no crea deuda CM ni duplica su costo', async () => {
  const { expenseIsPaid } = await import('../src/lib/domain.ts');
  const db=createSeed();const c=db.coverages[0];
  c.expenses=[{id:'uber-status',label:'Uber',kind:'uber',amountCents:100000,absorbedBy:'salon',paymentStatus:'pendiente'}];
  const profit=estimatedProfit(c);const month=c.startsAt.slice(0,7);const paid=monthly(db,month).paid;
  assert.equal(expenseIsPaid(db,c.expenses[0]),false);
  assert.equal(concepts(db).some(x=>x.id==='expense:uber-status'),false);
  c.expenses[0].paymentStatus='pagado';
  assert.equal(expenseIsPaid(db,c.expenses[0]),true);
  assert.equal(estimatedProfit(c),profit);
  assert.equal(monthly(db,month).paid,paid+100000);
  assert.equal(monthly(db,month).paid,paid+100000,'consultar otra vez no duplica el pago');
});
test('Uber antiguo de CM respeta las liquidaciones registradas',async()=>{
  const {expenseIsPaid}=await import('../src/lib/domain.ts');const db=createSeed();const e=db.coverages[0].expenses[0];
  assert.equal(expenseIsPaid(db,e),false);
  db.cmPayments.push({id:'legacy-settlement',cmId:e.advancedCmId,date:'2026-10-02',allocations:[{conceptId:`expense:${e.id}`,amountCents:e.amountCents}],notes:''});
  assert.equal(expenseIsPaid(db,e),true);
  assert.equal(concepts(db).find(x=>x.id===`expense:${e.id}`).pendingCents,0);
});

test('historial de una CM separa pagos por cobertura y conserva pagos de canceladas',async()=>{
  const {cmCoverageHistory,cmPending}=await import('../src/lib/domain.ts');const db=createSeed();
  const original=db.coverages.find(c=>c.id==='cov-4');
  db.coverages.push({...original,id:'second-cm-event',assignments:[{...original.assignments[0],id:'second-fee',feeCents:2000000}],expenses:[]});
  db.cmPayments.push({id:'split-history',cmId:'cm-rochi',date:'2026-10-02',notes:'',allocations:[{conceptId:'fee:as-4',amountCents:1000000},{conceptId:'fee:second-fee',amountCents:500000}]});
  const history=cmCoverageHistory(db,'cm-rochi');
  assert.equal(history.find(h=>h.coverage.id==='cov-4').paidCents,5000000);
  assert.equal(history.find(h=>h.coverage.id==='second-cm-event').paidCents,500000);
  assert.equal(history.reduce((s,h)=>s+h.pendingCents,0),cmPending(db,'cm-rochi'));
  original.eventStatus='cancelado';
  const cancelled=cmCoverageHistory(db,'cm-rochi').find(h=>h.coverage.id==='cov-4');
  assert.equal(cancelled.totalCents,0);assert.equal(cancelled.pendingCents,0);assert.equal(cancelled.paidCents,5000000);
  const reimbursed=cmCoverageHistory(db,'cm-luli').find(h=>h.coverage.id==='cov-1');
  assert.equal(reimbursed.totalCents,9850000);assert.equal(reimbursed.hasReimbursements,true);
});

test('detecta lo cobrado de más y valida corregir un cobro', async () => {
  const { overCollected, validateCollectionEdit } = await import('../src/lib/domain.ts');
  const db = createSeed();
  const coverage = db.coverages.find(c => c.id === 'cov-4'); // acordado $180.000, cobrado $90.000
  assert.equal(overCollected(db, coverage), 0);
  // Se cargó un cobro de $200.000 y después el acordado quedó en $150.000 (lo que pasó en la fiesta real).
  const wrong = { ...db, coverages: db.coverages.map(c => c.id === 'cov-4' ? { ...c, agreedCents: 15000000 } : c), collections: [{ id: 'col-1', coverageId: 'cov-4', date: '2026-10-01', amountCents: 20000000, notes: '' }] };
  assert.equal(overCollected(wrong, wrong.coverages.find(c => c.id === 'cov-4')), 5000000);
  assert.equal(validateCollectionEdit(wrong, 'col-1', 15000000), '');            // bajarlo para corregir: sí
  assert.equal(validateCollectionEdit(db, 'col-1', 9000000 + 9000000), '');      // subirlo hasta lo acordado: sí
  assert.match(validateCollectionEdit(db, 'col-1', 18000001), /más de lo acordado/); // pasarse: no
  assert.match(validateCollectionEdit(db, 'col-1', 0), /anulalo/);
  assert.match(validateCollectionEdit(db, 'no-existe', 100), /No encontramos/);
});
