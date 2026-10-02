-- Notificaciones push.
-- Cada celular que activa los avisos guarda su suscripción. Los avisos se anotan en una
-- bandeja de salida (private.notification_outbox): los de fecha nueva, respuesta y pago
-- los anota la base sola con triggers; los recordatorios de 24 horas, el despachador.
-- El despachador (/api/push/dispatch) corre cada minuto y manda lo pendiente.

-- ---------- Suscripciones ----------

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "Cada cuenta ve sus suscripciones" on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Cada cuenta borra sus suscripciones" on public.push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Guarda la suscripción del celular para quien llama. Si ese celular estaba registrado
-- a otra cuenta (se cambió de usuario), pasa a la cuenta actual.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sesión vencida.' using errcode = '28000'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
end;
$$;

-- ---------- Bandeja de salida ----------

create table private.notification_outbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('reminder', 'assigned', 'answered', 'paid')),
  data       jsonb not null,
  dedupe     text unique,               -- evita mandar dos veces el mismo aviso
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0
);
create index on private.notification_outbox (created_at) where sent_at is null;
revoke all on private.notification_outbox from public, anon, authenticated;

-- La cuenta de una CM es la que tiene el email de su ficha.
create function private.cm_user_id(p_cm uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select u.id from public.cms c join auth.users u on lower(u.email) = lower(c.email)
  where c.id = p_cm and c.email <> '' limit 1;
$$;

create function private.local_now()
returns timestamp
language sql stable
set search_path = ''
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires'); $$;

create function private.coverage_info(p_coverage uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('coverage_id', c.id, 'coverage_name', c.name, 'starts_at', c.starts_at, 'salon', s.name)
  from public.coverages c join public.salons s on s.id = c.salon_id where c.id = p_coverage;
$$;

-- ---------- Avisos automáticos ----------

-- Fecha nueva: al asignar una CM (o cambiar la CM de una asignación) a una fiesta que todavía no pasó.
create function private.notify_assigned()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare target uuid := private.cm_user_id(new.cm_id);
begin
  if target is null or (tg_op = 'UPDATE' and new.cm_id = old.cm_id) then return null; end if;
  if not exists (select 1 from public.coverages c where c.id = new.coverage_id
                 and c.event_status = 'pendiente' and c.starts_at > private.local_now()) then return null; end if;
  insert into private.notification_outbox (user_id, kind, data, dedupe)
  values (target, 'assigned', private.coverage_info(new.coverage_id) || jsonb_build_object('fee_cents', new.fee_cents),
          'assigned:' || new.id || ':' || new.cm_id)
  on conflict (dedupe) do nothing;
  return null;
end;
$$;
create trigger assignments_notify_assigned after insert or update of cm_id on public.assignments
  for each row execute function private.notify_assigned();

-- Respuesta: cuando la CM (no Dafne) confirma o rechaza, se le avisa a Dafne.
create function private.notify_answered()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare coordinator uuid := (select c.owner_id from public.coverages c where c.id = new.coverage_id);
begin
  if new.confirmation = old.confirmation or new.confirmation = 'pendiente' or auth.uid() is null or auth.uid() = coordinator then
    return null;
  end if;
  insert into private.notification_outbox (user_id, kind, data)
  values (coordinator, 'answered', private.coverage_info(new.coverage_id) || jsonb_build_object(
    'cm_name', (select m.name from public.cms m where m.id = new.cm_id), 'confirmation', new.confirmation));
  return null;
end;
$$;
create trigger assignments_notify_answered after update of confirmation on public.assignments
  for each row execute function private.notify_answered();

-- Pago: al registrar un pago a una CM. Se dispara al confirmar la transacción,
-- cuando ya está guardado el reparto y se conoce el total.
create function private.notify_paid()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid := private.cm_user_id(new.cm_id);
  total bigint := (select coalesce(sum(a.amount_cents), 0) from public.payment_allocations a where a.payment_id = new.id);
begin
  if target is null or total <= 0 then return null; end if;
  insert into private.notification_outbox (user_id, kind, data, dedupe)
  values (target, 'paid', jsonb_build_object('amount_cents', total, 'date', new.date), 'paid:' || new.id)
  on conflict (dedupe) do nothing;
  return null;
end;
$$;
create constraint trigger cm_payments_notify_paid after insert on public.cm_payments
  deferrable initially deferred
  for each row execute function private.notify_paid();

-- ---------- Para el despachador (solo con la clave secreta del servidor) ----------

-- Recordatorio: fiestas pendientes que empiezan dentro de las próximas 24 horas,
-- para Dafne y para las CM asignadas que no rechazaron. Cada uno se anota una sola vez.
create function public.enqueue_due_reminders()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare added integer;
begin
  with due as (
    select c.id, c.owner_id from public.coverages c
    where c.event_status = 'pendiente'
      and c.starts_at > private.local_now()
      and c.starts_at <= private.local_now() + interval '24 hours'
  ),
  targets as (
    select d.id as coverage_id, d.owner_id as user_id from due d
    union
    select d.id, private.cm_user_id(a.cm_id) from due d
    join public.assignments a on a.coverage_id = d.id and a.confirmation <> 'rechazada'
  ),
  ins as (
    insert into private.notification_outbox (user_id, kind, data, dedupe)
    select t.user_id, 'reminder', private.coverage_info(t.coverage_id)
             || jsonb_build_object('for_coordinator', exists (select 1 from public.coordinators k where k.user_id = t.user_id)),
           'reminder:' || t.coverage_id || ':' || t.user_id
    from targets t where t.user_id is not null
    on conflict (dedupe) do nothing
    returning 1
  )
  select count(*) into added from ins;
  return added;
end;
$$;

-- Lo pendiente, con las suscripciones de cada destinatario. Los avisos viejos (más de
-- 2 días) o que fallaron 5 veces se descartan.
create function public.pending_notifications(p_limit integer default 100)
returns jsonb
language sql security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'kind', o.kind, 'data', o.data,
    'for_coordinator', exists (select 1 from public.coordinators k where k.user_id = o.user_id),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                              from public.push_subscriptions s where s.user_id = o.user_id), '[]'::jsonb)
  ) order by o.id), '[]'::jsonb)
  from (select * from private.notification_outbox
        where sent_at is null and attempts < 5 and created_at > now() - interval '2 days'
        order by id limit p_limit) o;
$$;

create function public.finish_notifications(p_sent bigint[], p_failed bigint[], p_gone_endpoints text[])
returns void
language sql security definer
set search_path = ''
as $$
  update private.notification_outbox set sent_at = now(), attempts = attempts + 1 where id = any(p_sent);
  update private.notification_outbox set attempts = attempts + 1 where id = any(p_failed);
  delete from public.push_subscriptions where endpoint = any(p_gone_endpoints);
$$;

-- ---------- Permisos ----------

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
do $$
declare f text;
begin
  foreach f in array array['public.enqueue_due_reminders()', 'public.pending_notifications(integer)',
                           'public.finish_notifications(bigint[], bigint[], text[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['private.cm_user_id(uuid)', 'private.local_now()', 'private.coverage_info(uuid)',
                           'private.notify_assigned()', 'private.notify_answered()', 'private.notify_paid()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
