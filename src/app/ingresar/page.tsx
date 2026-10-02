'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { BrandMark } from '@/components/brand';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
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
  return <main className="signin">
    <div className="signin-brand"><BrandMark size={88}/></div>
    <form className="signin-card" onSubmit={submit}>
      <h1 className="signin-title">Ingresar</h1>
      <label className="block"><span className="label">Email</span><input className="field" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>
      <label className="block"><span className="label">Contraseña</span><input className="field" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!error}/></label>
      {error && <p role="alert" className="field-error">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
    </form>
  </main>;
}
