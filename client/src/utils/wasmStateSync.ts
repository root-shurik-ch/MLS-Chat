// Helpers for persisting MLS WASM state locally (IndexedDB) and remotely (server).
// The remote copy is AES-256-GCM encrypted with a key derived from the passkey PRF
// so the server never sees plaintext state.

import { KeyManager } from './keyManager';
import { encryptString } from './crypto';
import { saveWasmState } from './mlsGroupStorage';

/**
 * Save WASM state to IndexedDB and fire-and-forget upload the encrypted copy
 * to the sync_state Edge Function so other devices can restore it.
 */
export async function saveAndSyncWasmState(
  userId: string,
  deviceId: string,
  stateJson: string,
): Promise<void> {
  // Local save is always synchronous and must not fail silently.
  await saveWasmState(userId, stateJson);

  // Remote upload is best-effort — never block the caller on network I/O.
  uploadWasmStateToServer(userId, deviceId, stateJson).catch(
    e => console.warn('WASM state remote sync failed:', e),
  );
}

async function uploadWasmStateToServer(
  userId: string,
  deviceId: string,
  stateJson: string,
): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return;

  const km = new KeyManager();
  await km.init();
  const kWasm = await km.getKWasmState(userId);
  if (!kWasm) return; // kWasm not yet derived (e.g. "continue session" path without passkey)

  const enc = await encryptString(stateJson, kWasm, userId);
  await fetch(`${supabaseUrl}/functions/v1/sync_state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, device_id: deviceId, wasm_state_enc: enc }),
  });
}
