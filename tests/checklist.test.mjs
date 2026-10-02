import test from 'node:test';
import assert from 'node:assert/strict';
import { newChecklistItems, parseChecklistIdeas } from '../src/lib/checklist.ts';

test('un bloque pegado crea un check por línea, viñeta o separador', () => {
  const pasted = '1. Entrada de invitados\n2. Video del vals; Fotos con la familia • Brindis\n- Entrada de invitados';
  assert.deepEqual(parseChecklistIdeas(pasted), [
    'Entrada de invitados', 'Video del vals', 'Fotos con la familia', 'Brindis'
  ]);
});

test('no repite ideas ya existentes y mantiene cada idea editable', () => {
  let next = 0;
  const items = newChecklistItems('Video del vals\nTorta', [{ id: 'old', text: 'video del vals', done: true }], () => `id-${++next}`);
  assert.deepEqual(items, [{ id: 'id-1', text: 'Torta', done: false }]);
});
