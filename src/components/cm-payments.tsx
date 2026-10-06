'use client';
import { useState } from 'react';
import { ChevronDown, CircleCheck, FileCheck2 } from 'lucide-react';
import { dayKey } from '@/lib/calendar';
import { cmSummary } from '@/lib/cm-summary';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { openReceipt } from '@/lib/receipts';
import { ars, dateLabel } from '@/lib/money';
import { tripSummary } from '@/lib/trip';
import { cap, shortDay } from './ui';
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
      <span className="min-w-0 flex-1"><span className="block font-semibold">{c.kind === 'fee' ? 'Cobertura' : c.label.replace(/^Reintegro: /, '')}</span>{trip && <span className="muted block text-sm">{trip}</span>}</span>
      <span className="text-right"><span className="block font-bold tabular-nums">{ars(c.amount_cents)}</span>{status}</span>
    </div>
    {(c.kind === 'expense' || proofs.length > 0) && <div className="pay-docs">
      {c.kind === 'expense' && c.expense_id && <span className="pay-doc"><span className="pay-doc-title">Recibo del viaje</span><ReceiptControl expenseId={c.expense_id} path={c.receipt_path} onChange={onChange} disabledReason={preview ? 'Solo para mirar.' : undefined} cm={{ paid: c.paid_cents > 0, loadedByCm: !!c.loaded_by_cm }}/></span>}
      {proofs.length > 0 && <span className="pay-doc"><span className="pay-doc-title">Pago de Dafne</span><span className="flex flex-wrap gap-2">{proofs.map((p, i) => <PaymentProof key={i} line={p} many={proofs.length > 1}/>)}</span></span>}
    </div>}
  </li>;
}

/**
 * Pagos de la CM: arriba lo que le deben (de fiestas que ya hizo) y de qué es; lo que ganó en el
 * mes y en el año; y cada fiesta en una línea con "Cobrado" o "Te deben". Al tocarla, el detalle
 * con los comprobantes: el recibo del viaje (lo sube ella) y la transferencia de Dafne.
 */
export function CmPayments({ concepts, preview, onChange }: { concepts: MoneyConcept[]; preview: boolean; onChange: () => void }) {
  const today = dayKey(new Date());
  const s = cmSummary(concepts, today);
  const done = (c: MoneyConcept) => c.starts_at.slice(0, 10) <= today;
  const parties = [...new Set(concepts.map(c => c.coverage_id))].map(id => {
    const lines = concepts.filter(c => c.coverage_id === id).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'fee' ? -1 : 1));
    const total = sum(lines, c => c.amount_cents), paid = sum(lines, c => Math.min(c.paid_cents, c.amount_cents));
    return { id, lines, first: lines[0], total, owed: total - paid };
  }).sort((a, b) => b.first.starts_at.localeCompare(a.first.starts_at));
  const owing = parties.filter(p => p.owed > 0 && done(p.first)).reverse();
  const later = parties.filter(p => !done(p.first)).reverse();
  const month = today.slice(0, 7);
  const earnedMonth = sum(concepts.filter(c => c.kind === 'fee' && done(c) && c.starts_at.startsWith(month)), c => c.amount_cents);
  const months = [...new Set(parties.filter(p => done(p.first)).map(p => p.first.starts_at.slice(0, 7)))];
  const owedText = (p: (typeof parties)[number]) => p.lines.filter(c => c.amount_cents > c.paid_cents).map(c => `${c.kind === 'fee' ? 'cobertura' : 'Uber'} ${ars(c.amount_cents - c.paid_cents)}`).join(' + ');

  return <section className="space-y-6" aria-label="Mis pagos">
    <div className="pay-balance">
      {s.owed > 0 ? <><p className="pay-balance-label">Te deben</p><p className="pay-balance-value is-due">{ars(s.owed)}</p></>
        : <p className="pay-balance-clear"><CircleCheck size={22} aria-hidden="true"/> Estás al día</p>}
      {owing.length > 0 && <ul className="cm-owing">{owing.map(p => <li key={p.id}><span className="min-w-0 flex-1 truncate">{p.first.coverage_name}</span><span className="shrink-0">{owedText(p)}</span></li>)}</ul>}
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="card px-4 py-3"><p className="muted text-sm">Ganaste en {monthTitle(month).split(' ')[0].toLowerCase()}</p><p className="cm-earned">{ars(earnedMonth)}</p></div>
      <div className="card px-4 py-3"><p className="muted text-sm">En {s.year}</p><p className="cm-earned">{ars(s.earned)}</p></div>
    </div>
    {later.length > 0 && <p className="muted -mt-2 px-1 text-sm">Más adelante: {later.map(p => `${p.first.coverage_name} ${ars(p.total)}`).join(' · ')}</p>}

    {months.length > 0 ? <div className="space-y-5">{months.map(m => <section key={m} aria-label={monthTitle(m)}>
      <h2 className="pay-section-title">{monthTitle(m)}</h2>
      <ul className="card pay-list">{parties.filter(p => done(p.first) && p.first.starts_at.startsWith(m)).map(p => { const day = shortDay(p.first.starts_at);
        return <li key={p.id}><details className="cm-party">
          <summary className="pay-row"><span className="ledger-date"><strong>{day.day}</strong>{day.month}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-bold">{p.first.coverage_name}</span><span className="muted block truncate text-sm">{p.lines.map(c => c.kind === 'fee' ? 'Cobertura' : 'Uber').join(' + ')} · {ars(p.total)}</span></span>
            {p.owed <= 0 ? <span className="badge badge-success">Cobrado</span> : <span className="badge badge-warn">{p.owed < p.total ? `Faltan ${ars(p.owed)}` : 'Te deben'}</span>}
            <ChevronDown size={18} className="pay-party-chevron shrink-0" aria-hidden="true"/></summary>
          <ul className="space-y-2 pb-3">{p.lines.map(c => <Line key={`${c.kind}-${c.expense_id ?? c.coverage_id}`} c={c} preview={preview} onChange={onChange}/>)}</ul>
        </details></li>; })}</ul>
    </section>)}</div> : <p className="muted text-center">Cuando hagas tu primera fiesta, acá vas a ver lo que cobrás.</p>}
    <p className="muted text-xs">Los Ubers son viáticos que cubre la empresa: no suman a lo que ganaste.</p>
  </section>;
}
