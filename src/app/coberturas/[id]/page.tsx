'use client';
import { use, useState } from 'react';
import { toast } from 'sonner';
import { newId } from '@/lib/repository';
import { dayKey } from '@/lib/calendar';
import Link from 'next/link';
import { ArrowLeft, Pencil, FolderOpen, Trash2, Bell } from 'lucide-react';
import { CoverageForm } from '@/components/coverage-form';
import { useStore } from '@/components/store';
import { Ticket } from '@/components/ticket';
import { ReceiptControl } from '@/components/receipt-control';
import { UberFromReceipt } from '@/components/uber-from-receipt';
import { tripSummary } from '@/lib/trip';
import { MapPreview } from '@/components/map-preview';
import { WeatherStrip } from '@/components/weather-strip';
import { Meter, Modal, StoryBars, cap, flash } from '@/components/ui';
import { ars } from '@/lib/money';
import { reinsert } from '@/lib/undo';
import { conceptPaid, expenseIsPaid, collected, collectionPending, concepts, estimatedProfit, expectedIncome, expenseTotal, feeTotal, overCollected } from '@/lib/domain';

export default function CoverageDetail({params}:{params:Promise<{id:string}>}) {
  const {id}=use(params); const {db,ready,update,undoable,saveState}=useStore(); const [editing,setEditing]=useState<'event'|'team'|'expenses'|'content'|'schedule'|null>(null);
  const c=db.coverages.find(x=>x.id===id);
  if(!ready) return <p className="muted">Cargando cobertura…</p>;
  if(!c) return <div><Link href="/coberturas" className="text-link">Volver a coberturas</Link><h1 className="page-title mt-5">Cobertura no encontrada</h1></div>;
  const markUberPaid=(expenseId:string)=>{update(db=>{
    const row=db.coverages.find(x=>x.id===id);const expense=row?.expenses.find(x=>x.id===expenseId);if(!expense||expenseIsPaid(db,expense))return db;
    const remainder=Math.max(0,expense.amountCents-conceptPaid(db,`expense:${expenseId}`));
    return {...db,coverages:db.coverages.map(x=>x.id===id?{...x,expenses:x.expenses.map(e=>e.id===expenseId?{...e,paymentStatus:'pagado' as const}:e)}:x),cmPayments:expense.advancedBy==='cm'&&expense.advancedCmId&&remainder>0?[...db.cmPayments,{id:newId(),cmId:expense.advancedCmId,date:dayKey(new Date()),allocations:[{conceptId:`expense:${expenseId}`,amountCents:remainder}],notes:'Pago de Uber registrado en la cobertura'}]:db.cmPayments};
  });toast.success('Uber marcado como pagado')};
  // Un gasto sin pagos se borra al toque, con unos segundos para deshacerlo.
  const removeExpense=(expenseId:string)=>{
    const index=c.expenses.findIndex(x=>x.id===expenseId);const expense=c.expenses[index];if(!expense)return;
    undoable(`Borraste "${expense.label}"`,
      db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,expenses:row.expenses.filter(x=>x.id!==expenseId)}:row)}),
      db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,expenses:reinsert(row.expenses,expense,index)}:row)}));
  };
  const confirmCm=(assignmentId:string)=>{update(db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,assignments:row.assignments.map(x=>x.id===assignmentId?{...x,confirmation:'confirmada'}:x)}:row)}));flash();toast.success('CM confirmada')};
  const toggleItem=(itemId:string,done:boolean)=>{
    const willComplete=done&&c.checklist.every(item=>item.id===itemId||item.done);
    update(db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,checklist:row.checklist.map(item=>item.id===itemId?{...item,done}:item)}:row)}));
    if(willComplete){flash();toast.success('Contenido completo')}
  };
  const pendingConcepts=concepts(db).filter(x=>x.coverageId===id);
  const toSettle=pendingConcepts.reduce((s,x)=>s+x.pendingCents,0);
  const income=expectedIncome(c); const got=collected(db,c.id); const owed=collectionPending(db,c); const over=overCollected(db,c);
  const unconfirmed=c.assignments.filter(a=>a.confirmation!=='confirmada').length;
  const doneItems=c.checklist.filter(x=>x.done).length;
  const steps={
    before:(c.assignments.length>0||c.dafneGoes)&&unconfirmed===0,
    night:c.eventStatus==='realizado',
    after:c.deliveryStatus==='entregada',
  };
  const cancelled=c.eventStatus==='cancelado';
  return <div className="space-y-7">
    <Link href="/coberturas" className="back-link"><ArrowLeft size={17}/> Coberturas</Link>
    <div className="detail-hero">
      <Ticket coverage={c} db={db}>{(c.client||c.address)&&<p className="ticket-extra">{[c.client&&`Para ${c.client}`,c.address].filter(Boolean).join('. ')}</p>}{c.notes&&<p className="ticket-note">{c.notes}</p>}</Ticket>
      {c.eventStatus==='pendiente'&&(()=>{const salon=db.salons.find(s=>s.id===c.salonId);return <WeatherStrip startsAt={c.startsAt} endsAt={c.endsAt} coords={salon?.lat!=null&&salon?.lng!=null?{lat:salon.lat,lng:salon.lng}:null}/>})()}
      {(()=>{const salon=db.salons.find(s=>s.id===c.salonId);const sameAsSalon=!c.address||c.address===salon?.address;return <MapPreview address={c.address||salon?.address||''} label={salon?.name} coords={sameAsSalon&&salon?.lat!=null&&salon?.lng!=null?{lat:salon.lat,lng:salon.lng}:null} fixLocationHref={sameAsSalon?'/equipo#salons-title':undefined}/>})()}
      <button className="btn btn-secondary" onClick={()=>setEditing('event')}><Pencil size={16}/> Editar datos del evento</button>
    </div>
    {cancelled&&<p role="status" className="cancel-note">Esta fiesta está cancelada: no suma ingresos ni costos.</p>}
    <div className="detail-columns">
      <ol className="timeline">
        <li className={`step ${steps.before?'is-done':''}`}>
          <div className="step-head"><h2 className="step-title">Antes de la fiesta</h2><p className="step-note">{!c.assignments.length&&!c.dafneGoes?'Falta asignar el equipo':unconfirmed?`${unconfirmed} CM sin confirmar`:c.dafneGoes&&!c.assignments.length?'Vas vos':'Equipo confirmado'}</p></div>
          <div className="step-body">
            <div className="sub-head"><h3>Equipo</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('team')}><Pencil size={15}/> Asignar o editar</button></div>
            {c.dafneGoes&&<p className="text-sm font-semibold">Vas vos{c.assignments.length?', con:':'.'}</p>}{!c.assignments.length?(!c.dafneGoes&&<p className="muted text-sm">Todavía no hay CM asignadas.</p>):<ul className="crew-list">{c.assignments.map(a=>{const cm=db.cms.find(x=>x.id===a.cmId);return <li key={a.id} className="crew-row">
              <span className="ledger-avatar" aria-hidden="true">{(cm?.name||'?').split(' ').map(n=>n[0]).slice(0,2).join('')}</span>
              <span className="min-w-0 flex-1"><span className="block font-bold">{cm?.name||'CM eliminada'}</span><span className="muted text-sm">Honorario {ars(a.feeCents)}</span></span>
              <span className="crew-actions"><span className={`badge ${a.confirmation==='pendiente'?'badge-warn':a.confirmation==='rechazada'?'badge-danger':'badge-success'}`}>{cap(a.confirmation)}</span>{a.confirmation!=='confirmada'&&<button className="btn btn-primary btn-small" disabled={cancelled} onClick={()=>confirmCm(a.id)}>Confirmar</button>}<Link className="text-link" href={`/pagos?tab=pagos&cm=${a.cmId}&coverage=${id}&action=registrar`}>Registrar pago</Link></span>
            </li>})}</ul>}
          </div>
        </li>
        <li className={`step ${steps.night?'is-done':''}`}>
          <div className="step-head"><h2 className="step-title">La noche</h2><p className="step-note">{[c.eventStatus==='realizado'?'Fiesta realizada':c.eventStatus==='cancelado'?'Cancelada':'',c.checklist.length?`${doneItems} de ${c.checklist.length} piezas listas`:c.eventStatus==='pendiente'?'Sin lista de contenido':''].filter(Boolean).join('. ')}</p></div>
          <div className="step-body">
            <div className="sub-head"><h3>Contenido a cubrir</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('content')}><Pencil size={15}/> Editar lista</button></div>
            {c.checklist.length?<><StoryBars items={c.checklist} label={false}/><ul className="mt-3 space-y-2">{c.checklist.map(x=><li key={x.id}><label className="checklist-action"><input type="checkbox" checked={x.done} onChange={e=>toggleItem(x.id,e.target.checked)}/><span className={x.done?'completed-task':''}>{x.text}</span></label></li>)}</ul></>:<p className="muted text-sm">Agregá lo que hay que cubrir: entrada, vals, torta, carioca.</p>}
            <div className="sub-head mt-6"><h3>Cronograma</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('schedule')}><Pencil size={15}/> {c.schedule.length?'Editar':'Armar'} cronograma</button></div>
            {c.schedule.length?<ol className="schedule-list">{[...c.schedule].sort((a,b)=>a.at.localeCompare(b.at)).map(m=><li key={m.id}><time>{m.at.slice(11,16)}</time><span className="min-w-0 flex-1">{m.label}</span>{m.notify&&<span className="schedule-bell" title="Las CM reciben un aviso 10 minutos antes"><Bell size={14} aria-hidden="true"/><span className="sr-only">Con aviso</span></span>}</li>)}</ol>:<p className="muted text-sm">Los momentos de la noche con su hora: entrada, vals, torta. Las CM los ven en su fecha.</p>}
            <div className="sub-head mt-6"><h3>Traslados y gastos</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('expenses')}><Pencil size={15}/> Cargar gastos</button></div>
            <div className="mb-3"><UberFromReceipt coverage={c}/></div>
            {!c.expenses.length?<p className="muted text-sm">Sin gastos cargados.</p>:<ul className="ledger">{c.expenses.map(e=>{const paid=expenseIsPaid(db,e);return <li key={e.id} className="ledger-row px-0">
              <span className="min-w-0 flex-1"><span className="block font-bold">{e.label}</span>{tripSummary(e)&&<span className="block text-sm">{tripSummary(e)}</span>}<span className="muted block text-sm">{e.advancedBy==='cm'?`Lo adelantó ${db.cms.find(x=>x.id===e.advancedCmId)?.name.split(' ')[0]||'una CM'}`:'Lo pagás vos'}. {e.absorbedBy==='salon'?'Lo cubre el salón.':'Corre por tu cuenta.'}</span></span>
              <span className="ledger-side"><span className="ledger-amount">{ars(e.amountCents)}</span>{e.kind==='uber'&&(paid?<span className="badge badge-success">Pagado</span>:<button className="btn btn-secondary btn-small" onClick={()=>markUberPaid(e.id)}>Marcar pagado</button>)}{conceptPaid(db,`expense:${e.id}`)===0&&<button type="button" className="btn btn-quiet btn-small !px-2" aria-label={`Borrar ${e.label}`} onClick={()=>removeExpense(e.id)}><Trash2 size={16}/></button>}</span>
              <span className="receipt-row"><ReceiptControl expenseId={e.id} path={e.receiptPath} disabledReason={saveState==='saved'?undefined:'Se puede adjuntar cuando terminen de guardarse los cambios.'} onChange={path=>update(db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,expenses:row.expenses.map(x=>x.id===e.id?{...x,receiptPath:path??undefined}:x)}:row)}))}/></span>
            </li>})}</ul>}
          </div>
        </li>
        <li className={`step ${steps.after?'is-done':''}`}>
          <div className="step-head"><h2 className="step-title">Después</h2><p className="step-note">{c.deliveryStatus==='entregada'?'Contenido entregado':'Falta entregar el contenido'}</p></div>
          <div className="step-body">
            <div className="sub-head"><h3>Entrega</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('content')}><Pencil size={15}/> Editar entrega</button></div>
            <div className="flex flex-wrap items-center gap-3"><span className={`badge ${c.deliveryStatus==='entregada'?'badge-success':'badge-warn'}`}>{cap(c.deliveryStatus)}</span>{c.deliveredPieces>0&&<span className="font-semibold">{c.deliveredPieces} {c.deliveredPieces===1?'pieza':'piezas'}</span>}{c.driveUrl&&<a href={c.driveUrl} target="_blank" rel="noopener noreferrer" className="text-link inline-flex items-center gap-1"><FolderOpen size={16}/> Abrir carpeta de Drive</a>}</div>
            {c.deliveryNotes&&<p className="muted mt-2 text-sm">{c.deliveryNotes}</p>}
          </div>
        </li>
      </ol>
      <aside className="numbers-panel" aria-labelledby="numbers-title">
        <h2 id="numbers-title" className="numbers-label">Ganancia estimada</h2>
        <p className="profit-value">{ars(estimatedProfit(c))}</p>
        <dl className="numbers-rows">
          <div><dt>Acordado con el salón</dt><dd>{ars(income)}</dd></div>
          <div><dt>Honorarios del equipo</dt><dd>− {ars(feeTotal(c))}</dd></div>
          <div><dt>Gastos y traslados</dt><dd>− {ars(expenseTotal(c))}</dd></div>
        </dl>
        <dl className="numbers-rows numbers-due">
          <div><dt>Falta cobrar</dt><dd>{ars(owed)}</dd></div>
          <div><dt>Falta pagar al equipo</dt><dd>{ars(toSettle)}</dd></div>
        </dl>
              <div className="numbers-collect">
          <p className="numbers-label">Cobro al salón</p>
          {income>0?<><Meter done={got} total={income} label={`Cobrado ${ars(got)} de ${ars(income)}`}/><p className="text-sm">Cobrado {ars(got)} de {ars(income)}</p>
            {owed>0?<Link href={`/pagos?tab=cobros&coverage=${id}&action=registrar`} className="btn btn-primary mt-3 w-full">Registrar cobro</Link>:over>0?<p className="mt-2 text-sm font-bold text-[var(--flash)]">Cobraste {ars(over)} más de lo acordado. <Link href="/pagos?tab=cobros" className="underline">Corregilo en Pagos</Link>.</p>:<p className="mt-2 text-sm font-bold text-[var(--flash)]">Cobrado completo</p>}
            <p className="numbers-hint">Se puede registrar en cualquier momento: antes, durante o después de la fiesta.</p></>
          :<p className="numbers-hint">{cancelled?'Cancelada, sin cobro.':'Cargá el monto acordado en los datos del evento.'}</p>}
        </div>
      </aside>
    </div>
    {editing&&<Modal title={{event:'Datos del evento',team:'Equipo de la cobertura',expenses:'Gastos y traslados',content:'Contenido y entrega',schedule:'Cronograma de la noche'}[editing]} onClose={()=>setEditing(null)}><CoverageForm section={editing} initial={c} onDone={()=>setEditing(null)}/></Modal>}
  </div>;
}
