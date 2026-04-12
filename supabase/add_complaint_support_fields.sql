alter table complaints
  add column if not exists support_count int not null default 0;

alter table complaints
  add column if not exists supporter_ids uuid[] not null default '{}'::uuid[];

create index if not exists idx_complaints_asset_status_created on complaints(asset_id, status, created_at desc);
