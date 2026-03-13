alter table profiles add column if not exists birth_month integer default 0;
alter table profiles add column if not exists birth_day integer default 1;
