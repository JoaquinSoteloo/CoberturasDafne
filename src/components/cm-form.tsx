'use client';
import { useState } from 'react';
import { useStore } from './store';
import { newId } from '@/lib/repository';
import type { Cm } from '@/lib/types';

/** Agregar o editar una CM (nombre, teléfono, email de acceso, alias y notas). El honorario se carga en cada fiesta. */
export function CmForm({ initial, onDone }: { initial?: Cm; onDone: (cm: Cm) => void }) {
  const { db, update } = useStore();
  const [edit, setEdit] = useState<Cm>(() => initial ? { ...initial } : { id: newId(), name: '', phone: '', email: '', notes: '' });
  const [error, setError] = useState('');
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit.name.trim()) { setError('Ingresá el nombre.'); return; }
    const email = edit.email.trim().toLowerCase();
    if (email && db.cms.some(x => x.id !== edit.id && x.email === email)) { setError('Ese email ya lo tiene otra CM.'); return; }
    const clean = { ...edit, name: edit.name.trim(), email, alias: (edit.alias ?? '').trim() };
    update(db => ({ ...db, cms: db.cms.some(x => x.id === clean.id) ? db.cms.map(x => x.id === clean.id ? clean : x) : [...db.cms, clean] }));
    onDone(clean);
  };
  return <form onSubmit={save} className="space-y-4">
    <label className="block"><span className="label">Nombre *</span><input className="field" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} required/></label>
    <label className="block"><span className="label">Teléfono</span><input className="field" type="tel" value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })}/></label>
    <label className="block"><span className="label">Email</span><input className="field" type="email" autoComplete="off" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })}/><span className="muted mt-2 block text-sm">Con este email entra a ver sus fechas y sus pagos.</span></label>
    <label className="block"><span className="label">Alias o CBU/CVU</span><input className="field" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={edit.alias ?? ''} onChange={e => setEdit({ ...edit, alias: e.target.value })} placeholder="Ej. luli.fernandez.mp"/><span className="muted mt-2 block text-sm">Para transferirle desde Mercado Pago con un toque. También lo puede cargar ella en su perfil.</span></label>
    <label className="block"><span className="label">Notas</span><textarea className="field" value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })}/></label>
    {error && <p role="alert" className="field-error">{error}</p>}
    <button type="submit" className="btn btn-primary w-full">Guardar CM</button>
  </form>;
}
