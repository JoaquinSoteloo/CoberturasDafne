import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { openAiReason, withModel } from '@/lib/openai-models';
import type { ParsedMoment } from '@/lib/schedule';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = process.env.OPENAI_SCHEDULE_MODEL || process.env.OPENAI_RECEIPT_MODEL;
const MAX_CHARS = 4000;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

const Schedule = z.object({
  momentos: z.array(z.object({ hora: z.string(), momento: z.string() }))
});

const INSTRUCTIONS = `Te pasan el cronograma de una fiesta (15 años, boda, cumpleaños) que mandó un salón de Argentina, copiado de WhatsApp.
Devolvé cada momento de la noche con su hora:
- hora: formato HH:MM de 24 horas ("23hs" → "23:00", "1 y media" → "01:30", "medianoche" → "00:00").
- momento: nombre corto y claro en español, con mayúscula inicial (ej. "Entrada", "Vals", "Torta", "Carioca"). Conservá los nombres propios.
Si un momento tiene un rango ("20:30 a 21:30 recepción"), usá la hora de inicio.
Ignorá títulos, saludos y líneas sin hora. No inventes momentos ni horas que no estén en el texto.`;

/** Ordena con IA un cronograma pegado que no se pudo leer solo. Solo la coordinadora. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Tu sesión venció. Volvé a ingresar.', 401);
  const { data: role } = await supabase.rpc('my_role');
  if (role !== 'coordinadora') return fail('Solo la coordinadora puede usar esto.', 403);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail('Falta configurar OPENAI_API_KEY en el servidor.', 500);

  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return fail('No llegó ningún cronograma.', 400);
  if (text.length > MAX_CHARS) return fail('El texto es muy largo. Pegá solo el cronograma.', 400);

  try {
    const response = await withModel(MODEL, model => new OpenAI({ apiKey }).responses.parse({
      model,
      instructions: INSTRUCTIONS,
      input: text,
      text: { format: zodTextFormat(Schedule, 'cronograma') },
    }));
    const items: ParsedMoment[] = (response.output_parsed?.momentos ?? [])
      .map(m => ({ time: m.hora.trim(), label: m.momento.trim() }))
      .filter(m => /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time) && m.label);
    return NextResponse.json({ items });
  } catch (error) {
    console.error('schedule-scan', error);
    return fail(openAiReason(error), 502);
  }
}
