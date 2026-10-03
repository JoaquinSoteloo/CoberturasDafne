-- Avisos a la CM cuando cambia, se cancela o la sacan de una fiesta, y cuando falta
-- poco y todavía no contestó. Cronograma de la noche con aviso opcional antes de cada
-- momento. "Ver como" una CM para la coordinadora. Limpieza de comprobantes sueltos.

-- ---------- Bandeja de salida ----------

alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('reminder', 'assigned', 'answered', 'paid', 'unpaid', 'undelivered',
                  'changed', 'cancelled', 'removed', 'unanswered', 'moment'));
create index on private.notification_outbox ((data ->> 'coverage_id')) where sent_at is null;

-- El despachador pide solo los tipos de aviso que sabe escribir. Sin lista (la versión
-- publicada antes de este cambio), recibe los de siempre y los nuevos esperan.
-- Los avisos de un momento de la noche que no salieron a tiempo ya no sirven: se descartan.
drop function public.pending_notifications(integer);
create function public.pending_notifications(p_limit integer default 100, p_kinds text[] default null)
returns jsonb
language sql security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'kind', o.kind, 'data', o.data,
    'for_coordinator', exists (select 1 from public.coordinators k where k.user_id = o.user_id),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                              from public.push_subscriptions s where s.user_id = o.user_id), '[]'::jsonb)
  ) order by o.id), '[]'::jsonb)
  from (select * from private.notification_outbox
        where sent_at is null and attempts < 5 and created_at > now() - interval '2 days'
          and case when p_kinds is null then kind in ('reminder', 'assigned', 'answered', 'paid', 'unpaid', 'undelivered')
                   else kind = any(p_kinds) end
          and (kind <> 'moment' or created_at > now() - interval '15 minutes')
        order by id limit p_limit) o;
$$;

-- ---------- Cambios de fecha y cancelaciones ----------

-- A las CM asignadas que no rechazaron, si la fiesta no pasó. Si Dafne cambia el
-- horario varias veces antes de que salga el aviso, sale uno solo con el horario
-- de antes del primer cambio.
create function private.notify_coverage_changed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  what text;
  target uuid;
  previous jsonb;
  first_starts timestamp;
  first_arrive timestamp;
begin
  if old.event_status = 'pendiente' and new.event_status = 'cancelado' then
    what := 'cancelled';
  elsif old.event_status = 'pendiente' and new.event_status = 'pendiente'
        and (new.starts_at is distinct from old.starts_at or new.arrive_at is distinct from old.arrive_at) then
    what := 'changed';
  else
    return null;
  end if;
  if greatest(new.starts_at, old.starts_at) <= private.local_now() then return null; end if;

  for target in
    select distinct private.cm_user_id(a.cm_id) from public.assignments a
    where a.coverage_id = new.id and a.confirmation <> 'rechazada'
  loop
    continue when target is null;
    -- Lo que todavía no salió de esta fiesta queda viejo.
    with gone as (
      delete from private.notification_outbox o
      where o.sent_at is null and o.user_id = target and o.data ->> 'coverage_id' = new.id::text
        and o.kind in ('changed', 'reminder', 'unanswered', 'moment')
      returning o.kind, o.data)
    select g.data into previous from gone g where g.kind = 'changed' limit 1;
    if previous is null then
      first_starts := old.starts_at; first_arrive := old.arrive_at;
    else
      first_starts := (previous ->> 'old_starts_at')::timestamp; first_arrive := (previous ->> 'old_arrive_at')::timestamp;
    end if;
    -- Volvió al horario que ella conocía: no hay nada que avisar.
    continue when what = 'changed' and new.starts_at = first_starts and new.arrive_at is not distinct from first_arrive;
    insert into private.notification_outbox (user_id, kind, data)
    values (target, what, private.coverage_info(new.id)
      || jsonb_build_object('old_starts_at', first_starts, 'old_arrive_at', first_arrive));
  end loop;
  return null;
end;
$$;
create trigger coverages_notify_changed after update of starts_at, arrive_at, event_status on public.coverages
  for each row execute function private.notify_coverage_changed();

-- Dafne saca a una CM de una fiesta (o la cambia por otra). Si la CM ya había dicho que
-- no, o la fiesta ya pasó, no se avisa. Si el aviso de "fecha nueva" todavía no había
-- salido, se borra y listo: para ella no pasó nada.
create function private.notify_removed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare target uuid := private.cm_user_id(old.cm_id);
begin
  if tg_op = 'UPDATE' and new.cm_id = old.cm_id then return null; end if;
  if target is null or old.confirmation = 'rechazada' then return null; end if;
  if not exists (select 1 from public.coverages c where c.id = old.coverage_id
                 and c.event_status = 'pendiente' and c.starts_at > private.local_now()) then return null; end if;

  delete from private.notification_outbox o
  where o.sent_at is null and o.user_id = target and o.data ->> 'coverage_id' = old.coverage_id::text
    and o.kind in ('changed', 'reminder', 'unanswered', 'moment');
  delete from private.notification_outbox o
  where o.sent_at is null and o.dedupe = 'assigned:' || old.id || ':' || old.cm_id;
  if found then return null; end if;

  insert into private.notification_outbox (user_id, kind, data)
  values (target, 'removed', private.coverage_info(old.coverage_id));
  return null;
end;
$$;
create trigger assignments_notify_removed after delete or update of cm_id on public.assignments
  for each row execute function private.notify_removed();

-- Si se borra la fiesta entera, las asignaciones se borran antes (save_changes borra
-- primero los hijos): esos avisos de "te sacaron" pasan a ser "se canceló".
create function private.notify_coverage_deleted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update private.notification_outbox o
  set kind = 'cancelled', data = o.data || jsonb_build_object('deleted', true)
  where o.sent_at is null and o.kind = 'removed' and o.created_at = now() and o.data ->> 'coverage_id' = old.id::text;
  delete from private.notification_outbox o
  where o.sent_at is null and o.kind not in ('cancelled', 'removed') and o.data ->> 'coverage_id' = old.id::text;
  return null;
end;
$$;
create trigger coverages_notify_deleted after delete on public.coverages
  for each row execute function private.notify_coverage_deleted();

-- ---------- Cronograma de la noche ----------

-- Momentos con hora (entrada, vals, torta…). Con `notify`, las CM reciben un aviso
-- 10 minutos antes.
create table public.schedule_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  coverage_id uuid not null references public.coverages (id) on delete cascade,
  at          timestamp not null,          -- hora local, como starts_at
  label       text not null check (length(trim(label)) > 0),
  notify      boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);
create index on public.schedule_items (owner_id);
create index on public.schedule_items (coverage_id);
create index on public.schedule_items (at) where notify;
alter table public.schedule_items enable row level security;
create policy "Solo la coordinadora" on public.schedule_items for all to authenticated
  using ((select auth.uid()) = owner_id and (select private.is_coordinator()))
  with check ((select auth.uid()) = owner_id and (select private.is_coordinator()));
create trigger schedule_items_touch before update on public.schedule_items
  for each row execute function private.touch_row();

-- save_changes guarda el cronograma.
create or replace function public.save_changes(changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  up  jsonb := coalesce(changes -> 'upsert', '{}'::jsonb);
  del jsonb := coalesce(changes -> 'delete', '{}'::jsonb);
  me  uuid := auth.uid();
  result jsonb := '{}'::jsonb;
  payment jsonb;
begin
  if me is null or not private.is_coordinator() then
    raise exception 'Solo la coordinadora puede guardar cambios.' using errcode = '42501';
  end if;

  -- Borrados: primero los hijos.
  delete from public.cm_payments     where id in (select jsonb_array_elements_text(coalesce(del -> 'cm_payments', '[]'))::uuid);
  delete from public.collections     where id in (select jsonb_array_elements_text(coalesce(del -> 'collections', '[]'))::uuid);
  delete from public.checklist_items where id in (select jsonb_array_elements_text(coalesce(del -> 'checklist_items', '[]'))::uuid);
  delete from public.schedule_items  where id in (select jsonb_array_elements_text(coalesce(del -> 'schedule_items', '[]'))::uuid);
  delete from public.expenses        where id in (select jsonb_array_elements_text(coalesce(del -> 'expenses', '[]'))::uuid);
  delete from public.assignments     where id in (select jsonb_array_elements_text(coalesce(del -> 'assignments', '[]'))::uuid);
  delete from public.coverages       where id in (select jsonb_array_elements_text(coalesce(del -> 'coverages', '[]'))::uuid);
  delete from public.cms             where id in (select jsonb_array_elements_text(coalesce(del -> 'cms', '[]'))::uuid);
  delete from public.salons          where id in (select jsonb_array_elements_text(coalesce(del -> 'salons', '[]'))::uuid);

  -- Altas y cambios: primero los padres.
  result := result
    || jsonb_build_object('salons', private.apply_rows('salons', coalesce(up -> 'salons', '[]'),
         array['name', 'address', 'lat', 'lng']))
    || jsonb_build_object('cms', private.apply_rows('cms', coalesce(up -> 'cms', '[]'),
         array['name', 'phone', 'email', 'usual_fee_cents', 'notes']))
    || jsonb_build_object('coverages', private.apply_rows('coverages', coalesce(up -> 'coverages', '[]'),
         array['name', 'party_type', 'client', 'salon_id', 'address', 'starts_at', 'ends_at', 'arrive_at', 'notes', 'agreed_cents',
               'drive_url', 'delivered_pieces', 'delivery_notes', 'event_status', 'delivery_status']))
    || jsonb_build_object('assignments', private.apply_rows('assignments', coalesce(up -> 'assignments', '[]'),
         array['coverage_id', 'cm_id', 'fee_cents', 'confirmation', 'position']))
    || jsonb_build_object('expenses', private.apply_rows('expenses', coalesce(up -> 'expenses', '[]'),
         array['coverage_id', 'label', 'kind', 'amount_cents', 'payment_status', 'advanced_by', 'advanced_cm_id', 'absorbed_by', 'position',
               'trip_from', 'trip_to', 'trip_started_at', 'trip_ended_at']))
    || jsonb_build_object('checklist_items', private.apply_rows('checklist_items', coalesce(up -> 'checklist_items', '[]'),
         array['coverage_id', 'text', 'done', 'position']))
    || jsonb_build_object('schedule_items', private.apply_rows('schedule_items', coalesce(up -> 'schedule_items', '[]'),
         array['coverage_id', 'at', 'label', 'notify', 'position']))
    || jsonb_build_object('collections', private.apply_rows('collections', coalesce(up -> 'collections', '[]'),
         array['coverage_id', 'date', 'amount_cents', 'notes']))
    || jsonb_build_object('cm_payments', private.apply_rows('cm_payments', coalesce(up -> 'cm_payments', '[]'),
         array['cm_id', 'date', 'notes']));

  -- El reparto de cada pago guardado se reemplaza completo.
  for payment in select * from jsonb_array_elements(coalesce(up -> 'cm_payments', '[]')) loop
    delete from public.payment_allocations where payment_id = (payment ->> 'id')::uuid;
    insert into public.payment_allocations (payment_id, position, owner_id, assignment_id, expense_id, amount_cents)
    select (payment ->> 'id')::uuid, a.position, me, a.assignment_id, a.expense_id, a.amount_cents
    from jsonb_to_recordset(coalesce(payment -> 'allocations', '[]'))
      as a(position integer, assignment_id uuid, expense_id uuid, amount_cents bigint);
  end loop;

  return result;
end;
$$;

-- ---------- Lo que ve una CM, también para "Ver como" ----------

-- La pantalla de una CM, con el cronograma de cada fecha.
create function private.cm_home_for(p_cm uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select p_cm as id),
  dates as (
    select c.starts_at, jsonb_build_object(
      'id', c.id, 'name', c.name, 'party_type', c.party_type, 'client', c.client,
      'salon', s.name, 'address', coalesce(nullif(c.address, ''), s.address),
      'lat', case when c.address = '' or c.address = s.address then s.lat end,
      'lng', case when c.address = '' or c.address = s.address then s.lng end,
      'starts_at', c.starts_at, 'ends_at', c.ends_at, 'arrive_at', c.arrive_at, 'notes', c.notes, 'event_status', c.event_status,
      'assignment_id', a.id, 'confirmation', a.confirmation, 'fee_cents', a.fee_cents,
      'checklist', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'text', i.text, 'done', i.done) order by i.position)
        from public.checklist_items i where i.coverage_id = c.id), '[]'::jsonb),
      'schedule', coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at, 'label', m.label, 'notify', m.notify) order by m.at, m.position)
        from public.schedule_items m where m.coverage_id = c.id), '[]'::jsonb),
      'team', coalesce((
        select jsonb_agg(jsonb_build_object('name', m.name, 'phone', m.phone, 'confirmation', o.confirmation) order by o.position)
        from public.assignments o join public.cms m on m.id = o.cm_id
        where o.coverage_id = c.id and o.cm_id <> a.cm_id), '[]'::jsonb)
    ) as item
    from public.assignments a
    join me on a.cm_id = me.id
    join public.coverages c on c.id = a.coverage_id
    join public.salons s on s.id = c.salon_id
  ),
  concepts as (
    select c.id as coverage_id, c.name as coverage_name, c.starts_at, 'fee' as kind, 'Honorario' as label,
      a.fee_cents as amount_cents,
      (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.assignment_id = a.id) as paid_cents,
      null::uuid as expense_id, null::text as receipt_path,
      null::text as trip_from, null::text as trip_to, null::timestamp as trip_started_at, null::timestamp as trip_ended_at
    from public.assignments a join me on a.cm_id = me.id join public.coverages c on c.id = a.coverage_id
    where c.event_status <> 'cancelado'
    union all
    select c.id, c.name, c.starts_at, 'expense', 'Reintegro: ' || e.label, e.amount_cents,
      (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.expense_id = e.id),
      e.id, e.receipt_path, e.trip_from, e.trip_to, e.trip_started_at, e.trip_ended_at
    from public.expenses e join me on e.advanced_cm_id = me.id join public.coverages c on c.id = e.coverage_id
    where e.advanced_by = 'cm' and c.event_status <> 'cancelado'
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'name', (select m.name from public.cms m join me on m.id = me.id),
    'dates', coalesce((select jsonb_agg(item order by starts_at) from dates), '[]'::jsonb),
    'concepts', coalesce((select jsonb_agg(jsonb_build_object(
        'coverage_id', coverage_id, 'coverage_name', coverage_name, 'starts_at', starts_at, 'kind', kind, 'label', label,
        'amount_cents', amount_cents, 'paid_cents', least(paid_cents, amount_cents),
        'expense_id', expense_id, 'receipt_path', receipt_path,
        'trip_from', trip_from, 'trip_to', trip_to, 'trip_started_at', trip_started_at, 'trip_ended_at', trip_ended_at) order by starts_at desc, kind desc)
      from concepts), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.date,
        'amount_cents', (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.payment_id = p.id)
      ) order by p.date desc)
      from public.cm_payments p join me on p.cm_id = me.id), '[]'::jsonb)
  ) end;
$$;
revoke all on function private.cm_home_for(uuid) from public, anon, authenticated;

create or replace function public.cm_home()
returns jsonb
language sql stable security definer
set search_path = ''
as $$ select private.cm_home_for(private.current_cm_id()); $$;

-- "Ver como": la coordinadora ve la pantalla de una de sus CM, solo para mirar.
create function public.cm_home_as(p_cm uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_coordinator()
     or not exists (select 1 from public.cms m where m.id = p_cm and m.owner_id = auth.uid()) then
    raise exception 'No podés ver esa pantalla.' using errcode = '42501';
  end if;
  return private.cm_home_for(p_cm);
end;
$$;
revoke all on function public.cm_home_as(uuid) from public, anon;
grant execute on function public.cm_home_as(uuid) to authenticated;

-- ---------- Para el despachador ----------

-- Avisos que dependen de la hora:
--   · CM que no contestó y faltan 2 días o menos: a ella y a Dafne, una sola vez, entre
--     las 10 y las 22. Si la asignaron hace menos de 6 horas, se espera (recién le llegó).
--   · Momento del cronograma con aviso: a las CM que no rechazaron, 10 minutos antes.
create function public.enqueue_live()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare added integer := 0; n integer;
begin
  if extract(hour from private.local_now()) between 10 and 21 then
    with due as (
      select a.id as assignment_id, a.cm_id, a.fee_cents, c.id as coverage_id, c.owner_id
      from public.assignments a join public.coverages c on c.id = a.coverage_id
      where a.confirmation = 'pendiente' and c.event_status = 'pendiente'
        and c.starts_at > private.local_now() and c.starts_at <= private.local_now() + interval '48 hours'
        and a.created_at < now() - interval '6 hours'
    ),
    targets as (
      select d.*, d.owner_id as user_id from due d
      union all
      select d.*, private.cm_user_id(d.cm_id) from due d
    ),
    ins as (
      insert into private.notification_outbox (user_id, kind, data, dedupe)
      select t.user_id, 'unanswered', private.coverage_info(t.coverage_id) || jsonb_build_object(
               'cm_name', (select m.name from public.cms m where m.id = t.cm_id), 'fee_cents', t.fee_cents),
             'unanswered:' || t.assignment_id || ':' || t.user_id
      from targets t where t.user_id is not null
      on conflict (dedupe) do nothing
      returning 1
    )
    select count(*) into n from ins;
    added := added + n;
  end if;

  with due as (
    select i.id, i.at, i.label, c.id as coverage_id from public.schedule_items i
    join public.coverages c on c.id = i.coverage_id
    where i.notify and c.event_status = 'pendiente'
      and i.at > private.local_now() and i.at <= private.local_now() + interval '10 minutes'
  ),
  ins as (
    insert into private.notification_outbox (user_id, kind, data, dedupe)
    select private.cm_user_id(a.cm_id), 'moment',
           private.coverage_info(d.coverage_id) || jsonb_build_object('moment_id', d.id, 'label', d.label, 'at', d.at),
           'moment:' || d.id || ':' || d.at || ':' || private.cm_user_id(a.cm_id)
    from due d join public.assignments a on a.coverage_id = d.coverage_id and a.confirmation <> 'rechazada'
    where private.cm_user_id(a.cm_id) is not null
    on conflict (dedupe) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return added + n;
end;
$$;

-- Recordatorio de 24 horas: si la fiesta cambió de fecha, sale de nuevo para la fecha nueva.
create or replace function public.enqueue_due_reminders()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare added integer;
begin
  with due as (
    select c.id, c.owner_id, c.starts_at from public.coverages c
    where c.event_status = 'pendiente'
      and c.starts_at > private.local_now()
      and c.starts_at <= private.local_now() + interval '24 hours'
  ),
  targets as (
    select d.id as coverage_id, d.starts_at, d.owner_id as user_id from due d
    union
    select d.id, d.starts_at, private.cm_user_id(a.cm_id) from due d
    join public.assignments a on a.coverage_id = d.id and a.confirmation <> 'rechazada'
  ),
  ins as (
    insert into private.notification_outbox (user_id, kind, data, dedupe)
    select t.user_id, 'reminder', private.coverage_info(t.coverage_id)
             || jsonb_build_object('for_coordinator', exists (select 1 from public.coordinators k where k.user_id = t.user_id)),
           'reminder:' || t.coverage_id || ':' || t.user_id || ':' || t.starts_at
    from targets t where t.user_id is not null
      -- Los recordatorios anotados antes de este cambio no llevan la fecha.
      and not exists (select 1 from private.notification_outbox o where o.dedupe = 'reminder:' || t.coverage_id || ':' || t.user_id
                      and o.created_at > now() - interval '24 hours')
    on conflict (dedupe) do nothing
    returning 1
  )
  select count(*) into added from ins;
  return added;
end;
$$;

-- Comprobantes que quedaron sin gasto: el gasto se borró, o el archivo se reemplazó y
-- el viejo no se llegó a borrar. Los de la última hora se dejan (puede ser una subida en curso).
create function public.orphan_receipts(p_limit integer default 100)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.name), '{}') from (
    select o.name from storage.objects o
    where o.bucket_id = 'comprobantes' and o.created_at < now() - interval '1 hour'
      and not exists (select 1 from public.expenses e where e.receipt_path = o.name)
    order by o.created_at limit p_limit) x;
$$;

-- ---------- Permisos ----------

do $$
declare f text;
begin
  foreach f in array array['public.enqueue_live()', 'public.enqueue_due_reminders()', 'public.orphan_receipts(integer)',
                           'public.pending_notifications(integer, text[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['private.notify_coverage_changed()', 'private.notify_removed()', 'private.notify_coverage_deleted()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
