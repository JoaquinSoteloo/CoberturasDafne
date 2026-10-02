'use client';

import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useStore } from '@/components/store';
import { Meter, Modal, shortDay } from '@/components/ui';
import { newId } from '@/lib/repository';
import { ars } from '@/lib/money';
import { cmPending, cmCoverageHistory } from '@/lib/domain';
import type { Cm } from '@/lib/types';

export default function Team(){
  const {db,update}=useStore(); const [edit,setEdit]=useState<Cm|null>(null); const [open,setOpen]=useState(false); const [error,setError]=useState('');
  const save=(e:React.FormEvent)=>{e.preventDefault();if(!edit)return;if(!edit.name.trim()){setError('Ingresá el nombre.');return}update(db=>({...db,cms:db.cms.some(x=>x.id===edit.id)?db.cms.map(x=>x.id===edit.id?edit:x):[...db.cms,edit]}));setOpen(false);setEdit(null);setError('')};
  const start=(cm?:Cm)=>{setEdit(cm?{...cm}:{id:newId(),name:'',phone:'',usualFeeCents:0,notes:''});setOpen(true)};
  return <div className="space-y-7"><div className="page-heading"><div><h1 className="page-title">Equipo</h1><p className="muted mt-2">Lo que se le debe a cada CM y sus próximas fiestas.</p></div><button className="btn btn-primary" onClick={()=>start()}><Plus size={19}/> Agregar CM</button></div><div className="team-list">{db.cms.map(cm=>{const history=cmCoverageHistory(db,cm.id);const total=history.reduce((s,h)=>s+h.totalCents,0);const paid=history.reduce((s,h)=>s+h.paidCents,0);const owed=cmPending(db,cm.id);const next=history.filter(h=>h.coverage.eventStatus==='pendiente'&&new Date(h.coverage.startsAt)>=new Date()).sort((a,b)=>a.coverage.startsAt.localeCompare(b.coverage.startsAt)).slice(0,3);return <section key={cm.id} className="card team-card" aria-labelledby={`cm-${cm.id}`}>
      <div className="team-top"><span className="team-avatar" aria-hidden="true">{cm.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span><div className="min-w-0 flex-1"><h2 id={`cm-${cm.id}`} className="text-lg font-extrabold">{cm.name}</h2><p className="muted text-sm">{cm.phone?<a className="underline-offset-4 hover:underline" href={`tel:${cm.phone.replace(/[^+0-9]/g,'')}`}>{cm.phone}</a>:'Sin teléfono'}</p>{cm.notes&&<p className="muted mt-1 text-sm">{cm.notes}</p>}</div><div className="team-owed"><span>{owed>0?'Se le debe':'Al día'}</span><strong>{ars(owed)}</strong></div></div>
      {total>0&&<div className="mt-4"><Meter done={paid} total={total} label={`Pagado ${ars(paid)} de ${ars(total)}`}/><p className="muted mt-2 text-sm">Pagado {ars(paid)} de {ars(total)}</p></div>}
      <div className="mt-4">{next.length?<ul className="date-chips" aria-label="Próximas fiestas">{next.map(({coverage:c})=>{const d=shortDay(c.startsAt);return <li key={c.id}><Link href={`/coberturas/${c.id}`}><span className="chip-date"><strong>{d.day}</strong> {d.month}</span>{c.name}</Link></li>})}</ul>:<p className="muted text-sm">Sin fiestas asignadas por delante.</p>}</div>
      <div className="team-actions"><Link href={`/pagos?tab=pagos&cm=${cm.id}&action=registrar`} className="btn btn-secondary">Registrar pago</Link><button className="btn btn-quiet" onClick={()=>start(cm)}><Pencil size={16}/> Editar</button></div>
      <details className="team-history"><summary className="cursor-pointer font-bold">Historial de {history.length} {history.length===1?'cobertura':'coberturas'}</summary>{history.length?<ul className="ledger mt-3">{history.map(({coverage:c,totalCents,paidCents,pendingCents,hasReimbursements})=>{const d=shortDay(c.startsAt);return <li key={c.id}><Link href={`/coberturas/${c.id}`} className="ledger-row"><span className="ledger-date"><strong>{d.day}</strong>{d.month}</span><span className="min-w-0 flex-1"><span className="block font-bold">{c.name}</span><span className="muted block text-sm">{c.eventStatus==='cancelado'?'Cancelada, no suma al total':`Pagado ${ars(paidCents)} de ${ars(totalCents)}${hasReimbursements?', con reintegros':''}`}</span></span><span className="ledger-amount">{pendingCents>0?ars(pendingCents):'Saldada'}</span></Link></li>})}</ul>:<p className="muted mt-3 text-sm">Todavía no participó en coberturas.</p>}</details></section>})}</div>
    {open&&edit&&<Modal title={db.cms.some(x=>x.id===edit.id)?'Editar CM':'Agregar CM'} onClose={()=>{setOpen(false);setError('')}}><form onSubmit={save} className="space-y-4"><label><span className="label">Nombre *</span><input className="field" value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})} required/></label><label><span className="label">Teléfono</span><input className="field" type="tel" value={edit.phone} onChange={e=>setEdit({...edit,phone:e.target.value})}/></label><label><span className="label">Notas</span><textarea className="field" value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})}/></label>{error&&<p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}<button type="submit" className="btn btn-primary w-full">Guardar CM</button></form></Modal>}
  </div>;
}


