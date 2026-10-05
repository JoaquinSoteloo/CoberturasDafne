'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from './store';
import { flash } from './ui';
import { supabaseBrowser } from '@/lib/supabase/client';
import { attachReceipt, shrink } from '@/lib/receipts';
import type { TransferData, TransferHint } from '@/lib/transfer';
import { decideFor, movementFor, withMovement } from '@/lib/intake';
import { handOffTransfer } from '@/lib/transfer-handoff';
import { ars, dateLabel } from '@/lib/money';
import { newId } from '@/lib/repository';
import type { Db } from '@/lib/types';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Comprobantes de lo que la IA registró, esperando a que el cobro o el pago se guarde para adjuntarlos.
type Job = { target: 'payment' | 'collection'; id: string; file: File; sawSaving: boolean };
let jobs: Job[] = [];
const listeners = new Set<() => void>();
const queue = (job: Omit<Job, 'sawSaving'>) => { jobs = [...jobs, { ...job, sawSaving: false }]; listeners.forEach(l => l()); };

/**
 * Montado una vez en la app de Dafne: cuando lo que registró la IA ya se guardó, le adjunta su
 * comprobante. Si se deshizo antes de guardarse, el comprobante se descarta.
 */
export function ReceiptAttacher() {
  const { db, saveState, update } = useStore();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { listeners.add(refresh); return () => { listeners.delete(refresh); }; }, []);
  useEffect(() => {
    if (!jobs.length) return;
    if (saveState !== 'saved') { if (jobs.some(j => !j.sawSaving)) jobs = jobs.map(j => ({ ...j, sawSaving: true })); return; }
    const ready = jobs.filter(j => j.sawSaving); if (!ready.length) return;
    jobs = jobs.filter(j => !j.sawSaving);
    for (const job of ready) {
      const exists = job.target === 'payment' ? db.cmPayments.some(x => x.id === job.id) : db.collections.some(x => x.id === job.id);
      if (!exists) continue;
      attachReceipt(supabaseBrowser(), job.id, job.file, null, job.target)
        .then(path => update(db => job.target === 'payment'
          ? { ...db, cmPayments: db.cmPayments.map(x => x.id === job.id ? { ...x, receiptPath: path } : x) }
          : { ...db, collections: db.collections.map(x => x.id === job.id ? { ...x, receiptPath: path } : x) }))
        .catch(() => toast.error('Se registró, pero no se pudo adjuntar el comprobante. Adjuntalo desde el historial de Pagos.'));
    }
  }, [saveState, db, update]);
  return null;
}

async function scan(file: File): Promise<TransferData> {
  const small = await shrink(file);
  const body = new FormData(); body.append('file', new File([small], file.name, { type: small.type || file.type }));
  const res = await fetch('/api/transfer-scan', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo leer el comprobante.');
  if (!(data as TransferData).isTransfer) throw new Error('No parece el comprobante de una transferencia.');
  return data as TransferData;
}

/**
 * Cargar comprobantes de transferencias: la IA los lee y, si no hay dudas (a quién, de qué fiesta
 * y el importe justo), los registra solos con unos segundos para deshacer. Si hay dudas, abre Pagos
 * con el cobro o el pago ya completo para revisarlo. Devuelve cuántos quedaron registrados.
 */
export function useReceiptIntake() {
  const { db, update, undoable, email } = useStore();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const latest = useRef<Db>(db); latest.current = db;

  const process = async (files: File[], hint?: TransferHint) => {
    if (!files.length) return 0;
    setBusy(true);
    const loading = toast.loading(files.length > 1 ? `Leyendo ${files.length} comprobantes…` : 'Leyendo el comprobante…');
    let done = 0; let sentToReview = false;
    try {
      for (const file of files) {
        let r: TransferData;
        try { r = await scan(file); } catch (e) { toast.error(`${file.name}: ${e instanceof Error ? e.message : 'no se pudo leer.'}`); continue; }
        const db = latest.current;
        const d = decideFor(db, r, email, hint);
        // No se pudo registrar solo: se abre en Pagos para revisarlo (uno por vez).
        const read = r;
        const toReview = () => {
          if (sentToReview) { toast.message(`${file.name}: no lo pude registrar solo. Cargalo de nuevo cuando termines con el anterior.`); return; }
          sentToReview = true;
          handOffTransfer(file, read, hint);
          router.push(`/pagos?comprobante=${Date.now()}`);
        };
        if (d.action === 'attach') {
          try {
            const target = d.kind === 'cobro' ? 'collection' : 'payment';
            const path = await attachReceipt(supabaseBrowser(), d.id, file, null, target);
            update(db => target === 'payment' ? { ...db, cmPayments: db.cmPayments.map(x => x.id === d.id ? { ...x, receiptPath: path } : x) } : { ...db, collections: db.collections.map(x => x.id === d.id ? { ...x, receiptPath: path } : x) });
            const m = d.kind === 'cobro' ? db.collections.find(x => x.id === d.id) : db.cmPayments.find(x => x.id === d.id);
            toast.success(`Comprobante adjuntado al ${d.kind} de ${ars(r.amountCents ?? 0)}${m ? ` del ${dateLabel(m.date)}` : ''}.`);
            done++;
          } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo adjuntar el comprobante.'); }
          continue;
        }
        const id = newId(); const m = movementFor(db, d, r, id, today());
        if (!m) { toReview(); continue; }
        undoable(m.message, db => withMovement(db, m), db => m.kind === 'pago' ? { ...db, cmPayments: db.cmPayments.filter(x => x.id !== id) } : { ...db, collections: db.collections.filter(x => x.id !== id) });
        queue({ target: m.kind === 'pago' ? 'payment' : 'collection', id, file }); flash(); done++;
      }
    } finally { toast.dismiss(loading); setBusy(false); }
    return done;
  };
  return { process, busy };
}

/** Botón para elegir uno o varios comprobantes y que la IA se encargue. */
export function ReceiptIntakeButton({ hint, label = 'Cargar comprobante', className = 'btn btn-secondary', icon = <Receipt size={16}/>, multiple = true, onDone }: {
  hint?: TransferHint; label?: string; className?: string; icon?: React.ReactNode; multiple?: boolean; onDone?: (registered: number) => void;
}) {
  const { process, busy } = useReceiptIntake();
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input ref={input} type="file" accept="image/*,application/pdf" multiple={multiple} hidden onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; void process(files, hint).then(n => onDone?.(n)); }}/>
    <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>{icon}{busy ? 'Leyendo…' : label}</button>
  </>;
}
