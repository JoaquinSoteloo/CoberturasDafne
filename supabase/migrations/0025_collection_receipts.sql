-- Comprobante de los cobros a los salones (la transferencia que recibió Dafne).
-- Van en "cobro-<id del cobro>/". Solo la coordinadora los ve y los toca.

alter table public.collections add column receipt_path text;

create or replace function private.can_touch_receipt(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
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

create function public.set_collection_receipt(p_collection uuid, p_path text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_path is not null and split_part(p_path, '/', 1) <> 'cobro-' || p_collection::text then
    raise exception 'El archivo no corresponde a ese cobro.' using errcode = '22023';
  end if;
  if not private.can_write_receipt('cobro-' || p_collection::text || '/') then
    raise exception 'No podés cambiar el comprobante de ese cobro.' using errcode = '42501';
  end if;
  update public.collections set receipt_path = p_path where id = p_collection;
end;
$$;
revoke all on function public.set_collection_receipt(uuid, text) from public, anon;
grant execute on function public.set_collection_receipt(uuid, text) to authenticated;

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
    order by o.created_at limit p_limit) x;
$$;
