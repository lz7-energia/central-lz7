-- Central LZ7 — agenda a sincronização do DFC — rodar no SQL Editor do central-teste.
-- A cada 30 minutos (aos 20 e 50), das 8h à meia-noite (Brasília), de segunda a sábado, fora do horário das outras.
-- No central-teste o código de supabase/functions/dfc-sincronizar está publicado como "super-function" (nome automático),
-- com "Verify JWT" desligado. Em produção, publicar como dfc-sincronizar e trocar o endereço abaixo.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('dfc-sincronizar', '20,50 11-23 * * 1-6', $$
  select net.http_post(url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/super-function',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 150000);
$$);
select cron.schedule('dfc-sincronizar-noite', '20,50 0-2 * * 0,2-6', $$
  select net.http_post(url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/super-function',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 150000);
$$);
select jobname, schedule, active from cron.job where jobname like 'dfc-sincronizar%' order by jobname;
