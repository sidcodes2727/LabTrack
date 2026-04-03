create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('student', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type asset_status as enum ('working', 'faulty', 'maintenance');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type complaint_status as enum ('pending', 'in_progress', 'resolved');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type priority_level as enum ('Low', 'Medium', 'High');
exception when duplicate_object then null;
end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  role user_role not null default 'student',
  created_at timestamptz default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  system_id text unique not null,
  original_id text unique not null,
  lab text not null,
  section text not null,
  row_num int not null,
  position int not null,
  status asset_status not null default 'working',
  cpu text not null,
  ram text not null,
  purchase_date date not null,
  last_maintenance date not null,
  created_at timestamptz default now()
);

create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  description text not null,
  priority priority_level not null default 'Medium',
  ai_priority priority_level,
  image_url text,
  status complaint_status not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  event_type text not null,
  details text not null,
  event_date timestamptz not null default now(),
  created_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  role_target user_role,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_assets_lab_section on assets(lab, section);
create index if not exists idx_assets_system_original on assets(system_id, original_id);
create index if not exists idx_complaints_status_priority on complaints(status, priority);
create index if not exists idx_complaints_created_at on complaints(created_at);

insert into storage.buckets (id, name, public)
values ('complaint-images', 'complaint-images', true)
on conflict (id) do nothing;
