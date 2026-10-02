import test from 'node:test';
import assert from 'node:assert/strict';
import { dateWarning, guessDirection, samePlace } from '../src/lib/trip.ts';

const event = { startsAt: '2026-10-10T21:00', endsAt: '2026-10-11T04:00' };
const salon = 'Av. Libertador 1240, CABA';
const receipt = (fields) => ({ isTripReceipt: true, totalCents: 1350000, date: null, pickupTime: null, dropoffTime: null, origin: null, destination: null, ...fields });

test('reconoce la dirección del salón aunque esté escrita distinto', () => {
  assert.equal(samePlace('Avenida del Libertador 1240, Buenos Aires', salon), true);
  assert.equal(samePlace('LIBERTADOR 1240', salon), true);
  assert.equal(samePlace('Av. Libertador 2240', salon), false);
  assert.equal(samePlace('Corrientes 1240', salon), false);
  assert.equal(samePlace(null, salon), false);
});

test('por dirección: termina en el salón es ida, sale del salón es vuelta', () => {
  assert.equal(guessDirection(receipt({ destination: 'Libertador 1240' }), event, salon).direction, 'ida');
  assert.equal(guessDirection(receipt({ origin: 'Av Libertador 1240' }), event, salon).direction, 'vuelta');
});

test('por horario: antes del comienzo es ida, al final es vuelta', () => {
  assert.equal(guessDirection(receipt({ date: '2026-10-10', dropoffTime: '20:40' }), event, salon).direction, 'ida');
  assert.equal(guessDirection(receipt({ date: '2026-10-11', pickupTime: '04:15' }), event, salon).direction, 'vuelta');
});

test('sin fecha, la madrugada cuenta como el día siguiente', () => {
  assert.equal(guessDirection(receipt({ pickupTime: '04:20' }), event, salon).direction, 'vuelta');
  assert.equal(guessDirection(receipt({ dropoffTime: '20:30' }), event, salon).direction, 'ida');
});

test('en medio de la fiesta o sin horario, pregunta', () => {
  assert.equal(guessDirection(receipt({ date: '2026-10-11', pickupTime: '00:30' }), event, salon).direction, null);
  assert.equal(guessDirection(receipt({}), event, salon).direction, null);
});

test('sin hora de fin, supone que la fiesta dura 5 horas', () => {
  assert.equal(guessDirection(receipt({ date: '2026-10-11', pickupTime: '01:30' }), { startsAt: '2026-10-10T21:00' }, salon).direction, 'vuelta');
});

test('avisa si el comprobante no es del día de la fiesta', () => {
  assert.equal(dateWarning(receipt({ date: '2026-10-10' }), event.startsAt), null);
  assert.equal(dateWarning(receipt({ date: '2026-10-11' }), event.startsAt), null);
  assert.match(dateWarning(receipt({ date: '2026-09-28' }), event.startsAt), /28\/09/);
});
