/** Una fecha de la agenda, como la devuelve calendar_events. */
export type CalendarEvent = {
  id: string; name: string; party_type: string; salon: string; address: string;
  starts_at: string; ends_at: string | null; arrive_at?: string | null; notes: string; event_status: string;
  updated_at: string; confirmation: string | null;
};

// Las fiestas se guardan en hora argentina sin zona (UTC-3, sin horario de verano).
const utc = (local: string) => {
  const [d, t = '00:00:00'] = local.split('T');
  const [y, m, day] = d.split('-').map(Number), [h, min, s = 0] = t.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, day, h + 3, min, Math.floor(s)));
};
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Las líneas no pueden pasar de 75 bytes: se cortan y siguen con un espacio adelante.
const fold = (line: string) => {
  const parts: string[] = []; let current = '', bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > (parts.length ? 74 : 75)) { parts.push(current); current = ''; bytes = 0; }
    current += ch; bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
};

/** Arma el archivo .ics que leen el calendario del iPhone y Google Calendar. */
export function buildCalendar(events: CalendarEvent[], opts: { appUrl: string; coordinator: boolean; now?: Date }): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BS Marketing//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:BS Marketing', 'X-WR-TIMEZONE:America/Argentina/Buenos_Aires',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const e of events) {
    // En el calendario de la CM la fiesta arranca a la hora en que tiene que llegar.
    const arrive = e.arrive_at ? e.arrive_at.slice(11, 16) : '';
    const start = utc(!opts.coordinator && e.arrive_at ? e.arrive_at : e.starts_at);
    // Sin hora de fin cargada no se inventa una: el evento queda marcado solo con la hora de inicio.
    const end = e.ends_at && utc(e.ends_at) > start ? utc(e.ends_at) : null;
    const link = `${opts.appUrl}${opts.coordinator ? `/coberturas/${e.id}` : `/?fecha=${e.id}`}`;
    const pending = !opts.coordinator && e.confirmation === 'pendiente';
    const description = [e.party_type, arrive ? (opts.coordinator ? `Las CM llegan ${arrive}.` : `Llegá a las ${arrive}. La fiesta empieza ${e.starts_at.slice(11, 16)}.`) : '', pending ? 'Todavía no la confirmaste.' : '', e.notes, `Ver en la app: ${link}`].filter(Boolean).join('\n\n');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@bs-marketing`, `DTSTAMP:${stamp(e.updated_at ? new Date(e.updated_at) : opts.now ?? new Date())}`,
      `DTSTART:${stamp(start)}`, ...(end ? [`DTEND:${stamp(end)}`] : []),
      `SUMMARY:${escape(`${e.name}${pending ? ' (a confirmar)' : ''}`)}`,
      `LOCATION:${escape([e.salon, e.address].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${escape(description)}`, `URL:${link}`,
      `STATUS:${e.event_status === 'cancelado' ? 'CANCELLED' : pending ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
