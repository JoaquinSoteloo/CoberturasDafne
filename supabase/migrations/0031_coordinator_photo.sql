-- Foto de perfil de Dafne (las CM la tienen en su ficha; Dafne no tiene ficha de CM).
-- Vive en el mismo depósito público de fotos, en "coord-<su usuario>/".

alter table public.coordinators add column photo_path text;

create or replace function private.can_write_photo(object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select split_part(object_name, '/', 1) = 'cm-' || coalesce(private.current_cm_id()::text, '-')
      or (private.is_coordinator() and exists (select 1 from public.cms m
            where 'cm-' || m.id::text = split_part(object_name, '/', 1) and m.owner_id = auth.uid()))
      or (private.is_coordinator() and split_part(object_name, '/', 1) = 'coord-' || auth.uid()::text);
$$;

-- La foto de la coordinadora que llama (null si no tiene o si no es coordinadora).
create function public.my_photo()
returns text
language sql stable security definer
set search_path = ''
as $$
  select photo_path from public.coordinators where user_id = auth.uid();
$$;

-- Cambiarla ('' la saca). Solo una foto suya.
create function public.set_my_photo(p_path text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_coordinator() then raise exception 'Solo la coordinadora.' using errcode = '42501'; end if;
  if coalesce(p_path, '') <> '' and split_part(p_path, '/', 1) <> 'coord-' || auth.uid()::text then
    raise exception 'Esa foto no es tuya.' using errcode = '22023';
  end if;
  update public.coordinators set photo_path = nullif(p_path, '') where user_id = auth.uid();
end;
$$;

revoke all on function public.my_photo() from public, anon;
revoke all on function public.set_my_photo(text) from public, anon;
grant execute on function public.my_photo() to authenticated;
grant execute on function public.set_my_photo(text) to authenticated;
