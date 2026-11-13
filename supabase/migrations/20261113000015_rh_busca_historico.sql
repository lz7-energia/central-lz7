-- Recrutamento: busca ativa (Abordados / Sem interesse), cadastro de histórico e nomes padronizados.

-- 1) Etapas novas: "abordado" (a recrutadora foi atrás: LinkedIn Open to Work, BNE…) e "sem_interesse" (o candidato não quis).
alter table public.rh_candidatos drop constraint if exists rh_candidatos_etapa_check;
alter table public.rh_candidatos add constraint rh_candidatos_etapa_check
  check (etapa in ('abordado', 'inscrito', 'triagem', 'gestor', 'aprovado', 'reprovado', 'sem_interesse'));
alter table public.rh_candidatos drop constraint if exists rh_candidatos_parou_em_check;
alter table public.rh_candidatos add constraint rh_candidatos_parou_em_check
  check (parou_em in ('abordado', 'inscrito', 'triagem', 'gestor'));

alter table public.rh_candidatos
  add column if not exists perfil_url   text check (char_length(perfil_url) <= 500),  -- link do LinkedIn, BNE…
  add column if not exists contatado_em date,                                         -- quando a recrutadora abordou
  add column if not exists inscrito_em  date,                                         -- data real da inscrição (histórico); vazio = criado_em
  add column if not exists historico    boolean not null default false;               -- cadastro retroativo: não gera tarefa no planner
comment on column public.rh_candidatos.historico is 'Cadastro retroativo (planilha antiga): não cria entrevista nem bônus no planner.';

-- 2) Motivos em dois grupos: "Não aprovado" (a empresa não seguiu) e "Sem interesse" (o candidato não quis).
alter table public.rh_motivos add column if not exists tipo text not null default 'nao_aprovado'
  check (tipo in ('nao_aprovado', 'sem_interesse'));
alter table public.rh_motivos drop constraint if exists rh_motivos_texto_key;
alter table public.rh_motivos drop constraint if exists rh_motivos_tipo_texto_key;
alter table public.rh_motivos add constraint rh_motivos_tipo_texto_key unique (tipo, texto);
insert into public.rh_motivos (texto, tipo, ordem)
select v.texto, 'sem_interesse', v.ordem from (values
  ('Já está empregado', 1), ('Remuneração / comissão não atrai', 2), ('Distância / outra cidade', 3),
  ('Não respondeu à abordagem', 4), ('Não quer contrato PJ', 5), ('Outro', 99)) as v(texto, ordem)
where not exists (select 1 from public.rh_motivos where tipo = 'sem_interesse');

-- 3) Onde a recrutadora encontra candidatos na busca ativa.
insert into public.rh_canais (nome, eh_indicacao, ordem)
select v.nome, false, v.ordem from (values ('LinkedIn (Open to Work)', 7), ('BNE', 8)) as v(nome, ordem)
where not exists (select 1 from public.rh_canais c where c.nome = v.nome);

-- 4) Nomes padronizados: "MARIA DA SILVA" / "maria da silva" → "Maria da Silva".
create or replace function public.rh_nome_padrao(n text) returns text
language plpgsql immutable as $$
declare
  x text := initcap(lower(regexp_replace(btrim(coalesce(n, '')), '\s+', ' ', 'g')));
  p text;
begin
  foreach p in array array['Da', 'De', 'Do', 'Das', 'Dos', 'E'] loop
    x := regexp_replace(x, '(\s)' || p || '(\s)', '\1' || lower(p) || '\2', 'g');
    x := regexp_replace(x, '(\s)' || p || '(\s)', '\1' || lower(p) || '\2', 'g'); -- "Da E Do" seguidos
  end loop;
  return nullif(upper(left(x, 1)) || substr(x, 2), '');
end $$;
update public.rh_candidatos set nome = public.rh_nome_padrao(nome) where nome is distinct from public.rh_nome_padrao(nome);
