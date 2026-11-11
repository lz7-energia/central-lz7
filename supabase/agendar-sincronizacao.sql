-- Central LZ7 — agenda a sincronização com o Flow (rodar uma vez no SQL Editor de cada projeto).
-- A cada 30 minutos, das 7h às 20h (horário de Brasília), de segunda a sábado.
-- O cron do Supabase usa UTC: 10–23 UTC = 7h–20h em Brasília.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'flow-sincronizar',
  '*/30 10-23 * * 1-6',
  $$
  select net.http_post(
    url := 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/flow-sincronizar',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Para conferir:   select jobname, schedule, active from cron.job;
-- Para desligar:   select cron.unschedule('flow-sincronizar');
