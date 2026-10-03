-- "Voy yo": Dafne marca en la fiesta que va a cubrir ella (sola o con otras CM).
-- Sin honorario (lo que queda es su ganancia); sus Ubers son gasto suyo, ya pagado.
-- Le llegan los avisos del cronograma y el "¿Tomaste Uber?" de esas fiestas.
alter table public.coverages add column dafne_goes boolean default false;

-- save_changes guarda "Voy yo".
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
         array['name', 'phone', 'email', 'usual_fee_cents', 'notes', 'alias']))
    || jsonb_build_object('coverages', private.apply_rows('coverages', coalesce(up -> 'coverages', '[]'),
         array['name', 'party_type', 'client', 'salon_id', 'address', 'starts_at', 'ends_at', 'arrive_at', 'notes', 'agreed_cents', 'live_posting', 'dafne_goes',
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

-- La CM ve que Dafne también va.
create or replace function private.cm_home_for(p_cm uuid)
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
      'drive_url', c.drive_url, 'live_posting', c.live_posting, 'dafne_goes', coalesce(c.dafne_goes, false),
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
      null::uuid as expense_id, null::text as receipt_path, null::boolean as loaded_by_cm,
      null::text as trip_from, null::text as trip_to, null::timestamp as trip_started_at, null::timestamp as trip_ended_at
    from public.assignments a join me on a.cm_id = me.id join public.coverages c on c.id = a.coverage_id
    where c.event_status <> 'cancelado'
    union all
    select c.id, c.name, c.starts_at, 'expense', 'Reintegro: ' || e.label, e.amount_cents,
      (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.expense_id = e.id),
      e.id, e.receipt_path, e.loaded_by_cm, e.trip_from, e.trip_to, e.trip_started_at, e.trip_ended_at
    from public.expenses e join me on e.advanced_cm_id = me.id join public.coverages c on c.id = e.coverage_id
    where e.advanced_by = 'cm' and c.event_status <> 'cancelado'
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'name', (select m.name from public.cms m join me on m.id = me.id),
    'dates', coalesce((select jsonb_agg(item order by starts_at) from dates), '[]'::jsonb),
    'concepts', coalesce((select jsonb_agg(jsonb_build_object(
        'coverage_id', coverage_id, 'coverage_name', coverage_name, 'starts_at', starts_at, 'kind', kind, 'label', label,
        'amount_cents', amount_cents, 'paid_cents', least(paid_cents, amount_cents),
        'expense_id', expense_id, 'receipt_path', receipt_path, 'loaded_by_cm', loaded_by_cm,
        'trip_from', trip_from, 'trip_to', trip_to, 'trip_started_at', trip_started_at, 'trip_ended_at', trip_ended_at) order by starts_at desc, kind desc)
      from concepts), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.date, 'receipt_path', p.receipt_path,
        'amount_cents', (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.payment_id = p.id)
      ) order by p.date desc)
      from public.cm_payments p join me on p.cm_id = me.id), '[]'::jsonb)
  ) end;
$$;

-- Momentos del cronograma: también a Dafne si va.
create or replace function public.enqueue_live()
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
    union all
    -- Si va Dafne, también a ella.
    select c.owner_id, 'moment',
           private.coverage_info(d.coverage_id) || jsonb_build_object('moment_id', d.id, 'label', d.label, 'at', d.at),
           'moment:' || d.id || ':' || d.at || ':' || c.owner_id
    from due d join public.coverages c on c.id = d.coverage_id and c.dafne_goes
    on conflict (dedupe) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return added + n;
end;
$$;

-- "¿Tomaste Uber?": también a Dafne si fue.
create or replace function public.enqueue_uber_reminders()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare added integer;
begin
  if extract(hour from private.local_now()) not between 10 and 19 then return 0; end if;
  with due as (
    -- Fiestas que ya terminaron (fin cargado, o 6 horas después del inicio), hace menos de 3 días.
    select a.id as assignment_id, a.cm_id, c.id as coverage_id
    from public.assignments a join public.coverages c on c.id = a.coverage_id
    where a.confirmation = 'confirmada' and c.event_status <> 'cancelado'
      and coalesce(c.ends_at, c.starts_at + interval '6 hours') + interval '4 hours' <= private.local_now()
      and coalesce(c.ends_at, c.starts_at + interval '6 hours') > private.local_now() - interval '3 days'
      and not exists (select 1 from public.expenses e
                      where e.coverage_id = c.id and e.kind = 'uber' and e.advanced_cm_id = a.cm_id)
  ),
  ins as (
    insert into private.notification_outbox (user_id, kind, data, dedupe)
    select private.cm_user_id(d.cm_id), 'uber_missing', private.coverage_info(d.coverage_id),
           'uber_missing:' || d.assignment_id
    from due d where private.cm_user_id(d.cm_id) is not null
    union all
    -- Si fue Dafne y no cargó ningún Uber suyo (los suyos quedan como gasto de la coordinadora).
    select c.owner_id, 'uber_missing', private.coverage_info(c.id), 'uber_missing:dafne:' || c.id
    from public.coverages c
    where c.dafne_goes and c.event_status <> 'cancelado'
      and coalesce(c.ends_at, c.starts_at + interval '6 hours') + interval '4 hours' <= private.local_now()
      and coalesce(c.ends_at, c.starts_at + interval '6 hours') > private.local_now() - interval '3 days'
      and not exists (select 1 from public.expenses e where e.coverage_id = c.id and e.kind = 'uber' and e.advanced_by = 'coordinadora')
    on conflict (dedupe) do nothing
    returning 1
  )
  select count(*) into added from ins;
  return added;
end;
$$;
