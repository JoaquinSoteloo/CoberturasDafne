import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastUrl, showWeather, summarize } from '../src/lib/weather.ts';

// 2026-10-10 desde las 20 hasta las 04 del 11.
const hours = Array.from({ length: 9 }, (_, i) => { const h = (20 + i) % 24; const day = 20 + i >= 24 ? '11' : '10'; return `2026-10-${day}T${String(h).padStart(2, '0')}:00`; });
const hourly = {
  time: hours,
  temperature_2m: [19, 18.4, 17, 16, 15, 14, 13, 12.4, 11],
  precipitation_probability: [10, 20, 60, 70, 40, 20, 10, 0, null],
  weather_code: [2, 3, 61, 63, 3, 2, 1, 0, 0],
  wind_speed_10m: [12, 15, 22, 38.4, 20, 10, 8, 5, 5],
};

test('resume las horas de la fiesta con hora de fin', () => {
  const w = summarize(hourly, '2026-10-10T21:00', '2026-10-11T02:00');
  assert.equal(w.icon, '🌧️');
  assert.equal(w.label, 'Lluvia');
  assert.equal(w.tempStart, 18);
  assert.equal(w.tempEnd, 13);
  assert.equal(w.rainChance, 70);
  assert.equal(w.windMax, 38);
  assert.equal(w.tips.length, 2);
});

test('sin hora de fin toma 5 horas desde el inicio, aunque pase de día', () => {
  const w = summarize(hourly, '2026-10-10T23:30', '');
  assert.equal(w.tempStart, 16);   // 23:00
  assert.equal(w.tempEnd, 11);     // hasta las 04:30: la última hora es 04:00 del día siguiente
});

test('el link pide el día de la fiesta y el siguiente, en hora argentina', () => {
  const url = forecastUrl(-34.55202, -58.55950, '2026-10-31T21:00');
  assert.match(url, /start_date=2026-10-31&end_date=2026-11-01/);
  assert.match(url, /timezone=America%2FArgentina%2FBuenos_Aires/);
});

test('solo se muestra para fiestas de los próximos días', () => {
  const now = new Date('2026-10-08T12:00:00');
  assert.equal(showWeather('2026-10-10T21:00', now), true);
  assert.equal(showWeather('2026-10-20T21:00', now), false);
  assert.equal(showWeather('2026-10-01T21:00', now), false);
});
