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
  notes         text
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
  created_at  timestamptz not null default now()
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
   array[])
on conflict (id) do nothing;

insert into check_ins (id, client_id, submitted_at, weight_kg, energy_score, steps, notes)
values
  ('ci_1', 'c_1', '2026-04-03T08:30:00Z', 68.2, 8,  9860, 'Feeling strong this week!'),
  ('ci_2', 'c_2', '2026-04-03T07:15:00Z', 74.1, 4,  3200, 'Hamstring tight, took it easy.'),
  ('ci_3', 'c_3', '2026-04-02T09:00:00Z', 61.5, 9, 11200, null)
on conflict (id) do nothing;

insert into subscriptions (id, client_id, status, amount_gbp, renewal_date)
values
  ('sub_1', 'c_1', 'active',   149, '2026-05-01'),
  ('sub_2', 'c_2', 'past_due', 199, '2026-04-15'),
  ('sub_3', 'c_3', 'trialing',  99, '2026-04-10')
on conflict (id) do nothing;

insert into messages (id, client_id, sender, content, sent_at)
values
  ('msg_1', 'c_1', 'coach',  'Great work today! Keep it up.',         '2026-04-03T10:00:00Z'),
  ('msg_2', 'c_1', 'client', 'Thanks! The session was tough but I loved it.', '2026-04-03T10:15:00Z')
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
