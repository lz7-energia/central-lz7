-- 20/11/2026: Régua de cobrança apagada de vez (decisão do usuário) e ordem dos cards por pessoa.
-- Ficam: clientes_flow (cadastro do Flow, usado pela sincronização) e titulo_ajustes.financiamento (Recebíveis).

drop table if exists public.cobranca_envios;
drop table if exists public.cobranca_regua_etapas;
drop table if exists public.cliente_contatos;
drop function if exists public.carimbar_envio();
alter table public.cobranca_situacoes drop column if exists pausa_regua;

-- Ordem dos cards: cada pessoa arruma a própria tela.
-- ordem = { "areas": ["rh","fiscal",…], "modulos": { "fiscal": ["/painel", …] } } (chave do módulo = href ou nome).
create table if not exists public.tela_ordem (
  perfil_id   uuid primary key references public.perfis(id) on delete cascade default auth.uid(),
  ordem       jsonb not null default '{}'::jsonb,
  alterado_em timestamptz not null default now()
);
alter table public.tela_ordem enable row level security;
drop policy if exists "lê a própria ordem" on public.tela_ordem;
create policy "lê a própria ordem" on public.tela_ordem for select to authenticated
  using (perfil_id = (select auth.uid()));
drop policy if exists "grava a própria ordem" on public.tela_ordem;
create policy "grava a própria ordem" on public.tela_ordem for insert to authenticated
  with check (perfil_id = (select auth.uid()) and public.eh_equipe());
drop policy if exists "altera a própria ordem" on public.tela_ordem;
create policy "altera a própria ordem" on public.tela_ordem for update to authenticated
  using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()) and public.eh_equipe());
grant select, insert, update on public.tela_ordem to authenticated;
