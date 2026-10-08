'use client';
import { useState } from 'react';
import { Copy, Check, MessageCircle } from 'lucide-react';
import { accessMessage, waLink } from '@/lib/whatsapp';
import { useStore } from './store';
import type { Cm } from '@/lib/types';

type Result = { email: string; password: string; created: boolean };

/** Contenido del modal "Acceso": genera la contraseña provisoria de una CM. */
export function CmAccess({ cm, onEdit }: { cm: Cm; onEdit: () => void }) {
  const { saveState } = useStore();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  const first = cm.name.split(' ')[0];

  if (!cm.email) return <div className="space-y-4">
    <p>Para que {first} pueda entrar a ver sus fechas y pagos, primero cargá su email en la ficha.</p>
    <button className="btn btn-primary w-full" onClick={onEdit}>Cargar email</button>
  </div>;

  const generate = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/cm-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmId: cm.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el acceso.');
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear el acceso.'); }
    finally { setBusy(false); }
  };
  const message = result ? accessMessage({ cmName: cm.name, appUrl: window.location.origin, email: result.email, password: result.password }) : '';
  const copy = async () => { await navigator.clipboard.writeText(message); setCopied(true); };

  if (result) return <div className="space-y-4">
    <p>{result.created ? `Listo, ${first} ya tiene acceso.` : `Le generamos una contraseña nueva a ${first}. La anterior ya no funciona.`} Mandale estos datos:</p>
    <dl className="access-card">
      <div><dt>Email</dt><dd>{result.email}</dd></div>
      <div><dt>Contraseña</dt><dd className="access-password">{result.password}</dd></div>
    </dl>
    <a className="btn btn-whatsapp w-full" href={waLink(cm.phone, message)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/> Mandárselo por WhatsApp</a>
    <button className="btn btn-secondary w-full" onClick={() => void copy()}>{copied ? <><Check size={18}/> Copiado</> : <><Copy size={18}/> Copiar mensaje</>}</button>
    <p className="muted text-sm">Es una contraseña provisoria: la primera vez que entre, la app le pide que elija la suya. No se vuelve a mostrar; si la pierde, generá otra desde acá.</p>
  </div>;

  return <div className="space-y-4">
    <p>{first} entra con <b>{cm.email}</b> y ve solo sus fechas, el contenido a cubrir y el estado de sus pagos. Puede confirmar o rechazar fechas y tildar contenido. No ve montos del salón ni honorarios de otras.</p>
    <p className="muted text-sm">Si ya tenía acceso, se le genera una contraseña nueva y la anterior deja de funcionar.</p>
    {error && <p role="alert" className="field-error">{error}</p>}
    {saveState !== 'saved' && <p className="muted text-sm">Esperá a que se guarden los cambios.</p>}
    <button className="btn btn-primary w-full" disabled={busy || saveState !== 'saved'} onClick={() => void generate()}>{busy ? 'Generando…' : 'Generar contraseña provisoria'}</button>
  </div>;
}
