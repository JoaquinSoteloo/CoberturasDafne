import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, shiftMonth } from '../src/lib/calendar.ts';

test('calendario comienza en lunes, incluye el mes completo y cruza años',()=>{
  const days=calendarDays('2026-10');
  assert.equal(days[0],'2026-09-28');
  assert.equal(days.at(-1),'2026-11-01');
  assert.equal(days.length%7,0);
  assert.equal(days.filter(d=>d.startsWith('2026-10')).length,31);
  assert.equal(shiftMonth('2026-12',1),'2027-01');
  assert.equal(shiftMonth('2026-01',-1),'2025-12');
});
test('calendario incluye febrero bisiesto y meses de seis semanas',()=>{
  assert.ok(calendarDays('2028-02').includes('2028-02-29'));
  assert.equal(calendarDays('2026-03').length,42);
});

test('la hora de fin pasa al día siguiente si es de madrugada', async () => {
  const { endsAtFor } = await import('../src/lib/calendar.ts');
  assert.equal(endsAtFor('2026-10-10T21:00', '02:00'), '2026-10-11T02:00');
  assert.equal(endsAtFor('2026-10-31T21:00', '04:30'), '2026-11-01T04:30');
  assert.equal(endsAtFor('2026-10-10T13:00', '18:00'), '2026-10-10T18:00');
  assert.equal(endsAtFor('2026-10-10T21:00', ''), '');
});

test('la hora de llegada queda en el día más cercano al inicio', async () => {
  const { arriveAtFor } = await import('../src/lib/calendar.ts');
  assert.equal(arriveAtFor('2026-10-10T21:00', '20:30'), '2026-10-10T20:30');
  assert.equal(arriveAtFor('2026-10-11T00:30', '23:45'), '2026-10-10T23:45');
  assert.equal(arriveAtFor('2026-10-10T21:00', '23:00'), '2026-10-10T23:00');
  assert.equal(arriveAtFor('2026-10-10T21:00', ''), '');
});
