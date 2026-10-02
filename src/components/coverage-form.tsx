'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useStore } from './store';
import { MoneyField } from './ui';
import { newId } from '@/lib/repository';
import { ars } from '@/lib/money';
import { collected, conceptPaid, expectedIncome, expenseIsPaid } from '@/lib/domain';
import { newChecklistItems, parseChecklistIdeas } from '@/lib/checklist';
import { tripTimestamp } from '@/lib/trip';
import type { Coverage, Expense } from '@/lib/types';

const localNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T20:00`; };
const blank = (salonId: string, address: string): Coverage => ({ id: newId(), name:'', partyType:'', client:'', salonId, address, startsAt:localNow(), endsAt:'', notes:'', assignments:[], agreedCents:0, expenses:[], checklist:[], driveUrl:'', deliveredPieces:0, deliveryNotes:'', eventStatus:'pendiente', deliveryStatus:'pendiente' });
export function CoverageForm({ initial, onDone, defaultDate, section }: { initial?: Coverage; onDone?: () => void; defaultDate?: string; section?: 'event'|'team'|'expenses'|'content' }) {
  const { db, update } = useStore(); const router = useRouter();
  const [form, setForm] = useState<Coverage>(() => initial ? {...structuredClone(initial), expenses:initial.expenses.map(x=>({...x,paymentStatus:expenseIsPaid(db,x)?'pagado':'pendiente'}))} : {...blank(db.salons[0]?.id || '', ''),...(defaultDate?{startsAt:defaultDate+'T20:00'}:{})});
  const [error, setError] = useState(''); const [ideas, setIdeas] = useState('');
  const change = <K extends keyof Coverage>(key: K, value: Coverage[K]) => setForm(f => ({ ...f, [key]: value }));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.salonId) { setError('Completá el nombre y el salón.'); return; }
    if (!form.startsAt || !Number.isFinite(new Date(form.startsAt).getTime())) { setError('Ingresá la fecha y hora del evento.'); return; }
    if (form.agreedCents < 0 || form.assignments.some(a => a.feeCents < 0) || form.expenses.some(x => x.amountCents <= 0)) { setError('Revisá los importes: los gastos deben ser mayores a cero.'); return; }
    if (form.assignments.some((a,i) => form.assignments.findIndex(x => x.cmId === a.cmId) !== i)) { setError('Una CM no puede estar asignada dos veces a la misma cobertura.'); return; }
    if (form.expenses.some((x,i) => form.expenses.findIndex(y => y.kind === x.kind && y.label.trim().toLowerCase() === x.label.trim().toLowerCase() && y.amountCents === x.amountCents && y.advancedBy === x.advancedBy && y.absorbedBy === x.absorbedBy) !== i)) { setError('Hay un gasto duplicado. Revisá concepto e importe.'); return; }
    if (form.expenses.some(x => x.advancedBy === 'cm' && !form.assignments.some(a => a.cmId === x.advancedCmId))) { setError('Cada gasto adelantado por una CM debe corresponder a una CM asignada.'); return; }
    if (initial?.assignments.some(old => { const current=form.assignments.find(x=>x.id===old.id); const paid=conceptPaid(db,`fee:${old.id}`); return paid>0 && (!current || current.cmId!==old.cmId || current.feeCents<paid); })) { setError('No podés quitar o cambiar una asignación ya liquidada, ni reducir su honorario por debajo de lo pagado.'); return; }
    if (initial?.expenses.some(old => { const current=form.expenses.find(x=>x.id===old.id); const paid=conceptPaid(db,`expense:${old.id}`); return paid>0 && (!current || current.advancedBy!=='cm' || current.advancedCmId!==old.advancedCmId || current.amountCents<paid); })) { setError('No podés quitar o cambiar un reintegro ya liquidado, ni reducirlo por debajo de lo pagado.'); return; }
    if (form.deliveryStatus === 'entregada' && !form.driveUrl.trim() && !form.deliveredPieces) { setError('Para marcar la entrega, cargá un link de Drive o la cantidad de piezas.'); return; }
    setError('');
    if (form.expenses.some(x=>x.kind==='uber' && x.paymentStatus==='pendiente' && conceptPaid(db,`expense:${x.id}`)>=x.amountCents)) { setError('Este Uber ya fue liquidado. No se puede marcar como pendiente sin ajustar el pago registrado.'); return; }
    const cleaned = { ...form, name:form.name.trim(), client:form.client.trim(), partyType:form.partyType.trim(), address:form.address.trim(), notes:form.notes.trim(), checklist:[...form.checklist,...newChecklistItems(ideas,form.checklist,newId)] };
    // Lo que pasó con la primera fiesta: el acordado se bajó después de registrar el cobro.
    if (initial && expectedIncome(cleaned) < collected(db, cleaned.id) && !confirm(`Ya registraste cobros por ${ars(collected(db, cleaned.id))} y lo acordado queda en ${ars(expectedIncome(cleaned))}. Si el cobro fue por el monto viejo, después corregilo desde Pagos. ¿Guardar igual?`)) return;
    update(db => {
      const settlements=form.expenses.filter(x=>x.kind==='uber'&&x.paymentStatus==='pagado'&&x.advancedBy==='cm'&&x.advancedCmId).flatMap(x=>{
        const remainder=x.amountCents-conceptPaid(db,`expense:${x.id}`);
        return remainder>0?[{id:newId(),cmId:x.advancedCmId!,date:localNow().slice(0,10),allocations:[{conceptId:`expense:${x.id}`,amountCents:remainder}],notes:'Pago de Uber registrado desde la cobertura'}]:[];
      });
      return {...db,coverages:initial?db.coverages.map(c=>c.id===initial.id?cleaned:c):[...db.coverages,cleaned],cmPayments:[...db.cmPayments,...settlements]};
    });
    toast.success('Cambios guardados');
    if (onDone) onDone(); else router.push(`/coberturas/${form.id}`);
  };
  const addAssignment = () => {
    const cm = db.cms.find(x => !form.assignments.some(a => a.cmId === x.id));
    if (!cm) { setError('No quedan CM disponibles para asignar.'); return; }
    change('assignments', [...form.assignments, { id:newId(), cmId:cm.id, feeCents:cm.usualFeeCents, confirmation:'pendiente' }]);
  };
  const addExpense = (kind: Expense['kind']) => change('expenses', [...form.expenses, { id:newId(), label:kind === 'uber' ? 'Uber de ida' : 'Otro gasto', kind, amountCents:0, ...(kind==='uber'?{paymentStatus:'pendiente' as const}:{advancedBy:'coordinadora' as const}), absorbedBy:'coordinadora' }]);
  const addIdeas = () => { const items = newChecklistItems(ideas,form.checklist,newId); if (items.length) change('checklist',[...form.checklist,...items]); setIdeas(''); };
  return <form onSubmit={save} className="space-y-7">
    {(!section||section==='event')&&<section className="grid gap-4 sm:grid-cols-2"><h3 className="section-title sm:col-span-2">Datos del evento</h3>
      <label><span className="label">Nombre del evento *</span><input className="field" value={form.name} onChange={e => change('name',e.target.value)} required/></label>
      <label><span className="label">Tipo de fiesta · opcional</span><input className="field" value={form.partyType} onChange={e => change('partyType',e.target.value)} placeholder="Ej. boda, 15 años"/></label>
      <label><span className="label">Cliente · opcional</span><input className="field" value={form.client} onChange={e => change('client',e.target.value)}/></label>
      <label><span className="label">Salón *</span><select className="field" value={form.salonId} onChange={e => { const s=db.salons.find(x=>x.id===e.target.value); setForm(f=>({...f,salonId:e.target.value,address:s?.address||f.address})); }}>{db.salons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label><span className="label">Fecha y hora *</span><input className="field" type="datetime-local" value={form.startsAt} onChange={e => change('startsAt',e.target.value)} required/></label>
      <label className="sm:col-span-2"><span className="label">Observaciones</span><textarea className="field" value={form.notes} onChange={e => change('notes',e.target.value)}/><span className="muted mt-2 block text-sm">Las ven las CM asignadas a esta fiesta.</span></label>
      <label><span className="label">Estado del evento</span><select className="field" value={form.eventStatus} onChange={e => change('eventStatus',e.target.value as Coverage['eventStatus'])}><option value="pendiente">Pendiente</option><option value="realizado">Realizado</option><option value="cancelado">Cancelado</option></select></label>
      <MoneyField label="Importe acordado con el salón" value={form.agreedCents} onChange={v => change('agreedCents',v)}/>
    </section>}
    {(!section||section==='team')&&<section><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="section-title">CM asignadas</h3><button type="button" className="btn btn-secondary" onClick={addAssignment}><Plus size={17}/> Asignar CM</button></div>
      {!form.assignments.length && <p className="muted text-sm">Todavía no hay CM asignadas.</p>}
      <div className="space-y-3">{form.assignments.map(a => <div key={a.id} className="rounded-xl border border-[var(--line)] bg-[var(--sunken)] p-3"><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label><span className="label">CM</span><select className="field" value={a.cmId} onChange={e => { const cm=db.cms.find(c=>c.id===e.target.value); change('assignments', form.assignments.map(x=>x.id===a.id ? {...x,cmId:e.target.value,feeCents:cm?.usualFeeCents||0} : x)); }}>{db.cms.map(cm=><option key={cm.id} value={cm.id}>{cm.name}</option>)}</select></label>
        <MoneyField label="Honorario acordado" value={a.feeCents} onChange={v => change('assignments',form.assignments.map(x=>x.id===a.id?{...x,feeCents:v}:x))}/>
        <button type="button" aria-label="Quitar CM" className="btn btn-danger self-end" onClick={() => { if (confirm('¿Quitar esta CM de la cobertura?')) change('assignments',form.assignments.filter(x=>x.id!==a.id)); }}><Trash2 size={18}/></button>
      </div><label className="mt-3 block"><span className="label">Confirmación</span><select className="field" value={a.confirmation} onChange={e => change('assignments',form.assignments.map(x=>x.id===a.id?{...x,confirmation:e.target.value as typeof a.confirmation}:x))}><option value="pendiente">Pendiente</option><option value="confirmada">Confirmada</option><option value="rechazada">Rechazada</option></select></label></div>)}</div>
    </section>}
    {(!section||section==='expenses')&&<section><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="section-title">Gastos y traslados</h3><div className="flex gap-2"><button type="button" className="btn btn-secondary" onClick={() => addExpense('uber')}>+ Uber</button><button type="button" className="btn btn-secondary" onClick={() => addExpense('otro')}>+ Otro</button></div></div>
      {!form.expenses.length && <p className="muted text-sm">Sin gastos registrados.</p>}
      <div className="space-y-3">{form.expenses.map(x => <div key={x.id} className="rounded-xl border border-[var(--line)] bg-[var(--sunken)] p-3"><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label><span className="label">Concepto</span><input className="field" value={x.label} onChange={e => change('expenses',form.expenses.map(z=>z.id===x.id?{...z,label:e.target.value}:z))} required/></label><MoneyField label="Importe" value={x.amountCents} onChange={v => change('expenses',form.expenses.map(z=>z.id===x.id?{...z,amountCents:v}:z))}/><button type="button" aria-label="Quitar gasto" className="btn btn-danger self-end" onClick={() => { if (confirm('¿Quitar este gasto?')) change('expenses',form.expenses.filter(z=>z.id!==x.id)); }}><Trash2 size={18}/></button></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{x.kind==='uber'?<label><span className="label">Estado del Uber</span><select className="field" value={x.paymentStatus||(expenseIsPaid(db,x)?'pagado':'pendiente')} onChange={e=>change('expenses',form.expenses.map(z=>z.id===x.id?{...z,paymentStatus:e.target.value as 'pagado'|'pendiente'}:z))}><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option></select></label>:<label><span className="label">¿Quién lo adelantó?</span><select className="field" value={x.advancedBy} onChange={e => change('expenses',form.expenses.map(z=>z.id===x.id?{...z,advancedBy:e.target.value as Expense['advancedBy'],advancedCmId:e.target.value==='cm'?form.assignments[0]?.cmId:undefined}:z))}><option value="coordinadora">Coordinadora</option><option value="cm">Una CM</option></select></label>}<label><span className="label">¿Quién absorbe el costo?</span><select className="field" value={x.absorbedBy} onChange={e => change('expenses',form.expenses.map(z=>z.id===x.id?{...z,absorbedBy:e.target.value as Expense['absorbedBy']}:z))}><option value="coordinadora">Coordinadora</option><option value="salon">Salón (reintegra aparte)</option></select></label>
        {x.kind!=='uber' && x.advancedBy==='cm' && <label className="sm:col-span-2"><span className="label">CM que adelantó</span><select className="field" value={x.advancedCmId||''} onChange={e => change('expenses',form.expenses.map(z=>z.id===x.id?{...z,advancedCmId:e.target.value}:z))}><option value="">Seleccionar CM</option>{form.assignments.map(a => <option key={a.id} value={a.cmId}>{db.cms.find(c=>c.id===a.cmId)?.name}</option>)}</select></label>}
        {x.kind==='uber' && <>
          <label><span className="label">Desde</span><input className="field" placeholder="Ej. Palermo" value={x.tripFrom??''} onChange={e => change('expenses',form.expenses.map(z=>z.id===x.id?{...z,tripFrom:e.target.value}:z))}/></label>
          <label><span className="label">Hasta</span><input className="field" placeholder="Ej. el salón" value={x.tripTo??''} onChange={e => change('expenses',form.expenses.map(z=>z.id===x.id?{...z,tripTo:e.target.value}:z))}/></label>
          <label><span className="label">Salida</span><input className="field" type="time" value={x.tripStartedAt?.slice(11,16)??''} onChange={e => change('expenses',form.expenses.map(z=>z.id===x.id?{...z,tripStartedAt:e.target.value?tripTimestamp(form.startsAt,e.target.value):undefined}:z))}/></label>
          <label><span className="label">Llegada</span><input className="field" type="time" value={x.tripEndedAt?.slice(11,16)??''} onChange={e => change('expenses',form.expenses.map(z=>z.id===x.id?{...z,tripEndedAt:e.target.value?tripTimestamp(form.startsAt,e.target.value):undefined}:z))}/></label>
        </>}</div>
      </div>)}</div><p className="muted mt-3 text-sm">Total gastos: {ars(form.expenses.reduce((s,x)=>s+x.amountCents,0))}. Reintegros del salón: {ars(form.expenses.filter(x=>x.absorbedBy==='salon').reduce((s,x)=>s+x.amountCents,0))}.</p>
    </section>}
    {(!section||section==='content')&&<section><h3 className="section-title mb-3">Contenido y entrega</h3><label><span className="label">Ideas para el contenido</span><textarea className="field !min-h-32" value={ideas} onChange={e=>setIdeas(e.target.value)} placeholder={'Pegá todas las ideas acá. Una por línea, por ejemplo:\nEntrada de los invitados\nVideo del vals\nFotos con la familia'}/></label><p className="muted mt-2 text-xs">Cada línea se convierte en un check. También podés pegar una lista con viñetas, números o separar ideas con punto y coma.</p><div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className="btn btn-secondary" onClick={addIdeas} disabled={!parseChecklistIdeas(ideas).length}>Agregar {parseChecklistIdeas(ideas).length || ''} {parseChecklistIdeas(ideas).length===1?'check':'checks'}</button>{ideas.trim()&&<span className="muted text-xs">Si guardás la cobertura, estas ideas también se agregan.</span>}</div>
      <div className="mt-4 space-y-2">{form.checklist.map(x=><div key={x.id} className="flex items-center gap-2"><div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--line)] px-3"><input type="checkbox" aria-label={`Completar ${x.text}`} checked={x.done} onChange={e=>change('checklist',form.checklist.map(z=>z.id===x.id?{...z,done:e.target.checked}:z))}/><input className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" aria-label={`Editar idea ${x.text}`} value={x.text} onChange={e=>change('checklist',form.checklist.map(z=>z.id===x.id?{...z,text:e.target.value}:z))}/></div><button type="button" aria-label={`Quitar ${x.text}`} className="btn btn-quiet !px-2" onClick={()=>change('checklist',form.checklist.filter(z=>z.id!==x.id))}><Trash2 size={17}/></button></div>)}</div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="label">Estado de entrega</span><select className="field" value={form.deliveryStatus} onChange={e=>change('deliveryStatus',e.target.value as Coverage['deliveryStatus'])}><option value="pendiente">Pendiente</option><option value="entregada">Entregada</option></select></label><label><span className="label">Piezas entregadas</span><input className="field" type="text" inputMode="numeric" placeholder="0" value={form.deliveredPieces||''} onChange={e=>change('deliveredPieces',Number(e.target.value.replace(/\D/g,'').slice(0,5))||0)} /></label><label className="sm:col-span-2"><span className="label">Link de Drive</span><input className="field" type="url" value={form.driveUrl} onChange={e=>change('driveUrl',e.target.value)} placeholder="https://drive.google.com/..."/></label><label className="sm:col-span-2"><span className="label">Observaciones de entrega</span><textarea className="field" value={form.deliveryNotes} onChange={e=>change('deliveryNotes',e.target.value)}/></label></div>
    </section>}
    {error && <p role="alert" className="rounded-lg bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--danger)]">{error}</p>}
    <div className="sticky bottom-0 -mx-5 flex justify-end border-t border-[var(--line)] bg-[var(--surface)] px-5 py-4 md:static md:mx-0 md:px-0"><button className="btn btn-primary w-full sm:w-auto" type="submit">Guardar cobertura</button></div>
  </form>;
}

