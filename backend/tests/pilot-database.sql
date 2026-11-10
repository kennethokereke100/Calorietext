-- Run while the pilot is disabled. Synthetic state is rolled back.
begin;
set local role service_role;
do $$
declare job public.calorietext_webhook_events; expected uuid; n integer;
begin
  if exists(select 1 from public.calorietext_webhook_events where status <> 'completed') then
    raise exception 'Disable and drain the pilot before running this test';
  end if;
  insert into public.calorietext_webhook_events(provider_message_id,payload_ciphertext)
    values ('transaction-test-' || gen_random_uuid(),'v1:synthetic') returning id into expected;
  select * into job from public.calorietext_claim_event();
  if job.id is distinct from expected or job.attempts <> 1 then raise exception 'Claim failed'; end if;
  if exists(select 1 from public.calorietext_claim_event()) then raise exception 'Concurrent job claim allowed'; end if;
  if public.calorietext_begin_send(job.id,gen_random_uuid()) then raise exception 'Wrong lease allowed'; end if;
  if not public.calorietext_begin_send(job.id,job.lock_token) then raise exception 'Valid lease denied'; end if;
  if public.calorietext_begin_send(job.id,job.lock_token) then raise exception 'Repeated send allowed'; end if;
  update public.calorietext_webhook_events set lease_until=now()-interval '1 minute' where id=job.id;
  perform public.calorietext_claim_event();
  if (select status from public.calorietext_webhook_events where id=job.id) <> 'uncertain' then
    raise exception 'Ambiguous send became retryable';
  end if;
  insert into public.calorietext_daily_usage(usage_day,ai_calls) values ((now() at time zone 'UTC')::date,0)
    on conflict(usage_day) do update set ai_calls=0;
  for n in 1..20 loop
    if not public.calorietext_reserve_ai_call() then raise exception 'Daily quota exhausted early'; end if;
  end loop;
  if public.calorietext_reserve_ai_call() then raise exception 'Daily quota exceeded'; end if;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon','public.calorietext_claim_event()','execute') or
     has_function_privilege('authenticated','public.calorietext_reserve_ai_call()','execute') or
     has_function_privilege('anon','public.calorietext_begin_send(uuid,uuid)','execute') or
     has_table_privilege('authenticated','public.calorietext_daily_usage','select') then
    raise exception 'Pilot RPCs or budget exposed to browser roles';
  end if;
end $$;
select 'pilot database checks passed; changes rolled back' as result;
rollback;
