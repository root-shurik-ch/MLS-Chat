create table if not exists public.groups (
  group_id   text primary key,
  name       text not null,
  avatar_url text,
  ds_url     text not null
);

create table if not exists public.group_members (
  group_id text not null references public.groups(group_id) on delete cascade,
  device_id  text not null references public.devices(device_id) on delete cascade,
  role     text not null default 'member',
  primary key (group_id, device_id)
);

