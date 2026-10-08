'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye, KeyRound, Pencil, Phone, Receipt } from 'lucide-react';
import { useStore } from '@/components/store';
import { Avatar } from '@/components/avatar';
import { CmAccess } from '@/components/cm-access';
import { CmForm } from '@/components/cm-form';
import { MpTransfer } from '@/components/mp-transfer';
import { CmPushBadge, useCmPushStatus } from '@/components/cm-push-status';
import { Meter, Modal, shortDay } from '@/components/ui';
import { cmCoverageHistory, concepts, isOwed } from '@/lib/domain';
import { ars } from '@/lib/money';
import { dayKey } from '@/lib/calendar';

/**
 * Ficha de una CM: sus datos, lo que se le debe (coberturas y Ubers), próximas fechas e historial.
 * Los pagos no se registran acá: se cargan con el comprobante de la transferencia.
 */
export default function CmProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, ready } = useStore();
  const pushStatus = useCmPushStatus();
  const [editing, setEditing] = useState(false);
  const [access, setAccess] = useState(false);
  // Recién dada de alta con email: se abre "Acceso" para mandarle la contraseña provisoria.
  useEffect(() => { if (new URLSearchParams(window.location.search).get('acceso')) { setAccess(true); window.history.replaceState(null, '', window.location.pathname); } }, []);
  const cm = db.cms.find(x => x.id === id);
  if (!ready) return <p className="muted">Cargando…</p>;
  if (!cm) return <div className="space-y-4"><Link href="/equipo" className="back-link"><ArrowLeft size={17}/> Equipo</Link><p className="font-bold">No encontramos a esa CM.</p></div>;

  const first = cm.name.split(' ')[0];
  const mine = concepts(db).filter(c => c.cmId === cm.id);
  // Se le debe lo de fiestas que ya pasaron y confirmó; lo demás todavía no es deuda.
  const today = dayKey(new Date());
  const due = mine.filter(c => isOwed(db, c, today));
  const owedFees = due.filter(c => c.id.startsWith('fee:')).reduce((s, c) => s + c.pendingCents, 0);
  const owedUbers = due.filter(c => c.id.startsWith('expense:')).reduce((s, c) => s + c.pendingCents, 0);
  const later = mine.filter(c => !isOwed(db, c, today)).reduce((s, c) => s + c.pendingCents, 0);
  const owed = owedFees + owedUbers;
  const total = due.reduce((s, c) => s + c.amountCents, 0), paid = due.reduce((s, c) => s + Math.min(c.paidCents, c.amountCents), 0);
  const history = cmCoverageHistory(db, cm.id);
  const now = new Date();
  const upcoming = history.filter(h => h.coverage.eventStatus === 'pendiente' && new Date(h.coverage.startsAt) >= now).sort((a, b) => a.coverage.startsAt.localeCompare(b.coverage.startsAt));

  return <div className="space-y-6">
    <Link href="/equipo" className="back-link"><ArrowLeft size={17}/> Equipo</Link>

    <section className="card profile-card">
      <Avatar name={cm.name} photoPath={cm.photoPath} size={96}/>
      <div className="min-w-0 text-center">
        <h1 className="page-title !text-[28px]">{cm.name}</h1>
        {cm.phone && <a className="text-link mt-1 inline-flex items-center gap-1" href={`tel:${cm.phone.replace(/[^+0-9]/g, '')}`}><Phone size={15}/>{cm.phone}</a>}
        {cm.email && <p className="muted text-sm">{cm.email}</p>}
        {cm.alias && <p className="muted text-sm">Alias: <span className="font-semibold text-[var(--ink)]">{cm.alias}</span></p>}
      </div>
      <CmPushBadge status={pushStatus[cm.id]} firstName={first}/>
      {cm.notes && <p className="muted text-center text-sm">{cm.notes}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button className="btn btn-secondary btn-small" onClick={() => setEditing(true)}><Pencil size={15}/> Editar</button>
        <button className="btn btn-quiet btn-small" onClick={() => setAccess(true)}><KeyRound size={15}/> Acceso</button>
        <Link className="btn btn-quiet btn-small" href={`/equipo/${cm.id}/vista`}><Eye size={15}/> Ver como {first}</Link>
      </div>
    </section>

    <section className="card pay-summary" aria-label="Lo que se le debe">
      <div className="pay-summary-grid">
        <div><p className="pay-summary-label">{owed > 0 ? 'Le debés' : 'Está al día'}</p><p className={`pay-summary-value ${owed > 0 ? 'is-owed' : ''}`}>{ars(owed)}</p>{owed > 0 && <p className="muted text-sm">Coberturas {ars(owedFees)} · Ubers {ars(owedUbers)}</p>}{later > 0 && <p className="muted text-sm">Más adelante: {ars(later)} de fiestas que vienen o sin confirmar</p>}</div>
        <div><p className="pay-summary-label">Pagado en total</p><p className="pay-summary-value">{ars(paid)}</p><p className="muted text-sm">de {ars(total)}</p></div>
      </div>
      {total > 0 && <Meter done={paid} total={total} label={`Pagado ${ars(paid)} de ${ars(total)}`}/>}
      {owed > 0 && <MpTransfer name={cm.name} alias={cm.alias} amountCents={owed}/>}
      {owed > 0 && <p className="muted inline-flex items-center gap-1 text-sm"><Receipt size={14}/> Después de transferir, cargá el comprobante desde el inicio o Pagos.</p>}
    </section>

    <section aria-labelledby="next-title"><h2 id="next-title" className="section-title mb-3">Próximas fechas</h2>
      {upcoming.length ? <ul className="date-chips" aria-label="Próximas fiestas">{upcoming.map(({ coverage: c }) => { const d = shortDay(c.startsAt); return <li key={c.id}><Link href={`/coberturas/${c.id}`}><span className="chip-date"><strong>{d.day}</strong> {d.month}</span>{c.name}</Link></li>; })}</ul>
        : <p className="muted text-sm">Sin fiestas asignadas por delante.</p>}
    </section>

    <section aria-labelledby="history-title"><h2 id="history-title" className="section-title mb-3">Historial · {history.length} {history.length === 1 ? 'cobertura' : 'coberturas'}</h2>
      {history.length ? <ul className="ledger card">{history.map(({ coverage: c, totalCents, paidCents, pendingCents, hasReimbursements }) => { const d = shortDay(c.startsAt); return <li key={c.id}><Link href={`/coberturas/${c.id}`} className="ledger-row"><span className="ledger-date"><strong>{d.day}</strong>{d.month}</span><span className="min-w-0 flex-1"><span className="block font-bold">{c.name}</span><span className="muted block text-sm">{c.eventStatus === 'cancelado' ? 'Cancelada, no suma al total' : `Pagado ${ars(paidCents)} de ${ars(totalCents)}${hasReimbursements ? ', con Ubers' : ''}`}</span></span><span className="ledger-amount">{c.startsAt.slice(0, 10) > today ? 'Por venir' : pendingCents > 0 ? ars(pendingCents) : 'Saldada'}</span></Link></li>; })}</ul>
        : <p className="muted text-sm">Todavía no participó en coberturas.</p>}
    </section>

    {editing && <Modal title={`Editar a ${first}`} onClose={() => setEditing(false)}><CmForm initial={cm} onDone={() => setEditing(false)}/></Modal>}
    {access && <Modal title={`Acceso de ${first}`} onClose={() => setAccess(false)}><CmAccess cm={cm} onEdit={() => { setAccess(false); setEditing(true); }}/></Modal>}
  </div>;
}
