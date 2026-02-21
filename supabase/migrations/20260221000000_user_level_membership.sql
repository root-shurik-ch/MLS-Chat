-- Migration: user-level group membership + remove mls_private_key_enc from devices
--
-- 1. Fix messages CASCADE DELETE so deleting a group also removes its messages.
-- 2. Migrate group_members from device_id to user_id (user-level membership).
-- 3. Remove mls_private_key_enc from devices (key is now derived client-side from PRF via HKDF).
-- 4. Add is_group_member() helper for clean membership checks in edge functions.
-- 5. Fix messages sender_id / device_id to reference users instead of devices,
--    since messages now carry the text user_id as sender_id.

-- 1. Fix messages CASCADE DELETE
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_group_id_fkey,
  ADD CONSTRAINT messages_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE;

-- Also drop the FK constraints on sender_id/device_id that reference devices,
-- since after this migration sender_id stores user_id (text), not device_id.
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
  DROP CONSTRAINT IF EXISTS messages_device_id_fkey;

-- 2. Migrate group_members from device_id to user_id
CREATE TABLE group_members_new (
  group_id text NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  user_id  text NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'member',
  PRIMARY KEY (group_id, user_id)
);

INSERT INTO group_members_new (group_id, user_id, role)
  SELECT DISTINCT gm.group_id, d.user_id, gm.role
  FROM group_members gm JOIN devices d ON gm.device_id = d.device_id;

DROP TABLE group_members;
ALTER TABLE group_members_new RENAME TO group_members;

-- 3. Remove mls_private_key_enc from devices
--    (The column is named mls_sk_enc in the actual schema)
ALTER TABLE devices DROP COLUMN IF EXISTS mls_sk_enc;

-- 4. Helper function for membership checks in edge functions
CREATE OR REPLACE FUNCTION is_group_member(p_group_id text, p_user_id text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$ LANGUAGE sql STABLE;
