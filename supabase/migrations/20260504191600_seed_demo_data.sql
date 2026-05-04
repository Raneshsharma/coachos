insert into organizations (
  id, name, brand_color, accent_color, hero_message, stripe_connected, parallel_run_days_left, plan, status
) values (
  'ws_uk_1',
  'Thrive by Jake',
  '#123f2d',
  '#ff8757',
  'Built for coaches who take their clients'' results seriously.',
  true,
  5,
  'demo',
  'active'
) on conflict (id) do update set
  name = excluded.name,
  brand_color = excluded.brand_color,
  accent_color = excluded.accent_color,
  hero_message = excluded.hero_message,
  stripe_connected = excluded.stripe_connected,
  parallel_run_days_left = excluded.parallel_run_days_left,
  updated_at = now();

insert into profiles (id, organization_id, display_name, email, role, status)
values
  ('profile_coach_1', 'ws_uk_1', 'Jake Morgan', 'jake@coachos.demo', 'coach', 'active'),
  ('profile_client_1', 'ws_uk_1', 'Sophie Patel', 'sophie@example.com', 'client', 'active'),
  ('profile_client_2', 'ws_uk_1', 'Liam Carter', 'liam@example.com', 'client', 'active'),
  ('profile_client_3', 'ws_uk_1', 'Ava Thompson', 'ava@example.com', 'client', 'active')
on conflict (id) do update set
  display_name = excluded.display_name,
  email = excluded.email,
  role = excluded.role,
  status = excluded.status;

insert into coaches (id, organization_id, profile_id, first_name, last_name, email, gender, timezone)
values ('coach_1', 'ws_uk_1', 'profile_coach_1', 'Jake', 'Morgan', 'jake@coachos.demo', 'male', 'Europe/London')
on conflict (id) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  gender = excluded.gender;

insert into clients (
  id, organization_id, profile_id, full_name, email, goal, status, adherence_score,
  current_plan_id, monthly_price_gbp, next_renewal_date, last_checkin_date,
  health_conditions, daily_water_target, daily_steps_target, supplements,
  nutrition_calories, nutrition_protein_g, nutrition_fat_g, nutrition_carbs_g,
  nutrition_coach_note
) values
  (
    'client_1', 'ws_uk_1', 'profile_client_1', 'Sophie Patel', 'sophie@example.com',
    'Lose 8kg while rebuilding training consistency', 'active', 84, 'plan_1', 199, '2026-04-10', '2026-04-02',
    '[{"label":"Previous knee injury","note":"Avoid deep squats"}]'::jsonb, 3, 10000,
    '["Vitamin D3","Whey Protein"]'::jsonb, 2150, 160, 65, 260,
    'Prioritise protein at every meal to support muscle repair.'
  ),
  (
    'client_2', 'ws_uk_1', 'profile_client_2', 'Liam Carter', 'liam@example.com',
    'Drop body fat for summer while keeping strength', 'at_risk', 42, 'plan_2', 149, '2026-04-05', '2026-03-29',
    '[{"label":"Lower back stiffness","note":"Avoid deadlifts until cleared"}]'::jsonb, 3, 8000,
    '["Creatine","Omega-3"]'::jsonb, 2400, 200, 80, 240,
    'Keep carbs around workouts only to support fat loss.'
  ),
  (
    'client_3', 'ws_uk_1', 'profile_client_3', 'Ava Thompson', 'ava@example.com',
    'Return to training after pregnancy with low-pressure routines', 'trial', 71, null, 129, '2026-04-18', null,
    '[{"label":"Post-pregnancy","note":"Clearance needed for core-heavy work"}]'::jsonb, 2, 6000,
    '["Prenatal Multivitamin","Iron"]'::jsonb, 2000, 90, 65, 250,
    'Focus on nutrient-dense whole foods. No calorie deficit yet.'
  )
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  goal = excluded.goal,
  status = excluded.status,
  adherence_score = excluded.adherence_score,
  current_plan_id = excluded.current_plan_id,
  monthly_price_gbp = excluded.monthly_price_gbp,
  next_renewal_date = excluded.next_renewal_date,
  last_checkin_date = excluded.last_checkin_date,
  health_conditions = excluded.health_conditions,
  daily_water_target = excluded.daily_water_target,
  daily_steps_target = excluded.daily_steps_target,
  supplements = excluded.supplements,
  nutrition_calories = excluded.nutrition_calories,
  nutrition_protein_g = excluded.nutrition_protein_g,
  nutrition_fat_g = excluded.nutrition_fat_g,
  nutrition_carbs_g = excluded.nutrition_carbs_g,
  nutrition_coach_note = excluded.nutrition_coach_note,
  updated_at = now();

insert into coach_clients (coach_id, client_id)
values ('coach_1', 'client_1'), ('coach_1', 'client_2'), ('coach_1', 'client_3')
on conflict (coach_id, client_id) do nothing;

insert into plans (id, client_id, coach_id, title, latest_version)
values
  (
    'plan_1', 'client_1', 'coach_1', 'Sophie Fat Loss Reset',
    '{"id":"plan_1_v2","planId":"plan_1","versionNumber":2,"status":"approved","explanation":["Training volume stayed high because Sophie hit 5 of 6 sessions last week.","Calories remain moderate deficit after energy score improved to 7/10."],"workouts":["3 gym sessions focused on lower-body strength and upper-body pull volume","2 incline-walk cardio blocks at 25 minutes","Daily step target: 9,000"],"nutrition":["Calories: 1,850 per day","Protein: 135g minimum","Weekend meal out: 1 flexible meal, no calorie banking"],"updatedAt":"2026-04-02T08:00:00.000Z"}'::jsonb
  ),
  (
    'plan_2', 'client_2', 'coach_1', 'Liam Compliance Rescue',
    '{"id":"plan_2_v1","planId":"plan_2","versionNumber":1,"status":"draft","explanation":["Risk score is high because Liam missed 2 check-ins and logged low energy.","The draft lowers complexity to rebuild adherence before pushing intensity."],"workouts":["2 full-body sessions instead of 4 split sessions","10-minute daily walk after lunch","1 optional weekend conditioning block"],"nutrition":["Calories: 2,100 per day","Protein: 160g minimum","Replace two takeaway lunches with prepared wraps"],"updatedAt":"2026-04-03T07:45:00.000Z"}'::jsonb
  )
on conflict (id) do update set
  title = excluded.title,
  latest_version = excluded.latest_version,
  updated_at = now();

insert into check_ins (id, client_id, submitted_at, progress, photo_count)
values
  ('checkin_1', 'client_1', '2026-04-02T07:30:00.000Z', '{"weightKg":73.4,"energyScore":7,"steps":10220,"waistCm":78,"adherenceScore":86,"notes":"Felt good all week and hit every session."}'::jsonb, 2),
  ('checkin_2', 'client_2', '2026-03-29T08:00:00.000Z', '{"weightKg":92.1,"energyScore":4,"steps":4100,"waistCm":null,"adherenceScore":38,"notes":"Travel week. Missed sessions and meals were messy."}'::jsonb, 0)
on conflict (id) do update set progress = excluded.progress, photo_count = excluded.photo_count;

insert into subscriptions (id, client_id, status, amount_gbp, renewal_date)
values
  ('sub_client_1', 'client_1', 'active', 199, '2026-04-10'),
  ('sub_client_2', 'client_2', 'past_due', 149, '2026-04-05'),
  ('sub_client_3', 'client_3', 'trialing', 129, '2026-04-18')
on conflict (id) do update set status = excluded.status, amount_gbp = excluded.amount_gbp, renewal_date = excluded.renewal_date;

insert into messages (id, client_id, coach_id, sender, content, sent_at, read_at)
values
  ('msg_1', 'client_1', 'coach_1', 'coach', 'Hey Sophie, let''s crush the nutrition goals this week!', '2026-04-03T08:00:00.000Z', '2026-04-03T08:30:00.000Z'),
  ('msg_2', 'client_1', 'coach_1', 'client', 'On it! Just prepared my meals.', '2026-04-03T08:45:00.000Z', '2026-04-03T09:00:00.000Z')
on conflict (id) do update set content = excluded.content, read_at = excluded.read_at;

insert into habits (id, client_id, title, target, frequency, created_at)
values
  ('habit_1', 'client_1', 'Log meals in the app', 1, 'daily', '2026-04-01T00:00:00.000Z'),
  ('habit_2', 'client_1', 'Hit 8,000 steps', 8000, 'daily', '2026-04-01T00:00:00.000Z'),
  ('habit_3', 'client_1', 'Complete weekly check-in', 1, 'weekly', '2026-04-01T00:00:00.000Z'),
  ('habit_4', 'client_2', 'Log meals in the app', 1, 'daily', '2026-04-01T00:00:00.000Z'),
  ('habit_5', 'client_2', 'Hit 5,000 steps', 5000, 'daily', '2026-04-01T00:00:00.000Z'),
  ('habit_6', 'client_2', 'Submit check-in on Friday', 1, 'weekly', '2026-04-01T00:00:00.000Z'),
  ('habit_7', 'client_3', 'Log meals in the app', 1, 'daily', '2026-04-01T00:00:00.000Z'),
  ('habit_8', 'client_3', 'Complete a workout', 3, 'weekly', '2026-04-01T00:00:00.000Z')
on conflict (id) do update set title = excluded.title, target = excluded.target, frequency = excluded.frequency;

insert into habit_completions (id, habit_id, date, completed)
values
  ('hc_1', 'habit_1', '2026-04-01', true),
  ('hc_2', 'habit_2', '2026-04-01', true),
  ('hc_3', 'habit_1', '2026-04-02', true),
  ('hc_4', 'habit_2', '2026-04-02', true),
  ('hc_5', 'habit_1', '2026-04-03', true),
  ('hc_6', 'habit_2', '2026-04-03', false),
  ('hc_7', 'habit_4', '2026-04-01', false),
  ('hc_8', 'habit_5', '2026-04-01', true)
on conflict (habit_id, date) do update set completed = excluded.completed;

insert into analytics_events (name, actor_id, occurred_at, metadata)
select 'coach_onboarded', 'coach_1', '2026-04-03T09:00:00.000Z', '{"workspace":"Thrive by Jake"}'::jsonb
where not exists (
  select 1 from analytics_events
  where name = 'coach_onboarded'
    and actor_id = 'coach_1'
    and occurred_at = '2026-04-03T09:00:00.000Z'
);

insert into metric_definitions (id, organization_id, key, name, unit, data_type, aggregation_type)
values
  ('metric_weight_kg', 'ws_uk_1', 'weight_kg', 'Weight', 'kg', 'number', 'latest'),
  ('metric_energy_score', 'ws_uk_1', 'energy_score', 'Energy Score', '/10', 'number', 'avg'),
  ('metric_steps', 'ws_uk_1', 'steps', 'Steps', 'steps', 'number', 'sum'),
  ('metric_adherence_score', 'ws_uk_1', 'adherence_score', 'Adherence', '%', 'number', 'latest')
on conflict (organization_id, key) do update set name = excluded.name, unit = excluded.unit;

insert into page_definitions (id, organization_id, slug, name, page_type)
values
  ('page_morning_dashboard', 'ws_uk_1', 'morning-dashboard', 'Morning Dashboard', 'coach_dashboard'),
  ('page_client_progress', 'ws_uk_1', 'client-progress', 'Client Progress', 'client_dashboard')
on conflict (organization_id, slug) do update set name = excluded.name, page_type = excluded.page_type;

insert into page_widgets (id, page_definition_id, metric_definition_id, position, widget_type, config_json)
values
  ('widget_weight', 'page_client_progress', 'metric_weight_kg', 1, 'metric_card', '{"chart":"line"}'::jsonb),
  ('widget_energy', 'page_client_progress', 'metric_energy_score', 2, 'metric_card', '{"chart":"bar"}'::jsonb),
  ('widget_steps', 'page_morning_dashboard', 'metric_steps', 1, 'metric_card', '{"chart":"summary"}'::jsonb)
on conflict (id) do update set position = excluded.position, config_json = excluded.config_json;
