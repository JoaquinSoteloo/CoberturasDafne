'use client';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useStore } from './store';
import { newId } from '@/lib/repository';
import { dayKey } from '@/lib/calendar';
import type { Coverage } from '@/lib/types';
const schema=z.object({name:z.string().trim().min(1,'Ingresá el nombre del evento.'),startsAt:z.string().min(1,'Elegí fecha y hora.').refine(v=>Number.isFinite(new Date(v).getTime()),'Revisá la fecha.'),salonId:z.string().min(1,'Elegí un salón.'),cmId:z.string(),fee:z.string().refine(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0,'Ingresá un honorario válido.')});
type Values=z.infer<typeof schema>;
export function QuickCoverageForm({defaultDate,onDone}:{defaultDate?:string;onDone?:()=>void}){
 const {db,update}=useStore();const router=useRouter();const {register,handleSubmit,watch,formState:{errors,isSubmitting}}=useForm<Values>({resolver:zodResolver(schema),defaultValues:{name:'',startsAt:(defaultDate||dayKey(new Date()))+'T20:00',salonId:db.salons[0]?.id||'',cmId:'',fee:'0'}});
 const cm=watch('cmId');
 const save=(v:Values)=>{const c:Coverage={id:newId(),name:v.name,startsAt:v.startsAt,salonId:v.salonId,client:'',partyType:'',address:'',endsAt:'',notes:'',assignments:v.cmId?[{id:newId(),cmId:v.cmId,feeCents:Math.round(Number(v.fee)*100),confirmation:'pendiente'}]:[],agreedCents:0,expenses:[],checklist:[],driveUrl:'',deliveredPieces:0,deliveryNotes:'',eventStatus:'pendiente',deliveryStatus:'pendiente'};update(db=>({...db,coverages:[...db.coverages,c]}));toast.success('Cobertura creada');onDone?.();router.push(`/coberturas/${c.id}`)};
 if(!db.salons.length)return <div className="space-y-4"><p>Para crear una cobertura primero cargá el salón donde se hace la fiesta.</p><Link href="/equipo#salons-title" className="btn btn-primary w-full" onClick={onDone}>Cargar un salón</Link></div>;
 return <form className="space-y-5" onSubmit={handleSubmit(save)} noValidate><p className="muted text-sm">Agendá la fiesta. Después podés completar los importes, el contenido y los gastos.</p><label className="block"><span className="label">Nombre del evento</span><input className="field" placeholder="Ej. 15 de Sofía" {...register('name')} aria-invalid={!!errors.name} aria-describedby={errors.name?'name-error':undefined}/>{errors.name&&<p id="name-error" role="alert" className="field-error">{errors.name.message}</p>}</label><label className="block"><span className="label">Fecha y hora</span><input className="field" type="datetime-local" {...register('startsAt')} aria-invalid={!!errors.startsAt}/>{errors.startsAt&&<p role="alert" className="field-error">{errors.startsAt.message}</p>}</label><label className="block"><span className="label">Salón</span><select className="field" {...register('salonId')}>{db.salons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>{errors.salonId&&<p role="alert" className="field-error">{errors.salonId.message}</p>}</label><label className="block"><span className="label">CM · opcional</span><select className="field" {...register('cmId')}><option value="">Asignar más adelante</option>{db.cms.map(cm=><option key={cm.id} value={cm.id}>{cm.name}</option>)}</select></label>{cm&&<label className="block"><span className="label">Honorario acordado ($)</span><input className="field" type="number" inputMode="decimal" step="0.01" min="0" {...register('fee')}/>{errors.fee&&<p role="alert" className="field-error">{errors.fee.message}</p>}<p className="muted mt-2 text-sm">Podés dejarlo en $0 y completarlo después.</p></label>}<button className="btn btn-primary w-full" disabled={isSubmitting}>Crear cobertura</button></form>;
}
