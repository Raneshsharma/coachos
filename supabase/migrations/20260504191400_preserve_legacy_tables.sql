do $$
begin
  if to_regclass('public.clients') is not null
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'organization_id') then
    alter table clients rename to legacy_clients_20260504;
  end if;

  if to_regclass('public.coaches') is not null
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'coaches' and column_name = 'organization_id') then
    alter table coaches rename to legacy_coaches_20260504;
  end if;

  if to_regclass('public.plans') is not null
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'plans' and column_name = 'latest_version') then
    alter table plans rename to legacy_plans_20260504;
  end if;

  if to_regclass('public.check_ins') is not null
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'check_ins' and column_name = 'progress') then
    alter table check_ins rename to legacy_check_ins_20260504;
  end if;

  if to_regclass('public.subscriptions') is not null
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'updated_at') then
    alter table subscriptions rename to legacy_subscriptions_20260504;
  end if;

  if to_regclass('public.messages') is not null
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'read_at') then
    alter table messages rename to legacy_messages_20260504;
  end if;

  if to_regclass('public.group_programs') is not null
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'group_programs' and column_name = 'title') then
    alter table group_programs rename to legacy_group_programs_20260504;
  end if;

  if to_regclass('public.body_metrics') is not null
    and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'body_metrics' and column_name = 'date') then
    alter table body_metrics rename to legacy_body_metrics_20260504;
  end if;

  if to_regclass('public.client_notes') is not null then
    alter table client_notes rename to legacy_client_notes_20260504;
  end if;

  if to_regclass('public.habit_completions') is not null then
    alter table habit_completions rename to legacy_habit_completions_20260504;
  end if;

  if to_regclass('public.habits') is not null then
    alter table habits rename to legacy_habits_20260504;
  end if;
end $$;
