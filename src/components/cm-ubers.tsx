'use client';
import { useRef, useState } from 'react';
import { Car, Paperclip, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { attachReceipt, shrink } from '@/lib/receipts';
import { ars } from '@/lib/money';
import { dateWarning, guessDirection, tripTimestamp, type ReceiptData } from '@/lib/trip';
import { MoneyField } from './ui';
import { ReceiptControl } from './receipt-control';

type Uber = { expense_id: string | null; label: string; amount_cents: number; paid_cents: number; receipt_path: string | null; loaded_by_cm?: boolean | null };
type Event = { id: string; startsAt: string; endsAt?: string | null; address?: string };

/**
 * Los Ubers de la CM en una fiesta: los ve con su comprobante y puede cargar uno nuevo.
 * Al elegir el comprobante, la IA lee el monto, el recorrido y los horarios, y propone si es
 * de ida o de vuelta; ella revisa y confirma. A Dafne le llega un aviso.
 */
export function CmUbers({ event, ubers, canAdd, preview, onChange }: {
  event: Event; ubers: Uber[]; canAdd: boolean; preview: boolean; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'ida' | 'vuelta'>('ida');
  const [amount, setAmount] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [read, setRead] = useState<ReceiptData | null>(null);
  const [note, setNote] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setOpen(false); setDirection('ida'); setAmount(0); setFile(null); setRead(null); setNote(''); setError(''); };

  const pick = async (picked?: File) => {
    if (!picked) return;
    setFile(picked); setRead(null); setNote(''); setError(''); setScanning(true);
    try {
      const small = await shrink(picked);
      const body = new FormData(); body.append('file', new File([small], picked.name, { type: small.type || picked.type }));
      const res = await fetch('/api/receipt-scan', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNote(`${data.error || 'No se pudo leer el recibo.'} Completá los datos a mano.`); return; }
      const r = data as ReceiptData;
      if (!r.isTripReceipt) { setNote('No parece un recibo de viaje. Revisá el archivo o completá los datos a mano.'); return; }
      setRead(r);
      if (r.totalCents) setAmount(r.totalCents);
      const guess = guessDirection(r, { startsAt: event.startsAt, endsAt: event.endsAt ?? undefined }, event.address);
      if (guess.direction) setDirection(guess.direction);
      setNote([guess.direction ? null : guess.reason, dateWarning(r, event.startsAt)].filter(Boolean).join(' '));
    } catch {
      setNote('No se pudo leer el recibo. Completá los datos a mano.');
    } finally { setScanning(false); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(amount > 0)) { setError('Poné cuánto pagaste.'); return; }
    if (!file) { setError('Adjuntá la captura o el PDF del viaje.'); return; }
    setBusy(true); setError('');
    const supabase = supabaseBrowser();
    const { data, error: addError }: { data: unknown; error: { message?: string } | null } = await supabase.rpc('cm_add_uber', {
      p_coverage: event.id, p_direction: direction, p_amount_cents: amount,
      p_trip_from: read?.origin ?? null, p_trip_to: read?.destination ?? null,
      p_trip_started_at: read?.pickupTime ? tripTimestamp(event.startsAt, read.pickupTime, read.date) : null,
      p_trip_ended_at: read?.dropoffTime ? tripTimestamp(event.startsAt, read.dropoffTime, read.date) : null,
    });
    if (addError || typeof data !== 'string') { setBusy(false); setError(addError?.message || 'No se pudo cargar. Revisá la conexión.'); return; }
    try {
      await attachReceipt(supabase, data, file);
      toast.success('Uber cargado. Le avisamos a Dafne.');
    } catch (err) {
      toast.error(`El Uber se cargó, pero el recibo no: ${err instanceof Error ? err.message : 'probá adjuntarlo de nuevo.'}`);
    }
    setBusy(false); reset(); onChange();
  };

  if (!ubers.length && !canAdd) return null;
  const trip = read && [read.origin && read.destination ? `${read.origin} → ${read.destination}` : null, read.pickupTime ? `${read.pickupTime}${read.dropoffTime ? ` a ${read.dropoffTime}` : ''}` : null].filter(Boolean).join(' · ');
  return <div className="cm-ubers">
    <p className="text-sm font-bold">Tus Ubers de esta fiesta</p>
    {ubers.length > 0 && <ul className="mt-2 space-y-2">{ubers.map(u => { const owed = u.amount_cents - u.paid_cents; return <li key={u.expense_id ?? u.label} className="cm-uber-row">
      <span className="min-w-0 flex-1"><span className="block font-semibold">{u.label.replace(/^Reintegro: /, '')}</span><span className="muted text-sm">{ars(u.amount_cents)} · {owed > 0 ? `te deben ${ars(owed)}` : 'pagado'}</span></span>
      {u.expense_id && <ReceiptControl expenseId={u.expense_id} path={u.receipt_path} onChange={() => onChange()} disabledReason={preview ? 'Solo para mirar.' : undefined} cm={{ paid: u.paid_cents > 0, loadedByCm: !!u.loaded_by_cm }}/>}
    </li>; })}</ul>}
    {canAdd && !open && <button type="button" className="btn btn-secondary mt-3" disabled={preview} onClick={() => setOpen(true)}><Car size={17}/> Cargar un Uber</button>}
    {canAdd && open && <form className="cm-uber-form mt-3 space-y-3" onSubmit={e => void save(e)}>
      <div><span className="label">Recibo del viaje</span>
        <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/>
        <button type="button" className="btn btn-secondary w-full justify-start" disabled={scanning} onClick={() => input.current?.click()}><Paperclip size={16}/><span className="truncate">{file ? file.name : 'Elegir captura o PDF del viaje'}</span></button>
        {!file && <p className="muted mt-2 text-sm">Lo leemos y completamos los datos por vos.</p>}
      </div>
      {scanning && <p className="cm-uber-ai" role="status"><Sparkles size={16} aria-hidden="true"/> Leyendo el recibo…</p>}
      {read && <p className="cm-uber-ai"><Sparkles size={16} aria-hidden="true"/><span>Leído con IA{trip ? `: ${trip}` : ''}. Revisá que esté bien.</span></p>}
      {note && <p className="weather-tip text-sm" role="status">{note}</p>}
      <div className="coverage-view-switch" role="group" aria-label="¿De ida o de vuelta?">{(['ida', 'vuelta'] as const).map(v => <button key={v} type="button" aria-pressed={direction === v} className={direction === v ? 'selected' : ''} onClick={() => setDirection(v)}>{v === 'ida' ? 'De ida' : 'De vuelta'}</button>)}</div>
      <MoneyField label="Lo que pagaste" value={amount} onChange={setAmount} placeholder="Ej. 13.500"/>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy || scanning}>{busy ? 'Cargando…' : 'Cargar Uber'}</button><button type="button" className="btn btn-quiet" disabled={busy} onClick={reset}>Cancelar</button></div>
      <p className="muted text-xs">Si te equivocás en algo, avisale a Dafne y lo corrige ella.</p>
    </form>}
  </div>;
}
