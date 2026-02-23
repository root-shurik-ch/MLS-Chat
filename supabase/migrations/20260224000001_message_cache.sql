-- Migration: encrypted message cache for cross-device history recovery
--
-- Stores AES-256-GCM encrypted plaintext per (group_id, server_seq).
-- The server never sees plaintext — key (kMsgCache) is HKDF-derived from
-- the passkey PRF on the client and never transmitted to the server.
-- Access control is enforced by the edge function (group membership check).

CREATE TABLE IF NOT EXISTS public.message_cache (
  group_id      TEXT    NOT NULL,
  server_seq    BIGINT  NOT NULL,
  plaintext_enc TEXT    NOT NULL,  -- AES-256-GCM ciphertext (base64), AAD = "group_id:server_seq"
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, server_seq)
);
