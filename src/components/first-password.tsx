'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { BrandMark } from './brand';

/**
 * La primera vez que una CM entra con la contraseña provisoria que le dio Dafne: tiene que
 * elegir la suya antes de ver la app.
 */
export function FirstPassword({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState(''); const [repeat, setRepeat] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Usá al menos 8 caracteres.'); return; }
    if (password !== repeat) { setError('Las dos contraseñas no coinciden.'); return; }
    setBusy(true); setError('');
    const { error } = await supabaseBrowser().auth.updateUser({ password, data: { must_change_password: false } });
    setBusy(false);
    if (error) { setError(/different|distinta|same/i.test(error.message) ? 'Elegí una distinta a la provisoria.' : 'No se pudo guardar. Probá con otra contraseña.'); return; }
    onDone();
  };
  return <main className="signin">
    <div className="signin-brand"><BrandMark size={88}/></div>
    <div className="signin-card">
      <form className="grid gap-4" onSubmit={save}>
        <h1 className="signin-title">Elegí tu contraseña</h1>
        <p className="muted">Es la primera vez que entrás: cambiá la contraseña provisoria por una tuya. Con esa vas a entrar de ahora en más.</p>
        <label className="block"><span className="label">Contraseña nueva</span><input className="field" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!error}/></label>
        <label className="block"><span className="label">Repetila</span><input className="field" type="password" autoComplete="new-password" required value={repeat} onChange={e => setRepeat(e.target.value)} aria-invalid={!!error}/></label>
        {error && <p role="alert" className="field-error">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</button>
        <button type="button" className="btn btn-quiet w-full" onClick={onSignOut}>Salir</button>
      </form>
    </div>
  </main>;
}
