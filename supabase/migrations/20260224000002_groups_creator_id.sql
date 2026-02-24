-- Migration: add creator_id to groups table
--
-- Tracks which user created the group so that only the creator
-- can delete it (enforced in the group_delete Edge Function).
-- Added as nullable to avoid breaking existing rows; new groups
-- must supply creator_id on insert.

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS creator_id text
  REFERENCES public.users(user_id) ON DELETE CASCADE;
