import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Sin letras ni números que se confundan al dictarlos o copiarlos a mano (l, 1, o, 0).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const temporaryPassword = () => Array.from({ length: 12 }, (_, i) => (i === 4 || i === 8 ? '-' : '') + ALPHABET[randomInt(ALPHABET.length)]).join('');

/**
 * Crea el acceso de una CM, o le genera una contraseña nueva si ya tenía.
 * Solo la coordinadora puede pedirlo, y solo para una CM de su equipo con email cargado.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { cmId?: unknown } | null;
  if (typeof body?.cmId !== 'string') return fail('Falta indicar la CM.', 400);

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Tu sesión venció. Volvé a ingresar.', 401);
  const { data: role } = await supabase.rpc('my_role');
  if (role !== 'coordinadora') return fail('Solo la coordinadora puede dar accesos.', 403);

  // Leída con la sesión de la coordinadora: si no es de su equipo, no aparece.
  const { data: cm } = await supabase.from('cms').select('id, name, email').eq('id', body.cmId).maybeSingle();
  if (!cm) return fail('No encontramos esa CM.', 404);
  const email = String(cm.email ?? '').trim().toLowerCase();
  if (!email) return fail('Cargá el email de la CM antes de crear su acceso.', 400);
  if (email === user.email?.toLowerCase()) return fail('Ese email es el tuyo: usá otro para la CM.', 400);

  let admin;
  try { admin = supabaseAdmin(); } catch { return fail('Falta configurar la clave secreta de Supabase en el servidor.', 500); }

  const existing = await findUserByEmail(admin, email);
  if (existing) {
    const { data: isCoordinator } = await admin.from('coordinators').select('user_id').eq('user_id', existing).maybeSingle();
    if (isCoordinator) return fail('Ese email pertenece a una coordinadora.', 400);
  }

  const password = temporaryPassword();
  // La contraseña es provisoria: la primera vez que entre, la app le pide que elija la suya.
  const user_metadata = { must_change_password: true };
  const { error } = existing
    ? await admin.auth.admin.updateUserById(existing, { password, user_metadata })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata });
  if (error) return fail('No se pudo crear el acceso. Probá de nuevo en un rato.', 502);

  return NextResponse.json({ email, password, created: !existing });
}

async function findUserByEmail(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find(u => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
