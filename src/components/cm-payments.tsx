'use client';
import { useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { openReceipt } from '@/lib/receipts';
import { ars, dateLabel } from '@/lib/money';
import { tripSummary } from '@/lib/trip';
import { Meter, cap, shortDay } from './ui';
import { ReceiptControl } from './receipt-control';

export type PaymentLine = { date: string; amount_cents: number; receipt_path: string | null };
export type MoneyConcept = {
  coverage_id: string; coverage_name: string; starts_at: string; kind: 'fee' | 'expense'; label: string;
  amount_cents: number; paid_cents: number; expense_id: string | null; receipt_path: string | null; loaded_by_cm?: boolean | null;
  payments?: PaymentLine[]; trip_from: string | null; trip_to: string | null; trip_started_at: string | null; trip_ended_at: string | null;
};

const owedOf = (c: MoneyConcept) => Math.max(0, c.amount_cents - c.paid_cents);
const sum = (xs: MoneyConcept[], f: (c: MoneyConcept) => number) => xs.reduce((s, c) => s + f(c), 0);
const monthTitle = (m: string) => cap(new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(`${m}-01T12:00`)));

/** Abrir el comprobante de la transferencia de Dafne. */
function PaymentProof({ line, many }: { line: PaymentLine; many: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!line.receipt_path) return null;
  const open = async () => {
    setBusy(true);
    try { await openReceipt(supabaseBrowser(), line.receipt_path!); } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo abrir el comprobante.'); }
    finally { setBusy(false); }
  };
  return <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => void open()}><FileCheck2 size={15}/>{busy ? 'Abriendo…' : many ? `Comprobante de pago ${dateLabel(line.date)}` : 'Comprobante de pago'}</button>;
}

function Line({ c, preview, onChange }: { c: MoneyConcept; preview: boolean; onChange: () => void }) {
  const owed = owedOf(c);
  const status = owed <= 0 ? <span className="badge badge-success">Pagado</span>
    : c.paid_cents > 0 ? <span className="badge badge-warn">Te deben {ars(owed)}</span> : <span className="badge badge-warn">A cobrar</span>;
  const proofs = (c.payments ?? []).filter(p => p.receipt_path);
  const trip = c.kind === 'expense' ? tripSummary({ tripFrom: c.trip_from ?? undefined, tripTo: c.trip_to ?? undefined, tripStartedAt: c.trip_started_at ?? undefined, tripEndedAt: c.trip_ended_at ?? undefined }) : '';
  return <li className="pay-line">
    <div className="flex items-start gap-3">
      <span className="min-w-0 flex-1"><span className="block font-semibold">{c.kind === 'fee' ? 'Honorario' : c.label.replace(/^Reintegro: /, '')}</span>{trip && <span className="muted block text-sm">{trip}</span>}</span>
      <span className="text-right"><span className="block font-bold tabular-nums">{ars(c.amount_cents)}</span>{status}</span>
    </div>
    {(c.kind === 'expense' || proofs.length > 0) && <div className="pay-docs">
      {c.kind === 'expense' && c.expense_id && <span className="pay-doc"><span className="pay-doc-title">Recibo del viaje</span><ReceiptControl expenseId={c.expense_id} path={c.receipt_path} onChange={onChange} disabledReason={preview ? 'Solo para mirar.' : undefined} cm={{ paid: c.paid_cents > 0, loadedByCm: !!c.loaded_by_cm }}/></span>}
      {proofs.length > 0 && <span className="pay-doc"><span className="pay-doc-title">Pago de Dafne</span><span className="flex flex-wrap gap-2">{proofs.map((p, i) => <PaymentProof key={i} line={p} many={proofs.length > 1}/>)}</span></span>}
    </div>}
  </li>;
}

/**
 * "Mis pagos" de la CM, todo junto: arriba lo que le falta cobrar (coberturas y Ubers) y después
 * cada mes con lo que trabajó. En cada fiesta, cuánto cobró y cuánto le falta, y los comprobantes:
 * el recibo del viaje (lo sube ella) y la transferencia de Dafne (cuando le pagó).
 */
export function CmPayments({ concepts, preview, onChange }: { concepts: MoneyConcept[]; preview: boolean; onChange: () => void }) {
  const fees = concepts.filter(c => c.kind === 'fee'), ubers = concepts.filter(c => c.kind === 'expense');
  const owedFees = sum(fees, owedOf), owedUbers = sum(ubers, owedOf), owed = owedFees + owedUbers;
  const months = [...new Set(concepts.map(c => c.starts_at.slice(0, 7)))].sort().reverse();
  const year = new Date().getFullYear().toString();
  const yearFees = sum(fees.filter(c => c.starts_at.startsWith(year)), c => c.amount_cents);

  return <section className="space-y-6" aria-label="Mis pagos">
    <div className="ledger-card card"><div className="ledger-head"><div className="w-full"><h2 className="section-title">{owed > 0 ? 'Te falta cobrar' : 'Estás al día'}</h2>
      {owed > 0 && <dl className="owed-split"><div><dt>Coberturas</dt><dd>{ars(owedFees)}</dd></div><div><dt>Ubers</dt><dd>{ars(owedUbers)}</dd></div><div className="owed-total"><dt>Total</dt><dd>{ars(owed)}</dd></div></dl>}
      <p className="muted mt-3 text-sm">En {year} llevás {ars(yearFees)} en honorarios. Los Ubers no cuentan como ganancia: es plata que pusiste vos.</p>
    </div></div></div>

    {!months.length && <p className="muted">Todavía no tenés fiestas con honorarios cargados.</p>}
    {months.map(m => {
      const items = concepts.filter(c => c.starts_at.startsWith(m));
      const parties = [...new Set(items.map(c => c.coverage_id))];
      const total = sum(items, c => c.amount_cents), paid = sum(items, c => Math.min(c.paid_cents, c.amount_cents));
      const earned = sum(items.filter(c => c.kind === 'fee'), c => c.amount_cents);
      return <section key={m} className="pay-month" aria-label={monthTitle(m)}>
        <div className="pay-month-head">
          <h2 className="section-title">{monthTitle(m)}</h2>
          <p className="muted text-sm">{parties.length === 1 ? '1 fiesta' : `${parties.length} fiestas`} · ganaste {ars(earned)}</p>
          <Meter done={paid} total={total} label={`Cobraste ${ars(paid)} de ${ars(total)}`}/>
          <p className="muted text-sm">Cobraste {ars(paid)} de {ars(total)}{total > paid ? ` · te falta ${ars(total - paid)}` : ''}</p>
        </div>
        <div className="space-y-3">{parties.map(id => {
          const lines = items.filter(c => c.coverage_id === id).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'fee' ? -1 : 1));
          const first = lines[0]; const day = shortDay(first.starts_at);
          const t = sum(lines, c => c.amount_cents), p = sum(lines, c => Math.min(c.paid_cents, c.amount_cents));
          return <article key={id} className="card pay-party">
            <div className="flex items-center gap-3"><span className="ledger-date"><strong>{day.day}</strong>{day.month}</span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{first.coverage_name}</span><span className="muted text-sm">{p >= t ? 'Cobrado completo' : `Cobraste ${ars(p)} de ${ars(t)}`}</span></span></div>
            <Meter done={p} total={t} label={`Cobraste ${ars(p)} de ${ars(t)}`}/>
            <ul className="space-y-2">{lines.map(c => <Line key={`${c.kind}-${c.expense_id ?? c.coverage_id}`} c={c} preview={preview} onChange={onChange}/>)}</ul>
          </article>;
        })}</div>
      </section>;
    })}
  </section>;
}
