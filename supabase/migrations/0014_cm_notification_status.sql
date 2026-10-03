-- Para la coordinadora: qué CM pueden recibir avisos. Sin cuenta no entra a la app;
-- con cuenta pero sin celulares suscriptos, no le llega ningún aviso.
create function public.cm_notification_status()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'cm_id', m.id,
    'has_account', u.id is not null,
    'devices', (select count(*) from public.push_subscriptions s where s.user_id = u.id),
    'last_enabled_at', (select max(s.created_at) from public.push_subscriptions s where s.user_id = u.id)
  )), '[]'::jsonb)
  from public.cms m
  left join lateral (select x.id from auth.users x where m.email <> '' and lower(x.email) = lower(m.email) limit 1) u on true
  where private.is_coordinator() and m.owner_id = auth.uid();
$$;
revoke all on function public.cm_notification_status() from public, anon;
grant execute on function public.cm_notification_status() to authenticated;
