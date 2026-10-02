import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseSecretKey } from './env';

/** Cliente con la sesión de quien hace el pedido: respeta las políticas de seguridad. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* en route handlers de solo lectura no hace falta */ } }
    }
  });
}

/** Cliente administrador. Saltea toda la seguridad: usarlo solo en el servidor y después de verificar permisos. */
export function supabaseAdmin() {
  const key = supabaseSecretKey();
  if (!key) throw new Error('Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en las variables de entorno.');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
