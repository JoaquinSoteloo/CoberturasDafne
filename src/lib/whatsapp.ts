/**
 * Número para abrir el chat de WhatsApp (wa.me): celular argentino como 549 + área + número,
 * sin 0 ni 15. Acepta cómo se escribe acá ("11 5555-0101", "011 15 5555 0101", "+54 9 11…").
 * Si no se puede saber, null (WhatsApp abre y se elige el contacto).
 */
export function waPhone(phone: string): string | null {
  let d = phone.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // Área + 15 + número: se saca el 15 (el área tiene 2, 3 o 4 cifras).
  if (d.length === 12) for (const area of [2, 3, 4]) if (d.slice(area, area + 2) === '15') { d = d.slice(0, area) + d.slice(area + 2); break; }
  // Sin área: se asume Buenos Aires (11).
  if (d.length === 8) d = `11${d}`;
  return d.length === 10 ? `549${d}` : null;
}

export type Invite = {
  cmName: string; name: string; partyType?: string; startsAt: string; endsAt?: string; arriveAt?: string;
  salon?: string; address?: string; mapsUrl?: string; feeCents?: number; livePosting?: boolean;
  content?: string[]; mates?: string[]; dafneGoes?: boolean; appUrl?: string;
  /** Ya confirmó: el mensaje es un recordatorio con los datos, no una pregunta. */
  confirmed?: boolean;
};

const ars = (cents: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
const day = (iso: string) => { const s = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso.slice(0, 10)}T12:00`)); return s[0].toUpperCase() + s.slice(1); };
const hour = (iso?: string) => (iso ? iso.slice(11, 16) : '');
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

/** El mensaje para mandarle la fecha a una CM, con lo que haya cargado (lo que falta, no aparece). */
export function partyInvite(i: Invite): string {
  const first = i.cmName.split(' ')[0];
  const times = [i.arriveAt && hour(i.arriveAt) !== hour(i.startsAt) ? `Llegada ${hour(i.arriveAt)}` : '', `arranca ${hour(i.startsAt)}`, i.endsAt ? `termina ${hour(i.endsAt)}` : ''].filter(Boolean).join(' · ');
  const others = (i.mates ?? []).map(n => n.split(' ')[0]);
  const crew = others.length || i.dafneGoes ? ['vos', ...others, ...(i.dafneGoes ? ['yo'] : [])] : [];
  const details = [
    `🎉 *${i.name}*${i.partyType && !i.name.toLowerCase().includes(i.partyType.toLowerCase()) ? ` (${i.partyType})` : ''}`,
    `📅 ${day(i.startsAt)}`,
    `⏰ ${times[0].toUpperCase()}${times.slice(1)}`,
    i.salon || i.address ? `📍 ${[i.salon, i.address].filter(Boolean).join(' · ')}` : '',
    i.mapsUrl ? `🗺️ ${i.mapsUrl}` : '',
    i.feeCents ? `💰 Cobertura: ${ars(i.feeCents)}` : '',
    i.livePosting ? '📲 Sale en vivo: los videos editados se suben a IG durante la fiesta' : '',
    i.content?.length ? `📸 A cubrir: ${list(i.content.map(x => x.toLowerCase()))}` : '',
    crew.length ? `👯 Equipo: ${list(crew)}` : '',
  ].filter(Boolean);
  const link = i.appUrl ? ` ${i.appUrl}` : '';
  const close = i.confirmed ? `Todo está en la app 🙌${link}` : `¿Podés? Confirmame desde la app 🙌${link}`;
  return [`¡Hola ${first}! 👋 ${i.confirmed ? 'Te paso los datos de la fecha' : 'Te paso una fecha'}:`, '', ...details, '', close].join('\n');
}

/** Link que abre WhatsApp con el mensaje escrito (al chat de la CM si el número se entiende). */
export const waLink = (phone: string, text: string) => `https://wa.me/${waPhone(phone) ?? ''}?text=${encodeURIComponent(text)}`;

/** El mensaje con el acceso de una CM: el link, su email y la contraseña provisoria. */
export function accessMessage({ cmName, appUrl, email, password }: { cmName: string; appUrl: string; email: string; password: string }): string {
  return [
    `¡Hola ${cmName.split(' ')[0]}! 👋 Ya tenés acceso a la app de BS Marketing, donde vas a ver tus fechas y tus pagos:`,
    appUrl,
    '',
    `📧 Email: ${email}`,
    `🔑 Contraseña provisoria: ${password}`,
    '',
    'La primera vez que entres te va a pedir que elijas tu contraseña.',
    '📲 Tip: abrila en Safari y tocá Compartir → "Agregar a inicio" para tenerla como app.',
  ].join('\n');
}
