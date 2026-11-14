-- Central LZ7 — agenda a sincronização fiscal (PIS e COFINS) — rodar no SQL Editor do central-teste.
-- A cada 30 minutos, das 8h à meia-noite (Brasília), de segunda a sábado, como a do Flow. Cada rodada baixa até 35 XMLs novos.
-- A função precisa se chamar fiscal-sincronizar e estar com "Verify JWT" desligado (igual à hyper-function).
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('fiscal-sincronizar', '15,45 11-23 * * 1-6', $$
  select net.http_post(url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/fiscal-sincronizar',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 150000);
$$);
select cron.schedule('fiscal-sincronizar-noite', '15,45 0-2 * * 0,2-6', $$
  select net.http_post(url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/fiscal-sincronizar',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 150000);
$$);
select jobname, schedule, active from cron.job where jobname like 'fiscal-sincronizar%' order by jobname;
