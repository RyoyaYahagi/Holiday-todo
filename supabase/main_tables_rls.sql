-- メインテーブル定義とRLSポリシー
-- Supabase SQL Editorで実行してください。

create extension if not exists pgcrypto;

create table if not exists public.task_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#6B7280',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  sort_order integer
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  priority integer check (priority between 1 and 5),
  created_at timestamptz not null default now(),
  schedule_type text not null default 'priority',
  manual_scheduled_time timestamptz,
  recurrence jsonb,
  list_id uuid references public.task_lists(id) on delete set null
);

create table if not exists public.scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  priority integer check (priority between 1 and 5),
  scheduled_time timestamptz not null,
  is_completed boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  schedule_type text not null default 'priority',
  manual_scheduled_time timestamptz,
  recurrence jsonb,
  recurrence_source_id uuid,
  list_id uuid references public.task_lists(id) on delete set null
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  event_type text not null
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notification_method text not null default 'line',
  line_user_id text not null default '',
  discord_webhook_url text not null default '',
  notify_on_day_before boolean not null default true,
  notify_day_before_time text not null default '21:00',
  notify_before_task boolean not null default true,
  notify_before_task_minutes integer not null default 30,
  max_priority integer not null default 5,
  schedule_interval integer not null default 2,
  start_time_morning integer not null default 8,
  start_time_afternoon integer not null default 13,
  max_tasks_per_day integer not null default 3
);

alter table public.task_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.scheduled_tasks enable row level security;
alter table public.events enable row level security;
alter table public.settings enable row level security;

drop policy if exists task_lists_owner_select on public.task_lists;
drop policy if exists task_lists_owner_insert on public.task_lists;
drop policy if exists task_lists_owner_update on public.task_lists;
drop policy if exists task_lists_owner_delete on public.task_lists;
create policy task_lists_owner_select on public.task_lists for select using (auth.uid() = user_id);
create policy task_lists_owner_insert on public.task_lists for insert with check (auth.uid() = user_id);
create policy task_lists_owner_update on public.task_lists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy task_lists_owner_delete on public.task_lists for delete using (auth.uid() = user_id);

drop policy if exists tasks_owner_select on public.tasks;
drop policy if exists tasks_owner_insert on public.tasks;
drop policy if exists tasks_owner_update on public.tasks;
drop policy if exists tasks_owner_delete on public.tasks;
create policy tasks_owner_select on public.tasks for select using (auth.uid() = user_id);
create policy tasks_owner_insert on public.tasks for insert with check (auth.uid() = user_id);
create policy tasks_owner_update on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_owner_delete on public.tasks for delete using (auth.uid() = user_id);

drop policy if exists scheduled_tasks_owner_select on public.scheduled_tasks;
drop policy if exists scheduled_tasks_owner_insert on public.scheduled_tasks;
drop policy if exists scheduled_tasks_owner_update on public.scheduled_tasks;
drop policy if exists scheduled_tasks_owner_delete on public.scheduled_tasks;
create policy scheduled_tasks_owner_select on public.scheduled_tasks for select using (auth.uid() = user_id);
create policy scheduled_tasks_owner_insert on public.scheduled_tasks for insert with check (auth.uid() = user_id);
create policy scheduled_tasks_owner_update on public.scheduled_tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy scheduled_tasks_owner_delete on public.scheduled_tasks for delete using (auth.uid() = user_id);

drop policy if exists events_owner_select on public.events;
drop policy if exists events_owner_insert on public.events;
drop policy if exists events_owner_update on public.events;
drop policy if exists events_owner_delete on public.events;
create policy events_owner_select on public.events for select using (auth.uid() = user_id);
create policy events_owner_insert on public.events for insert with check (auth.uid() = user_id);
create policy events_owner_update on public.events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy events_owner_delete on public.events for delete using (auth.uid() = user_id);

drop policy if exists settings_owner_select on public.settings;
drop policy if exists settings_owner_insert on public.settings;
drop policy if exists settings_owner_update on public.settings;
drop policy if exists settings_owner_delete on public.settings;
create policy settings_owner_select on public.settings for select using (auth.uid() = user_id);
create policy settings_owner_insert on public.settings for insert with check (auth.uid() = user_id);
create policy settings_owner_update on public.settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy settings_owner_delete on public.settings for delete using (auth.uid() = user_id);
