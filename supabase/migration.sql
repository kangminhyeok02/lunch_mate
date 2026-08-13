-- LUNCH MATE — schema
-- Run this in Supabase Studio → SQL Editor → New query → Run.
--
-- 여러 번 실행해도 안전하다. 이미 있는 것은 만들지 않고, 잠금도 잡지 않는다.
-- 서비스가 돌고 있는 중에도 실행할 수 있다.

-- 다른 트랜잭션에 막히면 데드락으로 끌려가지 말고 빨리 실패하게 한다.
-- 이 오류가 보이면 그냥 다시 Run 하면 된다.
set lock_timeout = '5s';

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

-- One answer per person per day, shown to the rest of their table.
create table if not exists question_answers (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  group_id    text not null references lunch_groups(id) on delete cascade,
  user_id     text not null references users(id) on delete cascade,
  question_id text,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Makes re-submitting an edit rather than a second answer.
create unique index if not exists question_answers_user_date_key
  on question_answers (user_id, date);
create index if not exists question_answers_group_idx on question_answers (group_id);

-- 조원 답변에 다는 가벼운 반응. 같은 사람이 같은 반응을 두 번 달면 취소된다.
create table if not exists answer_reactions (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  answer_id  uuid not null references question_answers(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  kind       text not null check (kind in ('LIKE','HEART','LAUGH')),
  created_at timestamptz not null default now(),
  unique (answer_id, user_id, kind)
);

create index if not exists answer_reactions_date_idx on answer_reactions (date);

-- Day lifecycle: NOT_STARTED → COLLECTING → READY_TO_ASSIGN → ASSIGNING → ASSIGNED
create table if not exists lunch_days (
  date       date primary key,
  status     text not null default 'NOT_STARTED'
             check (status in ('NOT_STARTED','COLLECTING','READY_TO_ASSIGN','ASSIGNING','ASSIGNED')),
  -- 관리자가 "전원 답변" 조건을 건너뛰고 미션을 연 경우.
  missions_unlocked boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 이 컬럼이 생기기 전에 만들어진 데이터베이스를 위한 보강.
-- ALTER TABLE 은 바꿀 것이 없어도 AccessExclusiveLock 을 잡는다. 앱이 돌고
-- 있는 동안 재실행하면 그 잠금이 데드락의 원인이 되므로, 실제로 없을 때만 건다.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lunch_days'
      and column_name = 'missions_unlocked'
  ) then
    alter table lunch_days
      add column missions_unlocked boolean not null default false;
  end if;
end $$;

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

-- 이 블록은 "없는 것만 만든다". 이미 맞게 설정된 테이블은 건드리지 않으므로
-- 재실행해도 잠금을 잡지 않는다. 예전 방식(매번 drop 후 create)은 정책이
-- 멀쩡해도 DROP POLICY 가 AccessExclusiveLock 을 요구해서, 앱이 읽고 있는
-- 도중에 실행하면 데드락(40P01)이 났다.
do $$
declare
  t text;
begin
  foreach t in array array[
    'users','menu_options','lunch_preferences','questions',
    'missions','lunch_groups','lunch_group_members','lunch_days',
    'question_answers','answer_reactions'
  ]
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relrowsecurity
    ) then
      execute format('alter table %I enable row level security', t);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = t || '_anon_all'
    ) then
      execute format(
        'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
        t || '_anon_all', t
      );
    end if;
  end loop;
end $$;

-- Realtime: let clients watch assignment status, group creation, and answers.
-- 여기도 이미 등록된 테이블은 건드리지 않는다. 재시도로 걸리는 잠금을 없애려는 것.
do $$
declare
  t text;
begin
  foreach t in array array[
    'lunch_days','lunch_groups','lunch_preferences','question_answers','answer_reactions'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
