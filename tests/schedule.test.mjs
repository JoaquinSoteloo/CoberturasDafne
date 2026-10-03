import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSchedule } from '../src/lib/schedule.ts';

test('lee los formatos comunes del cronograma del salón', () => {
  const { items, skipped } = parseSchedule(`CRONOGRAMA XV SOFI
21:30 - Recepción
22.15 Entrada de Sofi 💃
23hs vals
Torta 01:00
1 h 30 carioca
• 02:30hs: Fin de fiesta`);
  assert.deepEqual(items, [
    { time: '21:30', label: 'Recepción' },
    { time: '22:15', label: 'Entrada de Sofi 💃' },
    { time: '23:00', label: 'Vals' },
    { time: '01:00', label: 'Torta' },
    { time: '01:30', label: 'Carioca' },
    { time: '02:30', label: 'Fin de fiesta' },
  ]);
  assert.deepEqual(skipped, ['CRONOGRAMA XV SOFI']);
});

test('no confunde números sueltos con horas', () => {
  const { items, skipped } = parseSchedule('Mesa de 15 años\nA las 00:30 tirada de ligas aprox.\n20:30 a 21:30 recepción');
  assert.deepEqual(items, [{ time: '00:30', label: 'Tirada de ligas' }, { time: '20:30', label: 'Recepción' }]);
  assert.deepEqual(skipped, ['Mesa de 15 años']);
});
