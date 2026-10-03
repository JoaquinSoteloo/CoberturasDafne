-- Recordatorio a la CM: si al día siguiente de la fiesta no cargó ningún Uber, un solo aviso
-- para que lo cargue con el comprobante. Entre las 10 y las 20 (hora argentina).

alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('reminder', 'assigned', 'answered', 'paid', 'unpaid', 'undelivered',
                  'changed', 'cancelled', 'removed', 'unanswered', 'moment', 'receipt', 'uber_missing'));

create function public.enqueue_uber_reminders()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare added integer;
begin
  if extract(hour from private.local_now()) not between 10 and 19 then return 0; end if;
  with due as (
    -- Fiestas que ya terminaron (fin cargado, o 6 horas después del inicio), hace menos de 3 días.
    select a.id as assignment_id, a.cm_id, c.id as coverage_id
    from public.assignments a join public.coverages c on c.id = a.coverage_id
    where a.confirmation = 'confirmada' and c.event_status <> 'cancelado'
      and coalesce(c.ends_at, c.starts_at + interval '6 hours') + interval '4 hours' <= private.local_now()
      and coalesce(c.ends_at, c.starts_at + interval '6 hours') > private.local_now() - interval '3 days'
      and not exists (select 1 from public.expenses e
                      where e.coverage_id = c.id and e.kind = 'uber' and e.advanced_cm_id = a.cm_id)
  ),
  ins as (
    insert into private.notification_outbox (user_id, kind, data, dedupe)
    select private.cm_user_id(d.cm_id), 'uber_missing', private.coverage_info(d.coverage_id),
           'uber_missing:' || d.assignment_id
    from due d where private.cm_user_id(d.cm_id) is not null
    on conflict (dedupe) do nothing
    returning 1
  )
  select count(*) into added from ins;
  return added;
end;
$$;
revoke all on function public.enqueue_uber_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_uber_reminders() to service_role;
