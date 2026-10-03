'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { useStore, type Undoable } from '@/components/store';
import { reinsert } from '@/lib/undo';
import { Modal, MoneyField, flash } from '@/components/ui';
import { ArrowDownLeft, ArrowUpRight, Paperclip, ScanLine, TriangleAlert } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { attachReceipt, shrink } from '@/lib/receipts';
import { classifyTransfer, conceptsFor, matchCm, matchCollection, type TransferData } from '@/lib/transfer';
import { takeTransfer } from '@/lib/transfer-handoff';
import { ReceiptControl } from '@/components/receipt-control';
import { PaymentsByEvent } from '@/components/payments-by-event';
import { MpTransfer } from '@/components/mp-transfer';
import { allocatePayment, collectionPending, concepts, expectedIncome, overCollected, paymentTotal, totalPendingCollections, totalPendingPayments, validateCollection, validateCollectionEdit } from '@/lib/domain';
import type { Db } from '@/lib/types';
import { ars, dateLabel } from '@/lib/money';
import { newId } from '@/lib/repository';

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export default function Payments(){return <Suspense fallback={<p>Cargando pagos…</p>}><PaymentRoute/></Suspense>}
function PaymentRoute(){const params=useSearchParams();return <PaymentsContent key={params.toString()}/>;}
function PaymentsContent(){
  const {db,update,undoable,saveState,email}=useStore();const params=useSearchParams();const [tab,setTab]=useState<'cobros'|'pagos'>(params.get('tab')==='pagos'?'pagos':'cobros');const [modal,setModal]=useState(params.get('action')==='registrar');const [review,setReview]=useState(false);const [error,setError]=useState('');
  const targetCm=params.get('cm')||'';const targetCoverage=params.get('coverage')||'';const initialConcepts=concepts(db).filter(x=>x.cmId===targetCm&&x.pendingCents>0&&(!targetCoverage||x.coverageId===targetCoverage));const initialCoverage=db.coverages.find(c=>c.id===targetCoverage);
  const [coverageId,setCoverageId]=useState(targetCoverage);const [cmId,setCmId]=useState(targetCm);const [selected,setSelected]=useState<string[]>(initialConcepts.map(x=>x.id));const [amount,setAmount]=useState(params.get('tab')==='pagos'?initialConcepts.reduce((s,x)=>s+x.pendingCents,0):initialCoverage?collectionPending(db,initialCoverage):0);const [date,setDate]=useState(today());const [notes,setNotes]=useState('');
  // Comprobante de transferencia: la IA lo lee y la app decide si es un pago a una CM (va a su alias o nombre)
  // o un cobro de un salón (la plata es para Dafne), y de qué fiesta por el importe. El archivo se adjunta solo al guardar.
  const [transferFile,setTransferFile]=useState<File|null>(null);const [scanning,setScanning]=useState(false);const [scanInfo,setScanInfo]=useState('');const scanInput=useRef<HTMLInputElement>(null);const topInput=useRef<HTMLInputElement>(null);
  const [unsure,setUnsure]=useState<{r:TransferData;file:File}|null>(null);
  const [pendingReceipt,setPendingReceipt]=useState<{target:'payment'|'collection';id:string;file:File;sawSaving:boolean}|null>(null);
  useEffect(()=>{
    if(!pendingReceipt)return;
    if(saveState!=='saved'){if(!pendingReceipt.sawSaving)setPendingReceipt({...pendingReceipt,sawSaving:true});return;}
    if(!pendingReceipt.sawSaving)return;
    const job=pendingReceipt;setPendingReceipt(null);
    attachReceipt(supabaseBrowser(),job.id,job.file,null,job.target)
      .then(path=>update(db=>job.target==='payment'?{...db,cmPayments:db.cmPayments.map(x=>x.id===job.id?{...x,receiptPath:path}:x)}:{...db,collections:db.collections.map(x=>x.id===job.id?{...x,receiptPath:path}:x)}))
      .catch(()=>toast.error(`Se guardó, pero no se pudo adjuntar el comprobante. Adjuntalo desde "${job.target==='payment'?'Pagos':'Cobros'} registrados".`));
  },[pendingReceipt,saveState,update]);
  const ownerWords=email.split('@')[0].split(/[^a-zA-Z]+/).filter(w=>w.length>=3);
  const read=(r:TransferData)=>`${r.amountCents?ars(r.amountCents):'monto sin leer'}${r.date?` del ${dateLabel(r.date)}`:''}`;
  const applyPago=(r:TransferData,file:File)=>{
    const amt=r.amountCents??0;setTab('pagos');setTransferFile(file);setReview(false);setError('');setDate(r.date??today());setNotes(r.operation?`Operación ${r.operation}`:'');setCoverageId('');
    const cm=matchCm(db.cms,r);
    if(cm){const items=concepts(db).filter(x=>x.cmId===cm.id&&x.pendingCents>0);setCmId(cm.id);setSelected(conceptsFor(items,amt));setAmount(amt);setScanInfo(`Pago a ${cm.name}: ${read(r)}. Revisá los conceptos y confirmá.`);}
    else{setCmId('');setSelected([]);setAmount(amt);setScanInfo(`Pago de ${read(r)}${r.recipientName?` a ${r.recipientName}`:''}. No reconocí a qué CM: elegila${r.recipientAlias?` (alias ${r.recipientAlias})`:''}. Tip: cargá su alias en Equipo y la próxima la reconoce sola.`);}
    setModal(true);
  };
  const applyCobro=(r:TransferData,file:File)=>{
    const amt=r.amountCents??0;setTab('cobros');setTransferFile(file);setReview(false);setError('');setDate(r.date??today());setNotes(r.operation?`Operación ${r.operation}`:'');setCmId('');setSelected([]);setAmount(amt);
    const match=matchCollection(db.coverages.map(c=>({id:c.id,startsAt:c.startsAt,agreedCents:expectedIncome(c),pendingCents:collectionPending(db,c),client:c.client,salon:db.salons.find(s=>s.id===c.salonId)?.name??''})),amt,r.date,r.senderName);
    setCoverageId(match?.id??'');
    setScanInfo(match?`Cobro de ${read(r)}${r.senderName?` de ${r.senderName}`:''}: es de ${db.coverages.find(c=>c.id===match.id)?.name}. Revisá y confirmá.`:`Cobro de ${read(r)}${r.senderName?` de ${r.senderName}`:''}. No encontré una fiesta con ese saldo: elegila.`);
    setModal(true);
  };
  // hint: si se cargó desde "Registrar cobro" o "Liquidar CM" y no se pudo saber qué es, se toma esa.
  // Con lo leído: cobro de un salón o pago a una CM, ya completo para confirmar.
  const applyRead=(r:TransferData,file:File,hint?:'cobros'|'pagos')=>{
    const kind=classifyTransfer(db.cms,r,ownerWords)?.kind??(hint==='cobros'?'cobro':hint==='pagos'?'pago':null);
    if(kind==='pago')applyPago(r,file);else if(kind==='cobro')applyCobro(r,file);else setUnsure({r,file});
  };
  // Comprobante leído desde el inicio ("Cargar comprobante"): se abre acá ya completo.
  const [handedOff]=useState(()=>takeTransfer());
  useEffect(()=>{if(handedOff){applyRead(handedOff.data,handedOff.file);window.history.replaceState(null,'','/pagos');}},[handedOff]); // eslint-disable-line react-hooks/exhaustive-deps
  const scanTransfer=async(file?:File,hint?:'cobros'|'pagos')=>{
    if(!file)return;
    setScanning(true);setScanInfo('');setError('');setReview(false);
    try{
      const small=await shrink(file);
      const body=new FormData();body.append('file',new File([small],file.name,{type:small.type||file.type}));
      const res=await fetch('/api/transfer-scan',{method:'POST',body});const data=await res.json().catch(()=>({}));
      if(!res.ok){toast.error(`${data.error||'No se pudo leer el comprobante.'} Completá los datos a mano.`);return;}
      const r=data as TransferData;
      if(!r.isTransfer){toast.error('No parece el comprobante de una transferencia. Revisá el archivo.');return;}
      applyRead(r,file,hint);
    }catch(e){console.error('Cargar comprobante',e);toast.error(`Falló la app al usar el comprobante: ${e instanceof Error?e.message:String(e)}`);}
    finally{setScanning(false);}
  };
  const [editing,setEditing]=useState<{kind:'cobro'|'pago';id:string}|null>(null);
  const overList=db.coverages.map(c=>({c,over:overCollected(db,c)})).filter(x=>x.over>0);
  const open=(kind:'cobros'|'pagos',target='')=>{setTransferFile(null);setScanInfo('');setReview(false);setTab(kind);setCoverageId(kind==='cobros'?target:'');setCmId(kind==='pagos'?target:'');const items=concepts(db).filter(x=>x.cmId===target&&x.pendingCents>0);setSelected(kind==='pagos'?items.map(x=>x.id):[]);const c=db.coverages.find(c=>c.id===target);setAmount(kind==='pagos'?items.reduce((s,x)=>s+x.pendingCents,0):c?collectionPending(db,c):0);setDate(today());setNotes('');setError('');setModal(true)};
  const openFor=(coverageId:string,target:string)=>{open('pagos',target);const items=concepts(db).filter(x=>x.cmId===target&&x.coverageId===coverageId&&x.pendingCents>0);setSelected(items.map(x=>x.id));setAmount(items.reduce((s,x)=>s+x.pendingCents,0));};
  const available=db.coverages.filter(c=>collectionPending(db,c)>0);const availableCms=db.cms.filter(cm=>concepts(db).some(x=>x.cmId===cm.id&&x.pendingCents>0));const cmConcepts=concepts(db).filter(x=>x.cmId===cmId&&x.pendingCents>0);const selectedTotal=cmConcepts.filter(x=>selected.includes(x.id)).reduce((s,x)=>s+x.pendingCents,0);
  const saveCollection=(e:React.FormEvent)=>{e.preventDefault();const message=validateCollection(db,coverageId,amount);if(message){setError(message);return}if(!date){setError('Elegí una fecha.');return}if(!review){setReview(true);return;}const id=newId();update(db=>({...db,collections:[...db.collections,{id,coverageId,date,amountCents:amount,notes:notes.trim()}]}));if(transferFile){setPendingReceipt({target:'collection',id,file:transferFile,sawSaving:false});setTransferFile(null);setScanInfo('');}setModal(false);flash();toast.success(transferFile?'Cobro registrado con su comprobante.':'Cobro registrado')};
  const savePayment=(e:React.FormEvent)=>{e.preventDefault();try{const allocations=allocatePayment(db,cmId,selected,amount);if(!date)throw new Error('Elegí una fecha.');if(!review){setReview(true);return;}const id=newId();update(db=>({...db,cmPayments:[...db.cmPayments,{id,cmId,date,allocations,notes:notes.trim()}]}));if(transferFile){setPendingReceipt({target:'payment',id,file:transferFile,sawSaving:false});setTransferFile(null);setScanInfo('');}setModal(false);flash();toast.success(transferFile?'Pago registrado con su comprobante.':'Pago registrado. Podés adjuntar la transferencia desde la fiesta.')}catch(x){setError(x instanceof Error?x.message:'No se pudo registrar el pago.')}};
  const isIn=tab==='cobros';
  return <div className="space-y-7"><div className="page-heading"><div><h1 className="page-title">Pagos</h1><p className="muted mt-2">Lo que te debe el salón y lo que le debés al equipo.</p></div><div><input ref={topInput} type="file" accept="image/*,application/pdf" hidden onChange={e=>{void scanTransfer(e.target.files?.[0]);e.target.value='';}}/><button className="btn btn-primary" disabled={scanning} onClick={()=>topInput.current?.click()}><ScanLine size={18}/>{scanning?'Leyendo comprobante…':'Cargar comprobante'}</button><p className="muted mt-2 max-w-[28ch] text-xs">Subí cualquier transferencia: la app se da cuenta si es un cobro o un pago.</p></div></div>
    <div className="coverage-view-switch" role="tablist" aria-label="Tipo de movimiento"><button role="tab" aria-selected={isIn} className={isIn?'selected':''} onClick={()=>setTab('cobros')}><ArrowDownLeft size={17}/> Cobros del salón</button><button role="tab" aria-selected={!isIn} className={!isIn?'selected':''} onClick={()=>setTab('pagos')}><ArrowUpRight size={17}/> Pagos a las CM</button></div>
    {isIn&&overList.length>0&&<section className="over-warning" aria-label="Cobrado de más"><p className="font-bold"><TriangleAlert size={17}/> Hay cobros por encima de lo acordado</p><ul>{overList.map(({c,over})=>{const last=db.collections.filter(x=>x.coverageId===c.id).sort((a,b)=>b.date.localeCompare(a.date))[0];return <li key={c.id}><span>{c.name}: cobraste <b>{ars(over)}</b> de más.</span>{last&&<button className="btn btn-secondary btn-small" onClick={()=>setEditing({kind:'cobro',id:last.id})}>Corregir cobro</button>}</li>})}</ul><p className="text-sm">Puede ser un cobro cargado antes de bajar el acordado. Si el salón realmente pagó de más, dejalo y anotá la devolución en las observaciones.</p></section>}
    <section className="ledger-card card" aria-labelledby="ledger-title"><div className="ledger-head"><div><h2 id="ledger-title" className="section-title">{isIn?'Falta cobrar':'Falta pagar'}</h2><p className="ledger-total">{ars(isIn?totalPendingCollections(db):totalPendingPayments(db))}</p></div><button className="btn btn-primary" onClick={()=>open(isIn?'cobros':'pagos')} disabled={isIn?!available.length:!availableCms.length}>{isIn?'Registrar cobro':'Liquidar CM'}</button></div></section>
    <PaymentsByEvent key={tab} db={db} kind={tab} onRegister={(coverageId,cmId)=>cmId?openFor(coverageId,cmId):open('cobros',coverageId)} onEdit={setEditing}/>
    {editing&&<EditMovement kind={editing.kind} id={editing.id} db={db} update={update} undoable={undoable} onClose={()=>setEditing(null)}/>}
    {unsure&&<Modal title="¿Qué es esta transferencia?" onClose={()=>setUnsure(null)}><div className="space-y-4"><p>{read(unsure.r)}{unsure.r.recipientName?` · para ${unsure.r.recipientName}`:''}{unsure.r.senderName?` · de ${unsure.r.senderName}`:''}</p><p className="muted text-sm">No pude saber si te la mandaron o la mandaste vos.</p><div className="grid gap-2"><button className="btn btn-primary" onClick={()=>{const u=unsure;setUnsure(null);applyCobro(u.r,u.file);}}><ArrowDownLeft size={17}/> Me pagó un salón</button><button className="btn btn-secondary" onClick={()=>{const u=unsure;setUnsure(null);applyPago(u.r,u.file);}}><ArrowUpRight size={17}/> Le pagué a una CM</button></div></div></Modal>}
    {modal&&<Modal title={tab==='cobros'?'Registrar cobro':'Liquidar CM'} onClose={()=>setModal(false)}>{tab==='cobros'?<form onChange={()=>setReview(false)} onSubmit={saveCollection} className="space-y-4"><div className="scan-transfer"><input ref={scanInput} type="file" accept="image/*,application/pdf" hidden onChange={e=>{void scanTransfer(e.target.files?.[0],tab);e.target.value='';}}/><button type="button" className="btn btn-secondary w-full" disabled={scanning} onClick={()=>scanInput.current?.click()}><ScanLine size={17}/>{scanning?'Leyendo comprobante…':transferFile?'Cambiar comprobante':'Cargar desde comprobante'}</button>{scanInfo&&<p className="mt-2 text-sm" role="status">{scanInfo}</p>}{transferFile&&<p className="muted mt-1 inline-flex items-center gap-1 text-sm"><Paperclip size={13}/> El comprobante se adjunta solo al confirmar.</p>}{!transferFile&&!scanInfo&&<p className="muted mt-2 text-xs">Subí la captura de la transferencia y se completa todo.</p>}</div><label><span className="label">Cobertura *</span><select className="field" value={coverageId} onChange={e=>{setCoverageId(e.target.value);if(!transferFile)setAmount(0)}} required><option value="">Seleccionar cobertura</option>{available.map(c=><option key={c.id} value={c.id}>{c.name} · {ars(collectionPending(db,c))}</option>)}</select></label>{coverageId&&db.coverages.some(c=>c.id===coverageId)&&<p className="rounded-lg bg-[var(--accent-soft)] p-3 text-sm">Saldo pendiente: <b>{ars(collectionPending(db,db.coverages.find(c=>c.id===coverageId)!))}</b></p>}<MoneyField label="Importe cobrado *" value={amount} onChange={setAmount}/><label><span className="label">Fecha *</span><input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label><span className="label">Observaciones</span><textarea className="field" value={notes} onChange={e=>setNotes(e.target.value)}/></label>{error&&<p role="alert" className="text-sm font-semibold text-[var(--danger)]">{error}</p>}<Receipt kind="Cobro del salón" who={db.coverages.find(c=>c.id===coverageId)?.name||'Elegí una cobertura'} date={date?dateLabel(date):'Elegí una fecha'} detail={notes} amount={ars(amount)} review={review} hint="Revisá el importe y confirmá para guardarlo."/><button className="btn btn-primary w-full">{review?'Confirmar cobro':'Revisar cobro'}</button></form>:<form onChange={()=>setReview(false)} onSubmit={savePayment} className="space-y-4"><div className="scan-transfer"><input ref={scanInput} type="file" accept="image/*,application/pdf" hidden onChange={e=>{void scanTransfer(e.target.files?.[0],tab);e.target.value='';}}/><button type="button" className="btn btn-secondary w-full" disabled={scanning} onClick={()=>scanInput.current?.click()}><ScanLine size={17}/>{scanning?'Leyendo comprobante…':transferFile?'Cambiar comprobante':'Cargar desde comprobante'}</button>{scanInfo&&<p className="mt-2 text-sm" role="status">{scanInfo}</p>}{transferFile&&<p className="muted mt-1 inline-flex items-center gap-1 text-sm"><Paperclip size={13}/> El comprobante se adjunta solo al confirmar.</p>}{!transferFile&&!scanInfo&&<p className="muted mt-2 text-xs">Subí la captura de la transferencia y se completa todo.</p>}</div><label><span className="label">CM *</span><select className="field" value={cmId} onChange={e=>{const id=e.target.value;setCmId(id);if(transferFile&&amount>0){setSelected(conceptsFor(concepts(db).filter(x=>x.cmId===id&&x.pendingCents>0),amount));}else{setSelected([]);setAmount(0)}}} required><option value="">Seleccionar CM</option>{availableCms.map(cm=><option key={cm.id} value={cm.id}>{cm.name}</option>)}</select></label>{cmId&&<fieldset><legend className="label">Conceptos pendientes *</legend><div className="space-y-2">{cmConcepts.map(c=><label key={c.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--line)] p-3"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>{const ids=e.target.checked?[...selected,c.id]:selected.filter(x=>x!==c.id);setSelected(ids);setAmount(cmConcepts.filter(x=>ids.includes(x.id)).reduce((s,x)=>s+x.pendingCents,0))}}/><span className="flex-1 text-sm">{c.label}</span><b className="text-sm">{ars(c.pendingCents)}</b></label>)}</div></fieldset>}<div className="rounded-xl bg-[var(--accent-soft)] p-4 text-sm"><div className="flex justify-between"><span>Total seleccionado</span><b>{ars(selectedTotal)}</b></div><p className="muted mt-1 text-xs">Podés pagar una parte. Se aplica a los conceptos seleccionados en el orden mostrado.</p></div><MoneyField label="Importe a pagar *" value={amount} onChange={setAmount}/>{cmId&&(()=>{const cm=db.cms.find(c=>c.id===cmId);return cm?<MpTransfer name={cm.name} alias={cm.alias} amountCents={amount>0?amount:0}/>:null})()}<label><span className="label">Fecha *</span><input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label><span className="label">Observaciones</span><textarea className="field" value={notes} onChange={e=>setNotes(e.target.value)}/></label>{error&&<p role="alert" className="text-sm font-semibold text-[var(--danger)]">{error}</p>}<Receipt kind="Pago a una CM" who={db.cms.find(c=>c.id===cmId)?.name||'Elegí una CM'} date={date?dateLabel(date):'Elegí una fecha'} detail={`${selected.length} ${selected.length===1?'concepto':'conceptos'}`} amount={ars(amount)} review={review} hint="Revisá la destinataria y el importe antes de confirmar."/><button className="btn btn-primary w-full">{review?'Confirmar pago':'Revisar pago'}</button></form>}</Modal>}
  </div>;
}
function Receipt({kind,who,date,detail,amount,review,hint}:{kind:string;who:string;date:string;detail:string;amount:string;review:boolean;hint:string}){return <div className={`receipt ${review?'is-review':''}`}><p className="receipt-kind">{kind}</p><p className="receipt-who">{who}</p><dl className="receipt-rows"><div><dt>Fecha</dt><dd>{date}</dd></div>{detail&&<div><dt>Detalle</dt><dd>{detail}</dd></div>}</dl><div className="receipt-total"><span>Total</span><strong>{amount}</strong></div>{review&&<p role="status" className="receipt-hint">{hint}</p>}</div>}

/** Corregir o anular un cobro o un pago ya registrado. Cada cambio queda en el historial de la base. */
function EditMovement({kind,id,db,update,undoable,onClose}:{kind:'cobro'|'pago';id:string;db:Db;update:(fn:(db:Db)=>Db)=>void;undoable:Undoable;onClose:()=>void}){
  const {saveState}=useStore();
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
    // Se anula al toque; unos segundos para deshacerlo.
    onClose();
    if(collection){const index=db.collections.findIndex(x=>x.id===id);undoable(`Anulaste ${what}`,db=>({...db,collections:db.collections.filter(x=>x.id!==id)}),db=>({...db,collections:reinsert(db.collections,collection,index)}));}
    else{const index=db.cmPayments.findIndex(x=>x.id===id);undoable(`Anulaste ${what}`,db=>({...db,cmPayments:db.cmPayments.filter(x=>x.id!==id)}),db=>({...db,cmPayments:reinsert(db.cmPayments,payment!,index)}));}
  };
  return <Modal title={collection?'Corregir cobro':'Corregir pago'} onClose={onClose}>
    <form className="space-y-4" onSubmit={save}>
      <p className="font-bold">{title}</p>
      {collection?<MoneyField label="Importe cobrado" value={amount} onChange={setAmount}/>
        :<div className="space-y-2"><dl className="receipt-rows">{payment!.allocations.map((a,i)=><div key={i}><dt>{labels.get(a.conceptId)??'Concepto'}</dt><dd>{ars(a.amountCents)}</dd></div>)}<div><dt className="font-bold">Total</dt><dd className="font-bold">{ars(paymentTotal(payment!))}</dd></div></dl><p className="muted text-sm">Para cambiar el importe, anulá este pago y registralo de nuevo.</p></div>}
      <label className="block"><span className="label">Fecha</span><input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label className="block"><span className="label">Observaciones</span><textarea className="field" value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      {collection&&<div><span className="label">Comprobante de la transferencia</span><ReceiptControl target="collection" expenseId={collection.id} path={collection.receiptPath} disabledReason={saveState==='saved'?undefined:'Se puede adjuntar cuando termine de guardarse el cobro.'} onChange={path=>update(db=>({...db,collections:db.collections.map(x=>x.id===collection.id?{...x,receiptPath:path??undefined}:x)}))}/></div>}
      {payment&&<div><span className="label">Comprobante de la transferencia</span><ReceiptControl target="payment" expenseId={payment.id} path={payment.receiptPath} disabledReason={saveState==='saved'?undefined:'Se puede adjuntar cuando termine de guardarse el pago.'} onChange={path=>update(db=>({...db,cmPayments:db.cmPayments.map(x=>x.id===payment.id?{...x,receiptPath:path??undefined}:x)}))}/><p className="muted mt-2 text-sm">{title?.split(' ')[0]} lo ve en sus pagos recibidos.</p></div>}
      {error&&<p role="alert" className="field-error">{error}</p>}
      <button className="btn btn-primary w-full">Guardar cambios</button>
      <button type="button" className="btn btn-danger w-full" onClick={annul}>{collection?'Anular cobro':'Anular pago'}</button>
    </form>
  </Modal>;
}
