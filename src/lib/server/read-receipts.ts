import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { openAiReason, withModel } from '@/lib/openai-models';
import type { TransferData } from '@/lib/transfer';
import type { ReceiptData } from '@/lib/trip';

/** Lectura con IA de comprobantes (solo servidor). La usan las rutas de la app y el Atajo de iPhone. */
export class ReadError extends Error { constructor(message: string, public status: number) { super(message); } }

const MODEL = process.env.OPENAI_RECEIPT_MODEL;
export const MAX_BYTES = 4 * 1024 * 1024;
const IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** El archivo, listo para mandarle a OpenAI (foto o PDF). */
async function attachmentFor(file: File, what: string) {
  if (file.size > MAX_BYTES) throw new ReadError('El archivo pesa más de 4 MB. Probá con una captura de pantalla.', 400);
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !IMAGES.includes(file.type)) throw new ReadError(`Ese formato no se puede leer. Mandá una captura de pantalla o un PDF ${what}.`, 400);
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  return isPdf
    ? { type: 'input_file' as const, filename: file.name || 'comprobante.pdf', file_data: `data:application/pdf;base64,${base64}` }
    : { type: 'input_image' as const, image_url: `data:${file.type};base64,${base64}`, detail: 'auto' as const };
}

async function parse<T extends z.ZodTypeAny>(file: File, what: string, instructions: string, schema: T, name: string): Promise<z.infer<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ReadError('Falta configurar OPENAI_API_KEY en el servidor.', 500);
  const attachment = await attachmentFor(file, what);
  let response;
  try {
    response = await withModel(MODEL, model => new OpenAI({ apiKey }).responses.parse({
      model,
      input: [
        { role: 'system', content: instructions },
        { role: 'user', content: [attachment, { type: 'input_text', text: 'Leé este comprobante.' }] }
      ],
      text: { format: zodTextFormat(schema, name) }
    }));
  } catch (error) {
    console.error(`leer ${name}`, error);
    throw new ReadError(openAiReason(error), 502);
  }
  if (!response.output_parsed) throw new ReadError(`OpenAI no devolvió datos${response.output_text ? '' : ' (respuesta vacía)'}. Cargá los datos a mano.`, 422);
  return response.output_parsed as z.infer<T>;
}

const Transfer = z.object({
  es_comprobante_de_transferencia: z.boolean(),
  monto: z.number().nullable(),
  moneda: z.string().nullable(),
  fecha: z.string().nullable(),
  destinatario_nombre: z.string().nullable(),
  destinatario_alias: z.string().nullable(),
  destinatario_cvu_cbu: z.string().nullable(),
  numero_operacion: z.string().nullable(),
  direccion: z.enum(['enviada', 'recibida', 'no_se_sabe']),
  remitente_nombre: z.string().nullable(),
});

const TRANSFER_INSTRUCTIONS = `Leés comprobantes de transferencias de dinero de Argentina (Mercado Pago, bancos, billeteras): capturas o PDF.
La dueña de la cuenta es una coordinadora de eventos: a veces le paga a su equipo y a veces le pagan los salones.
Devolvé:
- es_comprobante_de_transferencia: false si no es el comprobante de una transferencia enviada.
- monto: lo transferido, como número en pesos (por ejemplo 85000 o 85000.5). Ojo: en Argentina "85.000" son ochenta y cinco mil.
- moneda: el código de la moneda (ARS si son pesos).
- fecha: la fecha de la transferencia en formato AAAA-MM-DD.
- destinatario_nombre: el nombre de quien RECIBE la plata (no el de quien la manda).
- destinatario_alias: el alias de quien recibe, si aparece.
- destinatario_cvu_cbu: el CVU o CBU de quien recibe, solo los números, si aparece completo.
- numero_operacion: el número de operación o comprobante.
- direccion: "enviada" si es plata que mandó la dueña de la cuenta ("Transferiste", "Enviaste", "Le transferiste a…"),
  "recibida" si es plata que le llegó ("Recibiste", "Te transfirieron", "Ingreso de dinero"), "no_se_sabe" si no está claro.
- remitente_nombre: el nombre de quien MANDA la plata, si aparece.
Si un dato no está o no se lee con seguridad, devolvé null. No inventes datos.`;

/** Lee el comprobante de una transferencia: un pago de Dafne a una CM o un cobro de un salón. */
export async function readTransfer(file: File): Promise<TransferData> {
  const r = await parse(file, 'del comprobante', TRANSFER_INSTRUCTIONS, Transfer, 'transferencia');
  const text = (v: string | null) => v?.trim() || null;
  return {
    isTransfer: r.es_comprobante_de_transferencia,
    amountCents: r.monto !== null && r.monto > 0 && (!r.moneda || r.moneda.toUpperCase() === 'ARS') ? Math.round(r.monto * 100) : null,
    date: r.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : null,
    recipientName: text(r.destinatario_nombre),
    recipientAlias: text(r.destinatario_alias),
    recipientAccount: r.destinatario_cvu_cbu ? r.destinatario_cvu_cbu.replace(/\D/g, '') || null : null,
    operation: text(r.numero_operacion),
    direction: r.direccion === 'enviada' ? 'sent' : r.direccion === 'recibida' ? 'received' : null,
    senderName: text(r.remitente_nombre),
  };
}

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

const TRIP_INSTRUCTIONS = `Leés comprobantes de viajes (Uber, Cabify, DiDi, taxis) de Argentina: capturas de la app, recibos por mail o PDF.
Devolvé:
- es_comprobante_de_viaje: false si la imagen no es un comprobante de un viaje.
- total: lo que efectivamente se cobró por el viaje, con propina, peajes y cargos incluidos, como número en pesos (por ejemplo 13500 o 13500.5). Ojo: en Argentina "13.500" son trece mil quinientos. Si hay varios montos, el total final.
- moneda: el código de la moneda (ARS si son pesos).
- fecha: la fecha del viaje en formato AAAA-MM-DD.
- hora_subida y hora_bajada: en formato HH:MM de 24 horas, hora local del comprobante.
- origen y destino: las direcciones tal como aparecen.
Si un dato no está o no se lee con seguridad, devolvé null. No inventes datos.`;

/** Lee el recibo de un viaje (Uber, Cabify, DiDi, taxi). */
export async function readTrip(file: File): Promise<ReceiptData> {
  const r = await parse(file, 'del recibo', TRIP_INSTRUCTIONS, Receipt, 'comprobante');
  const time = (v: string | null) => v && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, '0') : null;
  return {
    isTripReceipt: r.es_comprobante_de_viaje,
    totalCents: r.total !== null && r.total > 0 && (!r.moneda || r.moneda.toUpperCase() === 'ARS') ? Math.round(r.total * 100) : null,
    date: r.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : null,
    pickupTime: time(r.hora_subida),
    dropoffTime: time(r.hora_bajada),
    origin: r.origen?.trim() || null,
    destination: r.destino?.trim() || null
  };
}
