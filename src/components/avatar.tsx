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
