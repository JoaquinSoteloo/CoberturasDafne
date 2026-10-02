import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { coordsFromText, extractLink, isShortMapsLink } from '@/lib/maps';

export const runtime = 'nodejs';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
// Solo se siguen redirecciones dentro de Google: la ruta no sirve para pedir otras páginas.
const GOOGLE = /(^|\.)(google\.[a-z.]{2,8}|goo\.gl|g\.co)$/;

/**
 * Coordenadas de un link de Google Maps. Los links cortos (maps.app.goo.gl, los que da
 * "Compartir") no las traen: se abren acá siguiendo las redirecciones hasta el link largo.
 */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Tu sesión venció. Volvé a ingresar.', 401);
  const { data: role } = await supabase.rpc('my_role');
  if (role !== 'coordinadora') return fail('Solo la coordinadora puede fijar ubicaciones.', 403);

  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  const text = typeof body?.url === 'string' ? extractLink(body.url.slice(0, 2000)) : '';
  if (!text) return fail('Pegá el link de Google Maps.', 400);

  const direct = coordsFromText(text);
  if (direct) return NextResponse.json(direct);
  if (!isShortMapsLink(text)) return fail('Ese link no tiene la ubicación. En Google Maps tocá Compartir y Copiar link.', 422);

  let url = text;
  try {
    for (let hop = 0; hop < 6; hop++) {
      const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Coberturas/1.0)' }, signal: AbortSignal.timeout(8000) });
      const next = response.headers.get('location');
      if (next) {
        url = new URL(next, url).toString();
        const host = new URL(url).hostname;
        if (!GOOGLE.test(host) || !url.startsWith('https://')) return fail('Ese link no lleva a Google Maps.', 422);
        const found = coordsFromText(url);
        if (found) return NextResponse.json(found);
        continue;
      }
      // Sin más redirecciones: la página de Maps trae las coordenadas en el link del lugar.
      const html = (await response.text()).slice(0, 500_000);
      const inPage = html.match(/!3d-?\d+(?:\.\d+)?!4d-?\d+(?:\.\d+)?/)?.[0] ?? html.match(/@-?\d+\.\d+,-?\d+\.\d+/)?.[0];
      const found = inPage ? coordsFromText(inPage.startsWith('@') ? `https://www.google.com/maps/${inPage}` : inPage) : null;
      return found ? NextResponse.json(found) : fail('No encontramos la ubicación en ese link. Probá copiándolo de nuevo desde Compartir.', 422);
    }
  } catch {
    return fail('No se pudo abrir el link. Revisá la conexión y probá de nuevo.', 502);
  }
  return fail('No encontramos la ubicación en ese link.', 422);
}
