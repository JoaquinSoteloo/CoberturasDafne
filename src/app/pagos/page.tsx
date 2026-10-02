'use client';

import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { useStore } from '@/components/store';
import { Meter, Modal, MoneyField, flash, shortDay } from '@/components/ui';
import { ArrowDownLeft, ArrowUpRight, Pencil, TriangleAlert } from 'lucide-react';
import { allocatePayment, collectionPending, concepts, overCollected, paidToCm, paymentTotal, totalPendingCollections, totalPendingPayments, validateCollection, validateCollectionEdit } from '@/lib/domain';
import type { Db } from '@/lib/types';
import { ars, dateLabel } from '@/lib/money';
import { newId } from '@/lib/repository';

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export default function Payments(){return <Suspense fallback={<p>Cargando pagos…</p>}><PaymentRoute/></Suspense>}
function PaymentRoute(){const params=useSearchParams();return <PaymentsContent key={params.toString()}/>;}
function PaymentsContent(){
  const {db,update}=useStore();const params=useSearchParams();const [tab,setTab]=useState<'cobros'|'pagos'>(params.get('tab')==='pagos'?'pagos':'cobros');const [modal,setModal]=useState(params.get('action')==='registrar');const [review,setReview]=useState(false);const [error,setError]=useState('');
  const targetCm=params.get('cm')||'';const targetCoverage=params.get('coverage')||'';const initialConcepts=concepts(db).filter(x=>x.cmId===targetCm&&x.pendingCents>0&&(!targetCoverage||x.coverageId===targetCoverage));const initialCoverage=db.coverages.find(c=>c.id===targetCoverage);
  const [coverageId,setCoverageId]=useState(targetCoverage);const [cmId,setCmId]=useState(targetCm);const [selected,setSelected]=useState<string[]>(initialConcepts.map(x=>x.id));const [amount,setAmount]=useState(params.get('tab')==='pagos'?initialConcepts.reduce((s,x)=>s+x.pendingCents,0):initialCoverage?collectionPending(db,initialCoverage):0);const [date,setDate]=useState(today());const [notes,setNotes]=useState('');
  const [editing,setEditing]=useState<{kind:'cobro'|'pago';id:string}|null>(null);
  const overList=db.coverages.map(c=>({c,over:overCollected(db,c)})).filter(x=>x.over>0);
  const open=(kind:'cobros'|'pagos',target='')=>{setReview(false);setTab(kind);setCoverageId(kind==='cobros'?target:'');setCmId(kind==='pagos'?target:'');const items=concepts(db).filter(x=>x.cmId===target&&x.pendingCents>0);setSelected(kind==='pagos'?items.map(x=>x.id):[]);const c=db.coverages.find(c=>c.id===target);setAmount(kind==='pagos'?items.reduce((s,x)=>s+x.pendingCents,0):c?collectionPending(db,c):0);setDate(today());setNotes('');setError('');setModal(true)};
  const available=db.coverages.filter(c=>collectionPending(db,c)>0);const availableCms=db.cms.filter(cm=>concepts(db).some(x=>x.cmId===cm.id&&x.pendingCents>0));const cmConcepts=concepts(db).filter(x=>x.cmId===cmId&&x.pendingCents>0);const selectedTotal=cmConcepts.filter(x=>selected.includes(x.id)).reduce((s,x)=>s+x.pendingCents,0);
  const saveCollection=(e:React.FormEvent)=>{e.preventDefault();const message=validateCollection(db,coverageId,amount);if(message){setError(message);return}if(!date){setError('Elegí una fecha.');return}if(!review){setReview(true);return;}update(db=>({...db,collections:[...db.collections,{id:newId(),coverageId,date,amountCents:amount,notes:notes.trim()}]}));setModal(false);flash();toast.success('Cobro registrado')};
  const savePayment=(e:React.FormEvent)=>{e.preventDefault();try{const allocations=allocatePayment(db,cmId,selected,amount);if(!date)throw new Error('Elegí una fecha.');if(!review){setReview(true);return;}update(db=>({...db,cmPayments:[...db.cmPayments,{id:newId(),cmId,date,allocations,notes:notes.trim()}]}));setModal(false);flash();toast.success('Pago registrado')}catch(x){setError(x instanceof Error?x.message:'No se pudo registrar el pago.')}};
  const ledgerIn=available.map(c=>{const total=c.agreedCents+c.expenses.filter(x=>x.absorbedBy==='salon').reduce((s,x)=>s+x.amountCents,0);const pending=collectionPending(db,c);return {id:c.id,title:c.name,when:c.startsAt,total,done:total-pending,pending}}).sort((a,b)=>a.when.localeCompare(b.when));
  const ledgerOut=availableCms.map(cm=>{const pending=concepts(db).filter(x=>x.cmId===cm.id).reduce((s,x)=>s+x.pendingCents,0);const done=paidToCm(db,cm.id);return {id:cm.id,title:cm.name,when:'',total:done+pending,done,pending}});
  const isIn=tab==='cobros';
  return <div className="space-y-7"><div className="page-heading"><div><h1 className="page-title">Pagos</h1><p className="muted mt-2">Lo que te debe el salón y lo que le debés al equipo.</p></div></div>
    <div className="coverage-view-switch" role="tablist" aria-label="Tipo de movimiento"><button role="tab" aria-selected={isIn} className={isIn?'selected':''} onClick={()=>setTab('cobros')}><ArrowDownLeft size={17}/> Cobros del salón</button><button role="tab" aria-selected={!isIn} className={!isIn?'selected':''} onClick={()=>setTab('pagos')}><ArrowUpRight size={17}/> Pagos a las CM</button></div>
    {isIn&&overList.length>0&&<section className="over-warning" aria-label="Cobrado de más"><p className="font-bold"><TriangleAlert size={17}/> Hay cobros por encima de lo acordado</p><ul>{overList.map(({c,over})=>{const last=db.collections.filter(x=>x.coverageId===c.id).sort((a,b)=>b.date.localeCompare(a.date))[0];return <li key={c.id}><span>{c.name}: cobraste <b>{ars(over)}</b> de más.</span>{last&&<button className="btn btn-secondary btn-small" onClick={()=>setEditing({kind:'cobro',id:last.id})}>Corregir cobro</button>}</li>})}</ul><p className="text-sm">Puede ser un cobro cargado antes de bajar el acordado. Si el salón realmente pagó de más, dejalo y anotá la devolución en las observaciones.</p></section>}
    <section className="ledger-card card" aria-labelledby="ledger-title"><div className="ledger-head"><div><h2 id="ledger-title" className="section-title">{isIn?'Falta cobrar':'Falta pagar'}</h2><p className="ledger-total">{ars(isIn?totalPendingCollections(db):totalPendingPayments(db))}</p></div><button className="btn btn-primary" onClick={()=>open(isIn?'cobros':'pagos')} disabled={isIn?!available.length:!availableCms.length}>{isIn?'Registrar cobro':'Liquidar CM'}</button></div>
      {(isIn?ledgerIn:ledgerOut).length?<ul className="ledger">{(isIn?ledgerIn:ledgerOut).map(r=>{const d=r.when?shortDay(r.when):null;return <li key={r.id} className="ledger-row">{d?<span className="ledger-date"><strong>{d.day}</strong>{d.month}</span>:<span className="ledger-avatar" aria-hidden="true">{r.title.split(' ').map(n=>n[0]).slice(0,2).join('')}</span>}<span className="min-w-0 flex-1"><span className="block font-bold">{r.title}</span><Meter done={r.done} total={r.total} label={`${isIn?'Cobrado':'Pagado'} ${ars(r.done)} de ${ars(r.total)}`}/><span className="muted block text-sm">{isIn?'Cobrado':'Pagado'} {ars(r.done)} de {ars(r.total)}</span></span><span className="ledger-side"><span className="ledger-amount">{ars(r.pending)}</span><button className="btn btn-secondary btn-small" onClick={()=>open(isIn?'cobros':'pagos',r.id)}>{isIn?'Registrar cobro':'Registrar pago'}</button></span></li>})}</ul>:<p className="muted px-5 pb-5">{isIn?'No queda nada por cobrar: los cobros cubren lo acordado.':'No queda nada por pagar al equipo.'}</p>}
    </section>
    <section aria-labelledby="history-title"><h2 id="history-title" className="section-title mb-3">{isIn?'Cobros registrados':'Pagos registrados'}</h2>{isIn?(db.collections.length?<History onEdit={id=>setEditing({kind:'cobro',id})} rows={db.collections.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>({id:p.id,title:db.coverages.find(c=>c.id===p.coverageId)?.name||'Cobertura eliminada',date:p.date,amount:p.amountCents,notes:p.notes}))}/>:<p className="muted">Todavía no registraste cobros. Van a aparecer acá.</p>):(db.cmPayments.length?<History onEdit={id=>setEditing({kind:'pago',id})} rows={db.cmPayments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>({id:p.id,title:db.cms.find(c=>c.id===p.cmId)?.name||'CM eliminada',date:p.date,amount:paymentTotal(p),notes:`${p.allocations.length} ${p.allocations.length===1?'concepto':'conceptos'}${p.notes?`. ${p.notes}`:''}`}))}/>:<p className="muted">Todavía no registraste pagos. Van a aparecer acá.</p>)}</section>
    {editing&&<EditMovement kind={editing.kind} id={editing.id} db={db} update={update} onClose={()=>setEditing(null)}/>}
    {modal&&<Modal title={tab==='cobros'?'Registrar cobro':'Liquidar CM'} onClose={()=>setModal(false)}>{tab==='cobros'?<form onChange={()=>setReview(false)} onSubmit={saveCollection} className="space-y-4"><label><span className="label">Cobertura *</span><select className="field" value={coverageId} onChange={e=>{setCoverageId(e.target.value);setAmount(0)}} required><option value="">Seleccionar cobertura</option>{available.map(c=><option key={c.id} value={c.id}>{c.name} · {ars(collectionPending(db,c))}</option>)}</select></label>{coverageId&&db.coverages.some(c=>c.id===coverageId)&&<p className="rounded-lg bg-[var(--accent-soft)] p-3 text-sm">Saldo pendiente: <b>{ars(collectionPending(db,db.coverages.find(c=>c.id===coverageId)!))}</b></p>}<MoneyField label="Importe cobrado *" value={amount} onChange={setAmount}/><label><span className="label">Fecha *</span><input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label><span className="label">Observaciones</span><textarea className="field" value={notes} onChange={e=>setNotes(e.target.value)}/></label>{error&&<p role="alert" className="text-sm font-semibold text-[var(--danger)]">{error}</p>}<Receipt kind="Cobro del salón" who={db.coverages.find(c=>c.id===coverageId)?.name||'Elegí una cobertura'} date={date?dateLabel(date):'Elegí una fecha'} detail={notes} amount={ars(amount)} review={review} hint="Revisá el importe y confirmá para guardarlo."/><button className="btn btn-primary w-full">{review?'Confirmar cobro':'Revisar cobro'}</button></form>:<form onChange={()=>setReview(false)} onSubmit={savePayment} className="space-y-4"><label><span className="label">CM *</span><select className="field" value={cmId} onChange={e=>{setCmId(e.target.value);setSelected([]);setAmount(0)}} required><option value="">Seleccionar CM</option>{availableCms.map(cm=><option key={cm.id} value={cm.id}>{cm.name}</option>)}</select></label>{cmId&&<fieldset><legend className="label">Conceptos pendientes *</legend><div className="space-y-2">{cmConcepts.map(c=><label key={c.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--line)] p-3"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>{const ids=e.target.checked?[...selected,c.id]:selected.filter(x=>x!==c.id);setSelected(ids);setAmount(cmConcepts.filter(x=>ids.includes(x.id)).reduce((s,x)=>s+x.pendingCents,0))}}/><span className="flex-1 text-sm">{c.label}</span><b className="text-sm">{ars(c.pendingCents)}</b></label>)}</div></fieldset>}<div className="rounded-xl bg-[var(--accent-soft)] p-4 text-sm"><div className="flex justify-between"><span>Total seleccionado</span><b>{ars(selectedTotal)}</b></div><p className="muted mt-1 text-xs">Podés pagar una parte. Se aplica a los conceptos seleccionados en el orden mostrado.</p></div><MoneyField label="Importe a pagar *" value={amount} onChange={setAmount}/><label><span className="label">Fecha *</span><input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label><span className="label">Observaciones</span><textarea className="field" value={notes} onChange={e=>setNotes(e.target.value)}/></label>{error&&<p role="alert" className="text-sm font-semibold text-[var(--danger)]">{error}</p>}<Receipt kind="Pago a una CM" who={db.cms.find(c=>c.id===cmId)?.name||'Elegí una CM'} date={date?dateLabel(date):'Elegí una fecha'} detail={`${selected.length} ${selected.length===1?'concepto':'conceptos'}`} amount={ars(amount)} review={review} hint="Revisá la destinataria y el importe antes de confirmar."/><button className="btn btn-primary w-full">{review?'Confirmar pago':'Revisar pago'}</button></form>}</Modal>}
  </div>;
}
function History({rows,onEdit}:{rows:{id:string;title:string;date:string;amount:number;notes:string}[];onEdit:(id:string)=>void}){return <ul className="ledger card">{rows.map(r=>{const d=shortDay(r.date);return <li key={r.id} className="ledger-row"><span className="ledger-date"><strong>{d.day}</strong>{d.month}</span><span className="min-w-0 flex-1"><span className="block font-bold">{r.title}</span>{r.notes&&<span className="muted block text-sm">{r.notes}</span>}</span><span className="ledger-side"><span className="ledger-amount">{ars(r.amount)}</span><button className="btn btn-quiet btn-small" onClick={()=>onEdit(r.id)} aria-label={`Corregir o anular: ${r.title}, ${ars(r.amount)}`}><Pencil size={15}/> Corregir</button></span></li>})}</ul>}
function Receipt({kind,who,date,detail,amount,review,hint}:{kind:string;who:string;date:string;detail:string;amount:string;review:boolean;hint:string}){return <div className={`receipt ${review?'is-review':''}`}><p className="receipt-kind">{kind}</p><p className="receipt-who">{who}</p><dl className="receipt-rows"><div><dt>Fecha</dt><dd>{date}</dd></div>{detail&&<div><dt>Detalle</dt><dd>{detail}</dd></div>}</dl><div className="receipt-total"><span>Total</span><strong>{amount}</strong></div>{review&&<p role="status" className="receipt-hint">{hint}</p>}</div>}

/** Corregir o anular un cobro o un pago ya registrado. Cada cambio queda en el historial de la base. */
function EditMovement({kind,id,db,update,onClose}:{kind:'cobro'|'pago';id:string;db:Db;update:(fn:(db:Db)=>Db)=>void;onClose:()=>void}){
  const collection=kind==='cobro'?db.collections.find(x=>x.id===id):undefined;
  const payment=kind==='pago'?db.cmPayments.find(x=>x.id===id):undefined;
  const [amount,setAmount]=useState(collection?.amountCents??0);
  const [date,setDate]=useState(collection?.date??payment?.date??'');
  const [notes,setNotes]=useState(collection?.notes??payment?.notes??'');
  const [error,setError]=useState('');
  if(!collection&&!payment)return null;
  const title=collection?db.coverages.find(c=>c.id===collection.coverageId)?.name:db.cms.find(c=>c.id===payment!.cmId)?.name;
  const labels=new Map(concepts(db).map(c=>[c.id,c.label]));
  const save=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!date){setError('Elegí una fecha.');return}
    if(collection){
      const message=validateCollectionEdit(db,collection.id,amount);if(message){setError(message);return}
      update(db=>({...db,collections:db.collections.map(x=>x.id===id?{...x,amountCents:amount,date,notes:notes.trim()}:x)}));
      toast.success('Cobro corregido');
    }else{
      update(db=>({...db,cmPayments:db.cmPayments.map(x=>x.id===id?{...x,date,notes:notes.trim()}:x)}));
      toast.success('Pago corregido');
    }
    onClose();
  };
  const annul=()=>{
    const what=collection?`el cobro de ${ars(collection.amountCents)}`:`el pago de ${ars(paymentTotal(payment!))} a ${title}`;
    if(!window.confirm(`¿Anular ${what}? Se borra, y lo que cubría vuelve a quedar pendiente.`))return;
    update(db=>collection?{...db,collections:db.collections.filter(x=>x.id!==id)}:{...db,cmPayments:db.cmPayments.filter(x=>x.id!==id)});
    toast.success(collection?'Cobro anulado':'Pago anulado');
    onClose();
  };
  return <Modal title={collection?'Corregir cobro':'Corregir pago'} onClose={onClose}>
    <form className="space-y-4" onSubmit={save}>
      <p className="font-bold">{title}</p>
      {collection?<MoneyField label="Importe cobrado" value={amount} onChange={setAmount}/>
        :<div className="space-y-2"><dl className="receipt-rows">{payment!.allocations.map((a,i)=><div key={i}><dt>{labels.get(a.conceptId)??'Concepto'}</dt><dd>{ars(a.amountCents)}</dd></div>)}<div><dt className="font-bold">Total</dt><dd className="font-bold">{ars(paymentTotal(payment!))}</dd></div></dl><p className="muted text-sm">Para cambiar el importe, anulá este pago y registralo de nuevo.</p></div>}
      <label className="block"><span className="label">Fecha</span><input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label className="block"><span className="label">Observaciones</span><textarea className="field" value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      {error&&<p role="alert" className="field-error">{error}</p>}
      <button className="btn btn-primary w-full">Guardar cambios</button>
      <button type="button" className="btn btn-danger w-full" onClick={annul}>{collection?'Anular cobro':'Anular pago'}</button>
    </form>
  </Modal>;
}
