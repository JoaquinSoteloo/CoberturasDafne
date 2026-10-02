-- Fechas de alta y modificación, versión por fila, ids automáticos, historial de
-- movimientos de plata, y funciones internas fuera de la API.

-- ---------- Esquema privado: lo que la API no expone ----------

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;   -- las políticas de seguridad usan estas funciones

-- Las políticas apuntan a la función, no a su nombre: siguen funcionando después de moverlas.
alter function public.is_coordinator() set schema private;
alter function public.current_cm_id() set schema private;

-- ---------- Alta, modificación y versión ----------

-- Cada cambio de una fila sube su versión. Guardar exige la versión que se leyó,
-- así una edición hecha sobre datos viejos no pisa lo que cambió otra persona.
create function private.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['salons', 'cms', 'coverages', 'assignments', 'expenses', 'checklist_items', 'collections', 'cm_payments'] loop
    execute format('alter table public.%I
      alter column id set default gen_random_uuid(),
      add column created_at timestamptz not null default now(),
      add column updated_at timestamptz not null default now(),
      add column version integer not null default 1', t);
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_row()', t || '_touch', t);
  end loop;
end $$;

alter table public.payment_allocations add column created_at timestamptz not null default now();

-- ---------- Historial de movimientos de plata ----------
-- Lo escribe la base sola. No lo usa la app: sirve para reconstruir qué pasó si algo no cierra.

create table private.money_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid default auth.uid(),
  table_name text not null,
  action     text not null,
  row_id     text,
  old_row    jsonb,
  new_row    jsonb
);
revoke all on private.money_log from public, anon, authenticated;
create index on private.money_log (table_name, row_id);
create index on private.money_log (at);

create function private.log_money()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into private.money_log (table_name, action, row_id, old_row, new_row)
  values (tg_table_name, lower(tg_op), coalesce(r ->> 'id', r ->> 'payment_id'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end;
$$;

create trigger collections_money after insert or update or delete on public.collections
  for each row execute function private.log_money();
create trigger cm_payments_money after insert or update or delete on public.cm_payments
  for each row execute function private.log_money();
create trigger payment_allocations_money after insert or update or delete on public.payment_allocations
  for each row execute function private.log_money();
create trigger expenses_money after insert or delete on public.expenses
  for each row execute function private.log_money();
create trigger expenses_money_update after update on public.expenses
  for each row when (old.amount_cents is distinct from new.amount_cents or old.payment_status is distinct from new.payment_status
                     or old.advanced_by is distinct from new.advanced_by or old.advanced_cm_id is distinct from new.advanced_cm_id
                     or old.absorbed_by is distinct from new.absorbed_by)
  execute function private.log_money();
create trigger assignments_money after insert or delete on public.assignments
  for each row execute function private.log_money();
create trigger assignments_money_update after update on public.assignments
  for each row when (old.fee_cents is distinct from new.fee_cents or old.cm_id is distinct from new.cm_id)
  execute function private.log_money();
create trigger coverages_money after insert or delete on public.coverages
  for each row execute function private.log_money();
create trigger coverages_money_update after update on public.coverages
  for each row when (old.agreed_cents is distinct from new.agreed_cents or old.event_status is distinct from new.event_status)
  execute function private.log_money();

-- ---------- Guardar con control de versión ----------

-- Aplica altas y cambios de una tabla. Las filas existentes se actualizan solo si
-- traen la versión vigente (o ninguna, por compatibilidad). Devuelve {id: versión nueva}.
create function private.apply_rows(tbl text, rows jsonb, cols text[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  set_list text := (select string_agg(format('%I = r.%I', c, c), ', ') from unnest(cols) c);
  col_list text := (select string_agg(format('%I', c), ', ') from unnest(cols) c);
  r_list   text := (select string_agg(format('r.%I', c), ', ') from unnest(cols) c);
  updated  bigint;
  existing bigint;
  versions jsonb;
begin
  if jsonb_array_length(rows) = 0 then return '{}'::jsonb; end if;

  execute format($q$
    with r as (select * from jsonb_populate_recordset(null::public.%1$I, $1)),
    upd as (
      update public.%1$I t set %2$s from r
      where t.id = r.id and (r.version is null or t.version = r.version)
      returning t.id)
    select (select count(*) from upd), (select count(*) from r join public.%1$I t on t.id = r.id)
  $q$, tbl, set_list) into updated, existing using rows;

  if updated < existing then
    raise exception 'Estos datos cambiaron mientras los editabas.' using errcode = '40001';
  end if;

  execute format($q$
    insert into public.%1$I (id, owner_id, %2$s)
    select r.id, auth.uid(), %3$s from jsonb_populate_recordset(null::public.%1$I, $1) r
    where not exists (select 1 from public.%1$I t where t.id = r.id)
  $q$, tbl, col_list, r_list) using rows;

  execute format($q$
    select coalesce(jsonb_object_agg(t.id, t.version), '{}'::jsonb)
    from public.%1$I t join jsonb_populate_recordset(null::public.%1$I, $1) r on r.id = t.id
  $q$, tbl) into versions using rows;
  return versions;
end;
$$;

revoke all on function private.apply_rows(text, jsonb, text[]) from public, anon;
grant execute on function private.apply_rows(text, jsonb, text[]) to authenticated;

-- Cambia de "no devuelve nada" a "devuelve las versiones nuevas", por eso se recrea.
drop function public.save_changes(jsonb);

create function public.save_changes(changes jsonb)
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
         array['coverage_id', 'label', 'kind', 'amount_cents', 'payment_status', 'advanced_by', 'advanced_cm_id', 'absorbed_by', 'position']))
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

-- ---------- Funciones que usaban los nombres viejos ----------

create or replace function public.my_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when private.is_coordinator() then 'coordinadora'
    when private.current_cm_id() is not null then 'cm'
  end;
$$;

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
      (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.assignment_id = a.id) as paid_cents
    from public.assignments a join me on a.cm_id = me.id join public.coverages c on c.id = a.coverage_id
    where c.event_status <> 'cancelado'
    union all
    select c.id, c.name, c.starts_at, 'expense', 'Reintegro: ' || e.label, e.amount_cents,
      (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.expense_id = e.id)
    from public.expenses e join me on e.advanced_cm_id = me.id join public.coverages c on c.id = e.coverage_id
    where e.advanced_by = 'cm' and c.event_status <> 'cancelado'
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'name', (select m.name from public.cms m join me on m.id = me.id),
    'dates', coalesce((select jsonb_agg(item order by starts_at) from dates), '[]'::jsonb),
    'concepts', coalesce((select jsonb_agg(jsonb_build_object(
        'coverage_id', coverage_id, 'coverage_name', coverage_name, 'starts_at', starts_at, 'kind', kind, 'label', label,
        'amount_cents', amount_cents, 'paid_cents', least(paid_cents, amount_cents)) order by starts_at desc, kind desc)
      from concepts), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.date,
        'amount_cents', (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.payment_id = p.id)
      ) order by p.date desc)
      from public.cm_payments p join me on p.cm_id = me.id), '[]'::jsonb)
  ) end;
$$;

create or replace function public.cm_set_confirmation(p_assignment uuid, p_value text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare me uuid := private.current_cm_id();
begin
  if me is null then raise exception 'Tu cuenta no está vinculada a una CM.' using errcode = '42501'; end if;
  if p_value not in ('confirmada', 'rechazada') then raise exception 'Respuesta inválida.' using errcode = '22023'; end if;
  update public.assignments a set confirmation = p_value
  from public.coverages c
  where a.id = p_assignment and a.cm_id = me and c.id = a.coverage_id and c.event_status = 'pendiente';
  if not found then raise exception 'Esa fecha ya no se puede cambiar.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.cm_set_checklist(p_item uuid, p_done boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare me uuid := private.current_cm_id();
begin
  if me is null then raise exception 'Tu cuenta no está vinculada a una CM.' using errcode = '42501'; end if;
  update public.checklist_items i set done = p_done
  where i.id = p_item and exists (
    select 1 from public.assignments a
    where a.coverage_id = i.coverage_id and a.cm_id = me and a.confirmation <> 'rechazada');
  if not found then raise exception 'No podés tildar ese contenido.' using errcode = 'P0002'; end if;
end;
$$;

-- ---------- Permisos ----------

do $$
declare f text;
begin
  foreach f in array array['public.my_role()', 'public.save_changes(jsonb)', 'public.cm_home()',
                           'public.cm_set_confirmation(uuid, text)', 'public.cm_set_checklist(uuid, boolean)',
                           'private.is_coordinator()', 'private.current_cm_id()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
