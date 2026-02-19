-- user_id is the only name (human-readable, unique). Drop display_name if present.
alter table if exists public.users drop column if exists display_name;
