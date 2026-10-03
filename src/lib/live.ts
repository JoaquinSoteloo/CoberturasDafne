/** Fiestas que están por empezar o pasando ahora, para tenerlas a mano. Horas locales "AAAA-MM-DDTHH:MM". */
export type LiveEvent = { id: string; startsAt: string; endsAt?: string | null; arriveAt?: string | null };
export type LiveState = 'soon' | 'now';

const HOUR = 3600_000;
/** Desde cuánto antes de la llegada se muestra. */
export const SOON_HOURS = 3;
/** Si no tiene hora de fin, se da por terminada a las 6 horas del inicio. */
export const DEFAULT_HOURS = 6;

export function liveState(e: LiveEvent, now = new Date()): LiveState | null {
  const start = new Date(e.startsAt).getTime();
  const arrive = e.arriveAt ? Math.min(new Date(e.arriveAt).getTime(), start) : start;
  const end = e.endsAt && new Date(e.endsAt).getTime() > start ? new Date(e.endsAt).getTime() : start + DEFAULT_HOURS * HOUR;
  const t = now.getTime();
  if (t >= arrive && t <= end) return 'now';
  if (t >= arrive - SOON_HOURS * HOUR && t < arrive) return 'soon';
  return null;
}

/** Las que están pasando primero, después las que están por empezar, por hora. */
export function liveEvents<T extends LiveEvent>(events: T[], now = new Date()): (T & { live: LiveState })[] {
  return events
    .map(e => ({ ...e, live: liveState(e, now) }))
    .filter((e): e is T & { live: LiveState } => e.live !== null)
    .sort((a, b) => (a.live === b.live ? a.startsAt.localeCompare(b.startsAt) : a.live === 'now' ? -1 : 1));
}
