import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { ReadError, readTransfer } from '@/lib/server/read-receipts';

export const runtime = 'nodejs';
export const maxDuration = 30;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Lee con IA el comprobante de una transferencia: un pago de Dafne a una CM o un cobro de un salón. Solo la coordinadora. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Tu sesión venció. Volvé a ingresar.', 401);
  const { data: role } = await supabase.rpc('my_role');
  if (role !== 'coordinadora') return fail('Solo la coordinadora puede cargar pagos.', 403);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail('No llegó ningún archivo.', 400);
  try { return NextResponse.json(await readTransfer(file)); }
  catch (error) { return error instanceof ReadError ? fail(error.message, error.status) : fail('No se pudo leer el comprobante.', 500); }
}
