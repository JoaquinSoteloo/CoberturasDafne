'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { emptyDb, loadDb, saveChanges } from '@/lib/repository';
import { diff, emptyVersions, mergeVersions, snapshotOf, type Snapshot } from '@/lib/rows';
import type { Db } from '@/lib/types';

export type SaveState = 'saved' | 'saving' | 'error';
/** Borra algo y deja unos segundos para deshacerlo. Mientras tanto no se guarda nada: si se deshace, la base nunca se enteró. */
export type Undoable = (message: string, remove: (db: Db) => Db, restore: (db: Db) => Db, onUndo?: () => void) => void;
type Store = { db: Db; ready: boolean; update: (fn: (db: Db) => Db) => void; undoable: Undoable; saveState: SaveState; email: string; signOut: () => Promise<void>; /** Foto de perfil de Dafne. */ photoPath: string | null; setPhotoPath: (path: string | null) => void };
const Context = createContext<Store | null>(null);
const SAVE_DELAY = 500;
const RETRY_DELAY = 5000;
const REFRESH_AFTER = 30_000;
const UNDO_MS = 6000;

/** Errores que no se arreglan reintentando: la base rechazó el cambio. */
const isRejected = (error: unknown) => {
  const code = (error as { code?: string })?.code ?? '';
  return code.startsWith('22') || code.startsWith('23') || code === 'P0001' || code === '42501';
};
/** Otra persona cambió la misma fila (por ejemplo, una CM confirmó) desde que la leímos. */
const isConflict = (error: unknown) => (error as { code?: string })?.code === '40001';
const isSessionError = (error: unknown) => ['28000', 'PGRST301', 'PGRST303'].includes((error as { code?: string })?.code ?? '');

/** Datos de la coordinadora: carga todas las tablas y guarda los cambios. */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [db, setDb] = useState<Db>(emptyDb);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [email, setEmail] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const latest = useRef(db);                          // lo que hay en pantalla
  const saved = useRef<Snapshot>(snapshotOf(db));     // lo último que confirmó Supabase
  const savedDb = useRef(db);
  const versions = useRef(emptyVersions());
  const inFlight = useRef(false);
  const loadedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const holds = useRef(0);                            // borrados que todavía se pueden deshacer
  latest.current = db;

  const load = useCallback(async () => {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/ingresar'); return; }
    setEmail(user.email ?? '');
    void supabase.rpc('my_photo').then(({ data }: { data: unknown }) => setPhotoPath(typeof data === 'string' ? data : null));
    const { db: loaded, versions: loadedVersions } = await loadDb(supabase);
    saved.current = snapshotOf(loaded); savedDb.current = loaded; latest.current = loaded; versions.current = loadedVersions; loadedAt.current = Date.now();
    setDb(loaded); setSaveState('saved'); setStatus('ready');
  }, [router]);

  const flush = useCallback(async function flush() {
    if (inFlight.current || holds.current) return;
    const snapshot = latest.current;
    const { changes, after, empty } = diff(saved.current, snapshot, versions.current);
    if (empty) { savedDb.current = snapshot; setSaveState('saved'); return; }
    inFlight.current = true;
    try {
      const newVersions = await saveChanges(supabaseBrowser(), changes);
      saved.current = after; savedDb.current = snapshot; versions.current = mergeVersions(versions.current, newVersions);
    } catch (error) {
      inFlight.current = false;
      if (isSessionError(error)) { toast.error('Tu sesión venció. Volvé a ingresar.'); router.replace('/ingresar'); return; }
      if (isConflict(error)) {
        toast.warning('Mientras editabas, alguien cambió estos mismos datos (por ejemplo, una CM confirmó su fecha). Cargamos lo último: revisá tu cambio y volvé a hacerlo.');
        await load().catch(() => setSaveState('error'));
        return;
      }
      if (isRejected(error)) {
        // La base no aceptó el cambio (por ejemplo, borrar algo que ya tiene pagos). Volvemos a lo guardado.
        toast.error('No se pudo guardar el último cambio porque deja los datos inconsistentes. Cargamos lo que estaba guardado.');
        await load().catch(() => setSaveState('error'));
        return;
      }
      setSaveState('error');
      toast.error('No se pudo guardar. Revisá la conexión: lo reintentamos en unos segundos.', { id: 'save-error' });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), RETRY_DELAY);
      return;
    }
    inFlight.current = false;
    // Si hubo cambios mientras guardábamos, van en otra tanda.
    if (latest.current !== snapshot) void flush(); else setSaveState('saved');
  }, [load, router]);

  useEffect(() => { load().catch(() => setStatus('error')); }, [load]);

  useEffect(() => {
    if (status !== 'ready' || db === savedDb.current) return;
    setSaveState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
  }, [db, status, flush]);

  useEffect(() => {
    const pending = () => inFlight.current || latest.current !== savedDb.current;
    const warn = (e: BeforeUnloadEvent) => { if (pending()) e.preventDefault(); };
    // Al volver a la pestaña, traemos lo que se haya cargado desde otro dispositivo.
    const refresh = () => {
      if (document.visibilityState !== 'visible' || pending() || Date.now() - loadedAt.current < REFRESH_AFTER) return;
      load().catch(() => {});
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  const update = useCallback((fn: (db: Db) => Db) => setDb(fn), []);
  const undoable = useCallback<Undoable>((message, remove, restore, onUndo) => {
    setDb(remove);
    holds.current += 1;
    let open = true;
    const release = () => {
      if (!open) return;
      open = false; holds.current -= 1;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
    };
    const id = toast(message, { duration: UNDO_MS, action: { label: 'Deshacer', onClick: () => {
      if (!open) return;
      setDb(restore); release(); onUndo?.();
    } } });
    // El aviso se pausa si la pestaña queda en segundo plano: el plazo lo marca este reloj.
    window.setTimeout(() => { release(); toast.dismiss(id); }, UNDO_MS);
  }, [flush]);
  const signOut = useCallback(async () => {
    await supabaseBrowser().auth.signOut();
    router.replace('/ingresar'); router.refresh();
  }, [router]);

  if (status === 'error') return <div className="grid min-h-dvh place-items-center p-6 text-center"><div><p className="font-bold">No pudimos cargar tus datos.</p><p className="muted mt-1 text-sm">Revisá la conexión a internet y volvé a intentar.</p><button className="btn btn-primary mt-4" onClick={() => { setStatus('loading'); load().catch(() => setStatus('error')); }}>Reintentar</button></div></div>;
  return <Context.Provider value={{ db, ready: status === 'ready', update, undoable, saveState, email, signOut, photoPath, setPhotoPath }}>{status === 'ready' ? children : <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--muted)]">Cargando tus datos…</div>}</Context.Provider>;
}

export const useStore = () => { const store = useContext(Context); if (!store) throw new Error('StoreProvider requerido'); return store; };
