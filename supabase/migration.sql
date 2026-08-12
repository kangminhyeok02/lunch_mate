-- LUNCH MATE — schema
-- Run this in Supabase Studio → SQL Editor → New query → Run.

create table if not exists users (
  id          text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists menu_options (
  id          text not null,
  date        date not null,
  name        text not null,
  description text,
  emoji       text,
  image_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (id, date)
);

create table if not exists lunch_preferences (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references users(id) on delete cascade,
  menu_choice  text not null,
  eating_speed text not null check (eating_speed in ('SLOW', 'NORMAL', 'FAST')),
  date         date not null,
  created_at   timestamptz not null default now()
);

-- This index is what actually prevents double submission (spec section 17).
create unique index if not exists lunch_preferences_user_date_key
  on lunch_preferences (user_id, date);

create table if not exists questions (
  id       text primary key,
  category text not null,
  content  text not null,
  active   boolean not null default true
);

create table if not exists missions (
  id      text primary key,
  content text not null,
  active  boolean not null default true
);

create table if not exists lunch_groups (
  id              text primary key,
  date            date not null,
  group_number    integer not null,
  question_id     text,
  mission_id      text,
  matching_points jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  unique (date, group_number)
);

create table if not exists lunch_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   text not null references lunch_groups(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

-- Day lifecycle: NOT_STARTED → COLLECTING → READY_TO_ASSIGN → ASSIGNING → ASSIGNED
create table if not exists lunch_days (
  date       date primary key,
  status     text not null default 'NOT_STARTED'
             check (status in ('NOT_STARTED','COLLECTING','READY_TO_ASSIGN','ASSIGNING','ASSIGNED')),
  updated_at timestamptz not null default now()
);

create index if not exists lunch_preferences_date_idx on lunch_preferences (date);
create index if not exists lunch_groups_date_idx on lunch_groups (date);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- The app talks to Supabase only from the server (server actions / route
-- handlers) and gates the admin screen behind ADMIN_PASSWORD. The policies
-- below let the anon key run the event out of the box.
--
-- To harden: set SUPABASE_SERVICE_ROLE_KEY in the server environment, then
-- replace the write policies below with `to service_role`. The app already
-- prefers the service role key when present.
-- ---------------------------------------------------------------------------

alter table users               enable row level security;
alter table menu_options        enable row level security;
alter table lunch_preferences   enable row level security;
alter table questions           enable row level security;
alter table missions            enable row level security;
alter table lunch_groups        enable row level security;
alter table lunch_group_members enable row level security;
alter table lunch_days          enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users','menu_options','lunch_preferences','questions',
    'missions','lunch_groups','lunch_group_members','lunch_days'
  ]
  loop
    execute format('drop policy if exists %I on %I', t || '_anon_all', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_anon_all', t
    );
  end loop;
end $$;

-- Realtime: let clients watch assignment status and group creation.
alter publication supabase_realtime add table lunch_days;
alter publication supabase_realtime add table lunch_groups;
alter publication supabase_realtime add table lunch_preferences;
