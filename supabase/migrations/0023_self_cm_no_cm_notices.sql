-- Dafne puede tener su propia ficha de CM (con su email) para las fiestas que cubre ella.
-- Los avisos "de CM" (fecha nueva, cambios, ¿tomaste Uber?, etc.) no son para ella: los suyos
-- le llegan como coordinadora. La cuenta de una CM que es la coordinadora no recibe avisos de CM.
create or replace function private.cm_user_id(p_cm uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select u.id from public.cms c join auth.users u on lower(u.email) = lower(c.email)
  where c.id = p_cm and c.email <> ''
    and not exists (select 1 from public.coordinators k where k.user_id = u.id)
  limit 1;
$$;
