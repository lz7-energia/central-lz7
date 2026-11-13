-- Central LZ7 — agenda a sincronização com o Flow (rodar no SQL Editor de cada projeto; rodar de novo só atualiza).
-- A cada 30 minutos, das 8h à meia-noite (horário de Brasília), de segunda a sábado.
-- A função foi criada pelo painel do Supabase e ficou com o nome automático "hyper-function" (código = flow-sincronizar).
-- O cron do Supabase usa UTC (Brasília + 3h), por isso são dois agendamentos:
--   flow-sincronizar        8h00–20h30 de Brasília = 11h–23h30 UTC, seg–sáb
--   flow-sincronizar-noite  21h00–00h00 de Brasília = 00h–03h UTC do dia seguinte (ter–dom em UTC = seg–sáb em Brasília)
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule('flow-sincronizar', '*/30 11-23 * * 1-6', $$
  select net.http_post(
    url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/hyper-function',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

select cron.schedule('flow-sincronizar-noite', '0,30 0-2 * * 0,2-6', $$
  select net.http_post(
    url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/hyper-function',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

select cron.schedule('flow-sincronizar-meia-noite', '0 3 * * 0,2-6', $$
  select net.http_post(
    url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/hyper-function',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

-- Roda uma vez agora, para atualizar os dados já.
select net.http_post(url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/hyper-function',
  headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 120000);

select jobname, schedule, active from cron.job where jobname like 'flow-sincronizar%' order by jobname;

-- Para desligar: select cron.unschedule('flow-sincronizar'); select cron.unschedule('flow-sincronizar-noite'); select cron.unschedule('flow-sincronizar-meia-noite');
