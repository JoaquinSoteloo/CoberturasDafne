-- Aviso a Dafne cuando una CM deja todo el contenido de una fiesta en el Drive (una sola vez por fiesta).

alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('reminder', 'assigned', 'answered', 'paid', 'unpaid', 'undelivered',
                  'changed', 'cancelled', 'removed', 'unanswered', 'moment', 'receipt', 'uber_missing', 'uploaded'));

create or replace function public.cm_set_stage(p_item uuid, p_stage text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare me uuid := private.current_cm_id(); cov uuid;
begin
  if me is null then raise exception 'Tu cuenta no está vinculada a una CM.' using errcode = '42501'; end if;
  if p_stage not in ('pendiente', 'whatsapp', 'drive') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  update public.checklist_items i set stage = p_stage
  where i.id = p_item and exists (
    select 1 from public.assignments a
    where a.coverage_id = i.coverage_id and a.cm_id = me and a.confirmation <> 'rechazada')
  returning i.coverage_id into cov;
  if not found then raise exception 'No podés marcar ese contenido.' using errcode = 'P0002'; end if;
  -- Era lo último que faltaba subir: le avisamos a Dafne.
  if p_stage = 'drive' and not exists (select 1 from public.checklist_items i where i.coverage_id = cov and i.stage <> 'drive') then
    insert into private.notification_outbox (user_id, kind, data, dedupe)
    select c.owner_id, 'uploaded', private.coverage_info(c.id) || jsonb_build_object('cm_name', m.name), 'uploaded:' || c.id
    from public.coverages c, public.cms m where c.id = cov and m.id = me
    on conflict (dedupe) do nothing;
  end if;
end;
$$;
