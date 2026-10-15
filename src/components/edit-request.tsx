'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CircleCheck, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from './store';
import { Avatar } from './avatar';
import { ReceiptButton } from './receipt-button';
import { Modal, MoneyField, flash } from './ui';
import { EDIT_FORMATS, conceptPaid } from '@/lib/domain';
import { dayKey } from '@/lib/calendar';
import { ars } from '@/lib/money';
import { newId } from '@/lib/repository';
import { editRequestMessage, waLink } from '@/lib/whatsapp';
import type { Db, EditFormat, EditRequest } from '@/lib/types';

const FORMATS = Object.keys(EDIT_FORMATS) as EditFormat[];
const DAY = 86_400_000;
const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00`);
/** "vie 17 oct". */
export const niceDay = (iso: string) => new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).format(at(iso)).replace(/\./g, '').replace(',', '');
/** "Reel de Sofi". */
export const editTitle = (db: Db, e: EditRequest) => `${EDIT_FORMATS[e.format]} de ${db.cms.find(c => c.id === e.cmId)?.name.split(' ')[0] ?? 'una CM'}`;
/** Para cuándo, en palabras: "para hoy", "para mañana", "para el vie 17 oct", "era para ayer". */
export function dueLabel(dueOn: string, today: string) {
  const n = Math.round((at(dueOn).getTime() - at(today).getTime()) / DAY);
  if (n < 0) return n === -1 ? 'era para ayer' : `era para hace ${-n} días`;
  return n === 0 ? 'para hoy' : n === 1 ? 'para mañana' : `para el ${niceDay(dueOn)}`;
}
/** El pedido ya armado en WhatsApp, al chat de la CM. */
const whatsappFor = (db: Db, e: EditRequest) => {
  const cm = db.cms.find(c => c.id === e.cmId);
  return waLink(cm?.phone ?? '', editRequestMessage({ cmName: cm?.name ?? '', format: EDIT_FORMATS[e.format], details: e.details, dueOn: e.dueOn || undefined, amountCents: e.amountCents || undefined }));
};

/**
 * Pedirle una edición a una CM (historia, reel o carrusel), aparte de las fiestas: queda guardada
 * para pagarla y se abre WhatsApp con el pedido armado. Con `initial`, corrige uno ya pedido.
 */
export function EditRequestForm({ initial, onDone }: { initial?: EditRequest; onDone: () => void }) {
  const { db, update } = useStore();
  const paid = initial ? conceptPaid(db, `edit:${initial.id}`) : 0;
  const [cmId, setCmId] = useState(initial?.cmId ?? (db.cms.length === 1 ? db.cms[0].id : ''));
  const [format, setFormat] = useState<EditFormat | ''>(initial?.format ?? '');
  const [details, setDetails] = useState(initial?.details ?? '');
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? '');
  const [amount, setAmount] = useState(initial?.amountCents ?? 0);
  const [error, setError] = useState('');
  if (!db.cms.length) return <p className="muted">Primero cargá a las CM en Equipo.</p>;

  const save = (send: boolean) => {
    if (!cmId) { setError('Elegí a quién se la pedís.'); return; }
    if (!format) { setError('Elegí si es para historia, reel o carrusel.'); return; }
    if (amount < paid) { setError(`Ya le pagaste ${ars(paid)}: el monto no puede ser menor.`); return; }
    const edit: EditRequest = {
      id: initial?.id ?? newId(), cmId, format, details: details.trim(), dueOn, amountCents: amount,
      requestedOn: initial?.requestedOn ?? dayKey(new Date()), status: initial?.status ?? 'pedida', deliveredOn: initial?.deliveredOn ?? '',
    };
    update(d => ({ ...d, edits: initial ? d.edits.map(x => x.id === edit.id ? edit : x) : [...d.edits, edit] }));
    // Se abre en el mismo toque, para que el navegador no lo bloquee.
    if (send) window.open(whatsappFor(db, edit), '_blank', 'noopener');
    flash(); toast.success(initial ? 'Pedido corregido.' : 'Pedido guardado.');
    onDone();
  };

  return <form className="space-y-5" onChange={() => setError('')} onSubmit={e => { e.preventDefault(); save(!initial); }}>
    <fieldset><legend className="label">¿A quién?</legend>
      <div className="pick-pills">{db.cms.map(c => <button key={c.id} type="button" aria-pressed={cmId === c.id} className={cmId === c.id ? 'selected' : ''} disabled={paid > 0 && c.id !== cmId} onClick={() => { setCmId(c.id); setError(''); }}>
        <Avatar name={c.name} photoPath={c.photoPath} size={24}/>{c.name.split(' ')[0]}</button>)}</div>
    </fieldset>
    <fieldset><legend className="label">¿Para qué es?</legend>
      <div className="pick-pills">{FORMATS.map(f => <button key={f} type="button" aria-pressed={format === f} className={format === f ? 'selected' : ''} onClick={() => { setFormat(f); setError(''); }}>{EDIT_FORMATS[f]}</button>)}</div>
    </fieldset>
    <label className="block"><span className="label">Qué editar</span>
      <textarea className="field" rows={3} value={details} onChange={e => setDetails(e.target.value)} placeholder="El material, el link del Drive, la música, cuánto dura…"/></label>
    <label className="block"><span className="label">Para cuándo</span>
      <input className="field" type="date" value={dueOn} onChange={e => setDueOn(e.target.value)}/></label>
    <MoneyField label="Cuánto le pagás" value={amount} onChange={setAmount} hint="Se le debe cuando la entrega. Si todavía no lo sabés, ponelo después."/>
    {error && <p role="alert" className="field-error">{error}</p>}
    {initial ? <button className="btn btn-primary w-full">Guardar</button>
      : <div className="grid gap-2">
        <button className="btn btn-whatsapp w-full"><MessageCircle size={18}/> Guardar y mandar por WhatsApp</button>
        <button type="button" className="btn btn-quiet w-full" onClick={() => save(false)}>Solo guardar</button>
      </div>}
  </form>;
}

/** Un pedido de edición: si ya la entregó, lo que se le pagó (con los comprobantes), corregirlo o borrarlo. */
export function EditRequestSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, update, undoable } = useStore();
  const [editing, setEditing] = useState(false);
  const e = db.edits.find(x => x.id === id);
  const [amount, setAmount] = useState(e?.amountCents ?? 0);
  if (!e) return <Modal title="Edición" onClose={onClose}><p className="muted">Este pedido ya no está.</p></Modal>;
  if (editing) return <Modal title={`Corregir: ${editTitle(db, e)}`} onClose={() => setEditing(false)}><EditRequestForm initial={e} onDone={() => setEditing(false)}/></Modal>;

  const cm = db.cms.find(c => c.id === e.cmId);
  const today = dayKey(new Date());
  const conceptId = `edit:${e.id}`;
  const paid = conceptPaid(db, conceptId); const owed = Math.max(0, e.amountCents - paid);
  const payments = db.cmPayments.filter(p => p.allocations.some(a => a.conceptId === conceptId)).sort((a, b) => a.date.localeCompare(b.date));
  const set = (patch: Partial<EditRequest>) => update(d => ({ ...d, edits: d.edits.map(x => x.id === e.id ? { ...x, ...patch } : x) }));
  const deliver = () => { set({ status: 'entregada', deliveredOn: today, amountCents: amount }); flash(); toast.success(amount ? `Entregada: ahora le debés ${ars(amount)}.` : 'Entregada.'); };
  const remove = () => { onClose(); undoable('Pedido borrado.', d => ({ ...d, edits: d.edits.filter(x => x.id !== e.id) }), d => ({ ...d, edits: [...d.edits, e] })); };

  return <Modal title={editTitle(db, e)} onClose={onClose}><div className="space-y-5">
    <div className="flex items-center gap-3"><Avatar name={cm?.name ?? '?'} photoPath={cm?.photoPath} size={44}/>
      <div className="min-w-0"><p className="truncate font-bold">{cm?.name ?? 'CM eliminada'}</p>
        <p className="muted text-sm">Pedida el {niceDay(e.requestedOn)}{e.status === 'entregada' ? ` · entregada el ${niceDay(e.deliveredOn || today)}` : e.dueOn ? ` · ${dueLabel(e.dueOn, today)}` : ''}</p></div></div>
    {e.details && <p className="edit-details">{e.details}</p>}

    {e.status === 'pedida' ? <div className="grid gap-2">
      {e.amountCents ? <p className="flex items-baseline justify-between gap-3"><span className="muted text-sm">Le pagás</span><strong>{ars(e.amountCents)}</strong></p>
        : <MoneyField label="Cuánto le pagás" value={amount} onChange={setAmount}/>}
      <button type="button" className="btn btn-primary w-full" onClick={deliver}><CircleCheck size={18}/> Ya la entregó</button>
      <a className="btn btn-whatsapp w-full" href={whatsappFor(db, e)} target="_blank" rel="noopener noreferrer"><MessageCircle size={17}/> Mandárselo de nuevo</a>
    </div> : <div className="grid gap-2">
      <p className="flex items-baseline justify-between gap-3"><span className="muted text-sm">{e.amountCents ? `Pagaste ${ars(paid)} de ${ars(e.amountCents)}` : 'Sin monto'}</span>
        {e.amountCents > 0 && (owed > 0 ? <span className="badge badge-warn">Le debés {ars(owed)}</span> : <span className="badge badge-success">Pagada</span>)}</p>
      {owed > 0 && <Link className="btn btn-primary w-full" href={`/pagos?pagar=${e.cmId}`}>Pagarle</Link>}
      {payments.length > 0 && <ul className="space-y-2">{payments.map(p => <li key={p.id} className="pay-line"><div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 font-semibold">Pago del {niceDay(p.date)}</span><span className="font-bold tabular-nums">{ars(p.allocations.filter(a => a.conceptId === conceptId).reduce((s, a) => s + a.amountCents, 0))}</span></div>
        <ReceiptButton path={p.receiptPath}/></li>)}</ul>}
      {paid === 0 && <button type="button" className="text-link" onClick={() => set({ status: 'pedida', deliveredOn: '' })}>Todavía no la entregó</button>}
    </div>}

    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" className="text-link" onClick={() => setEditing(true)}>Corregir el pedido</button>
      {paid === 0 && <button type="button" className="text-link text-[var(--danger)]" onClick={remove}>Borrar</button>}
    </div>
  </div></Modal>;
}
