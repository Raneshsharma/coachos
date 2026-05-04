create extension if not exists "pgcrypto";

create table if not exists organizations (
  id text primary key,
  name text not null,
  brand_color text not null default '#123f2d',
  accent_color text not null default '#ff8757',
  hero_message text not null default '',
  stripe_connected boolean not null default false,
  parallel_run_days_left integer not null default 0,
  plan text not null default 'demo',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id text primary key,
  organization_id text references organizations(id) on delete cascade,
  auth_user_id uuid unique,
  display_name text not null,
  email text not null,
  role text not null check (role in ('owner', 'coach', 'client', 'admin')),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists coaches (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  profile_id text references profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  gender text not null default 'male',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  profile_id text references profiles(id) on delete set null,
  full_name text not null,
  email text not null,
  goal text not null,
  status text not null check (status in ('active', 'at_risk', 'trial')),
  adherence_score integer not null check (adherence_score between 0 and 100),
  current_plan_id text,
  monthly_price_gbp numeric(10,2) not null,
  next_renewal_date text not null,
  last_checkin_date text,
  health_conditions jsonb not null default '[]'::jsonb,
  daily_water_target integer not null default 3,
  daily_steps_target integer not null default 10000,
  supplements jsonb not null default '[]'::jsonb,
  nutrition_calories integer,
  nutrition_protein_g integer,
  nutrition_fat_g integer,
  nutrition_carbs_g integer,
  nutrition_coach_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists coach_clients (
  id text primary key default 'cc_' || gen_random_uuid()::text,
  coach_id text not null references coaches(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  relationship_status text not null default 'active',
  started_at timestamptz not null default now(),
  unique (coach_id, client_id)
);

create table if not exists client_access_grants (
  id text primary key default 'grant_' || gen_random_uuid()::text,
  client_id text not null references clients(id) on delete cascade,
  profile_id text not null references profiles(id) on delete cascade,
  access_level text not null check (access_level in ('read', 'write', 'admin')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists plans (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  coach_id text not null references coaches(id) on delete cascade,
  title text not null,
  latest_version jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists check_ins (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  submitted_at text not null,
  progress jsonb not null,
  photo_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  status text not null check (status in ('active', 'past_due', 'trialing', 'cancelled')),
  amount_gbp numeric(10,2) not null,
  renewal_date text not null,
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  coach_id text not null references coaches(id) on delete cascade,
  sender text not null check (sender in ('coach', 'client')),
  content text not null,
  sent_at text not null,
  read_at text,
  created_at timestamptz not null default now()
);

create table if not exists client_notes (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  coach_id text references coaches(id) on delete set null,
  content text not null,
  created_at text not null,
  updated_at timestamptz not null default now()
);

create table if not exists body_metrics (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  date text not null,
  weight_kg numeric(6,2),
  body_fat_pct numeric(5,2),
  waist_cm numeric(6,2),
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  coach_id text references coaches(id) on delete set null,
  date text not null,
  duration integer not null,
  type text not null check (type in ('virtual', 'in-person')),
  notes text,
  created_at text not null
);

create table if not exists group_programs (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  coach_id text not null references coaches(id) on delete cascade,
  title text not null,
  description text not null,
  goal text not null,
  member_ids jsonb not null default '[]'::jsonb,
  monthly_price_gbp numeric(10,2) not null default 0,
  status text not null check (status in ('active', 'archived', 'upcoming')),
  created_at text not null
);

create table if not exists nutrition_swaps (
  id text primary key,
  plan_id text not null references plans(id) on delete cascade,
  original_food jsonb not null,
  swap_suggestion jsonb not null,
  applied_at text
);

create table if not exists habits (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  title text not null,
  target integer not null,
  frequency text not null check (frequency in ('daily', 'weekly')),
  created_at text not null
);

create table if not exists habit_completions (
  id text primary key,
  habit_id text not null references habits(id) on delete cascade,
  date text not null,
  completed boolean not null default true,
  unique (habit_id, date)
);

create table if not exists analytics_events (
  event_id bigserial primary key,
  name text not null,
  actor_id text not null,
  occurred_at text not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists page_definitions (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  page_type text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists client_pages (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  page_definition_id text not null references page_definitions(id) on delete cascade,
  layout_json jsonb not null default '{}'::jsonb,
  visibility text not null default 'coach',
  created_at timestamptz not null default now()
);

create table if not exists metric_definitions (
  id text primary key,
  organization_id text references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  unit text,
  data_type text not null check (data_type in ('number', 'text', 'boolean', 'json')),
  aggregation_type text not null default 'latest',
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists metric_sources (
  id text primary key,
  organization_id text references organizations(id) on delete cascade,
  name text not null,
  source_type text not null,
  integration_provider text,
  created_at timestamptz not null default now()
);

create table if not exists page_widgets (
  id text primary key,
  page_definition_id text not null references page_definitions(id) on delete cascade,
  metric_definition_id text references metric_definitions(id) on delete set null,
  position integer not null default 0,
  widget_type text not null,
  config_json jsonb not null default '{}'::jsonb
);

create table if not exists metric_values (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  metric_definition_id text not null references metric_definitions(id) on delete cascade,
  source_id text references metric_sources(id) on delete set null,
  value_numeric numeric,
  value_text text,
  value_boolean boolean,
  value_json jsonb,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists metric_daily_rollups (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  metric_definition_id text not null references metric_definitions(id) on delete cascade,
  date date not null,
  min_value numeric,
  max_value numeric,
  avg_value numeric,
  sum_value numeric,
  latest_value numeric,
  sample_count integer not null default 0,
  unique (client_id, metric_definition_id, date)
);

create table if not exists metric_alert_rules (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  metric_definition_id text not null references metric_definitions(id) on delete cascade,
  operator text not null,
  threshold numeric not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists metric_alert_events (
  id text primary key,
  rule_id text not null references metric_alert_rules(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  metric_value_id text references metric_values(id) on delete set null,
  status text not null default 'open',
  triggered_at timestamptz not null default now()
);

create table if not exists goals (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  coach_id text references coaches(id) on delete set null,
  title text not null,
  status text not null default 'active',
  target_date date,
  created_at timestamptz not null default now()
);

create table if not exists goal_milestones (
  id text primary key,
  goal_id text not null references goals(id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'open'
);

create table if not exists goal_updates (
  id text primary key,
  goal_id text not null references goals(id) on delete cascade,
  author_id text references profiles(id) on delete set null,
  progress_value numeric,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key,
  client_id text references clients(id) on delete cascade,
  assigned_by text references profiles(id) on delete set null,
  assigned_to text references profiles(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists form_templates (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  schema_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists form_submissions (
  id text primary key,
  template_id text not null references form_templates(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  submitted_by text references profiles(id) on delete set null,
  submitted_at timestamptz not null default now()
);

create table if not exists form_answers (
  id text primary key,
  submission_id text not null references form_submissions(id) on delete cascade,
  question_key text not null,
  answer_json jsonb not null
);

create table if not exists assessment_definitions (
  id text primary key,
  organization_id text references organizations(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  scoring_model_json jsonb not null default '{}'::jsonb
);

create table if not exists assessment_results (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  assessment_id text not null references assessment_definitions(id) on delete cascade,
  score numeric,
  risk_band text,
  completed_at timestamptz not null default now()
);

create table if not exists files (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  client_id text references clients(id) on delete cascade,
  bucket text not null,
  path text not null,
  uploaded_by text references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists external_connections (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  provider text not null,
  status text not null default 'active',
  token_ref text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists sync_jobs (
  id text primary key,
  connection_id text references external_connections(id) on delete cascade,
  status text not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id text primary key,
  provider text not null,
  event_type text not null,
  payload_json jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  organization_id text references organizations(id) on delete cascade,
  actor_id text references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  recipient_id text references profiles(id) on delete cascade,
  type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists activity_events (
  id text primary key,
  client_id text references clients(id) on delete cascade,
  actor_id text references profiles(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id text,
  created_at timestamptz not null default now()
);

create table if not exists background_jobs (
  id text primary key,
  job_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists feature_flags (
  id text primary key,
  organization_id text references organizations(id) on delete cascade,
  key text not null,
  enabled boolean not null default false,
  config_json jsonb not null default '{}'::jsonb,
  unique (organization_id, key)
);

create index if not exists idx_profiles_organization on profiles(organization_id);
create index if not exists idx_coaches_organization on coaches(organization_id);
create index if not exists idx_clients_organization on clients(organization_id);
create index if not exists idx_coach_clients_coach on coach_clients(coach_id);
create index if not exists idx_coach_clients_client on coach_clients(client_id);
create index if not exists idx_plans_client on plans(client_id);
create index if not exists idx_check_ins_client_submitted on check_ins(client_id, submitted_at desc);
create index if not exists idx_messages_client_sent on messages(client_id, sent_at);
create index if not exists idx_client_notes_client_created on client_notes(client_id, created_at desc);
create index if not exists idx_body_metrics_client_date on body_metrics(client_id, date desc);
create index if not exists idx_sessions_client_date on sessions(client_id, date);
create index if not exists idx_habits_client on habits(client_id);
create index if not exists idx_page_widgets_page_position on page_widgets(page_definition_id, position);
create index if not exists idx_metric_values_client_recorded on metric_values(client_id, recorded_at desc);
create index if not exists idx_metric_values_definition_recorded on metric_values(metric_definition_id, recorded_at desc);
create index if not exists idx_metric_rollups_client_date on metric_daily_rollups(client_id, date desc);
create index if not exists idx_metric_alert_events_client_status on metric_alert_events(client_id, status);
create index if not exists idx_external_connections_client on external_connections(client_id);
create index if not exists idx_audit_logs_organization_created on audit_logs(organization_id, created_at desc);
create index if not exists idx_background_jobs_status_run_after on background_jobs(status, run_after);

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table coaches enable row level security;
alter table clients enable row level security;
alter table coach_clients enable row level security;
alter table page_definitions enable row level security;
alter table page_widgets enable row level security;
alter table metric_definitions enable row level security;
alter table metric_values enable row level security;
alter table metric_daily_rollups enable row level security;
alter table form_templates enable row level security;
alter table external_connections enable row level security;
alter table audit_logs enable row level security;
alter table background_jobs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations','profiles','coaches','clients','coach_clients','client_access_grants',
    'plans','check_ins','subscriptions','messages','client_notes','body_metrics','sessions',
    'group_programs','nutrition_swaps','habits','habit_completions','analytics_events',
    'page_definitions','client_pages','page_widgets','metric_definitions','metric_sources',
    'metric_values','metric_daily_rollups','metric_alert_rules','metric_alert_events',
    'goals','goal_milestones','goal_updates','tasks','form_templates','form_submissions',
    'form_answers','assessment_definitions','assessment_results','files','external_connections',
    'sync_jobs','webhook_events','audit_logs','notifications','activity_events','background_jobs',
    'feature_flags'
  ]
  loop
    execute format('alter table %I enable row level security', table_name);
  end loop;
end $$;

drop policy if exists service_role_all_on_metric_values on metric_values;
create policy service_role_all_on_metric_values on metric_values
  for all to service_role using (true) with check (true);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations','profiles','coaches','clients','coach_clients','client_access_grants',
    'plans','check_ins','subscriptions','messages','client_notes','body_metrics','sessions',
    'group_programs','nutrition_swaps','habits','habit_completions','analytics_events',
    'page_definitions','client_pages','page_widgets','metric_definitions','metric_sources',
    'metric_values','metric_daily_rollups','metric_alert_rules','metric_alert_events',
    'goals','goal_milestones','goal_updates','tasks','form_templates','form_submissions',
    'form_answers','assessment_definitions','assessment_results','files','external_connections',
    'sync_jobs','webhook_events','audit_logs','notifications','activity_events','background_jobs',
    'feature_flags'
  ]
  loop
    execute format(
      'drop policy if exists service_role_all_on_%I on %I',
      table_name,
      table_name
    );
    execute format(
      'create policy service_role_all_on_%I on %I for all to service_role using (true) with check (true)',
      table_name,
      table_name
    );
  end loop;
end $$;
