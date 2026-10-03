'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Clock, FolderUp, Radio, UserRound, Wallet, MapPin, Phone, LogOut, ChevronLeft, ChevronRight, ArrowLeft, Bell, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ars } from '@/lib/money';
import { calendarDays, shiftMonth } from '@/lib/calendar';
import { StoryBars, cap, flash, untilLabel } from './ui';
import { ThemeToggle } from './theme-toggle';
import { BrandMark } from './brand';
import { CmUbers } from './cm-ubers';
import { CmPayments, type MoneyConcept } from './cm-payments';
import { CmProfile, type Profile } from './cm-profile';
import { StageButton } from './stage-button';
import { STAGE_LABEL, stageOf, type Stage } from '@/lib/content';
import { MapPreview } from './map-preview';
import { WeatherStrip } from './weather-strip';
import { PushPrompt, PushToggle } from './push-control';
import { LiveNow, cameFromShortcut } from './live-now';
import { liveEvents } from '@/lib/live';
import { InstallHint } from './install-hint';
import { CalendarSubscribe } from './calendar-subscribe';

type Item = { id: string; text: string; done: boolean; stage?: Stage };
type Mate = { name: string; phone: string; confirmation: string };
type Moment = { id: string; at: string; label: string; notify: boolean };
type CmDate = {
  id: string; name: string; party_type: string; client: string; salon: string; address: string;
  starts_at: string; ends_at: string | null; arrive_at: string | null; drive_url?: string; live_posting?: boolean | null; dafne_goes?: boolean | null; notes: string; event_status: 'pendiente' | 'realizado' | 'cancelado';
  lat: number | null; lng: number | null;
  assignment_id: string; confirmation: 'pendiente' | 'confirmada' | 'rechazada'; fee_cents: number;
  checklist: Item[]; schedule?: Moment[]; team: Mate[];
};
type Concept = MoneyConcept;
type Payment = { id: string; date: string; amount_cents: number; receipt_path?: string | null };
type Home = { name: string; profile?: Profile; dates: CmDate[]; concepts: Concept[]; payments: Payment[] };

const time = (iso: string | null) => iso ? iso.slice(11, 16) : '';
const longDay = (iso: string) => cap(new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso.slice(0, 10) + 'T12:00')));
const weekday = (iso: string) => new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(new Date(iso.slice(0, 10) + 'T12:00')).replace('.', '');
const monthName = (month: string) => cap(new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(month + '-01T12:00')));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const needsAnswer = (d: CmDate) => d.event_status === 'pendiente' && d.confirmation === 'pendiente';

/** Estado de una fecha para la CM, en una palabra y con su color. */
function status(d: CmDate): { label: string; tone: 'warn' | 'ok' | 'danger' | 'muted' } {
  if (d.event_status === 'cancelado') return { label: 'Cancelada', tone: 'danger' };
  if (d.event_status === 'realizado') return { label: 'Realizada', tone: 'muted' };
  if (d.confirmation === 'rechazada') return { label: 'No vas', tone: 'danger' };
  if (d.confirmation === 'confirmada') return { label: 'Confirmada', tone: 'ok' };
  return { label: 'Confirmar', tone: 'warn' };
}
const fechaInUrl = () => new URLSearchParams(window.location.search).get('fecha');

/**
 * Lo que ve una CM: sus fechas en un calendario, cada fecha en su pantalla, y sus pagos.
 * Con `previewCmId`, Dafne ve la pantalla de esa CM tal cual, sin poder tocar nada.
 */
export function CmHome({ onSignOut, previewCmId }: { onSignOut?: () => Promise<void>; previewCmId?: string }) {
  const preview = !!previewCmId;
  // Dentro de la app de Dafne ya hay un <main>.
  const Main = preview ? 'div' : 'main';
  const [home, setHome] = useState<Home | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'fechas' | 'pagos' | 'perfil'>('fechas');
  const [busy, setBusy] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = previewCmId ? await supabaseBrowser().rpc('cm_home_as', { p_cm: previewCmId }) : await supabaseBrowser().rpc('cm_home');
    if (error || !data) { setFailed(true); return; }
    setHome(data as Home); setFailed(false);
  }, [previewCmId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  // Cada fecha tiene su dirección (?fecha=…): el "atrás" del celular vuelve al calendario,
  // y los avisos pueden abrir una fecha directo.
  useEffect(() => {
    setOpenId(fechaInUrl());
    const onPop = () => setOpenId(fechaInUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Atajo del ícono ("Fiesta de ahora"): cuando cargan las fechas, abre la que está pasando o por empezar.
  useEffect(() => {
    if (!home || !cameFromShortcut()) return;
    const first = liveEvents(home.dates.filter(d => d.event_status !== 'cancelado' && d.confirmation !== 'rechazada').map(d => ({ id: d.id, startsAt: d.starts_at, endsAt: d.ends_at, arriveAt: d.arrive_at })))[0];
    window.history.replaceState(first ? { fecha: first.id } : null, '', first ? `${window.location.pathname}?fecha=${first.id}` : window.location.pathname);
    setOpenId(first?.id ?? null);
  }, [home]);
  const openDate = (id: string) => { window.history.pushState({ fecha: id }, '', `${window.location.pathname}?fecha=${id}`); setOpenId(id); window.scrollTo(0, 0); };
  const closeDate = () => {
    if (window.history.state?.fecha) window.history.back();
    else { window.history.replaceState(null, '', window.location.pathname); setOpenId(null); }
  };

  const act = async (key: string, run: () => PromiseLike<{ error: { message: string } | null }>, done: string, celebrate = false) => {
    if (preview) return;
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
  const tick = (d: CmDate, item: Item, stage: Stage) => {
    if (preview) return Promise.resolve();
    const completes = stage === 'drive' && d.checklist.every(x => x.id === item.id || stageOf(x) === 'drive');
    // Se ve marcado al instante; si falla, la recarga lo vuelve atrás.
    setHome(h => h && { ...h, dates: h.dates.map(x => x.id === d.id ? { ...x, checklist: x.checklist.map(i => i.id === item.id ? { ...i, stage, done: stage === 'drive' } : i) } : x) });
    return act(item.id, () => supabaseBrowser().rpc('cm_set_stage', { p_item: item.id, p_stage: stage }), completes ? 'Todo el contenido está en el Drive' : STAGE_LABEL[stage], completes);
  };

  const header = preview
    ? <div className="preview-banner" role="note"><Eye size={18} aria-hidden="true"/><p className="min-w-0 flex-1">Así ve la app {home ? home.name.split(' ')[0] : 'esta CM'}. Desde acá no se puede tocar nada.</p><Link href="/equipo" className="btn btn-secondary btn-small">Volver</Link></div>
    : <header className="cm-header">
      <BrandMark/>
      <div className="flex items-center gap-1"><PushToggle className="header-theme"/><ThemeToggle className="header-theme"/><button type="button" className="theme-toggle header-theme" onClick={() => void onSignOut?.()} aria-label="Salir"><LogOut size={18}/><span>Salir</span></button></div>
    </header>;

  if (failed) return <>{header}<Main className="cm-page text-center"><p className="font-bold">No pudimos cargar tus fechas.</p><p className="muted mt-1 text-sm">Revisá la conexión a internet.</p><button className="btn btn-primary mt-4" onClick={() => void load()}>Reintentar</button></Main></>;
  if (!home) return <>{header}<Main className="cm-page muted text-center text-sm">Cargando tus fechas…</Main></>;

  const now = today();
  const upcoming = home.dates.filter(d => d.starts_at.slice(0, 10) >= now);
  const toAnswer = upcoming.filter(needsAnswer);

  // ---------- Una fecha, en su pantalla ----------
  const open = openId ? home.dates.find(d => d.id === openId) : undefined;
  if (openId) return <>{header}<Main className="cm-page space-y-5">
    <button type="button" className="back-link" onClick={closeDate}><ArrowLeft size={17}/> Mis fechas</button>
    {open ? <DateCard d={open} now={now} busy={busy} answer={answer} tick={tick} preview={preview} ubers={home.concepts.filter(c => c.kind === 'expense' && c.coverage_id === open.id)} reload={() => void load()}/>
      : <div className="card p-5"><p className="font-bold">Esta fecha ya no está en tu agenda.</p><p className="muted mt-1 text-sm">Puede que Dafne la haya cambiado o quitado.</p></div>}
  </Main></>;

  // ---------- Calendario y lista del mes ----------
  const shownMonth = month ?? (upcoming[0]?.starts_at.slice(0, 7) ?? now.slice(0, 7));
  const byDay = new Map<string, CmDate[]>();
  for (const d of home.dates) byDay.set(d.starts_at.slice(0, 10), [...(byDay.get(d.starts_at.slice(0, 10)) ?? []), d]);
  const monthDates = home.dates.filter(d => d.starts_at.startsWith(shownMonth));
  const pickDay = (day: string) => {
    const events = byDay.get(day) ?? [];
    if (events.length === 1) { openDate(events[0].id); return; }
    setSelectedDay(day);
    if (events.length) document.getElementById(`dia-${day}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const moveMonth = (delta: number) => { setMonth(shiftMonth(shownMonth, delta)); setSelectedDay(null); };

  return <>{header}<Main className="cm-page space-y-6">
    {!preview && <><InstallHint/><PushPrompt forCm/></>}
    <div><h1 className="page-title">Hola, {home.name.split(' ')[0]}</h1><p className="muted mt-2">{upcoming.length ? `Tenés ${upcoming.length === 1 ? 'una fiesta' : `${upcoming.length} fiestas`} por delante.` : 'No tenés fiestas por delante.'}</p></div>

    <LiveNow items={home.dates.filter(d => d.event_status !== 'cancelado' && d.confirmation !== 'rechazada').map(d => ({ id: d.id, name: d.name, salon: d.salon, startsAt: d.starts_at, endsAt: d.ends_at, arriveAt: d.arrive_at, livePosting: d.live_posting }))} onOpen={openDate}/>

    {toAnswer.length > 0 && <section className="cm-to-answer" aria-labelledby="to-answer-title">
      <h2 id="to-answer-title" className="font-bold">{toAnswer.length === 1 ? 'Tenés una fecha para confirmar' : `Tenés ${toAnswer.length} fechas para confirmar`}</h2>
      <ul className="cm-rows">{toAnswer.map(d => <li key={d.id}><DateRow d={d} onOpen={openDate}/></li>)}</ul>
    </section>}

    <div className="coverage-view-switch cm-tabs" role="tablist" aria-label="Sección"><button role="tab" aria-selected={tab === 'fechas'} className={tab === 'fechas' ? 'selected' : ''} onClick={() => setTab('fechas')}><CalendarDays size={17}/> Fechas</button><button role="tab" aria-selected={tab === 'pagos'} className={tab === 'pagos' ? 'selected' : ''} onClick={() => setTab('pagos')}><Wallet size={17}/> Pagos</button><button role="tab" aria-selected={tab === 'perfil'} className={tab === 'perfil' ? 'selected' : ''} onClick={() => setTab('perfil')}><UserRound size={17}/> Perfil</button></div>

    {tab === 'fechas' ? <section className="space-y-4" aria-label="Mis fechas">
      <div className="cm-cal card">
        <div className="cm-cal-head">
          <button type="button" className="btn btn-quiet btn-small" aria-label="Mes anterior" onClick={() => moveMonth(-1)}><ChevronLeft size={18}/></button>
          <h2 className="font-bold" aria-live="polite">{monthName(shownMonth)}</h2>
          <button type="button" className="btn btn-quiet btn-small" aria-label="Mes siguiente" onClick={() => moveMonth(1)}><ChevronRight size={18}/></button>
        </div>
        <div className="cm-cal-week" aria-hidden="true">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="cm-cal-grid">{calendarDays(shownMonth).map(day => {
          const events = byDay.get(day) ?? [];
          const classes = ['cm-cal-day', day.slice(0, 7) !== shownMonth && 'is-outside', day === now && 'is-today', day === selectedDay && 'is-selected', events.length > 0 && 'has-events'].filter(Boolean).join(' ');
          return <button key={day} type="button" className={classes} onClick={() => pickDay(day)} disabled={!events.length}
            aria-label={`${longDay(day)}${events.length ? `: ${events.map(e => `${e.name}, ${status(e).label}`).join('; ')}` : ''}`}>
            <span>{Number(day.slice(8))}</span>
            {events.length > 0 && <span className="cm-cal-dots">{events.slice(0, 3).map(e => <i key={e.id} className={`dot-${status(e).tone}`}/>)}</span>}
          </button>;
        })}</div>
        <p className="cm-cal-legend"><span><i className="dot-warn"/> Para confirmar</span><span><i className="dot-ok"/> Confirmada</span><span><i className="dot-muted"/> Realizada</span></p>
      </div>
      {monthDates.length
        ? <ul className="cm-rows">{monthDates.map(d => <li key={d.id} id={`dia-${d.starts_at.slice(0, 10)}`} className={d.starts_at.slice(0, 10) === selectedDay ? 'is-selected' : ''}><DateRow d={d} onOpen={openDate}/></li>)}</ul>
        : <p className="muted text-center">No tenés fechas en {monthName(shownMonth).split(' ')[0].toLowerCase()}.</p>}
      {!preview && <CalendarSubscribe who="cm"/>}
    </section> : tab === 'pagos' ? <CmPayments concepts={home.concepts} preview={preview} onChange={() => void load()}/>
      : <CmProfile key={`${home.profile?.phone}|${home.profile?.alias}|${home.profile?.photo_path}`} profile={home.profile ?? { name: home.name, email: '', phone: '', alias: '', photo_path: null }} preview={preview} onChange={() => void load()}>
          {!preview && <ChangePassword/>}
        </CmProfile>}
  </Main></>;
}

/** Una línea por fiesta: día, nombre, hora y salón, y su estado. Abre la fecha. */
function DateRow({ d, onOpen }: { d: CmDate; onOpen: (id: string) => void }) {
  const s = status(d);
  return <button type="button" className="cm-row" onClick={() => onOpen(d.id)}>
    <span className="cm-row-date"><strong>{Number(d.starts_at.slice(8, 10))}</strong>{weekday(d.starts_at)}</span>
    <span className="min-w-0 flex-1 text-left"><span className="block font-bold leading-tight line-clamp-2">{d.name}</span><span className="muted block truncate text-sm">{d.arrive_at ? `Llegás ${time(d.arrive_at)}` : `${time(d.starts_at)} hs`} · {d.salon}</span></span>
    <span className={`badge cm-status-${s.tone}`}>{s.label}</span>
    <ChevronRight size={18} className="shrink-0 text-[var(--muted)]"/>
  </button>;
}

/** La fecha completa: la entrada y, abajo, el mapa, la respuesta, el equipo y el contenido. */
function DateCard({ d, now, busy, answer, tick, preview = false, ubers, reload }: {
  d: CmDate; now: string; busy: string; preview?: boolean; ubers: Concept[]; reload: () => void;
  answer: (d: CmDate, value: 'confirmada' | 'rechazada') => Promise<void>;
  tick: (d: CmDate, item: Item, stage: Stage) => Promise<void>;
}) {
  return <article className="cm-date" aria-label={d.name}>
    {/* El mapa va afuera de la entrada: en Safari del iPhone, un mapa embebido dentro de algo con máscara (las muescas) no se dibuja. */}
    <div className={`ticket ticket-${d.event_status}`}>
      <div className="ticket-main">
        <p className="ticket-when"><span className={`when-pill when-${d.event_status}`}>{d.event_status === 'cancelado' ? 'Cancelada' : untilLabel(d.starts_at)}</span>{d.live_posting && <span className="live-badge">En vivo</span>}<span>{longDay(d.starts_at)}</span></p>
        <h1 className="ticket-name">{d.name}</h1>
        <p className="ticket-place"><MapPin size={15}/>{[d.party_type, d.salon].filter(Boolean).join(', en ')}</p>
        {d.arrive_at && <p className="ticket-arrive"><Clock size={15}/>Llegá a las {time(d.arrive_at)}</p>}
        <p className="ticket-extra">{[d.client && `Para ${d.client}`, d.address].filter(Boolean).join('. ')}</p>
        {d.notes && <p className="ticket-note">{d.notes}</p>}
      </div>
      <div className="ticket-stub" aria-label={`De ${time(d.starts_at)}${d.ends_at ? ` a ${time(d.ends_at)}` : ''}`}><time>{time(d.starts_at)}</time>{d.ends_at && <><span className="stub-line" aria-hidden="true"/><time>{time(d.ends_at)}</time></>}</div>
    </div>
    <div className="cm-date-body">
      {d.event_status === 'pendiente' && <WeatherStrip startsAt={d.starts_at} endsAt={d.ends_at} coords={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null}/>}
      {d.address && d.starts_at.slice(0, 10) >= now && <MapPreview address={d.address} label={d.salon} coords={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null}/>}
      {d.event_status === 'pendiente' && <div className={`cm-answer answer-${d.confirmation}`}>
        {d.confirmation === 'pendiente' && <><p className="font-bold">¿Podés cubrirla? La cobertura es de <span className="whitespace-nowrap">{ars(d.fee_cents)}</span>.</p><div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={!!busy || preview} onClick={() => void answer(d, 'confirmada')}>Sí, la cubro</button><button className="btn btn-secondary" disabled={!!busy || preview} onClick={() => void answer(d, 'rechazada')}>No puedo</button></div></>}
        {d.confirmation === 'confirmada' && <><p><span className="badge badge-success">Confirmaste</span> <span className="muted text-sm">Cobertura {ars(d.fee_cents)}</span></p><button className="btn btn-quiet btn-small" disabled={!!busy || preview} onClick={() => void answer(d, 'rechazada')}>Ya no puedo ir</button></>}
        {d.confirmation === 'rechazada' && <><p><span className="badge badge-danger">Avisaste que no podés</span></p><button className="btn btn-secondary btn-small" disabled={!!busy || preview} onClick={() => void answer(d, 'confirmada')}>Sí puedo</button></>}
      </div>}
      {!!d.schedule?.length && <div><p className="text-sm font-bold">Cronograma de la noche</p><ol className="schedule-list mt-2">{d.schedule.map(m => <li key={m.id}><time>{time(m.at)}</time><span className="min-w-0 flex-1">{m.label}</span>{m.notify && d.event_status === 'pendiente' && d.confirmation !== 'rechazada' && <span className="schedule-bell" title="Te llega un aviso 10 minutos antes"><Bell size={14} aria-hidden="true"/><span className="sr-only">Te avisamos 10 minutos antes</span></span>}</li>)}</ol></div>}
      {(d.team.length > 0 || d.dafne_goes) && <div><p className="text-sm font-bold">{d.team.length + (d.dafne_goes ? 1 : 0) > 1 ? 'También cubren' : 'También cubre'}</p><ul className="cm-team">{d.dafne_goes && <li><span className="font-semibold">Dafne</span></li>}{d.team.map((m, i) => <li key={i}><span className="font-semibold">{m.name}</span>{m.confirmation !== 'confirmada' && <span className="muted text-sm"> ({m.confirmation === 'rechazada' ? 'no puede' : 'sin confirmar'})</span>}{m.phone && <a className="text-link inline-flex items-center gap-1" href={`tel:${m.phone.replace(/[^+0-9]/g, '')}`}><Phone size={14}/>{m.phone}</a>}</li>)}</ul></div>}
      {d.live_posting && d.event_status !== 'cancelado' && <p className="live-note"><Radio size={18} aria-hidden="true"/><span><strong>Esta fiesta sale en vivo.</strong> A medida que tengas videos editados, se suben a la cuenta de IG durante la fiesta.</span></p>}
      {/^https:\/\//i.test(d.drive_url ?? '') && d.confirmation !== 'rechazada' && d.event_status !== 'cancelado' && <a className="drive-link" href={d.drive_url} target="_blank" rel="noopener noreferrer"><FolderUp size={20} aria-hidden="true"/><span className="min-w-0 flex-1"><span className="block font-bold">Subí el contenido acá</span><span className="block truncate text-sm opacity-80">Carpeta de Drive de esta fiesta</span></span></a>}
      <CmUbers event={{ id: d.id, startsAt: d.starts_at, endsAt: d.ends_at, address: d.address }} ubers={ubers} canAdd={d.confirmation === 'confirmada' && d.event_status !== 'cancelado'} preview={preview} onChange={reload}/>
      {d.checklist.length > 0 && <div><p className="text-sm font-bold">Contenido a cubrir</p><StoryBars items={d.checklist}/><ul className="mt-3 space-y-2">{d.checklist.map(item => <li key={item.id}><StageButton stage={stageOf(item)} text={item.text} disabled={preview || d.confirmation === 'rechazada' || busy === item.id} onChange={s => void tick(d, item, s)}/></li>)}</ul><p className="muted mt-2 text-xs">Tocá para marcar: ✓ lo mandaste por WhatsApp · ✓✓ lo subiste al Drive.</p></div>}
    </div>
  </article>;
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
