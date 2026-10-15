-- Ediciones de video que Dafne le pide a una CM aparte de las fiestas (historia, reel o carrusel).
-- El pedido se le manda por WhatsApp; acá queda para pagarlo aparte, con su comprobante.
-- Se le debe cuando está entregada (como una cobertura, que se debe cuando la fiesta ya pasó).

create table public.edit_requests (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cm_id        uuid not null references public.cms (id) on delete restrict,
  format       text not null check (format in ('historia', 'reel', 'carrusel')),
  details      text not null default '',
  requested_on date not null default current_date,
  due_on       date,
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  status       text not null default 'pedida' check (status in ('pedida', 'entregada')),
  delivered_on date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1
);
create index on public.edit_requests (owner_id);
create index on public.edit_requests (cm_id);
alter table public.edit_requests enable row level security;
create policy "Solo la coordinadora" on public.edit_requests for all to authenticated
  using ((select auth.uid()) = owner_id and (select private.is_coordinator()))
  with check ((select auth.uid()) = owner_id and (select private.is_coordinator()));
create trigger edit_requests_touch before update on public.edit_requests
  for each row execute function private.touch_row();
create trigger edit_requests_money after insert or delete on public.edit_requests
  for each row execute function private.log_money();
create trigger edit_requests_money_update after update on public.edit_requests
  for each row when (old.amount_cents is distinct from new.amount_cents or old.status is distinct from new.status
                     or old.cm_id is distinct from new.cm_id)
  execute function private.log_money();

-- Un pago a una CM puede ser (en parte) por una edición: cada parte apunta a una sola cosa.
alter table public.payment_allocations add column edit_id uuid references public.edit_requests (id) on delete restrict;
alter table public.payment_allocations drop constraint payment_allocations_check;
alter table public.payment_allocations add constraint payment_allocations_one_concept
  check (num_nonnulls(assignment_id, expense_id, edit_id) = 1);
create index on public.payment_allocations (edit_id) where edit_id is not null;

-- save_changes guarda las ediciones y los pagos que apuntan a ellas.
create or replace function public.save_changes(changes jsonb)
returns jsonb
language plpgsql
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
  delete from public.edit_requests   where id in (select jsonb_array_elements_text(coalesce(del -> 'edit_requests', '[]'))::uuid);
  delete from public.cms             where id in (select jsonb_array_elements_text(coalesce(del -> 'cms', '[]'))::uuid);
  delete from public.salons          where id in (select jsonb_array_elements_text(coalesce(del -> 'salons', '[]'))::uuid);

  -- Altas y cambios: primero los padres.
  result := result
    || jsonb_build_object('salons', private.apply_rows('salons', coalesce(up -> 'salons', '[]'),
         array['name', 'address', 'lat', 'lng']))
    || jsonb_build_object('cms', private.apply_rows('cms', coalesce(up -> 'cms', '[]'),
         array['name', 'phone', 'email', 'notes', 'alias']))
    || jsonb_build_object('coverages', private.apply_rows('coverages', coalesce(up -> 'coverages', '[]'),
         array['name', 'party_type', 'client', 'salon_id', 'address', 'starts_at', 'ends_at', 'arrive_at', 'notes', 'agreed_cents', 'live_posting', 'dafne_goes',
               'drive_url', 'delivered_pieces', 'delivery_notes', 'event_status', 'delivery_status']))
    || jsonb_build_object('assignments', private.apply_rows('assignments', coalesce(up -> 'assignments', '[]'),
         array['coverage_id', 'cm_id', 'fee_cents', 'confirmation', 'position']))
    || jsonb_build_object('expenses', private.apply_rows('expenses', coalesce(up -> 'expenses', '[]'),
         array['coverage_id', 'label', 'kind', 'amount_cents', 'payment_status', 'advanced_by', 'advanced_cm_id', 'absorbed_by', 'position',
               'trip_from', 'trip_to', 'trip_started_at', 'trip_ended_at']))
    || jsonb_build_object('checklist_items', private.apply_rows('checklist_items', coalesce(up -> 'checklist_items', '[]'),
         array['coverage_id', 'text', 'done', 'stage', 'position']))
    || jsonb_build_object('schedule_items', private.apply_rows('schedule_items', coalesce(up -> 'schedule_items', '[]'),
         array['coverage_id', 'at', 'label', 'notify', 'position']))
    || jsonb_build_object('edit_requests', private.apply_rows('edit_requests', coalesce(up -> 'edit_requests', '[]'),
         array['cm_id', 'format', 'details', 'requested_on', 'due_on', 'amount_cents', 'status', 'delivered_on']))
    || jsonb_build_object('collections', private.apply_rows('collections', coalesce(up -> 'collections', '[]'),
         array['coverage_id', 'date', 'amount_cents', 'notes']))
    || jsonb_build_object('cm_payments', private.apply_rows('cm_payments', coalesce(up -> 'cm_payments', '[]'),
         array['cm_id', 'date', 'notes']));

  -- El reparto de cada pago guardado se reemplaza completo.
  for payment in select * from jsonb_array_elements(coalesce(up -> 'cm_payments', '[]')) loop
    delete from public.payment_allocations where payment_id = (payment ->> 'id')::uuid;
    insert into public.payment_allocations (payment_id, position, owner_id, assignment_id, expense_id, edit_id, amount_cents)
    select (payment ->> 'id')::uuid, a.position, me, a.assignment_id, a.expense_id, a.edit_id, a.amount_cents
    from jsonb_to_recordset(coalesce(payment -> 'allocations', '[]'))
      as a(position integer, assignment_id uuid, expense_id uuid, edit_id uuid, amount_cents bigint);
  end loop;

  return result;
end;
$$;

-- La app de la CM recibe sus ediciones junto a sus coberturas y Ubers (kind 'edit'). coverage_id es el
-- de la edición, así cada una es un renglón propio; starts_at, el día que la entregó (o que se pidió).
create or replace function private.cm_home_for(p_cm uuid)
returns jsonb
language sql
stable
security definer
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
        select jsonb_agg(jsonb_build_object('id', i.id, 'text', i.text, 'done', i.done, 'stage', i.stage) order by i.position)
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
      (select jsonb_agg(jsonb_build_object('date', p.date, 'amount_cents', pa.amount_cents, 'receipt_path', p.receipt_path) order by p.date)
         from public.payment_allocations pa join public.cm_payments p on p.id = pa.payment_id where pa.assignment_id = a.id) as payments,
      null::text as trip_from, null::text as trip_to, null::timestamp as trip_started_at, null::timestamp as trip_ended_at,
      null::text as edit_status, null::date as due_on
    from public.assignments a join me on a.cm_id = me.id join public.coverages c on c.id = a.coverage_id
    where c.event_status <> 'cancelado'
    union all
    select c.id, c.name, c.starts_at, 'expense', 'Reintegro: ' || e.label, e.amount_cents,
      (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.expense_id = e.id),
      e.id, e.receipt_path, e.loaded_by_cm,
      (select jsonb_agg(jsonb_build_object('date', p.date, 'amount_cents', pa.amount_cents, 'receipt_path', p.receipt_path) order by p.date)
         from public.payment_allocations pa join public.cm_payments p on p.id = pa.payment_id where pa.expense_id = e.id),
      e.trip_from, e.trip_to, e.trip_started_at, e.trip_ended_at, null, null
    from public.expenses e join me on e.advanced_cm_id = me.id join public.coverages c on c.id = e.coverage_id
    where e.advanced_by = 'cm' and c.event_status <> 'cancelado'
    union all
    select r.id, case r.format when 'historia' then 'Historia' when 'reel' then 'Reel' else 'Carrusel' end,
      coalesce(r.delivered_on, r.requested_on)::timestamp, 'edit', r.details, r.amount_cents,
      (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.edit_id = r.id),
      null, null, null,
      (select jsonb_agg(jsonb_build_object('date', p.date, 'amount_cents', pa.amount_cents, 'receipt_path', p.receipt_path) order by p.date)
         from public.payment_allocations pa join public.cm_payments p on p.id = pa.payment_id where pa.edit_id = r.id),
      null, null, null, null, r.status, r.due_on
    from public.edit_requests r join me on r.cm_id = me.id
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'name', (select m.name from public.cms m join me on m.id = me.id),
    'profile', (select jsonb_build_object('name', m.name, 'email', m.email, 'phone', m.phone, 'alias', coalesce(m.alias, ''), 'photo_path', m.photo_path)
                from public.cms m join me on m.id = me.id),
    'dates', coalesce((select jsonb_agg(item order by starts_at) from dates), '[]'::jsonb),
    'concepts', coalesce((select jsonb_agg(jsonb_build_object(
        'coverage_id', coverage_id, 'coverage_name', coverage_name, 'starts_at', starts_at, 'kind', kind, 'label', label,
        'amount_cents', amount_cents, 'paid_cents', least(paid_cents, amount_cents),
        'expense_id', expense_id, 'receipt_path', receipt_path, 'loaded_by_cm', loaded_by_cm, 'payments', coalesce(payments, '[]'::jsonb),
        'trip_from', trip_from, 'trip_to', trip_to, 'trip_started_at', trip_started_at, 'trip_ended_at', trip_ended_at,
        'edit_status', edit_status, 'due_on', due_on) order by starts_at desc, kind desc)
      from concepts), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.date, 'receipt_path', p.receipt_path,
        'amount_cents', (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.payment_id = p.id)
      ) order by p.date desc)
      from public.cm_payments p join me on p.cm_id = me.id), '[]'::jsonb)
  ) end;
$$;
