'use client';
import { useEffect, useRef, useState } from 'react';
import { ScanLine, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from './store';
import { Modal, MoneyField } from './ui';
import { supabaseBrowser } from '@/lib/supabase/client';
import { attachReceipt, shrink } from '@/lib/receipts';
import { dateWarning, guessDirection, matchTripCoverage, tripTimestamp, type ReceiptData } from '@/lib/trip';
import { newId } from '@/lib/repository';
import type { Coverage, Db, Expense } from '@/lib/types';

type Draft = { direction: 'ida' | 'vuelta' | null; amountCents: number; payer: string; absorbedBy: Expense['absorbedBy']; from: string; to: string; start: string; end: string };

const addressOf = (db: Db, c: Coverage) => c.address || db.salons.find(s => s.id === c.salonId)?.address || '';
const crewOf = (db: Db, c: Coverage) => c.assignments.filter(a => a.confirmation !== 'rechazada').map(a => db.cms.find(cm => cm.id === a.cmId)).filter(Boolean) as { id: string; name: string }[];
// Cada Uber es de quien fue: una CM (Dafne se lo devuelve) o Dafne si marcó "Voy yo". Si fue una sola persona, queda a su nombre.
const payerFor = (db: Db, c: Coverage) => { const cms = crewOf(db, c); return cms.length === 1 && !c.dafneGoes ? cms[0].id : !cms.length && c.dafneGoes ? 'vos' : ''; };

/**
 * Cargar un Uber desde el recibo: la IA lo lee, Dafne revisa y confirma, y se crea el gasto con el recibo.
 * Con `coverage`, es para esa fiesta. Sin `coverage`, la app detecta de qué fiesta es (por la fecha y
 * la dirección del salón) y lo propone; se puede cambiar.
 */
export function UberFromReceipt({ coverage, label }: { coverage?: Coverage; label?: string }) {
  const { db, update, saveState } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [preview, setPreview] = useState('');
  const [read, setRead] = useState<ReceiptData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [coverageId, setCoverageId] = useState(coverage?.id ?? '');
  const [matched, setMatched] = useState(false);
  const [error, setError] = useState('');
  // Gasto ya creado que espera a estar guardado para adjuntarle el archivo.
  const [pending, setPending] = useState<{ expenseId: string; file: File; sawSaving: boolean } | null>(null);

  const cov = coverage ?? db.coverages.find(c => c.id === coverageId);
  const guess = read && cov ? guessDirection(read, cov, addressOf(db, cov)) : null;
  const warning = read && cov ? dateWarning(read, cov.startsAt) : null;
  const cms = cov ? crewOf(db, cov) : [];
  // Para elegir la fiesta: las no canceladas, las más cercanas a la fecha del recibo primero.
  const options = db.coverages.filter(c => c.eventStatus !== 'cancelado').slice().sort((a, b) => {
    const t = read?.date ? new Date(`${read.date}T12:00`).getTime() : Date.now();
    return Math.abs(new Date(a.startsAt).getTime() - t) - Math.abs(new Date(b.startsAt).getTime() - t);
  });

  const draftFor = (result: ReceiptData, c: Coverage | undefined): Draft => ({
    direction: c ? guessDirection(result, c, addressOf(db, c)).direction : null, amountCents: result.totalCents ?? 0,
    payer: c ? payerFor(db, c) : '', absorbedBy: 'coordinadora',
    from: result.origin ?? '', to: result.destination ?? '', start: result.pickupTime ?? '', end: result.dropoffTime ?? '',
  });

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
      let target = coverage;
      if (!coverage) {
        target = matchTripCoverage(db.coverages.filter(c => c.eventStatus !== 'cancelado').map(c => ({ ...c, address: addressOf(db, c) })), result) ?? undefined;
        setCoverageId(target?.id ?? ''); setMatched(!!target);
      }
      setFile({ blob: small, name: picked.name });
      setPreview(small.type.startsWith('image/') ? URL.createObjectURL(small) : '');
      setRead(result);
      setDraft(draftFor(result, target));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el recibo.');
    } finally { setReading(false); }
  };

  const close = () => { if (preview) URL.revokeObjectURL(preview); setRead(null); setDraft(null); setFile(null); setPreview(''); setError(''); if (!coverage) setCoverageId(''); };

  const changeCoverage = (id: string) => {
    setCoverageId(id); setMatched(false);
    const c = db.coverages.find(x => x.id === id);
    if (read && draft) setDraft({ ...draft, direction: c ? guessDirection(read, c, addressOf(db, c)).direction : draft.direction, payer: c ? payerFor(db, c) : '' });
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !file) return;
    if (!cov) { setError('Elegí de qué fiesta es el Uber.'); return; }
    if (!draft.direction) { setError('Elegí si es el Uber de ida o el de vuelta.'); return; }
    if (draft.amountCents <= 0) { setError('Revisá el importe: tiene que ser mayor a cero.'); return; }
    if (!draft.payer) { setError(cms.length || cov.dafneGoes ? 'Elegí de quién es el Uber.' : 'Esa fiesta no tiene CM asignada (ni "Voy yo"): asignala antes de cargar el Uber.'); return; }
    const expense: Expense = {
      id: newId(), label: draft.direction === 'ida' ? 'Uber de ida' : 'Uber de vuelta', kind: 'uber', amountCents: draft.amountCents,
      absorbedBy: draft.absorbedBy,
      tripFrom: draft.from.trim() || undefined, tripTo: draft.to.trim() || undefined,
      // Con la fecha del recibo si se leyó; si no, la de la fiesta (o la madrugada siguiente).
      tripStartedAt: draft.start ? tripTimestamp(cov.startsAt, draft.start, read?.date) : undefined,
      tripEndedAt: draft.end ? tripTimestamp(cov.startsAt, draft.end, read?.date) : undefined,
      // Si el Uber es de Dafne (cubrió ella la fiesta), es gasto suyo y ya está pago.
      ...(draft.payer === 'vos' ? { advancedBy: 'coordinadora' as const, paymentStatus: 'pagado' as const } : { advancedBy: 'cm' as const, advancedCmId: draft.payer })
    };
    const target = cov.id;
    update(db => ({ ...db, coverages: db.coverages.map(c => c.id === target ? { ...c, expenses: [...c.expenses, expense] } : c) }));
    setPending({ expenseId: expense.id, file: new File([file.blob], file.name || 'recibo', { type: file.blob.type }), sawSaving: false });
    toast.success(`${expense.label} cargado en ${cov.name}`);
    close();
  };

  // El recibo solo se puede adjuntar cuando el gasto ya existe en la base.
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
    <button type="button" className={coverage ? 'btn btn-secondary btn-small' : 'btn btn-secondary'} disabled={reading || coverage?.eventStatus === 'cancelado'} onClick={() => input.current?.click()}>
      <ScanLine size={16}/>{reading ? 'Leyendo recibo…' : label ?? 'Cargar Uber desde el recibo'}
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
        {!coverage && <label className="block"><span className="label">¿De qué fiesta es?</span>
          <select className="field" value={coverageId} onChange={e => changeCoverage(e.target.value)}>
            <option value="">Elegí la fiesta</option>
            {options.map(c => <option key={c.id} value={c.id}>{c.name} · {c.startsAt.slice(8, 10)}/{c.startsAt.slice(5, 7)}</option>)}
          </select>
          <span className="muted mt-2 block text-sm">{matched ? 'La encontramos por la fecha y el recorrido del viaje.' : !coverageId ? 'No encontramos una fiesta para esa fecha: elegila.' : ''}</span></label>}
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
            <option value="">{cov ? 'Elegí quién fue' : 'Primero elegí la fiesta'}</option>
            {cov?.dafneGoes && <option value="vos">Vos (gasto tuyo)</option>}
            {cms.map(cm => <option key={cm.id} value={cm.id}>{cm.name} (se lo devolvés)</option>)}
          </select></label>
        {error && <p role="alert" className="field-error">{error}</p>}
        <button className="btn btn-primary w-full">Guardar Uber</button>
      </form>
    </Modal>}
  </>;
}
