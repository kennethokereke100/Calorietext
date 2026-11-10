-- Hosted migration: calorietext_pilot_schedule. Values are configured in Vault,
-- never in this source file. A no-work minute does not invoke an Edge Function.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('calorietext-queue-retry','* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='calorietext_worker_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-calorietext-admin-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='calorietext_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  ) where exists(
    select 1 from public.calorietext_webhook_events
    where expires_at > now() and (
      (status in ('pending','failed') and attempts < 3 and retry_after <= now()) or
      (status in ('processing','sending') and lease_until < now())
    )
  ) and exists(select 1 from vault.secrets where name='calorietext_worker_url')
    and exists(select 1 from vault.secrets where name='calorietext_worker_secret');
$job$);
select cron.schedule('calorietext-queue-retention','15 * * * *', $job$
  delete from public.calorietext_webhook_events where expires_at < now();
  delete from public.calorietext_daily_usage where usage_day < current_date - 30;
$job$);
