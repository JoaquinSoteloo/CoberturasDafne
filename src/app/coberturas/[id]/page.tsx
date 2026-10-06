'use client';
import { use, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, Pencil, FolderOpen, Trash2, Bell, ChevronDown } from 'lucide-react';
import { CoverageForm } from '@/components/coverage-form';
import { useStore } from '@/components/store';
import { Ticket } from '@/components/ticket';
import { ReceiptControl } from '@/components/receipt-control';
import { StageButton } from '@/components/stage-button';
import { PayUber } from '@/components/pay-uber';
import { stageCounts, stageOf, stageSummary, type Stage } from '@/lib/content';
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
  // Los pasos ya resueltos quedan cerrados; se abren con un toque.
  const [toggled,setToggled]=useState<Record<string,boolean>>({});
  const c=db.coverages.find(x=>x.id===id);
  if(!ready) return <p className="muted">Cargando cobertura…</p>;
  if(!c) return <div><Link href="/coberturas" className="text-link">Volver a coberturas</Link><h1 className="page-title mt-5">Cobertura no encontrada</h1></div>;
  // Un gasto sin pagos se borra al toque, con unos segundos para deshacerlo.
  const removeExpense=(expenseId:string)=>{
    const index=c.expenses.findIndex(x=>x.id===expenseId);const expense=c.expenses[index];if(!expense)return;
    undoable(`Borraste "${expense.label}"`,
      db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,expenses:row.expenses.filter(x=>x.id!==expenseId)}:row)}),
      db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,expenses:reinsert(row.expenses,expense,index)}:row)}));
  };
  const confirmCm=(assignmentId:string)=>{update(db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,assignments:row.assignments.map(x=>x.id===assignmentId?{...x,confirmation:'confirmada'}:x)}:row)}));flash();toast.success('CM confirmada')};
  const setStage=(itemId:string,stage:Stage)=>{
    const willComplete=stage==='drive'&&c.checklist.every(item=>item.id===itemId||stageOf(item)==='drive');
    // Con todo el contenido en el Drive, la fiesta pasa a realizada (la base hace lo mismo cuando lo marca una CM).
    const finishes=willComplete&&c.eventStatus==='pendiente';
    update(db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,...(finishes?{eventStatus:'realizado' as const}:{}),checklist:row.checklist.map(item=>item.id===itemId?{...item,stage,done:stage==='drive'}:item)}:row)}));
    if(willComplete){flash();toast.success(finishes?'Todo el contenido está en el Drive: la fiesta quedó realizada':'Todo el contenido está en el Drive')}
  };
  const pendingConcepts=concepts(db).filter(x=>x.coverageId===id);
  const toSettle=pendingConcepts.reduce((s,x)=>s+x.pendingCents,0);
  const income=expectedIncome(c); const got=collected(db,c.id); const owed=collectionPending(db,c); const over=overCollected(db,c);
  const unconfirmed=c.assignments.filter(a=>a.confirmation!=='confirmada').length;
  const steps={
    before:(c.assignments.length>0||c.dafneGoes)&&unconfirmed===0,
    night:c.eventStatus==='realizado',
    after:c.deliveryStatus==='entregada',
  };
  const cancelled=c.eventStatus==='cancelado';
  const k=stageCounts(c.checklist);
  const settled={before:steps.before,night:steps.night&&k.drive===k.total&&c.expenses.every(e=>expenseIsPaid(db,e)),after:steps.after};
  type Step=keyof typeof settled;
  const isOpen=(step:Step)=>toggled[step]??!settled[step];
  const flip=(step:Step)=>setToggled(t=>({...t,[step]:!isOpen(step)}));
  const head=(step:Step,title:string,note:string)=><h2><button type="button" className="step-head step-toggle" aria-expanded={isOpen(step)} onClick={()=>flip(step)}><span className="step-title">{title}</span><span className="sr-only">: </span><span className="step-note">{note}</span><ChevronDown size={18} className="step-chevron" aria-hidden="true"/></button></h2>;
  // Pasada la fiesta, lo primero es la plata (si falta cobrar o pagar).
  const startMs=new Date(c.startsAt).getTime();const endMs=c.endsAt?new Date(c.endsAt).getTime():startMs+6*3600e3;
  const moneyFirst=!cancelled&&(c.eventStatus==='realizado'||Date.now()>endMs)&&(owed>0||toSettle>0);
  return <div className="space-y-7">
    <Link href="/coberturas" className="back-link"><ArrowLeft size={17}/> Coberturas</Link>
    <div className="detail-hero">
      <Ticket coverage={c} db={db}>{(c.client||c.address)&&<p className="ticket-extra">{[c.client&&`Para ${c.client}`,c.address].filter(Boolean).join('. ')}</p>}{c.notes&&<p className="ticket-note">{c.notes}</p>}</Ticket>
      {c.eventStatus==='pendiente'&&(()=>{const salon=db.salons.find(s=>s.id===c.salonId);return <WeatherStrip startsAt={c.startsAt} endsAt={c.endsAt} coords={salon?.lat!=null&&salon?.lng!=null?{lat:salon.lat,lng:salon.lng}:null}/>})()}
      <div className="detail-actions">{(()=>{const salon=db.salons.find(s=>s.id===c.salonId);const sameAsSalon=!c.address||c.address===salon?.address;return <MapPreview compact address={c.address||salon?.address||''} label={salon?.name} coords={sameAsSalon&&salon?.lat!=null&&salon?.lng!=null?{lat:salon.lat,lng:salon.lng}:null} fixLocationHref={sameAsSalon?'/equipo#salons-title':undefined}/>})()}
        <button className="btn btn-secondary btn-small" onClick={()=>setEditing('event')}><Pencil size={15}/> Editar</button></div>
    </div>
    {cancelled&&<p role="status" className="cancel-note">Esta fiesta está cancelada: no suma ingresos ni costos.</p>}
    <div className={`detail-columns ${moneyFirst?'money-first':''}`}>
      <ol className="timeline">
        <li className={`step ${steps.before?'is-done':''}`}>
          {head('before','Antes de la fiesta',!c.assignments.length&&!c.dafneGoes?'Falta asignar el equipo':unconfirmed?`${unconfirmed} CM sin confirmar`:c.dafneGoes&&!c.assignments.length?'Vas vos':'Equipo confirmado')}
          {isOpen('before')&&<div className="step-body">
            <div className="sub-head"><h3>Equipo</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('team')}><Pencil size={15}/> Asignar o editar</button></div>
            {c.dafneGoes&&<p className="text-sm font-semibold">Vas vos{c.assignments.length?', con:':'.'}</p>}{!c.assignments.length?(!c.dafneGoes&&<p className="muted text-sm">Todavía no hay CM asignadas.</p>):<ul className="crew-list">{c.assignments.map(a=>{const cm=db.cms.find(x=>x.id===a.cmId);return <li key={a.id} className="crew-row">
              <span className="ledger-avatar" aria-hidden="true">{(cm?.name||'?').split(' ').map(n=>n[0]).slice(0,2).join('')}</span>
              <span className="min-w-0 flex-1"><span className="block font-bold">{cm?.name||'CM eliminada'}</span><span className="muted text-sm">Honorario {ars(a.feeCents)}</span></span>
              <span className="crew-actions"><span className={`badge ${a.confirmation==='pendiente'?'badge-warn':a.confirmation==='rechazada'?'badge-danger':'badge-success'}`}>{cap(a.confirmation)}</span>{a.confirmation!=='confirmada'&&<button className="btn btn-primary btn-small" disabled={cancelled} onClick={()=>confirmCm(a.id)}>Confirmar</button>}{pendingConcepts.some(x=>x.cmId===a.cmId&&x.pendingCents>0)&&<Link className="btn btn-secondary btn-small" href={`/pagos?pagar=${a.cmId}`}>Pagar</Link>}</span>
            </li>})}</ul>}
          </div>}
        </li>
        <li className={`step ${steps.night?'is-done':''}`}>
          {head('night','La noche',[c.eventStatus==='realizado'?'Fiesta realizada':c.eventStatus==='cancelado'?'Cancelada':'',c.checklist.length?stageSummary(c.checklist):c.eventStatus==='pendiente'?'Sin lista de contenido':''].filter(Boolean).join('. '))}
          {isOpen('night')&&<div className="step-body">
            <div className="sub-head"><h3>Contenido a cubrir</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('content')}><Pencil size={15}/> Editar lista</button></div>
            {c.checklist.length?<><StoryBars items={c.checklist} label={false}/><ul className="mt-3 space-y-2">{c.checklist.map(x=><li key={x.id}><StageButton stage={stageOf(x)} text={x.text} onChange={s=>setStage(x.id,s)}/></li>)}</ul><p className="muted mt-2 text-xs">Tocá para marcar: ✓ enviado por WhatsApp · ✓✓ subido al Drive.</p></>:<p className="muted text-sm">Agregá lo que hay que cubrir: entrada, vals, torta, carioca.</p>}
            <div className="sub-head mt-6"><h3>Cronograma</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('schedule')}><Pencil size={15}/> {c.schedule.length?'Editar':'Armar'} cronograma</button></div>
            {c.schedule.length?<ol className="schedule-list">{[...c.schedule].sort((a,b)=>a.at.localeCompare(b.at)).map(m=><li key={m.id}><time>{m.at.slice(11,16)}</time><span className="min-w-0 flex-1">{m.label}</span>{m.notify&&<span className="schedule-bell" title="Las CM reciben un aviso 10 minutos antes"><Bell size={14} aria-hidden="true"/><span className="sr-only">Con aviso</span></span>}</li>)}</ol>:<p className="muted text-sm">Los momentos de la noche con su hora: entrada, vals, torta. Las CM los ven en su fecha.</p>}
            <div className="sub-head mt-6"><h3>Traslados y gastos</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('expenses')}><Pencil size={15}/> Editar</button></div>
            <div className="mb-3"><UberFromReceipt coverage={c}/></div>
            {!c.expenses.length?<p className="muted text-sm">Sin gastos cargados.</p>:<ul className="ledger">{c.expenses.map(e=>{const paid=expenseIsPaid(db,e);return <li key={e.id} className="ledger-row px-0">
              <span className="min-w-0 flex-1"><span className="block font-bold">{e.label}</span>{tripSummary(e)&&<span className="block text-sm">{tripSummary(e)}</span>}<span className="muted block text-sm">{e.advancedBy==='cm'?`Lo adelantó ${db.cms.find(x=>x.id===e.advancedCmId)?.name.split(' ')[0]||'una CM'}`:'Lo pagaste vos'}</span></span>
              <span className="ledger-side"><span className="ledger-amount">{ars(e.amountCents)}</span>{e.kind==='uber'&&paid&&<span className="badge badge-success">Pagado</span>}{e.kind==='uber'&&<PayUber coverageId={id} expenseId={e.id}/>}{conceptPaid(db,`expense:${e.id}`)===0&&<button type="button" className="btn btn-quiet btn-small !px-2" aria-label={`Borrar ${e.label}`} onClick={()=>removeExpense(e.id)}><Trash2 size={16}/></button>}</span>
              <span className="receipt-row"><ReceiptControl expenseId={e.id} path={e.receiptPath} disabledReason={saveState==='saved'?undefined:'Se puede adjuntar cuando terminen de guardarse los cambios.'} onChange={path=>update(db=>({...db,coverages:db.coverages.map(row=>row.id===id?{...row,expenses:row.expenses.map(x=>x.id===e.id?{...x,receiptPath:path??undefined}:x)}:row)}))}/></span>
            </li>})}</ul>}
          </div>}
        </li>
        <li className={`step ${steps.after?'is-done':''}`}>
          {head('after','Después',c.deliveryStatus==='entregada'?'Contenido entregado':'Falta entregar el contenido')}
          {isOpen('after')&&<div className="step-body">
            <div className="sub-head"><h3>Entrega</h3><button className="btn btn-quiet btn-small" onClick={()=>setEditing('content')}><Pencil size={15}/> Editar entrega</button></div>
            <div className="flex flex-wrap items-center gap-3"><span className={`badge ${c.deliveryStatus==='entregada'?'badge-success':'badge-warn'}`}>{cap(c.deliveryStatus)}</span>{c.deliveredPieces>0&&<span className="font-semibold">{c.deliveredPieces} {c.deliveredPieces===1?'pieza':'piezas'}</span>}{c.driveUrl&&<a href={c.driveUrl} target="_blank" rel="noopener noreferrer" className="text-link inline-flex items-center gap-1"><FolderOpen size={16}/> Abrir carpeta de Drive</a>}</div>
            {c.deliveryNotes&&<p className="muted mt-2 text-sm">{c.deliveryNotes}</p>}
          </div>}
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
            {owed>0?<Link href={`/pagos?cobrar=${id}`} className="btn btn-primary mt-3 w-full">Cobrar</Link>:over>0?<p className="mt-2 text-sm font-bold text-[var(--flash)]">Cobraste {ars(over)} más de lo acordado. <Link href="/pagos?tab=cobros" className="underline">Corregilo en Pagos</Link>.</p>:<p className="mt-2 text-sm font-bold text-[var(--flash)]">Cobrado completo</p>}
</>
          :<p className="numbers-hint">{cancelled?'Cancelada, sin cobro.':'Cargá el monto acordado en los datos del evento.'}</p>}
        </div>
      </aside>
    </div>
    {editing&&<Modal title={{event:'Datos del evento',team:'Equipo de la cobertura',expenses:'Gastos y traslados',content:'Contenido y entrega',schedule:'Cronograma de la noche'}[editing]} onClose={()=>setEditing(null)}><CoverageForm section={editing} initial={c} onDone={()=>setEditing(null)}/></Modal>}
  </div>;
}
