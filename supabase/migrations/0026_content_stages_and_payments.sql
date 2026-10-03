-- 1) Contenido en dos pasos: primero se manda por WhatsApp (✓) y después se sube al Drive (✓✓).
--    "done" (lo que ya usaba la app) queda como "está en Drive"; se mantienen sincronizados.
-- 2) "Mis pagos" de la CM: cada concepto trae los pagos que lo cubrieron, con su comprobante.

alter table public.checklist_items add column stage text not null default 'pendiente'
  check (stage in ('pendiente', 'whatsapp', 'drive'));
-- Lo ya tildado se había mandado al menos por WhatsApp (siempre va primero por ahí).
update public.checklist_items set stage = 'whatsapp', done = false where done;

create function private.sync_checklist_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is null then
    -- Una versión vieja de la app que no manda el paso: se deduce del tilde.
    new.stage := case when new.done then 'drive'
                      when tg_op = 'UPDATE' and old.stage <> 'drive' then old.stage
                      when tg_op = 'UPDATE' then 'whatsapp' else 'pendiente' end;
  elsif tg_op = 'UPDATE' and new.stage is not distinct from old.stage and new.done is distinct from old.done then
    new.stage := case when new.done then 'drive' when old.stage = 'drive' then 'whatsapp' else old.stage end;
  elsif tg_op = 'INSERT' and new.done and new.stage = 'pendiente' then
    new.stage := 'drive';
  end if;
  new.done := new.stage = 'drive';
  return new;
end;
$$;
create trigger checklist_items_stage_sync before insert or update on public.checklist_items
  for each row execute function private.sync_checklist_stage();

-- La CM marca en qué paso está cada contenido.
create function public.cm_set_stage(p_item uuid, p_stage text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare me uuid := private.current_cm_id();
begin
  if me is null then raise exception 'Tu cuenta no está vinculada a una CM.' using errcode = '42501'; end if;
  if p_stage not in ('pendiente', 'whatsapp', 'drive') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  update public.checklist_items i set stage = p_stage
  where i.id = p_item and exists (
    select 1 from public.assignments a
    where a.coverage_id = i.coverage_id and a.cm_id = me and a.confirmation <> 'rechazada');
  if not found then raise exception 'No podés marcar ese contenido.' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.cm_set_stage(uuid, text) from public, anon;
grant execute on function public.cm_set_stage(uuid, text) to authenticated;

-- save_changes guarda el paso de cada contenido.
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
         array['coverage_id', 'text', 'done', 'stage', 'position']))
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

-- La CM recibe el paso de cada contenido y los pagos de cada concepto con su comprobante.
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
      null::text as trip_from, null::text as trip_to, null::timestamp as trip_started_at, null::timestamp as trip_ended_at
    from public.assignments a join me on a.cm_id = me.id join public.coverages c on c.id = a.coverage_id
    where c.event_status <> 'cancelado'
    union all
    select c.id, c.name, c.starts_at, 'expense', 'Reintegro: ' || e.label, e.amount_cents,
      (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.expense_id = e.id),
      e.id, e.receipt_path, e.loaded_by_cm,
      (select jsonb_agg(jsonb_build_object('date', p.date, 'amount_cents', pa.amount_cents, 'receipt_path', p.receipt_path) order by p.date)
         from public.payment_allocations pa join public.cm_payments p on p.id = pa.payment_id where pa.expense_id = e.id),
      e.trip_from, e.trip_to, e.trip_started_at, e.trip_ended_at
    from public.expenses e join me on e.advanced_cm_id = me.id join public.coverages c on c.id = e.coverage_id
    where e.advanced_by = 'cm' and c.event_status <> 'cancelado'
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'name', (select m.name from public.cms m join me on m.id = me.id),
    'dates', coalesce((select jsonb_agg(item order by starts_at) from dates), '[]'::jsonb),
    'concepts', coalesce((select jsonb_agg(jsonb_build_object(
        'coverage_id', coverage_id, 'coverage_name', coverage_name, 'starts_at', starts_at, 'kind', kind, 'label', label,
        'amount_cents', amount_cents, 'paid_cents', least(paid_cents, amount_cents),
        'expense_id', expense_id, 'receipt_path', receipt_path, 'loaded_by_cm', loaded_by_cm, 'payments', coalesce(payments, '[]'::jsonb),
        'trip_from', trip_from, 'trip_to', trip_to, 'trip_started_at', trip_started_at, 'trip_ended_at', trip_ended_at) order by starts_at desc, kind desc)
      from concepts), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.date, 'receipt_path', p.receipt_path,
        'amount_cents', (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.payment_id = p.id)
      ) order by p.date desc)
      from public.cm_payments p join me on p.cm_id = me.id), '[]'::jsonb)
  ) end;
$$;
