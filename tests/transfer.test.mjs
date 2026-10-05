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

test('el comprobante de un cobro ya registrado sin comprobante se reconoce', async () => {
  const { findUnreceipted } = await import('../src/lib/transfer.ts');
  const list = [
    { id: 'viejo', amountCents: 15000000, date: '2026-10-01', hasReceipt: false },
    { id: 'con', amountCents: 15000000, date: '2026-10-02', hasReceipt: true },
    { id: 'lejos', amountCents: 15000000, date: '2026-08-01', hasReceipt: false },
  ];
  assert.equal(findUnreceipted(list, 15000000, '2026-10-02')?.id, 'viejo');
  assert.equal(findUnreceipted(list, 15000000, null)?.id, 'viejo');
  assert.equal(findUnreceipted(list, 20000000, '2026-10-02'), null);
});

test('registra solo cuando no hay dudas, y si no, pide revisar', async () => {
  const { decideTransfer } = await import('../src/lib/transfer.ts');
  const owner = ['dafne'];
  const items = [
    { id: 'fee:nico', cmId: 'isis', coverageId: 'nico', pendingCents: 3260000, startsAt: '2026-09-26T21:00' },
    { id: 'expense:uber', cmId: 'isis', coverageId: 'nico', pendingCents: 850000, startsAt: '2026-09-26T21:00' },
    { id: 'fee:luci', cmId: 'isis', coverageId: 'luci', pendingCents: 3260000, startsAt: '2026-10-03T21:00' },
  ];
  const collections = [
    { id: 'nico', startsAt: '2026-09-26T21:00', agreedCents: 18000000, pendingCents: 9000000, client: 'Nicolás Pérez', salon: 'Eclipse' },
    { id: 'cami', startsAt: '2026-10-03T21:00', agreedCents: 8350000, pendingCents: 8350000, client: 'Familia Ruiz', salon: 'Eclipse Kids' },
    { id: 'boda', startsAt: '2026-10-13T21:00', agreedCents: 8350000, pendingCents: 8350000, client: 'Sofía y Tomás', salon: 'Eclipse' },
  ];
  const decide = (t, extra = {}) => decideTransfer({ t: { ...base, ...t }, cms, ownerWords: owner, items, collections, movements: [], ...extra });
  const toIsis = { recipientAlias: 'isis.villalba.mp', direction: 'sent' };
  // Lo de una fiesta (cobertura + Uber): exacto.
  assert.deepEqual(decide({ ...toIsis, amountCents: 4110000 }), { action: 'pago', cmId: 'isis', conceptIds: ['fee:nico', 'expense:uber'], amountCents: 4110000 });
  // Todo lo que se le debe.
  assert.equal(decide({ ...toIsis, amountCents: 7370000 }).action, 'pago');
  // Un monto que no cierra con nada (le erró en $400): a revisar.
  assert.deepEqual(decide({ ...toIsis, amountCents: 3220000 }), { action: 'review' });
  // Dos coberturas iguales: la más vieja primero.
  assert.deepEqual(decide({ ...toIsis, amountCents: 3260000 }).conceptIds, ['fee:nico']);
  // Desde "Pagar a Isis" con lo tildado, aunque el comprobante no diga a quién.
  assert.deepEqual(decide({ amountCents: 3260000, direction: 'sent' }, { hint: { kind: 'pago', cmId: 'isis', conceptIds: ['fee:luci'] } }).conceptIds, ['fee:luci']);
  // A nadie conocido y sin contexto: a revisar.
  assert.deepEqual(decide({ amountCents: 3260000, recipientName: 'Martina Gómez', direction: 'sent' }), { action: 'review' });

  const fromSalon = { direction: 'received' };
  // Cobro: la única fiesta que debe exactamente eso.
  assert.deepEqual(decide({ ...fromSalon, amountCents: 9000000 }), { action: 'cobro', coverageId: 'nico', amountCents: 9000000 });
  // Dos fiestas deben lo mismo: decide el remitente; si no se sabe, a revisar.
  assert.equal(decide({ ...fromSalon, amountCents: 8350000 }).action, 'review');
  assert.deepEqual(decide({ ...fromSalon, amountCents: 8350000, senderName: 'Sofía Gómez' }).coverageId, 'boda');
  // Una seña desde "Cobrar" de esa fiesta.
  assert.deepEqual(decide({ ...fromSalon, amountCents: 3000000 }, { hint: { kind: 'cobro', coverageId: 'boda' } }), { action: 'cobro', coverageId: 'boda', amountCents: 3000000 });
  // Ya había un cobro de ese importe sin comprobante: se le adjunta.
  assert.deepEqual(decide({ ...fromSalon, amountCents: 9000000 }, { movements: [{ id: 'c1', kind: 'cobro', amountCents: 9000000, date: '2026-10-02', hasReceipt: false }] }), { action: 'attach', kind: 'cobro', id: 'c1' });
});
