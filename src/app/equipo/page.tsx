'use client';

import { useState } from 'react';
import { Plus, Pencil, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CmForm } from '@/components/cm-form';
import { Avatar } from '@/components/avatar';
import { useCmPushStatus } from '@/components/cm-push-status';
import { SalonLocationField } from '@/components/salon-location';
import Link from 'next/link';
import { useStore } from '@/components/store';
import { Modal } from '@/components/ui';
import { newId } from '@/lib/repository';
import { ars } from '@/lib/money';
import { cmPending, cmCoverageHistory } from '@/lib/domain';
import type { Salon } from '@/lib/types';

export default function Team(){
  const router=useRouter();
  const {db,update}=useStore(); const [adding,setAdding]=useState(false); const [error,setError]=useState('');
  const pushStatus=useCmPushStatus();
  const [salon,setSalon]=useState<Salon|null>(null);
  const saveSalon=(e:React.FormEvent)=>{e.preventDefault();if(!salon)return;if(!salon.name.trim()){setError('Ingresá el nombre del salón.');return}const clean={...salon,name:salon.name.trim(),address:salon.address.trim()};update(db=>({...db,salons:db.salons.some(x=>x.id===clean.id)?db.salons.map(x=>x.id===clean.id?clean:x):[...db.salons,clean]}));setSalon(null);setError('')};
  return <div className="space-y-7"><div className="page-heading"><h1 className="page-title">Equipo</h1><button className="btn btn-secondary btn-small" onClick={()=>setAdding(true)}><Plus size={16}/> Agregar CM</button></div><div className="team-grid">{db.cms.map(cm=>{const owed=cmPending(db,cm.id);const upcoming=cmCoverageHistory(db,cm.id).filter(h=>h.coverage.eventStatus==='pendiente'&&new Date(h.coverage.startsAt)>=new Date()).length;const push=pushStatus[cm.id];const pushText=!push?'':!push.has_account?'Sin cuenta':push.devices?'Avisos activados':'Sin avisos';
      return <Link key={cm.id} href={`/equipo/${cm.id}`} className="card team-tile">
        <Avatar name={cm.name} photoPath={cm.photoPath} size={64}/>
        <span className="block font-extrabold leading-tight line-clamp-2">{cm.name}</span>
        {owed>0?<span className="badge badge-warn">Le debés {ars(owed)}</span>:<span className="badge badge-success">Al día</span>}
        <span className="muted text-xs">{upcoming===0?'Sin fechas próximas':upcoming===1?'1 fecha próxima':`${upcoming} fechas próximas`}{pushText&&<><br/>{pushText}</>}</span>
      </Link>})}</div>
    {db.cms.length===0&&<p className="muted">Todavía no cargaste a nadie del equipo.</p>}
    <section className="space-y-3 pt-4" aria-labelledby="salons-title"><div className="section-heading"><div><h2 id="salons-title" className="section-title">Salones</h2><p className="muted text-sm">Hace falta al menos uno para crear una cobertura.</p></div><button className="btn btn-secondary btn-small" onClick={()=>{setError('');setSalon({id:newId(),name:'',address:''})}}><Plus size={18}/> Agregar salón</button></div>
      {db.salons.length?<ul className="ledger card">{db.salons.map(x=><li key={x.id} className="ledger-row"><MapPin size={20} className="shrink-0 text-[var(--rosa)]"/><span className="min-w-0 flex-1"><span className="block font-bold">{x.name}</span><span className="muted block text-sm">{x.address||'Sin dirección'}</span><span className={`block text-sm ${x.lat!=null?'text-[var(--ok)]':'muted'}`}>{x.lat!=null?'Ubicación fijada: se puede pedir Uber':'Sin ubicación fijada'}</span></span><button className="btn btn-quiet btn-small" onClick={()=>{setError('');setSalon({...x})}}><Pencil size={15}/> Editar</button></li>)}</ul>:<p className="muted">Todavía no hay salones cargados.</p>}
    </section>
    {salon&&<Modal title={db.salons.some(x=>x.id===salon.id)?'Editar salón':'Agregar salón'} onClose={()=>{setSalon(null);setError('')}}><form onSubmit={saveSalon} className="space-y-4"><label className="block"><span className="label">Nombre *</span><input className="field" value={salon.name} onChange={e=>setSalon({...salon,name:e.target.value})} placeholder="Ej. Eclipse" required/></label><label className="block"><span className="label">Dirección</span><input className="field" value={salon.address} onChange={e=>setSalon({...salon,address:e.target.value})}/></label><SalonLocationField address={salon.address} coords={salon.lat!=null&&salon.lng!=null?{lat:salon.lat,lng:salon.lng}:null} onChange={c=>setSalon(c?{...salon,lat:c.lat,lng:c.lng}:{...salon,lat:undefined,lng:undefined})}/>{error&&<p role="alert" className="field-error">{error}</p>}<button type="submit" className="btn btn-primary w-full">Guardar salón</button></form></Modal>}
    {adding&&<Modal title="Agregar CM" onClose={()=>setAdding(false)}><CmForm onDone={cm=>{setAdding(false);router.push(`/equipo/${cm.id}${cm.email?'?acceso=1':''}`)}}/></Modal>}
  </div>;
}


