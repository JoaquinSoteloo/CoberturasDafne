import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage } from '../src/lib/notifications.ts';

const coverage = { coverage_id: 'cov-1', coverage_name: 'Cumple de Martina', starts_at: '2026-10-10T21:00:00', salon: 'Eclipse' };

test('recordatorio: Dafne va al detalle, la CM a esa fecha', () => {
  const forDafne = buildMessage({ kind: 'reminder', data: coverage, for_coordinator: true }, '2026-10-09');
  assert.equal(forDafne.title, 'Mañana: Cumple de Martina');
  assert.equal(forDafne.body, 'sábado, 10 de octubre a las 21:00 en Eclipse.');
  assert.equal(forDafne.url, '/coberturas/cov-1');
  assert.equal(buildMessage({ kind: 'reminder', data: coverage, for_coordinator: false }, '2026-10-09').url, '/?fecha=cov-1');
  // Si la fiesta se cargó con menos de un día de anticipación, el aviso dice "Hoy".
  assert.equal(buildMessage({ kind: 'reminder', data: coverage, for_coordinator: true }, '2026-10-10').title, 'Hoy: Cumple de Martina');
});

test('fecha nueva para la CM', () => {
  const m = buildMessage({ kind: 'assigned', data: coverage, for_coordinator: false });
  assert.equal(m.title, 'Tenés una fecha nueva');
  assert.equal(m.url, '/?fecha=cov-1');
  assert.match(m.body, /^Cumple de Martina, sábado, 10 de octubre a las 21:00 en Eclipse\. Entrá para confirmarla\.$/);
});

test('respuesta de la CM para Dafne', () => {
  assert.equal(buildMessage({ kind: 'answered', data: { ...coverage, cm_name: 'Lucía Fernández', confirmation: 'confirmada' }, for_coordinator: true }).title, 'Lucía confirmó');
  const no = buildMessage({ kind: 'answered', data: { ...coverage, cm_name: 'Lucía Fernández', confirmation: 'rechazada' }, for_coordinator: true });
  assert.equal(no.title, 'Lucía no puede');
  assert.equal(no.url, '/coberturas/cov-1');
});

test('pago registrado para la CM', () => {
  const m = buildMessage({ kind: 'paid', data: { amount_cents: 5000000, date: '2026-10-11' }, for_coordinator: false });
  assert.equal(m.title, 'Te registraron un pago');
  assert.match(m.body, /^\$\s50\.000\. Mirá el detalle en Mis pagos\.$/);
});

test('la fecha de hoy se calcula en hora argentina', async () => {
  const { argentinaToday } = await import('../src/lib/notifications.ts');
  // 01:30 UTC del 11 es todavía el 10 a las 22:30 en Argentina.
  assert.equal(argentinaToday(new Date('2026-10-11T01:30:00Z')), '2026-10-10');
});

test('avisos de seguimiento para Dafne', () => {
  const unpaid = buildMessage({ kind: 'unpaid', data: { ...coverage, owed_cents: 5100000, days: 3 }, for_coordinator: true });
  assert.match(unpaid.title, /^Eclipse todavía debe \$\s51\.000$/);
  assert.equal(unpaid.body, 'Cumple de Martina: la fiesta fue hace 3 días.');
  assert.equal(unpaid.url, '/coberturas/cov-1');
  const late = buildMessage({ kind: 'undelivered', data: { ...coverage, days: 2 }, for_coordinator: true });
  assert.equal(late.title, 'Falta entregar contenido');
  assert.equal(late.url, '/coberturas/cov-1');
});
