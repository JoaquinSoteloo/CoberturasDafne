import test from 'node:test';
import assert from 'node:assert/strict';
import { conceptsFor, matchCm } from '../src/lib/transfer.ts';

const cms = [
  { id: 'isis', name: 'Isis Villalba', alias: 'isis.villalba.mp' },
  { id: 'pri', name: 'Priscila Canale', alias: '0000003100012345678901' },
  { id: 'lu', name: 'Lucía Fernández' },
];
const base = { isTransfer: true, amountCents: 8500000, date: '2026-10-03', recipientName: null, recipientAlias: null, recipientAccount: null, operation: null };

test('reconoce a la CM por alias, por CVU o por nombre', () => {
  assert.equal(matchCm(cms, { ...base, recipientAlias: 'ISIS.VILLALBA.MP' })?.id, 'isis');
  assert.equal(matchCm(cms, { ...base, recipientAccount: '0000003100012345678901' })?.id, 'pri');
  assert.equal(matchCm(cms, { ...base, recipientName: 'Lucia Belen Fernandez' })?.id, 'lu');
  assert.equal(matchCm(cms, { ...base, recipientName: 'Priscila A. Canale' })?.id, 'pri');
  assert.equal(matchCm(cms, { ...base, recipientName: 'Martina Gómez' }), null);
});

test('elige los conceptos que cubre el monto', () => {
  const items = [{ id: 'a', pendingCents: 8500000 }, { id: 'b', pendingCents: 1350000 }, { id: 'c', pendingCents: 9000000 }];
  assert.deepEqual(conceptsFor(items, 9850000), ['a', 'b']);
  assert.deepEqual(conceptsFor(items, 5000000), ['a']);
  assert.deepEqual(conceptsFor(items, 30000000), ['a', 'b', 'c']);
});
