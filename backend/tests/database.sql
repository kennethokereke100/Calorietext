-- Run against the initialized schema. All synthetic rows are rolled back.
begin;

do $$
declare
  table_name text;
  table_id regclass;
begin
  foreach table_name in array array['calorietext_trainers', 'calorietext_clients',
    'calorietext_messages', 'calorietext_meals', 'calorietext_webhook_events'] loop
    table_id := ('public.' || table_name)::regclass;
    if not (select relrowsecurity from pg_class where oid = table_id) then
      raise exception 'RLS missing for %', table_name;
    end if;
    if has_table_privilege('anon', table_id, 'SELECT,INSERT,UPDATE,DELETE') or
       has_table_privilege('authenticated', table_id, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Browser role has privileges on %', table_name;
    end if;
  end loop;
end $$;

set local role anon;
do $$ begin
  begin
    perform id from public.calorietext_clients limit 1;
    raise exception 'Anonymous read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin
    perform id from public.calorietext_meals limit 1;
    raise exception 'Authenticated browser read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role service_role;
do $$
declare
  trainer_a uuid; trainer_b uuid; client_a uuid; client_b uuid;
  message_a uuid; message_b uuid;
  token text := replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.calorietext_trainers(slug, display_name)
    values ('test-a-' || token, 'Synthetic trainer A') returning id into trainer_a;
  insert into public.calorietext_trainers(slug, display_name)
    values ('test-b-' || token, 'Synthetic trainer B') returning id into trainer_b;
  insert into public.calorietext_clients(trainer_id, phone_lookup_hash, phone_ciphertext)
    values (trainer_a, repeat('a', 64), 'v1:synthetic') returning id into client_a;
  insert into public.calorietext_clients(trainer_id, phone_lookup_hash, phone_ciphertext)
    values (trainer_b, repeat('b', 64), 'v1:synthetic') returning id into client_b;
  insert into public.calorietext_messages(client_id, provider_message_id, direction, body_ciphertext)
    values (client_a, 'test-a-' || token, 'inbound', 'v1:synthetic') returning id into message_a;
  insert into public.calorietext_messages(client_id, provider_message_id, direction, body_ciphertext)
    values (client_b, 'test-b-' || token, 'inbound', 'v1:synthetic') returning id into message_b;
  insert into public.calorietext_meals(client_id, source_message_id, description, calories, protein_g, carbs_g, fat_g)
    values (client_b, message_b, 'Synthetic meal', 100, 5, 10, 4);
  begin
    insert into public.calorietext_meals(client_id, source_message_id, description, calories, protein_g, carbs_g, fat_g)
      values (client_b, message_a, 'Wrong client', 100, 5, 10, 4);
    raise exception 'Cross-client message reference unexpectedly allowed';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.calorietext_meals(client_id, description, calories, protein_g, carbs_g, fat_g)
      values (client_b, 'Invalid calories', -1, 5, 10, 4);
    raise exception 'Negative nutrition unexpectedly allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.calorietext_meals(client_id, description, calories, protein_g, carbs_g, fat_g)
      values (client_b, 'Invalid calories', 'NaN', 5, 10, 4);
    raise exception 'NaN nutrition unexpectedly allowed';
  exception when check_violation then null;
  end;
  insert into public.calorietext_webhook_events(provider_message_id, payload_ciphertext)
    values ('test-event-' || token, 'v1:synthetic');
  begin
    insert into public.calorietext_webhook_events(provider_message_id, payload_ciphertext)
      values ('test-event-' || token, 'v1:synthetic');
    raise exception 'Duplicate provider event unexpectedly allowed';
  exception when unique_violation then null;
  end;
  -- Client erasure also removes its dependent messages and meals.
  delete from public.calorietext_clients where id = client_b;
  if exists(select 1 from public.calorietext_meals where client_id = client_b) or
     exists(select 1 from public.calorietext_messages where client_id = client_b) then
    raise exception 'Dependent client records were not removed';
  end if;
end $$;
reset role;
select 'database checks passed; synthetic records rolled back' as result;
rollback;
