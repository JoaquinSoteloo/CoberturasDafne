import test from 'node:test';
import assert from 'node:assert/strict';
import { coordsFromText, isShortMapsLink, uberUrl } from '../src/lib/maps.ts';

test('lee el pin del lugar en un link largo de Google Maps', () => {
  const link = 'https://www.google.com/maps/place/Eclipse+Kids/@-34.5560000,-58.5560000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-34.5551234!4d-58.5543210!16s';
  // Prefiere el pin (!3d!4d) antes que el centro de la vista (@).
  assert.deepStrictEqual(coordsFromText(link), { lat: -34.5551234, lng: -58.554321 });
});

test('usa el centro de la vista si no hay pin', () => {
  assert.deepStrictEqual(coordsFromText('https://www.google.com/maps/@-34.5560,-58.5560,17z'), { lat: -34.556, lng: -58.556 });
});

test('acepta links con ?q=, de Apple Maps y coordenadas pegadas', () => {
  assert.deepStrictEqual(coordsFromText('https://maps.google.com/?q=-34.5551,-58.5543'), { lat: -34.5551, lng: -58.5543 });
  assert.deepStrictEqual(coordsFromText('https://maps.apple.com/?ll=-34.5551,-58.5543&q=Eclipse'), { lat: -34.5551, lng: -58.5543 });
  assert.deepStrictEqual(coordsFromText('-34.5551, -58.5543'), { lat: -34.5551, lng: -58.5543 });
});

test('rechaza lo que no tiene coordenadas o las tiene fuera de rango', () => {
  assert.equal(coordsFromText('https://maps.app.goo.gl/AbCdEf123'), null);
  assert.equal(coordsFromText('Balcarce 3110, Villa Ballester'), null);
  assert.equal(coordsFromText('-134.5, -58.5'), null);
  assert.equal(coordsFromText('0, 0'), null);
});

test('reconoce los links cortos que hay que abrir en el servidor', () => {
  assert.equal(isShortMapsLink('https://maps.app.goo.gl/AbCdEf123?g_st=ic'), true);
  assert.equal(isShortMapsLink('https://evil.example.com/maps.app.goo.gl'), false);
  assert.equal(isShortMapsLink('http://maps.app.goo.gl/x'), false);
});

test('arma el link de Uber con el destino', () => {
  const url = new URL(uberUrl({ lat: -34.5551, lng: -58.5543 }, 'Eclipse Kids', 'Almte Brown 2975, Villa Ballester'));
  assert.equal(url.origin + url.pathname, 'https://m.uber.com/ul/');
  assert.equal(url.searchParams.get('dropoff[latitude]'), '-34.5551');
  assert.equal(url.searchParams.get('dropoff[longitude]'), '-58.5543');
  assert.equal(url.searchParams.get('dropoff[nickname]'), 'Eclipse Kids');
  assert.equal(url.searchParams.get('pickup'), 'my_location');
});
