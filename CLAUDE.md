# Central LZ7 — guia para o Claude

Central empresarial interna da LZ7 Energia, com quatro áreas: Fiscal, Financeiro, RH e ADM.
Funciona **por cima** do ERP Flow (Everflow) e não o substitui: rotinas, prazos, alertas,
conferências e pedidos entre áreas.

A empresa não tem equipe de TI: o Claude constrói e mantém este sistema. O dono das contas
(GitHub, Supabase, Vercel) é o usuário, que aprova cada fase.

## Regras que não mudam

- **A central nunca escreve no Flow.** Só leitura pela API, sem pesar a plataforma e sem risco aos dados do ERP.
- Segredos (token do Flow, chaves do Supabase, senha SMTP) ficam só em variáveis de ambiente do servidor. Nunca no navegador, nunca no repositório.
- Dashboard financeiro e Ciclo comercial (apps já existentes) ficam fora da central por enquanto.
- Textos da interface em português do Brasil.

## Stack

- **Supabase:** Postgres, autenticação, armazenamento de arquivos, rotinas agendadas. Dois projetos: `central-teste` e `central-producao` (região São Paulo).
- **Vercel:** hospedagem do front-end, conectada a este repositório.
- **E-mail:** Titan, com remetente dedicado (SPF/DKIM configurados no DNS).

## Perfis de acesso

| Perfil | Login | O que vê |
|---|---|---|
| Equipe da central (4 pessoas) | Sim (e-mail Titan) | Tudo, exceto pastas sensíveis |
| Administrador | Sim | Tudo, inclusive pastas sensíveis e permissões |
| Colaboradores (40–50) | **Não** | Só o formulário do portal e a consulta do próprio pedido por protocolo |

Regras de acesso aplicadas no banco (Row Level Security), não só na interface.

## API do Flow (confirmar com a documentação oficial)

- Base: `https://api.flow2.com.br/v1/`, header `Authorization: Bearer <token>`
- Endpoints conhecidos: `/recebers/`, `/pagars/`, `/pedidosVenda/`, `/pedidosVenda/itens`
- Paginação por deslocamento: `pageSize` + `skip`
- Campos só vêm quando pedidos: parâmetros `carregar<Campo>=true`
- Vínculo pedido ↔ título: campos "Pedido de venda" e "Código do projeto" (código da obra: 2 letras + 6 dígitos + 3 letras)
- **Ainda não mapeado:** endpoint de OS (status "Aguardando vistoria") e download de XML/PDF da NF-e
- `developers.everflow.io` é outra empresa (marketing), não é este ERP

Sincronização: rotina no servidor copia os dados para o banco da central; as telas leem do banco.

## Fase 1

### Painel de faturamento

- Base: **pedido de venda**. Todo pedido de venda tem OS, e toda OS tem pedido.
- Colunas: Em execução → Pronto pra faturar → Faturado → Recebido.
- "Pronto pra faturar": OS vinculada com status "Aguardando vistoria" e pedido sem NF-e. Mostra dias parado.
- "Faturado": pedido com NF-e vinculada.
- Recebido proporcional: soma dos títulos recebidos ÷ total dos títulos do projeto no contas a receber. O card mostra o %. Vai para "Recebido" só com 100%.
- NF-e cancelada → volta para "Pronto pra faturar".

### Portal de pedidos

- Formulário aberto, sem login: setor → tipo de pedido → campos do tipo → protocolo.
- Pedido grava direto no banco e aparece na fila do setor na hora; aviso por e-mail ao responsável.
- Propostas a confirmar: consulta por protocolo + link; aprovação do gestor por link no e-mail (token assinado, com validade); identificação por lista fechada de nomes.
- Proteção do formulário aberto: limite de envios e verificação anti-robô.

## Documentos de referência

O planejamento completo está no projeto "ADM" do usuário no claude.ai:
handoff do projeto, decisões de 10/11/2026 e os resumos de cada área.
