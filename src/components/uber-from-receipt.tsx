'use client';
import { useEffect, useRef, useState } from 'react';
import { ScanLine, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from './store';
import { Modal, MoneyField } from './ui';
import { supabaseBrowser } from '@/lib/supabase/client';
import { attachReceipt, shrink } from '@/lib/receipts';
import { dateWarning, guessDirection, tripTimestamp, type ReceiptData } from '@/lib/trip';
import { newId } from '@/lib/repository';
import type { Coverage, Expense } from '@/lib/types';

type Draft = { direction: 'ida' | 'vuelta' | null; amountCents: number; payer: string; absorbedBy: Expense['absorbedBy']; from: string; to: string; start: string; end: string };

/** "Cargar Uber desde comprobante": la IA lee la captura, Dafne revisa y confirma, y se crea el gasto con el comprobante. */
export function UberFromReceipt({ coverage }: { coverage: Coverage }) {
  const { db, update, saveState } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [preview, setPreview] = useState('');
  const [read, setRead] = useState<ReceiptData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  // Gasto ya creado que espera a estar guardado para adjuntarle el archivo.
  // "saving" se marca al ver empezar el guardado del gasto nuevo: recién cuando termina existe en la base.
  const [pending, setPending] = useState<{ expenseId: string; file: File; sawSaving: boolean } | null>(null);

  const salon = db.salons.find(s => s.id === coverage.salonId);
  const guess = read ? guessDirection(read, coverage, coverage.address || salon?.address) : null;
  const warning = read ? dateWarning(read, coverage.startsAt) : null;
  const cms = coverage.assignments.filter(a => a.confirmation !== 'rechazada').map(a => db.cms.find(cm => cm.id === a.cmId)).filter(Boolean) as { id: string; name: string }[];
  // Cada Uber es de quien fue: una CM (Dafne se lo devuelve) o Dafne si marcó "Voy yo". Si fue una sola persona, queda a su nombre.
  const defaultPayer = cms.length === 1 && !coverage.dafneGoes ? cms[0].id : !cms.length && coverage.dafneGoes ? 'vos' : '';

  const pick = async (picked?: File) => {
    if (!picked) return;
    setReading(true); setError('');
    try {
      const small = await shrink(picked);
      const body = new FormData();
      body.append('file', small, picked.name);
      const response = await fetch('/api/receipt-scan', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo leer el recibo.');
      const result = data as ReceiptData;
      const direction = guessDirection(result, coverage, coverage.address || salon?.address).direction;
      setFile({ blob: small, name: picked.name });
      setPreview(small.type.startsWith('image/') ? URL.createObjectURL(small) : '');
      setRead(result);
      setDraft({ direction, amountCents: result.totalCents ?? 0, payer: defaultPayer, absorbedBy: 'coordinadora',
        from: result.origin ?? '', to: result.destination ?? '', start: result.pickupTime ?? '', end: result.dropoffTime ?? '' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el recibo.');
    } finally { setReading(false); }
  };

  const close = () => { if (preview) URL.revokeObjectURL(preview); setRead(null); setDraft(null); setFile(null); setPreview(''); setError(''); };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !file) return;
    if (!draft.direction) { setError('Elegí si es el Uber de ida o el de vuelta.'); return; }
    if (draft.amountCents <= 0) { setError('Revisá el importe: tiene que ser mayor a cero.'); return; }
    if (!draft.payer) { setError(cms.length || coverage.dafneGoes ? 'Elegí de quién es el Uber.' : 'Asigná la CM (o marcá "Voy yo") antes de cargar el Uber.'); return; }
    const expense: Expense = {
      id: newId(), label: draft.direction === 'ida' ? 'Uber de ida' : 'Uber de vuelta', kind: 'uber', amountCents: draft.amountCents,
      absorbedBy: draft.absorbedBy,
      tripFrom: draft.from.trim() || undefined, tripTo: draft.to.trim() || undefined,
      // Con la fecha del comprobante si se leyó; si no, la de la fiesta (o la madrugada siguiente).
      tripStartedAt: draft.start ? tripTimestamp(coverage.startsAt, draft.start, read?.date) : undefined,
      tripEndedAt: draft.end ? tripTimestamp(coverage.startsAt, draft.end, read?.date) : undefined,
      // Si el Uber es de Dafne (cubrió ella la fiesta), es gasto suyo y ya está pago.
      ...(draft.payer === 'vos' ? { advancedBy: 'coordinadora' as const, paymentStatus: 'pagado' as const } : { advancedBy: 'cm' as const, advancedCmId: draft.payer })
    };
    update(db => ({ ...db, coverages: db.coverages.map(c => c.id === coverage.id ? { ...c, expenses: [...c.expenses, expense] } : c) }));
    setPending({ expenseId: expense.id, file: new File([file.blob], file.name || 'comprobante', { type: file.blob.type }), sawSaving: false });
    toast.success(`${expense.label} cargado`);
    close();
  };

  // El comprobante solo se puede adjuntar cuando el gasto ya existe en la base.
  useEffect(() => {
    if (!pending) return;
    if (saveState !== 'saved') { if (!pending.sawSaving) setPending({ ...pending, sawSaving: true }); return; }
    if (!pending.sawSaving) return;
    const job = pending; setPending(null);
    attachReceipt(supabaseBrowser(), job.expenseId, job.file)
      .then(path => update(db => ({ ...db, coverages: db.coverages.map(c => ({ ...c, expenses: c.expenses.map(x => x.id === job.expenseId ? { ...x, receiptPath: path } : x) })) })))
      .catch(() => toast.error('El Uber se guardó, pero no se pudo adjuntar el recibo. Adjuntalo desde el gasto.'));
  }, [pending, saveState, update]);

  const time = read && [read.pickupTime, read.dropoffTime].filter(Boolean).join(' a ');
  return <>
    <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/>
    <button type="button" className="btn btn-secondary btn-small" disabled={reading || coverage.eventStatus === 'cancelado'} onClick={() => input.current?.click()}>
      <ScanLine size={16}/>{reading ? 'Leyendo recibo…' : 'Cargar Uber desde el recibo'}
    </button>
    {read && draft && <Modal title="Revisá el Uber" onClose={close}>
      <form className="space-y-4" onSubmit={save}>
        <div className="scan-summary">
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local del archivo elegido, no pasa por el optimizador */}
          {preview && <img src={preview} alt="Recibo subido"/>}
          <div className="min-w-0 text-sm">
            <p className="font-bold">Esto leímos del recibo</p>
            <p className="muted">{[read.date && `${read.date.slice(8, 10)}/${read.date.slice(5, 7)}`, time].filter(Boolean).join(', ') || 'Sin fecha ni horario'}</p>
            {(read.origin || read.destination) && <p className="muted">{read.origin ?? '?'} → {read.destination ?? '?'}</p>}
          </div>
        </div>
        {!read.isTripReceipt && <p className="scan-warning"><TriangleAlert size={16}/>No parece un recibo de viaje. Revisá la imagen.</p>}
        {warning && <p className="scan-warning"><TriangleAlert size={16}/>{warning}</p>}
        {read.totalCents === null && <p className="scan-warning"><TriangleAlert size={16}/>No se pudo leer el total: cargalo a mano.</p>}

        <fieldset><legend className="label">¿Es de ida o de vuelta?</legend>
          <div className="coverage-view-switch">{(['ida', 'vuelta'] as const).map(d => <button key={d} type="button" className={draft.direction === d ? 'selected' : ''} aria-pressed={draft.direction === d} onClick={() => setDraft({ ...draft, direction: d })}>Uber de {d}</button>)}</div>
          {guess && <p className="muted mt-2 text-sm">{guess.direction ? `Lo sugerimos porque: ${guess.reason.charAt(0).toLowerCase()}${guess.reason.slice(1)}` : guess.reason}</p>}
        </fieldset>
        <MoneyField label="Importe" value={draft.amountCents} onChange={v => setDraft({ ...draft, amountCents: v })}/>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Desde</span><input className="field" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })}/></label>
          <label className="block"><span className="label">Hasta</span><input className="field" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })}/></label>
          <label className="block"><span className="label">Salida</span><input className="field" type="time" value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })}/></label>
          <label className="block"><span className="label">Llegada</span><input className="field" type="time" value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })}/></label>
        </div>
        <label className="block"><span className="label">¿De quién es?</span>
          <select className="field" value={draft.payer} onChange={e => setDraft({ ...draft, payer: e.target.value })}>
            <option value="">Elegí quién fue</option>
            {coverage.dafneGoes && <option value="vos">Vos (gasto tuyo)</option>}
            {cms.map(cm => <option key={cm.id} value={cm.id}>{cm.name} (se lo devolvés)</option>)}
          </select></label>
        {error && <p role="alert" className="field-error">{error}</p>}
        <button className="btn btn-primary w-full">Guardar Uber</button>
      </form>
    </Modal>}
  </>;
}
