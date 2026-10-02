'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { StoreProvider } from './store';
import { Shell } from './shell';
import { CmHome } from './cm-home';

type Role = 'loading' | 'coordinadora' | 'cm' | 'none' | 'error';

/** Decide qué ve cada cuenta: la coordinadora, la app completa; una CM, solo lo suyo. */
export function AppRoot({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return path === '/ingresar' || path.startsWith('/ingresar/') ? <>{children}</> : <RoleGate>{children}</RoleGate>;
}

function RoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error }: { data: unknown; error: unknown } = await supabaseBrowser().rpc('my_role');
      if (!live) return;
      setRole(error ? 'error' : data === 'coordinadora' || data === 'cm' ? data : 'none');
    })();
    return () => { live = false; };
  }, [attempt]);
  const signOut = async () => { await supabaseBrowser().auth.signOut(); router.replace('/ingresar'); router.refresh(); };

  if (role === 'coordinadora') return <StoreProvider><Shell>{children}</Shell></StoreProvider>;
  if (role === 'cm') return <CmHome onSignOut={signOut}/>;
  if (role === 'loading') return <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--muted)]">Cargando…</div>;
  return <div className="grid min-h-dvh place-items-center p-6 text-center"><div className="max-w-sm">
    {role === 'error'
      ? <><p className="font-bold">No pudimos verificar tu cuenta.</p><p className="muted mt-1 text-sm">Revisá la conexión a internet y volvé a intentar.</p><button className="btn btn-primary mt-4" onClick={() => { setRole('loading'); setAttempt(n => n + 1); }}>Reintentar</button></>
      : <><p className="font-bold">Tu cuenta todavía no está habilitada.</p><p className="muted mt-1 text-sm">Pedile a Dafne que cargue tu email en tu ficha del equipo.</p><button className="btn btn-secondary mt-4" onClick={() => void signOut()}>Salir</button></>}
  </div></div>;
}
