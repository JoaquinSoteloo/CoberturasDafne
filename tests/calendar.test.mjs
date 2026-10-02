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
