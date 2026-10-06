-- Una fiesta pasa sola a "realizada" cuando todo su contenido está subido al Drive (✓✓),
-- lo marque Dafne o una CM. Solo desde "pendiente": las canceladas no se tocan, y si Dafne la
-- vuelve a pendiente a mano, queda así hasta el próximo cambio del contenido.

create function private.done_when_uploaded()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.coverages c set event_status = 'realizado'
  where c.id = new.coverage_id and c.event_status = 'pendiente'
    and not exists (select 1 from public.checklist_items i where i.coverage_id = c.id and i.stage <> 'drive');
  return null;
end;
$$;

create trigger checklist_items_done_when_uploaded
  after insert or update of stage on public.checklist_items
  for each row when (new.stage = 'drive')
  execute function private.done_when_uploaded();

-- Las que ya tienen todo en el Drive.
update public.coverages c set event_status = 'realizado'
where c.event_status = 'pendiente'
  and exists (select 1 from public.checklist_items i where i.coverage_id = c.id)
  and not exists (select 1 from public.checklist_items i where i.coverage_id = c.id and i.stage <> 'drive');
