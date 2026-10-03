import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount, formatTyping, parseAmount } from '../src/lib/money.ts';

test('vacío vale 0, así se puede borrar el campo', () => {
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount('   '), 0);
});

test('lee montos como se escriben en Argentina', () => {
  assert.equal(parseAmount('200000'), 20000000);
  assert.equal(parseAmount('200.000'), 20000000);
  assert.equal(parseAmount('1.250.000'), 125000000);
  assert.equal(parseAmount('1500,50'), 150050);
  assert.equal(parseAmount('1.500,5'), 150050);
  assert.equal(parseAmount('$ 85.000'), 8500000);
  assert.equal(parseAmount('0200000'), 20000000);
});

test('un punto que no separa miles es decimal', () => {
  assert.equal(parseAmount('13.5'), 1350);
  assert.equal(parseAmount('99.99'), 9999);
});

test('lo que no es un monto no se acepta', () => {
  for (const bad of ['abc', '1,2,3', '12,345', '1.2.3', '-500', '10,']) assert.equal(parseAmount(bad), null, bad);
});

test('muestra los montos con puntos de miles y coma para centavos', () => {
  assert.equal(formatAmount(20000000), '200.000');
  assert.equal(formatAmount(150050), '1.500,50');
  assert.equal(formatAmount(150000), '1.500');
  assert.equal(parseAmount(formatAmount(123456789)), 123456789);
});

test('el monto se va formateando con puntos de miles mientras se escribe', () => {
  const type = (prev, ch) => formatTyping(prev + ch, prev.length + 1, prev).text;
  let t = '';
  for (const ch of '1500000') t = type(t, ch);
  assert.equal(t, '1.500.000');
  assert.equal(type('1.500', ','), '1.500,');
  assert.equal(type('1.500', '.'), '1.500,', 'un punto tecleado es la coma de centavos');
  assert.equal(type('1.500,5', '0'), '1.500,50');
  assert.equal(type('1.500,50', '9'), '1.500,50', 'no más de dos centavos');
  assert.equal(type('', ','), '0,');
  assert.equal(type('0', '5'), '5');
  assert.equal(formatTyping('$ 85.000', 8, '').text, '85.000', 'pegado');
  assert.equal(formatTyping('1500.50', 7, '').text, '1.500,50', 'pegado con punto decimal');
  // Borrar el último número.
  assert.deepEqual(formatTyping('1.50', 4, '1.500'), { text: '150', caret: 3 });
  // Borrar un punto de miles borra la cifra de antes.
  assert.deepEqual(formatTyping('1500', 1, '1.500'), { text: '500', caret: 0 });
  // Escribir en el medio deja el cursor después de lo escrito.
  assert.deepEqual(formatTyping('19.500', 2, '9.500'), { text: '19.500', caret: 2 });
  assert.deepEqual(formatTyping('1.5900', 4, '1.500'), { text: '15.900', caret: 4 });
});
