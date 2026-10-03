/** Lo que se pudo leer de un comprobante de viaje. Cualquier dato puede faltar. */
export type ReceiptData = {
  isTripReceipt: boolean;
  totalCents: number | null;
  date: string | null;        // AAAA-MM-DD
  pickupTime: string | null;  // HH:MM
  dropoffTime: string | null; // HH:MM
  origin: string | null;
  destination: string | null;
};

export type TripGuess = { direction: 'ida' | 'vuelta' | null; reason: string };

const HOUR = 60 * 60 * 1000;
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const COMMON = new Set(['avenida', 'calle', 'caba', 'capital', 'federal', 'buenos', 'aires', 'argentina', 'provincia', 'ciudad', 'barrio', 'piso']);

/** ¿La dirección leída es la del salón? Pide el mismo número y alguna palabra del nombre de la calle. */
export function samePlace(text: string | null, address: string | null | undefined): boolean {
  if (!text || !address) return false;
  const t = normalize(text), a = normalize(address);
  const number = a.match(/\b\d{2,5}\b/)?.[0];
  if (!number || !new RegExp(`\\b${number}\\b`).test(t)) return false;
  return a.split(/[^a-z0-9]+/).some(word => word.length >= 4 && !COMMON.has(word) && !/^\d+$/.test(word) && t.includes(word));
}

/**
 * ¿Es el Uber de ida o el de vuelta? Primero por las direcciones (termina o sale del salón);
 * si no se pudieron leer, por el horario respecto del comienzo y el final de la fiesta.
 */
export function guessDirection(r: ReceiptData, event: { startsAt: string; endsAt?: string }, salonAddress?: string): TripGuess {
  if (samePlace(r.destination, salonAddress)) return { direction: 'ida', reason: 'Termina en el salón.' };
  if (samePlace(r.origin, salonAddress)) return { direction: 'vuelta', reason: 'Sale del salón.' };
  const time = r.dropoffTime ?? r.pickupTime;
  if (!time) return { direction: null, reason: 'No se pudo leer el horario del viaje.' };

  const start = new Date(event.startsAt).getTime();
  const end = event.endsAt ? new Date(event.endsAt).getTime() : start + 5 * HOUR;
  let trip = new Date(`${r.date ?? event.startsAt.slice(0, 10)}T${time}`).getTime();
  // Sin fecha, un viaje de madrugada en una fiesta de noche es del día siguiente.
  if (!r.date && trip < start - 12 * HOUR) trip += 24 * HOUR;

  if (trip <= start + HOUR) return { direction: 'ida', reason: `El viaje es a las ${time}, antes del comienzo.` };
  if (trip >= end - HOUR) return { direction: 'vuelta', reason: `El viaje es a las ${time}, al final de la fiesta.` };
  return { direction: null, reason: `El viaje es a las ${time}, en medio de la fiesta: elegí si es de ida o de vuelta.` };
}

/** Aviso si el comprobante no es del día de la fiesta (o del siguiente, para las vueltas de madrugada). */
export function dateWarning(r: ReceiptData, eventStartsAt: string): string | null {
  if (!r.date) return null;
  const days = Math.round((new Date(`${r.date}T12:00`).getTime() - new Date(`${eventStartsAt.slice(0, 10)}T12:00`).getTime()) / (24 * HOUR));
  if (days === 0 || days === 1) return null;
  const label = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  return `El comprobante es del ${label(r.date)} y la fiesta del ${label(eventStartsAt)}. Revisá que sea el correcto.`;
}

/**
 * Fecha y hora de un viaje cargado solo con la hora. Es el día de la fiesta; si la hora
 * queda más de 12 horas antes del comienzo (la vuelta de madrugada), el día siguiente.
 */
export function tripTimestamp(eventStartsAt: string, time: string, date?: string | null): string {
  if (date) return `${date}T${time}`;
  const day = eventStartsAt.slice(0, 10);
  const trip = new Date(`${day}T${time}`).getTime();
  if (trip >= new Date(eventStartsAt).getTime() - 12 * HOUR) return `${day}T${time}`;
  const next = new Date(`${day}T12:00`); next.setDate(next.getDate() + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}T${time}`;
}

/** "Palermo → Av. Libertador 1240, de 20:15 a 20:40". Vacío si no hay datos del viaje. */
export function tripSummary(t: { tripFrom?: string | null; tripTo?: string | null; tripStartedAt?: string | null; tripEndedAt?: string | null }): string {
  const route = t.tripFrom || t.tripTo ? `${t.tripFrom || '?'} → ${t.tripTo || '?'}` : '';
  const from = t.tripStartedAt?.slice(11, 16), to = t.tripEndedAt?.slice(11, 16);
  const hours = from && to ? `de ${from} a ${to}` : from ? `salió ${from}` : to ? `llegó ${to}` : '';
  return [route, hours].filter(Boolean).join(', ');
}

/**
 * ¿De qué fiesta es un recibo de Uber? Las que tienen el viaje cerca (desde 12 horas antes del
 * comienzo hasta 12 horas después del final). Gana la que pasa por la dirección del salón; si no,
 * la más cercana en horario. Sin fecha en el recibo, solo por la dirección.
 */
export function matchTripCoverage<T extends { id: string; startsAt: string; endsAt?: string | null; address?: string }>(list: T[], r: ReceiptData): T | null {
  const time = r.pickupTime ?? r.dropoffTime ?? '12:00';
  const placeHit = (c: T) => samePlace(r.destination, c.address) || samePlace(r.origin, c.address);
  if (!r.date) { const hits = list.filter(placeHit); return hits.length === 1 ? hits[0] : null; }
  const trip = new Date(`${r.date}T${time}`).getTime();
  const near = list.map(c => {
    const start = new Date(c.startsAt).getTime();
    const end = c.endsAt ? new Date(c.endsAt).getTime() : start + 5 * HOUR;
    return { c, inWindow: trip >= start - 12 * HOUR && trip <= end + 12 * HOUR, gap: Math.min(Math.abs(trip - start), Math.abs(trip - end)) };
  }).filter(x => x.inWindow);
  near.sort((a, b) => (placeHit(b.c) ? 1 : 0) - (placeHit(a.c) ? 1 : 0) || a.gap - b.gap);
  return near[0]?.c ?? null;
}
