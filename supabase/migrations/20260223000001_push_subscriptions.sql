-- Migration: Web Push subscription storage
--
-- Stores browser push subscriptions per device for Web Push Notifications.
-- UNIQUE on device_id so upserts on re-registration are safe.

CREATE TABLE push_subscriptions (
  sub_id     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  device_id  TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (device_id)
);
