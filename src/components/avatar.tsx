'use client';
import { SUPABASE_URL } from '@/lib/supabase/env';

/** Dirección pública de una foto de perfil (las fotos tienen nombres al azar). */
export const photoUrl = (path?: string | null) => (path ? `${SUPABASE_URL}/storage/v1/object/public/perfiles/${path}` : '');

const initials = (name = '') => name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();

/** Foto de perfil, o las iniciales si no hay. */
export function Avatar({ name, photoPath, size = 44, className = '' }: { name: string; photoPath?: string | null; size?: number; className?: string }) {
  const url = photoUrl(photoPath);
  return <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element -- foto chica ya achicada al subirla */}
    {url ? <img src={url} alt="" loading="lazy"/> : initials(name)}
  </span>;
}

/** Recorta la foto al centro en un cuadrado de 512 px y la pasa a JPG (queda en unos 60 KB). */
export async function squarePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('No se pudo preparar la foto.');
  return blob;
}
