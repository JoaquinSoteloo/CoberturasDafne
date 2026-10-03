// Prueba local de la lectura de transferencias con IA, sin pasar por la app (no hace falta iniciar sesión).
// Uso: poné OPENAI_API_KEY en .env.local y el comprobante como comprobante-prueba.jpg/.png/.pdf en la carpeta del proyecto.
//   node scripts/probar-transferencia.mjs
// No muestra la clave. Imprime lo que leyó la IA o el error exacto de OpenAI.
import { readFileSync, existsSync } from 'node:fs';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.OPENAI_API_KEY) { console.error('Falta OPENAI_API_KEY en .env.local'); process.exit(1); }

const file = ['comprobante-prueba.jpg', 'comprobante-prueba.jpeg', 'comprobante-prueba.png', 'comprobante-prueba.pdf'].find(existsSync);
if (!file) { console.error('Falta el archivo comprobante-prueba.jpg/.png/.pdf'); process.exit(1); }
const isPdf = file.endsWith('.pdf');
const type = isPdf ? 'application/pdf' : file.endsWith('.png') ? 'image/png' : 'image/jpeg';
const base64 = readFileSync(file).toString('base64');
console.log(`Archivo: ${file} (${Math.round(base64.length * 0.75 / 1024)} KB)`);

const Transfer = z.object({
  es_comprobante_de_transferencia: z.boolean(), monto: z.number().nullable(), moneda: z.string().nullable(), fecha: z.string().nullable(),
  destinatario_nombre: z.string().nullable(), destinatario_alias: z.string().nullable(), destinatario_cvu_cbu: z.string().nullable(),
  numero_operacion: z.string().nullable(), direccion: z.enum(['enviada', 'recibida', 'no_se_sabe']), remitente_nombre: z.string().nullable(),
});
const attachment = isPdf
  ? { type: 'input_file', filename: file, file_data: `data:application/pdf;base64,${base64}` }
  : { type: 'input_image', image_url: `data:${type};base64,${base64}`, detail: 'auto' };

for (const model of [process.env.OPENAI_RECEIPT_MODEL, 'gpt-6-luna', 'gpt-5-mini'].filter(Boolean)) {
  try {
    console.log(`\nProbando con ${model}…`);
    const r = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses.parse({
      model,
      input: [
        { role: 'system', content: 'Leés comprobantes de transferencias de dinero de Argentina. Devolvé los datos pedidos; si no están, null.' },
        { role: 'user', content: [attachment, { type: 'input_text', text: 'Leé este comprobante.' }] },
      ],
      text: { format: zodTextFormat(Transfer, 'transferencia') },
    });
    console.log('Leído:', JSON.stringify(r.output_parsed, null, 2));
    break;
  } catch (e) {
    console.log(`Error (${e?.status ?? 'sin código'}): ${e?.message ?? e}`);
  }
}
