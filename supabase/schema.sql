-- ============================================================
-- CoachOS — Full Database Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── Coach Workspaces ────────────────────────────────────────
create table if not exists workspaces (
  id          text primary key default 'ws_' || gen_random_uuid()::text,
  name        text not null default 'CoachOS',
  brand_color text not null default '#123f2d',
  accent_color text not null default '#ff8757',
  hero_message text not null default 'Elite coaching that adapts to your life.',
  stripe_connected boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── Coach Users ──────────────────────────────────────────────
create table if not exists coaches (
  id              text primary key default 'coach_' || gen_random_uuid()::text,
  workspace_id    text not null references workspaces(id) on delete cascade,
  full_name       text not null,
  email           text not null unique,
  avatar_initials text not null,
  created_at      timestamptz not null default now()
);

-- ── Clients ──────────────────────────────────────────────────
create table if not exists clients (
  id               text primary key default 'c_' || gen_random_uuid()::text,
  workspace_id     text not null references workspaces(id) on delete cascade,
  full_name        text not null,
  email            text not null,
  status           text not null default 'active'
                   check (status in ('active', 'at_risk', 'trialing', 'inactive')),
  adherence_score  integer not null default 0,
  monthly_price_gbp integer not null default 0,
  next_renewal_date text,
  goal             text,
  start_date       text,
  avatar_initials  text,
  tags             text[] not null default '{}',
  -- Extended profile fields
  health_conditions jsonb not null default '[]',
  daily_water_target integer not null default 3,
  daily_steps_target integer not null default 10000,
  supplements       text[] not null default '{}',
  nutrition_calories integer,
  nutrition_protein_g integer,
  nutrition_fat_g   integer,
  nutrition_carbs_g integer,
  nutrition_coach_note text not null default '',
  created_at       timestamptz not null default now()
);

-- ── Program Plans ────────────────────────────────────────────
create table if not exists plans (
  id           text primary key default 'plan_' || gen_random_uuid()::text,
  client_id    text not null references clients(id) on delete cascade,
  title        text not null,
  status       text not null default 'draft'
                check (status in ('draft', 'approved')),
  workouts     text[] not null default '{}',
  nutrition    text[] not null default '{}',
  explanation  text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Check-Ins ────────────────────────────────────────────────
create table if not exists check_ins (
  id            text primary key default 'ci_' || gen_random_uuid()::text,
  client_id     text not null references clients(id) on delete cascade,
  submitted_at  timestamptz not null default now(),
  weight_kg     numeric(5,2),
  energy_score  integer,
  steps         integer,
  notes         text,
  adherence_score integer,
  photo_url     text
);

-- ── Subscriptions ───────────────────────────────────────────
create table if not exists subscriptions (
  id            text primary key default 'sub_' || gen_random_uuid()::text,
  client_id     text not null references clients(id) on delete cascade,
  status        text not null default 'active'
                 check (status in ('active', 'past_due', 'cancelled', 'trialing')),
  amount_gbp    integer not null default 0,
  renewal_date  text
);

-- ── Messages ─────────────────────────────────────────────────
create table if not exists messages (
  id          text primary key default 'msg_' || gen_random_uuid()::text,
  coach_id    text not null references coaches(id) on delete cascade,
  client_id   text not null references clients(id) on delete cascade,
  sender      text not null check (sender in ('coach', 'client')),
  content     text not null,
  sent_at     timestamptz not null default now()
);

-- ── Habits ───────────────────────────────────────────────────
create table if not exists habits (
  id          text primary key default 'h_' || gen_random_uuid()::text,
  client_id   text not null references clients(id) on delete cascade,
  title       text not null,
  target      integer not null default 1,
  frequency   text not null default 'daily' check (frequency in ('daily', 'weekly')),
  created_at  timestamptz not null default now()
);

create table if not exists habit_completions (
  id          text primary key default 'hc_' || gen_random_uuid()::text,
  habit_id    text not null references habits(id) on delete cascade,
  date        text not null,
  completed   boolean not null default true,
  unique (habit_id, date)
);

-- ── Exercises ────────────────────────────────────────────────
create table if not exists exercises (
  id           text primary key default 'ex_' || gen_random_uuid()::text,
  name         text not null,
  body_part    text,
  equipment    text,
  goal         text,
  difficulty   text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  instructions text
);

-- ── Recipes ─────────────────────────────────────────────────
create table if not exists recipes (
  id          text primary key default 'r_' || gen_random_uuid()::text,
  name        text not null,
  ingredients text[] not null default '{}',
  steps       text[] not null default '{}',
  calories    integer,
  protein_g   numeric(6,2),
  carbs_g     numeric(6,2),
  fat_g       numeric(6,2),
  prep_time   integer,
  cook_time   integer,
  tags        text[] not null default '{}'
);

-- ── Group Programs ───────────────────────────────────────────
create table if not exists group_programs (
  id          text primary key default 'gp_' || gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  name        text not null,
  description text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  goal        text not null default '',
  member_ids  text[] not null default '{}',
  monthly_price_gbp integer not null default 0
);

-- ── Booked Sessions ─────────────────────────────────────────────
create table if not exists booked_sessions (
  id            text primary key default 'bs_' || gen_random_uuid()::text,
  client_id     text not null references clients(id) on delete cascade,
  coach_id      text not null references coaches(id) on delete cascade,
  session_type  text not null check (session_type in ('virtual', 'in-person')),
  session_date  text not null,
  session_time  text not null,
  duration_mins integer not null default 60,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

-- ── Body Metrics ─────────────────────────────────────────────
create table if not exists body_metrics (
  id           text primary key default 'bm_' || gen_random_uuid()::text,
  client_id    text not null references clients(id) on delete cascade,
  measured_at  timestamptz not null default now(),
  weight_kg    numeric(5,2),
  body_fat_pct numeric(4,1),
  chest_cm     numeric(5,1),
  waist_cm     numeric(5,1),
  hips_cm      numeric(5,1),
  arm_cm       numeric(5,1),
  thigh_cm     numeric(5,1),
  energy_score integer,
  sleep_rating integer,
  notes        text
);

insert into body_metrics (id, client_id, measured_at, weight_kg, body_fat_pct, chest_cm, waist_cm, hips_cm, arm_cm, thigh_cm, energy_score, sleep_rating, notes)
values
  ('bm_1', 'c_1', '2026-02-01T09:00:00Z', 71.2, 22.1, 96.0, 82.0, 98.5, 32.0, 57.5, 7, 6, 'Baseline measurement before programme start.'),
  ('bm_2', 'c_1', '2026-02-15T09:00:00Z', 70.4, 21.5, 95.0, 80.5, 97.0, 32.5, 56.0, 8, 7, 'Good progress. Waist down 1.5cm.'),
  ('bm_3', 'c_1', '2026-03-01T09:00:00Z', 69.1, 20.8, 93.5, 79.0, 95.5, 33.0, 55.0, 9, 8, 'Strong adherence this fortnight.'),
  ('bm_4', 'c_1', '2026-03-15T09:00:00Z', 68.4, 20.3, 92.5, 77.5, 94.0, 33.5, 54.0, 8, 7, 'Weight loss on track. Body fat dropping steadily.'),
  ('bm_5', 'c_1', '2026-04-01T09:00:00Z', 68.2, 19.9, 91.5, 76.0, 93.0, 34.0, 53.5, 9, 8, 'Month 5 — best results so far.'),
  ('bm_6', 'c_2', '2026-02-01T09:00:00Z', 76.8, 26.5, 104.0, 94.0, 106.0, 34.0, 59.0, 5, 4, 'Initial assessment — client feeling sluggish.'),
  ('bm_7', 'c_2', '2026-02-28T09:00:00Z', 76.1, 26.0, 103.0, 93.5, 105.5, 34.5, 58.5, 4, 5, 'Marathon training load increased. Weight stable.')
on conflict (id) do nothing;

-- ── Client Notes ──────────────────────────────────────────────
create table if not exists client_notes (
  id         text primary key default 'cn_' || gen_random_uuid()::text,
  coach_id   text not null references coaches(id) on delete cascade,
  client_id  text not null references clients(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Seed Data ────────────────────────────────────────────────
insert into workspaces (id, name, brand_color, accent_color, hero_message, stripe_connected)
values ('ws_1', 'CoachOS', '#123f2d', '#ff8757', 'Elite coaching that adapts to your life.', false)
on conflict (id) do nothing;

insert into coaches (id, workspace_id, full_name, email, avatar_initials)
values ('coach_1', 'ws_1', 'Alex Morgan', 'alex@coachos.app', 'AM')
on conflict (id) do nothing;

insert into clients (id, workspace_id, full_name, email, status, adherence_score, monthly_price_gbp, next_renewal_date, goal, start_date, avatar_initials, tags)
values
  ('c_1', 'ws_1', 'Sophie Patel',  'sophie@example.com',  'active',   87, 149, '2026-05-01', 'Lose 6kg, build strength',      '2025-11-01', 'SP', array['fat-loss','strength']),
  ('c_2', 'ws_1', 'Liam Carter',   'liam@example.com',    'at_risk',  41, 199, '2026-04-15', 'Marathon prep',                  '2025-09-15', 'LC', array['endurance','performance']),
  ('c_3', 'ws_1', 'Ava Thompson',  'ava@example.com',     'trialing', 92,  99, '2026-04-10', 'General health',                 '2026-03-01', 'AT', array['general-health'])
on conflict (id) do nothing;

insert into plans (id, client_id, title, status, workouts, nutrition, explanation)
values
  ('plan_1', 'c_1', 'Spring Fat-Loss Programme', 'approved',
   array['Upper Body Strength (Barbell)','HIIT Cardio','Lower Body + Core','Active Recovery','Full Body Conditioning'],
   array['Moderate deficit: 2,100 kcal','High protein: 180g, moderate carbs: 150g','Pre-workout window: banana + coffee','Post-workout recovery meal','Rest day: 1,800 kcal with 160g protein'],
   array['Phase 1 focuses on metabolic priming and building work capacity.','Protein set at 1.8g/kg to preserve lean tissue during the deficit.']),
  ('plan_2', 'c_2', 'Marathon Build Phase 1', 'draft',
   array['Easy Run 8km','Tempo Intervals','Strength & Mobility','Long Run 18km','Recovery + Cross-Training'],
   array['High carb: 320g for training days','Race day carb loading protocol','Post-run protein window: 30g within 60min'],
   array['Base building phase — 80/20 polarized training model.']),
  ('plan_3', 'c_3', 'Trial Starter Pack', 'approved',
   array['Full Body Assessment','Light Movement','No plan — awaiting upgrade'],
   array['Balanced: 2,000 kcal, 150g protein'],
   ARRAY[]::text[])
on conflict (id) do nothing;

insert into check_ins (id, client_id, submitted_at, weight_kg, energy_score, steps, notes, adherence_score)
values
  ('ci_1', 'c_1', '2026-04-03T08:30:00Z', 68.2, 8,  9860, 'Feeling strong this week!', 92),
  ('ci_2', 'c_2', '2026-04-03T07:15:00Z', 74.1, 4,  3200, 'Hamstring tight, took it easy.', 45),
  ('ci_3', 'c_3', '2026-04-02T09:00:00Z', 61.5, 9, 11200, null, 78)
on conflict (id) do nothing;

insert into subscriptions (id, client_id, status, amount_gbp, renewal_date)
values
  ('sub_1', 'c_1', 'active',   149, '2026-05-01'),
  ('sub_2', 'c_2', 'past_due', 199, '2026-04-15'),
  ('sub_3', 'c_3', 'trialing',  99, '2026-04-10')
on conflict (id) do nothing;

insert into messages (id, coach_id, client_id, sender, content, sent_at)
values
  ('msg_1', 'coach_1', 'c_1', 'coach',  'Great work today! Keep it up.',         '2026-04-03T10:00:00Z'),
  ('msg_2', 'coach_1', 'c_1', 'client', 'Thanks! The session was tough but I loved it.', '2026-04-03T10:15:00Z')
on conflict (id) do nothing;

insert into client_notes (id, coach_id, client_id, content)
values
  ('cn_1', 'coach_1', 'c_1', 'Sophie is making excellent progress. Her adherence has been consistently above 85%. Consider introducing heavier compound lifts next phase.'),
  ('cn_2', 'coach_1', 'c_2', 'Liam has been inconsistent with check-ins. Hamstring issue flagged — refer to physio. Needs extra motivation and accountability calls.'),
  ('cn_3', 'coach_1', 'c_3', 'New client on trial. Great engagement so far. Needs personalised programme to convert to paid.')
on conflict (id) do nothing;

insert into habits (id, client_id, title, target, frequency)
values
  ('h_1', 'c_1', 'Log meals in the app',   1, 'daily'),
  ('h_2', 'c_1', 'Hit 8,000 steps',         1, 'daily'),
  ('h_3', 'c_2', 'Complete weekly check-in', 1, 'weekly')
on conflict (id) do nothing;

insert into exercises (id, name, body_part, equipment, goal, difficulty, instructions)
values
  ('ex_1', 'Barbell Bench Press',   'Chest',      'Barbell',     'Strength',    'intermediate', 'Lie flat, lower bar to mid-chest, press up.'),
  ('ex_2', 'Deadlift',              'Back',       'Barbell',     'Strength',    'intermediate', 'Hip-hinge, drive through heels.'),
  ('ex_3', 'Barbell Back Squat',    'Legs',       'Barbell',     'Hypertrophy', 'intermediate', 'Bar on traps, squat to depth.'),
  ('ex_4', 'Pull-Up',              'Back',       'Bodyweight',  'Strength',    'intermediate', 'Overhand grip, pull chest to bar.'),
  ('ex_5', 'Plank',                'Core',       'Bodyweight',  'Endurance',   'beginner',     'Forearms on floor, hold straight line.')
on conflict (id) do nothing;

insert into recipes (id, name, ingredients, steps, calories, protein_g, carbs_g, fat_g, prep_time, cook_time, tags)
values ('r_1', 'High-Protein Chicken Bowl',
  array['200g chicken breast','150g brown rice','100g broccoli','1 tbsp olive oil','Salt & pepper'],
  array['Season and grill chicken.','Cook rice according to packet.','Steam broccoli.','Combine in bowl.','Drizzle with olive oil.'],
  620, 52, 65, 12, 10, 25, array['meal-prep','high-protein'])
on conflict (id) do nothing;
