-- Ubers de la CM: si borra el comprobante de un Uber que cargó ella, se borra el Uber.
-- Apenas Dafne le paga algo de ese Uber, la CM ya no puede cambiar ni borrar nada (solo ver);
-- Dafne puede siempre.

-- Quién cargó el gasto: los que carga la CM desde su fecha.
alter table public.expenses add column loaded_by_cm boolean not null default false;

-- ¿La CM todavía puede tocar este gasto? Es suyo y no tiene ningún pago.
create function private.cm_can_edit_expense(p_expense uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense and e.advanced_by = 'cm' and e.advanced_cm_id = private.current_cm_id()
      and not exists (select 1 from public.payment_allocations pa where pa.expense_id = e.id));
$$;
revoke all on function private.cm_can_edit_expense(uuid) from public, anon;
grant execute on function private.cm_can_edit_expense(uuid) to authenticated;

-- Subir, reemplazar o borrar archivos: la coordinadora siempre; la CM, mientras no esté pago.
-- Ver sigue igual (la CM ve los comprobantes de sus gastos aunque estén pagos).
create function private.can_write_receipt(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    else exists (select 1 from public.expenses e where e.id = split_part(object_name, '/', 1)::uuid
                 and private.is_coordinator() and e.owner_id = auth.uid())
      or private.cm_can_edit_expense(split_part(object_name, '/', 1)::uuid)
  end;
$$;
revoke all on function private.can_write_receipt(text) from public, anon;
grant execute on function private.can_write_receipt(text) to authenticated;

drop policy "Comprobantes: subir" on storage.objects;
drop policy "Comprobantes: reemplazar" on storage.objects;
drop policy "Comprobantes: borrar" on storage.objects;
create policy "Comprobantes: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and private.can_write_receipt(name));
create policy "Comprobantes: reemplazar" on storage.objects for update to authenticated
  using (bucket_id = 'comprobantes' and private.can_write_receipt(name))
  with check (bucket_id = 'comprobantes' and private.can_write_receipt(name));
create policy "Comprobantes: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'comprobantes' and private.can_write_receipt(name));

-- Vincular o quitar el comprobante. La CM: solo si no está pago, y no puede dejar sin
-- comprobante un Uber (para borrar el suyo está cm_delete_uber).
create or replace function public.set_expense_receipt(p_expense uuid, p_path text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_path is not null and split_part(p_path, '/', 1) <> p_expense::text then
    raise exception 'El archivo no corresponde a ese gasto.' using errcode = '22023';
  end if;
  if not private.can_write_receipt(p_expense::text || '/') then
    raise exception 'Ese Uber ya está pago: si hay que cambiar algo, avisale a Dafne.' using errcode = '42501';
  end if;
  if p_path is null and not private.is_coordinator() then
    raise exception 'No podés quitar el comprobante. Si hay un error, avisale a Dafne.' using errcode = '42501';
  end if;
  update public.expenses set receipt_path = p_path where id = p_expense;
  if p_path is not null and not private.is_coordinator() then
    perform private.notify_receipt(p_expense, false);
  end if;
end;
$$;

-- La CM borra un Uber que cargó ella y que todavía no está pago. El archivo queda suelto
-- y lo limpia el despachador. Si el aviso de "cargó un Uber" no había salido, se descarta;
-- si ya salió, Dafne recibe otro diciendo que lo borró.
create function public.cm_delete_uber(p_expense uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare info jsonb;
begin
  if not private.cm_can_edit_expense(p_expense)
     or not exists (select 1 from public.expenses e where e.id = p_expense and e.loaded_by_cm) then
    raise exception 'Ese Uber no lo podés borrar. Si hay un error, avisale a Dafne.' using errcode = '42501';
  end if;
  select private.coverage_info(e.coverage_id) || jsonb_build_object('cm_name', m.name, 'label', e.label,
           'amount_cents', e.amount_cents, 'removed', true)
    into info from public.expenses e join public.cms m on m.id = e.advanced_cm_id where e.id = p_expense;
  delete from private.notification_outbox o where o.dedupe = 'receipt:' || p_expense and o.sent_at is null;
  if not found then
    insert into private.notification_outbox (user_id, kind, data, dedupe)
    select e.owner_id, 'receipt', info, 'receipt-removed:' || e.id from public.expenses e where e.id = p_expense
    on conflict (dedupe) do nothing;
  end if;
  delete from public.expenses where id = p_expense;
end;
$$;
revoke all on function public.cm_delete_uber(uuid) from public, anon;
grant execute on function public.cm_delete_uber(uuid) to authenticated;

-- La carga desde la fecha de la CM queda marcada como suya.
create or replace function public.cm_add_uber(p_coverage uuid, p_direction text, p_amount_cents bigint,
  p_trip_from text default null, p_trip_to text default null,
  p_trip_started_at timestamp default null, p_trip_ended_at timestamp default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := private.current_cm_id();
  owner uuid;
  new_id uuid := gen_random_uuid();
begin
  if me is null then raise exception 'Tu cuenta no está habilitada.' using errcode = '42501'; end if;
  if p_direction not in ('ida', 'vuelta') then raise exception 'Elegí si es de ida o de vuelta.' using errcode = '22023'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'Revisá el monto.' using errcode = '22023';
  end if;
  select c.owner_id into owner from public.coverages c
  join public.assignments a on a.coverage_id = c.id and a.cm_id = me and a.confirmation <> 'rechazada'
  where c.id = p_coverage and c.event_status <> 'cancelado';
  if owner is null then raise exception 'No podés cargar gastos en esa fiesta.' using errcode = '42501'; end if;

  insert into public.expenses (id, owner_id, coverage_id, label, kind, amount_cents, advanced_by, advanced_cm_id, absorbed_by, position,
                               trip_from, trip_to, trip_started_at, trip_ended_at, loaded_by_cm)
  values (new_id, owner, p_coverage, 'Uber de ' || p_direction, 'uber', p_amount_cents, 'cm', me, 'coordinadora',
          coalesce((select max(e.position) + 1 from public.expenses e where e.coverage_id = p_coverage), 0),
          nullif(left(trim(coalesce(p_trip_from, '')), 200), ''), nullif(left(trim(coalesce(p_trip_to, '')), 200), ''),
          p_trip_started_at, p_trip_ended_at, true);
  perform private.notify_receipt(new_id, true);
  return new_id;
end;
$$;

-- La CM sabe cuáles Ubers cargó ella (puede borrarlos mientras no estén pagos).
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
      'drive_url', c.drive_url,
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
        'id', p.id, 'date', p.date,
        'amount_cents', (select coalesce(sum(pa.amount_cents), 0) from public.payment_allocations pa where pa.payment_id = p.id)
      ) order by p.date desc)
      from public.cm_payments p join me on p.cm_id = me.id), '[]'::jsonb)
  ) end;
$$;
