'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { BrandMark } from '@/components/brand';

/**
 * Adonde lleva el link del mail de recuperación. El link trae la sesión de dos formas:
 * - "?code=…" cuando se pidió desde la app ("¿Olvidaste tu contraseña?");
 * - "#access_token=…&type=recovery" cuando se mandó desde el panel de Supabase.
 */
export default function NewPassword() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState(''); const [repeat, setRepeat] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const code = new URLSearchParams(window.location.search).get('code');
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setStatus('invalid'); return; }
      } else if (hash.get('access_token') && hash.get('refresh_token')) {
        const { error } = await supabase.auth.setSession({ access_token: hash.get('access_token')!, refresh_token: hash.get('refresh_token')! });
        if (error) { setStatus('invalid'); return; }
      }
      // Se limpia el link para que el código no quede en el historial.
      window.history.replaceState(null, '', '/ingresar/nueva-clave');
      const { data: { user } } = await supabase.auth.getUser();
      setStatus(user ? 'ready' : 'invalid');
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Usá al menos 8 caracteres.'); return; }
    if (password !== repeat) { setError('Las dos contraseñas no coinciden.'); return; }
    setBusy(true); setError('');
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) { setError('No se pudo guardar. Probá con otra contraseña.'); return; }
    router.replace('/'); router.refresh();
  };

  return <main className="signin">
    <div className="signin-brand"><BrandMark size={88}/></div>
    <div className="signin-card">
      {status === 'checking' && <p className="muted">Verificando el link…</p>}
      {status === 'invalid' && <>
        <h1 className="signin-title">El link venció</h1>
        <p className="muted">Los links de recuperación duran poco y sirven una sola vez. Pedí uno nuevo desde la pantalla de ingreso.</p>
        <Link href="/ingresar" className="btn btn-primary w-full">Volver a ingresar</Link>
      </>}
      {status === 'ready' && <form className="grid gap-4" onSubmit={save}>
        <h1 className="signin-title">Elegí una contraseña nueva</h1>
        <label className="block"><span className="label">Contraseña nueva</span><input className="field" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!error}/></label>
        <label className="block"><span className="label">Repetila</span><input className="field" type="password" autoComplete="new-password" required value={repeat} onChange={e => setRepeat(e.target.value)} aria-invalid={!!error}/></label>
        {error && <p role="alert" className="field-error">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</button>
      </form>}
    </div>
  </main>;
}
