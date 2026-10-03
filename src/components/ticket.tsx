import Link from 'next/link';
import { Clock, MapPin } from 'lucide-react';
import { StoryBars, untilLabel } from './ui';
import type { Coverage, Db } from '@/lib/types';

const initials=(name='')=>name.split(' ').map(n=>n[0]).slice(0,2).join('');
const longDay=(iso:string)=>{const t=new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(iso.slice(0,10)+'T12:00'));return t[0].toUpperCase()+t.slice(1)};
const whenLabel=(c:Coverage)=>c.eventStatus==='cancelado'?'Cancelada':c.eventStatus==='realizado'?'Realizada':untilLabel(c.startsAt);

/** La entrada de una fiesta: datos a la izquierda, horario en el talón. Sin `href` no es un link. */
export function Ticket({coverage:c,db,href,children}:{coverage:Coverage;db:Db;href?:string;children?:React.ReactNode}){
  const salon=db.salons.find(s=>s.id===c.salonId)?.name;
  const body=<>
    <div className="ticket-main">
      <p className="ticket-when"><span className={`when-pill when-${c.eventStatus}`}>{whenLabel(c)}</span><span>{longDay(c.startsAt)}</span></p>
      {href?<p className="ticket-name">{c.name}</p>:<h1 className="ticket-name">{c.name}</h1>}
      <p className="ticket-place"><MapPin size={15}/>{[c.partyType,salon].filter(Boolean).join(', en ')}</p>
      {c.arriveAt&&<p className="ticket-arrive"><Clock size={15}/>Las CM llegan {c.arriveAt.slice(11,16)}</p>}
      {children}
      <ul className="ticket-crew" aria-label="Equipo">{c.assignments.length?c.assignments.map(a=>{const cm=db.cms.find(x=>x.id===a.cmId);return <li key={a.id} className={`crew-chip crew-${a.confirmation}`}><span className="crew-initials" aria-hidden="true">{initials(cm?.name)}</span>{cm?.name.split(' ')[0]}<span className="crew-state">{a.confirmation==='confirmada'?'confirmada':a.confirmation==='rechazada'?'no puede':'sin confirmar'}</span></li>}):<li className="crew-chip crew-pendiente">Sin CM asignada</li>}</ul>
      <StoryBars items={c.checklist}/>
    </div>
    <div className="ticket-stub" aria-label={`De ${c.startsAt.slice(11,16)}${c.endsAt?` a ${c.endsAt.slice(11,16)}`:''}`}><time>{c.startsAt.slice(11,16)}</time>{c.endsAt&&<><span className="stub-line" aria-hidden="true"/><time>{c.endsAt.slice(11,16)}</time></>}</div>
  </>;
  return href?<Link href={href} className={`ticket ticket-${c.eventStatus}`}>{body}</Link>:<div className={`ticket ticket-${c.eventStatus}`}>{body}</div>;
}
