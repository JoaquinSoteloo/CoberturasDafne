import test from 'node:test';
import assert from 'node:assert/strict';
import { cmEarnings } from '../src/lib/cm-earnings.ts';

test('suma los honorarios del mes y del año, sin los reintegros', () => {
  const concepts = [
    { coverage_id: 'a', starts_at: '2026-10-03T21:00:00', kind: 'fee', amount_cents: 8500000 },
    { coverage_id: 'a', starts_at: '2026-10-03T21:00:00', kind: 'expense', amount_cents: 1350000 },
    { coverage_id: 'b', starts_at: '2026-10-17T22:00:00', kind: 'fee', amount_cents: 9000000 },
    { coverage_id: 'c', starts_at: '2026-09-20T21:00:00', kind: 'fee', amount_cents: 8000000 },
    { coverage_id: 'd', starts_at: '2025-12-20T21:00:00', kind: 'fee', amount_cents: 7000000 },
  ];
  assert.deepEqual(cmEarnings(concepts, '2026-10'), { parties: 2, monthCents: 17500000, yearCents: 25500000 });
  assert.deepEqual(cmEarnings(concepts, '2026-11'), { parties: 0, monthCents: 0, yearCents: 25500000 });
});
