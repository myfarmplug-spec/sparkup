-- Analytics events table (used by admin dashboard and visit tracking)
create table if not exists analytics_events (
  id         bigserial primary key,
  event_type text not null,
  user_id    text default '',
  username   text default '',
  country    text default '',
  state      text default '',
  city       text default '',
  metadata   jsonb default '{}',
  created_at timestamptz default now()
);
alter table analytics_events disable row level security;
create index if not exists idx_analytics_created on analytics_events(created_at desc);

-- Reports / feedback table (used by admin dashboard and report modal)
create table if not exists reports (
  id             bigserial primary key,
  from_username  text not null,
  user_id        text default '',
  subject        text default '',
  body           text not null,
  status         text default 'open',
  admin_reply    text default '',
  created_at     timestamptz default now(),
  replied_at     timestamptz
);
alter table reports disable row level security;
