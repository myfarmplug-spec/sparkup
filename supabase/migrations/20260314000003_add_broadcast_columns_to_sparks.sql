-- Broadcast / scheduling columns (used by admin broadcast tab and feed filtering)
alter table sparks add column if not exists target_country       text default '';
alter table sparks add column if not exists target_state         text default '';
alter table sparks add column if not exists broadcast_freq_type  text default '';
alter table sparks add column if not exists broadcast_freq_value integer default 0;
alter table sparks add column if not exists broadcast_max_per_day integer default 0;
alter table sparks add column if not exists broadcast_expires_at  timestamptz;
