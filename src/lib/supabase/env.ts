// Acepta los nombres que usa la integración de Vercel con Supabase y los de .env.example.
// Las variables NEXT_PUBLIC_ se escriben completas para que Next.js las incluya en el navegador.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLIC_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;
/** Solo servidor. */
export const supabaseSecretKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
