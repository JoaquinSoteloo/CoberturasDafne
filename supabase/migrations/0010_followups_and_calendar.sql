-- Avisos de seguimiento para la coordinadora (cobros y entregas atrasados) y
-- links privados de agenda para sumar las fechas al calendario del celular.

-- ---------- Avisos de seguimiento ----------

alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('reminder', 'assigned', 'answered', 'paid', 'unpaid', 'undelivered'));

-- Cobro pendiente: a los 3 y a los 10 días de la fiesta, si el salón todavía debe.
-- Entrega atrasada: a los 2 y a los 5 días, si el contenido no está entregado.
-- Solo se anotan entre las 10 y las 20 (hora argentina), para no avisar de madrugada.
create function public.enqueue_followups()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare added integer := 0; n integer;
begin
  if extract(hour from private.local_now()) not between 10 and 19 then return 0; end if;

  with money as (
    select c.id, c.owner_id, c.starts_at,
      c.agreed_cents + coalesce((select sum(e.amount_cents) from public.expenses e where e.coverage_id = c.id and e.absorbed_by = 'salon'), 0)
        - coalesce((select sum(co.amount_cents) from public.collections co where co.coverage_id = c.id), 0) as owed
    from public.coverages c
    where c.event_status <> 'cancelado'
  ),
  due as (
    select m.*, step from money m
    cross join (values (3), (10)) as s(step)
    where m.owed > 0 and m.starts_at + make_interval(days => step) <= private.local_now()
      and m.starts_at + make_interval(days => step) > private.local_now() - interval '2 days'
  ),
  ins as (
    insert into private.notification_outbox (user_id, kind, data, dedupe)
    select d.owner_id, 'unpaid', private.coverage_info(d.id) || jsonb_build_object('owed_cents', d.owed, 'days', d.step),
           'unpaid:' || d.id || ':' || d.step
    from due d
    on conflict (dedupe) do nothing
    returning 1
  )
  select count(*) into n from ins;
  added := added + n;

  with due as (
    select c.id, c.owner_id, step from public.coverages c
    cross join (values (2), (5)) as s(step)
    where c.event_status <> 'cancelado' and c.delivery_status = 'pendiente'
      and c.starts_at + make_interval(days => step) <= private.local_now()
      and c.starts_at + make_interval(days => step) > private.local_now() - interval '2 days'
  ),
  ins as (
    insert into private.notification_outbox (user_id, kind, data, dedupe)
    select d.owner_id, 'undelivered', private.coverage_info(d.id) || jsonb_build_object('days', d.step),
           'undelivered:' || d.id || ':' || d.step
    from due d
    on conflict (dedupe) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return added + n;
end;
$$;
revoke all on function public.enqueue_followups() from public, anon, authenticated;
grant execute on function public.enqueue_followups() to service_role;

-- ---------- Agenda para el calendario del celular ----------

-- Un link privado por cuenta. Quien lo tiene ve las fechas: por eso se puede cambiar.
create table private.calendar_tokens (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
revoke all on private.calendar_tokens from public, anon, authenticated;

-- Devuelve el link de quien llama (lo crea la primera vez). p_new = true lo cambia.
create function public.my_calendar_token(p_new boolean default false)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare result uuid;
begin
  if public.my_role() is null then raise exception 'Tu cuenta no está habilitada.' using errcode = '42501'; end if;
  if p_new then delete from private.calendar_tokens where user_id = auth.uid(); end if;
  insert into private.calendar_tokens (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select token into result from private.calendar_tokens where user_id = auth.uid();
  return result;
end;
$$;
revoke all on function public.my_calendar_token(boolean) from public, anon;
grant execute on function public.my_calendar_token(boolean) to authenticated;

-- Las fechas de la agenda de un link: todas para la coordinadora; para una CM, las
-- suyas que no rechazó. Solo la usa el servidor (la ruta del calendario).
create function public.calendar_events(p_token uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with owner as (
    select t.user_id, u.email, exists (select 1 from public.coordinators k where k.user_id = t.user_id) as coordinator
    from private.calendar_tokens t join auth.users u on u.id = t.user_id
    where t.token = p_token
  ),
  cm as (
    select m.id from public.cms m join owner o on not o.coordinator and m.email <> '' and lower(m.email) = lower(o.email) limit 1
  )
  select case when not exists (select 1 from owner) then null else jsonb_build_object(
    'coordinator', (select coordinator from owner),
    'events', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'party_type', c.party_type, 'salon', s.name,
      'address', coalesce(nullif(c.address, ''), s.address), 'starts_at', c.starts_at, 'ends_at', c.ends_at,
      'notes', c.notes, 'event_status', c.event_status, 'updated_at', c.updated_at,
      'confirmation', a.confirmation) order by c.starts_at)
    from public.coverages c
    join public.salons s on s.id = c.salon_id
    left join public.assignments a on a.coverage_id = c.id and a.cm_id = (select id from cm)
    where c.starts_at > (now() at time zone 'America/Argentina/Buenos_Aires') - interval '60 days'
      and ((select coordinator from owner) and c.owner_id = (select user_id from owner)
           or a.id is not null and a.confirmation <> 'rechazada')
  ), '[]'::jsonb)) end;
$$;
revoke all on function public.calendar_events(uuid) from public, anon, authenticated;
grant execute on function public.calendar_events(uuid) to service_role;
