create table if not exists public.group_seq (
  group_id        text primary key,
  last_server_seq bigint not null default 0
);

create table if not exists public.messages (
  group_id    text not null,
  server_seq  bigint not null,
  server_time timestamptz not null default now(),
  sender_id   text not null,
  device_id   text not null references public.devices(device_id),
  msg_kind    text not null,
  mls_bytes   text not null,
  primary key (group_id, server_seq)
);

