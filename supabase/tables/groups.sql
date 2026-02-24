create table if not exists public.groups (
  group_id   text primary key,
  name       text not null,
  avatar_url text,
  ds_url     text not null,
  creator_id text not null references public.users(user_id) on delete cascade
);

create table if not exists public.group_members (
  group_id text not null references public.groups(group_id) on delete cascade,
  user_id  text not null references public.users(user_id)   on delete cascade,
  role     text not null default 'member',
  primary key (group_id, user_id)
);

