import test from 'node:test';
import assert from 'node:assert/strict';
import { partyInvite, waLink, waPhone } from '../src/lib/whatsapp.ts';

test('el teléfono queda como lo pide WhatsApp', () => {
  assert.equal(waPhone('11 5555-0101'), '5491155550101');
  assert.equal(waPhone('011 15 5555 0101'), '5491155550101');
  assert.equal(waPhone('+54 9 11 5555-0101'), '5491155550101');
  assert.equal(waPhone('351 15 412-3456'), '5493514123456');
  assert.equal(waPhone('5555-0101'), '5491155550101', 'sin área: Buenos Aires');
  assert.equal(waPhone(''), null);
  assert.equal(waPhone('123'), null);
});

test('el mensaje para la CM lleva lo que esté cargado', () => {
  const full = partyInvite({
    cmName: 'Isis Gómez', name: 'XV de Luci', partyType: '15 años', startsAt: '2026-10-08T21:00', endsAt: '2026-10-09T04:00', arriveAt: '2026-10-08T20:30',
    salon: 'Eclipse', address: 'Av. Libertador 1240', mapsUrl: 'https://maps.google.com/?q=x', feeCents: 3260000, livePosting: true,
    content: ['Entrada', 'Vals', 'Torta'], mates: ['Mica Torres'], dafneGoes: true, appUrl: 'https://app',
  });
  assert.match(full, /^¡Hola Isis! 👋/);
  assert.match(full, /🎉 \*XV de Luci\* \(15 años\)/);
  assert.match(full, /📅 Jueves, 8 de octubre/);
  assert.match(full, /⏰ Llegada 20:30 · arranca 21:00 · termina 04:00/);
  assert.match(full, /📍 Eclipse · Av\. Libertador 1240/);
  assert.match(full, /💰 Cobertura: \$\s?32\.600/);
  assert.match(full, /📸 A cubrir: entrada, vals y torta/);
  assert.match(full, /👯 Equipo: vos, Mica y yo/);
  const bare = partyInvite({ cmName: 'Isis', name: 'Cumple de Nico', startsAt: '2026-10-10T21:00' });
  assert.match(bare, /⏰ Arranca 21:00/);
  assert.doesNotMatch(bare, /📍|💰|📸|👯/);
  assert.doesNotMatch(bare, /\n\n\n/);
  assert.match(waLink('11 5555-0101', 'hola'), /^https:\/\/wa\.me\/5491155550101\?text=hola$/);
  assert.match(waLink('', 'hola'), /^https:\/\/wa\.me\/\?text=hola$/);
});

test('sin datos opcionales no quedan renglones vacíos en el medio', () => {
  const m = partyInvite({ cmName: 'Isis', name: 'Cumple', startsAt: '2026-10-10T21:00', feeCents: 100000 });
  assert.equal(m.split('\n').filter(l => l === '').length, 2);
  assert.match(m, /📅 .*\n⏰ Arranca 21:00\n💰/);
});

test('si ya confirmó, el mensaje es un recordatorio', () => {
  const m = partyInvite({ cmName: 'Isis', name: 'Cumple', startsAt: '2026-10-10T21:00', confirmed: true, appUrl: 'https://app' });
  assert.match(m, /^¡Hola Isis! 👋 Te paso los datos de la fecha:/);
  assert.ok(m.endsWith('Todo está en la app 🙌 https://app'));
  assert.ok(!m.includes('¿Podés?'));
});
