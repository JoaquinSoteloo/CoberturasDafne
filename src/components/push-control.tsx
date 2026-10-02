'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, X } from 'lucide-react';
import { toast } from 'sonner';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';

const KEY = 'coberturas-push-hint';

function usePush() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  const run = async (task: () => Promise<PushState>, done?: string) => {
    setBusy(true);
    try { const next = await task(); setState(next); if (next === 'on' && done) toast.success(done); if (next === 'denied') toast.error('Los avisos quedaron bloqueados. Se reactivan desde los ajustes del celular.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo cambiar los avisos.'); }
    finally { setBusy(false); }
  };
  return { state, busy, enable: () => run(enablePush, 'Avisos activados'), disable: () => run(disablePush) };
}

/** Botón para la barra lateral: activar o desactivar los avisos en este dispositivo. */
export function PushToggle({ className = '' }: { className?: string }) {
  const { state, busy, enable, disable } = usePush();
  if (!state || state === 'unsupported' || state === 'needs-install') return null;
  if (state === 'denied') return <span className={`theme-toggle ${className}`} title="Se reactivan desde los ajustes del navegador"><BellOff size={18}/><span>Avisos bloqueados</span></span>;
  return <button type="button" className={`theme-toggle ${className}`} disabled={busy} aria-pressed={state === 'on'} onClick={() => void (state === 'on' ? disable() : enable())}>
    {state === 'on' ? <BellRing size={18}/> : <Bell size={18}/>}<span>{state === 'on' ? 'Avisos activados' : 'Activar avisos'}</span>
  </button>;
}

/** Tarjeta que invita a activar los avisos, hasta que se activen o se cierre. */
export function PushPrompt({ forCm = false }: { forCm?: boolean }) {
  const { state, busy, enable } = usePush();
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(KEY) === 'cerrado'); } catch { setHidden(false); } }, []);
  if (hidden || state !== 'off') return null;
  const close = () => { try { localStorage.setItem(KEY, 'cerrado'); } catch { /* nada */ } setHidden(true); };
  return <aside className="install-hint" aria-label="Activar avisos">
    <span className="push-hint-icon" aria-hidden="true"><BellRing size={22}/></span>
    <div className="min-w-0 flex-1">
      <p className="font-bold">Activá los avisos</p>
      <p className="text-sm">{forCm ? 'Te avisamos cuando tengas una fecha nueva, 24 horas antes de cada fiesta y cuando te paguen.' : 'Te avisamos 24 horas antes de cada fiesta y cuando una CM confirme o rechace una fecha.'}</p>
      <button type="button" className="btn btn-primary btn-small mt-2" disabled={busy} onClick={() => void enable()}><Bell size={16}/> Activar</button>
    </div>
    <button type="button" className="install-close" onClick={close} aria-label="Cerrar aviso"><X size={18}/></button>
  </aside>;
}
