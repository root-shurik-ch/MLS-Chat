-- Add encrypted WASM state column to users table.
-- Stores the full MLS WASM state (group secrets, epoch keys, signer) encrypted
-- with a key derived from the user's passkey PRF output via HKDF-SHA256.
-- This enables cross-device restore: any device with the same passkey can
-- decrypt and import the state, making message history available everywhere.
ALTER TABLE users ADD COLUMN IF NOT EXISTS wasm_state_enc TEXT;
