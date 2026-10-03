'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, UserX } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

export type PushStatus = { cm_id: string; has_account: boolean; devices: number; last_enabled_at: string | null };

/** Qué CM pueden recibir avisos. Se pide una vez por pantalla; si falla, no se muestra nada. */
export function useCmPushStatus() {
  const [status, setStatus] = useState<Record<string, PushStatus>>({});
  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error }: { data: unknown; error: unknown } = await supabaseBrowser().rpc('cm_notification_status');
      if (!live || error || !Array.isArray(data)) return;
      setStatus(Object.fromEntries((data as PushStatus[]).map(s => [s.cm_id, s])));
    })();
    return () => { live = false; };
  }, []);
  return status;
}

/** "Avisos activados" / "Sin avisos" / "Sin cuenta" al lado de cada CM. */
export function CmPushBadge({ status, firstName }: { status?: PushStatus; firstName: string }) {
  if (!status) return null;
  if (!status.has_account) return <p className="push-badge push-none" title="Todavía no entró a la app. Creale el acceso desde Acceso."><UserX size={14} aria-hidden="true"/> Sin cuenta</p>;
  if (!status.devices) return <p className="push-badge push-off" title={`A ${firstName} no le llega ningún aviso. Pedile que entre a la app y toque la campanita.`}><BellOff size={14} aria-hidden="true"/> Sin avisos · pedile que toque la campanita</p>;
  return <p className="push-badge push-on"><Bell size={14} aria-hidden="true"/> Avisos activados{status.devices > 1 ? ` en ${status.devices} dispositivos` : ''}</p>;
}
