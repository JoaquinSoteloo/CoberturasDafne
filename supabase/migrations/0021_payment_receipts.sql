-- Comprobante de los pagos de Dafne a las CM (la captura de la transferencia). Lo sube Dafne
-- y la CM lo ve en "Pagos recibidos". Van al mismo lugar que los de gastos, en "pago-<id del pago>/".

alter table public.cm_payments add column receipt_path text;

-- Ver: la coordinadora, los suyos; una CM, los de sus gastos y los de sus pagos.
create or replace function private.can_touch_receipt(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
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

-- Subir, cambiar o borrar: los de pagos, solo la coordinadora.
create or replace function private.can_write_receipt(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^pago-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      private.is_coordinator() and exists (select 1 from public.cm_payments p
        where p.id = substr(split_part(object_name, '/', 1), 6)::uuid and p.owner_id = auth.uid())
    when split_part(object_name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    else exists (select 1 from public.expenses e where e.id = split_part(object_name, '/', 1)::uuid
                 and private.is_coordinator() and e.owner_id = auth.uid())
      or private.cm_can_edit_expense(split_part(object_name, '/', 1)::uuid)
  end;
$$;

-- Vincular o quitar el comprobante de un pago. Solo la coordinadora.
create function public.set_payment_receipt(p_payment uuid, p_path text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_path is not null and split_part(p_path, '/', 1) <> 'pago-' || p_payment::text then
    raise exception 'El archivo no corresponde a ese pago.' using errcode = '22023';
  end if;
  if not private.can_write_receipt('pago-' || p_payment::text || '/') then
    raise exception 'No podés cambiar el comprobante de ese pago.' using errcode = '42501';
  end if;
  update public.cm_payments set receipt_path = p_path where id = p_payment;
end;
$$;
revoke all on function public.set_payment_receipt(uuid, text) from public, anon;
grant execute on function public.set_payment_receipt(uuid, text) to authenticated;

-- La limpieza de archivos sueltos no tiene que borrar los comprobantes de pagos.
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
    order by o.created_at limit p_limit) x;
$$;

-- La CM ve el comprobante de cada pago que recibió.
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
      'drive_url', c.drive_url, 'live_posting', c.live_posting,
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
