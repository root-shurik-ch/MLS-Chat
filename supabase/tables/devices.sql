create table if not exists public.devices (
  device_id text primary key,
  user_id text not null references public.users(user_id) on delete cascade,
  mls_pk text not null,
  mls_sk_enc text not null
);