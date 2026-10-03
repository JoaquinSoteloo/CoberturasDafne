'use client';
import { useState } from 'react';
import { CalendarPlus, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * Link privado de agenda para suscribirse desde el calendario del celular.
 * Se actualiza solo: si cambia una fecha en la app, cambia en el calendario.
 */
export function CalendarSubscribe({ who }: { who: 'coordinadora' | 'cm' }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (fresh = false) => {
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc('my_calendar_token', { p_new: fresh });
    setBusy(false);
    if (error || typeof data !== 'string') { toast.error('No se pudo armar el link. Probá de nuevo.'); return; }
    setToken(data);
    if (fresh) toast.success('Link nuevo listo. El anterior ya no funciona.');
  };

  const https = token ? `${location.origin}/api/calendario/${token}.ics` : '';
  const webcal = https.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(https); toast.success('Link copiado'); }
    catch { toast.error('No se pudo copiar. Mantené apretado el link para copiarlo.'); }
  };
  const renew = () => { if (confirm('Se genera un link nuevo y el anterior deja de funcionar. Vas a tener que volver a agregarlo en el calendario. ¿Seguimos?')) void load(true); };

  return <details className="cm-past" onToggle={e => { if ((e.target as HTMLDetailsElement).open && !token && !busy) void load(); }}>
    <summary className="cursor-pointer font-bold"><CalendarPlus size={18} className="mr-2 shrink-0"/> Sumar {who === 'cm' ? 'mis fechas' : 'las fiestas'} al calendario del celular</summary>
    <div className="mt-3 max-w-md space-y-3 text-sm">
      <p className="muted">{who === 'cm'
        ? 'Tus fechas aparecen en el calendario del celular y se actualizan solas. Las que rechaces no se muestran.'
        : 'Todas las fiestas aparecen en el calendario del celular y se actualizan solas.'}</p>
      {!token ? <p className="muted">{busy ? 'Armando tu link…' : ''}</p> : <>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary" href={webcal}>iPhone</a>
          <a className="btn btn-secondary" href={google} target="_blank" rel="noreferrer">Google Calendar</a>
          <button type="button" className="btn btn-secondary" onClick={() => void copy()}><Copy size={16}/> Copiar link</button>
        </div>
        <p className="muted text-xs leading-relaxed">En Android, tocá “Google Calendar” desde la compu o el navegador (la app de Google Calendar no deja agregar calendarios). El calendario busca cambios cada algunas horas.</p>
        <p className="muted text-xs leading-relaxed">El link es personal: quien lo tenga puede ver {who === 'cm' ? 'tus fechas' : 'las fiestas'}. <button type="button" className="text-link inline-flex items-center gap-1" onClick={renew} disabled={busy}><RefreshCw size={13}/> Cambiar link</button></p>
      </>}
    </div>
  </details>;
}
