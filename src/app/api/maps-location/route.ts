import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { coordsFromText, extractLink, isShortMapsLink } from '@/lib/maps';
import { expandShortLink, lookupPlace } from '@/lib/google-place';

export const runtime = 'nodejs';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Coordenadas para fijar la ubicación de un salón, a partir de:
 * - un link de Google Maps (los cortos de "Compartir" se abren acá; si el link final no trae
 *   coordenadas, se busca el lugar que nombra), o
 * - la dirección escrita del salón.
 */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Tu sesión venció. Volvé a ingresar.', 401);
  const { data: role } = await supabase.rpc('my_role');
  if (role !== 'coordinadora') return fail('Solo la coordinadora puede fijar ubicaciones.', 403);

  const body = await request.json().catch(() => null) as { url?: unknown; address?: unknown } | null;
  try {
    if (typeof body?.address === 'string' && body.address.trim()) {
      const found = await lookupPlace(body.address.trim().slice(0, 300));
      return found ? NextResponse.json(found) : fail('No encontramos esa dirección en Google Maps. Probá pegando el link del salón.', 422);
    }

    const text = typeof body?.url === 'string' ? extractLink(body.url.slice(0, 2000)) : '';
    if (!text) return fail('Pegá el link de Google Maps.', 400);
    const direct = coordsFromText(text);
    if (direct) return NextResponse.json(direct);
    if (!isShortMapsLink(text)) return fail('Ese link no tiene la ubicación. En Google Maps tocá Compartir y Copiar.', 422);

    const long = await expandShortLink(text);
    if (!long) return fail('Ese link no lleva a Google Maps.', 422);
    const fromLong = coordsFromText(long);
    if (fromLong) return NextResponse.json(fromLong);
    // El link de "Compartir" termina en ?q=<nombre y dirección del lugar>: se busca ese lugar.
    const place = new URL(long).searchParams.get('q');
    const found = place ? await lookupPlace(place) : null;
    return found ? NextResponse.json(found) : fail('No encontramos la ubicación en ese link. Probá con "Ubicar con la dirección".', 422);
  } catch {
    return fail('No se pudo consultar Google Maps. Revisá la conexión y probá de nuevo.', 502);
  }
}
