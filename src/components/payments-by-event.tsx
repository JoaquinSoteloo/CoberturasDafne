'use client';
import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, FileCheck2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { openReceipt } from '@/lib/receipts';
import { active, collected, collectionPending, concepts, expectedIncome, paymentTotal } from '@/lib/domain';
import { dayKey, shiftMonth } from '@/lib/calendar';
import { ars, dateLabel } from '@/lib/money';
import type { Db } from '@/lib/types';
import { Meter, cap, shortDay } from './ui';

type Kind = 'cobros' | 'pagos';
const monthTitle = (m: string) => cap(new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(`${m}-01T12:00`)));

function ReceiptButton({ path }: { path?: string }) {
  const [busy, setBusy] = useState(false);
  if (!path) return null;
  return <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await openReceipt(supabaseBrowser(), path); } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo abrir el comprobante.'); }
    finally { setBusy(false); }
  }}><FileCheck2 size={15}/>{busy ? 'Abriendo…' : 'Comprobante'}</button>;
}

/** Cuánto hay que cobrar o pagar de una fiesta y cuánto ya se hizo. */
function totals(db: Db, kind: Kind, coverageId: string) {
  const c = db.coverages.find(x => x.id === coverageId)!;
  if (kind === 'cobros') { const total = expectedIncome(c); return { total, done: Math.min(total, collected(db, c.id)), pending: collectionPending(db, c) }; }
  const items = concepts(db).filter(x => x.coverageId === coverageId);
  const total = items.reduce((s, x) => s + x.amountCents, 0), done = items.reduce((s, x) => s + Math.min(x.paidCents, x.amountCents), 0);
  return { total, done, pending: total - done };
}

/**
 * Cobros o pagos agrupados por fiesta, un mes por vez. Cada fiesta se ve cerrada con su barra y
 * lo que falta; al tocarla, los movimientos (con comprobante y para corregir) y el botón para registrar.
 */
export function PaymentsByEvent({ db, kind, onRegister, onEdit }: {
  db: Db; kind: Kind;
  onRegister: (coverageId: string, cmId?: string) => void;
  onEdit: (m: { kind: 'cobro' | 'pago'; id: string }) => void;
}) {
  const relevant = db.coverages.filter(c => active(c) && totals(db, kind, c.id).total > 0);
  const months = [...new Set(relevant.map(c => c.startsAt.slice(0, 7)))].sort().reverse();
  const thisMonth = dayKey(new Date()).slice(0, 7);
  const [month, setMonth] = useState(() => months.includes(thisMonth) || !months.length ? thisMonth : months[0]);
  const shown = relevant.filter(c => c.startsAt.startsWith(month)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const monthDone = shown.reduce((s, c) => s + totals(db, kind, c.id).done, 0), monthTotal = shown.reduce((s, c) => s + totals(db, kind, c.id).total, 0);
  // Lo que quedó pendiente de otros meses, para no perderlo de vista.
  const elsewhere = relevant.filter(c => !c.startsAt.startsWith(month) && totals(db, kind, c.id).pending > 0).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const verb = kind === 'cobros' ? 'Cobraste' : 'Pagaste';

  return <section className="space-y-4" aria-label={kind === 'cobros' ? 'Cobros por fiesta' : 'Pagos por fiesta'}>
    <div className="pay-month-nav" role="group" aria-label="Mes">
      <button className="btn btn-quiet !px-2" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={20}/></button>
      <h2 className="section-title" aria-live="polite">{monthTitle(month)}</h2>
      <button className="btn btn-quiet !px-2" aria-label="Mes siguiente" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={20}/></button>
    </div>
    {shown.length > 0 && <div className="grid gap-1"><Meter done={monthDone} total={monthTotal} label={`${verb} ${ars(monthDone)} de ${ars(monthTotal)}`}/><p className="muted text-sm">{shown.length === 1 ? '1 fiesta' : `${shown.length} fiestas`} · {verb.toLowerCase()} {ars(monthDone)} de {ars(monthTotal)}{monthTotal > monthDone ? ` · falta ${ars(monthTotal - monthDone)}` : ''}</p></div>}
    {!shown.length && <p className="muted text-center">No hay fiestas {kind === 'cobros' ? 'para cobrar' : 'con pagos al equipo'} en {monthTitle(month).toLowerCase()}.</p>}

    <div className="space-y-3">{shown.map(c => {
      const t = totals(db, kind, c.id); const day = shortDay(c.startsAt); const salon = db.salons.find(s => s.id === c.salonId)?.name;
      return <details key={c.id} className="card pay-party">
        <summary>
          <span className="flex items-center gap-3"><span className="ledger-date"><strong>{day.day}</strong>{day.month}</span>
            <span className="min-w-0 flex-1"><span className="block font-bold leading-tight line-clamp-2">{c.name}</span>{salon && <span className="muted block truncate text-sm">{salon}</span>}</span>
            {t.pending <= 0 ? <span className="badge badge-success">{kind === 'cobros' ? 'Cobrado' : 'Pagado'}</span> : <span className="badge badge-warn">Falta {ars(t.pending)}</span>}
            <ChevronDown size={18} className="pay-party-chevron shrink-0" aria-hidden="true"/></span>
          <span className="grid gap-1"><Meter done={t.done} total={t.total} label={`${verb} ${ars(t.done)} de ${ars(t.total)}`}/><span className="muted text-sm">{verb} {ars(t.done)} de {ars(t.total)}</span></span>
        </summary>
        <div className="mt-3 space-y-3">{kind === 'cobros' ? <CollectionsDetail db={db} coverageId={c.id} pending={t.pending} onRegister={onRegister} onEdit={onEdit}/> : <PaymentsDetail db={db} coverageId={c.id} onRegister={onRegister} onEdit={onEdit}/>}</div>
      </details>;
    })}</div>

    {elsewhere.length > 0 && <div className="pay-elsewhere"><p className="text-sm font-bold">Pendiente de otros meses</p><div className="flex flex-wrap gap-2">{elsewhere.map(c => <button key={c.id} type="button" className="btn btn-secondary btn-small" onClick={() => setMonth(c.startsAt.slice(0, 7))}>{c.name} · {ars(totals(db, kind, c.id).pending)}</button>)}</div></div>}
  </section>;
}

function CollectionsDetail({ db, coverageId, pending, onRegister, onEdit }: { db: Db; coverageId: string; pending: number; onRegister: (id: string) => void; onEdit: (m: { kind: 'cobro'; id: string }) => void }) {
  const rows = db.collections.filter(x => x.coverageId === coverageId).sort((a, b) => a.date.localeCompare(b.date));
  return <>
    {rows.length ? <ul className="space-y-2">{rows.map(r => <li key={r.id} className="pay-line">
      <div className="flex items-start gap-3"><span className="min-w-0 flex-1"><span className="block font-semibold">Cobro del {dateLabel(r.date)}</span>{r.notes && <span className="muted block text-sm">{r.notes}</span>}</span><span className="font-bold tabular-nums">{ars(r.amountCents)}</span></div>
      <div className="flex flex-wrap gap-2"><ReceiptButton path={r.receiptPath}/><button type="button" className="btn btn-quiet btn-small" onClick={() => onEdit({ kind: 'cobro', id: r.id })}><Pencil size={15}/> Corregir</button></div>
    </li>)}</ul> : <p className="muted text-sm">Todavía no hay cobros de esta fiesta.</p>}
    {pending > 0 && <button type="button" className="btn btn-secondary btn-small" onClick={() => onRegister(coverageId)}><Plus size={15}/> Registrar cobro</button>}
  </>;
}

function PaymentsDetail({ db, coverageId, onRegister, onEdit }: { db: Db; coverageId: string; onRegister: (id: string, cmId: string) => void; onEdit: (m: { kind: 'pago'; id: string }) => void }) {
  const items = concepts(db).filter(x => x.coverageId === coverageId);
  const ids = new Set(items.map(x => x.id));
  const cmIds = [...new Set(items.map(x => x.cmId))];
  return <>{cmIds.map(cmId => {
    const cm = db.cms.find(x => x.id === cmId); const mine = items.filter(x => x.cmId === cmId);
    const pending = mine.reduce((s, x) => s + x.pendingCents, 0);
    // Pagos a esta CM que cubrieron algo de esta fiesta (una transferencia puede cubrir varias).
    const payments = db.cmPayments.filter(p => p.cmId === cmId && p.allocations.some(a => ids.has(a.conceptId))).sort((a, b) => a.date.localeCompare(b.date));
    return <div key={cmId} className="pay-cm">
      <p className="font-bold">{cm?.name ?? 'CM eliminada'}</p>
      <ul className="space-y-1">{mine.map(x => <li key={x.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{x.id.startsWith('fee:') ? 'Cobertura' : x.label.replace(/^Reintegro /, '').replace(/ · .*$/, '')}</span><span className="shrink-0 tabular-nums">{ars(x.amountCents)} {x.pendingCents > 0 ? <span className="badge badge-warn">falta {ars(x.pendingCents)}</span> : <span className="badge badge-success">pagado</span>}</span></li>)}</ul>
      {payments.length > 0 && <ul className="space-y-2">{payments.map(p => {
        const here = p.allocations.filter(a => ids.has(a.conceptId)).reduce((s, a) => s + a.amountCents, 0); const all = paymentTotal(p);
        return <li key={p.id} className="pay-line">
          <div className="flex items-start gap-3"><span className="min-w-0 flex-1"><span className="block font-semibold">Pago del {dateLabel(p.date)}</span>{here !== all && <span className="muted block text-sm">Parte de un pago de {ars(all)}</span>}{p.notes && <span className="muted block text-sm">{p.notes}</span>}</span><span className="font-bold tabular-nums">{ars(here)}</span></div>
          <div className="flex flex-wrap gap-2"><ReceiptButton path={p.receiptPath}/><button type="button" className="btn btn-quiet btn-small" onClick={() => onEdit({ kind: 'pago', id: p.id })}><Pencil size={15}/> Corregir</button></div>
        </li>;
      })}</ul>}
      {pending > 0 && <button type="button" className="btn btn-secondary btn-small" onClick={() => onRegister(coverageId, cmId)}><Plus size={15}/> Liquidar a {cm?.name.split(' ')[0] ?? 'la CM'} ({ars(pending)})</button>}
    </div>;
  })}</>;
}
