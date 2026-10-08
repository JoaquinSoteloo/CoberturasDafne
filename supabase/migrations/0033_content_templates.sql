-- Listas de contenido por tipo de fiesta: cada fiesta nueva arranca con la de su tipo
-- ("General" para las demás). Las arma Dafne en Coberturas → Listas de contenido.

create table public.content_templates (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  party_type text not null check (length(trim(party_type)) > 0),
  items      jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (owner_id, party_type)
);
alter table public.content_templates enable row level security;
create policy "Listas de contenido: la coordinadora" on public.content_templates for all to authenticated
  using (owner_id = auth.uid() and private.is_coordinator())
  with check (owner_id = auth.uid() and private.is_coordinator());
grant select, insert, update, delete on public.content_templates to authenticated;
