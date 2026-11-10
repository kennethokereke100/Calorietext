-- Hosted migration: calorietext_private_pilot. Apply after schema.sql.
alter table public.calorietext_webhook_events
  drop constraint calorietext_webhook_events_status_check,
  add constraint calorietext_webhook_events_status_check
    check (status in ('pending','processing','failed','sending','uncertain','completed')),
  add column lock_token uuid,
  add column lease_until timestamptz,
  add column retry_after timestamptz not null default now(),
  add column reply_ciphertext text,
  add column sent_provider_id text,
  add column last_error text;

create table public.calorietext_daily_usage (
  usage_day date primary key,
  ai_calls integer not null default 0 check (ai_calls between 0 and 20)
);
alter table public.calorietext_daily_usage enable row level security;
revoke all on public.calorietext_daily_usage from public, anon, authenticated;
grant select, insert, update, delete on public.calorietext_daily_usage to service_role;
create policy backend_only on public.calorietext_daily_usage
  for all to service_role using (true) with check (true);

-- One job at a time for the private pilot, including concurrent webhook/cron calls.
create function public.calorietext_claim_event()
returns setof public.calorietext_webhook_events
language plpgsql security invoker set search_path = '' as $$
declare picked uuid;
begin
  if not pg_try_advisory_xact_lock(70643389) then return; end if;
  update public.calorietext_webhook_events set status='uncertain', last_error='send_lease_expired'
    where status='sending' and lease_until < now();
  update public.calorietext_webhook_events set status='failed', retry_after=now(), last_error='processing_lease_expired'
    where status='processing' and lease_until < now();
  if exists(select 1 from public.calorietext_webhook_events where status in ('processing','sending')) then return; end if;
  select id into picked from public.calorietext_webhook_events
    where status in ('pending','failed') and attempts < 3 and retry_after <= now() and expires_at > now()
    order by received_at, id limit 1 for update skip locked;
  if picked is null then return; end if;
  return query update public.calorietext_webhook_events
    set status='processing', attempts=attempts+1, lock_token=gen_random_uuid(), lease_until=now()+interval '5 minutes'
    where id=picked returning *;
end $$;
revoke all on function public.calorietext_claim_event() from public, anon, authenticated;
grant execute on function public.calorietext_claim_event() to service_role;

create function public.calorietext_reserve_ai_call()
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  insert into public.calorietext_daily_usage(usage_day) values ((now() at time zone 'UTC')::date)
    on conflict do nothing;
  update public.calorietext_daily_usage set ai_calls=ai_calls+1
    where usage_day=(now() at time zone 'UTC')::date and ai_calls < 20;
  get diagnostics changed = row_count;
  return changed=1;
end $$;
revoke all on function public.calorietext_reserve_ai_call() from public, anon, authenticated;
grant execute on function public.calorietext_reserve_ai_call() to service_role;

create function public.calorietext_begin_send(event_id uuid, event_lock uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  update public.calorietext_webhook_events set status='sending', lease_until=now()+interval '5 minutes'
    where id=event_id and lock_token=event_lock and status='processing' and lease_until > now();
  get diagnostics changed = row_count;
  return changed=1;
end $$;
revoke all on function public.calorietext_begin_send(uuid,uuid) from public, anon, authenticated;
grant execute on function public.calorietext_begin_send(uuid,uuid) to service_role;

insert into public.calorietext_trainers(slug,display_name) values ('calorietext','Calorietext')
  on conflict (slug) do nothing;
