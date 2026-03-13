create table if not exists messages (
  id bigserial primary key,
  from_username text not null,
  to_username text not null,
  content text not null default '',
  read boolean default false,
  created_at timestamptz default now()
);

alter table messages disable row level security;

create index if not exists messages_from_idx on messages (from_username);
create index if not exists messages_to_idx on messages (to_username);
