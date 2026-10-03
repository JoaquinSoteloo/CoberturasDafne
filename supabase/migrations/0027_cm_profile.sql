-- "Mi perfil" de la CM: foto, teléfono y alias (o CBU/CVU). El nombre y el email los maneja Dafne.

alter table public.cms add column photo_path text;

-- Fotos de perfil: se ven sin iniciar sesión (como cualquier foto de perfil) con un nombre de
-- archivo al azar. Cada CM sube solo en su carpeta ("cm-<id>/"); la coordinadora, en cualquiera.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perfiles', 'perfiles', true, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function private.can_write_photo(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select split_part(object_name, '/', 1) = 'cm-' || coalesce(private.current_cm_id()::text, '-')
      or (private.is_coordinator() and exists (select 1 from public.cms m
            where 'cm-' || m.id::text = split_part(object_name, '/', 1) and m.owner_id = auth.uid()));
$$;
revoke all on function private.can_write_photo(text) from public, anon;
grant execute on function private.can_write_photo(text) to authenticated;

create policy "Perfiles: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'perfiles' and private.can_write_photo(name));
create policy "Perfiles: reemplazar" on storage.objects for update to authenticated
  using (bucket_id = 'perfiles' and private.can_write_photo(name))
  with check (bucket_id = 'perfiles' and private.can_write_photo(name));
create policy "Perfiles: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'perfiles' and private.can_write_photo(name));

-- La CM actualiza sus datos. null = no cambiar ese dato; '' en la foto = sacarla.
create function public.cm_update_profile(p_phone text default null, p_alias text default null, p_photo_path text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare me uuid := private.current_cm_id();
begin
  if me is null then raise exception 'Tu cuenta no está vinculada a una CM.' using errcode = '42501'; end if;
  if p_photo_path is not null and p_photo_path <> '' and split_part(p_photo_path, '/', 1) <> 'cm-' || me::text then
    raise exception 'La foto no corresponde a tu perfil.' using errcode = '22023';
  end if;
  update public.cms set
    phone = coalesce(left(trim(p_phone), 40), phone),
    alias = coalesce(left(trim(p_alias), 60), alias),
    photo_path = case when p_photo_path is null then photo_path when p_photo_path = '' then null else p_photo_path end
  where id = me;
end;
$$;
revoke all on function public.cm_update_profile(text, text, text) from public, anon;
grant execute on function public.cm_update_profile(text, text, text) to authenticated;

-- La CM recibe sus datos de perfil.
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
    'profile', (select jsonb_build_object('name', m.name, 'email', m.email, 'phone', m.phone, 'alias', coalesce(m.alias, ''), 'photo_path', m.photo_path)
                from public.cms m join me on m.id = me.id),
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

-- El id de la CM que inició sesión (para subir la foto en su carpeta).
create function public.my_cm_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$ select private.current_cm_id(); $$;
revoke all on function public.my_cm_id() from public, anon;
grant execute on function public.my_cm_id() to authenticated;
