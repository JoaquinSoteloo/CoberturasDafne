import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ReadError, readTransfer, readTrip } from '@/lib/server/read-receipts';
import { loadDb } from '@/lib/repository';
import { diff, snapshotOf } from '@/lib/rows';
import { decideFor, movementFor, reviewReason, withMovement } from '@/lib/intake';
import { guessDirection, matchTripCoverage, tripTimestamp } from '@/lib/trip';
import { ars, dateLabel } from '@/lib/money';
import type { TransferData } from '@/lib/transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'comprobantes';
type Who = { user_id: string; email: string; coordinator: boolean; cm_id: string | null };

// El Atajo muestra la respuesta como notificación: siempre texto, siempre 200 (si no, el iPhone muestra un error genérico).
const say = (text: string) => new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

/** De qué tipo es el archivo, mirando sus primeros bytes (el Atajo no siempre lo dice). */
function sniff(b: Buffer): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return 'image/heic';
  return null;
}

/** El archivo, venga como formulario (campo "file" u otro) o como cuerpo crudo. */
async function fileFrom(request: Request): Promise<File | null> {
  const type = request.headers.get('content-type') ?? '';
  let raw: Blob | null = null; let name = 'comprobante';
  if (type.startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const found = form ? (form.get('file') ?? [...form.values()].find(v => typeof v !== 'string')) : null;
    if (found && typeof found !== 'string') { raw = found; name = (found as File).name || name; }
  } else {
    raw = await request.blob();
  }
  if (!raw || !raw.size) return null;
  const bytes = Buffer.from(await raw.arrayBuffer());
  return new File([bytes], name, { type: sniff(bytes) ?? (raw.type || type.split(';')[0]) });
}

const extension = (type: string) => (type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg');

async function upload(admin: SupabaseClient, folder: string, file: File) {
  const path = `${folder}/${randomUUID()}.${extension(file.type)}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) throw new Error('No se pudo guardar el archivo.');
  return path;
}

/** Lo deja "para revisar": aparece en "A resolver" de la app, ya completo. */
async function toReview(admin: SupabaseClient, who: Who, file: File, t: TransferData, reason: string) {
  const id = randomUUID();
  const path = await upload(admin, `entrada-${id}`, file);
  const { error } = await admin.from('pending_receipts').insert({ id, owner_id: who.user_id, path, data: t, reason });
  if (error) { await admin.storage.from(BUCKET).remove([path]); throw error; }
  return `No lo pude registrar solo: ${reason}. Te lo dejé en "A resolver" para que lo revises.`;
}

/** Dafne: un cobro de un salón o un pago a una CM. */
async function forCoordinator(admin: SupabaseClient, token: string, who: Who, file: File) {
  const t = await readTransfer(file);
  if (!t.isTransfer) return 'No parece el comprobante de una transferencia. Para los Ubers usá "Cargar recibo de Uber" en la app.';
  const { db, versions } = await loadDb(admin, who.user_id);
  const d = decideFor(db, t, who.email);

  if (d.action === 'attach') {
    const table = d.kind === 'cobro' ? 'collections' : 'cm_payments';
    const path = await upload(admin, `${d.kind === 'cobro' ? 'cobro' : 'pago'}-${d.id}`, file);
    const { error } = await admin.from(table).update({ receipt_path: path }).eq('id', d.id).eq('owner_id', who.user_id);
    if (error) { await admin.storage.from(BUCKET).remove([path]); throw error; }
    const m = d.kind === 'cobro' ? db.collections.find(x => x.id === d.id) : db.cmPayments.find(x => x.id === d.id);
    return `Adjunté el comprobante al ${d.kind} de ${ars(t.amountCents ?? 0)}${m ? ` del ${dateLabel(m.date)}` : ''}, que no lo tenía.`;
  }

  const id = randomUUID();
  const m = movementFor(db, d, t, id, todayAR(), 'el Atajo');
  if (!m) return toReview(admin, who, file, t, reviewReason(db, t, who.email));
  const { changes } = diff(snapshotOf(db), withMovement(db, m), versions);
  const { error } = await admin.rpc('intake_save', { p_token: token, p_changes: changes });
  if (error) return toReview(admin, who, file, t, error.message || 'no se pudo guardar');
  try {
    const path = await upload(admin, `${m.kind === 'cobro' ? 'cobro' : 'pago'}-${id}`, file);
    await admin.from(m.kind === 'cobro' ? 'collections' : 'cm_payments').update({ receipt_path: path }).eq('id', id);
  } catch { return `${m.message} (No se pudo adjuntar el comprobante: adjuntalo desde Pagos.)`; }
  return `${m.message} Si algo no está bien, corregilo en Pagos.`;
}

type CmDate = { id: string; name: string; starts_at: string; ends_at: string | null; address: string; confirmation: string; event_status: string };

/** Una CM: el recibo de su Uber, en la fiesta que corresponde. */
async function forCm(admin: SupabaseClient, token: string, file: File) {
  const r = await readTrip(file);
  if (!r.isTripReceipt) return 'No parece el recibo de un viaje. Compartí la captura del recibo de Uber.';
  if (!r.totalCents) return 'No pude leer el monto del viaje. Cargalo desde tu fecha en la app.';
  const { data: home, error: homeError } = await admin.rpc('intake_cm_home', { p_token: token });
  if (homeError || !home) return 'No pude ver tus fechas. Probá de nuevo o cargalo desde la app.';
  const dates = ((home as { dates: CmDate[] }).dates ?? [])
    .filter(d => d.confirmation === 'confirmada' && d.event_status !== 'cancelado')
    .map(d => ({ id: d.id, name: d.name, startsAt: d.starts_at, endsAt: d.ends_at, address: d.address }));
  const party = matchTripCoverage(dates, r);
  if (!party) return 'No supe de qué fiesta es este viaje. Cargalo desde la fecha en la app.';
  const guess = guessDirection(r, { startsAt: party.startsAt, endsAt: party.endsAt ?? undefined }, party.address);
  const direction = guess.direction ?? (r.pickupTime && r.pickupTime >= '12:00' && r.pickupTime < party.startsAt.slice(11, 16) ? 'ida' : 'vuelta');
  const { data: expenseId, error } = await admin.rpc('intake_cm_uber', {
    p_token: token, p_coverage: party.id, p_direction: direction, p_amount_cents: r.totalCents,
    p_trip_from: r.origin, p_trip_to: r.destination,
    p_trip_started_at: r.pickupTime ? tripTimestamp(party.startsAt, r.pickupTime, r.date) : null,
    p_trip_ended_at: r.dropoffTime ? tripTimestamp(party.startsAt, r.dropoffTime, r.date) : null,
  });
  if (error || typeof expenseId !== 'string') return `No se pudo cargar el Uber: ${error?.message ?? 'probá de nuevo'}.`;
  try {
    const path = await upload(admin, expenseId, file);
    await admin.from('expenses').update({ receipt_path: path }).eq('id', expenseId);
  } catch { return `Cargué tu Uber de ${direction} (${ars(r.totalCents)}) en ${party.name}, pero no el recibo: adjuntalo desde la app.`; }
  return `Cargué tu Uber de ${direction} (${ars(r.totalCents)}) en ${party.name}. Le avisamos a Dafne.`;
}

/**
 * Atajo de iPhone: desde la pantalla de un comprobante, Compartir → "BS Marketing". El link privado
 * de cada cuenta es la llave. Dafne: transferencias (cobros y pagos). Una CM: recibos de Uber.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  if (!UUID.test(token)) return say('Este link no es válido. Copiá el link del Atajo desde la app.');
  let admin;
  try { admin = supabaseAdmin(); } catch { return say('Falta configurar el servidor.'); }
  const { data: who } = await admin.rpc('intake_identity', { p_token: token });
  if (!who) return say('Este link ya no funciona. Copiá el nuevo desde la app (menú → Atajo de iPhone).');
  const file = await fileFrom(request);
  if (!file) return say('No llegó ningún archivo. Compartí la captura o el PDF del comprobante.');
  if (file.type === 'image/heic') return say('Ese formato de foto no se puede leer. Compartí una captura de pantalla o el PDF.');
  try {
    const w = who as Who;
    if (w.coordinator) return say(await forCoordinator(admin, token, w, file));
    if (w.cm_id) return say(await forCm(admin, token, file));
    return say('Tu cuenta todavía no está habilitada.');
  } catch (error) {
    if (error instanceof ReadError) return say(error.message);
    console.error('atajo', error);
    return say('Algo falló. Probá de nuevo o cargalo desde la app.');
  }
}
