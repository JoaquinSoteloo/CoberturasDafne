-- Atajo de iPhone: compartir un comprobante desde Mercado Pago, el banco o WhatsApp sin abrir la app.
-- Cada cuenta tiene un link privado (como el del calendario). El servidor lee el comprobante con IA y,
-- si no hay dudas, lo registra en nombre de quien es el link; si las hay, lo deja "para revisar".

create table private.intake_tokens (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
revoke all on private.intake_tokens from public, anon, authenticated;

-- El link de quien llama (lo crea la primera vez). p_new = true lo cambia (el anterior deja de andar).
create function public.my_intake_token(p_new boolean default false)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare result uuid;
begin
  if public.my_role() is null then raise exception 'Tu cuenta no está habilitada.' using errcode = '42501'; end if;
  if p_new then delete from private.intake_tokens where user_id = auth.uid(); end if;
  insert into private.intake_tokens (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select token into result from private.intake_tokens where user_id = auth.uid();
  return result;
end;
$$;
revoke all on function public.my_intake_token(boolean) from public, anon;
grant execute on function public.my_intake_token(boolean) to authenticated;

-- De quién es un link: la coordinadora o una CM. Solo el servidor.
create function public.intake_identity(p_token uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', t.user_id, 'email', u.email,
    'coordinator', exists (select 1 from public.coordinators k where k.user_id = t.user_id),
    'cm_id', (select m.id from public.cms m where m.email <> '' and lower(m.email) = lower(u.email) limit 1))
  from private.intake_tokens t join auth.users u on u.id = t.user_id
  where t.token = p_token;
$$;

-- Actuar como quien es el link, dentro de esta transacción: auth.uid() y auth.jwt() pasan a ser los suyos.
create function private.act_as(p_token uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare uid uuid; mail text;
begin
  select t.user_id, u.email into uid, mail from private.intake_tokens t join auth.users u on u.id = t.user_id where t.token = p_token;
  if uid is null then raise exception 'Link inválido.' using errcode = '42501'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'email', mail, 'role', 'authenticated')::text, true);
  return uid;
end;
$$;
revoke all on function private.act_as(uuid) from public, anon, authenticated;

-- Guardar un cobro o un pago de la coordinadora, con las mismas reglas que la app (save_changes).
create function public.intake_save(p_token uuid, p_changes jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.act_as(p_token);
  return public.save_changes(p_changes);
end;
$$;

-- Fechas de la CM del link (lo mismo que ve en la app).
create function public.intake_cm_home(p_token uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare cm uuid;
begin
  perform private.act_as(p_token);
  cm := private.current_cm_id();
  if cm is null then raise exception 'Tu cuenta no está habilitada.' using errcode = '42501'; end if;
  return private.cm_home_for(cm);
end;
$$;

-- Cargar el Uber de la CM del link (lo mismo que "Cargar un Uber" en la app: le avisa a Dafne).
create function public.intake_cm_uber(p_token uuid, p_coverage uuid, p_direction text, p_amount_cents bigint,
  p_trip_from text, p_trip_to text, p_trip_started_at timestamp, p_trip_ended_at timestamp)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.act_as(p_token);
  return public.cm_add_uber(p_coverage, p_direction, p_amount_cents, p_trip_from, p_trip_to, p_trip_started_at, p_trip_ended_at);
end;
$$;

revoke all on function public.intake_identity(uuid) from public, anon, authenticated;
revoke all on function public.intake_save(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.intake_cm_home(uuid) from public, anon, authenticated;
revoke all on function public.intake_cm_uber(uuid, uuid, text, bigint, text, text, timestamp, timestamp) from public, anon, authenticated;
grant execute on function public.intake_identity(uuid) to service_role;
grant execute on function public.intake_save(uuid, jsonb) to service_role;
grant execute on function public.intake_cm_home(uuid) to service_role;
grant execute on function public.intake_cm_uber(uuid, uuid, text, bigint, text, text, timestamp, timestamp) to service_role;

-- Comprobantes que llegaron por el Atajo y no se pudieron registrar solos: Dafne los revisa desde "A resolver".
create table public.pending_receipts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  path       text not null,
  data       jsonb not null,
  reason     text not null default '',
  created_at timestamptz not null default now()
);
alter table public.pending_receipts enable row level security;
create policy "Para revisar: ver" on public.pending_receipts for select to authenticated using (owner_id = auth.uid());
create policy "Para revisar: descartar" on public.pending_receipts for delete to authenticated using (owner_id = auth.uid());
grant select, delete on public.pending_receipts to authenticated;

-- El archivo de un comprobante para revisar vive en "entrada-<id>/": lo ve y lo borra su dueña.
create or replace function private.can_touch_receipt(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^entrada-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      exists (select 1 from public.pending_receipts r where r.id = substr(split_part(object_name, '/', 1), 9)::uuid and r.owner_id = auth.uid())
    when split_part(object_name, '/', 1) ~ '^cobro-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      private.is_coordinator() and exists (select 1 from public.collections co
        where co.id = substr(split_part(object_name, '/', 1), 7)::uuid and co.owner_id = auth.uid())
    when split_part(object_name, '/', 1) ~ '^pago-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
      select 1 from public.cm_payments p
      where p.id = substr(split_part(object_name, '/', 1), 6)::uuid
        and ((private.is_coordinator() and p.owner_id = auth.uid()) or p.cm_id = private.current_cm_id()))
    when split_part(object_name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    else exists (
      select 1 from public.expenses e
      where e.id = split_part(object_name, '/', 1)::uuid
        and ((private.is_coordinator() and e.owner_id = auth.uid())
             or (e.advanced_by = 'cm' and e.advanced_cm_id = private.current_cm_id())))
  end;
$$;

create or replace function private.can_write_receipt(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^entrada-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      exists (select 1 from public.pending_receipts r where r.id = substr(split_part(object_name, '/', 1), 9)::uuid and r.owner_id = auth.uid())
    when split_part(object_name, '/', 1) ~ '^cobro-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      private.is_coordinator() and exists (select 1 from public.collections co
        where co.id = substr(split_part(object_name, '/', 1), 7)::uuid and co.owner_id = auth.uid())
    when split_part(object_name, '/', 1) ~ '^pago-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      private.is_coordinator() and exists (select 1 from public.cm_payments p
        where p.id = substr(split_part(object_name, '/', 1), 6)::uuid and p.owner_id = auth.uid())
    when split_part(object_name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    else exists (select 1 from public.expenses e where e.id = split_part(object_name, '/', 1)::uuid
                 and private.is_coordinator() and e.owner_id = auth.uid())
      or private.cm_can_edit_expense(split_part(object_name, '/', 1)::uuid)
  end;
$$;

-- La limpieza de archivos sueltos no toca los que esperan revisión.
create or replace function public.orphan_receipts(p_limit integer default 100)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.name), '{}') from (
    select o.name from storage.objects o
    where o.bucket_id = 'comprobantes' and o.created_at < now() - interval '1 hour'
      and not exists (select 1 from public.expenses e where e.receipt_path = o.name)
      and not exists (select 1 from public.cm_payments p where p.receipt_path = o.name)
      and not exists (select 1 from public.collections co where co.receipt_path = o.name)
      and not exists (select 1 from public.pending_receipts r where r.path = o.name)
    order by o.created_at limit p_limit) x;
$$;
