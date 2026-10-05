import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { ReadError, readTrip } from '@/lib/server/read-receipts';

export const runtime = 'nodejs';
export const maxDuration = 30;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Lee con IA un comprobante de viaje. Lo usan la coordinadora y las CM; los datos se confirman antes de guardar. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Tu sesión venció. Volvé a ingresar.', 401);
  const { data: role } = await supabase.rpc('my_role');
  if (role !== 'coordinadora' && role !== 'cm') return fail('Tu cuenta no está habilitada.', 403);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail('No llegó ningún archivo.', 400);
  try { return NextResponse.json(await readTrip(file)); }
  catch (error) { return error instanceof ReadError ? fail(error.message, error.status) : fail('No se pudo leer el comprobante.', 500); }
}
