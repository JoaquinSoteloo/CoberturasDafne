import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount, parseAmount } from '../src/lib/money.ts';

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
