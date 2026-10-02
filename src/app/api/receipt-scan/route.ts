import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import type { ReceiptData } from '@/lib/trip';

export const runtime = 'nodejs';
export const maxDuration = 30;

// El modelo más económico con visión alcanza para leer un comprobante; se puede cambiar sin tocar código.
const MODEL = process.env.OPENAI_RECEIPT_MODEL || 'gpt-6-luna';
const MAX_BYTES = 4 * 1024 * 1024;   // las fotos ya llegan achicadas desde el celular

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

const Receipt = z.object({
  es_comprobante_de_viaje: z.boolean(),
  total: z.number().nullable(),
  moneda: z.string().nullable(),
  fecha: z.string().nullable(),
  hora_subida: z.string().nullable(),
  hora_bajada: z.string().nullable(),
  origen: z.string().nullable(),
  destino: z.string().nullable()
});

const INSTRUCTIONS = `Leés comprobantes de viajes (Uber, Cabify, DiDi, taxis) de Argentina: capturas de la app, recibos por mail o PDF.
Devolvé:
- es_comprobante_de_viaje: false si la imagen no es un comprobante de un viaje.
- total: lo que efectivamente se cobró por el viaje, con propina, peajes y cargos incluidos, como número en pesos (por ejemplo 13500 o 13500.5). Ojo: en Argentina "13.500" son trece mil quinientos. Si hay varios montos, el total final.
- moneda: el código de la moneda (ARS si son pesos).
- fecha: la fecha del viaje en formato AAAA-MM-DD.
- hora_subida y hora_bajada: en formato HH:MM de 24 horas, hora local del comprobante.
- origen y destino: las direcciones tal como aparecen.
Si un dato no está o no se lee con seguridad, devolvé null. No inventes datos.`;

/** Lee un comprobante de viaje con IA. Solo la coordinadora puede usarlo. Los datos se confirman a mano antes de guardar. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Tu sesión venció. Volvé a ingresar.', 401);
  const { data: role } = await supabase.rpc('my_role');
  if (role !== 'coordinadora') return fail('Solo la coordinadora puede cargar comprobantes.', 403);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail('Falta configurar OPENAI_API_KEY en el servidor.', 500);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail('No llegó ningún archivo.', 400);
  if (file.size > MAX_BYTES) return fail('El archivo pesa más de 4 MB. Probá con una captura de pantalla.', 400);
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !file.type.startsWith('image/')) return fail('Subí una foto o un PDF del comprobante.', 400);
  if (!isPdf && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return fail('Ese formato de foto no se puede leer. Mandá una captura de pantalla del comprobante.', 400);

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
      text: { format: zodTextFormat(Receipt, 'comprobante') }
    });
    const r = response.output_parsed;
    if (!r) return fail('No se pudo leer el comprobante. Cargá los datos a mano.', 422);

    const time = (v: string | null) => v && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, '0') : null;
    const data: ReceiptData = {
      isTripReceipt: r.es_comprobante_de_viaje,
      totalCents: r.total !== null && r.total > 0 && (!r.moneda || r.moneda.toUpperCase() === 'ARS') ? Math.round(r.total * 100) : null,
      date: r.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : null,
      pickupTime: time(r.hora_subida),
      dropoffTime: time(r.hora_bajada),
      origin: r.origen?.trim() || null,
      destination: r.destino?.trim() || null
    };
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) return fail('La clave de OpenAI no es válida.', 502);
    if (error instanceof OpenAI.RateLimitError) return fail('OpenAI rechazó el pedido por límite o saldo. Revisá la cuenta y probá de nuevo.', 502);
    if (error instanceof OpenAI.APIError) return fail('OpenAI no pudo leer el comprobante. Probá de nuevo o cargá los datos a mano.', 502);
    return fail('No se pudo leer el comprobante. Probá de nuevo o cargá los datos a mano.', 500);
  }
}
