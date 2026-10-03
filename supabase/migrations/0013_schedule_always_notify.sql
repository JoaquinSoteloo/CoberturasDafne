-- El cronograma siempre avisa: a las CM les llega un aviso 10 minutos antes de cada momento.
alter table public.schedule_items alter column notify set default true;
update public.schedule_items set notify = true where not notify;
