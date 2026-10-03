'use client';
import { useRef, useState } from 'react';
import { Car, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { attachReceipt } from '@/lib/receipts';
import { ars } from '@/lib/money';
import { MoneyField } from './ui';
import { ReceiptControl } from './receipt-control';

type Uber = { expense_id: string | null; label: string; amount_cents: number; paid_cents: number; receipt_path: string | null };

/**
 * Los Ubers de la CM en una fiesta: los ve con su comprobante y puede cargar uno nuevo
 * (monto, ida o vuelta y la foto). A Dafne le llega un aviso.
 */
export function CmUbers({ coverageId, ubers, canAdd, preview, onChange }: {
  coverageId: string; ubers: Uber[]; canAdd: boolean; preview: boolean; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'ida' | 'vuelta'>('ida');
  const [amount, setAmount] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setOpen(false); setDirection('ida'); setAmount(0); setFile(null); setError(''); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(amount > 0)) { setError('Poné cuánto pagaste.'); return; }
    if (!file) { setError('Adjuntá la captura o el PDF del viaje.'); return; }
    setBusy(true); setError('');
    const supabase = supabaseBrowser();
    const { data, error: addError }: { data: unknown; error: { message?: string } | null } = await supabase.rpc('cm_add_uber', { p_coverage: coverageId, p_direction: direction, p_amount_cents: amount });
    if (addError || typeof data !== 'string') { setBusy(false); setError(addError?.message || 'No se pudo cargar. Revisá la conexión.'); return; }
    try {
      await attachReceipt(supabase, data, file);
      toast.success('Uber cargado. Le avisamos a Dafne.');
    } catch (err) {
      toast.error(`El Uber se cargó, pero el comprobante no: ${err instanceof Error ? err.message : 'probá adjuntarlo de nuevo.'}`);
    }
    setBusy(false); reset(); onChange();
  };

  if (!ubers.length && !canAdd) return null;
  return <div className="cm-ubers">
    <p className="text-sm font-bold">Tus Ubers de esta fiesta</p>
    {ubers.length > 0 && <ul className="mt-2 space-y-2">{ubers.map(u => { const owed = u.amount_cents - u.paid_cents; return <li key={u.expense_id ?? u.label} className="cm-uber-row">
      <span className="min-w-0 flex-1"><span className="block font-semibold">{u.label}</span><span className="muted text-sm">{ars(u.amount_cents)} · {owed > 0 ? `te deben ${ars(owed)}` : 'pagado'}</span></span>
      {u.expense_id && <ReceiptControl expenseId={u.expense_id} path={u.receipt_path} onChange={() => onChange()} disabledReason={preview ? 'Solo para mirar.' : undefined}/>}
    </li>; })}</ul>}
    {canAdd && !open && <button type="button" className="btn btn-secondary mt-3" disabled={preview} onClick={() => setOpen(true)}><Car size={17}/> Cargar un Uber</button>}
    {canAdd && open && <form className="cm-uber-form mt-3 space-y-3" onSubmit={e => void save(e)}>
      <div className="coverage-view-switch" role="group" aria-label="¿De ida o de vuelta?">{(['ida', 'vuelta'] as const).map(v => <button key={v} type="button" aria-pressed={direction === v} className={direction === v ? 'selected' : ''} onClick={() => setDirection(v)}>{v === 'ida' ? 'De ida' : 'De vuelta'}</button>)}</div>
      <MoneyField label="Lo que pagaste" value={amount} onChange={setAmount} placeholder="Ej. 13.500"/>
      <div><span className="label">Comprobante</span>
        <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }}/>
        <button type="button" className="btn btn-secondary w-full justify-start" onClick={() => input.current?.click()}><Paperclip size={16}/><span className="truncate">{file ? file.name : 'Elegir captura o PDF del viaje'}</span></button>
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Cargando…' : 'Cargar Uber'}</button><button type="button" className="btn btn-quiet" disabled={busy} onClick={reset}>Cancelar</button></div>
      <p className="muted text-xs">Si te equivocás en algo, avisale a Dafne y lo corrige ella.</p>
    </form>}
  </div>;
}
