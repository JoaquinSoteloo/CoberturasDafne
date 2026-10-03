import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import type { TransferData } from '@/lib/transfer';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = process.env.OPENAI_RECEIPT_MODEL || 'gpt-6-luna';
const MAX_BYTES = 4 * 1024 * 1024;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

const Transfer = z.object({
  es_comprobante_de_transferencia: z.boolean(),
  monto: z.number().nullable(),
  moneda: z.string().nullable(),
  fecha: z.string().nullable(),
  destinatario_nombre: z.string().nullable(),
  destinatario_alias: z.string().nullable(),
  destinatario_cvu_cbu: z.string().nullable(),
  numero_operacion: z.string().nullable(),
});

const INSTRUCTIONS = `Leés comprobantes de transferencias de dinero de Argentina (Mercado Pago, bancos, billeteras): capturas o PDF.
Devolvé:
- es_comprobante_de_transferencia: false si no es el comprobante de una transferencia enviada.
- monto: lo transferido, como número en pesos (por ejemplo 85000 o 85000.5). Ojo: en Argentina "85.000" son ochenta y cinco mil.
- moneda: el código de la moneda (ARS si son pesos).
- fecha: la fecha de la transferencia en formato AAAA-MM-DD.
- destinatario_nombre: el nombre de quien RECIBE la plata (no el de quien la manda).
- destinatario_alias: el alias de quien recibe, si aparece.
- destinatario_cvu_cbu: el CVU o CBU de quien recibe, solo los números, si aparece completo.
- numero_operacion: el número de operación o comprobante.
Si un dato no está o no se lee con seguridad, devolvé null. No inventes datos.`;

/** Lee con IA el comprobante de una transferencia de Dafne a una CM. Solo la coordinadora. Los datos se revisan antes de guardar. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Tu sesión venció. Volvé a ingresar.', 401);
  const { data: role } = await supabase.rpc('my_role');
  if (role !== 'coordinadora') return fail('Solo la coordinadora puede cargar pagos.', 403);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail('Falta configurar OPENAI_API_KEY en el servidor.', 500);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail('No llegó ningún archivo.', 400);
  if (file.size > MAX_BYTES) return fail('El archivo pesa más de 4 MB. Probá con una captura de pantalla.', 400);
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return fail('Subí una captura o un PDF del comprobante.', 400);

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const attachment = isPdf
    ? { type: 'input_file' as const, filename: file.name || 'comprobante.pdf', file_data: `data:application/pdf;base64,${base64}` }
    : { type: 'input_image' as const, image_url: `data:${file.type};base64,${base64}`, detail: 'auto' as const };

  try {
    const response = await new OpenAI({ apiKey }).responses.parse({
      model: MODEL,
      input: [
        { role: 'system', content: INSTRUCTIONS },
        { role: 'user', content: [attachment, { type: 'input_text', text: 'Leé este comprobante.' }] }
      ],
      text: { format: zodTextFormat(Transfer, 'transferencia') }
    });
    const r = response.output_parsed;
    if (!r) return fail('No se pudo leer el comprobante. Cargá los datos a mano.', 422);
    const text = (v: string | null) => v?.trim() || null;
    const data: TransferData = {
      isTransfer: r.es_comprobante_de_transferencia,
      amountCents: r.monto !== null && r.monto > 0 && (!r.moneda || r.moneda.toUpperCase() === 'ARS') ? Math.round(r.monto * 100) : null,
      date: r.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : null,
      recipientName: text(r.destinatario_nombre),
      recipientAlias: text(r.destinatario_alias),
      recipientAccount: r.destinatario_cvu_cbu ? r.destinatario_cvu_cbu.replace(/\D/g, '') || null : null,
      operation: text(r.numero_operacion),
    };
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) return fail('La clave de OpenAI no es válida.', 502);
    if (error instanceof OpenAI.RateLimitError) return fail('OpenAI rechazó el pedido por límite o saldo. Revisá la cuenta y probá de nuevo.', 502);
    return fail('No se pudo leer el comprobante. Probá de nuevo o cargá los datos a mano.', 502);
  }
}
