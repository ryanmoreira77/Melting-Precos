-- Melting Preços · banco de clientes e preços compartilhado
-- Projeto Supabase: "Melting" (rbarvmaiagdnniefeooo). Tabelas com prefixo mp_ para não colidir com outros sistemas.
-- Pode rodar mais de uma vez sem problema.
-- Rode no SQL Editor do Supabase. Depois crie os usuários da equipe em Authentication > Users
-- e preencha URL + chave anon em Ajustes (ou em js/config.js).

create table if not exists public.mp_clientes (
  id            text primary key,               -- gerado a partir do nome do cliente
  dados         jsonb not null,                 -- nome, cnpj, contatos, markup, precos{codigo: {preco, data, origem}}
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  criado_por    uuid default auth.uid() references auth.users(id)
);
create index if not exists mp_clientes_nome_idx on public.mp_clientes ((dados->>'nome'));

alter table public.mp_clientes enable row level security;
drop policy if exists "equipe lê" on public.mp_clientes;
create policy "equipe lê" on public.mp_clientes for select to authenticated using (true);
drop policy if exists "equipe insere" on public.mp_clientes;
create policy "equipe insere" on public.mp_clientes for insert to authenticated with check (true);
drop policy if exists "equipe atualiza" on public.mp_clientes;
create policy "equipe atualiza" on public.mp_clientes for update to authenticated using (true) with check (true);
drop policy if exists "equipe exclui" on public.mp_clientes;
create policy "equipe exclui" on public.mp_clientes for delete to authenticated using (true);
do $$ begin
  alter publication supabase_realtime add table public.mp_clientes;
exception when duplicate_object then null; end $$;

-- aprendizado da leitura de pedidos (linhas que não são produto, produto escolhido para cada texto)
create table if not exists public.mp_aprendizado (
  id            text primary key,
  dados         jsonb not null,
  atualizado_em timestamptz
);
alter table public.mp_aprendizado enable row level security;
drop policy if exists "equipe usa aprendizado" on public.mp_aprendizado;
create policy "equipe usa aprendizado" on public.mp_aprendizado for all to authenticated using (true) with check (true);

-- registro dos e-mails de proposta enviados pela função enviar-cotacao (opcional)
create table if not exists public.mp_envios_email (
  id           uuid primary key default gen_random_uuid(),
  para         text not null,
  cc           text,
  assunto      text,
  id_provedor  text,
  enviado_por  uuid default auth.uid() references auth.users(id),
  enviado_em   timestamptz not null default now()
);
alter table public.mp_envios_email enable row level security;
drop policy if exists "equipe vê envios" on public.mp_envios_email;
create policy "equipe vê envios" on public.mp_envios_email for select to authenticated using (true);
drop policy if exists "equipe registra envios" on public.mp_envios_email;
create policy "equipe registra envios" on public.mp_envios_email for insert to authenticated with check (true);
