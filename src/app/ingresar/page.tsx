'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { BrandMark } from '@/components/brand';

export default function SignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<'ingresar' | 'recuperar' | 'enviado'>('ingresar');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  // El mail de recuperación mandado desde el panel de Supabase vuelve con "#…type=recovery".
  useEffect(() => {
    const { hash, search } = window.location;
    if (hash.includes('type=recovery') || new URLSearchParams(search).has('code')) router.replace(`/ingresar/nueva-clave${search}${hash}`);
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      setError(error.message === 'Invalid login credentials' ? 'El email o la contraseña no coinciden.' : 'No pudimos ingresar. Revisá la conexión y probá de nuevo.');
      return;
    }
    router.replace('/'); router.refresh();
  };

  const recover = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/ingresar/nueva-clave` });
    setBusy(false);
    // Por seguridad no se dice si el email tiene cuenta: el mensaje es el mismo.
    if (error && error.status === 429) { setError('Se pidieron muchos mails seguidos. Esperá unos minutos y probá de nuevo.'); return; }
    setMode('enviado');
  };

  return <main className="signin">
    <div className="signin-brand"><BrandMark size={88}/></div>
    {mode === 'ingresar' && <form className="signin-card" onSubmit={submit}>
      <h1 className="signin-title">Ingresar</h1>
      <label className="block"><span className="label">Email</span><input className="field" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>
      <label className="block"><span className="label">Contraseña</span><input className="field" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!error}/></label>
      {error && <p role="alert" className="field-error">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      <button type="button" className="text-link justify-self-center" onClick={() => { setMode('recuperar'); setError(''); }}>¿Olvidaste tu contraseña?</button>
    </form>}
    {mode === 'recuperar' && <form className="signin-card" onSubmit={recover}>
      <h1 className="signin-title">Recuperar contraseña</h1>
      <p className="muted text-sm">Poné tu email y te mandamos un link para elegir una contraseña nueva.</p>
      <label className="block"><span className="label">Email</span><input className="field" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>
      {error && <p role="alert" className="field-error">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Enviando…' : 'Mandar link'}</button>
      <button type="button" className="text-link justify-self-center" onClick={() => setMode('ingresar')}>Volver a ingresar</button>
    </form>}
    {mode === 'enviado' && <div className="signin-card">
      <h1 className="signin-title">Revisá tu mail</h1>
      <p className="muted">Si <b>{email.trim()}</b> tiene cuenta, te llegó un link para elegir una contraseña nueva. Abrilo desde este mismo celular o compu. Si no aparece, mirá en correo no deseado.</p>
      <button type="button" className="btn btn-secondary w-full" onClick={() => setMode('ingresar')}>Volver a ingresar</button>
    </div>}
  </main>;
}
