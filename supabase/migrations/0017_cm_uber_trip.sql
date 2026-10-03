-- La CM carga el Uber con lo que leyó la IA del comprobante: además del monto, desde dónde,
-- hasta dónde y los horarios. Los datos nuevos son opcionales (la carga a mano sigue igual).
drop function public.cm_add_uber(uuid, text, bigint);
create function public.cm_add_uber(p_coverage uuid, p_direction text, p_amount_cents bigint,
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
                               trip_from, trip_to, trip_started_at, trip_ended_at)
  values (new_id, owner, p_coverage, 'Uber de ' || p_direction, 'uber', p_amount_cents, 'cm', me, 'coordinadora',
          coalesce((select max(e.position) + 1 from public.expenses e where e.coverage_id = p_coverage), 0),
          nullif(left(trim(coalesce(p_trip_from, '')), 200), ''), nullif(left(trim(coalesce(p_trip_to, '')), 200), ''),
          p_trip_started_at, p_trip_ended_at);
  perform private.notify_receipt(new_id, true);
  return new_id;
end;
$$;
revoke all on function public.cm_add_uber(uuid, text, bigint, text, text, timestamp, timestamp) from public, anon;
grant execute on function public.cm_add_uber(uuid, text, bigint, text, text, timestamp, timestamp) to authenticated;
