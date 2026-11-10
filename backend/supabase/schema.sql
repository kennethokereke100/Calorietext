-- Initial Calorietext schema snapshot. Applied through the hosted migration API.
-- These tables are server-only; no browser role can read or mutate them.

create table public.calorietext_trainers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.calorietext_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.calorietext_trainers(id) on delete cascade,
  phone_lookup_hash text not null check (phone_lookup_hash ~ '^[a-f0-9]{64}$'),
  phone_ciphertext text not null check (phone_ciphertext like 'v1:%'),
  display_name text check (char_length(display_name) <= 120),
  timezone text not null default 'UTC',
  consented_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trainer_id, phone_lookup_hash)
);
comment on column public.calorietext_clients.phone_lookup_hash is
  'Use a keyed HMAC of the normalized phone number, never an unkeyed hash.';

create table public.calorietext_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.calorietext_clients(id) on delete cascade,
  provider_message_id text not null unique check (char_length(provider_message_id) between 1 and 200),
  direction text not null check (direction in ('inbound', 'outbound')),
  body_ciphertext text not null check (body_ciphertext like 'v1:%'),
  created_at timestamptz not null default now(),
  unique (id, client_id)
);
create index calorietext_messages_client_created_idx
  on public.calorietext_messages (client_id, created_at desc);

create table public.calorietext_meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.calorietext_clients(id) on delete cascade,
  source_message_id uuid,
  description text not null check (char_length(description) between 1 and 4000),
  calories numeric(10,2) not null check (calories >= 0 and calories <> 'NaN'::numeric),
  protein_g numeric(10,2) not null check (protein_g >= 0 and protein_g <> 'NaN'::numeric),
  carbs_g numeric(10,2) not null check (carbs_g >= 0 and carbs_g <> 'NaN'::numeric),
  fat_g numeric(10,2) not null check (fat_g >= 0 and fat_g <> 'NaN'::numeric),
  is_estimate boolean not null default true,
  eaten_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (source_message_id, client_id)
    references public.calorietext_messages(id, client_id),
  unique (source_message_id)
);
create index calorietext_meals_client_eaten_idx
  on public.calorietext_meals (client_id, eaten_at desc);
create index calorietext_meals_source_client_idx
  on public.calorietext_meals (source_message_id, client_id);

create table public.calorietext_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique check (char_length(provider_message_id) between 1 and 200),
  payload_ciphertext text not null check (payload_ciphertext like 'v1:%'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  received_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  processed_at timestamptz
);
create index calorietext_webhook_pending_idx
  on public.calorietext_webhook_events (received_at)
  where status in ('pending', 'failed');

alter table public.calorietext_trainers enable row level security;
alter table public.calorietext_clients enable row level security;
alter table public.calorietext_messages enable row level security;
alter table public.calorietext_meals enable row level security;
alter table public.calorietext_webhook_events enable row level security;

revoke all on table public.calorietext_trainers, public.calorietext_clients,
  public.calorietext_messages, public.calorietext_meals,
  public.calorietext_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.calorietext_trainers,
  public.calorietext_clients, public.calorietext_messages,
  public.calorietext_meals, public.calorietext_webhook_events to service_role;

create policy backend_only on public.calorietext_trainers
  for all to service_role using (true) with check (true);
create policy backend_only on public.calorietext_clients
  for all to service_role using (true) with check (true);
create policy backend_only on public.calorietext_messages
  for all to service_role using (true) with check (true);
create policy backend_only on public.calorietext_meals
  for all to service_role using (true) with check (true);
create policy backend_only on public.calorietext_webhook_events
  for all to service_role using (true) with check (true);
