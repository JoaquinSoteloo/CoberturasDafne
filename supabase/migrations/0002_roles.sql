-- Roles: una coordinadora (Dafne) y las CM.
-- La coordinadora usa las tablas directamente. Las CM nunca las tocan: ven y
-- cambian solo lo suyo a través de funciones que devuelven columnas elegidas
-- (sin acordado con el salón, sin honorarios ajenos, sin ganancias).
-- Una CM se reconoce porque el email con el que ingresa es el de su ficha.

-- ---------- Quién es quién ----------

create table public.coordinators (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.coordinators enable row level security;   -- sin políticas: solo lo leen las funciones

alter table public.cms add column email text not null default '';
create unique index cms_email_unique on public.cms (lower(email)) where email <> '';

create or replace function public.is_coordinator()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.coordinators where user_id = auth.uid());
$$;

create or replace function public.current_cm_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select c.id from public.cms c
  where c.email <> '' and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.my_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_coordinator() then 'coordinadora'
    when public.current_cm_id() is not null then 'cm'
  end;
$$;

-- ---------- Las tablas, solo para la coordinadora ----------

do $$
declare t text;
begin
  foreach t in array array['salons', 'cms', 'coverages', 'assignments', 'expenses', 'checklist_items', 'collections', 'cm_payments', 'payment_allocations'] loop
    execute format('drop policy if exists "Solo la dueña" on public.%I', t);
    execute format(
      'create policy "Solo la coordinadora" on public.%I for all to authenticated
         using ((select auth.uid()) = owner_id and (select public.is_coordinator()))
         with check ((select auth.uid()) = owner_id and (select public.is_coordinator()))', t);
  end loop;
end $$;

-- save_changes ahora también guarda el email de la CM.
create or replace function public.save_changes(changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  up  jsonb := coalesce(changes -> 'upsert', '{}'::jsonb);
  del jsonb := coalesce(changes -> 'delete', '{}'::jsonb);
  me  uuid := auth.uid();
  payment jsonb;
begin
  if me is null or not public.is_coordinator() then
    raise exception 'Solo la coordinadora puede guardar cambios.' using errcode = '42501';
  end if;

  delete from public.cm_payments     where id in (select jsonb_array_elements_text(coalesce(del -> 'cm_payments', '[]'))::uuid);
  delete from public.collections     where id in (select jsonb_array_elements_text(coalesce(del -> 'collections', '[]'))::uuid);
  delete from public.checklist_items where id in (select jsonb_array_elements_text(coalesce(del -> 'checklist_items', '[]'))::uuid);
  delete from public.expenses        where id in (select jsonb_array_elements_text(coalesce(del -> 'expenses', '[]'))::uuid);
  delete from public.assignments     where id in (select jsonb_array_elements_text(coalesce(del -> 'assignments', '[]'))::uuid);
  delete from public.coverages       where id in (select jsonb_array_elements_text(coalesce(del -> 'coverages', '[]'))::uuid);
  delete from public.cms             where id in (select jsonb_array_elements_text(coalesce(del -> 'cms', '[]'))::uuid);
  delete from public.salons          where id in (select jsonb_array_elements_text(coalesce(del -> 'salons', '[]'))::uuid);

  insert into public.salons (id, owner_id, name, address)
  select r.id, me, r.name, r.address
  from jsonb_populate_recordset(null::public.salons, coalesce(up -> 'salons', '[]')) r
  on conflict (id) do update set name = excluded.name, address = excluded.address;

  insert into public.cms (id, owner_id, name, phone, usual_fee_cents, notes, email)
  select r.id, me, r.name, r.phone, r.usual_fee_cents, r.notes, lower(trim(coalesce(r.email, '')))
  from jsonb_populate_recordset(null::public.cms, coalesce(up -> 'cms', '[]')) r
  on conflict (id) do update set name = excluded.name, phone = excluded.phone,
    usual_fee_cents = excluded.usual_fee_cents, notes = excluded.notes, email = excluded.email;

  insert into public.coverages (id, owner_id, name, party_type, client, salon_id, address, starts_at, ends_at, notes,
    agreed_cents, drive_url, delivered_pieces, delivery_notes, event_status, delivery_status)
  select r.id, me, r.name, r.party_type, r.client, r.salon_id, r.address, r.starts_at, r.ends_at, r.notes,
    r.agreed_cents, r.drive_url, r.delivered_pieces, r.delivery_notes, r.event_status, r.delivery_status
  from jsonb_populate_recordset(null::public.coverages, coalesce(up -> 'coverages', '[]')) r
  on conflict (id) do update set name = excluded.name, party_type = excluded.party_type, client = excluded.client,
    salon_id = excluded.salon_id, address = excluded.address, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    notes = excluded.notes, agreed_cents = excluded.agreed_cents, drive_url = excluded.drive_url,
    delivered_pieces = excluded.delivered_pieces, delivery_notes = excluded.delivery_notes,
    event_status = excluded.event_status, delivery_status = excluded.delivery_status;

  insert into public.assignments (id, owner_id, coverage_id, cm_id, fee_cents, confirmation, position)
  select r.id, me, r.coverage_id, r.cm_id, r.fee_cents, r.confirmation, r.position
  from jsonb_populate_recordset(null::public.assignments, coalesce(up -> 'assignments', '[]')) r
  on conflict (id) do update set coverage_id = excluded.coverage_id, cm_id = excluded.cm_id, fee_cents = excluded.fee_cents,
    confirmation = excluded.confirmation, position = excluded.position;

  insert into public.expenses (id, owner_id, coverage_id, label, kind, amount_cents, payment_status, advanced_by, advanced_cm_id, absorbed_by, position)
  select r.id, me, r.coverage_id, r.label, r.kind, r.amount_cents, r.payment_status, r.advanced_by, r.advanced_cm_id, r.absorbed_by, r.position
  from jsonb_populate_recordset(null::public.expenses, coalesce(up -> 'expenses', '[]')) r
  on conflict (id) do update set coverage_id = excluded.coverage_id, label = excluded.label, kind = excluded.kind,
    amount_cents = excluded.amount_cents, payment_status = excluded.payment_status, advanced_by = excluded.advanced_by,
    advanced_cm_id = excluded.advanced_cm_id, absorbed_by = excluded.absorbed_by, position = excluded.position;

  insert into public.checklist_items (id, owner_id, coverage_id, text, done, position)
  select r.id, me, r.coverage_id, r.text, r.done, r.position
  from jsonb_populate_recordset(null::public.checklist_items, coalesce(up -> 'checklist_items', '[]')) r
  on conflict (id) do update set coverage_id = excluded.coverage_id, text = excluded.text, done = excluded.done, position = excluded.position;

  insert into public.collections (id, owner_id, coverage_id, date, amount_cents, notes)
  select r.id, me, r.coverage_id, r.date, r.amount_cents, r.notes
  from jsonb_populate_recordset(null::public.collections, coalesce(up -> 'collections', '[]')) r
  on conflict (id) do update set coverage_id = excluded.coverage_id, date = excluded.date,
    amount_cents = excluded.amount_cents, notes = excluded.notes;

  for payment in select * from jsonb_array_elements(coalesce(up -> 'cm_payments', '[]')) loop
    insert into public.cm_payments (id, owner_id, cm_id, date, notes)
    values ((payment ->> 'id')::uuid, me, (payment ->> 'cm_id')::uuid, (payment ->> 'date')::date, coalesce(payment ->> 'notes', ''))
    on conflict (id) do update set cm_id = excluded.cm_id, date = excluded.date, notes = excluded.notes;

    delete from public.payment_allocations where payment_id = (payment ->> 'id')::uuid;
    insert into public.payment_allocations (payment_id, position, owner_id, assignment_id, expense_id, amount_cents)
    select (payment ->> 'id')::uuid, a.position, me, a.assignment_id, a.expense_id, a.amount_cents
    from jsonb_to_recordset(coalesce(payment -> 'allocations', '[]'))
      as a(position integer, assignment_id uuid, expense_id uuid, amount_cents bigint);
  end loop;
end;
$$;

-- ---------- Lo que ve una CM ----------

-- Todo en una llamada: su nombre, sus fechas (con contenido y compañeras) y sus pagos.
create or replace function public.cm_home()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select public.current_cm_id() as id),
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

-- Confirmar o rechazar una fecha propia, mientras la fiesta no se haya hecho ni cancelado.
create or replace function public.cm_set_confirmation(p_assignment uuid, p_value text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare me uuid := public.current_cm_id();
begin
  if me is null then raise exception 'Tu cuenta no está vinculada a una CM.' using errcode = '42501'; end if;
  if p_value not in ('confirmada', 'rechazada') then raise exception 'Respuesta inválida.' using errcode = '22023'; end if;
  update public.assignments a set confirmation = p_value
  from public.coverages c
  where a.id = p_assignment and a.cm_id = me and c.id = a.coverage_id and c.event_status = 'pendiente';
  if not found then raise exception 'Esa fecha ya no se puede cambiar.' using errcode = 'P0002'; end if;
end;
$$;

-- Tildar contenido de una fiesta propia (si no la rechazó).
create or replace function public.cm_set_checklist(p_item uuid, p_done boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare me uuid := public.current_cm_id();
begin
  if me is null then raise exception 'Tu cuenta no está vinculada a una CM.' using errcode = '42501'; end if;
  update public.checklist_items i set done = p_done
  where i.id = p_item and exists (
    select 1 from public.assignments a
    where a.coverage_id = i.coverage_id and a.cm_id = me and a.confirmation <> 'rechazada');
  if not found then raise exception 'No podés tildar ese contenido.' using errcode = 'P0002'; end if;
end;
$$;

-- ---------- Permisos de las funciones ----------

do $$
declare f text;
begin
  foreach f in array array['is_coordinator()', 'current_cm_id()', 'my_role()', 'save_changes(jsonb)', 'cm_home()',
                           'cm_set_confirmation(uuid, text)', 'cm_set_checklist(uuid, boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
