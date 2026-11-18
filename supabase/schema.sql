create table if not exists public.leads_escolares (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome_escola text not null,
  cidade text not null default 'Brasília',
  telefone_escola text,
  email_escola text,
  nome_decisor text,
  email_decisor text,
  status text not null default 'novo'
    check (status in ('novo', 'contato_enviado', 'respondido', 'reuniao_agendada')),
  ultima_interacao timestamptz
);

create index if not exists leads_escolares_status_idx
  on public.leads_escolares (status);

create index if not exists leads_escolares_nome_escola_idx
  on public.leads_escolares (nome_escola);

create index if not exists leads_escolares_cidade_idx
  on public.leads_escolares (cidade);

create unique index if not exists leads_escolares_email_escola_unique_idx
  on public.leads_escolares (email_escola)
  where email_escola is not null;

alter table public.leads_escolares enable row level security;

drop policy if exists "Leads podem ser lidos por usuários autenticados" on public.leads_escolares;
create policy "Leads podem ser lidos por usuários autenticados"
  on public.leads_escolares
  for select
  to authenticated
  using (true);

drop policy if exists "Leads podem ser atualizados por usuários autenticados" on public.leads_escolares;
create policy "Leads podem ser atualizados por usuários autenticados"
  on public.leads_escolares
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Lead bot pode inserir leads" on public.leads_escolares;
create policy "Lead bot pode inserir leads"
  on public.leads_escolares
  for insert
  to service_role
  with check (true);
