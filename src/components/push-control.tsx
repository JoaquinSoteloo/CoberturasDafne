'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, BellOff, BellRing, X } from 'lucide-react';
import { toast } from 'sonner';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';

const KEY = 'coberturas-push-hint';

/**
 * Estado de los avisos compartido por toda la app: la campanita de arriba y la tarjeta
 * leen el mismo valor, así activar desde una actualiza la otra al instante.
 */
const shared = {
  state: null as PushState | null,
  busy: false,
  listeners: new Set<() => void>(),
  checked: false,
  snapshot: { state: null as PushState | null, busy: false },
  set(patch: Partial<{ state: PushState | null; busy: boolean }>) {
    Object.assign(this, patch);
    this.snapshot = { state: this.state, busy: this.busy };
    this.listeners.forEach(l => l());
  },
  refresh() { pushState().then(state => shared.set({ state })).catch(() => shared.set({ state: 'unsupported' })); }
};
const subscribe = (listener: () => void) => {
  shared.listeners.add(listener);
  if (!shared.checked) { shared.checked = true; shared.refresh(); }
  return () => { shared.listeners.delete(listener); };
};
const serverSnapshot = { state: null, busy: false };

function usePush() {
  const { state, busy } = useSyncExternalStore(subscribe, () => shared.snapshot, () => serverSnapshot);
  // Si se cambian los permisos desde los ajustes del celular, se nota al volver a la app.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') shared.refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  const run = async (task: () => Promise<PushState>, done?: string) => {
    shared.set({ busy: true });
    try {
      const next = await task();
      shared.set({ state: next });
      if (next === 'on' && done) toast.success(done);
      if (next === 'denied') toast.error('Los avisos quedaron bloqueados. Se reactivan desde los ajustes del celular.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo cambiar los avisos.'); }
    finally { shared.set({ busy: false }); }
  };
  return { state, busy, enable: () => run(enablePush, 'Avisos activados'), disable: () => run(disablePush, undefined) };
}

/** Campanita: activar o desactivar los avisos en este dispositivo. */
export function PushToggle({ className = '' }: { className?: string }) {
  const { state, busy, enable, disable } = usePush();
  if (!state || state === 'unsupported' || state === 'needs-install') return null;
  if (state === 'denied') return <span className={`theme-toggle ${className}`} title="Se reactivan desde los ajustes del celular" aria-label="Avisos bloqueados"><BellOff size={18}/><span>Avisos bloqueados</span></span>;
  return <button type="button" className={`theme-toggle ${className}`} disabled={busy} aria-pressed={state === 'on'} aria-label={state === 'on' ? 'Avisos activados: tocá para desactivarlos' : 'Activar avisos'} onClick={() => void (state === 'on' ? disable() : enable())}>
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
