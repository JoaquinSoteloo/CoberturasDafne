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

test('saca el link del texto que se copia al compartir desde Maps', async () => {
  const { extractLink } = await import('../src/lib/maps.ts');
  assert.equal(extractLink('Eclipse Kids\nAlmte Brown 2975\nhttps://maps.app.goo.gl/AbCdEf123?g_st=ic'), 'https://maps.app.goo.gl/AbCdEf123?g_st=ic');
  assert.equal(extractLink('  https://maps.app.goo.gl/x  '), 'https://maps.app.goo.gl/x');
  assert.equal(extractLink('-34.55, -58.55'), '-34.55, -58.55');
});

test('lee el lugar de la página del mapa embebido de Google', async () => {
  const { placeFromEmbedHtml } = await import('../src/lib/google-place.ts');
  // Fragmento real de la página para "Eclipse Kids, Almte Brown 2975, Villa Ballester".
  const html = '[[[3286.086095721188,-58.55724679999999,-34.551373],[0,0,0],null,13.1]]...["0x95bcb90009a44441:0x68110ee7363e5b33","Eclipse Kids, Almte Brown 2975, B1653 Villa Ballester, Provincia de Buenos Aires",[-34.551373,-58.55724679999999],"7498791240758876979"]';
  assert.deepStrictEqual(placeFromEmbedHtml(html), { lat: -34.551373, lng: -58.55724679999999 });
  // Sin el lugar, usa el centro de la vista (que viene como [zoom, lng, lat]).
  assert.deepStrictEqual(placeFromEmbedHtml('[[[3286.08,-58.5572,-34.5513],[0,0,0]]]'), { lat: -34.5513, lng: -58.5572 });
  assert.equal(placeFromEmbedHtml('<html>nada</html>'), null);
});
