-- Migration: allow any group member to process pending invites
--
-- Adds claim columns to invites (prevents two members processing the same invite in parallel).
-- Adds RPC claim_invite (atomic claim with 2-min stale timeout).
-- Adds RPC get_pending_invites_for_member (replaces inviter_id filter in invite_pending).

ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS commit_hex  TEXT,
  ADD COLUMN IF NOT EXISTS claimed_by  TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ;

-- Atomic claim: sets claimed_by WHERE unclaimed OR claim is stale (>2 min).
-- Returns TRUE if this caller won the race, FALSE if someone else holds it.
CREATE OR REPLACE FUNCTION claim_invite(p_invite_id TEXT, p_user_id TEXT)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_updated INT;
BEGIN
  UPDATE invites
  SET    claimed_by = p_user_id, claimed_at = NOW()
  WHERE  invite_id  = p_invite_id
    AND  status     = 'kp_submitted'
    AND  (claimed_by IS NULL
          OR claimed_at < NOW() - INTERVAL '2 minutes'
          OR claimed_by = p_user_id);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Returns pending invites for groups where p_user_id is a member.
-- Filters to unclaimed or stale-claimed or self-claimed rows only.
CREATE OR REPLACE FUNCTION get_pending_invites_for_member(p_user_id text)
RETURNS TABLE (invite_id text, group_id text, kp_hex text) LANGUAGE sql STABLE AS $$
  SELECT i.invite_id, i.group_id, i.kp_hex
  FROM invites i
  JOIN group_members gm ON gm.group_id = i.group_id AND gm.user_id = p_user_id
  WHERE i.status = 'kp_submitted'
    AND (i.claimed_by IS NULL
         OR i.claimed_at < NOW() - INTERVAL '2 minutes'
         OR i.claimed_by = p_user_id)
    AND i.expires_at > NOW();
$$;
