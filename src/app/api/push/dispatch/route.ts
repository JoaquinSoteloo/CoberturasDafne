import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase/server';
import { KINDS, buildMessage, type Outgoing } from '@/lib/notifications';

export const runtime = 'nodejs';
export const maxDuration = 60;

const authorized = (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  return !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
};

/**
 * Despachador de avisos. Lo llama Supabase cada minuto (pg_cron) con CRON_SECRET.
 * Anota los recordatorios que entraron en las 24 horas, los avisos de cobros y entregas
 * atrasados para la coordinadora, los de CM que no contestaron y los de cada momento de
 * la noche, y manda todo lo pendiente. De paso borra los comprobantes que quedaron sin gasto.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return NextResponse.json({ error: 'Faltan las claves VAPID.' }, { status: 500 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:avisos@example.com', publicKey, privateKey);

  let admin;
  try { admin = supabaseAdmin(); } catch { return NextResponse.json({ error: 'Falta SUPABASE_SECRET_KEY en el servidor.' }, { status: 500 }); }
  const { data: reminders, error: enqueueError } = await admin.rpc('enqueue_due_reminders');
  if (enqueueError) return NextResponse.json({ error: enqueueError.message }, { status: 500 });
  const { data: followups, error: followupsError } = await admin.rpc('enqueue_followups');
  if (followupsError) return NextResponse.json({ error: followupsError.message }, { status: 500 });
  const { data: live, error: liveError } = await admin.rpc('enqueue_live');
  if (liveError) return NextResponse.json({ error: liveError.message }, { status: 500 });
  const { data, error } = await admin.rpc('pending_notifications', { p_limit: 100, p_kinds: KINDS });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sent: number[] = [], failed: number[] = [], gone: string[] = [];
  await Promise.all((data as Outgoing[]).map(async n => {
    const payload = JSON.stringify(buildMessage(n));
    // Sin celulares suscriptos no hay a quién mandarle: se da por enviado.
    if (!n.subscriptions.length) { sent.push(n.id); return; }
    // Un momento de la noche que llega tarde ya no sirve: el servicio de avisos lo descarta a los 10 minutos.
    const results = await Promise.all(n.subscriptions.map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: n.kind === 'moment' ? 10 * 60 : 12 * 60 * 60, urgency: 'high' })
        .then(() => 'ok' as const)
        .catch((e: { statusCode?: number }) => {
          // 404/410: el celular ya no existe o desactivó los avisos. Se borra la suscripción.
          if (e.statusCode === 404 || e.statusCode === 410) { gone.push(s.endpoint); return 'gone' as const; }
          return 'error' as const;
        })));
    if (results.includes('ok') || results.every(r => r === 'gone')) sent.push(n.id); else failed.push(n.id);
  }));

  if (sent.length || failed.length || gone.length) {
    const { error: finishError } = await admin.rpc('finish_notifications', { p_sent: sent, p_failed: failed, p_gone_endpoints: gone });
    if (finishError) return NextResponse.json({ error: finishError.message }, { status: 500 });
  }
  // Comprobantes sueltos (se borró el Uber o el gasto). Si falla, se reintenta en el próximo minuto.
  const { data: orphans } = await admin.rpc('orphan_receipts', { p_limit: 100 });
  let removedReceipts = 0;
  if (Array.isArray(orphans) && orphans.length) {
    const { error: removeError } = await admin.storage.from('comprobantes').remove(orphans as string[]);
    if (!removeError) removedReceipts = orphans.length;
  }
  return NextResponse.json({ reminders, followups, live, sent: sent.length, failed: failed.length, removedSubscriptions: gone.length, removedReceipts });
}
