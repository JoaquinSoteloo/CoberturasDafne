'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, List } from 'lucide-react';
import { QuickCoverageForm } from '@/components/quick-coverage-form';
import { CalendarSubscribe } from '@/components/calendar-subscribe';
import { useStore } from '@/components/store';
import { Empty, Modal, StoryBars } from '@/components/ui';
import { ars } from '@/lib/money';
import { PARTY_TYPES, collectionPending, partyTypeOf } from '@/lib/domain';
import { calendarDays, dayKey, shiftMonth } from '@/lib/calendar';

export default function Coverages() {
  const {db,ready}=useStore(); const today=dayKey(new Date());
  const [open,setOpen]=useState(false); const [state,setState]=useState('todos');
  const [type,setType]=useState('');const [from,setFrom]=useState(''); const [to,setTo]=useState('');
  const [month,setMonth]=useState(today.slice(0,7)); const [selected,setSelected]=useState(today);
  const [view,setView]=useState<'calendario'|'lista'>('calendario');
  const rows=db.coverages.filter(c=>(state==='todos'||c.eventStatus===state)&&(!type||(type==='sin'?!c.partyType.trim():partyTypeOf(c.partyType)===type))&&(!from||c.startsAt.slice(0,10)>=from)&&(!to||c.startsAt.slice(0,10)<=to)).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  const days=calendarDays(month); const selectedRows=rows.filter(c=>c.startsAt.slice(0,10)===selected);
  const monthLabel=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(new Date(month+'-01T12:00'));
  const selectDay=(day:string)=>{setSelected(day);setMonth(day.slice(0,7))};
  const moveMonth=(delta:number)=>{const next=shiftMonth(month,delta);setMonth(next);setSelected(next+'-01')};
  const visibleRows=view==='lista'?rows.filter(c=>from||to||c.startsAt.slice(0,10)>=today):selectedRows;
  return <div className="space-y-6">
    <div className="page-heading"><div><h1 className="page-title">Coberturas</h1><p className="muted mt-2">Todas las fiestas, por fecha.</p></div><button className="btn btn-primary" onClick={()=>setOpen(true)}><Plus size={19}/> Nueva cobertura</button></div>
    <div className="coverage-view-switch" aria-label="Vista de coberturas"><button className={view==='calendario'?'selected':''} aria-pressed={view==='calendario'} onClick={()=>setView('calendario')}><CalendarDays size={17}/> Calendario</button><button className={view==='lista'?'selected':''} aria-pressed={view==='lista'} onClick={()=>setView('lista')}><List size={17}/> Agenda</button></div>
    <details className="card calendar-filters"><summary>Filtrar coberturas{(state!=='todos'||type||from||to)&&<span className="badge">Filtros activos</span>}</summary><div className="grid gap-3 p-4 sm:grid-cols-4"><label><span className="label">Estado</span><select className="field" value={state} onChange={e=>setState(e.target.value)}><option value="todos">Todos</option><option value="pendiente">Pendientes</option><option value="realizado">Realizados</option><option value="cancelado">Cancelados</option></select></label><label><span className="label">Tipo de fiesta</span><select className="field" value={type} onChange={e=>setType(e.target.value)}><option value="">Todos</option>{PARTY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}<option value="sin">Sin tipo</option></select></label><label><span className="label">Desde</span><input className="field" type="date" value={from} onChange={e=>{setFrom(e.target.value);if(e.target.value)selectDay(e.target.value)}}/></label><label><span className="label">Hasta</span><input className="field" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div></details>
    {from&&to&&from>to&&<p role="alert" className="badge badge-warn">La fecha Desde debe ser anterior a Hasta.</p>}
    {view==='calendario'&&<section className="card calendar" aria-label="Calendario de coberturas"><div className="calendar-toolbar"><div><h2 className="section-title" aria-live="polite">{monthLabel[0].toUpperCase()+monthLabel.slice(1)}</h2><p className="muted mt-1 text-sm">{rows.filter(c=>c.startsAt.startsWith(month)).length} coberturas</p></div><div className="flex gap-1"><button className="btn btn-secondary !px-3" onClick={()=>selectDay(today)}>Hoy</button><button className="btn btn-quiet !px-3" aria-label="Mes anterior" onClick={()=>moveMonth(-1)}><ChevronLeft size={19}/></button><button className="btn btn-quiet !px-3" aria-label="Mes siguiente" onClick={()=>moveMonth(1)}><ChevronRight size={19}/></button></div></div>
      <div className="calendar-weekdays" aria-hidden="true">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=><span key={d}>{d}</span>)}</div>
      <div className="calendar-grid">{days.map(day=>{const events=rows.filter(c=>c.startsAt.slice(0,10)===day);return <div key={day} className={`calendar-cell ${day.slice(0,7)!==month?'outside-month':''} ${selected===day?'selected-day':''} ${day===today?'today-cell':''}`}><button className="calendar-day" aria-pressed={selected===day} aria-current={day===today?'date':undefined} aria-label={`${day.split('-').reverse().join('/')}, ${events.length} coberturas`} onClick={()=>selectDay(day)}><span>{Number(day.slice(8))}</span><span className="calendar-mobile-count">{events.length>0?events.length:''}</span></button><div className="calendar-events">{events.map(c=><Link key={c.id} href={`/coberturas/${c.id}`} className={`calendar-event event-${c.eventStatus}`}><time>{c.startsAt.slice(11,16)}</time><span>{c.name}</span></Link>)}</div></div>})}</div>
      <div className="calendar-legend"><span>Pendiente</span><span>Realizado</span><span>Cancelado</span></div>
    </section>}
    <section aria-label={view==='lista'?'Listado de coberturas':'Eventos del día seleccionado'}><h2 className="section-title mb-4" aria-live="polite">{view==='lista'?(from||to?'Coberturas en el período':'Próximas coberturas'):new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(selected+'T12:00'))}</h2>
    {!ready?<p className="muted">Cargando coberturas…</p>:visibleRows.length===0?<Empty title={view==='lista'?'No hay coberturas con esos filtros':'Sin coberturas para este día'} detail="Elegí otra fecha o creá una nueva cobertura."/>:<div className="grid gap-3 lg:grid-cols-2">{visibleRows.map(c=><Link key={c.id} href={`/coberturas/${c.id}`} className={`card coverage-card status-${c.eventStatus}`}><span className="coverage-date"><strong>{Number(c.startsAt.slice(8,10))}</strong><span>{new Intl.DateTimeFormat('es-AR',{month:'short'}).format(new Date(c.startsAt.slice(0,10)+'T12:00')).replace('.','')}</span><time>{c.startsAt.slice(11,16)}</time></span><span className="coverage-body"><span className="block text-lg font-extrabold">{c.name}</span><span className="muted block text-sm">{[c.partyType,db.salons.find(s=>s.id===c.salonId)?.name].filter(Boolean).join(' · ')}</span><StoryBars items={c.checklist} label={false}/><span className="mt-3 flex flex-wrap items-center gap-2"><span className={`badge ${c.eventStatus==='cancelado'?'badge-danger':c.eventStatus==='pendiente'?'badge-warn':'badge-success'}`}>{c.eventStatus}</span><span className="badge">{c.assignments.length?`${c.assignments.length} CM`:'Sin CM'}</span>{collectionPending(db,c)>0&&<span className="muted ml-auto text-sm">Falta cobrar {ars(collectionPending(db,c))}</span>}</span></span></Link>)}</div>}</section>
    <div className="max-w-xl"><CalendarSubscribe who="coordinadora"/></div>
    {open&&<Modal title="Nueva cobertura" onClose={()=>setOpen(false)}><QuickCoverageForm defaultDate={selected} onDone={()=>setOpen(false)}/></Modal>}
  </div>;
}
