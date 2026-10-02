'use client';
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Wallet, MapPin, Phone, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ars } from '@/lib/money';
import { Meter, StoryBars, cap, flash, shortDay, untilLabel } from './ui';
import { ThemeToggle } from './theme-toggle';
import { BrandMark } from './brand';
import { ReceiptControl } from './receipt-control';
import { MapPreview } from './map-preview';
import { PushPrompt, PushToggle } from './push-control';
import { tripSummary } from '@/lib/trip';
import { InstallHint } from './install-hint';

type Item = { id: string; text: string; done: boolean };
type Mate = { name: string; phone: string; confirmation: string };
type CmDate = {
  id: string; name: string; party_type: string; client: string; salon: string; address: string;
  starts_at: string; ends_at: string | null; notes: string; event_status: 'pendiente' | 'realizado' | 'cancelado';
  lat: number | null; lng: number | null;
  assignment_id: string; confirmation: 'pendiente' | 'confirmada' | 'rechazada'; fee_cents: number;
  checklist: Item[]; team: Mate[];
};
type Concept = { coverage_id: string; coverage_name: string; starts_at: string; kind: 'fee' | 'expense'; label: string; amount_cents: number; paid_cents: number; expense_id: string | null; receipt_path: string | null; trip_from: string | null; trip_to: string | null; trip_started_at: string | null; trip_ended_at: string | null };
type Payment = { id: string; date: string; amount_cents: number };
type Home = { name: string; dates: CmDate[]; concepts: Concept[]; payments: Payment[] };

const time = (iso: string | null) => iso ? iso.slice(11, 16) : '';
const longDay = (iso: string) => cap(new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso.slice(0, 10) + 'T12:00')));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Lo que ve una CM: sus fechas y el estado de sus pagos. */
export function CmHome({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [home, setHome] = useState<Home | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'fechas' | 'pagos'>('fechas');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc('cm_home');
    if (error || !data) { setFailed(true); return; }
    setHome(data as Home); setFailed(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  const act = async (key: string, run: () => PromiseLike<{ error: { message: string } | null }>, done: string, celebrate = false) => {
    setBusy(key);
    const { error } = await run();
    setBusy('');
    if (error) { toast.error(error.message || 'No se pudo guardar. Probá de nuevo.'); return; }
    if (celebrate) flash();
    toast.success(done);
    await load();
  };
  const answer = (d: CmDate, value: 'confirmada' | 'rechazada') => act(d.assignment_id,
    () => supabaseBrowser().rpc('cm_set_confirmation', { p_assignment: d.assignment_id, p_value: value }),
    value === 'confirmada' ? 'Fecha confirmada' : 'Le avisamos a Dafne que no podés', value === 'confirmada');
  const tick = (d: CmDate, item: Item, checked: boolean) => {
    const completes = checked && d.checklist.every(x => x.id === item.id || x.done);
    // Se ve tildado al instante; si falla, la recarga lo vuelve atrás.
    setHome(h => h && { ...h, dates: h.dates.map(x => x.id === d.id ? { ...x, checklist: x.checklist.map(i => i.id === item.id ? { ...i, done: checked } : i) } : x) });
    return act(item.id, () => supabaseBrowser().rpc('cm_set_checklist', { p_item: item.id, p_done: checked }), completes ? 'Contenido completo' : checked ? 'Tildado' : 'Destildado', completes);
  };

  const header = <header className="cm-header">
    <BrandMark/>
    <div className="flex items-center gap-1"><PushToggle className="header-theme"/><ThemeToggle className="header-theme"/><button type="button" className="theme-toggle header-theme" onClick={() => void onSignOut()} aria-label="Salir"><LogOut size={18}/><span>Salir</span></button></div>
  </header>;

  if (failed) return <>{header}<main className="cm-page text-center"><p className="font-bold">No pudimos cargar tus fechas.</p><p className="muted mt-1 text-sm">Revisá la conexión a internet.</p><button className="btn btn-primary mt-4" onClick={() => void load()}>Reintentar</button></main></>;
  if (!home) return <>{header}<main className="cm-page muted text-center text-sm">Cargando tus fechas…</main></>;

  const now = today();
  const upcoming = home.dates.filter(d => d.starts_at.slice(0, 10) >= now);
  const past = home.dates.filter(d => !upcoming.includes(d)).reverse();
  const pending = home.concepts.reduce((s, c) => s + Math.max(0, c.amount_cents - c.paid_cents), 0);
  const toAnswer = upcoming.filter(d => d.confirmation === 'pendiente' && d.event_status === 'pendiente').length;

  return <>{header}<main className="cm-page space-y-7">
    <InstallHint/>
    <PushPrompt forCm/>
    <div><h1 className="page-title">Hola, {home.name.split(' ')[0]}</h1><p className="muted mt-2">{toAnswer ? `Tenés ${toAnswer === 1 ? 'una fecha' : `${toAnswer} fechas`} para confirmar.` : upcoming.length ? `Tenés ${upcoming.length === 1 ? 'una fiesta' : `${upcoming.length} fiestas`} por delante.` : 'No tenés fiestas por delante.'}</p></div>
    <div className="coverage-view-switch" role="tablist" aria-label="Sección"><button role="tab" aria-selected={tab === 'fechas'} className={tab === 'fechas' ? 'selected' : ''} onClick={() => setTab('fechas')}><CalendarDays size={17}/> Mis fechas</button><button role="tab" aria-selected={tab === 'pagos'} className={tab === 'pagos' ? 'selected' : ''} onClick={() => setTab('pagos')}><Wallet size={17}/> Mis pagos</button></div>

    {tab === 'fechas' ? <section className="space-y-5" aria-label="Mis fechas">
      {upcoming.length === 0 && <p className="muted">Cuando Dafne te asigne una fiesta, aparece acá.</p>}
      {upcoming.map(d => <article key={d.id} className="cm-date" aria-label={d.name}>
        {/* La entrada queda corta. El mapa va afuera: en Safari del iPhone, un mapa embebido dentro de la entrada (que usa máscara para las muescas) no se dibuja. */}
        <div className={`ticket ticket-${d.event_status}`}>
          <div className="ticket-main">
          <p className="ticket-when"><span className={`when-pill when-${d.event_status}`}>{d.event_status === 'cancelado' ? 'Cancelada' : untilLabel(d.starts_at)}</span><span>{longDay(d.starts_at)}</span></p>
          <h2 className="ticket-name">{d.name}</h2>
          <p className="ticket-place"><MapPin size={15}/>{[d.party_type, d.salon].filter(Boolean).join(', en ')}</p>
          <p className="ticket-extra">{[d.client && `Para ${d.client}`, d.address].filter(Boolean).join('. ')}</p>
          {d.notes && <p className="ticket-note">{d.notes}</p>}
          </div>
          <div className="ticket-stub" aria-label={`De ${time(d.starts_at)}${d.ends_at ? ` a ${time(d.ends_at)}` : ''}`}><time>{time(d.starts_at)}</time>{d.ends_at && <><span className="stub-line" aria-hidden="true"/><time>{time(d.ends_at)}</time></>}</div>
        </div>
        <div className="cm-date-body">
          {d.address && d.starts_at.slice(0, 10) >= now && <MapPreview address={d.address} label={d.salon} coords={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null}/>}
          {d.event_status === 'pendiente' && <div className={`cm-answer answer-${d.confirmation}`}>
            {d.confirmation === 'pendiente' && <><p className="font-bold">¿Podés cubrirla? Tu honorario es <span className="whitespace-nowrap">{ars(d.fee_cents)}</span>.</p><div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={!!busy} onClick={() => void answer(d, 'confirmada')}>Sí, la cubro</button><button className="btn btn-secondary" disabled={!!busy} onClick={() => void answer(d, 'rechazada')}>No puedo</button></div></>}
            {d.confirmation === 'confirmada' && <><p><span className="badge badge-success">Confirmaste</span> <span className="muted text-sm">Honorario {ars(d.fee_cents)}</span></p><button className="btn btn-quiet btn-small" disabled={!!busy} onClick={() => void answer(d, 'rechazada')}>Ya no puedo ir</button></>}
            {d.confirmation === 'rechazada' && <><p><span className="badge badge-danger">Avisaste que no podés</span></p><button className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => void answer(d, 'confirmada')}>Sí puedo</button></>}
          </div>}
          {d.team.length > 0 && <div className="mt-4"><p className="text-sm font-bold">También cubren</p><ul className="cm-team">{d.team.map((m, i) => <li key={i}><span className="font-semibold">{m.name}</span>{m.confirmation !== 'confirmada' && <span className="muted text-sm"> ({m.confirmation === 'rechazada' ? 'no puede' : 'sin confirmar'})</span>}{m.phone && <a className="text-link inline-flex items-center gap-1" href={`tel:${m.phone.replace(/[^+0-9]/g, '')}`}><Phone size={14}/>{m.phone}</a>}</li>)}</ul></div>}
          {d.checklist.length > 0 && <div className="mt-4"><p className="text-sm font-bold">Contenido a cubrir</p><StoryBars items={d.checklist}/><ul className="mt-3 space-y-2">{d.checklist.map(item => <li key={item.id}><label className="checklist-action"><input type="checkbox" checked={item.done} disabled={d.confirmation === 'rechazada' || busy === item.id} onChange={e => void tick(d, item, e.target.checked)}/><span className={item.done ? 'completed-task' : ''}>{item.text}</span></label></li>)}</ul></div>}
        </div>
      </article>)}
      {past.length > 0 && <details className="cm-past"><summary className="cursor-pointer font-bold">Fechas anteriores ({past.length})</summary><ul className="ledger card mt-3">{past.map(d => { const day = shortDay(d.starts_at); return <li key={d.id} className="ledger-row"><span className="ledger-date"><strong>{day.day}</strong>{day.month}</span><span className="min-w-0 flex-1"><span className="block font-bold">{d.name}</span><span className="muted text-sm">{d.event_status === 'cancelado' ? 'Cancelada' : d.confirmation === 'rechazada' ? 'No la cubriste' : d.salon}</span></span></li>; })}</ul></details>}
    </section> : <section className="space-y-7" aria-label="Mis pagos">
      <div className="ledger-card card">
        <div className="ledger-head"><div><h2 className="section-title">Te falta cobrar</h2><p className="ledger-total">{ars(pending)}</p></div></div>
        {home.concepts.length ? <ul className="ledger">{home.concepts.map(c => { const day = shortDay(c.starts_at); const owed = c.amount_cents - c.paid_cents; return <li key={`${c.coverage_id}-${c.label}`} className="ledger-row">
          <span className="ledger-date"><strong>{day.day}</strong>{day.month}</span>
          <span className="min-w-0 flex-1"><span className="block font-bold">{c.coverage_name}</span><span className="muted block text-sm">{c.label}</span>{c.kind === 'expense' && tripSummary({ tripFrom: c.trip_from, tripTo: c.trip_to, tripStartedAt: c.trip_started_at, tripEndedAt: c.trip_ended_at }) && <span className="block text-sm">{tripSummary({ tripFrom: c.trip_from, tripTo: c.trip_to, tripStartedAt: c.trip_started_at, tripEndedAt: c.trip_ended_at })}</span>}<Meter done={c.paid_cents} total={c.amount_cents} label={`Cobrado ${ars(c.paid_cents)} de ${ars(c.amount_cents)}`}/><span className="muted block text-sm">Cobraste {ars(c.paid_cents)} de {ars(c.amount_cents)}</span></span>
          <span className="ledger-amount">{owed > 0 ? ars(owed) : <span className="badge badge-success">Pagado</span>}</span>
          {c.kind === 'expense' && c.expense_id && <span className="receipt-row"><ReceiptControl expenseId={c.expense_id} path={c.receipt_path} onChange={() => void load()}/></span>}
        </li>; })}</ul> : <p className="muted px-5 pb-5">Todavía no tenés honorarios cargados.</p>}
      </div>
      <section aria-labelledby="cm-payments-title"><h2 id="cm-payments-title" className="section-title mb-3">Pagos recibidos</h2>{home.payments.length ? <ul className="ledger card">{home.payments.map(p => { const day = shortDay(p.date); return <li key={p.id} className="ledger-row"><span className="ledger-date"><strong>{day.day}</strong>{day.month}</span><span className="min-w-0 flex-1 font-bold">Pago de Dafne</span><span className="ledger-amount">{ars(p.amount_cents)}</span></li>; })}</ul> : <p className="muted">Cuando Dafne te pague, el pago aparece acá.</p>}</section>
    </section>}

    <ChangePassword/>
  </main></>;
}

function ChangePassword() {
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Usá al menos 8 caracteres.'); return; }
    setBusy(true); setError('');
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) { setError('No se pudo cambiar. Probá con otra contraseña.'); return; }
    setPassword(''); toast.success('Contraseña cambiada');
  };
  return <details className="cm-past"><summary className="cursor-pointer font-bold">Cambiar contraseña</summary>
    <form onSubmit={save} className="mt-3 max-w-sm space-y-3"><label className="block"><span className="label">Contraseña nueva</span><input className="field" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!error}/></label>{error && <p role="alert" className="field-error">{error}</p>}<button className="btn btn-secondary" disabled={busy}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button></form>
  </details>;
}
