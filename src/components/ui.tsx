'use client';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { stageOf, stageSummary, type Stage } from '@/lib/content';
import { formatAmount, formatTyping, parseAmount } from '@/lib/money';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const opener=useRef(typeof document!=='undefined'?document.activeElement as HTMLElement:null);
  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose()}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content" aria-describedby={undefined} onCloseAutoFocus={e=>{e.preventDefault();opener.current?.focus()}} onPointerDownOutside={e=>e.preventDefault()}><div className="drawer-grip"/><div className="dialog-heading"><Dialog.Title className="text-xl font-extrabold">{title}</Dialog.Title><Dialog.Close asChild><button type="button" className="btn btn-quiet !px-2" aria-label="Cerrar"><X size={22}/></button></Dialog.Close></div><div className="dialog-body">{children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Empty({title,detail}:{title:string;detail:string}){return <div className="card px-6 py-10 text-center"><p className="font-bold">{title}</p><p className="muted mt-1 text-sm">{detail}</p></div>}
/**
 * Campo de plata en centavos. Se puede borrar del todo (vale 0), acepta "200.000" o "1.500,50"
 * y al salir lo muestra con puntos de miles. Si lo escrito no es un monto, lo marca e informa -1:
 * los formularios rechazan montos negativos, así no se puede guardar un valor que no es el que se ve.
 */
export function MoneyField({label,value,onChange,hint,placeholder}:{label:string;value:number;onChange:(v:number)=>void;hint?:string;placeholder?:string}){
  const id=useId();
  const [text,setText]=useState(()=>value?formatAmount(value):'');
  const [prev,setPrev]=useState(value);
  // Mientras se escribe, una coma al final todavía no es un error.
  const read=(t:string)=>parseAmount(t.replace(/,$/,''));
  // Si el valor cambia desde afuera (por ejemplo, al elegir otra CM), se muestra el nuevo.
  if(value!==prev){setPrev(value);if(read(text)!==value)setText(value?formatAmount(value):'')}
  const invalid=read(text)===null;
  // Al reformatear con los puntos de miles, el cursor vuelve a donde estaba.
  const input=useRef<HTMLInputElement>(null);const caret=useRef<number|null>(null);
  useLayoutEffect(()=>{if(caret.current!==null&&input.current===document.activeElement)input.current?.setSelectionRange(caret.current,caret.current);caret.current=null});
  return <label className="block"><span className="label">{label}</span>
    <span className="money-field"><span aria-hidden="true">$</span><input ref={input} className="field" type="text" inputMode="decimal" autoComplete="off" placeholder={placeholder??'0'} value={text}
      aria-invalid={invalid} aria-describedby={invalid||hint?id:undefined}
      onChange={e=>{const next=formatTyping(e.target.value,e.target.selectionStart??e.target.value.length,text);caret.current=next.caret;setText(next.text);const cents=read(next.text)??-1;setPrev(cents);onChange(cents)}}
      onBlur={()=>{const cents=read(text);if(cents!==null)setText(cents?formatAmount(cents):'')}}/></span>
    {invalid?<span id={id} role="alert" className="field-error block">Revisá el monto: usá números, con coma para los centavos.</span>:hint&&<span id={id} className="muted mt-2 block text-sm">{hint}</span>}
  </label>;
}
/** Avance del contenido: claro lo enviado por WhatsApp, fuerte lo subido al Drive. */
export function StoryBars({items,label=true}:{items:{id:string;done:boolean;stage?:Stage}[];label?:boolean}){
  if(!items.length)return null;const summary=stageSummary(items);
  return <div className="story" role="img" aria-label={`Contenido: ${summary}`}><div className="story-bars">{items.map(x=>{const s=stageOf(x);return <span key={x.id} className={s==='drive'?'done':s==='whatsapp'?'half':''}/>})}</div>{label&&<span className="story-count">{summary}</span>}</div>;
}
export function untilLabel(iso:string){
  const a=new Date();a.setHours(0,0,0,0);const b=new Date(iso.slice(0,10)+'T00:00');const d=Math.round((b.getTime()-a.getTime())/864e5);
  return d===0?'Hoy':d===1?'Mañana':d>1?`En ${d} días`:d===-1?'Ayer':`Hace ${-d} días`;
}
export function Meter({done,total,label}:{done:number;total:number;label:string}){
  const pct=total>0?Math.min(100,Math.round(done/total*100)):0;
  return <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{width:`${pct}%`}}/></div>;
}
export const shortDay=(iso:string)=>{const d=new Date(iso.slice(0,10)+'T12:00');return {day:d.getDate(),month:new Intl.DateTimeFormat('es-AR',{month:'short'}).format(d).replace('.','')}};
export const cap=(s:string)=>s?s[0].toUpperCase()+s.slice(1):s;
/** Destello de flash de cámara: la única animación de la app, solo tras una acción importante. */
export function flash(){
  if(typeof document==='undefined'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const el=document.createElement('div');el.className='camera-flash';el.setAttribute('aria-hidden','true');
  document.body.appendChild(el);el.addEventListener('animationend',()=>el.remove());
}
/** Deslizar el dedo a los costados (para pasar de mes en un calendario). Izquierda = siguiente. */
export function useSwipe(onLeft:()=>void,onRight:()=>void){
  const start=useRef<{x:number;y:number}|null>(null);
  return {
    onTouchStart:(e:React.TouchEvent)=>{const t=e.touches[0];start.current={x:t.clientX,y:t.clientY}},
    onTouchEnd:(e:React.TouchEvent)=>{const from=start.current;start.current=null;if(!from)return;const t=e.changedTouches[0];const dx=t.clientX-from.x,dy=t.clientY-from.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){if(dx<0)onLeft();else onRight()}},
  };
}
