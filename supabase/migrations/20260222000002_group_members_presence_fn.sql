
CREATE OR REPLACE FUNCTION get_group_members_with_presence(p_group_id text)
RETURNS TABLE (
  user_id    text,
  avatar_url text,
  last_seen  timestamptz,
  is_online  boolean
) AS $$
  SELECT
    u.user_id,
    u.avatar_url,
    u.last_seen,
    (u.last_seen IS NOT NULL AND u.last_seen > NOW() - INTERVAL '2 minutes') AS is_online
  FROM group_members gm
  JOIN users u ON gm.user_id = u.user_id
  WHERE gm.group_id = p_group_id;
$$ LANGUAGE sql STABLE;

-- Force PostgREST schema cache reload so last_seen becomes visible
-- for any other queries that still use the table API
SELECT pg_notify('pgrst', 'reload schema');