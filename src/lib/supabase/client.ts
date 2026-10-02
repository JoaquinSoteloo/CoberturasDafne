import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './env';

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Cliente de Supabase para el navegador. Uno solo por pestaña. */
export function supabaseBrowser() {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  return client;
}
