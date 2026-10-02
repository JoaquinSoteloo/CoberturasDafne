import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/lib/seed.ts';
import { diff, fromRows, snapshotOf, toRows } from '../src/lib/rows.ts';

test('pasar a filas y volver deja el mismo Db', () => {
  const db = createSeed();
  assert.deepStrictEqual(fromRows(toRows(db)), db);
});

test('acepta fechas como las devuelve Postgres', () => {
  const rows = toRows(createSeed());
  rows.coverages[0] = { ...rows.coverages[0], starts_at: '2026-10-05T21:00:00', ends_at: null };
  const db = fromRows(rows);
  assert.equal(db.coverages[0].startsAt, '2026-10-05T21:00');
  assert.equal(db.coverages[0].endsAt, '');
});

test('sin cambios no hay nada para guardar', () => {
  const db = createSeed();
  assert.equal(diff(snapshotOf(db), db).empty, true);
});

test('tildar un ítem de contenido manda solo esa fila', () => {
  const db = createSeed();
  const next = { ...db, coverages: db.coverages.map(c => c.id === 'cov-1' ? { ...c, checklist: c.checklist.map(x => x.id === 'ch-1' ? { ...x, done: true } : x) } : c) };
  const { changes, empty } = diff(snapshotOf(db), next);
  assert.equal(empty, false);
  assert.deepStrictEqual(Object.keys(changes.upsert), ['checklist_items']);
  assert.deepStrictEqual(changes.upsert.checklist_items.map(r => [r.id, r.done]), [['ch-1', true]]);
  assert.deepStrictEqual(changes.delete, {});
});

test('quitar una CM de la cobertura borra la asignación', () => {
  const db = createSeed();
  const next = { ...db, coverages: db.coverages.map(c => c.id === 'cov-2' ? { ...c, assignments: c.assignments.filter(a => a.id !== 'as-2') } : c) };
  const { changes } = diff(snapshotOf(db), next);
  assert.deepStrictEqual(changes.delete, { assignments: ['as-2'] });
  // La que queda cambia de posición, así que también se actualiza.
  assert.deepStrictEqual(changes.upsert.assignments.map(r => [r.id, r.position]), [['as-3', 0]]);
});

test('un pago nuevo viaja con su reparto entre honorarios y reintegros', () => {
  const db = createSeed();
  const payment = { id: 'pay-2', cmId: 'cm-luli', date: '2026-10-02', notes: '', allocations: [{ conceptId: 'fee:as-1', amountCents: 500000 }, { conceptId: 'expense:ex-1', amountCents: 1350000 }] };
  const { changes, after } = diff(snapshotOf(db), { ...db, cmPayments: [...db.cmPayments, payment] });
  assert.deepStrictEqual(changes.upsert.cm_payments, [{
    id: 'pay-2', cm_id: 'cm-luli', date: '2026-10-02', notes: '',
    allocations: [
      { position: 0, assignment_id: 'as-1', expense_id: null, amount_cents: 500000 },
      { position: 1, assignment_id: null, expense_id: 'ex-1', amount_cents: 1350000 }
    ]
  }]);
  // Después de guardar, la nueva foto ya no tiene diferencias.
  assert.equal(diff(after, { ...db, cmPayments: [...db.cmPayments, payment] }).empty, true);
});

test('las filas leídas se ordenan por posición', () => {
  const rows = toRows(createSeed());
  rows.checklist_items.reverse();
  const db = fromRows(rows);
  assert.deepStrictEqual(db.coverages.find(c => c.id === 'cov-1').checklist.map(x => x.id), ['ch-1', 'ch-2']);
});

test('las filas existentes viajan con su versión; las nuevas, sin', async () => {
  const { emptyVersions, mergeVersions } = await import('../src/lib/rows.ts');
  const db = createSeed();
  const versions = mergeVersions(emptyVersions(), { coverages: { 'cov-1': 3 } });
  const next = { ...db, coverages: db.coverages.map(c => c.id === 'cov-1' ? { ...c, name: 'Otro nombre' } : c), salons: [...db.salons, { id: 'nuevo', name: 'Nuevo', address: '' }] };
  const { changes } = diff(snapshotOf(db), next, versions);
  assert.equal(changes.upsert.coverages[0].version, 3);
  assert.equal('version' in changes.upsert.salons[0], false);
  // Lo que devuelve la base pisa la versión vieja.
  assert.equal(mergeVersions(versions, { coverages: { 'cov-1': 4 } }).coverages.get('cov-1'), 4);
});

test('el comprobante se lee pero no viaja al guardar, así no pisa el que subió una CM', () => {
  const rows = toRows(createSeed());
  rows.expenses[0] = { ...rows.expenses[0], receipt_path: 'ex-1/captura.jpg' };
  const db = fromRows(rows);
  assert.equal(db.coverages.find(c => c.id === 'cov-1').expenses[0].receiptPath, 'ex-1/captura.jpg');
  const next = { ...db, coverages: db.coverages.map(c => c.id === 'cov-1' ? { ...c, expenses: c.expenses.map(e => ({ ...e, receiptPath: 'ex-1/otra.jpg' })) } : c) };
  assert.equal(diff(snapshotOf(db), next).empty, true);
  assert.equal('receipt_path' in toRows(next).expenses[0], false);
});

test('los datos del viaje van y vuelven, con fechas como las devuelve Postgres', () => {
  const db = createSeed();
  const withTrip = { ...db, coverages: db.coverages.map(c => c.id === 'cov-1' ? { ...c, expenses: c.expenses.map(e => ({ ...e, tripFrom: 'Palermo', tripTo: 'Libertador 1240', tripStartedAt: '2030-01-05T20:15', tripEndedAt: '2030-01-05T20:40' })) } : c) };
  const rows = toRows(withTrip);
  assert.equal(rows.expenses[0].trip_from, 'Palermo');
  rows.expenses[0] = { ...rows.expenses[0], trip_started_at: '2030-01-05T20:15:00' };
  assert.deepStrictEqual(fromRows(rows), withTrip);
  assert.equal(toRows(db).expenses[0].trip_from, null);
});

test('la ubicación del salón va y vuelve; sin ubicación queda sin coordenadas', () => {
  const db = createSeed();
  const located = { ...db, salons: db.salons.map(s => ({ ...s, lat: -34.5551, lng: -58.5543 })) };
  assert.deepStrictEqual(fromRows(toRows(located)).salons, located.salons);
  assert.equal(toRows(db).salons[0].lat, null);
  assert.equal('lat' in fromRows(toRows(db)).salons[0], false);
});
