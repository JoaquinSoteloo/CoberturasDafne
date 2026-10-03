-- El "honorario habitual" de cada CM ya no se usa: el honorario se carga en cada fiesta.
-- save_changes deja de guardarlo y se borra la columna.

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

alter table public.cms drop column usual_fee_cents;
