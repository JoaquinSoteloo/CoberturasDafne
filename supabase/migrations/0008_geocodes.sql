-- Coordenadas de cada dirección, para abrir Uber con el destino cargado.
-- Se buscan una sola vez en OpenStreetMap (Nominatim) y quedan guardadas acá.
-- Solo la usa el servidor con la clave secreta: sin políticas, nadie más la lee ni la escribe.

create table public.geocodes (
  address_key text primary key,      -- la dirección normalizada (minúsculas, sin espacios de más)
  lat         double precision,      -- null: se buscó y no se encontró
  lng         double precision,
  created_at  timestamptz not null default now()
);
alter table public.geocodes enable row level security;
