create table if not exists coachos_app_state (
  id text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
