-- Central LZ7 — rodada COMPLETA da sincronização com o Flow, todo dia às 3h10 (Brasília) — rodar no SQL Editor do central-teste.
-- As rodadas de 30 em 30 minutos (agendar-sincronizacao.sql) passam a ser LEVES: não releem o cadastro de clientes nem os itens dos
-- pedidos (só quando aparece pedido novo). A completa relê tudo e acerta nomes, contatos e valores.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('flow-sincronizar-completa', '10 6 * * *', $$
  select net.http_post(url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/hyper-function',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{"completo": true}'::jsonb, timeout_milliseconds := 150000);
$$);
select jobname, schedule, active from cron.job where jobname like 'flow-sincronizar%' order by jobname;
