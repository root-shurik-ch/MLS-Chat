create table if not exists public.key_packages (
  key_package_hash text primary key,
  device_id text not null references public.devices(device_id) on delete cascade,
  key_package_data text not null
);