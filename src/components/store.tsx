'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createSeed } from '@/lib/seed';
import { loadDb, saveDb } from '@/lib/repository';
import type { Db } from '@/lib/types';

type Store = { db: Db; ready: boolean; update: (fn: (db: Db) => Db) => void };
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Db>(() => createSeed());
  const [ready, setReady] = useState(false);
  useEffect(() => { setDb(loadDb()); setReady(true); }, []);
  useEffect(() => { if (ready) saveDb(db); }, [db, ready]);
  const update = (fn: (db: Db) => Db) => setDb(fn);
  return <Context.Provider value={{ db, ready, update }}>{ready ? children : <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--muted)]">Cargando datos de la demo…</div>}</Context.Provider>;
}
export const useStore = () => { const store = useContext(Context); if (!store) throw new Error('StoreProvider requerido'); return store; };

