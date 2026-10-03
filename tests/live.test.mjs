import test from 'node:test';
import assert from 'node:assert/strict';
import { liveEvents, liveState } from '../src/lib/live.ts';

const party = { id: 'a', startsAt: '2026-10-10T21:00', arriveAt: '2026-10-10T20:30', endsAt: '2026-10-11T02:00' };
const at = local => new Date(local);

test('por empezar desde 3 horas antes de la llegada, ahora hasta el fin', () => {
  assert.equal(liveState(party, at('2026-10-10T17:00')), null);
  assert.equal(liveState(party, at('2026-10-10T17:30')), 'soon');
  assert.equal(liveState(party, at('2026-10-10T20:30')), 'now');
  assert.equal(liveState(party, at('2026-10-11T01:59')), 'now');
  assert.equal(liveState(party, at('2026-10-11T02:01')), null);
});

test('sin llegada ni fin: desde el inicio y por 6 horas', () => {
  const plain = { id: 'b', startsAt: '2026-10-10T22:00' };
  assert.equal(liveState(plain, at('2026-10-10T19:30')), 'soon');
  assert.equal(liveState(plain, at('2026-10-11T03:59')), 'now');
  assert.equal(liveState(plain, at('2026-10-11T04:01')), null);
});

test('primero las que están pasando', () => {
  const list = liveEvents([{ id: 'later', startsAt: '2026-10-10T23:00' }, party], at('2026-10-10T21:30'));
  assert.deepEqual(list.map(e => [e.id, e.live]), [['a', 'now'], ['later', 'soon']]);
});
