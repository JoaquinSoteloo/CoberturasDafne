'use client';
import { useEffect, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from './store';
import { Modal, flash } from './ui';
import { MpTransfer } from './mp-transfer';
import { supabaseBrowser } from '@/lib/supabase/client';
import { attachReceipt } from '@/lib/receipts';
import { conceptPaid, expenseIsPaid } from '@/lib/domain';
import { dayKey } from '@/lib/calendar';
import { newId } from '@/lib/repository';
import { ars } from '@/lib/money';

/**
 * "Marcar pagado" de un Uber de una CM: pide el comprobante de la transferencia (o que fue en
 * efectivo), registra el pago a la CM y le adjunta el comprobante. La CM lo ve en "Mis pagos".
 * Queda montado aunque el Uber ya esté pago, para terminar de adjuntar el archivo.
 */
export function PayUber({ coverageId, expenseId }: { coverageId: string; expenseId: string }) {
  const { db, update, saveState } = useStore();
  const coverage = db.coverages.find(c => c.id === coverageId);
  const expense = coverage?.expenses.find(e => e.id === expenseId);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ paymentId: string; file: File; sawSaving: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // El comprobante se adjunta cuando el pago ya está guardado en la base.
  useEffect(() => {
    if (!pending) return;
    if (saveState !== 'saved') { if (!pending.sawSaving) setPending({ ...pending, sawSaving: true }); return; }
    if (!pending.sawSaving) return;
    const job = pending; setPending(null);
    attachReceipt(supabaseBrowser(), job.paymentId, job.file, null, 'payment')
      .then(path => update(db => ({ ...db, cmPayments: db.cmPayments.map(p => p.id === job.paymentId ? { ...p, receiptPath: path } : p) })))
      .catch(() => toast.error('El pago se registró, pero no se pudo adjuntar el comprobante. Adjuntalo desde Pagos → Pagos registrados.'));
  }, [pending, saveState, update]);

  if (!coverage || !expense) return null;
  const paid = expenseIsPaid(db, expense);
  const cm = expense.advancedBy === 'cm' ? db.cms.find(x => x.id === expense.advancedCmId) : undefined;
  const remainder = Math.max(0, expense.amountCents - conceptPaid(db, `expense:${expense.id}`));
  if (paid) return null;

  const pay = (withFile: File | null, cash = false) => {
    if (!withFile && cm && !cash) { setError('Subí el comprobante de la transferencia, o marcá que fue en efectivo.'); return; }
    const paymentId = newId();
    update(db => ({
      ...db,
      coverages: db.coverages.map(x => x.id === coverageId ? { ...x, expenses: x.expenses.map(e => e.id === expenseId ? { ...e, paymentStatus: 'pagado' as const } : e) } : x),
      cmPayments: cm && remainder > 0 ? [...db.cmPayments, { id: paymentId, cmId: cm.id, date: dayKey(new Date()), allocations: [{ conceptId: `expense:${expenseId}`, amountCents: remainder }], notes: withFile ? 'Pago de Uber' : 'Pago de Uber en efectivo' }] : db.cmPayments,
    }));
    if (withFile && cm && remainder > 0) setPending({ paymentId, file: withFile, sawSaving: false });
    setOpen(false); setFile(null); setError(''); flash();
    toast.success(withFile ? 'Uber pagado, con su comprobante' : 'Uber marcado como pagado');
  };

  // Un Uber que no es de una CM (viejo) no tiene a quién pagarle: se marca y listo.
  if (!cm) return <button className="btn btn-secondary btn-small" onClick={() => pay(null, true)}>Marcar pagado</button>;

  return <>
    <button className="btn btn-secondary btn-small" onClick={() => setOpen(true)}>Marcar pagado</button>
    {open && <Modal title={`Pagarle el Uber a ${cm.name.split(' ')[0]}`} onClose={() => { setOpen(false); setError(''); }}>
      <div className="space-y-4">
        <p><strong>{expense.label}</strong> · {coverage.name}<br/><span className="text-lg font-bold">{ars(remainder)}</span></p>
        <MpTransfer name={cm.name} alias={cm.alias} amountCents={remainder}/>
        <div><span className="label">Comprobante de la transferencia</span>
          <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); e.target.value = ''; }}/>
          <button type="button" className="btn btn-secondary w-full justify-start" onClick={() => input.current?.click()}><Paperclip size={16}/><span className="truncate">{file ? file.name : 'Subir captura o PDF de la transferencia'}</span></button>
          <p className="muted mt-2 text-sm">{cm.name.split(' ')[0]} lo ve en sus pagos.</p>
        </div>
        {error && <p role="alert" className="field-error">{error}</p>}
        <button className="btn btn-primary w-full" onClick={() => pay(file)} disabled={!file}>Confirmar pago</button>
        <button type="button" className="text-link w-full text-center text-sm" onClick={() => { if (confirm('¿Lo pagaste en efectivo? Se marca como pagado sin comprobante.')) pay(null, true); }}>Lo pagué en efectivo (sin comprobante)</button>
      </div>
    </Modal>}
  </>;
}
