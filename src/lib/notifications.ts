/** Un aviso de la bandeja de salida, como lo devuelve pending_notifications. */
export type Outgoing = {
  id: number;
  kind: 'reminder' | 'assigned' | 'answered' | 'paid' | 'unpaid' | 'undelivered';
  data: Record<string, unknown>;
  for_coordinator: boolean;
  subscriptions: { endpoint: string; p256dh: string; auth: string }[];
};

/** Lo que muestra el celular. `url` es adónde lleva al tocarla. */
export type PushMessage = { title: string; body: string; url: string; tag: string };

// Igual que ars() de money.ts; repetido acá para que el archivo no dependa de otros (lo usan los tests de Node directo).
const ars = (cents: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
// Las fechas de las fiestas son hora local sin zona ("2026-10-10T21:00:00"): se leen como texto.
const when = (startsAt: string) => {
  if (!startsAt) return '';
  const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${startsAt.slice(0, 10)}T12:00`));
  return `${weekday} a las ${startsAt.slice(11, 16)}`;
};

/** Fecha de hoy en Argentina (el servidor corre en otra zona horaria). */
export const argentinaToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(now);

export function buildMessage(n: Pick<Outgoing, 'kind' | 'data' | 'for_coordinator'>, today = argentinaToday()): PushMessage {
  const d = n.data;
  const coverageId = text(d.coverage_id), name = text(d.coverage_name), salon = text(d.salon);
  const place = salon ? ` en ${salon}` : '';
  // Hora de llegada de las CM, si es distinta del inicio.
  const arrive = text(d.arrive_at).slice(11, 16);
  const arriveNote = arrive ? ` Llegada ${arrive}.` : '';
  const detail = coverageId ? `/coberturas/${coverageId}` : '/';
  // La CM abre la fecha en su propia pantalla dentro de "Mis fechas".
  const cmDate = coverageId ? `/?fecha=${coverageId}` : '/';
  switch (n.kind) {
    case 'reminder':
      return { title: `${text(d.starts_at).slice(0, 10) === today ? 'Hoy' : 'Mañana'}: ${name}`,
        body: !arrive ? `${when(text(d.starts_at))}${place}.` : n.for_coordinator ? `${when(text(d.starts_at))}${place}. Las CM llegan ${arrive}.` : `Llegá a las ${arrive}${salon ? ` a ${salon}` : ''}. Empieza ${text(d.starts_at).slice(11, 16)}.`,
        url: n.for_coordinator ? detail : cmDate, tag: `reminder-${coverageId}` };
    case 'assigned':
      return { title: 'Tenés una fecha nueva', body: `${name}, ${when(text(d.starts_at))}${place}.${arriveNote} Entrá para confirmarla.`, url: cmDate, tag: `assigned-${coverageId}` };
    case 'answered': {
      const first = text(d.cm_name).split(' ')[0] || 'Una CM';
      const confirmed = d.confirmation === 'confirmada';
      return { title: confirmed ? `${first} confirmó` : `${first} no puede`, body: `${name}, ${when(text(d.starts_at))}.`, url: detail, tag: `answered-${coverageId}-${first}` };
    }
    case 'paid':
      return { title: 'Te registraron un pago', body: `${ars(Number(d.amount_cents) || 0)}. Mirá el detalle en Mis pagos.`, url: '/', tag: `paid-${text(d.date)}-${d.amount_cents}` };
    case 'unpaid':
      return { title: `${salon || 'El salón'} todavía debe ${ars(Number(d.owed_cents) || 0)}`, body: `${name}: la fiesta fue hace ${Number(d.days) || 0} días.`, url: detail, tag: `unpaid-${coverageId}` };
    case 'undelivered':
      return { title: 'Falta entregar contenido', body: `${name}: la fiesta fue hace ${Number(d.days) || 0} días y todavía no está marcado como entregado.`, url: detail, tag: `undelivered-${coverageId}` };
  }
}
