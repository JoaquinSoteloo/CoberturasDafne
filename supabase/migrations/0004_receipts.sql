-- Comprobantes de gastos (Ubers y otros): una foto o PDF por gasto.
-- Los archivos van a una carpeta privada del almacenamiento, en "<id del gasto>/<archivo>".
-- Los sube la coordinadora o la CM que adelantó ese gasto, y nadie más los puede ver.

alter table public.expenses add column receipt_path text;

-- El comprobante se guarda aparte de los datos del gasto (no pasa por save_changes),
-- así que cambiarlo no sube la versión: no choca con una edición de Dafne en curso.
create or replace function private.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if (to_jsonb(new) - array['receipt_path', 'updated_at', 'version']) = (to_jsonb(old) - array['receipt_path', 'updated_at', 'version']) then
    new.version := old.version;
  else
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

-- ---------- Carpeta privada ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

-- ¿Quien pide puede tocar este archivo? La coordinadora, los de sus gastos;
-- una CM, los de gastos que adelantó ella.
create function private.can_touch_receipt(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    else exists (
      select 1 from public.expenses e
      where e.id = split_part(object_name, '/', 1)::uuid
        and ((private.is_coordinator() and e.owner_id = auth.uid())
             or (e.advanced_by = 'cm' and e.advanced_cm_id = private.current_cm_id())))
  end;
$$;
revoke all on function private.can_touch_receipt(text) from public, anon;
grant execute on function private.can_touch_receipt(text) to authenticated;

create policy "Comprobantes: ver" on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and private.can_touch_receipt(name));
create policy "Comprobantes: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and private.can_touch_receipt(name));
create policy "Comprobantes: reemplazar" on storage.objects for update to authenticated
  using (bucket_id = 'comprobantes' and private.can_touch_receipt(name))
  with check (bucket_id = 'comprobantes' and private.can_touch_receipt(name));
create policy "Comprobantes: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'comprobantes' and private.can_touch_receipt(name));

-- ---------- Vincular el archivo al gasto ----------

-- p_path null quita el comprobante. El archivo tiene que estar en la carpeta de ese gasto.
create function public.set_expense_receipt(p_expense uuid, p_path text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_path is not null and split_part(p_path, '/', 1) <> p_expense::text then
    raise exception 'El archivo no corresponde a ese gasto.' using errcode = '22023';
  end if;
  if not private.can_touch_receipt(p_expense::text || '/') then
    raise exception 'No podés cambiar el comprobante de ese gasto.' using errcode = '42501';
  end if;
  update public.expenses set receipt_path = p_path where id = p_expense;
end;
$$;
revoke all on function public.set_expense_receipt(uuid, text) from public, anon;
grant execute on function public.set_expense_receipt(uuid, text) to authenticated;

-- ---------- La CM ve sus reintegros con su comprobante ----------

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
      null::uuid as expense_id, null::text as receipt_path
    from public.assignments a join me on a.cm_id = me.id join public.coverages c on c.id = a.coverage_id
    where c.event_status <> 'cancelado'
    union all
    select c.id, c.name, c.starts_at, 'expense', 'Reintegro: ' || e.label, e.amount_cents,
      (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.expense_id = e.id),
      e.id, e.receipt_path
    from public.expenses e join me on e.advanced_cm_id = me.id join public.coverages c on c.id = e.coverage_id
    where e.advanced_by = 'cm' and c.event_status <> 'cancelado'
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'name', (select m.name from public.cms m join me on m.id = me.id),
    'dates', coalesce((select jsonb_agg(item order by starts_at) from dates), '[]'::jsonb),
    'concepts', coalesce((select jsonb_agg(jsonb_build_object(
        'coverage_id', coverage_id, 'coverage_name', coverage_name, 'starts_at', starts_at, 'kind', kind, 'label', label,
        'amount_cents', amount_cents, 'paid_cents', least(paid_cents, amount_cents),
        'expense_id', expense_id, 'receipt_path', receipt_path) order by starts_at desc, kind desc)
      from concepts), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.date,
        'amount_cents', (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.payment_id = p.id)
      ) order by p.date desc)
      from public.cm_payments p join me on p.cm_id = me.id), '[]'::jsonb)
  ) end;
$$;
