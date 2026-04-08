create table if not exists coachos_workspace (
  id text primary key,
  name text not null,
  brand_color text not null,
  accent_color text not null,
  hero_message text not null,
  stripe_connected boolean not null,
  parallel_run_days_left integer not null
);

create table if not exists coachos_coach_user (
  id text primary key,
  workspace_id text not null references coachos_workspace(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null
);

create table if not exists coachos_client_profile (
  id text primary key,
  workspace_id text not null references coachos_workspace(id) on delete cascade,
  full_name text not null,
  email text not null,
  goal text not null,
  status text not null,
  adherence_score integer not null,
  current_plan_id text null,
  monthly_price_gbp numeric not null,
  next_renewal_date text not null,
  last_checkin_date text null,
  health_conditions jsonb not null default '[]',
  daily_water_target integer not null default 3,
  daily_steps_target integer not null default 10000,
  supplements jsonb not null default '[]',
  nutrition_calories integer,
  nutrition_protein_g integer,
  nutrition_fat_g integer,
  nutrition_carbs_g integer,
  nutrition_coach_note text not null default ''
);

create table if not exists coachos_client_note (
  id text primary key,
  client_id text not null references coachos_client_profile(id) on delete cascade,
  content text not null,
  created_at text not null
);

create table if not exists coachos_body_metric (
  id text primary key,
  client_id text not null references coachos_client_profile(id) on delete cascade,
  date text not null,
  weight_kg numeric,
  body_fat_pct numeric,
  waist_cm numeric
);

create table if not exists coachos_session (
  id text primary key,
  client_id text not null references coachos_client_profile(id) on delete cascade,
  date text not null,
  duration integer not null,
  type text not null,
  notes text
);

create table if not exists coachos_program_plan (
  id text primary key,
  client_id text not null references coachos_client_profile(id) on delete cascade,
  coach_id text not null references coachos_coach_user(id) on delete cascade,
  title text not null,
  latest_version jsonb not null
);

create table if not exists coachos_checkin (
  id text primary key,
  client_id text not null references coachos_client_profile(id) on delete cascade,
  submitted_at text not null,
  progress jsonb not null,
  photo_count integer not null
);

create table if not exists coachos_subscription (
  id text primary key,
  client_id text not null references coachos_client_profile(id) on delete cascade,
  status text not null,
  amount_gbp numeric not null,
  renewal_date text not null
);

create table if not exists coachos_analytics_event (
  event_id bigserial primary key,
  name text not null,
  actor_id text not null,
  occurred_at text not null,
  metadata jsonb not null
);
