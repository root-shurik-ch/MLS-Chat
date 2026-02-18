create table if not exists public.challenges (
  challenge_id text primary key,
  challenge text not null,
  action text not null,
  created_at timestamptz not null default now(),
  ttl int not null default 300000
);