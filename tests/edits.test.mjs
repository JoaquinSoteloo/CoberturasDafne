import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/lib/seed.ts';
import { allocatePayment, cmPending, concepts, isOwed } from '../src/lib/domain.ts';
import { diff, fromRows, snapshotOf, toRows } from '../src/lib/rows.ts';
import { cmSummary } from '../src/lib/cm-summary.ts';
import { editRequestMessage } from '../src/lib/whatsapp.ts';

const reel = { id: 'ed-1', cmId: 'cm-luli', format: 'reel', details: 'Entrada y vals', requestedOn: '2026-10-10', dueOn: '2026-10-17', amountCents: 2500000, status: 'pedida', deliveredOn: '' };
const withEdit = (edit = reel) => ({ ...createSeed(), edits: [edit] });

test('una edición es un concepto de la CM, aparte de las fiestas', () => {
  const x = concepts(withEdit()).find(c => c.id === 'edit:ed-1');
  assert.deepEqual({ cmId: x.cmId, coverageId: x.coverageId, label: x.label, pendingCents: x.pendingCents }, { cmId: 'cm-luli', coverageId: '', label: 'Edición · Reel', pendingCents: 2500000 });
});

test('se le debe recién cuando la entregó', () => {
  const db = withEdit();
  assert.equal(isOwed(db, { id: 'edit:ed-1', coverageId: '' }, '2026-10-20'), false);
  const before = cmPending(db, 'cm-luli', '2026-10-20');
  const delivered = withEdit({ ...reel, status: 'entregada', deliveredOn: '2026-10-16' });
  assert.equal(isOwed(delivered, { id: 'edit:ed-1', coverageId: '' }, '2026-10-20'), true);
  assert.equal(cmPending(delivered, 'cm-luli', '2026-10-20') - before, 2500000);
});

test('se paga como cualquier concepto y el pago queda guardado apuntando a la edición', () => {
  const db = withEdit({ ...reel, status: 'entregada', deliveredOn: '2026-10-16' });
  const allocations = allocatePayment(db, 'cm-luli', ['edit:ed-1'], 1000000);
  assert.deepEqual(allocations, [{ conceptId: 'edit:ed-1', amountCents: 1000000 }]);
  const paid = { ...db, cmPayments: [...db.cmPayments, { id: 'pay-ed', cmId: 'cm-luli', date: '2026-10-18', allocations, notes: '' }] };
  assert.equal(concepts(paid).find(c => c.id === 'edit:ed-1').pendingCents, 1500000);

  const rows = toRows(paid);
  assert.deepEqual(rows.cm_payments.find(p => p.id === 'pay-ed').allocations, [{ position: 0, assignment_id: null, expense_id: null, edit_id: 'ed-1', amount_cents: 1000000 }]);
  assert.deepEqual(rows.edit_requests, [{ id: 'ed-1', cm_id: 'cm-luli', format: 'reel', details: 'Entrada y vals', requested_on: '2026-10-10', due_on: '2026-10-17', amount_cents: 2500000, status: 'entregada', delivered_on: '2026-10-16' }]);
  assert.deepStrictEqual(fromRows(rows), paid);
});

test('sin fecha de entrega, se guarda vacía y vuelve igual', () => {
  const db = withEdit({ ...reel, dueOn: '' });
  assert.equal(toRows(db).edit_requests[0].due_on, null);
  assert.deepStrictEqual(fromRows(toRows(db)), db);
  const { changes } = diff(snapshotOf(createSeed()), db);
  assert.equal(changes.upsert.edit_requests.length, 1);
});

test('el WhatsApp del pedido trae solo lo que se cargó', () => {
  assert.equal(editRequestMessage({ cmName: 'Sofi Ramírez', format: 'Reel', details: 'Entrada y vals', dueOn: '2026-10-17', amountCents: 2500000 }),
    '¡Hola Sofi! 👋 Te paso un pedido de edición:\n\n🎬 *Reel*\n📝 Entrada y vals\n📅 Para el sábado, 17 de octubre\n💰 $\u00a025.000\n\n¿Me confirmás? 🙌');
  assert.equal(editRequestMessage({ cmName: 'Sofi', format: 'Historia' }), '¡Hola Sofi! 👋 Te paso un pedido de edición:\n\n🎬 *Historia*\n\n¿Me confirmás? 🙌');
});

test('para la CM: la edición entregada suma a lo ganado y a lo que le deben; la pedida, más adelante', () => {
  const e = (status, amount_cents, paid_cents) => ({ coverage_id: `e-${status}`, starts_at: '2026-10-12T00:00', kind: 'edit', amount_cents, paid_cents, edit_status: status });
  const s = cmSummary([e('entregada', 2500000, 1000000), e('pedida', 1800000, 0)], '2026-10-14');
  assert.equal(s.earned, 2500000);
  assert.equal(s.owedEdits, 1500000);
  assert.equal(s.owed, 1500000);
  assert.equal(s.upcoming, 1800000);
});
