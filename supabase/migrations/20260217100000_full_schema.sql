-- Full schema: users -> devices -> challenges -> groups (+ group_members) -> group_seq, messages, send_message

create table if not exists public.users (
  user_id               text primary key,
  display_name          text not null,
  avatar_url            text,
  passkey_credential_id text not null unique,
  passkey_public_key    text not null
);

create table if not exists public.devices (
  device_id text primary key,
  user_id text not null references public.users(user_id) on delete cascade,
  mls_pk text not null,
  mls_sk_enc text not null
);

create table if not exists public.challenges (
  challenge_id text primary key,
  challenge text not null,
  action text not null,
  created_at timestamptz not null default now(),
  ttl int not null default 300000
);

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

create table if not exists public.group_seq (
  group_id        text primary key,
  last_server_seq bigint not null default 0
);

create table if not exists public.messages (
  group_id    text not null references public.groups(group_id),
  server_seq  bigint not null,
  server_time timestamptz not null default now(),
  sender_id   text not null references public.devices(device_id),
  device_id   text not null references public.devices(device_id),
  msg_kind    text not null,
  mls_bytes   text not null,
  primary key (group_id, server_seq)
);

create or replace function send_message(
  p_group_id text,
  p_sender_id text,
  p_device_id text,
  p_msg_kind text,
  p_mls_bytes text
) returns table(server_seq bigint, server_time bigint) as $$
declare
  v_server_seq bigint;
  v_server_time bigint;
begin
  select last_server_seq into v_server_seq from group_seq where group_id = p_group_id for update;
  if not found then
    v_server_seq := 0;
    insert into group_seq (group_id, last_server_seq) values (p_group_id, 1);
    v_server_seq := 1;
  else
    v_server_seq := v_server_seq + 1;
    update group_seq set last_server_seq = v_server_seq where group_id = p_group_id;
  end if;

  insert into messages (group_id, server_seq, sender_id, device_id, msg_kind, mls_bytes)
  values (p_group_id, v_server_seq, p_sender_id, p_device_id, p_msg_kind, p_mls_bytes)
  returning (extract(epoch from server_time) * 1000)::bigint into v_server_time;

  return query select v_server_seq, v_server_time;
end;
$$ language plpgsql;
