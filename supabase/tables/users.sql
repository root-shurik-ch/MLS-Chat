create table if not exists public.users (
  user_id               text primary key,
  display_name          text not null,
  avatar_url            text,
  passkey_credential_id text not null unique,
  passkey_public_key    text not null
);