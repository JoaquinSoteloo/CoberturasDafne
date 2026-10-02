-- Corre el despachador de avisos cada minuto: anota los recordatorios de 24 horas y
-- manda todo lo pendiente. Llama a /api/push/dispatch de la app publicada.
--
-- La dirección de la app y el secreto viven en el Vault de Supabase, no en el repo.
-- Se cargan una sola vez (con los valores reales) desde el SQL Editor:
--   select vault.create_secret('https://tu-app.vercel.app', 'app_url');
--   select vault.create_secret('<el mismo CRON_SECRET que en Vercel>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'despachar-avisos',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/push/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
  where exists (select 1 from vault.decrypted_secrets where name = 'app_url');
  $$
);
