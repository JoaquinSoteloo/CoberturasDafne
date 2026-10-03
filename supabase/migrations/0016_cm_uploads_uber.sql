-- La CM carga su Uber desde la app (monto, ida o vuelta y el comprobante) y a Dafne le
-- llega un aviso. También cuando adjunta un comprobante a un Uber que cargó Dafne.

alter table private.notification_outbox drop constraint notification_outbox_kind_check;
alter table private.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('reminder', 'assigned', 'answered', 'paid', 'unpaid', 'undelivered',
                  'changed', 'cancelled', 'removed', 'unanswered', 'moment', 'receipt'));

-- Aviso a la coordinadora: uno por gasto (si la CM lo carga y después adjunta el comprobante, sale uno solo).
create function private.notify_receipt(p_expense uuid, p_created boolean)
returns void
language sql security definer
set search_path = ''
as $$
  insert into private.notification_outbox (user_id, kind, data, dedupe)
  select e.owner_id, 'receipt', private.coverage_info(e.coverage_id) || jsonb_build_object(
           'cm_name', m.name, 'label', e.label, 'amount_cents', e.amount_cents, 'created', p_created),
         'receipt:' || e.id
  from public.expenses e join public.cms m on m.id = e.advanced_cm_id
  where e.id = p_expense
  on conflict (dedupe) do nothing;
$$;
revoke all on function private.notify_receipt(uuid, boolean) from public, anon, authenticated;

-- La CM carga un Uber de una fiesta en la que está (y no rechazó). Lo paga ella y Dafne se lo
-- reintegra; quién lo absorbe (Dafne o el salón) lo decide Dafne después. Devuelve el id del gasto.
create function public.cm_add_uber(p_coverage uuid, p_direction text, p_amount_cents bigint)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := private.current_cm_id();
  owner uuid;
  new_id uuid := gen_random_uuid();
begin
  if me is null then raise exception 'Tu cuenta no está habilitada.' using errcode = '42501'; end if;
  if p_direction not in ('ida', 'vuelta') then raise exception 'Elegí si es de ida o de vuelta.' using errcode = '22023'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'Revisá el monto.' using errcode = '22023';
  end if;
  select c.owner_id into owner from public.coverages c
  join public.assignments a on a.coverage_id = c.id and a.cm_id = me and a.confirmation <> 'rechazada'
  where c.id = p_coverage and c.event_status <> 'cancelado';
  if owner is null then raise exception 'No podés cargar gastos en esa fiesta.' using errcode = '42501'; end if;

  insert into public.expenses (id, owner_id, coverage_id, label, kind, amount_cents, advanced_by, advanced_cm_id, absorbed_by, position)
  values (new_id, owner, p_coverage, 'Uber de ' || p_direction, 'uber', p_amount_cents, 'cm', me, 'coordinadora',
          coalesce((select max(e.position) + 1 from public.expenses e where e.coverage_id = p_coverage), 0));
  perform private.notify_receipt(new_id, true);
  return new_id;
end;
$$;
revoke all on function public.cm_add_uber(uuid, text, bigint) from public, anon;
grant execute on function public.cm_add_uber(uuid, text, bigint) to authenticated;

-- set_expense_receipt avisa a la coordinadora cuando quien adjunta es la CM.
create or replace function public.set_expense_receipt(p_expense uuid, p_path text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_path is not null and split_part(p_path, '/', 1) <> p_expense::text then
    raise exception 'El archivo no corresponde a ese gasto.' using errcode = '22023';
  end if;
  if not private.can_touch_receipt(p_expense::text || '/') then
    raise exception 'No podés cambiar el comprobante de ese gasto.' using errcode = '42501';
  end if;
  update public.expenses set receipt_path = p_path where id = p_expense;
  if p_path is not null and not private.is_coordinator() then
    perform private.notify_receipt(p_expense, false);
  end if;
end;
$$;
