-- Esquema de Dafne · Coberturas.
-- Cada fila pertenece a una cuenta (owner_id) y las políticas de seguridad hacen
-- que cada cuenta vea y modifique solo lo suyo. Los importes van en centavos.
-- Lo que tiene plata asociada no se puede borrar: las claves foráneas lo impiden.

-- ---------- Tablas ----------

create table public.salons (
  id       uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name     text not null check (length(trim(name)) > 0),
  address  text not null default ''
);

create table public.cms (
  id              uuid primary key,
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  phone           text not null default '',
  usual_fee_cents bigint not null default 0 check (usual_fee_cents >= 0),
  notes           text not null default ''
);

create table public.coverages (
  id               uuid primary key,
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  party_type       text not null default '',
  client           text not null default '',
  salon_id         uuid not null references public.salons (id) on delete restrict,
  address          text not null default '',
  starts_at        timestamp not null,          -- hora local del evento, sin zona horaria
  ends_at          timestamp,
  notes            text not null default '',
  agreed_cents     bigint not null default 0 check (agreed_cents >= 0),
  drive_url        text not null default '',
  delivered_pieces integer not null default 0 check (delivered_pieces >= 0),
  delivery_notes   text not null default '',
  event_status     text not null default 'pendiente' check (event_status in ('pendiente', 'realizado', 'cancelado')),
  delivery_status  text not null default 'pendiente' check (delivery_status in ('pendiente', 'entregada'))
);

create table public.assignments (
  id           uuid primary key,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  coverage_id  uuid not null references public.coverages (id) on delete cascade,
  cm_id        uuid not null references public.cms (id) on delete restrict,
  fee_cents    bigint not null default 0 check (fee_cents >= 0),
  confirmation text not null default 'pendiente' check (confirmation in ('pendiente', 'confirmada', 'rechazada')),
  position     integer not null default 0,
  -- Se controla al final del guardado, así se pueden intercambiar CM entre asignaciones.
  unique (coverage_id, cm_id) deferrable initially deferred
);

create table public.expenses (
  id             uuid primary key,
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  coverage_id    uuid not null references public.coverages (id) on delete cascade,
  label          text not null,
  kind           text not null check (kind in ('uber', 'otro')),
  amount_cents   bigint not null check (amount_cents > 0),
  payment_status text check (payment_status in ('pendiente', 'pagado')),
  advanced_by    text check (advanced_by in ('coordinadora', 'cm')),
  advanced_cm_id uuid references public.cms (id) on delete restrict,
  absorbed_by    text not null check (absorbed_by in ('coordinadora', 'salon')),
  position       integer not null default 0,
  check (advanced_by is distinct from 'cm' or advanced_cm_id is not null)
);

create table public.checklist_items (
  id          uuid primary key,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  coverage_id uuid not null references public.coverages (id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  position    integer not null default 0
);

-- Cobros del salón.
create table public.collections (
  id           uuid primary key,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  coverage_id  uuid not null references public.coverages (id) on delete restrict,
  date         date not null,
  amount_cents bigint not null check (amount_cents > 0),
  notes        text not null default ''
);

-- Pagos a una CM. Cada pago se reparte entre honorarios y reintegros (allocations).
create table public.cm_payments (
  id       uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cm_id    uuid not null references public.cms (id) on delete restrict,
  date     date not null,
  notes    text not null default ''
);

create table public.payment_allocations (
  payment_id    uuid not null references public.cm_payments (id) on delete cascade,
  position      integer not null,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Exactamente uno de los dos: un honorario o un reintegro de gasto.
  assignment_id uuid references public.assignments (id) on delete restrict,
  expense_id    uuid references public.expenses (id) on delete restrict,
  amount_cents  bigint not null check (amount_cents > 0),
  primary key (payment_id, position),
  check ((assignment_id is null) <> (expense_id is null))
);

-- ---------- Índices para las claves foráneas ----------

create index on public.salons (owner_id);
create index on public.cms (owner_id);
create index on public.coverages (owner_id);
create index on public.coverages (salon_id);
create index on public.assignments (owner_id);
create index on public.assignments (coverage_id);
create index on public.assignments (cm_id);
create index on public.expenses (owner_id);
create index on public.expenses (coverage_id);
create index on public.expenses (advanced_cm_id);
create index on public.checklist_items (owner_id);
create index on public.checklist_items (coverage_id);
create index on public.collections (owner_id);
create index on public.collections (coverage_id);
create index on public.cm_payments (owner_id);
create index on public.cm_payments (cm_id);
create index on public.payment_allocations (owner_id);
create index on public.payment_allocations (assignment_id);
create index on public.payment_allocations (expense_id);

-- ---------- Seguridad: cada cuenta solo ve lo suyo ----------

do $$
declare t text;
begin
  foreach t in array array['salons', 'cms', 'coverages', 'assignments', 'expenses', 'checklist_items', 'collections', 'cm_payments', 'payment_allocations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Solo la dueña" on public.%I for all to authenticated
         using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)', t);
  end loop;
end $$;

-- ---------- Guardar cambios de una sola vez ----------
-- La app manda solo lo que cambió: filas nuevas o modificadas (upsert) e ids borrados
-- (delete), por tabla. Se aplica todo o nada. Corre con los permisos de quien llama,
-- así que las políticas de seguridad siguen valiendo.
--
-- changes = {
--   "upsert": { "salons": [...], "cms": [...], ..., "cm_payments": [{..., "allocations": [...]}] },
--   "delete": { "assignments": ["uuid", ...], ... }
-- }

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
  if me is null then
    raise exception 'Sesión vencida: volvé a ingresar.' using errcode = '28000';
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
  insert into public.salons (id, owner_id, name, address)
  select r.id, me, r.name, r.address
  from jsonb_populate_recordset(null::public.salons, coalesce(up -> 'salons', '[]')) r
  on conflict (id) do update set name = excluded.name, address = excluded.address;

  insert into public.cms (id, owner_id, name, phone, usual_fee_cents, notes)
  select r.id, me, r.name, r.phone, r.usual_fee_cents, r.notes
  from jsonb_populate_recordset(null::public.cms, coalesce(up -> 'cms', '[]')) r
  on conflict (id) do update set name = excluded.name, phone = excluded.phone,
    usual_fee_cents = excluded.usual_fee_cents, notes = excluded.notes;

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

  -- Un pago y su reparto se guardan juntos: se reemplaza el reparto completo.
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

grant execute on function public.save_changes(jsonb) to authenticated;
revoke execute on function public.save_changes(jsonb) from anon, public;
