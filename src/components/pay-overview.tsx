'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, CircleCheck, FileCheck2, MessageCircle, Pencil, ScanLine, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { openReceipt } from '@/lib/receipts';
import { active, collected, collectionPending, concepts, expectedIncome, isDue, isOwed, paymentTotal, type Concept } from '@/lib/domain';
import { dayKey } from '@/lib/calendar';
import { ars, dateLabel } from '@/lib/money';
import type { Coverage, Db } from '@/lib/types';
import { Avatar } from './avatar';
import { MpTransfer } from './mp-transfer';
import { ReceiptIntakeButton } from './receipt-intake';
import { Meter, Modal, cap, shortDay } from './ui';

type Sheet = { kind: 'cobrar'; coverageId: string } | { kind: 'pagar'; cmId: string } | null;
type Edit = (m: { kind: 'cobro' | 'pago'; id: string }) => void;

const monthTitle = (m: string) => cap(new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(`${m}-01T12:00`)));
const longDay = (iso: string) => new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso.slice(0, 10)}T12:00`)).replace(/\./g, '');
const daysSince = (iso: string) => Math.round((Date.now() - new Date(`${iso.slice(0, 10)}T12:00`).getTime()) / 86_400_000);
const ago = (iso: string) => { const n = daysSince(iso); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`; };
/** "Cobertura" o "Uber de ida", sin el nombre de la fiesta. */
const conceptName = (x: Concept) => x.id.startsWith('fee:') ? 'Cobertura' : x.label.replace(/^Reintegro /, '').replace(/ · .*$/, '');
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

function ReceiptButton({ path }: { path?: string }) {
  const [busy, setBusy] = useState(false);
  if (!path) return null;
  return <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await openReceipt(supabaseBrowser(), path); } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo abrir el comprobante.'); }
    finally { setBusy(false); }
  }}><FileCheck2 size={15}/>{busy ? 'Abriendo…' : 'Comprobante'}</button>;
}

/**
 * Pagos de Dafne, pensado para responder dos preguntas: quién le debe y a quién le debe.
 * Arriba el saldo; después lo que hay que cobrar de fiestas que ya pasaron, lo que hay que
 * pagarle a cada CM y el historial por mes. Cobrar y pagar se resuelven en una hoja: con el
 * comprobante, la IA lo registra sola.
 */
export function PayOverview({ db, initial, onManualCollect, onManualPay, onEdit }: {
  db: Db; initial?: Sheet;
  onManualCollect: (coverageId: string) => void;
  onManualPay: (cmId: string, conceptIds: string[], amountCents: number) => void;
  onEdit: Edit;
}) {
  const [sheet, setSheet] = useState<Sheet>(initial ?? null);
  const today = dayKey(new Date()); const month = today.slice(0, 7);
  const cov = (id: string) => db.coverages.find(c => c.id === id);
  const byDate = (a: Coverage, b: Coverage) => a.startsAt.localeCompare(b.startsAt);
  const owing = db.coverages.filter(c => active(c) && collectionPending(db, c) > 0);
  const dueCov = owing.filter(c => isDue(c, today)).sort(byDate);
  const laterCov = owing.filter(c => !isDue(c, today)).sort(byDate);
  const pending = concepts(db).filter(x => x.pendingCents > 0);
  const dueItems = pending.filter(x => isOwed(db, x, today));
  const laterTeam = sum(pending.filter(x => !dueItems.includes(x)), x => x.pendingCents);
  const crew = [...new Set(dueItems.map(x => x.cmId))].map(cmId => {
    const items = dueItems.filter(x => x.cmId === cmId);
    return { cm: db.cms.find(x => x.id === cmId), cmId, items, total: sum(items, x => x.pendingCents) };
  }).sort((a, b) => b.total - a.total);
  const toCollect = sum(dueCov, c => collectionPending(db, c)); const toPay = sum(crew, x => x.total);
  const collectedMonth = sum(db.collections.filter(x => x.date.startsWith(month)), x => x.amountCents);
  const paidMonth = sum(db.cmPayments.filter(x => x.date.startsWith(month)), paymentTotal);

  const collectRow = (c: Coverage) => { const d = shortDay(c.startsAt); const late = isDue(c, today) && daysSince(c.startsAt) > 7;
    return <li key={c.id}><button type="button" className="pay-row" onClick={() => setSheet({ kind: 'cobrar', coverageId: c.id })}>
      <span className="ledger-date"><strong>{d.day}</strong>{d.month}</span>
      <span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name}</span><span className="muted block truncate text-sm">{db.salons.find(s => s.id === c.salonId)?.name}{isDue(c, today) && <> · <span className={late ? 'pay-late' : ''}>{ago(c.startsAt)}</span></>}</span></span>
      <span className="pay-amount">{ars(collectionPending(db, c))}</span><ChevronRight size={18} className="shrink-0 text-[var(--muted)]" aria-hidden="true"/>
    </button></li>; };

  return <div className="space-y-6">
    <section className="pay-balance" aria-label="Saldo">
      <div className="pay-balance-grid">
        <div><p className="pay-balance-label"><ArrowDownLeft size={15}/> Te deben</p><p className={`pay-balance-value ${toCollect ? 'is-due' : ''}`}>{ars(toCollect)}</p></div>
        <div><p className="pay-balance-label"><ArrowUpRight size={15}/> Debés</p><p className="pay-balance-value">{ars(toPay)}</p></div>
      </div>
      <p className="pay-balance-month"><span className="capitalize">{monthTitle(month).split(' ')[0]}</span>: cobraste {ars(collectedMonth)} · pagaste {ars(paidMonth)}</p>
    </section>

    <section aria-labelledby="collect-title">
      <h2 id="collect-title" className="pay-section-title">Para cobrar</h2>
      {dueCov.length ? <ul className="card pay-list">{dueCov.map(collectRow)}</ul> : <p className="pay-clear"><CircleCheck size={18}/> Los salones te pagaron todo lo de fiestas que ya pasaron.</p>}
      {laterCov.length > 0 && <details className="pay-later"><summary>Más adelante: {laterCov.length === 1 ? '1 fiesta' : `${laterCov.length} fiestas`} por {ars(sum(laterCov, c => collectionPending(db, c)))} <ChevronDown size={16} aria-hidden="true"/></summary><ul className="card pay-list mt-2">{laterCov.map(collectRow)}</ul></details>}
    </section>

    <section aria-labelledby="pay-title">
      <h2 id="pay-title" className="pay-section-title">Para pagar</h2>
      {crew.length ? <ul className="card pay-list">{crew.map(({ cm, cmId, items, total }) => {
        const parties = [...new Set(items.map(x => cov(x.coverageId)?.name).filter(Boolean))];
        const ubers = items.some(x => x.id.startsWith('expense:'));
        return <li key={cmId}><div className="pay-row">
          <Avatar name={cm?.name ?? '?'} photoPath={cm?.photoPath} size={38}/>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSheet({ kind: 'pagar', cmId })}><span className="block truncate font-bold">{cm?.name.split(' ')[0] ?? 'CM eliminada'}</span><span className="muted block truncate text-sm">{parties.join(', ')}{ubers ? ' + Uber' : ''}</span></button>
          <span className="pay-amount">{ars(total)}</span>
          <button type="button" className="btn btn-primary btn-small" onClick={() => setSheet({ kind: 'pagar', cmId })}>Pagar</button>
        </div></li>;
      })}</ul> : <p className="pay-clear"><CircleCheck size={18}/> Estás al día con el equipo.</p>}
      {laterTeam > 0 && <p className="muted mt-2 px-1 text-sm">Más adelante: {ars(laterTeam)} de fiestas que vienen.</p>}
    </section>

    <History db={db} today={today} onEdit={onEdit} onCollect={id => setSheet({ kind: 'cobrar', coverageId: id })} onPay={id => setSheet({ kind: 'pagar', cmId: id })}/>

    {sheet?.kind === 'cobrar' && <CollectSheet db={db} coverageId={sheet.coverageId} onEdit={onEdit} onClose={() => setSheet(null)} onManual={() => { setSheet(null); onManualCollect(sheet.coverageId); }}/>}
    {sheet?.kind === 'pagar' && <PaySheet db={db} cmId={sheet.cmId} today={today} onClose={() => setSheet(null)} onManual={(ids, total) => { setSheet(null); onManualPay(sheet.cmId, ids, total); }}/>}
  </div>;
}

/** Cobrarle al salón una fiesta: recordarle por WhatsApp y, cuando paga, subir el comprobante. */
function CollectSheet({ db, coverageId, onClose, onManual, onEdit }: { db: Db; coverageId: string; onClose: () => void; onManual: () => void; onEdit: Edit }) {
  const c = db.coverages.find(x => x.id === coverageId);
  if (!c) return null;
  const salon = db.salons.find(s => s.id === c.salonId)?.name;
  const total = expectedIncome(c); const got = Math.min(total, collected(db, c.id)); const owed = collectionPending(db, c);
  const past = c.startsAt.slice(0, 10) <= dayKey(new Date());
  const message = `Hola! Te escribo por ${c.name} del ${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date(`${c.startsAt.slice(0, 10)}T12:00`))}. ${got > 0 ? 'Quedó un saldo' : 'Quedó pendiente el pago'} de ${ars(owed)}. ¡Gracias!`;
  const rows = db.collections.filter(x => x.coverageId === c.id).sort((a, b) => a.date.localeCompare(b.date));
  return <Modal title={c.name} onClose={onClose}><div className="space-y-5">
    <p className="muted -mt-2 text-sm">{[salon, longDay(c.startsAt), past ? ago(c.startsAt) : ''].filter(Boolean).join(' · ')}</p>
    <div className="grid gap-2"><div className="flex items-baseline justify-between gap-3"><span className="muted text-sm">Cobraste {ars(got)} de {ars(total)}</span><strong className="whitespace-nowrap">{owed > 0 ? `Falta ${ars(owed)}` : 'Cobrado'}</strong></div><Meter done={got} total={total} label={`Cobraste ${ars(got)} de ${ars(total)}`}/></div>
    {owed > 0 && <div className="grid gap-2">
      <a className="btn btn-whatsapp w-full" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={17}/> Recordarle al salón</a>
      <ReceiptIntakeButton hint={{ kind: 'cobro', coverageId: c.id }} multiple={false} className="btn btn-secondary w-full" icon={<ScanLine size={17}/>} label="Ya pagó: subir comprobante" onDone={n => { if (n) onClose(); }}/>
    </div>}
    {rows.length > 0 && <div><p className="text-sm font-bold">Cobros</p><ul className="mt-2 space-y-2">{rows.map(r => <MovementLine key={r.id} title={`${dateLabel(r.date)}`} detail={r.notes} amount={r.amountCents} path={r.receiptPath} onEdit={() => { onClose(); onEdit({ kind: 'cobro', id: r.id }); }}/>)}</ul></div>}
    <div className="flex flex-wrap items-center justify-between gap-3">{owed > 0 && <button type="button" className="text-link" onClick={onManual}>Cobro sin comprobante</button>}<Link className="text-link" href={`/coberturas/${c.id}`}>Ver la fiesta</Link></div>
  </div></Modal>;
}

/** Pagarle a una CM: lo que se le debe (tildado), Mercado Pago con el alias y el monto, y el comprobante. */
function PaySheet({ db, cmId, today, onClose, onManual }: { db: Db; cmId: string; today: string; onClose: () => void; onManual: (ids: string[], total: number) => void }) {
  const cm = db.cms.find(x => x.id === cmId);
  const cov = (id: string) => db.coverages.find(c => c.id === id);
  const items = concepts(db).filter(x => x.cmId === cmId && x.pendingCents > 0)
    .sort((a, b) => (cov(a.coverageId)?.startsAt ?? '').localeCompare(cov(b.coverageId)?.startsAt ?? '') || (a.id.startsWith('fee:') ? -1 : 1));
  const due = (x: Concept) => isOwed(db, x, today);
  const [selected, setSelected] = useState<string[]>(() => items.filter(due).map(x => x.id));
  const total = sum(items.filter(x => selected.includes(x.id)), x => x.pendingCents);
  const first = cm?.name.split(' ')[0] ?? 'la CM';
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return <Modal title={`Pagarle a ${first}`} onClose={onClose}><div className="space-y-5">
    <div className="flex items-center gap-3"><Avatar name={cm?.name ?? '?'} photoPath={cm?.photoPath} size={44}/><div className="min-w-0"><p className="truncate font-bold">{cm?.name}</p><p className="muted truncate text-sm">{cm?.alias ? `Alias ${cm.alias}` : 'Sin alias cargado'}</p></div></div>
    {items.length ? <ul className="pay-pick">{items.map(x => { const c = cov(x.coverageId); return <li key={x.id}><label>
      <input type="checkbox" checked={selected.includes(x.id)} onChange={() => toggle(x.id)}/>
      <span className="min-w-0 flex-1"><span className="block truncate font-bold">{c?.name}</span><span className="muted block text-sm">{conceptName(x)}{c && !due(x) ? (isDue(c, today) ? ' · no confirmó' : ' · fiesta que viene') : ''}</span></span>
      <span className="pay-amount">{ars(x.pendingCents)}</span>
    </label></li>; })}<li className="pay-pick-total"><span>Total</span><strong>{ars(total)}</strong></li></ul> : <p className="pay-clear"><CircleCheck size={18}/> No se le debe nada.</p>}
    {total > 0 && <>
      <div className="pay-step"><span className="pay-step-n">1</span><div className="min-w-0 flex-1"><p className="font-bold">Transferile</p><div className="mt-2"><MpTransfer name={cm?.name ?? ''} alias={cm?.alias} amountCents={total}/></div></div></div>
      <div className="pay-step"><span className="pay-step-n">2</span><div className="min-w-0 flex-1"><p className="font-bold">Subí el comprobante</p><p className="muted text-sm">La IA lee el monto y lo registra solo.</p><div className="mt-2"><ReceiptIntakeButton hint={{ kind: 'pago', cmId, conceptIds: selected }} multiple={false} className="btn btn-primary w-full" icon={<Upload size={17}/>} label="Subir el comprobante" onDone={n => { if (n) onClose(); }}/></div></div></div>
      <button type="button" className="text-link mx-auto block" onClick={() => onManual(selected, total)}>Pagar sin comprobante</button>
    </>}
  </div></Modal>;
}

function MovementLine({ title, detail, amount, path, onEdit }: { title: string; detail?: string; amount: number; path?: string; onEdit: () => void }) {
  return <li className="pay-line">
    <div className="flex items-start gap-3"><span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>{detail && <span className="muted block text-sm">{detail}</span>}</span><span className="font-bold tabular-nums">{ars(amount)}</span></div>
    <div className="flex flex-wrap gap-2"><ReceiptButton path={path}/><button type="button" className="btn btn-quiet btn-small" onClick={onEdit}><Pencil size={15}/> Corregir</button></div>
  </li>;
}

/** Cada mes, cerrado; adentro, cada fiesta con sus cobros y lo que se le pagó al equipo. */
function History({ db, today, onEdit, onCollect, onPay }: { db: Db; today: string; onEdit: Edit; onCollect: (coverageId: string) => void; onPay: (cmId: string) => void }) {
  const all = concepts(db);
  const parties = db.coverages.filter(c => active(c) && c.startsAt.slice(0, 7) <= today.slice(0, 7) && (expectedIncome(c) > 0 || all.some(x => x.coverageId === c.id)));
  const months = [...new Set(parties.map(c => c.startsAt.slice(0, 7)))].sort().reverse();
  if (!months.length) return null;
  const owedTeam = (id: string) => sum(all.filter(x => x.coverageId === id), x => x.pendingCents);
  const settled = (c: Coverage) => collectionPending(db, c) <= 0 && owedTeam(c.id) <= 0;
  return <section aria-labelledby="history-title">
    <h2 id="history-title" className="pay-section-title">Historial</h2>
    <div className="card pay-history">{months.map(m => {
      const list = parties.filter(c => c.startsAt.startsWith(m)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      const due = list.filter(c => isDue(c, today)); const done = due.filter(settled).length; const coming = list.length - due.length;
      const status = [due.length ? `${done} de ${due.length} saldada${due.length === 1 ? '' : 's'}` : '', coming ? `${coming} por venir` : ''].filter(Boolean).join(' · ');
      return <details key={m} className="pay-history-month">
        <summary><span className="flex-1 font-bold">{monthTitle(m)}</span>{!coming && done === due.length ? <span className="badge badge-success">Todo saldado</span> : <span className="muted text-sm">{status}</span>}<ChevronDown size={18} className="pay-party-chevron shrink-0" aria-hidden="true"/></summary>
        <ul className="space-y-2 pb-3">{list.map(c => {
          const d = shortDay(c.startsAt); const owe = collectionPending(db, c); const team = owedTeam(c.id);
          const items = all.filter(x => x.coverageId === c.id); const ids = new Set(items.map(x => x.id));
          const collections = db.collections.filter(x => x.coverageId === c.id).sort((a, b) => a.date.localeCompare(b.date));
          const payments = db.cmPayments.filter(p => p.allocations.some(a => ids.has(a.conceptId))).sort((a, b) => a.date.localeCompare(b.date));
          return <li key={c.id}><details className="pay-party">
            <summary><span className="flex items-center gap-3"><span className="ledger-date"><strong>{d.day}</strong>{d.month}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name}</span><span className="muted block truncate text-sm">{settled(c) ? 'Saldada' : [owe > 0 ? `falta cobrar ${ars(owe)}` : '', team > 0 ? `falta pagar ${ars(team)}` : ''].filter(Boolean).join(' · ')}</span></span>
              {settled(c) && <CircleCheck size={18} className="shrink-0 text-[var(--ok)]" aria-label="Saldada"/>}
              <ChevronDown size={18} className="pay-party-chevron shrink-0" aria-hidden="true"/></span></summary>
            <div className="mt-3 space-y-4">
              <div><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">Cobros del salón</p>{owe > 0 && <button type="button" className="text-link" onClick={() => onCollect(c.id)}>Cobrar {ars(owe)}</button>}</div>
                {collections.length ? <ul className="mt-2 space-y-2">{collections.map(r => <MovementLine key={r.id} title={dateLabel(r.date)} detail={r.notes} amount={r.amountCents} path={r.receiptPath} onEdit={() => onEdit({ kind: 'cobro', id: r.id })}/>)}</ul> : <p className="muted mt-1 text-sm">Todavía no hay cobros.</p>}</div>
              {items.length > 0 && <div><p className="text-sm font-bold">Equipo</p>
                <ul className="mt-2 space-y-1">{items.map(x => <li key={x.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{db.cms.find(m => m.id === x.cmId)?.name.split(' ')[0]} · {conceptName(x)}</span><span className="shrink-0 tabular-nums">{ars(x.amountCents)} {x.pendingCents > 0 ? <button type="button" className="badge badge-warn" onClick={() => onPay(x.cmId)}>falta {ars(x.pendingCents)}</button> : <span className="badge badge-success">pagado</span>}</span></li>)}</ul>
                {payments.length > 0 && <ul className="mt-2 space-y-2">{payments.map(p => { const here = sum(p.allocations.filter(a => ids.has(a.conceptId)), a => a.amountCents); const whole = paymentTotal(p);
                  return <MovementLine key={p.id} title={`${db.cms.find(m => m.id === p.cmId)?.name.split(' ')[0] ?? 'CM'} · ${dateLabel(p.date)}`} detail={[here !== whole ? `Parte de un pago de ${ars(whole)}` : '', p.notes].filter(Boolean).join(' · ')} amount={here} path={p.receiptPath} onEdit={() => onEdit({ kind: 'pago', id: p.id })}/>; })}</ul>}
              </div>}
              <Link className="text-link" href={`/coberturas/${c.id}`}>Ver la fiesta</Link>
            </div>
          </details></li>;
        })}</ul>
      </details>;
    })}</div>
  </section>;
}
