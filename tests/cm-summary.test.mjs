import test from 'node:test';
import assert from 'node:assert/strict';
import { cmSummary } from '../src/lib/cm-summary.ts';

test('ganado en el año hasta hoy, lo que falta cobrar y lo que viene', () => {
  const c = (coverage_id, starts_at, kind, amount_cents, paid_cents) => ({ coverage_id, starts_at, kind, amount_cents, paid_cents });
  const s = cmSummary([
    c('a', '2026-10-02T21:00', 'fee', 15000000, 15000000),
    c('a', '2026-10-02T21:00', 'expense', 3260000, 3000000),
    c('b', '2026-09-27T18:30', 'fee', 7000000, 0),
    c('z', '2025-12-20T21:00', 'fee', 6000000, 4000000),
    c('f', '2026-10-17T21:00', 'fee', 9000000, 0),
  ], '2026-10-03');
  assert.equal(s.earned, 22000000);      // a + b (no la futura, no la del año pasado)
  assert.equal(s.parties, 2);
  assert.equal(s.collected, 15000000);
  assert.equal(s.owedFees, 9000000);     // b + lo que quedó del año pasado
  assert.equal(s.owedUbers, 260000);
  assert.equal(s.owed, 9260000);
  assert.equal(s.upcoming, 9000000);
});
