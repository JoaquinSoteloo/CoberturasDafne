'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, CircleCheck } from 'lucide-react';
import { useStore } from '@/components/store';
import { Empty, untilLabel } from '@/components/ui';
import { LiveNow, cameFromShortcut } from '@/components/live-now';
import { liveEvents } from '@/lib/live';
import { stageCounts } from '@/lib/content';
import { ars } from '@/lib/money';
import { collectionPending, monthly, totalPendingCollections, totalPendingPayments } from '@/lib/domain';

const daysAgo = (startsAt: string) => { const n = Math.round((Date.now() - new Date(`${startsAt.slice(0, 10)}T12:00`).getTime()) / 86400000); return n <= 1 ? 'fue ayer' : `fue hace ${n} días`; };
const shortDate = (iso: string) => ({ day: Number(iso.slice(8, 10)), month: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(`${iso.slice(0, 10)}T12:00`)).replace('.', '') });
/** Cuántas cosas de "A resolver" se ven sin desplegar. */
const TODO_LIMIT = 3;

/**
 * Inicio de Dafne, pensado para el celular: lo que está pasando, las próximas fiestas, lo que hay
 * que resolver (las más urgentes) y el mes en una tarjeta. Para cargar algo está el botón "+".
 */
export default function Home() {
  const { db, ready } = useStore(); const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const liveItems = db.coverages.filter(c => c.eventStatus !== 'cancelado').map(c => ({ id: c.id, name: c.name, startsAt: c.startsAt, endsAt: c.endsAt, arriveAt: c.arriveAt, livePosting: c.livePosting, salon: db.salons.find(s => s.id === c.salonId)?.name }));
  // Atajo del ícono ("Fiesta de ahora"): abre directo la que está pasando o por empezar.
  useEffect(() => { if (!ready || !cameFromShortcut()) return; const first = liveEvents(liveItems)[0]; if (first) router.replace(`/coberturas/${first.id}`); else window.history.replaceState(null, '', '/'); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const summary = monthly(db, today.slice(0, 7));
  const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(now);
  const salon = (id: string) => db.salons.find(s => s.id === id)?.name;
  const upcoming = db.coverages.filter(c => c.eventStatus === 'pendiente' && c.startsAt.slice(0, 10) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // A resolver: después de la fiesta (contenido y cobros) y antes (equipo sin confirmar).
  const past = db.coverages.filter(c => c.eventStatus !== 'cancelado' && c.startsAt.slice(0, 10) < today).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const todo = [
    ...past.filter(c => c.deliveryStatus === 'pendiente').map(c => {
      const k = stageCounts(c.checklist);
      return { key: `d-${c.id}`, id: c.id, title: c.name, detail: `${k.total && k.drive < k.total ? `Faltan ${k.total - k.drive} en el Drive${k.whatsapp > k.drive ? ` (${k.whatsapp - k.drive} ya por WhatsApp)` : ''}` : 'Falta entregar el contenido'} · ${daysAgo(c.startsAt)}` };
    }),
    ...past.map(c => ({ c, owed: collectionPending(db, c) })).filter(x => x.owed > 0).map(({ c, owed }) => ({ key: `u-${c.id}`, id: c.id, title: c.name, detail: `${salon(c.salonId) ?? 'El salón'} debe ${ars(owed)} · ${daysAgo(c.startsAt)}` })),
    ...upcoming.filter(c => (!c.assignments.length && !c.dafneGoes) || c.assignments.some(a => a.confirmation !== 'confirmada')).map(c => ({ key: `a-${c.id}`, id: c.id, title: c.name, detail: `${!c.assignments.length ? 'Sin CM asignada' : `${c.assignments.filter(a => a.confirmation !== 'confirmada').length} CM por confirmar`} · ${untilLabel(c.startsAt).toLowerCase()}` })),
  ];
  const shownTodo = showAll ? todo : todo.slice(0, TODO_LIMIT);

  return <div className="home space-y-7">
    <LiveNow items={liveItems} href={id => `/coberturas/${id}`}/>
    <header><h1 className="page-title">Hola, Dafne</h1><p className="muted mt-1">{upcoming.length ? `Tenés ${upcoming.length === 1 ? 'una fiesta' : `${upcoming.length} fiestas`} por delante.` : 'No hay fiestas agendadas por ahora.'}</p></header>

    <div className="dashboard-columns">
      <section aria-labelledby="next-title"><div className="section-heading"><h2 id="next-title" className="section-title">Próximas fiestas</h2><Link href="/coberturas" className="text-link">Ver agenda</Link></div>
        {ready && !upcoming.length ? <Empty title="Tu agenda está libre" detail="Con el botón + cargás una cobertura nueva."/>
          : <ul className="later-list home-next" aria-label="Próximas fiestas">{upcoming.slice(0, 4).map(c => { const d = shortDate(c.startsAt); const crew = c.assignments.filter(a => a.confirmation !== 'rechazada').map(a => db.cms.find(x => x.id === a.cmId)?.name.split(' ')[0]).filter(Boolean); if (c.dafneGoes) crew.unshift('Vos');
            return <li key={c.id}><Link href={`/coberturas/${c.id}`}><span className="later-date"><strong>{d.day}</strong>{d.month}</span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name}</span><span className="muted block truncate text-sm">{c.startsAt.slice(11, 16)} hs · {salon(c.salonId)}{crew.length ? ` · ${crew.join(', ')}` : ''}</span></span>{!crew.length ? <span className="badge badge-warn">Sin CM</span> : <span className="when-pill when-pendiente">{untilLabel(c.startsAt)}</span>}</Link></li>; })}</ul>}
        {upcoming.length > 4 && <Link href="/coberturas" className="text-link mt-2 inline-block text-sm">Ver las {upcoming.length}</Link>}
      </section>

      <section className="attention-panel" aria-labelledby="todo-title"><div className="section-heading"><h2 id="todo-title" className="section-title">A resolver</h2>{todo.length > 0 && <span className="attention-count">{todo.length}</span>}</div>
        {ready && !todo.length ? <p className="home-ok"><CircleCheck size={18}/> Todo en orden: confirmado, entregado y cobrado.</p>
          : <><ul className="attention-list">{shownTodo.map(t => <li key={t.key}><Link className="attention-item" href={`/coberturas/${t.id}`}><span className="font-bold">{t.title}</span><span className="muted text-sm">{t.detail}</span></Link></li>)}</ul>
            {todo.length > TODO_LIMIT && <button type="button" className="text-link mt-2 text-sm" onClick={() => setShowAll(v => !v)}>{showAll ? 'Ver menos' : `Ver las ${todo.length}`}</button>}</>}
      </section>
    </div>

    <section className="month-profit home-month" aria-labelledby="month-title">
      <h2 id="month-title" className="section-title">Ganancia estimada de <span className="capitalize">{monthName}</span></h2>
      <p className="profit-value">{ready ? ars(summary.profit) : '—'}</p>
      <div className="home-balances">
        <Link href="/pagos?tab=cobros" className="home-balance"><ArrowDownLeft size={17}/><span>Por cobrar</span><strong>{ready ? ars(totalPendingCollections(db)) : '—'}</strong></Link>
        <Link href="/pagos?tab=pagos" className="home-balance"><ArrowUpRight size={17}/><span>Por pagar</span><strong>{ready ? ars(totalPendingPayments(db)) : '—'}</strong></Link>
      </div>
      <details className="home-month-detail"><summary>Ver detalle <ChevronDown size={16} aria-hidden="true"/></summary>
        <dl className="profit-breakdown"><div><dt>Ingresos acordados</dt><dd>{ars(summary.income)}</dd></div><div><dt>Costos previstos</dt><dd>{ars(summary.costs)}</dd></div><div><dt>Cobrado</dt><dd>{ars(summary.collected)}</dd></div><div><dt>Pagado</dt><dd>{ars(summary.paid)}</dd></div></dl>
        <p className="muted mt-3 text-xs leading-relaxed">Según la fecha de cada fiesta. Incluye coberturas, Ubers y gastos; no es plata disponible.</p>
      </details>
    </section>
  </div>;
}
