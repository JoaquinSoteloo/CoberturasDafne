import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERAL, templateFor } from '../src/lib/templates.ts';

test('cada fiesta arranca con la lista de su tipo, o la general', () => {
  const t = { '15 años': ['Entrada', 'Vals'], [GENERAL]: ['Momentos principales'], Boda: [] };
  assert.deepEqual(templateFor(t, '15 años'), { type: '15 años', items: ['Entrada', 'Vals'] });
  assert.deepEqual(templateFor(t, 'Boda').type, GENERAL, 'una lista vacía cuenta como que no tiene');
  assert.deepEqual(templateFor(t, ''), { type: GENERAL, items: ['Momentos principales'] });
  assert.deepEqual(templateFor({}, 'Cumpleaños').items, []);
});
