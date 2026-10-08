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

test('con hora de llegada, el recordatorio de la CM dice a qué hora llegar', () => {
  const data = { ...coverage, arrive_at: '2026-10-10T20:30:00' };
  assert.equal(buildMessage({ kind: 'reminder', data, for_coordinator: false }, '2026-10-09').body, 'Llegá a las 20:30 a Eclipse. Empieza 21:00.');
  assert.equal(buildMessage({ kind: 'reminder', data, for_coordinator: true }, '2026-10-09').body, 'sábado, 10 de octubre a las 21:00 en Eclipse. Las CM llegan 20:30.');
  assert.match(buildMessage({ kind: 'assigned', data, for_coordinator: false }).body, /Llegada 20:30\. Entrá para confirmarla\.$/);
});

test('cambio de fecha u horario para la CM', () => {
  const hour = buildMessage({ kind: 'changed', data: { ...coverage, starts_at: '2026-10-10T22:00:00', old_starts_at: '2026-10-10T21:00:00' }, for_coordinator: false });
  assert.equal(hour.title, 'Cambió el horario: Cumple de Martina');
  assert.equal(hour.body, 'Ahora es el sábado, 10 de octubre a las 22:00 en Eclipse. Antes era el sábado, 10 de octubre a las 21:00.');
  assert.equal(hour.url, '/?fecha=cov-1');
  const day = buildMessage({ kind: 'changed', data: { ...coverage, old_starts_at: '2026-10-09T21:00:00' }, for_coordinator: false });
  assert.equal(day.title, 'Cambió la fecha: Cumple de Martina');
  const arrive = buildMessage({ kind: 'changed', data: { ...coverage, arrive_at: '2026-10-10T20:00:00', old_starts_at: '2026-10-10T21:00:00', old_arrive_at: '2026-10-10T20:30:00' }, for_coordinator: false });
  assert.equal(arrive.title, 'Cambió la hora de llegada: Cumple de Martina');
  assert.equal(arrive.body, 'Ahora llegás a las 20:00. Antes: 20:30.');
});

test('fiesta cancelada, borrada o la CM fuera del equipo', () => {
  const cancelled = buildMessage({ kind: 'cancelled', data: coverage, for_coordinator: false });
  assert.equal(cancelled.title, 'Se canceló Cumple de Martina');
  assert.equal(cancelled.url, '/?fecha=cov-1');
  // Si se borró, ya no está en su agenda.
  assert.equal(buildMessage({ kind: 'cancelled', data: { ...coverage, deleted: true }, for_coordinator: false }).url, '/');
  const removed = buildMessage({ kind: 'removed', data: coverage, for_coordinator: false });
  assert.equal(removed.title, 'Ya no cubrís Cumple de Martina');
  assert.equal(removed.url, '/');
});

test('CM que no contestó: a ella y a Dafne', () => {
  const data = { ...coverage, cm_name: 'Lucía Fernández' };
  const forDafne = buildMessage({ kind: 'unanswered', data, for_coordinator: true });
  assert.equal(forDafne.title, 'Lucía todavía no contestó');
  assert.equal(forDafne.url, '/coberturas/cov-1');
  const forCm = buildMessage({ kind: 'unanswered', data, for_coordinator: false });
  assert.equal(forCm.title, '¿Podés cubrir Cumple de Martina?');
  assert.equal(forCm.url, '/?fecha=cov-1');
});

test('momento de la noche, 10 minutos antes', () => {
  const m = buildMessage({ kind: 'moment', data: { ...coverage, moment_id: 'mo-1', label: 'Vals', at: '2026-10-11T00:30:00' }, for_coordinator: false });
  assert.equal(m.title, 'En 10 minutos: Vals');
  assert.equal(m.body, 'Cumple de Martina, a las 00:30.');
  assert.equal(m.tag, 'moment-mo-1');
});

test('todos los tipos de aviso tienen texto', async () => {
  const { KINDS } = await import('../src/lib/notifications.ts');
  for (const kind of KINDS) assert.ok(buildMessage({ kind, data: coverage, for_coordinator: false }).title, kind);
});

test('la CM carga un Uber o sube un comprobante: aviso a Dafne', () => {
  const created = buildMessage({ kind: 'receipt', data: { ...coverage, cm_name: 'Isis Villalba', label: 'Uber de ida', amount_cents: 1350000, created: true }, for_coordinator: true });
  assert.equal(created.title, 'Isis cargó un Uber');
  assert.match(created.body, /^\$\s13\.500 · Uber de ida · Cumple de Martina\./);
  assert.equal(created.url, '/coberturas/cov-1');
  const attached = buildMessage({ kind: 'receipt', data: { ...coverage, cm_name: 'Isis Villalba', label: 'Uber de vuelta', created: false }, for_coordinator: true });
  assert.equal(attached.title, 'Isis subió un comprobante');
  assert.equal(attached.body, 'Uber de vuelta de Cumple de Martina.');
});

test('la CM borra un Uber que había cargado: aviso a Dafne', () => {
  const m = buildMessage({ kind: 'receipt', data: { ...coverage, cm_name: 'Isis Villalba', label: 'Uber de ida', amount_cents: 1350000, removed: true }, for_coordinator: true });
  assert.equal(m.title, 'Isis borró un Uber');
  assert.match(m.body, /^\$\s13\.500 · Uber de ida · Cumple de Martina\.$/);
});

test('recordatorio a la CM de cargar sus Ubers', () => {
  const m = buildMessage({ kind: 'uber_missing', data: coverage, for_coordinator: false });
  assert.equal(m.title, '¿Tomaste Uber?');
  assert.equal(m.body, 'Cumple de Martina: si tomaste Uber, cargalo con el comprobante desde tu fecha.');
  assert.equal(m.url, '/?fecha=cov-1');
});

test('si va Dafne: el cronograma y el "¿Tomaste Uber?" la llevan a la cobertura', () => {
  assert.equal(buildMessage({ kind: 'moment', data: { ...coverage, label: 'Vals', at: '2026-10-10T23:00:00', moment_id: 'm1' }, for_coordinator: true }).url, '/coberturas/cov-1');
  const uber = buildMessage({ kind: 'uber_missing', data: coverage, for_coordinator: true });
  assert.equal(uber.url, '/coberturas/cov-1');
  assert.match(uber.body, /cargalo desde la cobertura/);
});

test('aviso a Dafne cuando una CM sube todo el contenido', () => {
  const m = buildMessage({ kind: 'uploaded', for_coordinator: true, data: { coverage_id: 'c1', coverage_name: 'XV Luci', cm_name: 'Isis Gómez' } });
  assert.equal(m.title, 'Isis subió todo el contenido');
  assert.equal(m.body, 'XV Luci: está todo en el Drive.');
  assert.equal(m.url, '/coberturas/c1');
});
