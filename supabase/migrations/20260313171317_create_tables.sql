create table if not exists profiles (
  id text primary key,
  name text not null default '',
  username text unique not null,
  country text default '',
  state text default '',
  city text default '',
  birth_year integer,
  gender text default '',
  occupation text default '',
  profile_pic_url text default '',
  show_age boolean default true,
  bio text default '',
  coins integer default 1000,
  created_at timestamptz default now()
);

create table if not exists sparks (
  id bigint primary key,
  user_id text not null,
  name text not null default '',
  username text not null default '',
  profile_pic_url text default '',
  caption text default '',
  media_url text default '',
  media_type text default 'image',
  reach text default 'share',
  spark_type text default 'new',
  journey_id text not null default '',
  linked_spark_id bigint,
  reactions jsonb default '{"Encourage":0,"Say Hi":0,"Applaud":0,"Keep Going":0}'::jsonb,
  reacted_by jsonb default '{"Encourage":[],"Say Hi":[],"Applaud":[],"Keep Going":[]}'::jsonb,
  created_at timestamptz default now()
);

alter table profiles disable row level security;
alter table sparks disable row level security;

insert into storage.buckets (id, name, public)
  values ('spark-media', 'spark-media', true) on conflict do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Public read spark-media' and tablename = 'objects') then
    create policy "Public read spark-media" on storage.objects for select using (bucket_id = 'spark-media');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Anon upload spark-media' and tablename = 'objects') then
    create policy "Anon upload spark-media" on storage.objects for insert with check (bucket_id = 'spark-media');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Anon update spark-media' and tablename = 'objects') then
    create policy "Anon update spark-media" on storage.objects for update using (bucket_id = 'spark-media');
  end if;
end $$;
