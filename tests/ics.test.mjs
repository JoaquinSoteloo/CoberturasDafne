import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar } from '../src/lib/ics.ts';

const base = { id: 'cov-1', name: 'Cumple de Martina', party_type: '15 años', salon: 'Eclipse', address: 'Av. Siempreviva 742, Tigre',
  starts_at: '2026-10-10T21:00:00', ends_at: '2026-10-11T04:00:00', notes: 'Llevar flash; ojo', event_status: 'pendiente',
  updated_at: '2026-10-01T15:00:00Z', confirmation: 'confirmada' };

test('la hora argentina se pasa a UTC y el texto se escapa', () => {
  const ics = buildCalendar([base], { appUrl: 'https://app.test', coordinator: false });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.match(ics, /DTSTART:20261011T000000Z/);
  assert.match(ics, /DTEND:20261011T070000Z/);
  assert.ok(ics.includes('LOCATION:Eclipse\\, Av. Siempreviva 742\\, Tigre'));
  assert.ok(ics.replace(/\r\n /g, '').includes('Llevar flash\\; ojo'));
  assert.match(ics, /URL:https:\/\/app\.test\/\?fecha=cov-1/);
  assert.match(ics, /STATUS:CONFIRMED/);
});

test('pendiente de confirmar, cancelada, sin hora de fin', () => {
  const ics = buildCalendar([{ ...base, confirmation: 'pendiente', ends_at: null }, { ...base, id: 'cov-2', event_status: 'cancelado' }], { appUrl: 'https://app.test', coordinator: false });
  assert.match(ics, /SUMMARY:Cumple de Martina \(a confirmar\)/);
  assert.match(ics, /STATUS:TENTATIVE/);
  assert.match(ics, /DTEND:20261011T050000Z/);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(buildCalendar([base], { appUrl: 'https://app.test', coordinator: true }), /URL:https:\/\/app\.test\/coberturas\/cov-1/);
});

test('ninguna línea pasa de 75 bytes', () => {
  const ics = buildCalendar([{ ...base, notes: 'ñ'.repeat(200) }], { appUrl: 'https://app.test', coordinator: true });
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});
