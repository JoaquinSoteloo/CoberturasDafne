'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { liveEvents, type LiveEvent } from '@/lib/live';

export type LiveItem = LiveEvent & { name: string; salon?: string; livePosting?: boolean | null };

/** La hora actual, actualizada cada minuto, para que la tarjeta aparezca y se vaya sola. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  return now;
}

/** Abre la fiesta en curso cuando se entra con el atajo del ícono (?ahora). */
export function cameFromShortcut() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('ahora');
}

const hhmm = (local?: string | null) => (local ? local.slice(11, 16) : '');

/** Atajo a las fiestas que están pasando o por empezar. Con `href` es un link; si no, llama a `onOpen`. */
export function LiveNow({ items, href, onOpen }: { items: LiveItem[]; href?: (id: string) => string; onOpen?: (id: string) => void }) {
  const now = useNow();
  const live = liveEvents(items, now);
  if (!live.length) return null;
  return <section className="live-now" aria-label="Fiestas de ahora">{live.map(e => {
    const detail = [e.salon, e.live === 'soon' ? (e.arriveAt && e.arriveAt < e.startsAt ? `llegada ${hhmm(e.arriveAt)}` : `empieza ${hhmm(e.startsAt)}`) : e.endsAt ? `hasta las ${hhmm(e.endsAt)}` : `empezó ${hhmm(e.startsAt)}`].filter(Boolean).join(' · ');
    const body = <>
      <span className={`live-pill live-pill-${e.live}`}>{e.live === 'now' ? <><span className="live-dot" aria-hidden="true"/> Ahora</> : 'Hoy'}</span>
      <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-2"><span className="truncate font-bold">{e.name}</span>{e.livePosting && <span className="live-badge shrink-0">En vivo</span>}</span><span className="block truncate text-sm opacity-80">{detail}</span></span>
      <ChevronRight size={20} className="shrink-0"/>
    </>;
    return href ? <Link key={e.id} href={href(e.id)} className="live-card">{body}</Link>
      : <button key={e.id} type="button" className="live-card" onClick={() => onOpen?.(e.id)}>{body}</button>;
  })}</section>;
}
