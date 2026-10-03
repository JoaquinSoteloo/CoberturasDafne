'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useStore } from '@/components/store';
import { QuickCoverageForm } from '@/components/quick-coverage-form';
import { UberFromReceipt } from '@/components/uber-from-receipt';
import { Empty, Modal, untilLabel } from '@/components/ui';
import { Ticket } from '@/components/ticket';
import { CalendarSubscribe } from '@/components/calendar-subscribe';
import { LiveNow, cameFromShortcut } from '@/components/live-now';
import { liveEvents } from '@/lib/live';
import { stageCounts } from '@/lib/content';
import { ars } from '@/lib/money';
import { byPartyType, collectionPending, monthly, totalPendingCollections, totalPendingPayments } from '@/lib/domain';
const daysAgo=(startsAt:string)=>{const n=Math.round((Date.now()-new Date(`${startsAt.slice(0,10)}T12:00`).getTime())/86400000);return n<=1?'fue ayer':`fue hace ${n} días`;};
export default function Home() {
  const {db,ready}=useStore(); const [open,setOpen]=useState(false); const router=useRouter();
  const liveItems=db.coverages.filter(c=>c.eventStatus!=='cancelado').map(c=>({id:c.id,name:c.name,startsAt:c.startsAt,endsAt:c.endsAt,arriveAt:c.arriveAt,livePosting:c.livePosting,salon:db.salons.find(s=>s.id===c.salonId)?.name}));
  // Atajo del ícono ("Fiesta de ahora"): abre directo la que está pasando o por empezar.
  useEffect(()=>{if(!ready||!cameFromShortcut())return;const first=liveEvents(liveItems)[0];if(first)router.replace(`/coberturas/${first.id}`);else window.history.replaceState(null,'','/');},[ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const now=new Date(); const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const month=today.slice(0,7); const summary=monthly(db,month);
  const upcoming=db.coverages.filter(c=>c.eventStatus==='pendiente'&&c.startsAt.slice(0,10)>=today).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).slice(0,4);
  const needsAttention=db.coverages.filter(c=>c.eventStatus==='pendiente'&&((!c.assignments.length&&!c.dafneGoes)||c.assignments.some(a=>a.confirmation!=='confirmada'))).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  // Después de la fiesta: contenido sin entregar y salones que todavía deben.
  const past=db.coverages.filter(c=>c.eventStatus!=='cancelado'&&c.startsAt.slice(0,10)<today).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  const pendingDelivery=past.filter(c=>c.deliveryStatus==='pendiente');
  const unpaid=past.map(c=>({c,owed:collectionPending(db,c)})).filter(x=>x.owed>0);
  const monthName=new Intl.DateTimeFormat('es-AR',{month:'long'}).format(now);
  const [next,...later]=upcoming;
  const salon=(id:string)=>db.salons.find(s=>s.id===id)?.name;
  return <div className="space-y-9">
    <LiveNow items={liveItems} href={id=>`/coberturas/${id}`}/>
    <div className="page-heading"><div><h1 className="page-title">Hola, Dafne</h1><p className="muted mt-2">{upcoming.length?`Tenés ${upcoming.length===4?'4 o más fiestas':upcoming.length===1?'una fiesta':`${upcoming.length} fiestas`} por delante.`:'No hay fiestas agendadas por ahora.'}</p></div><div className="flex flex-wrap gap-2"><UberFromReceipt label="Cargar recibo de Uber"/><button className="btn btn-primary" onClick={()=>setOpen(true)}><Plus size={19}/> Nueva cobertura</button></div></div>
    <div className="dashboard-columns">
      <section aria-labelledby="next-title"><div className="section-heading"><h2 id="next-title" className="section-title">Próxima fiesta</h2><Link href="/coberturas" className="text-link">Ver agenda</Link></div>
        {ready&&!next?<Empty title="Tu agenda está libre" detail="Creá una cobertura para organizar tu próximo evento."/>:next&&<>
          <Ticket coverage={next} db={db} href={`/coberturas/${next.id}`}/>
          {later.length>0&&<ul className="later-list" aria-label="Después">{later.map(c=><li key={c.id}><Link href={`/coberturas/${c.id}`}><span className="later-date"><strong>{Number(c.startsAt.slice(8,10))}</strong>{new Intl.DateTimeFormat('es-AR',{month:'short'}).format(new Date(c.startsAt.slice(0,10)+'T12:00')).replace('.','')}</span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name}</span><span className="muted text-sm">{c.startsAt.slice(11,16)} hs · {salon(c.salonId)}</span></span>{!c.assignments.length&&!c.dafneGoes&&<span className="badge badge-warn">Sin CM</span>}</Link></li>)}</ul>}
        </>}
      </section>
      <section className="attention-panel" aria-labelledby="todo-title"><div className="section-heading"><h2 id="todo-title" className="section-title">A resolver</h2><span className="attention-count">{needsAttention.length+pendingDelivery.length+unpaid.length}</span></div>{ready&&needsAttention.length===0&&pendingDelivery.length===0&&unpaid.length===0?<p className="muted text-sm">Todo confirmado, entregado y cobrado.</p>:<ul className="attention-list">{pendingDelivery.map(c=><li key={c.id}><Link className="attention-item" href={`/coberturas/${c.id}`}><span className="font-bold">{c.name}</span><span className="muted text-sm">{(()=>{const k=stageCounts(c.checklist);return k.total&&k.drive<k.total?`Faltan ${k.total-k.drive} en el Drive${k.whatsapp>k.drive?` (${k.whatsapp-k.drive} ya por WhatsApp)`:''}`:'Falta entregar el contenido'})()} · {daysAgo(c.startsAt)}</span></Link></li>)}{unpaid.map(({c,owed})=><li key={`u-${c.id}`}><Link className="attention-item" href={`/coberturas/${c.id}`}><span className="font-bold">{c.name}</span><span className="muted text-sm">{salon(c.salonId)??'El salón'} debe {ars(owed)} · {daysAgo(c.startsAt)}</span></Link></li>)}{needsAttention.map(c=><li key={c.id}><Link href={`/coberturas/${c.id}`} className="attention-item"><span className="font-bold">{c.name}</span><span className="muted text-sm">{!c.assignments.length?'Sin CM asignada':`${c.assignments.filter(a=>a.confirmation!=='confirmada').length} CM por confirmar`} · {untilLabel(c.startsAt).toLowerCase()}</span></Link></li>)}</ul>}</section>
    </div>
    <section className="month-panel" aria-labelledby="month-title">
      <div className="month-profit"><h2 id="month-title" className="section-title">Ganancia estimada de <span>{monthName}</span></h2><p className="profit-value">{ready?ars(summary.profit):'—'}</p><dl className="profit-breakdown"><div><dt>Ingresos acordados</dt><dd>{ars(summary.income)}</dd></div><div><dt>Costos previstos</dt><dd>{ars(summary.costs)}</dd></div><div><dt>Cobrado</dt><dd>{ars(summary.collected)}</dd></div><div><dt>Pagado</dt><dd>{ars(summary.paid)}</dd></div></dl></div>
      <div className="balance-stack"><Link href="/pagos?tab=cobros" className="balance-card balance-in"><ArrowDownLeft size={20}/><span className="flex-1">Por cobrar al salón</span><strong>{ready?ars(totalPendingCollections(db)):'—'}</strong></Link><Link href="/pagos?tab=pagos" className="balance-card balance-out"><ArrowUpRight size={20}/><span className="flex-1">Por pagar a las CM</span><strong>{ready?ars(totalPendingPayments(db)):'—'}</strong></Link></div>
    </section>
    {(()=>{const year=today.slice(0,4);const types=byPartyType(db,year);return ready&&types.length>0&&<section className="card party-types" aria-labelledby="types-title"><h2 id="types-title" className="section-title">Fiestas de {year} por tipo</h2><ul>{types.map(t=><li key={t.type}><span className="min-w-0 flex-1"><span className="block font-bold">{t.type}</span><span className="muted text-sm">{t.count===1?'1 fiesta':`${t.count} fiestas`} · {ars(Math.round(t.profitCents/t.count))} de ganancia promedio</span></span><strong>{ars(t.profitCents)}</strong></li>)}</ul><p className="muted mt-3 text-xs">Ganancia estimada, sin las canceladas.</p></section>})()}
    <p className="muted max-w-[68ch] text-xs leading-relaxed">El resumen se calcula según la fecha del evento. La ganancia estimada incluye honorarios, gastos y reintegros acordados; no representa dinero disponible.</p>
    <div className="max-w-xl"><CalendarSubscribe who="coordinadora"/></div>
    {open&&<Modal title="Nueva cobertura" onClose={()=>setOpen(false)}><QuickCoverageForm onDone={()=>setOpen(false)}/></Modal>}
  </div>;
}
