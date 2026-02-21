-- Migration: invite flow via shareable link
--
-- Adds `invites` table to support the new link-based invite flow:
--   Admin creates invite → shares URL → Joiner clicks link → auto-joins
-- Server only stores public KP bytes and encrypted Welcome (E2E encryption preserved).

CREATE TABLE invites (
  invite_id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_id    TEXT NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  group_name  TEXT NOT NULL,
  inviter_id  TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  joiner_id   TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  kp_hex      TEXT,           -- set when joiner submits KP
  welcome_hex TEXT,           -- set when inviter delivers Welcome
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);
-- status: 'pending' | 'kp_submitted' | 'complete'
