import test from 'node:test';
import assert from 'node:assert/strict';
import { conceptsFor, matchCm } from '../src/lib/transfer.ts';

const cms = [
  { id: 'isis', name: 'Isis Villalba', alias: 'isis.villalba.mp' },
  { id: 'pri', name: 'Priscila Canale', alias: '0000003100012345678901' },
  { id: 'lu', name: 'Lucía Fernández' },
];
const base = { isTransfer: true, amountCents: 8500000, date: '2026-10-03', recipientName: null, recipientAlias: null, recipientAccount: null, operation: null, direction: null, senderName: null };

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

test('distingue pago a una CM de cobro de un salón', async () => {
  const { classifyTransfer } = await import('../src/lib/transfer.ts');
  const owner = ['dafne', 'brizuela'];
  assert.equal(classifyTransfer(cms, { ...base, recipientAlias: 'isis.villalba.mp', direction: 'sent' }, owner)?.kind, 'pago');
  assert.equal(classifyTransfer(cms, { ...base, recipientName: 'Dafne Brizuela', direction: null }, owner)?.kind, 'cobro');
  assert.equal(classifyTransfer(cms, { ...base, senderName: 'Eclipse Eventos SRL', direction: 'received' }, owner)?.kind, 'cobro');
  assert.equal(classifyTransfer(cms, { ...base, recipientName: 'Juan Pérez', direction: 'sent' }, owner), null);
});

test('encuentra la fiesta del cobro por el importe', async () => {
  const { matchCollection } = await import('../src/lib/transfer.ts');
  const list = [
    { id: 'a', startsAt: '2026-10-02T21:00', agreedCents: 40000000, pendingCents: 40000000, client: '', salon: 'Eclipse' },
    { id: 'b', startsAt: '2026-10-10T21:00', agreedCents: 20000000, pendingCents: 20000000, client: 'Familia Gómez', salon: 'Eclipse Kids' },
    { id: 'c', startsAt: '2026-10-17T21:00', agreedCents: 20000000, pendingCents: 20000000, client: '', salon: 'Eclipse' },
    { id: 'd', startsAt: '2026-09-20T21:00', agreedCents: 15000000, pendingCents: 0, client: '', salon: 'Eclipse' },
  ];
  assert.equal(matchCollection(list, 40000000, '2026-10-03', null)?.id, 'a');           // saldo exacto
  assert.equal(matchCollection(list, 20000000, '2026-10-11', null)?.id, 'b');           // dos iguales: la más cercana
  assert.equal(matchCollection(list, 20000000, '2026-10-11', 'Gómez Ana')?.id, 'b');    // el remitente es el cliente
  assert.equal(matchCollection(list, 10000000, '2026-10-03', null)?.id, 'a');           // seña: alguna que deba al menos eso
  assert.equal(matchCollection(list, 99900000, '2026-10-03', null), null);
});
