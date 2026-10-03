import { supabaseAdmin } from '@/lib/supabase/server';
import { buildCalendar, type CalendarEvent } from '@/lib/ics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Agenda para el calendario del celular. El link privado de cada cuenta es la llave:
 * el calendario lo vuelve a pedir solo cada tanto, sin sesión.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, '');
  if (!UUID.test(token)) return new Response('No encontrado', { status: 404 });
  let admin;
  try { admin = supabaseAdmin(); } catch { return new Response('Falta configurar el servidor', { status: 500 }); }
  const { data, error } = await admin.rpc('calendar_events', { p_token: token });
  if (error) return new Response('No se pudo armar la agenda', { status: 500 });
  if (!data) return new Response('No encontrado', { status: 404 });
  const { coordinator, events } = data as { coordinator: boolean; events: CalendarEvent[] };
  const body = buildCalendar(events, { appUrl: new URL(request.url).origin, coordinator });
  return new Response(body, { headers: {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="bs-marketing.ics"',
    'Cache-Control': 'private, max-age=300',
  } });
}
