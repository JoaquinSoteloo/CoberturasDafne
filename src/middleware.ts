import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from '@/lib/supabase/env';

const LOGIN = '/ingresar';

/** Renueva la sesión en cada pedido y manda a ingresar a quien no tenga sesión. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookies => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  // Las rutas /api/ verifican sus propios permisos (sesión, rol o CRON_SECRET): no se redirigen.
  if (request.nextUrl.pathname.startsWith('/api/')) return response;
  const atLogin = request.nextUrl.pathname === LOGIN;
  if (!user && !atLogin) return redirectKeepingCookies(request, response, LOGIN);
  if (user && atLogin) return redirectKeepingCookies(request, response, '/');
  return response;
}

function redirectKeepingCookies(request: NextRequest, from: NextResponse, path: string) {
  const to = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach(cookie => to.cookies.set(cookie));
  return to;
}

export const config = {
  // Sin sesión también se tienen que poder pedir el manifiesto, el service worker y los íconos: si no, no se puede instalar.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']
};
