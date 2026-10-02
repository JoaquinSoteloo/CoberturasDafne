-- Datos del viaje en los Ubers: desde dónde, hasta dónde y a qué hora.

-- Opcionales: así la versión anterior de la app, que no los manda, puede seguir guardando.
alter table public.expenses
  add column trip_from text,
  add column trip_to text,
  add column trip_started_at timestamp,   -- hora local, como las fiestas
  add column trip_ended_at timestamp;

-- save_changes guarda también los datos del viaje.
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
  delete from public.expenses        where id in (select jsonb_array_elements_text(coalesce(del -> 'expenses', '[]'))::uuid);
  delete from public.assignments     where id in (select jsonb_array_elements_text(coalesce(del -> 'assignments', '[]'))::uuid);
  delete from public.coverages       where id in (select jsonb_array_elements_text(coalesce(del -> 'coverages', '[]'))::uuid);
  delete from public.cms             where id in (select jsonb_array_elements_text(coalesce(del -> 'cms', '[]'))::uuid);
  delete from public.salons          where id in (select jsonb_array_elements_text(coalesce(del -> 'salons', '[]'))::uuid);

  -- Altas y cambios: primero los padres.
  result := result
    || jsonb_build_object('salons', private.apply_rows('salons', coalesce(up -> 'salons', '[]'),
         array['name', 'address']))
    || jsonb_build_object('cms', private.apply_rows('cms', coalesce(up -> 'cms', '[]'),
         array['name', 'phone', 'email', 'usual_fee_cents', 'notes']))
    || jsonb_build_object('coverages', private.apply_rows('coverages', coalesce(up -> 'coverages', '[]'),
         array['name', 'party_type', 'client', 'salon_id', 'address', 'starts_at', 'ends_at', 'notes', 'agreed_cents',
               'drive_url', 'delivered_pieces', 'delivery_notes', 'event_status', 'delivery_status']))
    || jsonb_build_object('assignments', private.apply_rows('assignments', coalesce(up -> 'assignments', '[]'),
         array['coverage_id', 'cm_id', 'fee_cents', 'confirmation', 'position']))
    || jsonb_build_object('expenses', private.apply_rows('expenses', coalesce(up -> 'expenses', '[]'),
         array['coverage_id', 'label', 'kind', 'amount_cents', 'payment_status', 'advanced_by', 'advanced_cm_id', 'absorbed_by', 'position',
               'trip_from', 'trip_to', 'trip_started_at', 'trip_ended_at']))
    || jsonb_build_object('checklist_items', private.apply_rows('checklist_items', coalesce(up -> 'checklist_items', '[]'),
         array['coverage_id', 'text', 'done', 'position']))
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

-- La CM ve el viaje en sus reintegros.
create or replace function public.cm_home()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select private.current_cm_id() as id),
  dates as (
    select c.starts_at, jsonb_build_object(
      'id', c.id, 'name', c.name, 'party_type', c.party_type, 'client', c.client,
      'salon', s.name, 'address', coalesce(nullif(c.address, ''), s.address),
      'starts_at', c.starts_at, 'ends_at', c.ends_at, 'notes', c.notes, 'event_status', c.event_status,
      'assignment_id', a.id, 'confirmation', a.confirmation, 'fee_cents', a.fee_cents,
      'checklist', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'text', i.text, 'done', i.done) order by i.position)
        from public.checklist_items i where i.coverage_id = c.id), '[]'::jsonb),
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
